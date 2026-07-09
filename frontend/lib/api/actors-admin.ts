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
