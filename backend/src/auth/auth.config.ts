/**
 * Cognito configuration read from the Lambda environment (design §4).
 *
 * Resolved lazily — only when the guard actually verifies a token — so a
 * public-only local run (no Cognito env) can still bootstrap and serve the
 * anonymous endpoints. A missing var throws a clear error at first use, not at
 * app startup, keeping the public path unaffected (FR-8).
 */
export interface CognitoConfig {
  userPoolId: string;
  clientId: string;
  region: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required Cognito env var ${name}. Set COGNITO_USER_POOL_ID, ` +
        'COGNITO_CLIENT_ID and AWS_REGION on the Lambda (infra §7).',
    );
  }
  return value;
}

/** Read + validate the Cognito config from env (throws if incomplete). */
export function getCognitoConfig(): CognitoConfig {
  return {
    userPoolId: required('COGNITO_USER_POOL_ID'),
    clientId: required('COGNITO_CLIENT_ID'),
    region: required('AWS_REGION'),
  };
}
