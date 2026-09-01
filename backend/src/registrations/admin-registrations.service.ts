import { Injectable } from '@nestjs/common';
import { Prisma, RegistrationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminRegistrationListQueryDto } from './dto/admin-registration-list-query.dto';

/**
 * T-4 — Admin-only registrations service (FR-9). `list` is the only method
 * this task adds; T-5…T-9 extend this class with detail/approve/reject/
 * dismiss-duplicate — see `design.md` §3's file tree, which schedules this
 * file as `(new)` here and `(edit)` in every later backend task.
 *
 * Design refs: `design.md` §5 (route contract), §6.1 (module wiring).
 * Requirements: FR-9 scenarios 1, 2, 3, 4; NFR-8, NFR-9.
 */

/** One row of the admin queue list — FR-9 scenario 1's column set, minus `duplicates` (T-5's `duplicateCandidateCount`, not this task's scope) and `action` (a frontend affordance, not a data field). */
export interface AdminRegistrationListRow {
  id: string;
  reference: string;
  /** The applicant's organisation name — `Registration.payload.traderName`. */
  applicant: string;
  traderType: string;
  region: string;
  submittedAt: Date;
  status: RegistrationStatus;
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
 * The subset of `RegistrationPayloadDto` this list projects. `Registration.
 * payload` is stored as an opaque `Json` column (no dedicated `traderType`/
 * `region` columns exist — 3a never promoted them out of the blob), so this
 * is a read-time cast of already-validated data, never a second validation
 * pass.
 */
interface QueueRowPayload {
  traderName: string;
  traderType: string;
  region: string;
}

/** Minimal shape the list query reads off a `Registration` row. */
interface QueueSourceRow {
  id: string;
  reference: string;
  payload: unknown;
  createdAt: Date;
  status: RegistrationStatus;
}

function toAdminRegistrationListRow(row: QueueSourceRow): AdminRegistrationListRow {
  const payload = row.payload as QueueRowPayload;
  return {
    id: row.id,
    reference: row.reference,
    applicant: payload.traderName,
    traderType: payload.traderType,
    region: payload.region,
    submittedAt: row.createdAt,
    status: row.status,
  };
}

@Injectable()
export class AdminRegistrationsService {
  constructor(private readonly prisma: PrismaService) {}

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
      }),
      this.prisma.registration.count({ where }),
    ]);

    return {
      data: (rows as QueueSourceRow[]).map((row) => toAdminRegistrationListRow(row)),
      page,
      pageSize,
      total,
    };
  }
}
