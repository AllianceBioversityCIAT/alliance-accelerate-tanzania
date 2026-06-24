import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

/**
 * Auth module (design §4) — JWT verification + RBAC backbone for the API.
 *
 * Exposes the proof endpoints and provides/exports the guards so other modules
 * can apply them per route via `@UseGuards()`. Deliberately registers NO
 * `APP_GUARD`: guards are opt-in so public endpoints stay open (FR-8, ADR
 * "Opt-in guards"). Registered in app.module.ts. The Cognito verifier is a
 * lazily-created module-level singleton (jwt-verifier.ts), not a Nest provider,
 * mirroring how the common PII serializer is a plain import.
 */
@Module({
  controllers: [AuthController],
  providers: [JwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
