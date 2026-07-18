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
 * Credential handoff is admin-mediated, NOT email-based: recipients are
 * corporate @cgiar.org inboxes with poor deliverability, so `create` and
 * `resetPassword` suppress all Cognito email, generate a temporary password, and
 * RETURN it once for the admin to share out-of-band. That returned value is a
 * secret — it is never logged, stored, or placed in an error message; it exits
 * ONLY through the Admin-guarded HTTP response body.
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
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  ListUsersCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';

import {
  getCognitoAdminClient,
  getUserPoolId,
} from './cognito-admin.client';
import { mapCognitoError } from './cognito-error.mapper';
import { generateTemporaryPassword } from './temp-password.util';
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
 * Result of {@link UsersService.create}: the serialized user plus the one-time
 * temporary password the admin shares out-of-band. The password is a secret and
 * is returned ONLY in the Admin-guarded create response body.
 */
export interface CreateUserResult {
  user: AdminUser;
  temporaryPassword: string;
}

/**
 * Result of {@link UsersService.resetPassword}: the one-time temporary password
 * the admin shares out-of-band. The password is a secret and is returned ONLY in
 * the Admin-guarded reset response body.
 */
export interface ResetPasswordResult {
  temporaryPassword: string;
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
   * FR-3 — create a user with an admin-mediated credential handoff (no email).
   * A cryptographically-random temporary password is generated and passed to
   * `AdminCreateUser` with `MessageAction: 'SUPPRESS'`, so Cognito sends NO
   * invite email (recipients are @cgiar.org inboxes with poor deliverability).
   * The email attribute is pre-verified so the account is immediately usable.
   * The user is left in `FORCE_CHANGE_PASSWORD` and must change the password at
   * first sign-in. When a role is supplied, the user is added to that group.
   * Returns the serialized user plus the temporary password for the admin to
   * share out-of-band — that password is a secret and is returned only here,
   * never logged or stored.
   */
  async create(dto: CreateUserDto): Promise<CreateUserResult> {
    try {
      const client = getCognitoAdminClient();
      const UserPoolId = getUserPoolId();

      const temporaryPassword = generateTemporaryPassword();

      const created = await client.send(
        new AdminCreateUserCommand({
          UserPoolId,
          Username: dto.email,
          UserAttributes: [
            { Name: 'email', Value: dto.email },
            { Name: 'email_verified', Value: 'true' },
          ],
          TemporaryPassword: temporaryPassword,
          MessageAction: 'SUPPRESS',
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

      return { user: toAdminUser(created.User ?? {}, groups), temporaryPassword };
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
   * FR-7 — reset a user's password via an admin-mediated handoff (no email). A
   * cryptographically-random temporary password is generated and applied with
   * `AdminSetUserPassword` (`Permanent: false`), which moves the user to
   * `FORCE_CHANGE_PASSWORD` regardless of their prior state (works for both
   * `CONFIRMED` and never-signed-in users), so they must change it at next
   * sign-in. Cognito sends NO email; the temporary password is returned once for
   * the admin to share out-of-band. That password is a secret — returned only
   * here, never logged or stored.
   */
  async resetPassword(id: string): Promise<ResetPasswordResult> {
    try {
      const client = getCognitoAdminClient();
      const UserPoolId = getUserPoolId();

      const temporaryPassword = generateTemporaryPassword();

      await client.send(
        new AdminSetUserPasswordCommand({
          UserPoolId,
          Username: id,
          Password: temporaryPassword,
          Permanent: false,
        }),
      );

      return { temporaryPassword };
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
