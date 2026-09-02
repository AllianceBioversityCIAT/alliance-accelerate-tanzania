// @sdd-spec admin/registration-review-queue (T-11)
/**
 * Admin registrations API client — `design.md` §5's five-route contract
 * table.
 *
 * Mirrors the backend Admin registration contract EXACTLY
 * (`frontend/CLAUDE.md`'s "Types mirror backend contracts EXACTLY — exact
 * string-literal unions… Loosening a union to `string` or flipping
 * optionality has FAILed reviews before"):
 *
 *   - `RegistrationStatus`               ← imported from `./registrations.ts`
 *                                          (single declaration; mirrors `enum
 *                                          RegistrationStatus` in
 *                                          `backend/prisma/schema.prisma`)
 *   - `AdminRegistrationListRow`/`List`  ← `admin-registrations.service.ts`
 *   - `AdminRegistrationDetail`, `AdminRegistrationPayload`,
 *     `AdminConsentRecord`              ← `serializers/admin-registration.serializer.ts`
 *   - `DuplicateCandidate`/`DuplicateMatchAttribute`
 *                                        ← `duplicate-detection.service.ts`
 *   - `ActivityTrailEvent` (closed 5-member discriminated union)
 *                                        ← `serializers/activity-trail.serializer.ts`
 *   - `RejectionReasonCode` (closed 5-member union)
 *                                        ← `rejection-reasons.ts`
 *   - `RegistrationApproveResult`, `RegistrationRejectResult`,
 *     `DismissDuplicateResult`          ← `admin-registrations.service.ts`
 *
 * All functions require a Cognito ACCESS token supplied by the caller
 * (it carries no email claim — `frontend/CLAUDE.md`). Bearer token is
 * attached via `apiFetch` (`./client.ts`). `apiFetch` throws
 * `AuthFailureError` on 401 and `ApiError { status, message, details }` on
 * every other non-OK response, where `details` is the backend's
 * `[{ field, message }]` validation array (e.g. `RegistrationApproveDto`'s
 * mismatched-acknowledgement 400, `RegistrationRejectDto`'s unknown-reason
 * 400).
 *
 * Scope discipline: this file is the typed client ONLY. No components, no
 * pages, no hooks — those are T-12/T-13/T-14.
 */

import { apiFetch } from './client';
import type { AdminActor } from './actors-admin';
import type { RegistrationStatus } from './registrations';

// ── Types — mirrored from the backend, byte-for-byte on the union members ──

/**
 * `enum RegistrationStatus` in `backend/prisma/schema.prisma` — imported
 * rather than redeclared so this client and the public lookup client
 * (`registrations.ts`, which already exported a byte-identical union) cannot
 * drift on one wire shape (same principle as this file's `AdminActor`
 * import, immediately above). See `registrations.ts` for the full
 * mirroring rationale, including why the union stays the full five members.
 */
export type { RegistrationStatus };

/** `AdminRegistrationListSort` in `dto/admin-registration-list-query.dto.ts`. `'oldest'` is the default (FR-9). */
export type AdminRegistrationListSort = 'oldest' | 'newest';

/**
 * One row of the admin queue list — `AdminRegistrationListRow` in
 * `admin-registrations.service.ts`. `submittedAt` is a `Date` on the
 * backend; every `Date` crosses the wire as an ISO-8601 string once
 * JSON-serialized, so it is typed `string` here, matching this file's other
 * date-bearing fields.
 */
export interface AdminRegistrationListRow {
  id: string;
  reference: string;
  /** The applicant's organisation name — `Registration.payload.traderName`. */
  applicant: string;
  traderType: string;
  region: string;
  submittedAt: string;
  status: RegistrationStatus;
  /** Open (non-dismissed) duplicate candidates for this registration (FR-11). */
  duplicateCandidateCount: number;
}

