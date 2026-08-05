import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { ActorsModule } from './actors/actors.module';
import { MetricsModule } from './metrics/metrics.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RegistrationsModule } from './registrations/registrations.module';

/**
 * Root module. T-1 scaffold + T-5 public Actors API + T-6 public Metrics API +
 * AuthModule (Cognito JWT/RBAC backbone — opt-in guards, NO global guard so the
 * public API stays open) + T-4 admin UsersModule (Admin-only, @Roles('Admin')).
 * Import module arrives in T-8. RegistrationsModule (public-self-registration
 * T-2) adds the public self-registration surface — currently just the
 * consent-policy endpoint.
 */
@Module({
  imports: [
    PrismaModule,
    ActorsModule,
    MetricsModule,
    AuthModule,
    UsersModule,
    RegistrationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
