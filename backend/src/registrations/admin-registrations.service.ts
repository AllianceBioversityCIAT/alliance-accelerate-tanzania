import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ConsentMethod,
  ConsentStatus,
  Prisma,
  RegistrationSource,
  RegistrationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActingAdminResolver } from '../actors/acting-admin.resolver';
import {
  ActingAdmin,
  ActorAuditService,
} from '../actors/actor-audit.service';
import { AdminActor, toAdminActor } from '../actors/admin-actor.serializer';
import { isConsentProvenanceSatisfied } from '../common/consent-provenance.policy';
import { FieldErrorDetail } from '../common/validation-pipe';
import { MailService } from '../mail/mail.service';
import { AdminRegistrationListQueryDto } from './dto/admin-registration-list-query.dto';
import { RegistrationApproveDto } from './dto/registration-approve.dto';
import { RegistrationRejectDto } from './dto/registration-reject.dto';
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
 * T-8 — `approve` (FR-12 all six scenarios, FR-14 scenario 1; `design.md`
 * §6.2, §6.3, DD-17, DD-18, DD-23). The system's only path from private
 * submitted data to public record — see the method's own doc for the
 * eight-step transaction order and its honesty notes on step 4 (drift
 * protection, not a gate) and on atomicity (structurally asserted, never
 * rollback-proven — DC-24).
 *
 * **A-33 — the self-match false positive (T-5's `list`/T-6's `getById`
 * shared fix, landed here because both funnel through
 * {@link toDuplicateDetectionInput}).** Neither method previously selected
 * `publishedActorId`, and `list()` applies no default `status` filter — so
 * once `approve` sets it, an APPROVED row's detection input would carry
 * every attribute of the actor it itself just created, reporting
 * `duplicateCandidateCount >= 1` for a registration flagged as a duplicate
 * of its own output. Both `select`s below now fetch it, and
 * `DuplicateDetectionService.matchOne` excludes it exactly like a
 * dismissed candidate.
 *
 * Design refs: `design.md` §5 (route contract), §6.1 (module wiring), §6.2,
 * §6.3, §6.5, §6.6, §6.7, §7.3, DD-17, DD-18, DD-23. Requirements: FR-9
 * scenarios 1, 2, 3, 4; FR-10 scenarios 1, 2, 3; FR-11 scenarios 1, 2;
 * FR-12 scenarios 1-6; FR-14 scenario 1; NFR-2, NFR-3, NFR-8, NFR-9.
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
  /**
   * Open (non-dismissed) duplicate candidates for this registration (FR-11
   * scenario 1). **`min(open, 5)`** — capped at
   * `MAX_CANDIDATES_PER_REGISTRATION` (`duplicate-detection.service.ts`), the
   * SAME cap the detail screen's candidate list saturates at. A saturated
   * row's true open-candidate count may be higher than this value; the
   * frontend renders that case as "5+", never a bare "5" (R6 remediation —
   * `frontend/lib/content/duplicate-candidates.ts`'s `candidateCountLabel`,
   * shared by `RegistrationsTable.tsx`'s queue flag and
   * `DuplicateWarningCard.tsx`'s heading so the two surfaces cannot report
   * different numbers for the same registration).
   */
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
 * R4 remediation — bounded retry count for `dismissDuplicate`'s
 * compare-and-set write, mirroring {@link MAX_REFERENCE_ALLOCATION_ATTEMPTS}'s
 * precedent (`registration-reference.util.ts`): a concurrent dismissal is
 * expected to be rare and to resolve within one or two retries, never an
 * unbounded loop.
 */
const MAX_DISMISS_DUPLICATE_ATTEMPTS = 3;

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
  /** A-33 — see the class doc above. Optional: `getById`'s source type declares it optional too, so a fixture built before this field existed still satisfies this interface. */
  publishedActorId?: string | null;
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

/**
 * A-28 half 2 — escape MySQL LIKE metacharacters (`%`, `_`) — and the
 * escape character itself (`\`) — so `list()`'s `q` filter matches its
 * value LITERALLY. Prisma's JSON `string_contains` path filter compiles to
 * a MySQL `LIKE '%<value>%'` expression under the hood and does NOT escape
 * `%`/`_` in the value itself; without this, `?q=%` matches every row (any
 * string contains the empty string bounded by two wildcards) and `?q=50%`
 * matches anything containing "50", not the literal text "50%" — verified
 * against a real local MySQL instance (this task's execution notes).
 * MySQL's default LIKE `ESCAPE` character is `\`, so prefixing each of
 * `\`, `%`, `_` with one is sufficient — no session/connector configuration
 * needed. Order matters: backslash must be escaped FIRST, or the
 * backslashes this function itself inserts for `%`/`_` would be re-escaped
 * on a second pass.
 */