/** Paginated admin queue envelope — `AdminRegistrationList` in `admin-registrations.service.ts` (`design.md` §5: `{ data, page, pageSize, total }`). */
export interface AdminRegistrationList {
  data: AdminRegistrationListRow[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Query parameters for `adminListRegistrations` — mirrors
 * `AdminRegistrationListQueryDto`. `region`/`traderType` are validated
 * server-side against `CANONICAL_REGIONS`/`TRADER_TYPES` but are sent as
 * plain `string` here, mirroring `AdminActorListQuery`'s identical treatment
 * of the same two fields in `actors-admin.ts` — the closed vocabulary is a
 * server-side validation concern, not a wire-type one.
 */
export interface AdminRegistrationListQuery {
  status?: RegistrationStatus;
  /** Free-text match against the applicant's organisation name. */
  q?: string;
  region?: string;
  traderType?: string;
  sort?: AdminRegistrationListSort;
  page?: number;
  pageSize?: number;
}

/**
 * The submitted payload, verbatim — `AdminRegistrationPayload` in
 * `serializers/admin-registration.serializer.ts`. `contactPerson` and
 * `otherCrops` have no `Actor` column (FR-12's projection table) and are
 * review context only — never published.
 */
export interface AdminRegistrationPayload {
  traderName: string;
  traderType: string;
  /** Review context only — no `Actor` column exists. */
  contactPerson: string;
  position: string | null;
  district: string | null;
  marketLocation: string | null;
  sex: string | null;
  region: string;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  crops: string[];
  /** Review context only — no `Actor` column exists. */
  otherCrops: string | null;
  capacityTons: number;
  phone: string;
}

/** FR-10 scenario 2's consent block — `AdminConsentRecord` in `serializers/admin-registration.serializer.ts`. */
export interface AdminConsentRecord {
  /** The organisation being asked to consent — `payload.traderName`. */
  consentingOrganisation: string;
  policyVersion: string;
  /** ISO-8601, always UTC (`Z` suffix). */
  acceptedAt: string;
  /**
   * FR-10 scenario 2's "recorded at submission" qualifier, carried as DATA
   * (a single fixed literal — the backend never emits any other value).
   */
  acceptedAtQualifier: 'RECORDED_AT_SUBMISSION';
}

/** Which of the four §6.5 attributes a candidate matched on — `DuplicateMatchAttribute` in `duplicate-detection.service.ts`. */
export type DuplicateMatchAttribute = 'phone' | 'email' | 'traderName' | 'gps';

/** One surfaced duplicate candidate, capped and ordered by match strength — `DuplicateCandidate` in `duplicate-detection.service.ts`. */
export interface DuplicateCandidate {
  actorId: string;
  traderId: string;
  traderName: string;
  /** Non-empty; a candidate with no matched attribute is never produced. */
  matchedOn: DuplicateMatchAttribute[];
}

/**
 * The activity trail's closed 5-member discriminated union — mirrors
 * `ActivityTrailEvent` in `serializers/activity-trail.serializer.ts`
 * exactly, including the two identity fields the backend deliberately
 * types `string | null` rather than `string`: the resolver returns `null`
 * on failure, and coalescing it to `''` would state "reviewed/dismissed by
 * an empty identity" where the record stores "identity unknown" — the exact
 * optionality flip `frontend/CLAUDE.md` says has FAILed reviews before
 * (carried forward from T-6/T-7 rework).
 */
export interface SubmittedTrailEvent {
  type: 'SUBMITTED';
  occurredAt: string;
}

export interface EmailVerifiedTrailEvent {
  type: 'EMAIL_VERIFIED';
  occurredAt: string;
}

export interface ConsentRecordedTrailEvent {
  type: 'CONSENT_RECORDED';
  occurredAt: string;
  policyVersion: string;
}

export interface DuplicateDismissedTrailEvent {
  type: 'DUPLICATE_DISMISSED';
  occurredAt: string;
  candidateActorId: string;
  dismissedBySub: string;
  /** `null`, never `''`, when the dismissing admin's identity could not be resolved. */
  dismissedByEmail: string | null;
}

export interface AdjudicatedTrailEvent {
  type: 'ADJUDICATED';
  occurredAt: string;
  status: 'APPROVED' | 'REJECTED';
  /** `null`, never `''`, when the reviewer's identity could not be resolved. */
  reviewedBySub: string | null;
  /** `null`, never `''`, when the reviewer's identity could not be resolved. */
  reviewedByEmail: string | null;
}

/** The trail's one output shape — closed to exactly these five members. */
export type ActivityTrailEvent =
  | SubmittedTrailEvent
  | EmailVerifiedTrailEvent
  | ConsentRecordedTrailEvent
  | DuplicateDismissedTrailEvent
  | AdjudicatedTrailEvent;

/**
 * Full admin registration detail — `AdminRegistrationDetail` in
 * `serializers/admin-registration.serializer.ts` (`GET /:id`'s response,
 * FR-10). `submitterEmail` is PII; this surface is Admin-only (NFR-1).
 */
export interface AdminRegistrationDetail {
  id: string;
  reference: string;
  status: RegistrationStatus;
  payload: AdminRegistrationPayload;
  submitterEmail: string;
  consent: AdminConsentRecord;
  /** Read-time only, never a persisted verdict (FR-11). */
  duplicateCandidates: DuplicateCandidate[];
  /** Derived, order-stable, no fabricated timestamp (FR-10 scenario 3). */
  activityTrail: ActivityTrailEvent[];
}

/**
 * The closed set of valid `rejectionReason` codes — mirrors
 * `RejectionReasonCode` in `rejection-reasons.ts` exactly (a closed union
 * of five literals, never widened to `string`). `RegistrationRejectDto`
 * validates a request's `reason` against the same five codes server-side.
 */
export type RejectionReasonCode =
  | 'DUPLICATE_OF_EXISTING_RECORD'
  | 'INCOMPLETE_OR_INVALID_INFORMATION'
  | 'INELIGIBLE_ACTOR_TYPE'
  | 'UNABLE_TO_VERIFY_CONTACT_DETAILS'
  | 'OTHER';

/** Body for `POST /:id/approve` — mirrors `RegistrationApproveDto`. */
export interface RegistrationApproveInput {
  /** Must match `APPROVAL_ACKNOWLEDGEMENT_TEXT` EXACTLY server-side ("I confirm consent is on file"); the client gate is UX only (FR-12 scenario 3). */
  acknowledgement: string;
}

/** Body for `POST /:id/reject` — mirrors `RegistrationRejectDto`. */
export interface RegistrationRejectInput {
  reason: RejectionReasonCode;
  /** Optional, applicant-facing (FR-13 scenario 2) — capped at 2000 chars server-side. */
  note?: string;
}

/** Body for `POST /:id/dismiss-duplicate` — mirrors `RegistrationDismissDuplicateDto`. Identified by actor id, never an index (`design.md` §5 decision 4). */
export interface RegistrationDismissDuplicateInput {
  candidateActorId: string;
}

/**
 * `POST /:id/approve`'s response envelope — `RegistrationApproveResult` in
 * `admin-registrations.service.ts` (`design.md` §5: `{ registration, actor }`).
 * `actor` is the SAME `AdminActor` shape `actors-admin.ts` already mirrors
 * from `admin-actor.serializer.ts` — imported rather than redeclared so the
 * two clients cannot drift on one wire shape.
 */
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
 * `POST /:id/reject`'s response envelope — `RegistrationRejectResult` in
 * `admin-registrations.service.ts`. **Minimal, not the full detail
 * projection** — `rejectionReason`/`reviewNote` are NOT echoed back.
 */
export interface RegistrationRejectResult {
  registration: {
    id: string;
    reference: string;
    status: RegistrationStatus;
  };
}

/**
 * `POST /:id/dismiss-duplicate`'s response envelope —
 * `DismissDuplicateResult` in `admin-registrations.service.ts`. **Minimal,
 * not the full detail projection** — the write path deliberately omits the
 * detection call; the refreshed candidate list and the new
 * `DUPLICATE_DISMISSED` trail entry arrive on the next `GET /:id`.
 */
export interface DismissDuplicateResult {
  registration: {
    id: string;
    reference: string;
    status: RegistrationStatus;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

const BASE = '/api/v1/admin/registrations';

/** NFR-9 / `frontend/CLAUDE.md` — list endpoints clamp `pageSize` at 100 client-side, mirroring `getActorHistory` in `actors-admin.ts`. */
const MAX_PAGE_SIZE = 100;

// ── API functions — design.md §5's five-route contract table ───────────────

/**
 * `GET /api/v1/admin/registrations?status=&q=&region=&traderType=&sort=&page=&pageSize=`
 *
 * Paginated, filterable, sortable queue (FR-9). Each row carries
 * `duplicateCandidateCount`, never the candidates themselves (`design.md`
 * §5 decision 2). Throws `AuthFailureError` on 401; throws `ApiError` on
 * `400` (bad query) or `403` (Staff).
 *
 * `pageSize` is clamped to ≤ 100 client-side before the request is sent —
 * the server independently rejects anything above it with `400`.
 *
 * @param query  Optional status, q, region, traderType, sort, page, pageSize.
 * @param token  Cognito ACCESS token from the caller's session.
 */
export async function adminListRegistrations(
  query: AdminRegistrationListQuery | undefined,
  token: string,
): Promise<AdminRegistrationList> {
  const params = new URLSearchParams();
  if (query?.status != null) params.set('status', query.status);
  if (query?.q != null) params.set('q', query.q);
  if (query?.region != null) params.set('region', query.region);
  if (query?.traderType != null) params.set('traderType', query.traderType);
  if (query?.sort != null) params.set('sort', query.sort);
  if (query?.page != null) params.set('page', String(query.page));
  if (query?.pageSize != null) {
    params.set('pageSize', String(Math.min(query.pageSize, MAX_PAGE_SIZE)));
  }

  const qs = params.toString();
  const path = qs ? `${BASE}?${qs}` : BASE;

  return apiFetch<AdminRegistrationList>(path, { method: 'GET', token });
}

/**
 * `GET /api/v1/admin/registrations/:id`
 *
 * Full detail read (FR-10): payload, consent record, duplicate candidates,
 * activity trail. Throws `AuthFailureError` on 401; throws `ApiError` on
 * `403` (Staff) or `404` (unknown id — DD-22: honest here, unlike the
 * public lookup).
 *
 * @param id     Registration id to fetch.
 * @param token  Cognito ACCESS token from the caller's session.
 */
export async function adminGetRegistration(
  id: string,
  token: string,
): Promise<AdminRegistrationDetail> {
  return apiFetch<AdminRegistrationDetail>(`${BASE}/${id}`, { method: 'GET', token });
}

/**
 * `POST /api/v1/admin/registrations/:id/approve`
 *
 * The registry's only path from private submitted data to public record
 * (FR-12). Returns **HTTP 200, not 201** — this is an action verb on an
 * existing resource, not a bare resource-creation `POST`
 * (`admin-registrations.controller.ts`'s `@HttpCode(200)`).
 *
 * Throws `AuthFailureError` on 401; throws `ApiError` on `400`
 * (acknowledgement mismatch — `details: [{ field: 'acknowledgement',
 * message }]`), `403` (Staff), `404` (unknown id), or `409` (already
 * adjudicated, or the derived `traderId` collides — the message names the
 * colliding key in the second case).
 *
 * @param id     Registration id to approve.
 * @param input  { acknowledgement } — the exact typed confirmation phrase.
 * @param token  Cognito ACCESS token from the caller's session.
 */
export async function approveRegistration(
  id: string,
  input: RegistrationApproveInput,
  token: string,
): Promise<RegistrationApproveResult> {
  return apiFetch<RegistrationApproveResult>(`${BASE}/${id}/approve`, {
    method: 'POST',
    token,
    body: input,
  });
}

/**
 * `POST /api/v1/admin/registrations/:id/reject`
 *
 * Records a structured reason and an optional applicant-facing note; no
 * `Actor` is created (FR-13). Returns HTTP 200 (`@HttpCode(200)`, same
 * action-verb convention as `approve`).
 *
 * Throws `AuthFailureError` on 401; throws `ApiError` on `400` (missing or
 * unknown reason), `403` (Staff), `404` (unknown id), or `409` (already
 * adjudicated).
 *
 * @param id     Registration id to reject.
 * @param input  { reason, note? }.
 * @param token  Cognito ACCESS token from the caller's session.
 */
export async function rejectRegistration(
  id: string,
  input: RegistrationRejectInput,
  token: string,
): Promise<RegistrationRejectResult> {
  return apiFetch<RegistrationRejectResult>(`${BASE}/${id}/reject`, {
    method: 'POST',
    token,
    body: input,
  });
}

/**
 * `POST /api/v1/admin/registrations/:id/dismiss-duplicate`
 *
 * Records that `candidateActorId` is not a duplicate for this registration
 * (FR-11 scenario 2) — per-candidate, appended, never overwritten. Returns
 * HTTP 200. Throws `AuthFailureError` on 401; throws `ApiError` on `403`
 * (Staff) or `404` (unknown registration OR unknown candidate).
 *
 * @param id     Registration id whose candidate is being dismissed.
 * @param input  { candidateActorId } — identified by actor id, never an index.
 * @param token  Cognito ACCESS token from the caller's session.
 */
export async function dismissDuplicateCandidate(
  id: string,
  input: RegistrationDismissDuplicateInput,
  token: string,
): Promise<DismissDuplicateResult> {
  return apiFetch<DismissDuplicateResult>(`${BASE}/${id}/dismiss-duplicate`, {
    method: 'POST',
    token,
    body: input,
  });
}
