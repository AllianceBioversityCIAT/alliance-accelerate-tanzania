// @sdd-spec admin/user-management (T-5)
// @sdd-spec auth/account-access-emails (T-4)
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
 *    (`AdminSetUserPassword`, Permanent:false).
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
 * `resetPassword`'s own tests below (`describe('resetPassword (FR-7)')`) are
 * otherwise UNCHANGED, but this diff adds two assertions to the first of
 * them — `expect(mailService.sendInvitation).not.toHaveBeenCalled()` AND
 * `expect(mailService.sendAdminReset).not.toHaveBeenCalled()` — as T-5's
 * tripwire (rework attempt 3: the first draft asserted only `sendInvitation`,
 * which `resetPassword` was never going to call, so it could never go red on
 * T-5's actual change; the mock is widened below to declare `sendAdminReset`
 * too so the assertion has something to catch). It passes today only because
 * `resetPassword` issues no `MailService` call of either kind, and it is
 * expected to go red the moment T-5 (design.md §5.2/§5.3, not yet built as of
 * this task) gives `resetPassword` its own `sendAdminReset` dispatch, at which
 * point the `sendAdminReset` line must be replaced with an assertion on the
 * new call rather than deleted silently.
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
      // Widened in rework attempt 3 (see the file-header docblock): the
      // T-5 tripwire below asserts THIS method uncalled, not
      // `sendInvitation` — without this declaration, T-5's real
      // `sendAdminReset` call would throw a `TypeError` on an undefined
      // mock property inside `resetPassword`'s own swallowing `catch`,
      // and the tripwire would stay green over a broken assertion.
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
      cognitoMock
        .on(AdminCreateUserCommand)
        .resolves({ User: { Username: 'new@example.com' } });
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
      cognitoMock
        .on(AdminCreateUserCommand)
        .resolves({ User: { Username: 'plain@example.com' } });

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
      cognitoMock.on(AdminCreateUserCommand).resolves({
        User: {
          Username: 'invitee@example.com',
          Attributes: [{ Name: 'sub', Value: 'sub-real-0001' }],
        },
      });

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
        cognitoMock
          .on(AdminCreateUserCommand)
          .resolves({ User: { Username: 'nosub@example.com' } }); // no Attributes at all

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
      cognitoMock
        .on(AdminCreateUserCommand)
        .resolves({ User: { Username: 'blocked@example.com' } });
      cognitoMock
        .on(AdminAddUserToGroupCommand)
        .rejects(cognitoError('UserNotFoundException'));

      await expect(
        service.create({ email: 'blocked@example.com', role: 'staff' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mailService.sendInvitation).not.toHaveBeenCalled();
    });

    // ── FR-4 (all four clauses) + the task's disqualifier: a rejecting
    // transport must be proven to (a) still create the user, (b) still
    // return the temporary password, (c) never throw / never a 5xx, and
    // (d) return `emailSent: false`. Asserting only (d) would NOT cover
    // FR-4 (task disqualifier) — this test asserts all four.
    //
    // This is also Falsifier (2)'s pin: removing `dispatchInvitationEmail`'s
    // own `try`/`catch` lets the rejection propagate into the outer `try`,
    // which routes it through `mapCognitoError` — so `create()` would
    // REJECT instead of resolving, and every assertion below would redden.
    describe('a rejecting mail transport never fails the request', () => {
      let errorSpy: jest.SpyInstance;

      beforeEach(() => {
        errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      });

      afterEach(() => {
        errorSpy.mockRestore();
      });

      it('still returns the created user, the temporary password, and emailSent:false — and logs the failure without the password or the address', async () => {
        cognitoMock.on(AdminCreateUserCommand).resolves({
          User: {
            Username: 'rejected@example.com',
            Attributes: [{ Name: 'sub', Value: 'sub-reject-0002' }],
          },
        });
        const transportRejection = new Error('microservice unreachable');
        transportRejection.name = 'TransportRejectedError';
        mailService.sendInvitation.mockRejectedValue(transportRejection);

        // (c) never throws — this `await` alone falsifies (2) if the
        // dispatch's own try/catch is removed.
        const result = await service.create({
          email: 'rejected@example.com',
        } as never);

        // (a) the user was created.
        expect(result.user.id).toBe('rejected@example.com');
        // (b) the temporary password is still returned.
        expectPolicyValid(result.temporaryPassword);
        // (d) the not-sent signal is returned.
        expect(result.emailSent).toBe(false);

        // NFR-1: the failure is logged, but NEVER the password or the address.
        expect(errorSpy).toHaveBeenCalledTimes(1);
        const [emittedLine] = errorSpy.mock.calls[0] as [string];
        expect(emittedLine).toContain('TransportRejectedError');
        expect(emittedLine).toContain('sub-reject-0002');
        expect(emittedLine).not.toContain('rejected@example.com');
        expect(emittedLine).not.toContain(result.temporaryPassword);
        expect(emittedLine).not.toContain('@');
      });

      it(
        'logs `reference=n/a` — never the email address — when the transport rejects AND `sub` ' +
          'could not be resolved (Falsifier 3: a fallback to `dto.email` here must redden this test)',
        async () => {
          cognitoMock
            .on(AdminCreateUserCommand)
            .resolves({ User: { Username: 'nosub-reject@example.com' } }); // no Attributes
          mailService.sendInvitation.mockRejectedValue(new Error('down'));

          const result = await service.create({
            email: 'nosub-reject@example.com',
          } as never);

          expect(result.emailSent).toBe(false);
          expect(errorSpy).toHaveBeenCalledTimes(1);
          const [emittedLine] = errorSpy.mock.calls[0] as [string];
          expect(emittedLine).toContain('reference=n/a');
          expect(emittedLine).not.toContain('nosub-reject@example.com');
          expect(emittedLine).not.toContain('@');
        },
      );
    });
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

  // ── FR-7: resetPassword (no-email admin-mediated handoff) ─────────────────
  describe('resetPassword (FR-7)', () => {
    it('sets a temp password via AdminSetUserPassword (Permanent:false) and returns { temporaryPassword }', async () => {
      cognitoMock.on(AdminSetUserPasswordCommand).resolves({});

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

      // T-5 tripwire (auth/account-access-emails): resetPassword does not yet
      // dispatch ANY mail — this asserts BOTH methods uncalled. The line
      // that actually guards T-5's future change is `sendAdminReset` (that
      // is the method T-5 is designed to call, `mail.service.ts`'s
      // `sendAdminReset`, design.md §5.2/§5.3) — `sendInvitation` never
      // will be, so it stays a permanent property, not a tripwire. This
      // must go red the day T-5 adds the `sendAdminReset` call without
      // updating the `sendAdminReset` line below.
      expect(mailService.sendInvitation).not.toHaveBeenCalled();
      expect(mailService.sendAdminReset).not.toHaveBeenCalled();

      // The old email-based / re-invite paths are gone: neither is issued.
      expect(
        cognitoMock.commandCalls(AdminResetUserPasswordCommand),
      ).toHaveLength(0);
      expect(cognitoMock.commandCalls(AdminCreateUserCommand)).toHaveLength(0);
    });

    it('works without reading user status first (no AdminGetUser precondition)', async () => {
      cognitoMock.on(AdminSetUserPasswordCommand).resolves({});

      await service.resetPassword('sub-uuid-123');

      // No status probe: the single set-password call covers both
      // CONFIRMED and FORCE_CHANGE_PASSWORD users.
      expect(cognitoMock.commandCalls(AdminGetUserCommand)).toHaveLength(0);
      const calls = cognitoMock.commandCalls(AdminSetUserPasswordCommand);
      expect(calls).toHaveLength(1);
      // Username MUST be the passed id (sub/UUID), never an email alias.
      expect(calls[0].args[0].input.Username).toBe('sub-uuid-123');
    });
  });

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
