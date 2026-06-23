import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { ActorsModule } from './actors/actors.module';
import { MetricsModule } from './metrics/metrics.module';

/**
 * Root module. T-1 scaffold + T-5 public Actors API + T-6 public Metrics API.
 * Import module arrives in T-8.
 */
@Module({
  imports: [PrismaModule, ActorsModule, MetricsModule],
  controllers: [HealthController],
})
export class AppModule {}
