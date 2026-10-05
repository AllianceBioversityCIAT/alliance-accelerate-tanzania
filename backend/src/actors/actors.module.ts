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

/**
 * T-5 / T-2 / T-3 — ActorsModule: public read API + Admin-only actor operations.
 *
 * PrismaModule is global (T-1), so the import is for explicitness; the common
 * PII/consent policy + serializer are pure functions imported directly, not Nest
 * providers, so no CommonModule wiring is needed. Registered in app.module.ts.
 */
@Module({
  imports: [PrismaModule],
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
