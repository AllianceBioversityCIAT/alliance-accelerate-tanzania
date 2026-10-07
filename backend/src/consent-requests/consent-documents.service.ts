/**
 * actors/consent-intake/consent-request-email T-7 — consent document upload,
 * confirm and download (FR-13, FR-15, FR-16, NFR-8; design.md §5.6).
 *
 * - **Upload never changes the actor.** Nothing here writes the `Actor` table:
 *   the file is evidence, still the admin's assertion, so the existing
 *   acknowledgement gate keeps governing any move to `GRANTED` (FR-15).
 * - **Presigned POST, then confirm-and-promote** (DD-8): the signed policy
 *   bounds size and type in storage; `confirm` re-checks them with
 *   `HeadObject`, so a half-uploaded or tampered object is never listed.
 * - **Confirm order is copy, then one transaction (STORED + audit), then
 *   delete `incoming/`.** A failure before the transaction leaves the
 *   `PENDING` row retryable; a failed final delete is only logged, because the
 *   bucket lifecycle rule removes `incoming/` objects after a day.
 * - **No Actor read at confirm** (P-28): the audit row comes from the
 *   document's own upload-time snapshot, so a deleted actor's evidence is
 *   still stored and trailed.
 */

import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConsentDocumentStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ActingAdminResolver } from '../actors/acting-admin.resolver';
import { ActorAuditService } from '../actors/actor-audit.service';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentDocumentUploadUrlDto } from './dto/consent-document-upload-url.dto';
import {
  ConsentDocumentEvidence,
  DOCUMENT_SELECT,
  toConsentDocumentEvidence,
} from './consent-evidence.service';
import { DOCUMENT_STORAGE, DocumentStorage, incomingKey, storedKey } from './document-storage';

export interface ConsentDocumentUploadUrl {
  documentId: string;
  url: string;
  fields: Record<string, string>;
}

/** `application/pdf; charset=x` → `application/pdf`. */
const normalizeContentType = (value: string | null): string | null =>
  value === null ? null : value.split(';')[0].trim().toLowerCase();

@Injectable()
export class ConsentDocumentsService {
  private readonly logger = new Logger(ConsentDocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
    private readonly actingAdminResolver: ActingAdminResolver,
    private readonly actorAuditService: ActorAuditService,
  ) {}

  status(): { enabled: boolean } {
    return { enabled: this.storage.enabled };
  }

  async createUploadUrl(
    actorId: string,
    dto: ConsentDocumentUploadUrlDto,
    user: AuthUser,
  ): Promise<ConsentDocumentUploadUrl> {
    this.assertEnabled();

    const actor = await this.prisma.actor.findUnique({
      where: { id: actorId },
      select: { id: true, traderId: true, traderName: true },
    });
    if (!actor) {
      throw new NotFoundException(`Actor ${actorId} not found`);
    }

    const email = await this.actingAdminResolver.resolve(user.sub);
    const documentId = randomUUID();
    const key = incomingKey(documentId);

    // The snapshot feeds the confirm-time audit row even if the actor is
    // deleted in between (P-28). The row is PENDING and never listed.
    await this.prisma.consentDocument.create({
      data: {
        id: documentId,
        actorId: actor.id,
        traderId: actor.traderId,
        traderName: actor.traderName,
        status: ConsentDocumentStatus.PENDING,
        fileName: dto.fileName,
        contentType: dto.contentType,
        sizeBytes: dto.sizeBytes,
        storageKey: key,
        uploadedBySub: user.sub,
        uploadedByEmail: email ?? null,
      },
    });

    const { url, fields } = await this.storage.presignUpload({ key, contentType: dto.contentType });
    return { documentId, url, fields };
  }

  async confirm(documentId: string, user: AuthUser): Promise<ConsentDocumentEvidence> {
    const doc = await this.prisma.consentDocument.findUnique({ where: { id: documentId } });
    if (!doc) {
      throw new NotFoundException(`Consent document ${documentId} not found`);
    }
    if (doc.status === ConsentDocumentStatus.STORED) {
      return toConsentDocumentEvidence(doc);
    }
    this.assertEnabled();

    const incoming = doc.storageKey;
    const destination = storedKey(doc.actorId, doc.id);
    try {
      const head = await this.storage.head(incoming);
      if (!head) {
        throw new UnprocessableEntityException('No uploaded file was found for this document');
      }
      if (head.sizeBytes !== doc.sizeBytes || normalizeContentType(head.contentType) !== doc.contentType) {
        await this.storage.remove(incoming);
        throw new UnprocessableEntityException('The uploaded file does not match the declared size or type');
      }
      await this.storage.copy(incoming, destination);
    } catch (err) {
      // A concurrent confirm may have won and already moved the object out of
      // incoming/, so this caller's head or copy finds nothing. If the row is
      // STORED by now, that is success, not a failure (design.md §5.6).
      const current = await this.prisma.consentDocument.findUnique({ where: { id: doc.id } });
      if (current?.status === ConsentDocumentStatus.STORED) {
        return toConsentDocumentEvidence(current);
      }
      throw err;
    }

    const email = await this.actingAdminResolver.resolve(user.sub);
    const stored = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const claimed = await tx.consentDocument.updateMany({
        where: { id: doc.id, status: ConsentDocumentStatus.PENDING },
        data: { status: ConsentDocumentStatus.STORED, storedAt: new Date(), storageKey: destination },
      });
      if (claimed.count === 1) {
        await this.actorAuditService.logConsentDocumentUploaded(tx, {
          document: doc,
          acting: { sub: user.sub, email },
        });
      }
      return tx.consentDocument.findUnique({ where: { id: doc.id }, select: DOCUMENT_SELECT });
    });

    try {
      await this.storage.remove(incoming);
    } catch (err) {
      this.logger.warn(`Could not delete ${incoming} after promotion; the lifecycle rule will remove it: ${String(err)}`);
    }

    if (!stored) {
      throw new NotFoundException(`Consent document ${documentId} not found`);
    }
    return toConsentDocumentEvidence(stored);
  }

  async downloadUrl(documentId: string): Promise<{ url: string; expiresAt: string }> {
    const doc = await this.prisma.consentDocument.findUnique({ where: { id: documentId } });
    // A PENDING row is not evidence (FR-15), so it has no download.
    if (!doc || doc.status !== ConsentDocumentStatus.STORED) {
      throw new NotFoundException(`Consent document ${documentId} not found`);
    }
    this.assertEnabled();
    return this.storage.presignDownload({ key: doc.storageKey, fileName: doc.fileName });
  }

  private assertEnabled(): void {
    if (!this.storage.enabled) {
      throw new ServiceUnavailableException('Consent document storage is not configured');
    }
  }
}