function escapeLikeMetacharacters(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
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
    publishedActorId: row.publishedActorId ?? null,
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

/** Crop include reused so the refetched actor can be projected via `toAdminActor` (mirrors `ActorsAdminService`'s `CROPS_INCLUDE`). */
const CROPS_INCLUDE = {
  crops: { include: { crop: true } },
} satisfies Prisma.ActorInclude;

/**
 * T-8 — the exact phrase `RegistrationApproveDto.acknowledgement` must
 * match (FR-12's "typed acknowledgement gate"; `tasks.md` T-14 pins this
 * SAME literal as `AcknowledgeDialog`'s `acknowledgementText` prop for the
 * client-side dialog this brief does not build). Server-side re-validation
 * is the actual gate (FR-12 scenario 3's "must NOT be client-only") — a
 * crafted request that omits or misspells this exact string is rejected
 * here regardless of what any client sends.
 */
export const APPROVAL_ACKNOWLEDGEMENT_TEXT = 'I confirm consent is on file';

/** DD-23 — `REG-<year>-<seq>` → `SR-<year>-<seq>`. Pure, no I/O (§6.2 step 2). */
const REGISTRATION_REFERENCE_PREFIX = 'REG-';
const TRADER_ID_PREFIX = 'SR-';

/**
 * DD-23 — derive a self-registered actor's `traderId` from its originating
 * registration's `reference`. Inherits `Registration.reference`'s own
 * `@unique` + atomic-allocation race-safety (`registration-reference.util.ts`)
 * with no second counter — unique AMONG SELF-REGISTERED ACTORS, not
 * table-wide by construction (`ActorCreateDto` accepts any client-supplied
 * `traderId`), which is why {@link AdminRegistrationsService.approve} must
 * still catch a `P2002` on the resulting `tx.actor.create` call.
 */
export function deriveTraderIdFromReference(reference: string): string {
  if (!reference.startsWith(REGISTRATION_REFERENCE_PREFIX)) {
    throw new Error(
      `Cannot derive traderId: reference "${reference}" does not start with "${REGISTRATION_REFERENCE_PREFIX}"`,
    );
  }
  return TRADER_ID_PREFIX + reference.slice(REGISTRATION_REFERENCE_PREFIX.length);
}

/**
 * The subset of `RegistrationPayloadDto` the approval projection reads
 * (`design.md` §6.3/DD-18). Mirrors `RawRegistrationPayload` in
 * `serializers/admin-registration.serializer.ts` — not imported from there
 * because that type is file-private; duplicated here rather than exported
 * across a module boundary for a single read-only shape both files already
 * derive independently from the SAME source of truth, `RegistrationPayloadDto`.
 *
 * Do not replace this with `RawRegistrationPayload`: its
 * `contactPerson`/`otherCrops` members are exactly what would make the
 * DD-18 adjacency mistake COMPILE. This type's omission of them is what
 * makes it a compile error instead. `RegistrationApprovalPayload`
 * deliberately omits them so the realistic one-liner
 * `position: payload.position ?? payload.contactPerson` cannot compile —
 * that is a load-bearing safety property of this type's shape, not an
 * oversight to "fix" by unifying the two interfaces.
 */
interface RegistrationApprovalPayload {
  traderName: string;
  traderType: string;
  position?: string | null;
  district?: string | null;
  marketLocation?: string | null;
  sex?: string | null;
  region: string;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  crops: string[];
  capacityTons: number;
  phone: string;
}

/** `POST /admin/registrations/:id/approve`'s response envelope (`design.md` §5: `{ registration, actor }`). */
export interface RegistrationApproveResult {
  registration: {
    id: string;
    reference: string;
    status: RegistrationStatus;
    publishedActorId: string | null;
  };
  actor: AdminActor;
}

/**
 * `POST /admin/registrations/:id/reject`'s response envelope (`design.md`
 * §5: `{ registration }`) — the same minimal `{ id, reference, status }`
 * shape T-7's `DismissDuplicateResult` already established for a write path
 * with no richer projection to return. `rejectionReason`/`reviewNote` are
 * NOT echoed back here: this is the ADMIN write response, not the public
 * lookup, so there is no DC-32 concern either way — they are simply not
 * needed by this response's one caller (the confirmation the reject action
 * just succeeded).
 */
export interface RegistrationRejectResult {
  registration: {
    id: string;
    reference: string;
    status: RegistrationStatus;
  };
}

/**
 * The subset of a `Registration` row {@link AdminRegistrationsService.reject}
 * reads back inside its transaction — exactly what
 * {@link RegistrationRejectResult}, `dispatchRejectionEmail`, and
 * `ActorAuditService.logRegistrationReject` each need, no whole-row fetch
 * (T-4 advisory A-25's discipline, carried into this task).
 */
interface RejectedRegistrationRow {
  id: string;
  reference: string;
  status: RegistrationStatus;
  payload: Prisma.JsonValue;
  rejectionReason: string | null;
  submitterEmail: string;
}

@Injectable()
export class AdminRegistrationsService {
  private readonly logger = new Logger(AdminRegistrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly duplicateDetection: DuplicateDetectionService,
    private readonly actingAdminResolver: ActingAdminResolver,
    private readonly actorAuditService: ActorAuditService,
    private readonly mailService: MailService,
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
      // A-28 half 2 — escaped at this Prisma boundary, not in the DTO: the
      // DTO validates (length), it does not transform for storage
      // semantics. See escapeLikeMetacharacters's doc above.
      conditions.push({
        payload: { path: '$.traderName', string_contains: escapeLikeMetacharacters(q.q) },
      });
    }

    const where: Prisma.RegistrationWhereInput =
      conditions.length > 0 ? { AND: conditions } : {};
    const orderBy: Prisma.RegistrationOrderByWithRelationInput = {
      createdAt: q.sort === 'newest' ? 'desc' : 'asc',
    };

    // A-28 half 1 — `page` carries no `@Max` by design (FR-9 scenario 4: a
    // page beyond the result set is an EMPTY page, not an error). Verified
    // against a real local MySQL instance that `?page=99999999` already
    // returns a clean empty page — the ticket's "likely 500" was an
    // unverified guess and was WRONG at that magnitude. But at
    // sufficiently extreme magnitudes (an unclamped `skip` beyond a 64-bit
    // signed integer, ~9.2e18) Prisma's query builder throws
    // `PrismaClientValidationError` client-side before any query reaches
    // MySQL — a genuine, if rarely reachable, 500. `total` is known first
    // (sequencing this ahead of `findMany`, no longer run concurrently
    // with it) so `skip` can be clamped to it: a page beyond the result
    // set can now NEVER produce a `skip` larger than the table's own real,
    // JS-safe row count, closing the unbounded-input class of defect at
    // any magnitude without an arbitrary numeric cap on `page` itself.
    const total = await this.prisma.registration.count({ where });
    const skip = Math.min((page - 1) * pageSize, total);

    const rows = await this.prisma.registration.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      select: {
        id: true,
        reference: true,
        payload: true,
        createdAt: true,
        status: true,
        submitterEmail: true,
        duplicateDismissals: true,
        // A-33 — see the class doc above: without this, an APPROVED row
        // matches the actor it itself created on every detection
        // attribute.
        publishedActorId: true,
      },
    });

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
        // A-33 — see the class doc above: without this, an APPROVED
        // registration's own detail view flags itself as its own duplicate.
        publishedActorId: true,
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
   * **Appends, never row-level-overwrites** (DC-31): a successful write
   * pushes one new entry onto the array it read (or `[]` if the column was
   * `null`) — never replaces the whole column with just the new entry,
   * which is what `data: { duplicateDismissals: [newEntry] }` would do. A
   * row-level write of that shape would make dismissing candidate B erase
   * candidate A's earlier entry outright; this method never performs one.
   *
   * **Corrected (post-validation remediation R4).** The paragraph above
   * describes what ONE write does to the array it was given — it does not,
   * by itself, make two CONCURRENT dismissals of DIFFERENT candidates safe.
   * The original version of this method read the row, built the merged
   * array in application memory, and wrote the whole array back with a
   * plain `update` carrying no predicate on the value it had read: a
   * textbook read-modify-write race. Two overlapping dismissals can both
   * read the SAME base array; the second write to land then overwrites the
   * first, and the first candidate's entry — though it WAS correctly
   * appended in memory by its own request — is never persisted. Appending
   * in memory does not prevent the write itself from being lost.
   *
   * The write is now a bounded-retry **conditional update** — the same
   * compare-and-set discipline `approve` (step 1, `:updateMany({ where: {
   * id, status: PENDING_REVIEW } })`) and `reject` (identical construction)
   * already use for the adjudication columns, brought here for
   * `duplicateDismissals`: each attempt appends in memory exactly as
   * before, then writes via `updateMany({ where: { id, duplicateDismissals:
   * <the exact value this attempt read> }, data: { duplicateDismissals:
   * <appended> } })`. `count === 1` means no concurrent writer moved the
   * column between this attempt's read and its write, so the append landed
   * cleanly. `count === 0` means a concurrent write landed first — the
   * column changed under us — and the attempt retries with a FRESH read,
   * up to {@link MAX_DISMISS_DUPLICATE_ATTEMPTS} times, so a losing attempt
   * re-appends onto the winner's array rather than silently dropping its
   * own entry. Exhausting the retry budget raises a `409`, never a silent
   * loss and never an unbounded loop.
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
   * `dismissedAt` is `new Date().toISOString()` — always `Z`-suffixed, taken
   * fresh on EACH attempt (not once before the retry loop), so a dismissal
   * that only succeeds on a retry is timestamped at the moment it actually
   * committed, not the moment it was first attempted. `ActivityTrailEvent`'s
   * `DUPLICATE_DISMISSED` entry (`serializers/activity-trail.serializer.ts`)
   * reads this value back RAW from the JSON column and sorts the whole
   * trail with `localeCompare`; an offset-bearing instant (`…+03:00`) would
   * both mis-order that event and diverge in wire format from the other
   * four trail events, which are all `.toISOString()` (carried forward from
   * T-6's `execution.md` A-37).
   *
   * Returns `{ registration: { id, reference, status } }` — a minimal
   * confirmation, not the full detail projection: building the full detail
   * (`toAdminRegistrationDetail`) requires the SAME `DuplicateDetectionService`
   * call this method deliberately avoids on the write path. **Sourced from
   * the read that won the compare-and-set, not from the write itself** —
   * `updateMany` returns only `{ count }`, never row data, and `id`/
   * `reference`/`status` cannot change across a dismissal in any case. The
   * updated candidate list and the new `DUPLICATE_DISMISSED` trail entry are
   * visible on the next `GET /admin/registrations/:id` — the read path,
   * where consulting detection is the intended, documented behaviour.
   */
  async dismissDuplicate(
    id: string,
    candidateActorId: string,
    actingSub: string,
  ): Promise<DismissDuplicateResult> {
    // The FIRST read — establishes the 404 (unknown registration) before
    // anything else runs, exactly like the pre-fix version. Reassigned
    // below on a retry (never re-declared), so the loop always appends onto
    // the freshest snapshot of the column.
    let row = await this.prisma.registration.findUnique({
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

    for (let attempt = 1; attempt <= MAX_DISMISS_DUPLICATE_ATTEMPTS; attempt += 1) {
      if (attempt > 1) {
        // A previous attempt's compare-and-set predicate matched zero rows
        // — a concurrent dismissal committed between that attempt's read
        // and its write. Re-read before retrying so this attempt appends
        // onto the CURRENT array, never the stale one that just lost.
        const refreshed = await this.prisma.registration.findUnique({
          where: { id },
          select: { id: true, reference: true, status: true, duplicateDismissals: true },
        });
        if (!refreshed) {
          throw new NotFoundException(`Registration ${id} not found`);
        }
        row = refreshed;
      }

      const existingDismissals: unknown[] = Array.isArray(row.duplicateDismissals)
        ? row.duplicateDismissals
        : [];
      const newEntry: DuplicateDismissalEntryWrite = {
        actorId: candidateActorId,
        dismissedBySub: actingSub,
        dismissedByEmail,
        dismissedAt: new Date().toISOString(),
      };

      // The compare-and-set predicate: write only if the column still holds
      // EXACTLY the value this attempt just read. A stored SQL NULL is
      // `Prisma.DbNull` here, never `Prisma.JsonNull` (the JSON literal
      // `null`) — this column is only ever a real SQL NULL or a real array,
      // so DbNull is the correct predicate for the "never dismissed yet"
      // case.
      const updated = await this.prisma.registration.updateMany({
        where: {
          id,
          duplicateDismissals: {
            equals:
              row.duplicateDismissals === null
                ? Prisma.DbNull
                : (row.duplicateDismissals as Prisma.InputJsonValue),
          },
        },
        data: {
          duplicateDismissals: [...existingDismissals, newEntry] as Prisma.InputJsonValue,
        },
      });

      if (updated.count === 1) {
        return {
          registration: { id: row.id, reference: row.reference, status: row.status },
        };
      }
      // count === 0 — retry with a fresh read (loop continues).
    }

    // Retry budget exhausted — a `409`, matching the module's other
    // "recoverable conflict" responses (design.md §5), never a silent loss
    // of this dismissal and never an unbounded loop.
    throw new ConflictException(
      `Registration ${id} duplicateDismissals kept changing concurrently after ` +
        `${MAX_DISMISS_DUPLICATE_ATTEMPTS} attempts`,
    );
  }

  /**
   * `POST /admin/registrations/:id/approve` — the transaction (FR-12 all six
   * scenarios, FR-14 scenario 1; `design.md` §6.2, §6.3, DD-17, DD-18,
   * DD-23). The registry's ONLY path from private submitted data to public
   * record — there is no un-publish.
   *
   * **Server-side re-validation of the typed acknowledgement gate**
   * (FR-12 scenario 3's "must NOT be client-only") happens FIRST, before any
   * I/O: a request whose `acknowledgement` does not match
   * {@link APPROVAL_ACKNOWLEDGEMENT_TEXT} EXACTLY never reaches the
   * transaction.
   *
   * **The eight-step order, §6.2, and why each step sits where it does:**
   * 1. **Conditional status update** — `tx.registration.updateMany({ where:
   *    { id, status: PENDING_REVIEW }, ... })`. This IS the double-approval
   *    refusal, by construction (DD-17): a read-then-check races, and the
   *    race publishes two actors from one act of consent. `count === 0`
   *    means either the id does not exist or it is not `PENDING_REVIEW`; a
   *    follow-up `findUnique` (still inside this `tx`) distinguishes a
   *    genuine `404` from the `409` "already adjudicated" — DD-22: an
   *    authenticated Admin is entitled to know whether a registration
   *    exists at all.
   * 2. **Derive `traderId`** ({@link deriveTraderIdFromReference}, DD-23) —
   *    pure, no I/O, placed before any write that could fail on it.
   * 3. **Project the publishable subset** (§6.3/DD-18) — an EXPLICIT
   *    LITERAL PICK, never a spread, never a loop over payload keys.
   *    `contactPerson` and `otherCrops` go nowhere (no `Actor` column
   *    exists for either); `technicalSupport`/`gpsAltitude`/`gpsAccuracy`
   *    are left `null` (the payload has no source for them — inventing a
   *    value would publish something no applicant supplied); `Actor.email`
   *    comes from `Registration.submitterEmail` (the OTP-verified address),
   *    never from the payload, which carries no email field at all.
   *    **The trap this guards against is adjacency, not similarity:**
   *    `contactPerson` and `position` are neighbouring `RegistrationPayloadDto`
   *    fields, so "fall back to `contactPerson` when `position` is absent"
   *    is a one-line, plausible-looking change that publishes a named
   *    natural person to the public directory. `position` is read ONLY
   *    from `payload.position`, never from `payload.contactPerson`.
   * 4. **`isConsentProvenanceSatisfied` — drift protection, NOT a gate.**
   *    With all four provenance values below set to satisfying constants
   *    and `consentObtainedAt` sourced from a non-nullable column, this call
   *    CANNOT return `false` on this path (§6.2's honesty note, inherited
   *    from 3a A22·B31). It is retained so this path inherits any future
   *    tightening of chunk 1's shared rule. **The real gate is the by-value
   *    assertion this method's tests run on the created actor's four
   *    provenance fields (DC-6)** — this call is not that assertion and
   *    must never be reported as one.
   * 5. **`tx.actor.create`** — the first write that can collide: a
   *    `P2002` on `traderId` is caught immediately around this ONE call and
   *    turned into a `409` NAMING the colliding key, never left to surface
   *    as an unhandled `500` (which would leave the registration
   *    permanently unapprovable with no operator path forward — DD-23's
   *    consequence).
   * 6. **`tx.cropsOnActors.createMany`** — needs the actor id from step 5.
   * 7. **`actorAuditService.logRegistrationApprove(tx, actor, acting,
   *    reference)`** — inside the SAME `tx` (`backend/CLAUDE.md`). DEC-1:
   *    that method additionally sets `acknowledged: true` on the row it
   *    writes — the typed consent-acknowledgement flag, because this call
   *    IS one. **A-8** — `reference` is accepted by that method but
   *    deliberately NOT duplicated into its envelope, on the reasoning that
   *    `actor.consentReference` already carries the identical value; this
   *    method asserts that equality BY VALUE immediately after the create,
   *    before logging, so the discarded parameter stays provably harmless.
   * 8. **Set `publishedActorId`** on the registration — only knowable after
   *    step 5.
   *
   * **Atomicity — structurally asserted, never rollback-proven (DC-24).**
   * Every write above (the conditional update, the diagnostic `findUnique`,
   * the actor create, the crop links, the audit row, the `publishedActorId`
   * set) runs inside this ONE `prisma.$transaction` callback; a throw at
   * any step propagates unswallowed (the `P2002` catch around step 5 is the
   * only `catch` in this method, and it re-throws a `ConflictException`
   * rather than absorbing the failure). What is NOT provable here: that
   * MySQL actually rolls back — every backend suite substitutes an
   * in-memory Prisma mock whose `$transaction` is a pass-through with no
   * real rollback semantics (DC-24). Reported as such, never as "rollback
   * proven".
   *
   * **After commit, never inside it (DD-9):** the approval email. Dispatched
   * via {@link dispatchApprovalEmail} using the `submitterEmail`/`reference`
   * returned FROM the (already-committed) transaction result — never from a
   * variable captured mid-transaction. **`fix/otp-mail-lambda-freeze`
   * (2026-09-03) — AWAITED, not fire-and-forget**, for the same production
   * reason `RegistrationsService.requestVerificationCode` was: Lambda can
   * freeze the execution environment the instant this method's returned
   * promise settles, and a fire-and-forget send in flight at that instant
   * is silently dropped with no outcome line ever logged. Unlike that
   * method, this one carries no timing requirement — an authenticated
   * admin acting on a registration they can already see learns nothing
   * from response latency — so awaiting adds no constant-time floor, only
   * the `await`. The send's own failure is still only logged, by error
   * CLASS NAME only (never the address), and never rethrown: it must not
   * fail this method or suggest anything rolled back (FR-14) — the
   * registration is already adjudicated and, on this path, the actor
   * already published.
   */
  async approve(
    id: string,
    dto: RegistrationApproveDto,
    actingSub: string,
  ): Promise<RegistrationApproveResult> {
    this.assertAcknowledgement(dto.acknowledgement);

    const acting = await this.resolveActing(actingSub);
    const now = new Date();

    const { registration, actor, submitterEmail } = await this.prisma.$transaction(
      async (tx) => {
        // Step 1 (DD-17) — the conditional update IS the double-approval
        // refusal; a read-then-check races.
        const updated = await tx.registration.updateMany({
          where: { id, status: RegistrationStatus.PENDING_REVIEW },
          data: {
            status: RegistrationStatus.APPROVED,
            reviewedBySub: actingSub,
            reviewedByEmail: acting.email,
            reviewedAt: now,
          },
        });

        if (updated.count === 0) {
          // DD-22 — distinguish a genuine 404 from the 409 "already
          // adjudicated" so the two `409` meanings (this one, and step 5's
          // traderId collision) stay separately diagnosable, and an unknown
          // id stays honestly 404 rather than a misleading 409.
          const existing = await tx.registration.findUnique({
            where: { id },
            select: { id: true },
          });
          if (!existing) {
            throw new NotFoundException(`Registration ${id} not found`);
          }
          throw new ConflictException(`Registration ${id} has already been adjudicated`);
        }

        const row = await tx.registration.findUnique({
          where: { id },
          select: {
            reference: true,
            payload: true,
            submitterEmail: true,
            consentAcceptedAt: true,
          },
        });
        if (!row) {
          throw new Error('Approved registration could not be refetched');
        }

        // Step 2 (DD-23) — no I/O.
        const traderId = deriveTraderIdFromReference(row.reference);

        // Step 3 (§6.3/DD-18) — explicit literal pick. See the class-level
        // doc above for the two omitted fields and the three null columns.
        const payload = row.payload as unknown as RegistrationApprovalPayload;
        const actorCreateData: Prisma.ActorCreateInput = {
          traderId,
          traderName: payload.traderName,
          traderType: payload.traderType,
          position: payload.position ?? null,
          district: payload.district ?? null,
          marketLocation: payload.marketLocation ?? null,
          sex: payload.sex ?? null,
          region: payload.region,
          gpsLatitude: payload.gpsLatitude ?? null,
          gpsLongitude: payload.gpsLongitude ?? null,
          capacityTons: payload.capacityTons,
          phone: payload.phone,
          // §6.3 — NOT payload.email: the payload carries no email field at
          // all. This is the OTP-verified submitter address.
          email: row.submitterEmail,
          // §6.3 — the payload has no source for these three; inventing a
          // value would publish something no applicant supplied.
          technicalSupport: null,
          gpsAltitude: null,
          gpsAccuracy: null,
          consentStatus: ConsentStatus.GRANTED,
          registrationSource: RegistrationSource.SELF_REGISTERED,
          consentMethod: ConsentMethod.PORTAL_CHECKBOX,
          consentObtainedAt: row.consentAcceptedAt,
          consentReference: row.reference,
        };

        // Step 4 — drift protection, NOT a gate. See the class-level doc
        // above: this call cannot return false on this path.
        if (
          !isConsentProvenanceSatisfied(null, {
            consentStatus: actorCreateData.consentStatus as ConsentStatus,
            consentMethod: actorCreateData.consentMethod as ConsentMethod,
            consentObtainedAt: actorCreateData.consentObtainedAt as Date,
            consentReference: actorCreateData.consentReference as string,
          })
        ) {
          throw new BadRequestException('Consent provenance check failed for this approval');
        }

        // Step 5 — the first write that can collide.
        let created;
        try {
          created = await tx.actor.create({ data: actorCreateData });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            throw new ConflictException(`An actor with traderId ${traderId} already exists`);
          }
          throw err;
        }

        // Step 6
        if (payload.crops.length > 0) {
          const cropLinks = await this.buildCropLinks(tx, created.id, payload.crops);
          await tx.cropsOnActors.createMany({ data: cropLinks });
        }

        const full = await tx.actor.findUnique({
          where: { id: created.id },
          include: CROPS_INCLUDE,
        });
        if (!full) {
          throw new Error('Created actor could not be refetched');
        }
        const adminActor = toAdminActor(full);

        // A-8 — keeps a future divergence between `reference` and
        // `adminActor.consentReference` LOUD rather than silent. The two
        // are equal today because step 3 literally sets `consentReference:
        // row.reference` and `adminActor` round-trips unchanged through
        // `tx.actor.create → findUnique → toAdminActor`; nothing enforces
        // that equality by construction. A future step-3 source change (a
        // different field feeding `consentReference`) or `toAdminActor`
        // mapping drift is exactly what this assertion guards against,
        // before `logRegistrationApprove`'s discarded `reference` parameter
        // could otherwise get logged against a mismatched actor.
        if (adminActor.consentReference !== row.reference) {
          throw new Error(
            `Invariant violated: created actor's consentReference "${adminActor.consentReference}" ` +
              `does not equal registration reference "${row.reference}"`,
          );
        }

        // Step 7 — inside the same tx.
        await this.actorAuditService.logRegistrationApprove(
          tx,
          adminActor,
          acting,
          row.reference,
        );

        // Step 8 — only knowable after step 5.
        const updatedRegistration = await tx.registration.update({
          where: { id },
          data: { publishedActorId: created.id },
          select: { id: true, reference: true, status: true, publishedActorId: true },
        });

        return {
          registration: updatedRegistration,
          actor: adminActor,
          submitterEmail: row.submitterEmail,
        };
      },
    );

    // DD-9 / FR-14 scenario 1 — dispatched only AFTER the transaction above
    // has committed, using values returned FROM that (already-committed)
    // result. `fix/otp-mail-lambda-freeze` — now AWAITED (see this
    // method's class doc above); the send's own failure stays non-fatal.
    await this.dispatchApprovalEmail(submitterEmail, registration.reference);

    return { registration, actor };
  }

  /**
   * `POST /admin/registrations/:id/reject` (FR-11 scenario 3, FR-13
   * scenarios 1, 2, FR-14 scenarios 1, 2; `design.md` §6.4). Mandatory
   * structured `reason` (validated against `rejection-reasons.ts`'s frozen
   * list by `RegistrationRejectDto`'s `@IsIn(...)` — a missing or unknown
   * reason never reaches this method at all, it is a `400` from the global
   * `ValidationPipe`) and an OPTIONAL applicant-facing `note`.
   *
   * **Same conditional-update construction as `approve` (DD-17), one
   * meaning of `409`.** `tx.registration.updateMany({ where: { id, status:
   * PENDING_REVIEW }, ... })` is step 1, exactly mirroring `approve`'s step
   * 1 — `count === 0` IS the "already adjudicated" `409`, by construction,
   * never a read-then-check race. **The asymmetry from `approve`, stated
   * plainly: rejection has only ONE `409` meaning.** There is no `traderId`
   * to derive, no `Actor` to create, so there is no second `409` meaning (a
   * collision) and no `P2002` catch here — do not import `approve`'s second
   * `409` path.
   *
   * **No `Actor` is touched, and the stored consent record is not altered
   * (FR-13 scenario 1's `BUT` clause).** The `data` object below writes
   * exactly five columns — `status`, `rejectionReason`, `reviewNote`,
   * `reviewedBySub`/`reviewedByEmail`/`reviewedAt` — and NEVER
   * `consentAcceptedAt`/`consentPolicyVersion`. This method's `tx` never
   * calls `tx.actor.create` (or any `tx.actor.*` method at all) — the
   * absence is structural, not merely untested: unlike `approve`'s `buildTx`
   * test double, a `reject`-only transaction never even NEEDS an `actor`
   * delegate on its mock, which is itself evidence the write path cannot
   * reach one.
   *
   * **Audited inside the SAME `tx`** (`backend/CLAUDE.md`) via
   * `actorAuditService.logRegistrationReject` — writes `actorId` = the
   * REGISTRATION id (there is no actor), per `design.md` §6.7 and FR-16's
   * carried-forward clause that no `REGISTRATION_REJECT` row may appear in
   * any actor's history.
   *
   * **After commit, never inside it (DD-9):** the rejection notification —
   * same placement, same error-class-name-only logging, and — since
   * `fix/otp-mail-lambda-freeze` (2026-09-03) — same AWAITED shape as
   * `dispatchApprovalEmail` (see that method's class doc for why fire-
   * and-forget was a production bug, not a mitigation). FR-14 scenario 1's
   * "a send failure does not roll back an adjudication" still binds this
   * path identically: the send is awaited, but its failure is only
   * logged, never rethrown.
   *
   * **FR-13 scenario 2 — the note reaches the applicant through 3a's public
   * lookup, independent of email (NFR-10).** This method writes `reviewNote`
   * to the SAME column `toPublicRegistrationLookup`
   * (`serializers/public-registration.serializer.ts`) reads — the write
   * half of that cross-module seam. `rejectionReason` is written to a
   * DIFFERENT column that serializer never reads at all (DC-32) — the
   * read-side proof that the reason code stays admin-only lives in
   * `registrations-lookup.e2e.spec.ts` and `pii-boundary.spec.ts`'s fixture
   * sweep, not here; this method's job is only to write the two columns
   * correctly.
   */
  async reject(
    id: string,
    dto: RegistrationRejectDto,
    actingSub: string,
  ): Promise<RegistrationRejectResult> {
    const acting = await this.resolveActing(actingSub);
    const now = new Date();

    const { registration, submitterEmail } = await this.prisma.$transaction(async (tx) => {
      // Step 1 (DD-17, mirrors approve) — the conditional update IS the
      // double-adjudication refusal. Writes exactly the five adjudication
      // columns this scenario owns; consent columns are untouched.
      const updated = await tx.registration.updateMany({
        where: { id, status: RegistrationStatus.PENDING_REVIEW },
        data: {
          status: RegistrationStatus.REJECTED,
          rejectionReason: dto.reason,
          // KZ-007 — trim, then treat a now-empty string identically to a
          // missing one. `@IsOptional()` only skips `null`/`undefined`, so
          // an admin submitting a blank/whitespace-only note (exactly what
          // a controlled `<textarea>` submits — T-14 must not be relied on
          // to prevent this) would otherwise store `''`, and 3a's public
          // lookup (`toPublicRegistrationLookup`) treats any non-null
          // `reviewNote` as present, surfacing an empty-but-present field to
          // the applicant.
          reviewNote: dto.note?.trim() ? dto.note.trim() : null,
          reviewedBySub: actingSub,
          reviewedByEmail: acting.email,
          reviewedAt: now,
        },
      });

      if (updated.count === 0) {
        // Rejection has only ONE 409 meaning — "already adjudicated". There
        // is no traderId-collision analogue on this path.
        const existing = await tx.registration.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!existing) {
          throw new NotFoundException(`Registration ${id} not found`);
        }
        throw new ConflictException(`Registration ${id} has already been adjudicated`);
      }

      const row = (await tx.registration.findUnique({
        where: { id },
        select: {
          id: true,
          reference: true,
          status: true,
          payload: true,
          rejectionReason: true,
          submitterEmail: true,
        },
      })) as RejectedRegistrationRow | null;
      if (!row) {
        throw new Error('Rejected registration could not be refetched');
      }

      // Audited inside the same tx (backend/CLAUDE.md). No Actor exists for
      // this write path — actorId = the registration id (design.md §6.7).
      await this.actorAuditService.logRegistrationReject(tx, row, acting);

      return {
        registration: { id: row.id, reference: row.reference, status: row.status },
        submitterEmail: row.submitterEmail,
      };
    });

    // DD-9 / FR-14 scenarios 1, 2 — dispatched only AFTER commit, using the
    // value returned FROM that (already-committed) result — same placement
    // discipline as approve's dispatchApprovalEmail. `fix/otp-mail-lambda-
    // freeze` — now AWAITED; the send's own failure stays non-fatal.
    await this.dispatchRejectionEmail(submitterEmail, registration.reference);

    return { registration };
  }

  /**
   * FR-12 scenario 3 — the server-side half of the typed acknowledgement
   * gate. The client-side half (`AcknowledgeDialog`, T-14) is UX only;
   * THIS is what makes a crafted request that omits or misspells the
   * acknowledgement fail regardless of what any client enforces.
   */
  private assertAcknowledgement(acknowledgement: string): void {
    if (acknowledgement !== APPROVAL_ACKNOWLEDGEMENT_TEXT) {
      const details: FieldErrorDetail[] = [
        {
          field: 'acknowledgement',
          message: `Must be typed exactly: "${APPROVAL_ACKNOWLEDGEMENT_TEXT}"`,
        },
      ];
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Acknowledgement text does not match the required confirmation.',
        details,
      });
    }
  }

  /** Resolve the acting Admin email and package it with the verified sub — mirrors `ActorsAdminService.resolveActing`. */
  private async resolveActing(actingSub: string): Promise<ActingAdmin> {
    const email = await this.actingAdminResolver.resolve(actingSub);
    return { sub: actingSub, email };
  }

  /**
   * Resolve crop names to `Crop` ids and build `CropsOnActors` link rows.
   * `RegistrationPayloadDto.crops` is already validated at submission time
   * against the same canonical crop catalog (`@IsIn(CROP_NAMES...)`), so a
   * missing name here means catalog drift between submission and approval
   * time, not applicant error — a bare `Error` (surfacing as `500`), not a
   * `BadRequestException`, mirrors `Created actor could not be refetched`'s
   * treatment of an unexpected invariant violation elsewhere in this method.
   */
  private async buildCropLinks(
    tx: Prisma.TransactionClient,
    actorId: string,
    cropNames: string[],
  ): Promise<Array<{ actorId: string; cropId: string }>> {
    const crops = await tx.crop.findMany({
      where: { name: { in: cropNames } },
      select: { id: true, name: true },
    });

    const foundNames = new Set(crops.map((c) => c.name));
    const missing = cropNames.filter((name) => !foundNames.has(name));
    if (missing.length > 0) {
      throw new Error(`Unknown crops in approved registration payload: ${missing.join(', ')}`);
    }

    return crops.map((crop) => ({ actorId, cropId: crop.id }));
  }

  /**
   * DD-9 / FR-14 scenario 1: dispatched only after the caller's transaction
   * has committed, and a failure is logged by the error's CLASS NAME
   * only — never the destination address, which the AWS SDK's own
   * `MessageRejected` puts verbatim in its message (a transport failure
   * from `MailService.dispatch` rethrows unchanged — DD-9).
   *
   * **`fix/otp-mail-lambda-freeze` (2026-09-03) — AWAITED, not
   * fire-and-forget.** This used to be `void this.mailService.sendApproval(
   * ...).catch(...)`, mirroring `RegistrationsService.dispatchReceiptEmail`'s
   * still-fire-and-forget shape. That shape is the same production bug
   * `RegistrationsService.requestVerificationCode` had (see that method's
   * class doc): Lambda can freeze the container the instant the caller's
   * returned promise settles, dropping an in-flight SES call with no
   * outcome line ever logged. Awaiting closes that here. Unlike the OTP
   * fix, no constant-time floor is added — an authenticated admin acting
   * on a registration they can already see learns nothing from this
   * method's latency, so there is no oracle to protect against. The catch
   * below is unchanged: still non-fatal, still class-name-only.
   */
  private async dispatchApprovalEmail(to: string, reference: string): Promise<void> {
    try {
      await this.mailService.sendApproval(to, reference);
    } catch (err: unknown) {
      const errorType = err instanceof Error ? err.name : 'UnknownError';
      this.logger.error(
        `registration approval notification send failed: errorType=${errorType} reference=${reference}`,
      );
    }
  }

  /**
   * DD-9 / FR-14 scenarios 1, 2: dispatched only after the caller's
   * transaction has committed, and a failure is logged by the error's
   * CLASS NAME only — mirrors `dispatchApprovalEmail`'s identical pattern
   * (a transport failure can embed the destination address verbatim in
   * its message). `fix/otp-mail-lambda-freeze` (2026-09-03) — AWAITED, not
   * fire-and-forget, for the same production reason documented on
   * `dispatchApprovalEmail` above; no constant-time floor here either.
   */
  private async dispatchRejectionEmail(to: string, reference: string): Promise<void> {
    try {
      await this.mailService.sendRejection(to, reference);
    } catch (err: unknown) {
      const errorType = err instanceof Error ? err.name : 'UnknownError';
      this.logger.error(
        `registration rejection notification send failed: errorType=${errorType} reference=${reference}`,
      );
    }
  }
}
