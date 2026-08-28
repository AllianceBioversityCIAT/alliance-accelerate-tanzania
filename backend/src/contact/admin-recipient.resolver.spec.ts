// @sdd-spec contact/contact-channels (T-5)
/**
 * T-5 — AdminRecipientResolver unit tests with a mocked Cognito client.
 *
 * Covers (design.md §4.3, requirements.md FR-3, NFR-8, DC-2):
 *   - every current `admin` member is resolved, paginating over `NextToken`
 *     until exhausted;
 *   - `staff` never appears, because the resolver only ever queries the
 *     `admin` group by name;
 *   - cache semantics DISCRIMINATE: a second call inside the 60 s TTL issues
 *     no SDK call, and a call after the TTL does (KZ-002 — not merely that a
 *     cache field exists);
 *   - the resolver never returns an empty array: an empty group and a
 *     directory failure both degrade to the configured fallback (the
 *     forward pointer from T-1's review — the transport downstream adds no
 *     guard against an empty `to` list);
 *   - the degradation is logged with no recipient address;
 *   - `CONTACT_FALLBACK_RECIPIENT` is resolved LAZILY, at first use inside
 *     `resolve()`'s fallback path — never at construction, and never at
 *     module init — amended 2026-08-28 after T-6 registered `ContactModule`
 *     in `AppModule` and an init-time throw took down 12 unrelated e2e
 *     suites. A dedicated case proves the resolver can be constructed AND
 *     have its module lifecycle run through Nest's own DI container with
 *     the variable unset (KZ-002 — this must fail if init-time validation
 *     were reinstated).
 *
 * The shared Cognito client singleton is reset between specs via
 * `resetCognitoAdminClient()`, mirroring `acting-admin.resolver.spec.ts`.
 */

import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { mockClient } from 'aws-sdk-client-mock';

import { AdminRecipientResolver } from './admin-recipient.resolver';
import { resetCognitoAdminClient } from '../users/cognito-admin.client';

const cognitoMock = mockClient(CognitoIdentityProviderClient);

const FALLBACK = 'fallback@example.com';

