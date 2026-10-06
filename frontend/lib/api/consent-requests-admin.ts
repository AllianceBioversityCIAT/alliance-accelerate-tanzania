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

/** Mirrors `ConsentDispatchFailureReason` on the backend (non-PII, coarse). */
export type ConsentDispatchFailureReason = 'transport_rejected' | 'timeout';

export interface ConsentDispatchFailure {
  actorId: string;
  traderName: string;
  reason: ConsentDispatchFailureReason;
}

export interface ConsentRequestDispatchResult {
  sent: number;
  failed: number;
  remaining: number;
  /** The rows this step marked FAILED; `failed === failures.length`. */
  failures: ConsentDispatchFailure[];
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

// ── Edition text ("Read exact text") ─────────────────────────────────────────

/** Mirrors `AdminConsentEdition` in `backend/src/consent-requests/admin-consent-policy.ts`. */
export interface AdminConsentEdition {
  version: string;
  issuedAt: string;
  sections: ReadonlyArray<{ heading: string; body: string }>;
  acceptanceStatement: string;
}

/** `GET /admin/consent-editions/:version` — the exact text a request was sent under (FR-14). */
export function getConsentEdition(version: string, token: string): Promise<AdminConsentEdition> {
  return apiFetch<AdminConsentEdition>(`/api/v1/admin/consent-editions/${encodeURIComponent(version)}`, {
    method: 'GET',
    token,
  });
}

// ── Consent documents (FR-15, FR-16) ─────────────────────────────────────────

/** Mirrors `CONSENT_DOCUMENT_CONTENT_TYPES` / `CONSENT_DOCUMENT_MAX_BYTES` in `document-storage.ts`. */
export const CONSENT_DOCUMENT_CONTENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export type ConsentDocumentContentType = (typeof CONSENT_DOCUMENT_CONTENT_TYPES)[number];
export const CONSENT_DOCUMENT_MAX_BYTES = 10_485_760;

/** `GET /admin/consent-documents/status`. `enabled` is false on the local stack (P-19). */
export interface ConsentDocumentStatus {
  enabled: boolean;
}

/** `ConsentDocumentUploadUrlDto`. */
export interface ConsentDocumentUploadUrlBody {
  fileName: string;
  contentType: ConsentDocumentContentType;
  sizeBytes: number;
}

/** `ConsentDocumentUploadUrl` in `consent-documents.service.ts` — a presigned POST. */
export interface ConsentDocumentUploadUrl {
  documentId: string;
  url: string;
  fields: Record<string, string>;
}

/** `GET …/download-url`. */
export interface ConsentDocumentDownloadUrl {
  url: string;
  expiresAt: string;
}

export function getConsentDocumentStatus(token: string): Promise<ConsentDocumentStatus> {
  return apiFetch<ConsentDocumentStatus>('/api/v1/admin/consent-documents/status', { method: 'GET', token });
}

/** `POST /admin/actors/:id/consent-documents/upload-url` — `503` when storage is unconfigured. */
export function requestConsentDocumentUpload(
  actorId: string,
  body: ConsentDocumentUploadUrlBody,
  token: string,
): Promise<ConsentDocumentUploadUrl> {
  return apiFetch<ConsentDocumentUploadUrl>(
    `/api/v1/admin/actors/${encodeURIComponent(actorId)}/consent-documents/upload-url`,
    { method: 'POST', token, body },
  );
}

/** `POST /admin/consent-documents/:docId/confirm` — promotes the upload; `422` on a size/type mismatch. */
export function confirmConsentDocument(documentId: string, token: string): Promise<ConsentDocumentEvidence> {
  return apiFetch<ConsentDocumentEvidence>(
    `/api/v1/admin/consent-documents/${encodeURIComponent(documentId)}/confirm`,
    { method: 'POST', token },
  );
}

/** `GET /admin/consent-documents/:docId/download-url` — presigned GET, valid 5 minutes (FR-16). */
export function getConsentDocumentDownloadUrl(
  documentId: string,
  token: string,
): Promise<ConsentDocumentDownloadUrl> {
  return apiFetch<ConsentDocumentDownloadUrl>(
    `/api/v1/admin/consent-documents/${encodeURIComponent(documentId)}/download-url`,
    { method: 'GET', token },
  );
}

/** Why a file was refused before any network call (FR-15 "wrong type or size"). */
export type ConsentDocumentRejection = 'type' | 'size' | 'empty';

/**
 * Client-side type/size check (UX only — storage enforces both again).
 * Returns the rejection reason, or `null` when the file may be uploaded.
 */
export function checkConsentDocumentFile(file: Pick<File, 'type' | 'size'>): ConsentDocumentRejection | null {
  if (!(CONSENT_DOCUMENT_CONTENT_TYPES as readonly string[]).includes(file.type)) return 'type';
  if (file.size < 1) return 'empty';
  if (file.size > CONSENT_DOCUMENT_MAX_BYTES) return 'size';
  return null;
}

/**
 * The whole attach sequence for one file: upload-url → browser POST straight
 * to the presigned URL (`fields` first, the file LAST as `file`; no
 * Authorization header — the policy is the credential) → confirm.
 *
 * Callers run this only AFTER the actor exists. Throws on any step; a failure
 * before `confirm` leaves a `PENDING` row that is never listed (FR-15).
 */
export async function uploadConsentDocument(
  actorId: string,
  file: File,
  token: string,
): Promise<ConsentDocumentEvidence> {
  const rejection = checkConsentDocumentFile(file);
  if (rejection) throw new Error(`File rejected: ${rejection}`);

  const target = await requestConsentDocumentUpload(
    actorId,
    {
      fileName: file.name,
      contentType: file.type as ConsentDocumentContentType,
      sizeBytes: file.size,
    },
    token,
  );

  const form = new FormData();
  for (const [name, value] of Object.entries(target.fields)) form.append(name, value);
  form.append('file', file);
  const stored = await fetch(target.url, { method: 'POST', body: form });
  if (!stored.ok) throw new Error(`Upload to storage failed (HTTP ${stored.status}).`);

  return confirmConsentDocument(target.documentId, token);
}
