// @sdd-spec actors/consent-intake/consent-request-email (T-9)
/**
 * Admin consent-request API client — design.md §5.1, §5.2, §6.
 *
 * Types mirror the backend EXACTLY (frontend/CLAUDE.md type-fidelity rule):
 *   - `ConsentSkipReason`            ← `backend/src/consent-requests/consent-eligibility.ts`
 *   - `ConsentRequestSendBody` & co. ← `dto/consent-request-send.dto.ts`
 *   - result shapes                  ← `consent-requests.service.ts`
 *
 * Every call takes the Cognito access token from the CALLER and throws
 * `AuthFailureError` on 401 (pages route to /login). Pure async module — no
 * React, no Amplify.
 */

import { apiFetch } from './client';
import type { ConsentMethod, RegistrationSource } from './actors-admin';

const BASE = '/api/v1/admin/consent-requests';

// ── Vocabulary ───────────────────────────────────────────────────────────────

/** FR-2 — every reason an actor is skipped; mirrors `ConsentSkipReason` on the backend. */
export type ConsentSkipReason = 'no_email' | 'granted' | 'pending_request' | 'declined';

/** Mirrors the Prisma `ConsentRequestStatus` enum exactly. */
export type ConsentRequestStatus =
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'FAILED'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'SUPERSEDED';

/** `EXPIRED` is derived (design.md B-16), never stored: a `SENT` row past `expiresAt`. */
export type ConsentRequestEvidenceStatus = ConsentRequestStatus | 'EXPIRED';

// ── Request bodies ───────────────────────────────────────────────────────────

/**
 * The five filter fields an "all matching" target accepts — identical to the
 * list filters, never pagination (`ConsentRequestFilterDto`).
 */
export interface ConsentRequestFilter {
  region?: string;
  traderType?: string;
  consentStatus?: 'GRANTED' | 'DENIED' | 'UNKNOWN';
  registrationSource?: RegistrationSource;
  consentMethod?: ConsentMethod;
}

/** `ConsentRequestTargetDto` — discriminated on `kind`. `ids` is 1..1000. */
export type ConsentRequestTarget =
  | { kind: 'ids'; ids: string[] }
  | { kind: 'filter'; filter: ConsentRequestFilter };

/** `ConsentRequestSendDto` — `single` ⇒ exactly one id; bulk uses a filter or ids ≤ 1000. */
export interface ConsentRequestSendBody {
  target: ConsentRequestTarget;
  scope: 'single' | 'bulk';
}

/** `ConsentRequestBatchDto` — omitted `batchId` acts across ALL batches. */
export interface ConsentRequestBatchBody {
  batchId?: string;
}

// ── Results ──────────────────────────────────────────────────────────────────

export type ConsentSkipCounts = Record<ConsentSkipReason, number>;

export interface ConsentRequestPreviewResult {
  total: number;
  toSend: number;
  skipped: ConsentSkipCounts;
}

export interface ConsentRequestEnqueueResult {
  batchId: string;
  queued: number;
  skipped: ConsentSkipCounts;
}

export interface ConsentRequestDispatchResult {
  sent: number;
  failed: number;
  remaining: number;
}

export interface ConsentRequestRetryResult {
  queued: number;
}

export interface ConsentRequestQueueSummary {
  queued: number;
  failed: number;
}

// ── Calls ────────────────────────────────────────────────────────────────────

/** `POST /admin/consent-requests/preview` — no writes (200). */
export function previewConsentRequests(
  body: ConsentRequestSendBody,
  token: string,
): Promise<ConsentRequestPreviewResult> {
  return apiFetch<ConsentRequestPreviewResult>(`${BASE}/preview`, { method: 'POST', token, body });
}

/** `POST /admin/consent-requests` — persists QUEUED rows (201). */
export function enqueueConsentRequests(
  body: ConsentRequestSendBody,
  token: string,
): Promise<ConsentRequestEnqueueResult> {
  return apiFetch<ConsentRequestEnqueueResult>(BASE, { method: 'POST', token, body });
}

/** `POST /admin/consent-requests/dispatch` — one time-boxed send step (200). */
export function dispatchConsentRequests(
  body: ConsentRequestBatchBody,
  token: string,
): Promise<ConsentRequestDispatchResult> {
  return apiFetch<ConsentRequestDispatchResult>(`${BASE}/dispatch`, { method: 'POST', token, body });
}

/** `POST /admin/consent-requests/retry` — `FAILED → QUEUED` (200). */
export function retryConsentRequests(
  body: ConsentRequestBatchBody,
  token: string,
): Promise<ConsentRequestRetryResult> {
  return apiFetch<ConsentRequestRetryResult>(`${BASE}/retry`, { method: 'POST', token, body });
}

/** `GET /admin/consent-requests/queue` — across all batches, for the resume banner. */
export function getConsentQueue(token: string): Promise<ConsentRequestQueueSummary> {
  return apiFetch<ConsentRequestQueueSummary>(`${BASE}/queue`, { method: 'GET', token });
}

// ── Evidence (read) ──────────────────────────────────────────────────────────

/** Mirrors `ConsentRequestEvidence` in `consent-evidence.service.ts`. */
export interface ConsentRequestEvidence {
  id: string;
  actorId: string;
  status: ConsentRequestEvidenceStatus;
  recipientEmail: string;
  editionVersion: string;
  editionHash: string;
  requestedBySub: string;
  requestedByEmail: string | null;
  createdAt: string;
  sentAt: string | null;
  expiresAt: string | null;
  failureReason: string | null;
  respondedAt: string | null;
  respondentName: string | null;
  respondentPosition: string | null;
  respondentEmail: string | null;
  respondentPhone: string | null;
  respondentIp: string | null;
  respondentUserAgent: string | null;
  supersededAt: string | null;
}

/** Mirrors `ConsentDocumentEvidence`. */
export interface ConsentDocumentEvidence {
  id: string;
  actorId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBySub: string;
  uploadedByEmail: string | null;
  createdAt: string;
  storedAt: string | null;
}

export interface ConsentEvidence {
  requests: ConsentRequestEvidence[];
  documents: ConsentDocumentEvidence[];
}

/** `GET /admin/actors/:id/consent-evidence` — requests + documents, newest first. */
export function getActorConsentEvidence(actorId: string, token: string): Promise<ConsentEvidence> {
  return apiFetch<ConsentEvidence>(`/api/v1/admin/actors/${encodeURIComponent(actorId)}/consent-evidence`, {
    method: 'GET',
    token,
  });
}
