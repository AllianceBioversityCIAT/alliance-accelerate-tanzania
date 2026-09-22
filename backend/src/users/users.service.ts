// @sdd-spec admin/user-management (T-3)
// @sdd-spec auth/account-access-emails (T-4, T-5)
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
 * Credential handoff combines an admin-mediated fallback with an emailed
 * invitation. **The premise this section used to rest on — that Cognito
 * mail is unusable for corporate `@cgiar.org` inboxes, so email must never
 * be sent — no longer holds** (`backend/CLAUDE.md`'s "Users module —
 * no-email credential handoff" section carries the dated superseded-by
 * note; `auth/account-access-emails` design.md §2 is the record of what
 * changed: a working channel, `MailService`'s microservice transport,
 * already exists). `create()` dispatches an invitation email itself
 * (auth/account-access-emails T-4, design.md §5.3); `AdminCreateUser`
 * still runs with `MessageAction: 'SUPPRESS'`, which was always about
 * suppressing Cognito's OWN poorly-deliverable mailer, never about
 * avoiding email as a channel altogether. `resetPassword()` now dispatches
 * its own admin-reset email (auth/account-access-emails T-5,
 * design.md §5.2/§5.3 — this task); its `AdminSetUserPasswordCommand` has
 * no `MessageAction` field to suppress in the first place — Cognito never
 * emailed for this action, so there was nothing being suppressed here,
 * unlike `create()`'s `AdminCreateUserCommand` — the dispatch below is
 * purely additive, our own `MailService` call layered on top of a Cognito
 * call that was always silent.
 *
 * Either way, the temporary password is generated once and RETURNED to the
 * admin as the guaranteed fallback (FR-2, extended to reset by FR-5)
 * whether or not the email sends — that returned value is a secret — it is
 * never logged, stored, or placed in an error message; it exits ONLY
 * through the Admin-guarded HTTP response body and, for both `create()`
 * (T-4) and `resetPassword()` (T-5, this task), the respective email body.
 *
 * Design refs: design.md §3 (API/Cognito map), §4 (service), §5 (mail
 * dispatch, auth/account-access-emails), §6 (no leakage, anti-lockout).
 * Requirements: FR-1..FR-8, FR-10 (admin/user-management); FR-1, FR-3, FR-4,
 * FR-5, NFR-1, NFR-2 (auth/account-access-emails).
 */

import { ConflictException, Injectable, Logger } from '@nestjs/common';
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
import { resolveCognitoSub } from './cognito-sub.util';
import { AdminUser, toAdminUser } from './users.serializer';
import { ASSIGNABLE_ROLES, SettableRole } from './users.constants';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { MailService } from '../mail/mail.service';

/** The list response: a page of users plus the opaque next-page token (design §3). */
export interface ListUsersResult {
  users: AdminUser[];
  paginationToken?: string;
}

/**
 * Result of {@link UsersService.create}: the serialized user plus the one-time
 * temporary password the admin shares out-of-band. The password is a secret and
 * is returned ONLY in the Admin-guarded create response body.
 *
 * `emailSent` (auth/account-access-emails T-4, design.md §4/§5.3, FR-3) is
 * `true` only when the invitation transport accepted the message — it is
 * **not** a delivery receipt (no channel available here offers one; see
 * `requirements.md` §9 D-6) and is `true` under `MAIL_TRANSPORT=no-op`
 * (local dev), same as every other flow in this codebase. `temporaryPassword`
 * is always populated regardless of this flag (FR-2's fallback) — the
 * caller must never read `emailSent: false` as "user not created" (FR-4).
 * `emailSent` already flows to the client unchanged: `UsersController.create`
 * returns this interface as-is (no separate response DTO narrows it). What
 * `auth/account-access-emails` T-6 still owns is the *documented* contract
 * (`docs/trd/trd.md` — there is no OpenAPI/Swagger artifact in this repo),
 * the `:id/password` reset half, and the frontend types that
 * consume this field — not this field's presence on the wire.
 */
export interface CreateUserResult {
  user: AdminUser;
  temporaryPassword: string;
  emailSent: boolean;
}

