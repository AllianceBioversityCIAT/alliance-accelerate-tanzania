/**
 * T-6 — Consent evidence read (FR-13, FR-14, NFR-9; design.md §6).
 *
 * `GET admin/actors/:id/consent-evidence` returns every consent request and
 * every STORED consent document for one actor, newest first. Read-only: this
 * service never writes, so it is not an owner in the §5.8 write-site sweep.
 *
 * - **No `Actor` lookup.** Evidence is retained after the actor is deleted
 *   (no FK, NFR-9), so an unknown or deleted id returns an empty or retained
 *   set rather than a 404 — the `history` precedent.
 * - **Explicit `select`, never `tokenHash`.** The projection names every
 *   field it returns; the hash (and a document's `storageKey`) can never ride
 *   along from a schema addition. The key-set test pins this.
 * - **`EXPIRED` is derived** (B-16), never stored: a `SENT` row whose
 *   `expiresAt` is at or before now reads `EXPIRED`.
 * - Only `STORED` documents are listed: a half-uploaded `PENDING` row is
 *   never evidence (FR-15 "an upload that never completes").
 */

import { Injectable } from '@nestjs/common';
import { ConsentDocumentStatus, ConsentRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type ConsentRequestEvidenceStatus = ConsentRequestStatus | 'EXPIRED';

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

const REQUEST_SELECT = {
  id: true,
  actorId: true,
  status: true,
  recipientEmail: true,
  editionVersion: true,
  editionHash: true,
  requestedBySub: true,
  requestedByEmail: true,
  createdAt: true,
  sentAt: true,
  expiresAt: true,
  failureReason: true,
  respondedAt: true,
  respondentName: true,
  respondentPosition: true,
  respondentEmail: true,
  respondentPhone: true,
  respondentIp: true,
  respondentUserAgent: true,
  supersededAt: true,
} as const;

/** Exported for `ConsentDocumentsService`: confirm returns the same projection the evidence list does (never `storageKey`). */
export const DOCUMENT_SELECT = {
  id: true,
  actorId: true,
  fileName: true,
  contentType: true,
  sizeBytes: true,
  uploadedBySub: true,
  uploadedByEmail: true,
  createdAt: true,
  storedAt: true,
} as const;

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

export function toConsentDocumentEvidence(row: {
  id: string;
  actorId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBySub: string;
  uploadedByEmail: string | null;
  createdAt: Date;
  storedAt: Date | null;
}): ConsentDocumentEvidence {
  return {
    id: row.id,
    actorId: row.actorId,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    uploadedBySub: row.uploadedBySub,
    uploadedByEmail: row.uploadedByEmail,
    createdAt: row.createdAt.toISOString(),
    storedAt: iso(row.storedAt),
  };
}

@Injectable()
export class ConsentEvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  async forActor(actorId: string): Promise<ConsentEvidence> {
    const [requests, documents] = await Promise.all([
      this.prisma.consentRequest.findMany({
        where: { actorId },
        select: REQUEST_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.consentDocument.findMany({
        where: { actorId, status: ConsentDocumentStatus.STORED },
        select: DOCUMENT_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);

    const now = Date.now();
    return {
      requests: requests.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        status:
          row.status === ConsentRequestStatus.SENT &&
          row.expiresAt !== null &&
          row.expiresAt.getTime() <= now
            ? 'EXPIRED'
            : row.status,
        recipientEmail: row.recipientEmail,
        editionVersion: row.editionVersion,
        editionHash: row.editionHash,
        requestedBySub: row.requestedBySub,
        requestedByEmail: row.requestedByEmail,
        createdAt: row.createdAt.toISOString(),
        sentAt: iso(row.sentAt),
        expiresAt: iso(row.expiresAt),
        failureReason: row.failureReason,
        respondedAt: iso(row.respondedAt),
        respondentName: row.respondentName,
        respondentPosition: row.respondentPosition,
        respondentEmail: row.respondentEmail,
        respondentPhone: row.respondentPhone,
        respondentIp: row.respondentIp,
        respondentUserAgent: row.respondentUserAgent,
        supersededAt: iso(row.supersededAt),
      })),
      documents: documents.map(toConsentDocumentEvidence),
    };
  }
}
