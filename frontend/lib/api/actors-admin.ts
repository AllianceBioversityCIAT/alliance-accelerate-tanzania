// @sdd-spec admin/bulk-actor-operations
/**
 * Admin actors API client — design.md §3 + §5.
 *
 * Mirrors the backend Admin actor contract (AdminActor, AdminActorList,
 * BulkResult) and exposes the three Admin-only endpoints mounted under
 * `/api/v1/admin/actors`.
 *
 * All functions require a Cognito access token supplied by the CALLER
 * (obtained via getSession().accessToken from lib/auth/auth-client.ts).
 * This module is a pure async module — no React hooks, no Amplify calls.
 *
 * Bearer token is attached via apiFetch (lib/api/client.ts).
 * AuthFailureError is re-thrown on 401 — callers should route to /login (FR-9).
 *
 * Usage (from a page/hook in T-9):
 *   import { getSession } from '@/lib/auth/auth-client';
 *   import { adminListActors, bulkSetConsent } from '@/lib/api/actors-admin';
 *
 *   const session = await getSession();
 *   if (!session) { router.push('/login'); return; }
 *   const result = await adminListActors({ page: 1 }, session.accessToken);
 */

import { apiFetch } from './client';

// ── Types — design.md §3 (backend contract) ────────────────────────────────

/**
 * Full Admin actor response shape returned by `GET /api/v1/admin/actors`.
 *
 * Includes every Actor column including PII (`phone`, `email`, `sex`,
 * `position`, `marketLocation`, `technicalSupport`), the current
 * `consentStatus`, and flattened crop names. This is the ONLY client-side
 * shape that carries non-consented actor PII; it is produced exclusively by
 * Admin-gated routes (FR-1, FR-7, NFR-1).
 */
export interface AdminActor {
  id: string;
  traderId: string;
  traderName: string;
  region: string;
  district: string | null;
  traderType: string;
  sex: string | null;
  position: string | null;
  marketLocation: string | null;
  capacityTons: number | null;
  technicalSupport: string | null;
  phone: string | null;
  email: string | null;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  gpsAltitude: number | null;
  gpsAccuracy: number | null;
  consentStatus: string;
  crops: string[];
  createdAt: string;
  updatedAt: string;
}

/** Paginated response envelope for `GET /api/v1/admin/actors` (FR-1). */
export interface AdminActorList {
  data: AdminActor[];
  page: number;
  pageSize: number;
  total: number;
}

/** Per-id result returned by bulk mutation endpoints (design.md §3). */
export interface BulkResult {
  requested: number;
  applied: number;
  notFound: string[];
}

/** Query parameters for `adminListActors` (mirrors AdminActorListQueryDto). */
export interface AdminActorListQuery {
  page?: number;
  pageSize?: number;
  region?: string;
  traderType?: string;
  consentStatus?: 'GRANTED' | 'DENIED' | 'UNKNOWN';
}

/** Body for `PATCH /api/v1/admin/actors/bulk/consent` (FR-3, FR-4). */
export interface BulkConsentInput {
  ids: string[];
  consentStatus: 'GRANTED' | 'DENIED';
  /**
   * Required server-side when `consentStatus === 'GRANTED'` (unlock).
   * Unlocking publishes PII + GPS, so the Admin must explicitly confirm that
   * consent is on file before the request is accepted.
   */
  acknowledged?: boolean;
}

/** Body for `POST /api/v1/admin/actors/bulk/delete` (FR-5). */
export interface BulkDeleteInput {
  ids: string[];
}

/**
 * Single audit entry returned by `GET /api/v1/admin/actors/:id/history` (FR-7).
 *
 * Mirrors the backend `AuditEntry` serializer exactly. `changes` carries a
 * field-level diff or full snapshot envelope and is treated as opaque JSON by
 * the client — the History panel is responsible for presentation.
 */
export interface AuditEntry {
  id: string;
  actorId: string;
  traderId: string;
  traderName: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'BULK_CONSENT' | 'BULK_DELETE';
  actingSub: string;
  actingEmail: string | null;
  changes: unknown;
  acknowledged: boolean | null;
  createdAt: string;
}

