import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RegistrationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActingAdminResolver } from '../actors/acting-admin.resolver';
import { AdminRegistrationListQueryDto } from './dto/admin-registration-list-query.dto';
import {
  DuplicateDetectionInput,
  DuplicateDetectionService,
} from './duplicate-detection.service';
import {
  AdminRegistrationDetail,
  AdminRegistrationSourceRow,
  toAdminRegistrationDetail,
} from './serializers/admin-registration.serializer';

/**
 * T-4 — Admin-only registrations service (FR-9). `list` is the only method
 * this task adds; T-5…T-9 extend this class with detail/approve/reject/
 * dismiss-duplicate — see `design.md` §3's file tree, which schedules this
 * file as `(new)` here and `(edit)` in every later backend task.
 *
 * T-5 — `list` gains `duplicateCandidateCount` per row (FR-11 scenario 1's
 * queue-flag limb, `design.md` §6.5/DD-20). Computed via ONE
 * `DuplicateDetectionService.detectForBatch` call for the whole page — never
 * one detection pass per row.
 *
 * T-6 — `getById` (FR-10 scenarios 1, 2, 3; `design.md` §6.6, §7.3) adds the
 * detail read: full payload, consent record, duplicate candidates and the
 * derived activity trail, via `serializers/admin-registration.serializer.ts`
 * and `serializers/activity-trail.serializer.ts`. Unknown id → `404`
 * (`NotFoundException`) — DD-22: the admin `404` is honest, unlike the
 * public lookup's byte-identical-across-failure-modes one, because an
 * authenticated Admin is entitled to know whether a registration exists.
 * Reuses `toDuplicateDetectionInput` below (already private to this file)
 * against the SAME `DuplicateDetectionService.detectForBatch` call `list`
 * uses — one row, one-element batch, still exactly one `actor.findMany`.
 *
 * T-7 — `dismissDuplicate` (FR-11 scenario 2, `design.md` §5's
 * `dismiss-duplicate` contract row, §4.3). Appends one entry to
 * `duplicateDismissals` — **appends, never overwrites**, so dismissing one
 * candidate cannot suppress the others (DC-31; FR-11's `BUT it must NOT be
 * row-level`). The candidate is validated against the `Actor` table (a real,
 * existing actor — `404` if not), never against `DuplicateDetectionService`:
 * detection stays read-only and is never consulted from this write path
 * (`design.md` §5's honesty note carried into this task's brief). The
 * dismisser's identity is resolved server-side — `sub` from the validated
 * JWT (the controller's `@CurrentUser()`), email from
 * {@link ActingAdminResolver} — never from the request body, and the
 * resolver's `null`-on-failure result is persisted as `null`, never
 * coalesced to `''` (the exact defect T-6 was reworked for — see that
 * task's `execution.md` FAIL Issue 2).
 *
 * Design refs: `design.md` §5 (route contract), §6.1 (module wiring), §6.5,
 * §6.6, §7.3. Requirements: FR-9 scenarios 1, 2, 3, 4; FR-10 scenarios 1, 2,
 * 3; FR-11 scenarios 1, 2; NFR-8, NFR-9.
 */

/** One row of the admin queue list — FR-9 scenario 1's column set plus T-5's `duplicateCandidateCount`, minus `action` (a frontend affordance, not a data field). */
export interface AdminRegistrationListRow {
  id: string;
  reference: string;
  /** The applicant's organisation name — `Registration.payload.traderName`. */
  applicant: string;
  traderType: string;
  region: string;
  submittedAt: Date;
  status: RegistrationStatus;
  /** Open (non-dismissed) duplicate candidates for this registration (FR-11 scenario 1). */
  duplicateCandidateCount: number;
}

