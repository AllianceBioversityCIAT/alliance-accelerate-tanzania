// @sdd-spec admin/actor-crud-audit (T-3)
/**
 * T-3 — ActingAdminResolver unit tests with a mocked Cognito client.
 *
 * The resolver is a thin wrapper around `ListUsersCommand` with a per-instance
 * in-memory cache. These tests assert the cache behaviour and the failure-null
 * contract (design §4, §8 ADR):
 *   - cache miss issues one `ListUsers` call with filter `sub = "..."` and Limit 1;
 *   - cache hit reuses the result without a second SDK call;
 *   - SDK failure, missing user, and missing email attribute all return `null`.
 *
 * The shared Cognito client singleton is reset between specs via
 * `resetCognitoAdminClient()` and the required env vars are set in `beforeAll`.
 */

import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { mockClient } from 'aws-sdk-client-mock';

import { ActingAdminResolver } from './acting-admin.resolver';
import { resetCognitoAdminClient } from '../users/cognito-admin.client';

const cognitoMock = mockClient(CognitoIdentityProviderClient);

describe('ActingAdminResolver', () => {
  let resolver: ActingAdminResolver;

  beforeAll(() => {
    process.env.COGNITO_USER_POOL_ID = 'us-east-1_TESTPOOL';
    process.env.AWS_REGION = 'us-east-1';
    process.env.COGNITO_CLIENT_ID = 'test-client-id';
  });

  beforeEach(() => {
    cognitoMock.reset();
    resetCognitoAdminClient();
    resolver = new ActingAdminResolver();
  });

  it('resolves sub to email on cache miss', async () => {
    cognitoMock.on(ListUsersCommand).resolves({
      Users: [
        {
          Username: 'sub-1',
          Attributes: [
            { Name: 'sub', Value: 'sub-1' },
            { Name: 'email', Value: 'admin@example.com' },
          ],
        },
      ],
    });

    const email = await resolver.resolve('sub-1');

    expect(email).toBe('admin@example.com');
    const calls = cognitoMock.commandCalls(ListUsersCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input).toMatchObject({
      UserPoolId: 'us-east-1_TESTPOOL',
      Limit: 1,
      Filter: 'sub = "sub-1"',
    });
  });

  it('uses cache on second resolve for same sub (no SDK call)', async () => {
    cognitoMock.on(ListUsersCommand).resolves({
      Users: [
        {
          Username: 'sub-1',
          Attributes: [{ Name: 'email', Value: 'admin@example.com' }],
        },
      ],
    });

    const first = await resolver.resolve('sub-1');
    const second = await resolver.resolve('sub-1');

    expect(first).toBe('admin@example.com');
    expect(second).toBe('admin@example.com');
    expect(cognitoMock.commandCalls(ListUsersCommand)).toHaveLength(1);
  });

  it('returns null when the SDK call fails', async () => {
    cognitoMock.on(ListUsersCommand).rejects(new Error('Cognito outage'));

    const email = await resolver.resolve('sub-1');

    expect(email).toBeNull();
    expect(cognitoMock.commandCalls(ListUsersCommand)).toHaveLength(1);
  });

  it('returns null when the user has no email attribute', async () => {
    cognitoMock.on(ListUsersCommand).resolves({
      Users: [
        {
          Username: 'sub-1',
          Attributes: [{ Name: 'sub', Value: 'sub-1' }],
        },
      ],
    });

    const email = await resolver.resolve('sub-1');

    expect(email).toBeNull();
  });

  it('returns null when the user is not found', async () => {
    cognitoMock.on(ListUsersCommand).resolves({ Users: [] });

    const email = await resolver.resolve('sub-1');

    expect(email).toBeNull();
  });
});
