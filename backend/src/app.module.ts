import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { ActorsModule } from './actors/actors.module';

/**
 * Root module. T-1 scaffold + T-5 public Actors API.
 * Metrics/Import modules arrive in T-6/T-8.
 */
@Module({
  imports: [PrismaModule, ActorsModule],
  controllers: [HealthController],
})
export class AppModule {}
