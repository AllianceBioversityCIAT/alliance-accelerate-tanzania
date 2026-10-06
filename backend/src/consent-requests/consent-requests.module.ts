import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ActingAdminResolver } from '../actors/acting-admin.resolver';
import { ActorAuditService } from '../actors/actor-audit.service';
import { ConsentSupersessionModule } from './consent-supersession.module';
import { ConsentRequestsService } from './consent-requests.service';
import { AdminConsentRequestsController } from './admin-consent-requests.controller';

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
 * `ActorAuditService` is not yet called from this module's own code (T-3
 * writes no `CONSENT_REQUESTED` audit row — that is `dispatch`'s job, T-4)
 * but is wired in now per design.md §5.5's module-wiring note, so T-4 needs
 * no further module edit to use it.
 */
@Module({
  imports: [PrismaModule, ConsentSupersessionModule],
  controllers: [AdminConsentRequestsController],
  providers: [ConsentRequestsService, ActingAdminResolver, ActorAuditService],
  exports: [ConsentRequestsService],
})
export class ConsentRequestsModule {}