/** Paginated response envelope for `GET /api/v1/admin/actors/:id/history` (FR-7). */
export interface ActorHistoryList {
  data: AuditEntry[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Input for `POST /api/v1/admin/actors` (FR-1).
 *
 * Matches `AdminActorCreateDto`: required identity fields + optional scalar
 * fields + crop names + the explicit consent acknowledgement required when
 * `consentStatus` is `GRANTED`.
 */
export interface AdminActorCreateInput {
  traderId: string;
  traderName: string;
  region: string;
  traderType: string;
  consentStatus?: 'GRANTED' | 'DENIED' | 'UNKNOWN';
  district?: string | null;
  sex?: string | null;
  position?: string | null;
  marketLocation?: string | null;
  capacityTons?: number | null;
  technicalSupport?: string | null;
  phone?: string | null;
  email?: string | null;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  gpsAltitude?: number | null;
  gpsAccuracy?: number | null;
  crops?: string[];
  acknowledged?: boolean;
}

/**
 * Input for `PATCH /api/v1/admin/actors/:id` (FR-3).
 *
 * Every field is optional; only submitted fields are applied by the backend.
 */
export type AdminActorUpdateInput = Partial<AdminActorCreateInput>;

/** Query parameters for `getActorHistory` (mirrors `ActorHistoryQueryDto`). */
export interface ActorHistoryQuery {
  page?: number;
  pageSize?: number;
}

/** Response shape for `DELETE /api/v1/admin/actors/:id` (FR-4). */
export interface ActorDeleteResult {
  deleted: true;
  id: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const BASE = '/api/v1/admin/actors';

// ── API functions — design.md §3 ───────────────────────────────────────────

/**
 * GET /api/v1/admin/actors?page=&pageSize=&region=&traderType=&consentStatus=
 *
 * Returns a paginated list of ALL actors regardless of `consentStatus`, with
 * PII fields included (FR-1). Throws AuthFailureError on 401; throws Error on
 * other non-OK responses.
 *
 * @param query  Optional page, pageSize, region, traderType, consentStatus.
 * @param token  Cognito access token from the caller's session.
 */
export async function adminListActors(
  query: AdminActorListQuery | undefined,
  token: string,
): Promise<AdminActorList> {
  const params = new URLSearchParams();
  if (query?.page != null) params.set('page', String(query.page));
  if (query?.pageSize != null) params.set('pageSize', String(query.pageSize));
  if (query?.region != null) params.set('region', query.region);
  if (query?.traderType != null) params.set('traderType', query.traderType);
  if (query?.consentStatus != null) params.set('consentStatus', query.consentStatus);

  const qs = params.toString();
  const path = qs ? `${BASE}?${qs}` : BASE;

  return apiFetch<AdminActorList>(path, { method: 'GET', token });
}

/**
 * PATCH /api/v1/admin/actors/bulk/consent
 *
 * Sets `consentStatus` to `GRANTED` (unlock) or `DENIED` (lock) for the
 * supplied actor ids in one transactional request (FR-3). Unlocking requires
 * `acknowledged: true` because it publishes PII + GPS (FR-4). Returns a
 * per-id result envelope.
 *
 * @param input  { ids, consentStatus, acknowledged? }
 * @param token  Cognito access token from the caller's session.
 */
export async function bulkSetConsent(
  input: BulkConsentInput,
  token: string,
): Promise<BulkResult> {
  return apiFetch<BulkResult>(`${BASE}/bulk/consent`, {
    method: 'PATCH',
    token,
    body: input,
  });
}

/**
 * POST /api/v1/admin/actors/bulk/delete
 *
 * Permanently deletes the supplied actor ids in one transactional request
 * (FR-5). Crop links cascade automatically. Returns a per-id result envelope.
 *
 * @param input  { ids }
 * @param token  Cognito access token from the caller's session.
 */
export async function bulkDeleteActors(
  input: BulkDeleteInput,
  token: string,
): Promise<BulkResult> {
  return apiFetch<BulkResult>(`${BASE}/bulk/delete`, {
    method: 'POST',
    token,
    body: input,
  });
}

/**
 * GET /api/v1/admin/actors/:id
 *
 * Returns a single actor in the Admin projection (full fields + PII + crops),
 * regardless of consent status (FR-2). Throws AuthFailureError on 401; throws
 * Error on 404 or other non-OK responses.
 *
 * @param id     Actor id to fetch.
 * @param token  Cognito access token from the caller's session.
 */
export async function adminGetActor(id: string, token: string): Promise<AdminActor> {
  return apiFetch<AdminActor>(`${BASE}/${id}`, { method: 'GET', token });
}

/**
 * POST /api/v1/admin/actors
 *
 * Creates a new actor with the supplied full field set (FR-1). Returns the
 * created actor in Admin projection with HTTP 201. Duplicate `traderId` throws
 * a plain Error (409); missing acknowledgement on a GRANTED consent transition
 * throws a plain Error (400).
 *
 * @param dto    Actor fields to create.
 * @param token  Cognito access token from the caller's session.
 */
export async function createActor(
  dto: AdminActorCreateInput,
  token: string,
): Promise<AdminActor> {
  return apiFetch<AdminActor>(BASE, {
    method: 'POST',
    token,
    body: dto,
  });
}

/**
 * PATCH /api/v1/admin/actors/:id
 *
 * Partially updates an actor (FR-3). Only submitted fields are applied. Returns
 * the updated Admin projection. Throws AuthFailureError on 401; throws Error on
 * 400/404/409 or other non-OK responses.
 *
 * @param id     Actor id to update.
 * @param dto    Partial actor fields.
 * @param token  Cognito access token from the caller's session.
 */
export async function updateActor(
  id: string,
  dto: AdminActorUpdateInput,
  token: string,
): Promise<AdminActor> {
  return apiFetch<AdminActor>(`${BASE}/${id}`, {
    method: 'PATCH',
    token,
    body: dto,
  });
}

/**
 * DELETE /api/v1/admin/actors/:id
 *
 * Permanently deletes a single actor and its crop links (FR-4). Returns
 * `{ deleted: true, id }`. Throws AuthFailureError on 401; throws Error on 404
 * or other non-OK responses.
 *
 * @param id     Actor id to delete.
 * @param token  Cognito access token from the caller's session.
 */
export async function deleteActor(
  id: string,
  token: string,
): Promise<ActorDeleteResult> {
  return apiFetch<ActorDeleteResult>(`${BASE}/${id}`, {
    method: 'DELETE',
    token,
  });
}

/**
 * GET /api/v1/admin/actors/:id/history?page=&pageSize=
 *
 * Returns a paginated list of audit entries for the given actor id, newest
 * first (FR-7). Works for deleted actors. `pageSize` is clamped to a maximum
 * of 100 client-side before the request is sent (NFR-6).
 *
 * @param id      Actor id whose history to fetch.
 * @param query   Optional page / pageSize (pageSize clamped to ≤ 100).
 * @param token   Cognito access token from the caller's session.
 */
export async function getActorHistory(
  id: string,
  query: ActorHistoryQuery | undefined,
  token: string,
): Promise<ActorHistoryList> {
  const params = new URLSearchParams();
  if (query?.page != null) params.set('page', String(query.page));
  if (query?.pageSize != null) {
    params.set('pageSize', String(Math.min(query.pageSize, 100)));
  }

  const qs = params.toString();
  const path = qs ? `${BASE}/${id}/history?${qs}` : `${BASE}/${id}/history`;

  return apiFetch<ActorHistoryList>(path, { method: 'GET', token });
}

// @sdd-spec admin/actor-import
// ── Bulk import (Excel) — design.md §3 + §5 ────────────────────────────────
//
// `importActors` uploads an .xlsx workbook to POST /api/v1/admin/actors/import
// as a base64 JSON body (DR-1) and returns the ImportReport. The types below
// mirror the backend contract at backend/src/actors/actor-import.types.ts
// EXACTLY — keep them in sync when the contract changes.

/** Client-side guard limits — must match the backend service checks (design §3). */
const IMPORT_MAX_BYTES = 4 * 1024 * 1024; // 4 MB decoded cap enforced server-side.
const IMPORT_EXTENSION = '.xlsx';

/** A single field-level validation error for a failed row (no PII values, FR-11). */
export interface ImportRowError {
  field: string;
  message: string;
}

/** Per-row outcome, tied to the Excel data-row number (header = row 1). */
export interface ImportRowResult {
  /** Excel data-row number the outcome refers to. */
  rowNumber: number;
  /** Row identity echoed for the report — non-PII (FR-7). */
  traderId: string | null;
  traderName: string | null;
  /**
   * `create` — prospective create in preview mode.
   * `created` — actor created (commit mode only; carries `actorId`).
   * `skipped-exists` — `traderId` already in the registry (FR-4).
   * `skipped-duplicate-in-file` — `traderId` repeated later in the same file (FR-4).
   * `failed` — validation failed (carries `errors`).
   */
  outcome:
    | 'create'
    | 'created'
    | 'skipped-exists'
    | 'skipped-duplicate-in-file'
    | 'failed';
  /** New actor id — commit + `created` only. */
  actorId?: string;
  /** Field-level errors — `failed` only; field names + messages, never PII values (FR-11). */
  errors?: ImportRowError[];
  /** Non-fatal notes, e.g. 'GPS out of range — imported with GPS cleared' (DR-5). */
  warnings?: string[];
}

/** Aggregate counts across all data rows (FR-7). */
export interface ImportReportTotals {
  rows: number;
  toCreate: number;
  created: number;
  skipped: number;
  failed: number;
  warnings: number;
}

/**
 * Full import report for a preview or commit run (FR-3, FR-7).
 *
 * The `mode` is echoed so the caller renders "preview" vs "result": in preview
 * `toCreate` counts prospective creates and `created` is 0; on commit `created`
 * reflects reality.
 */
export interface ImportReport {
  mode: 'preview' | 'commit';
  /** Template version read from the Instructions sheet, if present (best effort, NFR-8). */
  templateVersionDetected?: string;
  totals: ImportReportTotals;
  rows: ImportRowResult[];
}

/**
 * Reads a File into a base64 string (no `data:` URL prefix).
 *
 * Uses FileReader.readAsDataURL — supported in every target browser and in the
 * jsdom test environment (which does not implement `Blob.arrayBuffer`) — then
 * strips the `data:<mime>;base64,` prefix to yield the raw base64 payload.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * POST /api/v1/admin/actors/import
 *
 * Uploads an .xlsx workbook (base64 JSON body) and returns the ImportReport for
 * either a `preview` dry run (no writes, FR-3) or a `commit` (creates actors,
 * FR-7). When `mode === 'commit'` and the previewed rows publish PII (any
 * `GRANTED` consent), the caller must pass `acknowledged: true` (FR-6).
 *
 * Client-side guards run BEFORE any network call and throw a plain Error (not
 * ApiError) so the picker can surface them inline: the file name must end in
 * `.xlsx` (case-insensitive) and the file must be ≤ 4 MB. On the wire, 400
 * responses (format/caps/base64) surface as ApiError with field `details`; 401
 * as AuthFailureError; 403 as ApiError — consistent with the other functions.
 *
 * @param file          The workbook selected by the Admin (.xlsx, ≤ 4 MB).
 * @param mode          'preview' (dry run) or 'commit' (creates actors).
 * @param token         Cognito access token from the caller's session.
 * @param acknowledged  File-level consent acknowledgement — pass `true` on a
 *                       commit that publishes any GRANTED rows (FR-6). Omit
 *                       otherwise; it is only sent when explicitly provided.
 */
export async function importActors(
  file: File,
  mode: 'preview' | 'commit',
  token: string,
  acknowledged?: boolean,
): Promise<ImportReport> {
  if (!file.name.toLowerCase().endsWith(IMPORT_EXTENSION)) {
    throw new Error('Only .xlsx files can be imported. Please select an Excel workbook.');
  }
  if (file.size > IMPORT_MAX_BYTES) {
    throw new Error('The file is too large — imports are limited to 4 MB.');
  }

  const fileBase64 = await fileToBase64(file);

  return apiFetch<ImportReport>(`${BASE}/import`, {
    method: 'POST',
    token,
    body: {
      fileName: file.name,
      fileBase64,
      mode,
      ...(acknowledged !== undefined && { acknowledged }),
    },
  });
}
