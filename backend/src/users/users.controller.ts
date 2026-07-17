// @sdd-spec admin/user-management (T-4)
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import {
  UsersService,
  ListUsersResult,
  ResetPasswordResult,
} from './users.service';
import { AdminUser } from './users.serializer';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SetRoleDto } from './dto/set-role.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';

/**
 * T-4 — Admin user-management controller (design §3, §4).
 *
 * Every route is Admin-only: the guard stack mirrors `auth.controller.ts`
 * exactly — `@UseGuards(JwtAuthGuard, RolesGuard)` (JWT verify then RBAC) plus
 * `@Roles('Admin')` — so the server is the authoritative gate (FR-9), never the
 * client `RequireRole`. No global guard, so the public API stays open. All
 * Cognito orchestration, PII/secret allowlisting (FR-10), and self-lockout
 * (FR-8) live in {@link UsersService}; this layer only binds routes to it.
 * Mounted under the global `api/v1` prefix → `/api/v1/users`.
 */
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** `GET /api/v1/users` — paginated user list with group join (FR-1). */
  @Get()
  list(@Query() query: ListUsersQueryDto): Promise<ListUsersResult> {
    return this.usersService.list(query);
  }

  /** `GET /api/v1/users/:id` — single user by Cognito Username/sub (FR-2). */
  @Get(':id')
  get(@Param('id') id: string): Promise<AdminUser> {
    return this.usersService.get(id);
  }

  /** `POST /api/v1/users` — create a user (Cognito email invite) (FR-3). */
  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateUserDto): Promise<AdminUser> {
    return this.usersService.create(dto);
  }

  /** `PATCH /api/v1/users/:id` — update email / enable-disable (FR-4). */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<AdminUser> {
    return this.usersService.update(id, dto);
  }

  /**
   * `PATCH /api/v1/users/:id/role` — set the user's single role (FR-5). The
   * caller's verified `sub` is passed for the FR-8 self-lockout check (an admin
   * cannot demote their own admin access).
   */
  @Patch(':id/role')
  setRole(
    @Param('id') id: string,
    @Body() dto: SetRoleDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AdminUser> {
    return this.usersService.setRole(id, dto.role, user.sub);
  }

  /**
   * `DELETE /api/v1/users/:id` — delete a user (FR-6). The caller's verified
   * `sub` is passed for the FR-8 self-lockout check (an admin cannot delete
   * their own account).
   */
  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.usersService.remove(id, user.sub);
  }

  /**
   * `POST /api/v1/users/:id/password` — trigger a status-aware password reset
   * (FR-7). Returns HTTP 200 with `{ action }`, where the service resolves the
   * action from the target's Cognito status: `'RESET'` (email-based reset for a
   * signed-in user) or `'REINVITE'` (invite resent to a never-signed-in user).
   * `@HttpCode(200)` is explicit — a bare `@Post` would default to 201. No
   * plaintext password is taken or returned.
   */
  @Post(':id/password')
  @HttpCode(200)
  resetPassword(@Param('id') id: string): Promise<ResetPasswordResult> {
    return this.usersService.resetPassword(id);
  }
}