/**
 * Result of {@link UsersService.resetPassword}: the one-time temporary password
 * the admin shares out-of-band. The password is a secret and is returned ONLY in
 * the Admin-guarded reset response body and, as of auth/account-access-emails
 * T-5, the admin-reset email body.
 *
 * `emailSent` (auth/account-access-emails T-5, design.md §4/§5.2/§5.3, FR-3,
 * FR-5) mirrors {@link CreateUserResult.emailSent} exactly: `true` only when
 * the admin-reset transport accepted the message — it is **not** a delivery
 * receipt (no channel available here offers one; see `requirements.md` §9
 * D-6) and is `true` under `MAIL_TRANSPORT=no-op` (local dev), same as every
 * other flow in this codebase. `temporaryPassword` is always populated
 * regardless of this flag (FR-2's fallback, extended to reset by FR-5) — the
 * caller must never read `emailSent: false` as "the password was not reset"
 * (FR-4, applied here via FR-5's "same rules as FR-1 through FR-4"). What
 * `auth/account-access-emails` T-6 still owns is the *documented* contract
 * for this half of the response (`docs/trd/trd.md`) and the frontend types
 * that consume this field — not this field's presence on the wire.
 */
export interface ResetPasswordResult {
  temporaryPassword: string;
  emailSent: boolean;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  /**
   * `mailService` (auth/account-access-emails T-4/T-5, design.md §5.3) is
   * the ONLY new dependency this spec adds to a service that previously
   * took none — every other method above is unaffected and still talks
   * only to Cognito.
   */
  constructor(private readonly mailService: MailService) {}

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
   * `AdminGetUserCommandOutput` names its attribute list `UserAttributes`,
   * not `Attributes` (the field name `AdminCreateUserCommandOutput` uses) —
   * `AdminGetUser` DOES echo `Username`, only the attribute list's field
   * name differs — so its output is adapted to the serializer's
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
   * FR-1/FR-3 — create a user, generate a temporary password, and email that
   * user an invitation (auth/account-access-emails T-4, design.md §5.3). A
   * cryptographically-random temporary password is generated and passed to
   * `AdminCreateUser` with `MessageAction: 'SUPPRESS'` — Cognito's OWN invite
   * mailer stays suppressed, unchanged (design.md §5.4); that was always about
   * avoiding Cognito's poorly-deliverable channel, never about avoiding email
   * as a channel altogether. The email attribute is pre-verified so the
   * account is immediately usable, and the user is left in
   * `FORCE_CHANGE_PASSWORD`, so it must change at first sign-in (FR-1
   * scenario 1's `AND IT MUST`) — unchanged, since nothing here alters the
   * `AdminCreateUser` call's password-permanence behaviour. When a role is
   * supplied, the user is added to that group.
   *
   * **The invitation dispatch runs LAST, after the optional
   * `AdminAddUserToGroup` call above** (design.md §5.3, judgment round 1's
   * J/A-6) — not between the two Cognito calls. Both Cognito calls share the
   * one outer `try` routed through `mapCognitoError`; dispatching earlier
   * would let a group-assignment failure turn this whole request into an
   * error response AFTER a live credential had already been emailed, which is
   * exactly the state FR-4's "must NOT leave a Cognito user the API reports
   * as not created" clause forbids. That `AdminAddUserToGroup` call — not
   * the dispatch itself — is the actual hazard this ordering guards against:
   * {@link dispatchInvitationEmail} never rethrows, so a MAIL failure can
   * never turn this request into an error response, but that says nothing
   * about a *Cognito* call throwing after the email already went out — which
   * is exactly what running the dispatch before `AdminAddUserToGroup` would
   * risk. The ordering is deliberate and pinned by a test, not incidental.
   *
   * The reference `MailService` logs on failure is
   * `resolveCognitoSub(created.User)` — the Cognito `sub`, or `undefined`
   * when it cannot be resolved. It is **never** `dto.email`,
   * `created.User?.Username`, or the serialized `id`: in this system that
   * value IS the email address (`users.serializer.ts`'s `toAdminUser` derives
   * `id` from `Username`, which the `AdminCreateUserCommand` call below sets
   * to `dto.email`), and substituting it here would write a plaintext
   * address to every failed-invitation log line — the exact leak NFR-1
   * forbids and that judgment round 1's J-4 caught in this design.
   *
   * Returns the serialized user, the temporary password (FR-2's fallback —
   * always populated, whether or not the email sends, never logged or
   * stored, and exits only through this Admin-guarded response body and the
   * invitation email body), and `emailSent` (FR-3) — a boolean signal that
   * the transport accepted the message, not a delivery receipt.
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

      // Dispatch LAST — see the docstring above (design.md §5.3, J/A-6).
      const emailSent = await this.dispatchInvitationEmail(
        dto.email,
        temporaryPassword,
        resolveCognitoSub(created.User),
      );

      return {
        user: toAdminUser(created.User ?? {}, groups),
        temporaryPassword,
        emailSent,
      };
    } catch (err) {
      mapCognitoError(err);
    }
  }

  /**
   * FR-1/FR-3/FR-4/NFR-1/NFR-2 — send `create()`'s invitation email, awaited
   * inside its own `try`/`catch` that swallows and logs (NFR-2, FR-4).
   * Mirrors `RegistrationsService.dispatchReceiptEmail`'s shape (that method
   * is the established exemplar design.md §5.3 names) — same awaited-inside-
   * its-own-try/catch, swallow-and-log discipline; NOT identical, since this
   * method returns `boolean` (`emailSent`, FR-3) where the exemplar returns
   * `void`, because `create()`'s caller needs the outcome and
   * `dispatchReceiptEmail`'s does not. Never fire-and-forget, because this
   * Lambda's execution environment can freeze
   * the instant an invocation settles, and `context.callbackWaitsForEmptyEventLoop`
   * does not protect an `async` handler — this has silently dropped an
   * unawaited send twice already in this project (the registration OTP and
   * the receipt).
   *
   * `MailService.sendInvitation` / its private `dispatch()` already logs the
   * attempt/outcome lines with `reference` (or `n/a`) and never the body
   * (`mail.service.ts`); the line below is this caller's OWN failure record,
   * and — like the exemplar it mirrors — logs only an error-name
   * discriminator and the same `reference`, never `to` and never
   * `temporaryPassword`.
   *
   * Returns `true` when the transport accepted the message, `false` on any
   * rejection — never throws, so a mail-transport failure can never fail
   * `create()`'s request (FR-4).
   */
  private async dispatchInvitationEmail(
    to: string,
    temporaryPassword: string,
    sub: string | undefined,
  ): Promise<boolean> {
    try {
      await this.mailService.sendInvitation(to, temporaryPassword, sub);
      return true;
    } catch (err: unknown) {
      const errorType = err instanceof Error ? err.name : 'UnknownError';
      this.logger.error(
        `invitation email send failed: errorType=${errorType} reference=${sub ?? 'n/a'}`,
      );
      return false;
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
   * FR-7 (admin/user-management) / FR-5 (auth/account-access-emails) — reset
   * a user's password via an admin-mediated handoff, and email that user the
   * new temporary password (auth/account-access-emails T-5, design.md
   * §5.2/§5.3 — this task). A cryptographically-random temporary password is
   * generated and applied with `AdminSetUserPassword` (`Permanent: false`),
   * which moves the user to `FORCE_CHANGE_PASSWORD` regardless of their prior
   * state (works for both `CONFIRMED` and never-signed-in users), so they
   * must change it at next sign-in (FR-5's `AND IT MUST`) — unchanged, since
   * nothing here alters `AdminSetUserPassword`'s password-permanence
   * behaviour.
   *
   * **Cognito's own mailer still sends nothing for this action** —
   * `AdminSetUserPasswordCommand` has no `MessageAction` field to suppress in
   * the first place, so there was never anything to suppress here, unlike
   * `create()`'s `AdminCreateUserCommand`. What changed is additive: our own
   * `MailService` now dispatches an admin-reset email, layered on top of a
   * Cognito call that was always silent.
   *
   * The `sub` this method resolves for {@link dispatchAdminResetEmail}'s
   * reference comes from an `AdminGetUser` call — the same command
   * {@link get} already issues — run AFTER the password has already been
   * set, through {@link resolveResetSub}, which absorbs any failure of that
   * call so it never undoes or blocks the reset itself (design.md §5.2,
   * amended 2026-09-21 during T-5 execution): when the `sub` cannot be
   * resolved **or the lookup itself fails**, it only means the follow-on
   * email dispatch (below) logs `reference=n/a` instead of a correlation
   * id. It is **never** the `id` argument in scope at this call site: in
   * this system `id` IS the email address (`create()`'s docstring above
   * and `cognito-sub.util.ts` document the same trap for the same reason),
   * and substituting it here would write a plaintext address to every
   * failed-reset log line — the exact leak NFR-1 forbids.
   *
   * Returns the temporary password (FR-2's fallback, extended to reset by
   * FR-5 — always populated, whether or not the email sends, never logged or
   * stored, and exits only through this Admin-guarded response body and the
   * admin-reset email body) and `emailSent` (FR-3, via FR-5's "same rules as
   * FR-1 through FR-4") — a boolean signal that the transport accepted the
   * message, not a delivery receipt.
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

      const sub = await this.resolveResetSub(id);

      const emailSent = await this.dispatchAdminResetEmail(
        id,
        temporaryPassword,
        sub,
      );

      return { temporaryPassword, emailSent };
    } catch (err) {
      mapCognitoError(err);
    }
  }

  /**
   * FR-3/FR-4/FR-5/NFR-1/NFR-2 — send `resetPassword()`'s admin-reset email,
   * awaited inside its own `try`/`catch` that swallows and logs. Mirrors
   * {@link dispatchInvitationEmail} exactly — same awaited-inside-its-own-
   * try/catch, swallow-and-log shape, same never-substitute-the-reference
   * rule, and the same reason: this Lambda's execution environment can
   * freeze the instant an invocation settles, so the send must be awaited,
   * never fire-and-forget, and a mail-transport rejection must never turn a
   * password reset that already succeeded in Cognito into a failed request
   * (FR-4's boundary clause, applied here via FR-5's "same rules").
   *
   * `MailService.sendAdminReset` / its private `dispatch()` already logs the
   * attempt/outcome lines with `reference` (or `n/a`) and never the body
   * (`mail.service.ts`); the line below is this caller's OWN failure record
   * and, like the exemplar it mirrors, logs only an error-name discriminator
   * and the same `reference`, never `to` and never `temporaryPassword`.
   *
   * Returns `true` when the transport accepted the message, `false` on any
   * rejection — never throws, so a mail-transport failure can never fail
   * `resetPassword()`'s request (FR-4, via FR-5).
   */
  private async dispatchAdminResetEmail(
    to: string,
    temporaryPassword: string,
    sub: string | undefined,
  ): Promise<boolean> {
    try {
      await this.mailService.sendAdminReset(to, temporaryPassword, sub);
      return true;
    } catch (err: unknown) {
      const errorType = err instanceof Error ? err.name : 'UnknownError';
      this.logger.error(
        `admin reset email send failed: errorType=${errorType} reference=${sub ?? 'n/a'}`,
      );
      return false;
    }
  }

  /**
   * Resolve the Cognito `sub` for {@link resetPassword}'s admin-reset
   * dispatch reference via `AdminGetUser`, absorbing any failure of that
   * call into `undefined` rather than letting it propagate (design.md
   * §5.2, amended 2026-09-21 during T-5 execution). Mirrors
   * `listGroupNames`/`removeFromGroupIfPresent`'s shape: each absorbs one
   * specific Cognito outcome and nothing else.
   *
   * `AdminGetUser` here buys only a log correlation id — the design
   * already rules "losing correlation is acceptable; logging an address
   * is not" — so, unlike the `AdminSetUserPassword` call above (a
   * required state change), a call whose entire value is optional must
   * not be able to fail a request whose password change has already
   * committed. On rejection this logs an error-name discriminator only,
   * **never `id`** (NFR-1).
   */
  private async resolveResetSub(id: string): Promise<string | undefined> {
    const client = getCognitoAdminClient();
    const UserPoolId = getUserPoolId();

    try {
      const detail = await client.send(
        new AdminGetUserCommand({ UserPoolId, Username: id }),
      );
      return resolveCognitoSub(detail);
    } catch (err: unknown) {
      const errorType = err instanceof Error ? err.name : 'UnknownError';
      this.logger.error(
        `admin-reset sub resolution failed: errorType=${errorType}`,
      );
      return undefined;
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
