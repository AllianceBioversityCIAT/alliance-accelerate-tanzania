// @sdd-spec admin/user-management (T-5)
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
 *  - command shape: `AdminCreateUserCommand` (DesiredDeliveryMediums ['EMAIL'])
 *    + group add; `setRole` clears both groups then adds; `resetPassword`.
 *  - self-lockout (FR-8): demote/delete self → 409 with NO Cognito command;
 *    promoting self to `admin` is allowed.
 *  - no-leak (FR-10): serialized keys are EXACTLY the AdminUser allowlist.
 *  - error mapping: UsernameExists → 409, UserNotFound → 404.
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminResetUserPasswordCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { mockClient } from 'aws-sdk-client-mock';

import { UsersService } from './users.service';
import { resetCognitoAdminClient } from './cognito-admin.client';

const cognitoMock = mockClient(CognitoIdentityProviderClient);

/** A Cognito error mirrors the SDK shape — the mapper discriminates on `name`. */
function cognitoError(name: string): Error {
  const err = new Error(name);
  err.name = name;
  return err;
}

describe('UsersService (mocked Cognito)', () => {
  let service: UsersService;

  beforeAll(() => {
    process.env.COGNITO_USER_POOL_ID = 'us-east-1_TESTPOOL';
    process.env.AWS_REGION = 'us-east-1';
    process.env.COGNITO_CLIENT_ID = 'test-client-id';
  });

  beforeEach(() => {
    cognitoMock.reset();
    resetCognitoAdminClient();
    service = new UsersService();
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

  // ── FR-3: create ───────────────────────────────────────────────────────
  describe('create (FR-3)', () => {
    it('sends AdminCreateUser with DesiredDeliveryMediums ["EMAIL"] and adds to group when role given', async () => {
      cognitoMock
        .on(AdminCreateUserCommand)
        .resolves({ User: { Username: 'new@example.com' } });
      cognitoMock.on(AdminAddUserToGroupCommand).resolves({});

      const user = await service.create({
        email: 'new@example.com',
        role: 'staff',
      } as never);

      const createCalls = cognitoMock.commandCalls(AdminCreateUserCommand);
      expect(createCalls).toHaveLength(1);
      expect(createCalls[0].args[0].input).toMatchObject({
        UserPoolId: 'us-east-1_TESTPOOL',
        Username: 'new@example.com',
        DesiredDeliveryMediums: ['EMAIL'],
      });

      const addCalls = cognitoMock.commandCalls(AdminAddUserToGroupCommand);
      expect(addCalls).toHaveLength(1);
      expect(addCalls[0].args[0].input).toMatchObject({
        GroupName: 'staff',
        Username: 'new@example.com',
      });
      expect(user.roles).toEqual(['staff']);
    });

    it('does NOT add to any group when no role is supplied', async () => {
      cognitoMock
        .on(AdminCreateUserCommand)
        .resolves({ User: { Username: 'plain@example.com' } });

      const user = await service.create({ email: 'plain@example.com' } as never);

      expect(cognitoMock.commandCalls(AdminAddUserToGroupCommand)).toHaveLength(
        0,
      );
      expect(user.roles).toEqual([]);
    });

    // ── Error mapping (NFR-4): UsernameExists → 409 ──────────────────────
    it('maps UsernameExistsException → ConflictException (409)', async () => {
      cognitoMock
        .on(AdminCreateUserCommand)
        .rejects(cognitoError('UsernameExistsException'));

      await expect(
        service.create({ email: 'dupe@example.com' } as never),
      ).rejects.toBeInstanceOf(ConflictException);
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

  // ── FR-7: resetPassword ──────────────────────────────────────────────────
  describe('resetPassword (FR-7)', () => {
    it('sends AdminResetUserPassword (email-based, no plaintext)', async () => {
      cognitoMock.on(AdminResetUserPasswordCommand).resolves({});

      await service.resetPassword('some-sub');

      const calls = cognitoMock.commandCalls(AdminResetUserPasswordCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input).toMatchObject({
        UserPoolId: 'us-east-1_TESTPOOL',
        Username: 'some-sub',
      });
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