/** Paginated admin queue envelope (`design.md` §5: `{ data, page, pageSize, total }`). */
export interface AdminRegistrationList {
  data: AdminRegistrationListRow[];
  page: number;
  pageSize: number;
  total: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
/** NFR-9 — `pageSize` is capped server-side regardless of what the client sends. */
const MAX_PAGE_SIZE = 100;

/**
 * The subset of `RegistrationPayloadDto` this list projects, plus the two
 * fields T-5's duplicate detection reads (`phone`, `gpsLatitude`/
 * `gpsLongitude`) — `Registration.payload` is stored as an opaque `Json`
 * column (no dedicated columns exist — 3a never promoted them out of the
 * blob), so this is a read-time cast of already-validated data, never a
 * second validation pass.
 */
interface QueueRowPayload {
  traderName: string;
  traderType: string;
  region: string;
  phone?: string | null;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
}

/**
 * One entry of `Registration.duplicateDismissals` (`design.md` §4.3): the
 * dismissed candidate's actor id, the dismissing reviewer's identity, and
 * the dismissal instant. This service reads only `actorId` — the rest is
 * T-6's activity-trail concern.
 */
interface DuplicateDismissalEntry {
  actorId?: unknown;
}

/**
 * Minimal shape the list query reads off a `Registration` row — exactly the
 * columns `select` below asks for (T-4 advisory A-25: this is what makes the
 * PII containment a property of the query, not just of this mapper).
 */
interface QueueSourceRow {
  id: string;
  reference: string;
  payload: unknown;
  createdAt: Date;
  status: RegistrationStatus;
  submitterEmail: string;
  duplicateDismissals: Prisma.JsonValue | null;
}

function toAdminRegistrationListRow(
  row: QueueSourceRow,
  duplicateCandidateCount: number,
): AdminRegistrationListRow {
  const payload = row.payload as QueueRowPayload;
  return {
    id: row.id,
    reference: row.reference,
    applicant: payload.traderName,
    traderType: payload.traderType,
    region: payload.region,
    submittedAt: row.createdAt,
    status: row.status,
    duplicateCandidateCount,
  };
}

/**
 * Extract the dismissed actor ids from a `Registration.duplicateDismissals`
 * column value. Absent (`null`) and an empty array are treated identically
 * (`design.md` §4.3); any entry missing a string `actorId` is skipped rather
 * than throwing — this is a read path over data this task does not write.
 */
function extractDismissedActorIds(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) return [];
  return (value as DuplicateDismissalEntry[])
    .map((entry) => entry?.actorId)
    .filter((actorId): actorId is string => typeof actorId === 'string');
}

/** Build one registration row's `DuplicateDetectionService` comparison input. */
function toDuplicateDetectionInput(row: QueueSourceRow): DuplicateDetectionInput {
  const payload = row.payload as QueueRowPayload;
  return {
    registrationId: row.id,
    phone: payload.phone ?? null,
    email: row.submitterEmail,
    traderName: payload.traderName,
    gpsLatitude: payload.gpsLatitude ?? null,
    gpsLongitude: payload.gpsLongitude ?? null,
    dismissedActorIds: extractDismissedActorIds(row.duplicateDismissals),
  };
}

/** One entry this task appends to `Registration.duplicateDismissals` (`design.md` §4.3). */
interface DuplicateDismissalEntryWrite {
  actorId: string;
  dismissedBySub: string;
  /** `null` when {@link ActingAdminResolver} could not resolve the reviewer's email — never `''`. */
  dismissedByEmail: string | null;
  /** `new Date().toISOString()` — always `Z`-suffixed, never an offset-bearing instant (carried from T-6's execution.md A-37: the activity trail reads this raw and sorts it with `localeCompare`). */
  dismissedAt: string;
}

/** `POST /admin/registrations/:id/dismiss-duplicate`'s response envelope (`design.md` §5: `{ registration }`). */
export interface DismissDuplicateResult {
  registration: {
    id: string;
    reference: string;
    status: RegistrationStatus;
  };
}

