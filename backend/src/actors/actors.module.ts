import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ActorsController } from './actors.controller';
import { ActorsService } from './actors.service';
import { ActorsAdminService } from './actors-admin.service';

/**
 * T-5 / T-2 — ActorsModule: public read API + Admin-only actor operations.
 *
 * PrismaModule is global (T-1), so the import is for explicitness; the common
 * PII/consent policy + serializer are pure functions imported directly, not Nest
 * providers, so no CommonModule wiring is needed. Registered in app.module.ts.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ActorsController],
  providers: [ActorsService, ActorsAdminService],
})
export class ActorsModule {}
