import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ActorsController } from './actors.controller';
import { ActorsService } from './actors.service';

/**
 * T-5 — ActorsModule: public read API for the actor directory (FR-6).
 *
 * PrismaModule is global (T-1), so the import is for explicitness; the common
 * PII/consent policy + serializer are pure functions imported directly, not Nest
 * providers, so no CommonModule wiring is needed. Registered in app.module.ts.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ActorsController],
  providers: [ActorsService],
})
export class ActorsModule {}