@Injectable()
export class AdminRegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly duplicateDetection: DuplicateDetectionService,
    private readonly actingAdminResolver: ActingAdminResolver,
  ) {}

  /**
   * `GET /admin/registrations` — paginated, filtered, sorted queue (FR-9
   * scenarios 1, 2, 4).
   *
   * `status`/`region`/`traderType`/`q` compose as AND, mirroring
   * `ActorsAdminService.adminList`'s convention (`../actors/actors-admin.
   * service.ts`) — but unlike that method's flat `where` spread,
   * `region`/`traderType`/`q` all target the SAME `payload` JSON column
   * under different paths, so they cannot each occupy the top-level
   * `payload` key without overwriting one another; they are composed as an
   * explicit `AND` array of single-path filters instead. `status` is the
   * one real column and stays a plain top-level key.
   *
   * Default sort is oldest-first (`createdAt` ascending) — FR-9's "Sorted
   * oldest-first by default" scenario, so the longest-waiting applicant is
   * reviewed first; `sort: 'newest'` reverses it.
   *
   * NFR-9: the query uses `@@index([status, createdAt])`'s access pattern
   * (a `status` equality plus a `createdAt` order) whenever `status` is
   * supplied — this method asserts the `where`/`orderBy` SHAPE only; index
   * *usage* needs a real MySQL `EXPLAIN` and is declared unprovable here
   * (DC-25, `design.md` §14).
   *
   * Prisma's JSON `path` filter grammar is provider-specific: on the MySQL
   * connector (this project) `path` is a single `$.`-rooted MySQL JSON path
   * expression string (e.g. `'$.region'`), passed verbatim into
   * `JSON_EXTRACT`; the PostgreSQL connector instead takes an array of key
   * segments (e.g. `['region']`). Do not copy one connector's shape into the
   * other's filter.
   *
   * T-5 — `select` is explicit (T-4 advisory A-25): this method fetches
   * whole `Registration` rows only if asked to, so the PII containment
   * `admin-registrations.e2e.spec.ts`/`pii-boundary.spec.ts` prove elsewhere
   * becomes a property of THIS query, not just of `toAdminRegistrationListRow`
   * discarding fields after the fact. `submitterEmail` and
   * `duplicateDismissals` are fetched because detection genuinely needs
   * them (email-match attribute; dismissal filtering) — neither reaches the
   * response; only the derived `duplicateCandidateCount` does.
   *
   * `duplicateCandidateCount` is computed with exactly ONE
   * `DuplicateDetectionService.detectForBatch` call for the whole page
   * (DD-20) — never one detection pass per row.
   */
  async list(q: AdminRegistrationListQueryDto): Promise<AdminRegistrationList> {
    const page = q.page ?? DEFAULT_PAGE;
    const pageSize = Math.min(q.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const conditions: Prisma.RegistrationWhereInput[] = [];
    if (q.status) {
      conditions.push({ status: q.status });
    }
    if (q.region) {
      conditions.push({ payload: { path: '$.region', equals: q.region } });
    }
    if (q.traderType) {
      conditions.push({ payload: { path: '$.traderType', equals: q.traderType } });
    }
    if (q.q) {
      conditions.push({ payload: { path: '$.traderName', string_contains: q.q } });
    }

    const where: Prisma.RegistrationWhereInput =
      conditions.length > 0 ? { AND: conditions } : {};
    const orderBy: Prisma.RegistrationOrderByWithRelationInput = {
      createdAt: q.sort === 'newest' ? 'desc' : 'asc',
    };

    const [rows, total] = await Promise.all([
      this.prisma.registration.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          reference: true,
          payload: true,
          createdAt: true,
          status: true,
          submitterEmail: true,
          duplicateDismissals: true,
        },
      }),
      this.prisma.registration.count({ where }),
    ]);

    const sourceRows = rows as QueueSourceRow[];
    const duplicateCounts = await this.duplicateDetection.detectForBatch(
      sourceRows.map((row) => toDuplicateDetectionInput(row)),
    );

    return {
      data: sourceRows.map((row) =>
        toAdminRegistrationListRow(row, duplicateCounts.get(row.id)?.length ?? 0),
      ),
      page,
      pageSize,
      total,
    };
  }

  /**
   * `GET /admin/registrations/:id` — full detail read (FR-10 scenarios 1,
   * 2, 3). Unknown id → `404` (DD-22 — honest here, unlike the public
   * lookup's uniform failure shape, because the caller is an authenticated
   * Admin entitled to know whether the row exists at all).
   *
   * `select` is explicit, same discipline as `list` (T-4 advisory A-25):
   * exactly the columns the serializer and the activity trail read, no
   * whole-row fetch.
   *
   * Duplicate candidates come from the SAME `DuplicateDetectionService`
   * this class already injects for `list` — one row, a one-element batch,
   * still exactly one `actor.findMany` (DD-20).
   */
  async getById(id: string): Promise<AdminRegistrationDetail> {
    const row = await this.prisma.registration.findUnique({
      where: { id },
      select: {
        id: true,
        reference: true,
        payload: true,
        createdAt: true,
        status: true,
        submitterEmail: true,
        duplicateDismissals: true,
        emailVerifiedAt: true,
        consentAcceptedAt: true,
        consentPolicyVersion: true,
        reviewedAt: true,
        reviewedBySub: true,
        reviewedByEmail: true,
      },
    });

    if (!row) {
      throw new NotFoundException(`Registration ${id} not found`);
    }

    const sourceRow = row as AdminRegistrationSourceRow;
    const candidatesMap = await this.duplicateDetection.detectForBatch([
      toDuplicateDetectionInput(sourceRow),
    ]);

    // Keyed by `toDuplicateDetectionInput(sourceRow).registrationId`, i.e.
    // `sourceRow.id` — the STORED id — not the request-supplied `id` path
    // parameter. MySQL's default collation is case-insensitive, so
    // `findUnique({ where: { id } })` can resolve a row whose stored id
    // differs in case from the URL; looking the candidates up by the
    // request `id` would then silently miss and fall back to `[]` on the
    // one screen whose job is to warn before an irreversible publication.
    return toAdminRegistrationDetail(sourceRow, candidatesMap.get(sourceRow.id) ?? []);
  }

  /**
   * `POST /admin/registrations/:id/dismiss-duplicate` — record that
   * `candidateActorId` is not a duplicate for this registration (FR-11
   * scenario 2).
   *
   * **Appends, never overwrites** (DC-31): the existing
   * `duplicateDismissals` array (or `[]` if the column is `null`) is read,
   * the new entry is pushed onto it, and the WHOLE array is written back —
   * so dismissing one candidate can never suppress a previously-dismissed
   * one, which is what a row-level write (e.g. `data: {
   * duplicateDismissals: [newEntry] }`) would do.
   *
   * **The candidate is validated against the `Actor` table, not against
   * `DuplicateDetectionService`.** `design.md` §5's contract row makes
   * `404` cover "unknown registration OR unknown candidate" — this method
   * satisfies the second limb by confirming `candidateActorId` names a real,
   * existing `Actor` row. It deliberately does NOT call
   * `this.duplicateDetection` to re-derive the current candidate set: this
   * task's brief states plainly that detection "must remain read-only and
   * must not be consulted from any write path" (FR-11 — detection warns, it
   * never decides), so this write path never asks detection anything.
   *
   * **The dismisser's identity is resolved server-side, never accepted from
   * the request.** `actingSub` is the controller's `@CurrentUser().sub` —
   * the validated JWT subject, always a real string. The email is resolved
   * HERE via {@link ActingAdminResolver.resolve}, which returns `null` on
   * any failure (unknown user, missing email attribute, Cognito error);
   * that `null` is persisted as `null`, never coalesced to `''` — coalescing
   * it was T-6's FAIL Issue 2 (`execution.md`), and this column feeds the
   * same activity trail that defect was found in.
   *
   * `dismissedAt` is `new Date().toISOString()` — always `Z`-suffixed.
   * `ActivityTrailEvent`'s `DUPLICATE_DISMISSED` entry (`serializers/
   * activity-trail.serializer.ts`) reads this value back RAW from the JSON
   * column and sorts the whole trail with `localeCompare`; an
   * offset-bearing instant (`…+03:00`) would both mis-order that event and
   * diverge in wire format from the other four trail events, which are all
   * `.toISOString()` (carried forward from T-6's `execution.md` A-37).
   *
   * Returns `{ registration: { id, reference, status } }` — a minimal
   * confirmation, not the full detail projection: building the full detail
   * (`toAdminRegistrationDetail`) requires the SAME `DuplicateDetectionService`
   * call this method deliberately avoids on the write path. The updated
   * candidate list and the new `DUPLICATE_DISMISSED` trail entry are visible
   * on the next `GET /admin/registrations/:id` — the read path, where
   * consulting detection is the intended, documented behaviour.
   */
  async dismissDuplicate(
    id: string,
    candidateActorId: string,
    actingSub: string,
  ): Promise<DismissDuplicateResult> {
    const row = await this.prisma.registration.findUnique({
      where: { id },
      select: { id: true, reference: true, status: true, duplicateDismissals: true },
    });

    if (!row) {
      throw new NotFoundException(`Registration ${id} not found`);
    }

    const candidateActor = await this.prisma.actor.findUnique({
      where: { id: candidateActorId },
      select: { id: true },
    });

    if (!candidateActor) {
      throw new NotFoundException(
        `Duplicate candidate ${candidateActorId} not found for registration ${id}`,
      );
    }

    const dismissedByEmail = await this.actingAdminResolver.resolve(actingSub);

    const existingDismissals: unknown[] = Array.isArray(row.duplicateDismissals)
      ? row.duplicateDismissals
      : [];
    const newEntry: DuplicateDismissalEntryWrite = {
      actorId: candidateActorId,
      dismissedBySub: actingSub,
      dismissedByEmail,
      dismissedAt: new Date().toISOString(),
    };

    const updated = await this.prisma.registration.update({
      where: { id },
      data: { duplicateDismissals: [...existingDismissals, newEntry] as Prisma.InputJsonValue },
      select: { id: true, reference: true, status: true },
    });

    return {
      registration: { id: updated.id, reference: updated.reference, status: updated.status },
    };
  }
}
