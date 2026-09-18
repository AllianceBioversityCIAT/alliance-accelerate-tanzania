import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { ActorsModule } from './actors/actors.module';
import { MetricsModule } from './metrics/metrics.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RegistrationsModule } from './registrations/registrations.module';
import { ContactModule } from './contact/contact.module';

/**
 * Root module. T-1 scaffold + T-5 public Actors API + T-6 public Metrics API +
 * AuthModule (Cognito JWT/RBAC backbone — opt-in guards, NO global guard so the
 * public API stays open) + T-4 admin UsersModule (Admin-only, @Roles('Admin')).
 * Import module arrives in T-8. RegistrationsModule (public-self-registration
 * T-2) adds the public self-registration surface — currently just the
 * consent-policy endpoint. ContactModule (contact/contact-channels T-6) adds
 * the public `POST /contact` endpoint; it relies on `RegistrationsModule`'s
 * single `ThrottlerModule.forRoot(...)` registration (`@Global()`) and does
 * not register its own (see `contact.module.ts`'s docblock).
 */
@Module({
  imports: [
    PrismaModule,
    ActorsModule,
    MetricsModule,
    AuthModule,
    UsersModule,
    RegistrationsModule,
    ContactModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
