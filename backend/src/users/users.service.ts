// @sdd-spec admin/user-management (T-3)
/**
 * T-3 — Cognito admin orchestration service (design §3, §4, §6).
 *
 * The ONLY Cognito caller: every method issues the Admin command(s) from the
 * design §3 endpoint→Cognito table, projects raw output through {@link toAdminUser}
 * (the FR-10 allowlist serializer), and funnels SDK failures through
 * {@link mapCognitoError} so no Cognito internal or secret leaks. No Prisma —
 * Cognito is the single source of truth (no user table). Self-lockout (FR-8) is
 * enforced BEFORE any Cognito call in `setRole`/`remove`, and those
 * `HttpException`s are rethrown unchanged rather than mapped.
 *
 * No plaintext password is ever sent, returned, or logged — `create` relies on
 * Cognito's email invite (`DesiredDeliveryMediums: ['EMAIL']`, FR-3/OQ-4) and
 * `resetPassword` uses the email-based `AdminResetUserPassword` (OQ-2).
 *
 * Design refs: design.md §3 (API/Cognito map), §4 (service), §6 (no leakage,
 * anti-lockout). Requirements: FR-1..FR-8, FR-10.
 */

import { ConflictException, Injectable } from '@nestjs/common';
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminResetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  ListUsersCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';

import {
  getCognitoAdminClient,
  getUserPoolId,
} from './cognito-admin.client';
import { mapCognitoError } from './cognito-error.mapper';
import { AdminUser, toAdminUser } from './users.serializer';
import { ASSIGNABLE_ROLES, SettableRole } from './users.constants';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';

/** The list response: a page of users plus the opaque next-page token (design §3). */
export interface ListUsersResult {
  users: AdminUser[];
  paginationToken?: string;
}

/**
 * Outcome of {@link UsersService.resetPassword}: `REINVITE` when the invite was
 * resent to a never-signed-in user, `RESET` when a password reset was triggered.
 */
export interface ResetPasswordResult {
  action: 'RESET' | 'REINVITE';
}

@Injectable()
export class UsersService {
  /**
   * FR-1 — paginated user list with per-user group join. Issues `ListUsers`,
   * then `AdminListGroupsForUser` per returned user, and serializes each with
   * its group names. Returns the next `PaginationToken` when Cognito supplies
   * one. Bounded by `limit` (≤60) per design DR-6.
   */
  async list(query: ListUsersQueryDto): Promise<ListUsersResult> {
    try {
      const client = getCognitoAdminClient();
      const UserPoolId = getUserPoolId();

      const page = await client.send(
        new ListUsersCommand({
          UserPoolId,
          Limit: query.limit,
          PaginationToken: query.paginationToken,
        }),
      );

      const rawUsers: UserType[] = page.Users ?? [];
      const users = await Promise.all(
        rawUsers.map(async (user) => {
          const groups = await this.listGroupNames(user.Username);
          return toAdminUser(user, groups);
        }),
      );

      return {
        users,
        paginationToken: page.PaginationToken,
      };
    } catch (err) {
      mapCognitoError(err);
    }
  }

  /**
   * FR-2 — single user by id (Cognito Username/sub) plus group join.
   * `AdminGetUserCommandOutput` exposes `UserAttributes` (not `Attributes`) and
   * does not echo `Username`, so its output is adapted to the serializer's
   * `SerializableCognitoUser` shape before projection.
   */
  async get(id: string): Promise<AdminUser> {
    try {
      const client = getCognitoAdminClient();
      const UserPoolId = getUserPoolId();

      const detail = await client.send(
        new AdminGetUserCommand({ UserPoolId, Username: id }),
      );
      const groups = await this.listGroupNames(id);

      return toAdminUser(
        {
          Username: id,
          Attributes: detail.UserAttributes,
          UserStatus: detail.UserStatus,
          Enabled: detail.Enabled,
          UserCreateDate: detail.UserCreateDate,
          UserLastModifiedDate: detail.UserLastModifiedDate,
        },
        groups,
      );
    } catch (err) {
      mapCognitoError(err);
    }
  }

  /**
   * FR-3 — create a user. Cognito emails the invite
   * (`DesiredDeliveryMediums: ['EMAIL']`, no admin plaintext); email is
   * pre-verified so the account is immediately usable. When a role is supplied,
   * the user is added to that group. The created user is serialized directly
   * with `roles = [dto.role]` (or `[]`).
   */
  async create(dto: CreateUserDto): Promise<AdminUser> {
    try {
      const client = getCognitoAdminClient();
      const UserPoolId = getUserPoolId();

      const created = await client.send(
        new AdminCreateUserCommand({
          UserPoolId,
          Username: dto.email,
          UserAttributes: [
            { Name: 'email', Value: dto.email },
            { Name: 'email_verified', Value: 'true' },
          ],
          DesiredDeliveryMediums: ['EMAIL'],
        }),
      );

      const groups: string[] = [];
      if (dto.role) {
        await client.send(
          new AdminAddUserToGroupCommand({
            UserPoolId,
            Username: created.User?.Username ?? dto.email,
            GroupName: dto.role,
          }),
        );
        groups.push(dto.role);
      }

      return toAdminUser(created.User ?? {}, groups);
    } catch (err) {
      mapCognitoError(err);
    }
  }

