// @sdd-spec admin/user-management (T-5)
// @sdd-spec auth/account-access-emails (T-4, T-5)
/**
 * T-5 (A) — UsersService unit tests with a mocked Cognito client.
 *
 * The service is the ONLY Cognito caller (design §3/§4), so these tests stub the
 * `CognitoIdentityProviderClient` with `aws-sdk-client-mock` and assert, per
 * method, that the correct Admin command is sent with the expected input. The
 * shared client singleton is reset between tests via `resetCognitoAdminClient()`
 * and the required env (`COGNITO_USER_POOL_ID`, `AWS_REGION`) is set in
 * `beforeAll` so `getUserPoolId()` / the lazy client construction succeed.
 *
 * Coverage focus:
 *  - command shape: `AdminCreateUserCommand` (MessageAction 'SUPPRESS' — Cognito's
 *    own mailer stays suppressed; `create()` now dispatches its own invitation
 *    via `MailService` instead, see below) + a generated TemporaryPassword +
 *    group add; `setRole` clears both groups then adds; `resetPassword`
 *    (`AdminSetUserPassword`, Permanent:false, plus — as of this task — an
 *    `AdminGetUser` call to resolve a `sub` for its own admin-reset dispatch).
 *  - self-lockout (FR-8): demote/delete self → 409 with NO Cognito command;
 *    promoting self to `admin` is allowed.
 *  - no-leak (FR-10): serialized keys are EXACTLY the AdminUser allowlist.
 *  - error mapping: UsernameExists → 409, UserNotFound → 404.
 *
 * auth/account-access-emails T-4 additions — see the `create — invitation
 * dispatch` describe block below (design.md §5.3, `requirements.md` FR-1,
 * FR-3, FR-4, NFR-1, NFR-2): `MailService` is now a constructor dependency
 * (mocked here, never the real implementation — `mailService` below), so
 * `service = new UsersService(...)` gains that argument in `beforeEach`.
 *
 * auth/account-access-emails T-5 additions (this diff) — see the
 * `resetPassword — admin-reset dispatch` describe block below (design.md
 * §5.2/§5.3, `requirements.md` FR-5, FR-3, FR-4, NFR-1, NFR-2):
 * `resetPassword` now resolves a `sub` via `AdminGetUserCommand` (the same
 * command `get()` already issues) and dispatches `MailService.sendAdminReset`
 * through its own swallowing `try`/`catch`, mirroring `create()`'s
 * `dispatchInvitationEmail` exactly. **The T-5 tripwire has been replaced,
 * not deleted**, as its own comment required: the original
 * `describe('resetPassword (FR-7)')` block's first test used to assert
 * `expect(mailService.sendAdminReset).not.toHaveBeenCalled()` as a
 * deliberately-red-when-T-5-lands tripwire (rework attempt 3: an earlier
 * draft asserted only `sendInvitation`, which `resetPassword` was never
 * going to call, so it could never go red). That line is gone from that
 * test — replaced with a positive `toHaveBeenCalledTimes(1)` assertion — and
 * the new `resetPassword — admin-reset dispatch` block below covers the
 * substance the tripwire's comment demanded: reference resolution, the
 * never-`id` rule, and the swallowing behaviour on a rejecting transport.
 * The FR-7 block's second test (`AdminGetUser` call-count) is also updated:
 * that call is no longer zero, because `sub` resolution now issues it — see
 * that test's own comment for what is and is not preserved.
 */

import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminResetUserPasswordCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { mockClient } from 'aws-sdk-client-mock';

import { UsersService } from './users.service';
import { resetCognitoAdminClient } from './cognito-admin.client';
import { MailService } from '../mail/mail.service';

const cognitoMock = mockClient(CognitoIdentityProviderClient);

/** A Cognito error mirrors the SDK shape — the mapper discriminates on `name`. */
function cognitoError(name: string): Error {
  const err = new Error(name);
  err.name = name;
  return err;
}

