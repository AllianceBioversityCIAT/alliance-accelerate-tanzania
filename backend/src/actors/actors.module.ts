import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ActorsController } from './actors.controller';
import { ActorsService } from './actors.service';
import { ActorsAdminService } from './actors-admin.service';
import { AdminActorsController } from './admin-actors.controller';
import { ActingAdminResolver } from './acting-admin.resolver';
import { ActorAuditService } from './actor-audit.service';
import { ActorImportService } from './actor-import.service';
import { IntakeDuplicateService } from './intake-duplicate.service';
import { ConsentSupersessionModule } from '../consent-requests/consent-supersession.module';

/**
 * T-5 / T-2 / T-3 — ActorsModule: public read API + Admin-only actor operations.
 *
 * PrismaModule is global (T-1), so the import is for explicitness; the common
 * PII/consent policy + serializer are pure functions imported directly, not Nest
 * providers, so no CommonModule wiring is needed. Registered in app.module.ts.
 *
 * `actors/consent-intake/consent-request-email` T-3 (design.md §5.5, P-30) —
 * imports `ConsentSupersessionModule` ONE-WAY so `ActorsAdminService` can
 * supersede pending consent requests from inside its own `update`/
 * `bulkSetConsent`/`remove`/`bulkDelete` transactions. `ConsentRequestsModule`
 * never imports THIS module (no cycle, no `forwardRef`).
 */
@Module({
  imports: [PrismaModule, ConsentSupersessionModule],
  controllers: [ActorsController, AdminActorsController],
  providers: [
    ActorsService,
    ActorsAdminService,
    ActingAdminResolver,
    ActorAuditService,
    ActorImportService,
    // T-3 — depends only on PrismaService (design.md §4.3, P-11); the
    // registration queue's DuplicateDetectionService is deliberately NOT
    // added here — only its exported pure functions are imported.
    IntakeDuplicateService,
  ],
})
export class ActorsModule {}
