// @sdd-spec admin/user-management (T-4)
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * T-4 — UsersModule: Admin-only user-management API wrapping the Cognito admin
 * APIs (design §4). The guards are applied per-route via `@UseGuards` and are
 * either zero-dependency (`JwtAuthGuard`) or inject only the globally-provided
 * `Reflector` (`RolesGuard`), so no AuthModule import is required. Registered in
 * `app.module.ts` alongside `AuthModule`/`ActorsModule`.
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
