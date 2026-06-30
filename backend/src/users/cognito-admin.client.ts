// @sdd-spec admin/user-management (T-1)
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { getCognitoConfig } from '../auth/auth.config';

/**
 * Single, shared Cognito Identity Provider admin client (Lambda-tuned —
 * mirrors the {@link getJwtVerifier} singleton). One instance per container is
 * reused across warm invocations, so SDK credential/HTTP setup happens only on
 * the first admin call (design §9 cold-start mitigation).
 *
 * Created lazily on first use and the region is resolved from the same Cognito
 * env config as the JWT verifier, so a public-only run without the Cognito env
 * never constructs it.
 */
let client: CognitoIdentityProviderClient | undefined;

export function getCognitoAdminClient(): CognitoIdentityProviderClient {
  if (!client) {
    const { region } = getCognitoConfig();
    client = new CognitoIdentityProviderClient({ region });
  }
  return client;
}

/** Read the configured user pool id from env (throws if missing). */
export function getUserPoolId(): string {
  const value = process.env.COGNITO_USER_POOL_ID;
  if (!value) {
    throw new Error(
      'Missing required Cognito env var COGNITO_USER_POOL_ID. Set ' +
        'COGNITO_USER_POOL_ID and AWS_REGION on the Lambda (infra §7).',
    );
  }
  return value;
}

/** Test seam — reset the cached singleton between specs. */
export function resetCognitoAdminClient(): void {
  client = undefined;
}
