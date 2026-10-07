import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ActingAdminResolver } from '../actors/acting-admin.resolver';
import { ActorAuditService } from '../actors/actor-audit.service';
import { MailModule } from '../mail/mail.module';
import { ConsentSupersessionModule } from './consent-supersession.module';
import { ConsentDocumentsService } from './consent-documents.service';
import { ConsentEvidenceService } from './consent-evidence.service';
import { DOCUMENT_STORAGE } from './document-storage';
import { createDocumentStorage } from './document-storage.factory';
import { ConsentRequestsService } from './consent-requests.service';
import { AdminConsentRequestsController } from './admin-consent-requests.controller';
import { ConsentPublicController } from './consent-public.controller';
import { ConsentPublicService } from './consent-public.service';
import { ConsentThrottleGuard } from './consent-throttle.guard';

/**
 * T-3 — `ConsentRequestsModule` (design.md §3, §5.5). Registered in
 * `app.module.ts`.
 *
 * It re-provides `ActingAdminResolver` and `ActorAuditService` — the
 * `RegistrationsModule` precedent — rather than importing `ActorsModule`
 * wholesale: `ActorsModule` already provides both but exports neither, and
 * both classes have no constructor dependencies of their own, so a second
 * instance costs at most one extra Cognito `ListUsers` call per container,
 * never a correctness issue. This keeps the dependency graph one-way —
 * `ActorsModule` imports `ConsentSupersessionModule`, THIS module also
 * imports it, and neither module imports the other, so no cycle and no
 * `forwardRef` is ever needed.
 *
 * T-4 — `MailModule` is imported explicitly (the `RegistrationsModule`/
 * `ContactModule`/`UsersModule` precedent — `MailModule` is NOT global) so
 * `ConsentRequestsService.dispatch` can inject `MailService`.
 * `ActorAuditService`'s first caller is now `dispatch`'s
 * `logConsentRequested` (the `CONSENT_REQUESTED` row) — it was wired in at
 * T-3 ahead of this, per design.md §5.5's module-wiring note, so this task
 * needs no further module edit for it.
 *
 * T-5 — `ConsentPublicController` (the two public, token-bearer routes) and
 * `ConsentPublicService` join, with `ConsentThrottleGuard` listed as a
 * provider the way `RegistrationsModule` lists its throttle guard. This
 * module still does NOT call `ThrottlerModule.forRoot` (P-31): the single
 * global registration lives in `RegistrationsModule` (the `ContactModule`
 * precedent), and a second one would create competing tokens.
 *
 * T-7 — `ConsentDocumentsService` and the `DOCUMENT_STORAGE` port join; the
 * factory picks the S3 or unconfigured adapter from `CONSENT_DOCUMENTS_BUCKET`
 * once, at module init (design.md §5.6).
 */
@Module({
  imports: [PrismaModule, ConsentSupersessionModule, MailModule],
  controllers: [AdminConsentRequestsController, ConsentPublicController],
  providers: [
    ConsentRequestsService,
    ConsentPublicService,
    ConsentEvidenceService,
    ConsentDocumentsService,
    { provide: DOCUMENT_STORAGE, useFactory: () => createDocumentStorage() },
    ConsentThrottleGuard,
    ActingAdminResolver,
    ActorAuditService,
  ],
  exports: [ConsentRequestsService],
})
export class ConsentRequestsModule {}
