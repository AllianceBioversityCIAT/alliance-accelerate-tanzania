import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';

/**
 * Root module. T-1 scaffold: Prisma wiring + health only.
 * Actors/Metrics/Common(serializer)/Import modules arrive in T-2..T-8.
 */
@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
})
export class AppModule {}