/** Assert a temporary password satisfies the pool policy (>=12, all 4 classes). */
function expectPolicyValid(pw: unknown): void {
  expect(typeof pw).toBe('string');
  const password = pw as string;
  expect(password.length).toBeGreaterThanOrEqual(12);
  expect(password).toMatch(/[A-Z]/);
  expect(password).toMatch(/[a-z]/);
  expect(password).toMatch(/[0-9]/);
  expect(password).toMatch(/[!@#$%*?\-_]/);
}

// ---------------------------------------------------------------------------
// Arrange-only helpers (no assertions live here — every expect() stays in
// its own test body, per the account-access-emails T-6 dispatch/T-7 brief).
// ---------------------------------------------------------------------------

/**
 * Stub `AdminCreateUserCommand`'s success response. `sub` is optional and
 * maps to the exact `Attributes` shape `resolveCognitoSub` reads — omit it
 * to reproduce the "no sub attribute at all" response Cognito can genuinely
 * return, which is the branch several tests below need.
 */
function stubCreateUserResolves(username: string, sub?: string): void {
  cognitoMock.on(AdminCreateUserCommand).resolves({
    User: sub
      ? { Username: username, Attributes: [{ Name: 'sub', Value: sub }] }
      : { Username: username },
  });
}

/** Stub `AdminGetUserCommand` with a resolvable `sub` attribute and,
 * optionally, a resolvable `email` attribute (the production-defect fix's
 * recipient) — `resetPassword`'s dispatch happy-path lookup. Passing
 * `email` lets a test prove the dispatch's recipient is THIS resolved
 * value, not the route's `id`/UUID and not `sub`. */
function stubGetUserSub(sub: string, email?: string): void {
  cognitoMock.on(AdminGetUserCommand).resolves({
    UserAttributes: [
      { Name: 'sub', Value: sub },
      ...(email ? [{ Name: 'email', Value: email }] : []),
    ],
  });
}

/** Stub `AdminGetUserCommand` with NO `sub` attribute — only a resolvable
 * `email` one, mirroring the real "sub unresolvable, email resolvable"
 * response shape — the branch that must degrade the log reference to
 * `n/a` while STILL dispatching to the resolved email (never falling back
 * to the id in scope, and never skipping the dispatch just because `sub`
 * is missing — only a missing `email` skips it). */
function stubGetUserNoSub(email: string): void {
  cognitoMock
    .on(AdminGetUserCommand)
    .resolves({ UserAttributes: [{ Name: 'email', Value: email }] });
}

/** Stub `AdminGetUserCommand` with NEITHER a `sub` NOR an `email`
 * attribute — the "nothing resolvable" branch that must skip the dispatch
 * entirely (no fallback recipient exists) and return `emailSent: false`. */
function stubGetUserNoAttributes(): void {
  cognitoMock.on(AdminGetUserCommand).resolves({ UserAttributes: [] });
}

/** Make a mocked `MailService` method reject the way a genuinely unreachable
 * microservice transport would — same error shape both dispatch call sites
 * (`create`'s `sendInvitation`, `resetPassword`'s `sendAdminReset`) need to
 * prove they swallow without failing the request. */
function stubTransportRejection(mock: jest.Mock): void {
  const transportRejection = new Error('microservice unreachable');
  transportRejection.name = 'TransportRejectedError';
  mock.mockRejectedValue(transportRejection);
}

/**
 * Spies on `Logger.prototype.error` for a describe block's lifetime,
 * restoring it after each test — shared by the two "a rejecting mail
 * transport never fails the request" blocks below, which were otherwise
 * identical `let`/`beforeEach`/`afterEach` boilerplate. Returns a GETTER,
 * not the spy itself: the real `jest.SpyInstance` is created fresh inside
 * `beforeEach`, which runs after this function has already returned, so
 * callers must read `getErrorSpy()` inside each `it`, not capture a value
 * at describe-registration time.
 */
function spyOnLoggerError(): () => jest.SpyInstance {
  let spy: jest.SpyInstance;
  beforeEach(() => {
    spy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    spy.mockRestore();
  });
  return () => spy;
}

describe('UsersService (mocked Cognito)', () => {
  let service: UsersService;
  let mailService: { sendInvitation: jest.Mock; sendAdminReset: jest.Mock };

  beforeAll(() => {
    process.env.COGNITO_USER_POOL_ID = 'us-east-1_TESTPOOL';
    process.env.AWS_REGION = 'us-east-1';
    process.env.COGNITO_CLIENT_ID = 'test-client-id';
  });

  beforeEach(() => {
    cognitoMock.reset();
    resetCognitoAdminClient();
    mailService = {
      sendInvitation: jest.fn().mockResolvedValue(undefined),
      // `resetPassword` genuinely dispatches `sendAdminReset` as of T-5
      // (auth/account-access-emails) — declared here because the method
      // is really called, not as a defensive stub against a tripwire.
      // Its swallowing frame is `dispatchAdminResetEmail`'s own `catch`
      // (mirrors `dispatchInvitationEmail`), which absorbs a rejection
      // and reports `emailSent: false` rather than letting it propagate.
      sendAdminReset: jest.fn().mockResolvedValue(undefined),
    };
    service = new UsersService(mailService as unknown as MailService);
  });

  // ── FR-1: list ─────────────────────────────────────────────────────────
  describe('list (FR-1)', () => {
    it('sends ListUsers and joins groups per user, returning the page token', async () => {
      cognitoMock.on(ListUsersCommand).resolves({
        Users: [
          {
            Username: 'sub-1',
            Attributes: [{ Name: 'email', Value: 'a@example.com' }],
            UserStatus: 'CONFIRMED',
            Enabled: true,
          },
        ],
        PaginationToken: 'next-token',
      });
      cognitoMock
        .on(AdminListGroupsForUserCommand)
        .resolves({ Groups: [{ GroupName: 'admin' }] });

      const result = await service.list({ limit: 60 } as never);

      expect(result.paginationToken).toBe('next-token');
      expect(result.users).toHaveLength(1);
      expect(result.users[0].roles).toEqual(['admin']);
      const listCalls = cognitoMock.commandCalls(ListUsersCommand);
      expect(listCalls).toHaveLength(1);
      expect(listCalls[0].args[0].input).toMatchObject({
        UserPoolId: 'us-east-1_TESTPOOL',
        Limit: 60,
      });
    });
  });

  // ── FR-3: create (Cognito mail suppressed; invitation dispatched by `UsersService`) ──
  describe('create (FR-3)', () => {
    it('sends AdminCreateUser with MessageAction "SUPPRESS" (Cognito\'s own mailer) + a temp password and adds to group when role given', async () => {
      stubCreateUserResolves('new@example.com');
      cognitoMock.on(AdminAddUserToGroupCommand).resolves({});

      const result = await service.create({
        email: 'new@example.com',
        role: 'staff',
      } as never);

      const createCalls = cognitoMock.commandCalls(AdminCreateUserCommand);
      expect(createCalls).toHaveLength(1);
      const input = createCalls[0].args[0].input;
      expect(input).toMatchObject({
        UserPoolId: 'us-east-1_TESTPOOL',
        Username: 'new@example.com',
        MessageAction: 'SUPPRESS',
      });
      // No email is ever requested FROM COGNITO — the invitation itself is
      // dispatched separately, by `MailService`, asserted further below.
      expect(input.DesiredDeliveryMediums).toBeUndefined();
      // A policy-valid temporary password is supplied to Cognito.
      expectPolicyValid(input.TemporaryPassword);
      // FR-1 scenario 1's "AND IT MUST leave FORCE_CHANGE_PASSWORD": nothing
      // in create() ever converts the temporary password to a permanent one
      // (that call belongs only to resetPassword's OWN AdminSetUserPassword,
      // asserted separately below) — a stray such call here would let the
      // account skip the forced change this clause requires.
      expect(
        cognitoMock.commandCalls(AdminSetUserPasswordCommand),
      ).toHaveLength(0);
      // ...and returned to the admin for out-of-band handoff, matching Cognito's.
      expectPolicyValid(result.temporaryPassword);
      expect(result.temporaryPassword).toBe(input.TemporaryPassword);

      const addCalls = cognitoMock.commandCalls(AdminAddUserToGroupCommand);
      expect(addCalls).toHaveLength(1);
      expect(addCalls[0].args[0].input).toMatchObject({
        GroupName: 'staff',
        Username: 'new@example.com',
      });
      expect(result.user.roles).toEqual(['staff']);

      // auth/account-access-emails FR-1/FR-3: the invitation is still
      // dispatched when a role IS supplied, and `emailSent` reflects it.
      expect(mailService.sendInvitation).toHaveBeenCalledTimes(1);
      expect(result.emailSent).toBe(true);
    });

    it('does NOT add to any group when no role is supplied', async () => {
      stubCreateUserResolves('plain@example.com');

      const result = await service.create({
        email: 'plain@example.com',
      } as never);

      expect(cognitoMock.commandCalls(AdminAddUserToGroupCommand)).toHaveLength(
        0,
      );
      expect(result.user.roles).toEqual([]);
      expectPolicyValid(result.temporaryPassword);

      // auth/account-access-emails FR-1: dispatch is unconditional on
      // whether a role was supplied — the group add is optional, the
      // invitation is not.
      expect(mailService.sendInvitation).toHaveBeenCalledTimes(1);
      expect(result.emailSent).toBe(true);
    });

    // ── Error mapping (NFR-4): UsernameExists → 409 ──────────────────────
    it('maps UsernameExistsException → ConflictException (409)', async () => {
      cognitoMock
        .on(AdminCreateUserCommand)
        .rejects(cognitoError('UsernameExistsException'));

      await expect(
        service.create({ email: 'dupe@example.com' } as never),
      ).rejects.toBeInstanceOf(ConflictException);

      // The account was never created, so no invitation is ever attempted.
      expect(mailService.sendInvitation).not.toHaveBeenCalled();
    });
  });

  // ── auth/account-access-emails FR-1, FR-3, FR-4, NFR-1, NFR-2 ───────────
  describe('create — invitation dispatch (auth/account-access-emails)', () => {
    it('resolves the Cognito `sub` from `AdminCreateUserResponse.User.Attributes` and passes it — never `Username`/`id` — as the reference', async () => {
      stubCreateUserResolves('invitee@example.com', 'sub-real-0001');

      const result = await service.create({
        email: 'invitee@example.com',
      } as never);

      expect(mailService.sendInvitation).toHaveBeenCalledWith(
        'invitee@example.com',
        result.temporaryPassword,
        'sub-real-0001',
      );
      expect(result.emailSent).toBe(true);
    });

    it(
      'passes NO reference (never `dto.email`, `created.User?.Username`, or the ' +
        'serialized `id`) when `sub` cannot be resolved — the fallback NFR-1 forbids ' +
        '(J-4: `id`/`Username` IS the email address in this system)',
      async () => {
        stubCreateUserResolves('nosub@example.com'); // no Attributes at all

        await service.create({ email: 'nosub@example.com' } as never);

        expect(mailService.sendInvitation).toHaveBeenCalledWith(
          'nosub@example.com',
          expect.any(String),
          undefined,
        );
        const [, , reference] = mailService.sendInvitation.mock.calls[0];
        expect(reference).not.toBe('nosub@example.com');
      },
    );

    // ── Falsifier (1) — J/A-6 ordering: dispatch LAST, after the optional
    // AdminAddUserToGroup call, not between the two Cognito calls. Moving
    // the dispatch earlier makes this test redden, because the invitation
    // would already have been sent by the time the group-add rejects.
    it('does NOT dispatch the invitation when the optional AdminAddUserToGroup call fails — proves the dispatch runs LAST', async () => {
      stubCreateUserResolves('blocked@example.com');
      cognitoMock
        .on(AdminAddUserToGroupCommand)
        .rejects(cognitoError('UserNotFoundException'));

      await expect(
        service.create({ email: 'blocked@example.com', role: 'staff' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mailService.sendInvitation).not.toHaveBeenCalled();
    });

    // ── FR-4 (all four clauses) + NFR-1 (never the password, never the
    // address) for THIS site's rejecting-transport behaviour is now covered
    // by the parameterized `dispatchSites` block below (after the
    // `resetPassword — admin-reset dispatch` describe), which binds the
    // same invariant to both `dispatchInvitationEmail` and
    // `dispatchAdminResetEmail` from one table instead of two hand-copied
    // describes. See that block's own comment for the falsifiers it
    // preserves (dispatch-swallows-and-never-throws, and the
    // never-fall-back-to-the-address rule for both the resolved- and
    // unresolved-`sub` cases).
  });

  // ── FR-2: get + error mapping (UserNotFound → 404) ──────────────────────
  describe('get (FR-2)', () => {
    it('maps UserNotFoundException → NotFoundException (404)', async () => {
      cognitoMock
        .on(AdminGetUserCommand)
        .rejects(cognitoError('UserNotFoundException'));

      await expect(service.get('missing-sub')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── FR-4: update ─────────────────────────────────────────────────────────
  describe('update (FR-4) — admin email edits stay verified', () => {
    function stubGetAfterUpdate(): void {
      cognitoMock.on(AdminGetUserCommand).resolves({
        UserAttributes: [{ Name: 'email', Value: 'new@example.com' }],
        UserStatus: 'CONFIRMED',
        Enabled: true,
      });
      cognitoMock
        .on(AdminListGroupsForUserCommand)
        .resolves({ Groups: [] });
    }

    it('sends email AND email_verified:"true" in the SAME AdminUpdateUserAttributes call', async () => {
      cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});
      stubGetAfterUpdate();

      await service.update('target-sub', { email: 'new@example.com' } as never);

      const calls = cognitoMock.commandCalls(AdminUpdateUserAttributesCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input).toMatchObject({
        UserPoolId: 'us-east-1_TESTPOOL',
        Username: 'target-sub',
        UserAttributes: [
          { Name: 'email', Value: 'new@example.com' },
          { Name: 'email_verified', Value: 'true' },
        ],
      });
    });
  });

  // ── FR-5: setRole ───────────────────────────────────────────────────────
  describe('setRole (FR-5)', () => {
    function stubGetAfterSet(groups: string[]): void {
      cognitoMock.on(AdminGetUserCommand).resolves({
        UserAttributes: [{ Name: 'email', Value: 'u@example.com' }],
        UserStatus: 'CONFIRMED',
        Enabled: true,
      });
      cognitoMock
        .on(AdminListGroupsForUserCommand)
        .resolves({ Groups: groups.map((g) => ({ GroupName: g })) });
    }

    it('removes BOTH assignable groups then adds the target group', async () => {
      cognitoMock.on(AdminRemoveUserFromGroupCommand).resolves({});
      cognitoMock.on(AdminAddUserToGroupCommand).resolves({});
      stubGetAfterSet(['admin']);

      await service.setRole('target-sub', 'admin', 'caller-sub');

      const removed = cognitoMock
        .commandCalls(AdminRemoveUserFromGroupCommand)
        .map((c) => c.args[0].input.GroupName);
      expect(removed).toEqual(['admin', 'staff']);

      const added = cognitoMock.commandCalls(AdminAddUserToGroupCommand);
      expect(added).toHaveLength(1);
      expect(added[0].args[0].input).toMatchObject({
        GroupName: 'admin',
        Username: 'target-sub',
      });
    });

    it('clears both groups and adds NONE when target role is "none"', async () => {
      cognitoMock.on(AdminRemoveUserFromGroupCommand).resolves({});
      stubGetAfterSet([]);

      await service.setRole('target-sub', 'none', 'caller-sub');

      expect(
        cognitoMock.commandCalls(AdminRemoveUserFromGroupCommand),
      ).toHaveLength(2);
      expect(cognitoMock.commandCalls(AdminAddUserToGroupCommand)).toHaveLength(
        0,
      );
    });

    // ── Self-lockout (FR-8) ──────────────────────────────────────────────
    it('throws 409 and sends NO Cognito command when an admin demotes themselves', async () => {
      await expect(
        service.setRole('self-sub', 'staff', 'self-sub'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(cognitoMock.calls()).toHaveLength(0);
    });

    it('ALLOWS promoting yourself to admin (no lockout)', async () => {
      cognitoMock.on(AdminRemoveUserFromGroupCommand).resolves({});
      cognitoMock.on(AdminAddUserToGroupCommand).resolves({});
      stubGetAfterSet(['admin']);

      await expect(
        service.setRole('self-sub', 'admin', 'self-sub'),
      ).resolves.toBeDefined();
      expect(
        cognitoMock.commandCalls(AdminAddUserToGroupCommand),
      ).toHaveLength(1);
    });
  });

  // ── FR-6: remove ─────────────────────────────────────────────────────────
  describe('remove (FR-6)', () => {
    it('sends AdminDeleteUser for another user', async () => {
      cognitoMock.on(AdminDeleteUserCommand).resolves({});

      await service.remove('other-sub', 'caller-sub');

      const calls = cognitoMock.commandCalls(AdminDeleteUserCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input).toMatchObject({ Username: 'other-sub' });
    });

    // ── Self-lockout (FR-8) ──────────────────────────────────────────────
    it('throws 409 and sends NO delete when an admin deletes themselves', async () => {
      await expect(
        service.remove('self-sub', 'self-sub'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(cognitoMock.commandCalls(AdminDeleteUserCommand)).toHaveLength(0);
      expect(cognitoMock.calls()).toHaveLength(0);
    });
  });

  // ── FR-7 (admin/user-management) / FR-5 (auth/account-access-emails):
  // resetPassword — admin-mediated handoff, now with its own admin-reset
  // dispatch (T-5). Cognito's OWN mailer still sends nothing for this
  // action (AdminSetUserPasswordCommand has no MessageAction to suppress) —
  // what changed is additive, our own MailService call layered on top.
  describe('resetPassword (FR-7)', () => {
    it('sets a temp password via AdminSetUserPassword (Permanent:false) and returns { temporaryPassword }', async () => {
      cognitoMock.on(AdminSetUserPasswordCommand).resolves({});
      // A resolvable `email` attribute must be present for the dispatch to
      // fire at all (the production-defect fix's hard requirement: no
      // resolvable email means no dispatch). See the dedicated
      // `resetPassword — admin-reset dispatch` block below for the
      // recipient-identity assertions themselves.
      stubGetUserSub('sub-for-some-sub', 'reset-dispatch-target@example.org');

      const result = await service.resetPassword('some-sub');

      expectPolicyValid(result.temporaryPassword);
      const calls = cognitoMock.commandCalls(AdminSetUserPasswordCommand);
      expect(calls).toHaveLength(1);
      const input = calls[0].args[0].input;
      expect(input).toMatchObject({
        UserPoolId: 'us-east-1_TESTPOOL',
        Username: 'some-sub',
        Permanent: false,
      });
      // The password sent to Cognito is exactly the one handed back to the admin.
      expect(input.Password).toBe(result.temporaryPassword);

      // T-5 (auth/account-access-emails): resetPassword now dispatches its
      // own admin-reset email. This REPLACES the former T-5 tripwire, which
      // asserted `sendAdminReset` uncalled — its own comment required
      // replacement, not silent deletion, the day this dispatch landed.
      // `sendInvitation` is a DIFFERENT method (create()'s invitation) and
      // stays permanently uncalled from resetPassword.
      expect(mailService.sendInvitation).not.toHaveBeenCalled();
      expect(mailService.sendAdminReset).toHaveBeenCalledTimes(1);

      // The old email-based / re-invite paths are gone: neither is issued.
      expect(
        cognitoMock.commandCalls(AdminResetUserPasswordCommand),
      ).toHaveLength(0);
      expect(cognitoMock.commandCalls(AdminCreateUserCommand)).toHaveLength(0);
    });

    it('calls AdminGetUser only to resolve a sub for the dispatch — no status-based branching before the reset', async () => {
      cognitoMock.on(AdminSetUserPasswordCommand).resolves({});
      stubGetUserSub('sub-uuid-123-resolved', 'reset-dispatch-target-2@example.org');

      await service.resetPassword('sub-uuid-123');

      // T-5 (auth/account-access-emails) made this call count 1, not 0 —
      // AdminGetUser is now issued to resolve a `sub` for the admin-reset
      // dispatch's reference (see the block below). What this test still
      // preserves is the ORIGINAL point: that call is not a status
      // precondition that branches the reset — the single
      // AdminSetUserPassword call below still unconditionally covers both
      // CONFIRMED and FORCE_CHANGE_PASSWORD users, with no prior read
      // deciding which path to take.
      expect(cognitoMock.commandCalls(AdminGetUserCommand)).toHaveLength(1);
      const calls = cognitoMock.commandCalls(AdminSetUserPasswordCommand);
      expect(calls).toHaveLength(1);
      // Username MUST be the passed id (sub/UUID), never an email alias.
      expect(calls[0].args[0].input.Username).toBe('sub-uuid-123');
    });
  });

  // ── FR-5 (auth/account-access-emails): resetPassword's own admin-reset
  // dispatch (T-5) — mirrors the `create — invitation dispatch` block above;
  // see design.md §5.2/§5.3 and this file's header docblock for what changed.
  describe('resetPassword — admin-reset dispatch (auth/account-access-emails)', () => {
    // Production defect (2026-09-22): `id` here is the route param and, in
    // THIS Cognito pool, a UUID — the exact shape of the live incident's
    // `22a514c4-7051-7037-23fe-90af8cc4aeec`. Every fixture below therefore
    // uses a UUID-shaped `id`, deliberately DIFFERENT from the resolved
    // `email` fixture, so a regression to dispatching at `id` (or at `sub`)
    // cannot pass by coincidence the way a same-string fixture would hide it.
    const RESET_ROUTE_ID = '22a514c4-7051-7037-23fe-90af8cc4aeec';

    it("resolves the Cognito `sub` AND `email` from the SAME `AdminGetUser` call, and dispatches to the resolved `email` — never the route's `id`, and never `sub`", async () => {
      cognitoMock.on(AdminSetUserPasswordCommand).resolves({});
      stubGetUserSub('sub-reset-0001', 'admin-reset-recipient@example.org');

      const result = await service.resetPassword(RESET_ROUTE_ID);

      expect(mailService.sendAdminReset).toHaveBeenCalledWith(
        'admin-reset-recipient@example.org',
        result.temporaryPassword,
        'sub-reset-0001',
      );
      const [to, , reference] = mailService.sendAdminReset.mock.calls[0];
      expect(to).not.toBe(RESET_ROUTE_ID);
      expect(to).not.toBe('sub-reset-0001');
      expect(reference).not.toBe(RESET_ROUTE_ID);
      expect(result.emailSent).toBe(true);
    });

    it(
      'passes NO reference (never the `id` in scope at this call site) when `sub` cannot be ' +
        'resolved, but STILL dispatches to the resolved `email` (missing `sub` degrades only the log correlation, never the recipient)',
      async () => {
        cognitoMock.on(AdminSetUserPasswordCommand).resolves({});
        stubGetUserNoSub('admin-reset-recipient-2@example.org'); // no `sub` entry — the disqualifier's "unresolvable" branch

        await service.resetPassword(RESET_ROUTE_ID);

        expect(mailService.sendAdminReset).toHaveBeenCalledWith(
          'admin-reset-recipient-2@example.org',
          expect.any(String),
          undefined,
        );
        const [to, , reference] = mailService.sendAdminReset.mock.calls[0];
        expect(to).not.toBe(RESET_ROUTE_ID);
        expect(reference).toBeUndefined();
      },
    );

    // ── design.md §5.2 amendment (2026-09-21, T-5 rework attempt 2; amended
    // again 2026-09-22 for the recipient fix) — the `AdminGetUser` lookup
    // itself buys the recipient email AND a log correlation id, and must
    // not be able to fail a request whose password change already
    // committed. When the lookup itself fails, NEITHER value is available,
    // so — per the fix's hard requirement — there is no dispatch at all:
    // `sendAdminReset` must never be called, and `emailSent` must be
    // `false`. Its falsifier is free: delete `resolveResetRecipient`'s own
    // `catch` and the rejection propagates into the outer `try`, whose
    // `catch` runs `mapCognitoError` (typed `: never`) — `resetPassword`
    // would REJECT instead of resolving, and this test would redden.
    it('when the AdminGetUser lookup itself rejects, resetPassword still resolves — no email is resolvable, so the dispatch is skipped entirely (emailSent:false), never a 5xx', async () => {
      const lookupErrorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      cognitoMock.on(AdminSetUserPasswordCommand).resolves({});
      cognitoMock
        .on(AdminGetUserCommand)
        .rejects(cognitoError('InternalErrorException'));

      const result = await service.resetPassword(RESET_ROUTE_ID);

      expectPolicyValid(result.temporaryPassword);
      expect(result.emailSent).toBe(false);
      expect(mailService.sendAdminReset).not.toHaveBeenCalled();

      // NFR-1: whatever log line(s) this produces must NEVER carry an
      // email address, the temporary password, or the route's `id`.
      const emittedLines = lookupErrorSpy.mock.calls.map(
        ([line]) => line as string,
      );
      expect(emittedLines.length).toBeGreaterThanOrEqual(1);
      expect(
        emittedLines.some((line) => line.includes('InternalErrorException')),
      ).toBe(true);
      for (const line of emittedLines) {
        expect(line).not.toContain('@');
        expect(line).not.toContain(RESET_ROUTE_ID);
        expect(line).not.toContain(result.temporaryPassword);
      }

      lookupErrorSpy.mockRestore();
    });

    // ── The no-dispatch case, required alongside the fix: the lookup
    // SUCCEEDS but carries no `email` attribute at all (e.g. an
    // account-managed attribute the pool never populated) — the dispatch
    // must be skipped just as when the lookup fails outright, and the
    // skip's own log line must carry no address.
    it('does not call sendAdminReset at all — and returns emailSent:false with the reset itself still succeeding — when AdminGetUser resolves but carries no email attribute', async () => {
      const skipLogSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      cognitoMock.on(AdminSetUserPasswordCommand).resolves({});
      stubGetUserNoAttributes();

      const result = await service.resetPassword(RESET_ROUTE_ID);

      expectPolicyValid(result.temporaryPassword);
      expect(result.emailSent).toBe(false);
      expect(mailService.sendAdminReset).not.toHaveBeenCalled();

      expect(skipLogSpy).toHaveBeenCalledTimes(1);
      const [emittedLine] = skipLogSpy.mock.calls[0] as [string];
      expect(emittedLine).toContain('reference=n/a');
      expect(emittedLine).not.toContain('@');
      expect(emittedLine).not.toContain(RESET_ROUTE_ID);
      expect(emittedLine).not.toContain(result.temporaryPassword);

      skipLogSpy.mockRestore();
    });

    // ── Falsifier 3 — Permanent:false is pinned by the FR-7 block's first
    // test above (`toMatchObject({ Permanent: false })`); this site's own
    // rejecting-transport falsifiers (1 and 2) now live in the
    // parameterized `dispatchSites` block below, which binds the SAME
    // NFR-1 invariant (never the password, never the address) to this site
    // (`dispatchAdminResetEmail`) and to `create`'s
    // (`dispatchInvitationEmail`) from one table.
  });

  // ── NFR-1 (both dispatch sites): a rejecting mail transport never fails
  // the request, and its own failure log never carries the temporary
  // password or the email address — parameterized over the two call sites
  // instead of two hand-copied describes (`create`'s
  // `dispatchInvitationEmail` above, `resetPassword`'s
  // `dispatchAdminResetEmail` above). The invariant binds each site
  // INDEPENDENTLY — see `dispatchSites` — so both rows must exercise a
  // genuinely different subject: `create`'s `sendInvitation` mock/
  // `stubCreateUserResolves` vs. `resetPassword`'s `sendAdminReset` mock/
  // `stubGetUserSub`/`stubGetUserNoSub`. A table that accidentally pointed
  // both rows at the same site would run one site's test twice and prove
  // nothing about the other — the exact defect class this refactor must
  // not introduce.
  //
  // Falsifiers this block preserves, unweakened, for EACH row:
  //  - (create's former Falsifier 2 / reset's former Falsifier 2):
  //    removing that site's `dispatch*Email` helper's own `try`/`catch`
  //    lets the rejection propagate into the outer `try`
  //    (`mapCognitoError`), so the public method would REJECT instead of
  //    resolving — the bare `await` in "sub resolved" below alone
  //    falsifies this.
  //  - (create's former Falsifier 3 / reset's former Falsifier 1): a
  //    fallback to the address/id in scope at that call site — instead of
  //    `reference=n/a` — when `sub` cannot be resolved must redden the
  //    "sub unresolved" test below.
  //  - `not.toContain('@')` is asserted verbatim in both tests below: it
  //    reddens for ANY address leak, not just the one literal address each
  //    row happens to use.
  interface DispatchSiteCase {
    /** Names the site being exercised — shown in the describe.each title. */
    siteName: string;
    /** The `reference=` value the failure log must carry when `sub` resolves. */
    resolvedSubReference: string;
    /** The address in scope at this call site for the "sub resolved" case. */
    resolvedSubAddress: string;
    /** The address in scope at this call site for the "sub unresolved" case. */
    unresolvedSubAddress: string;
    /** Arranges Cognito + a rejecting transport with `sub` resolvable. */
    arrangeResolvedSubRejection: () => void;
    /** Invokes the public method for the "sub resolved" case. */
    actResolvedSub: () => Promise<{
      emailSent: boolean;
      temporaryPassword: string;
      user?: { id: string };
    }>;
    /** Site-specific assertions on top of the shared `emailSent`/password ones. */
    assertResolvedSubResult: (result: {
      emailSent: boolean;
      temporaryPassword: string;
      user?: { id: string };
    }) => void;
    /** Arranges Cognito + a rejecting transport with `sub` UNresolvable. */
    arrangeUnresolvedSubRejection: () => void;
    /** Invokes the public method for the "sub unresolved" case. */
    actUnresolvedSub: () => Promise<{ emailSent: boolean }>;
  }

  const dispatchSites: DispatchSiteCase[] = [
    {
      siteName: 'create → dispatchInvitationEmail (sendInvitation)',
      resolvedSubReference: 'sub-reject-0002',
      resolvedSubAddress: 'rejected@example.com',
      unresolvedSubAddress: 'nosub-reject@example.com',
      arrangeResolvedSubRejection: () => {
        stubCreateUserResolves('rejected@example.com', 'sub-reject-0002');
        stubTransportRejection(mailService.sendInvitation);
      },
      actResolvedSub: () =>
        service.create({ email: 'rejected@example.com' } as never),
      assertResolvedSubResult: (result) => {
        // (a) the user was still created despite the transport rejection.
        expect(result.user?.id).toBe('rejected@example.com');
      },
      arrangeUnresolvedSubRejection: () => {
        stubCreateUserResolves('nosub-reject@example.com'); // no Attributes
        mailService.sendInvitation.mockRejectedValue(new Error('down'));
      },
      actUnresolvedSub: () =>
        service.create({ email: 'nosub-reject@example.com' } as never),
    },
    {
      siteName: 'resetPassword → dispatchAdminResetEmail (sendAdminReset)',
      resolvedSubReference: 'sub-reset-0002',
      // The route `id` is a UUID (production shape); the resolved `email`
      // below is a DIFFERENT string on purpose — proves the failure log
      // never leaks the resolved recipient, not merely the (no-longer-used)
      // route id.
      resolvedSubAddress: 'reset-reject-recipient@example.org',
      unresolvedSubAddress: 'reset-reject-recipient-2@example.org',
      arrangeResolvedSubRejection: () => {
        cognitoMock.on(AdminSetUserPasswordCommand).resolves({});
        stubGetUserSub('sub-reset-0002', 'reset-reject-recipient@example.org');
        stubTransportRejection(mailService.sendAdminReset);
      },
      actResolvedSub: () =>
        service.resetPassword('11111111-2222-3333-4444-555555555555'),
      assertResolvedSubResult: () => {
        // `resetPassword` returns no `user` — nothing further to assert here.
      },
      arrangeUnresolvedSubRejection: () => {
        cognitoMock.on(AdminSetUserPasswordCommand).resolves({});
        stubGetUserNoSub('reset-reject-recipient-2@example.org'); // no `sub`, but email resolvable
        mailService.sendAdminReset.mockRejectedValue(new Error('down'));
      },
      actUnresolvedSub: () =>
        service.resetPassword('66666666-7777-8888-9999-000000000000'),
    },
  ];

  describe.each(dispatchSites)(
    '$siteName — a rejecting mail transport never fails the request (NFR-1)',
    (site) => {
      const getErrorSpy = spyOnLoggerError();

      it('still returns the temporary password and emailSent:false — and logs the failure without the password or the address (sub resolved)', async () => {
        site.arrangeResolvedSubRejection();

        // Never throws — this `await` alone falsifies "dispatch's own
        // try/catch was removed" for this site.
        const result = await site.actResolvedSub();

        site.assertResolvedSubResult(result);
        // the temporary password is still returned.
        expectPolicyValid(result.temporaryPassword);
        // the not-sent signal is returned.
        expect(result.emailSent).toBe(false);

        // NFR-1: the failure is logged, but NEVER the password or the address.
        const errorSpy = getErrorSpy();
        expect(errorSpy).toHaveBeenCalledTimes(1);
        const [emittedLine] = errorSpy.mock.calls[0] as [string];
        expect(emittedLine).toContain('TransportRejectedError');
        expect(emittedLine).toContain(site.resolvedSubReference);
        expect(emittedLine).not.toContain(site.resolvedSubAddress);
        expect(emittedLine).not.toContain(result.temporaryPassword);
        expect(emittedLine).not.toContain('@');
      });

      it(
        'logs `reference=n/a` — never the email address — when the transport rejects AND `sub` ' +
          'could not be resolved (a fallback to the address/id in scope at this call site must redden this test)',
        async () => {
          site.arrangeUnresolvedSubRejection();

          const result = await site.actUnresolvedSub();

          expect(result.emailSent).toBe(false);
          const errorSpy = getErrorSpy();
          expect(errorSpy).toHaveBeenCalledTimes(1);
          const [emittedLine] = errorSpy.mock.calls[0] as [string];
          expect(emittedLine).toContain('reference=n/a');
          expect(emittedLine).not.toContain(site.unresolvedSubAddress);
          expect(emittedLine).not.toContain('@');
        },
      );
    },
  );

  // ── FR-10: no-leak serializer ────────────────────────────────────────────
  describe('serialized output (FR-10 no-leak)', () => {
    it('exposes EXACTLY {id,email,status,enabled,roles,createdAt,updatedAt} and no password field', async () => {
      cognitoMock.on(AdminGetUserCommand).resolves({
        UserAttributes: [{ Name: 'email', Value: 'u@example.com' }],
        UserStatus: 'CONFIRMED',
        Enabled: true,
        UserCreateDate: new Date('2026-01-01T00:00:00Z'),
        UserLastModifiedDate: new Date('2026-01-02T00:00:00Z'),
      });
      cognitoMock
        .on(AdminListGroupsForUserCommand)
        .resolves({ Groups: [{ GroupName: 'staff' }] });

      const user = await service.get('sub-x');

      expect(Object.keys(user).sort()).toEqual(
        [
          'createdAt',
          'email',
          'enabled',
          'id',
          'roles',
          'status',
          'updatedAt',
        ].sort(),
      );
      // Defense-in-depth: no password-like key may ever exist.
      const wire = JSON.stringify(user).toLowerCase();
      expect(wire).not.toContain('password');
      expect(wire).not.toContain('temporary');
    });
  });
});
