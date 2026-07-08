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