  /**
   * FR-4 — update mutable attributes. Sets the email attribute when supplied;
   * enables/disables the account when `enabled` is provided. Returns the fresh
   * canonical view via {@link get}.
   */
  async update(id: string, dto: UpdateUserDto): Promise<AdminUser> {
    try {
      const client = getCognitoAdminClient();
      const UserPoolId = getUserPoolId();

      if (dto.email) {
        await client.send(
          new AdminUpdateUserAttributesCommand({
            UserPoolId,
            Username: id,
            UserAttributes: [{ Name: 'email', Value: dto.email }],
          }),
        );
      }

      if (dto.enabled !== undefined) {
        await client.send(
          dto.enabled
            ? new AdminEnableUserCommand({ UserPoolId, Username: id })
            : new AdminDisableUserCommand({ UserPoolId, Username: id }),
        );
      }
    } catch (err) {
      mapCognitoError(err);
    }

    return this.get(id);
  }

  /**
   * FR-5/FR-8 — set a user's single role. Self-lockout: an admin cannot demote
   * themselves (any role other than `admin` for their own `sub`) — throws 409
   * BEFORE any Cognito call. Otherwise the user is removed from BOTH assignable
   * groups (idempotent — not-in-group errors are ignored) and, unless the target
   * is `none`, added to the target group. Returns the fresh view via {@link get}.
   */
  async setRole(
    id: string,
    role: SettableRole,
    callerSub: string,
  ): Promise<AdminUser> {
    if (id === callerSub && role !== 'admin') {
      throw new ConflictException('You cannot remove your own admin access.');
    }

    try {
      const client = getCognitoAdminClient();
      const UserPoolId = getUserPoolId();

      for (const group of ASSIGNABLE_ROLES) {
        await this.removeFromGroupIfPresent(id, group);
      }

      if (role !== 'none') {
        await client.send(
          new AdminAddUserToGroupCommand({
            UserPoolId,
            Username: id,
            GroupName: role,
          }),
        );
      }
    } catch (err) {
      mapCognitoError(err);
    }

    return this.get(id);
  }

  /**
   * FR-6/FR-8 — delete a user. Self-lockout: an admin cannot delete their own
   * account — throws 409 BEFORE any Cognito call.
   */
  async remove(id: string, callerSub: string): Promise<void> {
    if (id === callerSub) {
      throw new ConflictException('You cannot delete your own account.');
    }

    try {
      const client = getCognitoAdminClient();
      const UserPoolId = getUserPoolId();

      await client.send(
        new AdminDeleteUserCommand({ UserPoolId, Username: id }),
      );
    } catch (err) {
      mapCognitoError(err);
    }
  }

  /**
   * FR-7 — status-aware password reset / re-invite. First reads the user's
   * `UserStatus` (`AdminGetUser`) using the route-param id (sub/UUID), then:
   *  - `FORCE_CHANGE_PASSWORD` (never signed in): resends the Cognito invite via
   *    `AdminCreateUser` with `MessageAction: 'RESEND'` (Username = the same
   *    validated id, never the email alias) → `{ action: 'REINVITE' }`.
   *  - otherwise (`CONFIRMED` / `RESET_REQUIRED` / default): triggers the
   *    email-based `AdminResetUserPassword` → `{ action: 'RESET' }`.
   * No plaintext password is generated, returned, or logged (NFR-1).
   */
  async resetPassword(id: string): Promise<ResetPasswordResult> {
    try {
      const client = getCognitoAdminClient();
      const UserPoolId = getUserPoolId();

      const detail = await client.send(
        new AdminGetUserCommand({ UserPoolId, Username: id }),
      );

      if (detail.UserStatus === 'FORCE_CHANGE_PASSWORD') {
        await client.send(
          new AdminCreateUserCommand({
            UserPoolId,
            Username: id,
            MessageAction: 'RESEND',
            DesiredDeliveryMediums: ['EMAIL'],
          }),
        );
        return { action: 'REINVITE' };
      }

      await client.send(
        new AdminResetUserPasswordCommand({ UserPoolId, Username: id }),
      );
      return { action: 'RESET' };
    } catch (err) {
      mapCognitoError(err);
    }
  }

  /** Resolve the group names a user belongs to (`AdminListGroupsForUser`). */
  private async listGroupNames(username: string | undefined): Promise<string[]> {
    if (!username) return [];

    const client = getCognitoAdminClient();
    const UserPoolId = getUserPoolId();

    const result = await client.send(
      new AdminListGroupsForUserCommand({ UserPoolId, Username: username }),
    );

    return (result.Groups ?? [])
      .map((group) => group.GroupName)
      .filter((name): name is string => typeof name === 'string');
  }

  /**
   * Remove a user from a group, swallowing the "not in group" outcome so
   * `setRole` can unconditionally clear both assignable groups (idempotent).
   * Any other failure propagates to the caller's `mapCognitoError`.
   */
  private async removeFromGroupIfPresent(
    username: string,
    group: string,
  ): Promise<void> {
    const client = getCognitoAdminClient();
    const UserPoolId = getUserPoolId();

    try {
      await client.send(
        new AdminRemoveUserFromGroupCommand({
          UserPoolId,
          Username: username,
          GroupName: group,
        }),
      );
    } catch (err) {
      // Removing a user that is not in the group is a no-op for our purposes;
      // rethrow anything else so the caller can map it.
      if (!isNotInGroupError(err)) {
        throw err;
      }
    }
  }
}

/**
 * True when the error means the user simply was not in the group — Cognito
 * surfaces this as an `InvalidParameterException`/`UserNotFoundException` on
 * remove; treated as already-removed so role clearing stays idempotent.
 */
function isNotInGroupError(err: unknown): boolean {
  if (typeof err === 'object' && err !== null && 'name' in err) {
    const { name } = err as { name?: unknown };
    return name === 'InvalidParameterException';
  }
  return false;
}
