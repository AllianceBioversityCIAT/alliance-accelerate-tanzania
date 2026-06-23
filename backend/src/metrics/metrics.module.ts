import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

/**
 * T-6 — MetricsModule: public aggregate metrics for the home page (FR-7).
 *
 * PrismaModule is global (T-1), so the import is for explicitness. Registered in
 * app.module.ts.
 */
@Module({
  imports: [PrismaModule],
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {}
