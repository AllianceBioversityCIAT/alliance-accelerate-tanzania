import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { CurrentUser } from './current-user.decorator';
import { AuthUser, Role } from './auth.types';

/**
 * Auth proof endpoints (FR-7) closing the verify + RBAC loop. Mounted under the
 * global `api/v1` prefix. Both guards are opt-in per route (no global guard —
 * FR-8), so the public API is unaffected.
 */
@Controller('auth')
export class AuthController {
  /**
   * `GET /api/v1/auth/me` — the caller's own verified identity + role for any
   * valid token. Returns only the caller's own Cognito attributes (self), so
   * echoing their own email is not a PII-boundary breach (NFR-3).
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser): {
    sub: string;
    username: string;
    email?: string;
    role: Role;
    groups: string[];
  } {
    return {
      sub: user.sub,
      username: user.username,
      email: user.email,
      role: user.role,
      groups: user.groups,
    };
  }

  /**
   * `GET /api/v1/auth/protected` — Staff-guarded probe (Admin ≥ Staff). Proves
   * the RBAC path: `401` without a valid token, `403` for an authenticated but
   * under-privileged caller.
   */
  @Get('protected')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Staff')
  protected(@CurrentUser() user: AuthUser): { ok: true; role: Role } {
    return { ok: true, role: user.role };
  }
}
