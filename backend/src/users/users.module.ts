// @sdd-spec admin/user-management (T-4)
// @sdd-spec auth/account-access-emails (T-4)
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { MailModule } from '../mail/mail.module';

/**
 * T-4 — UsersModule: Admin-only user-management API wrapping the Cognito admin
 * APIs (design §4). The guards are applied per-route via `@UseGuards` and are
 * either zero-dependency (`JwtAuthGuard`) or inject only the globally-provided
 * `Reflector` (`RolesGuard`), so no AuthModule import is required. Registered in
 * `app.module.ts` alongside `AuthModule`/`ActorsModule`.
 *
 * `MailModule` (auth/account-access-emails T-4, design.md §5.3) is imported
 * so Nest can resolve the `MailService` that `UsersService`'s constructor now
 * requires — Nest modules are encapsulated, so an unexported provider from a
 * sibling module is never visible without this import, regardless of both
 * being registered in the same `app.module.ts`. `MailModule` already exports
 * `MailService` (`mail.module.ts`); this is a wiring addition only, not a
 * change to what either module provides.
 */
@Module({
  imports: [MailModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