describe('AdminRecipientResolver', () => {
  let resolver: AdminRecipientResolver;

  beforeAll(() => {
    process.env.COGNITO_USER_POOL_ID = 'us-east-1_TESTPOOL';
    process.env.AWS_REGION = 'us-east-1';
    process.env.COGNITO_CLIENT_ID = 'test-client-id';
  });

  beforeEach(() => {
    cognitoMock.reset();
    resetCognitoAdminClient();
    process.env.CONTACT_FALLBACK_RECIPIENT = FALLBACK;
    resolver = new AdminRecipientResolver();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves every current admin member', async () => {
    cognitoMock.on(ListUsersInGroupCommand).resolves({
      Users: [
        { Username: 'u1', Attributes: [{ Name: 'email', Value: 'a@example.com' }] },
        { Username: 'u2', Attributes: [{ Name: 'email', Value: 'b@example.com' }] },
      ],
    });

    const emails = await resolver.resolve();

    expect(emails).toEqual(['a@example.com', 'b@example.com']);
    const calls = cognitoMock.commandCalls(ListUsersInGroupCommand);
    expect(calls[0].args[0].input).toMatchObject({
      UserPoolId: 'us-east-1_TESTPOOL',
      GroupName: 'admin',
    });
  });

  it('paginates over NextToken until exhausted — every page appears', async () => {
    cognitoMock
      .on(ListUsersInGroupCommand)
      .resolvesOnce({
        Users: [{ Attributes: [{ Name: 'email', Value: 'page1@example.com' }] }],
        NextToken: 'token-2',
      })
      .resolvesOnce({
        Users: [{ Attributes: [{ Name: 'email', Value: 'page2@example.com' }] }],
        NextToken: 'token-3',
      })
      .resolvesOnce({
        Users: [{ Attributes: [{ Name: 'email', Value: 'page3@example.com' }] }],
      });

    const emails = await resolver.resolve();

    expect(emails).toEqual(['page1@example.com', 'page2@example.com', 'page3@example.com']);
    expect(cognitoMock.commandCalls(ListUsersInGroupCommand)).toHaveLength(3);
  });

  it('never queries or includes staff group members — excluded by construction', async () => {
    cognitoMock
      .on(ListUsersInGroupCommand, { GroupName: 'admin' })
      .resolves({ Users: [{ Attributes: [{ Name: 'email', Value: 'admin@example.com' }] }] });
    cognitoMock
      .on(ListUsersInGroupCommand, { GroupName: 'staff' })
      .resolves({ Users: [{ Attributes: [{ Name: 'email', Value: 'staff@example.com' }] }] });

    const emails = await resolver.resolve();

    expect(emails).toEqual(['admin@example.com']);
    expect(emails).not.toContain('staff@example.com');
    const calls = cognitoMock.commandCalls(ListUsersInGroupCommand);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.args[0].input.GroupName).toBe('admin');
    }
  });

  describe('cache semantics', () => {
    it('issues NO SDK call on a second resolve() within the 60 s TTL', async () => {
      cognitoMock.on(ListUsersInGroupCommand).resolves({
        Users: [{ Attributes: [{ Name: 'email', Value: 'a@example.com' }] }],
      });

      const now = 1_700_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      const first = await resolver.resolve();

      jest.spyOn(Date, 'now').mockReturnValue(now + 59_000);
      const second = await resolver.resolve();

      expect(first).toEqual(['a@example.com']);
      expect(second).toEqual(['a@example.com']);
      expect(cognitoMock.commandCalls(ListUsersInGroupCommand)).toHaveLength(1);
    });

    it('DOES issue a new SDK call once the 60 s TTL has elapsed', async () => {
      cognitoMock.on(ListUsersInGroupCommand).resolves({
        Users: [{ Attributes: [{ Name: 'email', Value: 'a@example.com' }] }],
      });

      const now = 1_700_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      await resolver.resolve();

      jest.spyOn(Date, 'now').mockReturnValue(now + 60_001);
      await resolver.resolve();

      expect(cognitoMock.commandCalls(ListUsersInGroupCommand)).toHaveLength(2);
    });

    it('resetCache() forces a fresh SDK call even inside the TTL window', async () => {
      cognitoMock.on(ListUsersInGroupCommand).resolves({
        Users: [{ Attributes: [{ Name: 'email', Value: 'a@example.com' }] }],
      });

      await resolver.resolve();
      resolver.resetCache();
      await resolver.resolve();

      expect(cognitoMock.commandCalls(ListUsersInGroupCommand)).toHaveLength(2);
    });
  });

  describe('fallback — never an empty list', () => {
    it('falls back when the admin group resolves empty', async () => {
      cognitoMock.on(ListUsersInGroupCommand).resolves({ Users: [] });

      const emails = await resolver.resolve();

      expect(emails).toEqual([FALLBACK]);
      expect(emails.length).toBeGreaterThan(0);
    });

    it('falls back when the directory call fails, and never throws to its caller', async () => {
      cognitoMock.on(ListUsersInGroupCommand).rejects(new Error('Cognito outage'));

      await expect(resolver.resolve()).resolves.toEqual([FALLBACK]);
    });

    it('falls back when a later page in the pagination loop fails', async () => {
      cognitoMock
        .on(ListUsersInGroupCommand)
        .resolvesOnce({
          Users: [{ Attributes: [{ Name: 'email', Value: 'page1@example.com' }] }],
          NextToken: 'token-2',
        })
        .rejectsOnce(new Error('Cognito outage mid-pagination'));

      const emails = await resolver.resolve();

      expect(emails).toEqual([FALLBACK]);
    });

    it('logs the degradation with no recipient address', async () => {
      cognitoMock.on(ListUsersInGroupCommand).rejects(new Error('Cognito outage'));
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await resolver.resolve();

      expect(warnSpy).toHaveBeenCalled();
      const loggedText = warnSpy.mock.calls
        .map((args) => args.map((a) => String(a)).join(' '))
        .join(' | ');
      expect(loggedText).not.toContain(FALLBACK);
    });
  });

  describe('CONTACT_FALLBACK_RECIPIENT validation — lazy, at first use', () => {
    it('does NOT throw at construction when unset', () => {
      delete process.env.CONTACT_FALLBACK_RECIPIENT;

      expect(() => new AdminRecipientResolver()).not.toThrow();
    });

    it('throws inside resolve()\'s fallback path, at first use, when unset', async () => {
      delete process.env.CONTACT_FALLBACK_RECIPIENT;
      cognitoMock.on(ListUsersInGroupCommand).resolves({ Users: [] });
      const freshResolver = new AdminRecipientResolver();

      await expect(freshResolver.resolve()).rejects.toThrow(/CONTACT_FALLBACK_RECIPIENT/);
    });

    it('throws inside resolve()\'s fallback path when the directory call fails and the var is unset', async () => {
      delete process.env.CONTACT_FALLBACK_RECIPIENT;
      cognitoMock.on(ListUsersInGroupCommand).rejects(new Error('Cognito outage'));
      const freshResolver = new AdminRecipientResolver();

      await expect(freshResolver.resolve()).rejects.toThrow(/CONTACT_FALLBACK_RECIPIENT/);
    });
  });

  describe('module graph — AppModule-shaped boot with CONTACT_FALLBACK_RECIPIENT unset', () => {
    it('constructs the resolver through Nest\'s DI container and completes its module lifecycle with the variable unset (KZ-002 — fails if init-time validation is reinstated)', async () => {
      delete process.env.CONTACT_FALLBACK_RECIPIENT;

      const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [AdminRecipientResolver],
      }).compile();

      // .init() runs the Nest module lifecycle (onModuleInit et al.) for
      // every provider in this graph — the same lifecycle AppModule runs at
      // real boot. If AdminRecipientResolver ever reimplemented
      // OnModuleInit with an init-time throw, this call is what would
      // surface it.
      await expect(moduleRef.init()).resolves.toBeDefined();

      const booted = moduleRef.get(AdminRecipientResolver);
      expect(booted).toBeInstanceOf(AdminRecipientResolver);
    });
  });
});
