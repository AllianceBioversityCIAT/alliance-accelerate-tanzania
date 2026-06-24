/**
 * Amplify configuration — auth-wiring spec, design.md §5.
 *
 * Reads Cognito User Pool coordinates from build-time NEXT_PUBLIC_* env vars
 * (baked like NEXT_PUBLIC_API_BASE_URL at `next build`; undefined at static
 * prerender time, which is fine — public pages must still render).
 *
 * Token-storage posture (NFR-5): Amplify v6 defaults to in-memory storage for
 * the access token + managed refresh via the refresh token (stored in
 * localStorage by default on web). This is acceptable for dev; the XSS
 * trade-off of the refresh token in localStorage should be revisited for prod
 * (e.g. httpOnly-cookie approach or in-memory-only with shorter session).
 *
 * Usage (call once on the client, safe to call multiple times):
 *   import { configureAmplify } from '@/lib/auth/amplify-config';
 *   configureAmplify();
 */

import { Amplify } from 'aws-amplify';

let configured = false;

/**
 * Configures Amplify Auth with the Cognito User Pool.
 * Guards against double-configure and against missing env vars (which are
 * expected at build/prerender time — the app still renders public pages).
 * Never throws at module import time or when env is absent.
 */
export function configureAmplify(): void {
  if (configured) return;

  const userPoolId     = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

  if (!userPoolId || !userPoolClientId) {
    // Not available at build/prerender time — public pages still render.
    // Log in development only so misconfiguration is visible.
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[amplify-config] NEXT_PUBLIC_COGNITO_USER_POOL_ID or NEXT_PUBLIC_COGNITO_CLIENT_ID is not set. ' +
        'Auth features will be unavailable.'
      );
    }
    return;
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
      },
    },
  });

  configured = true;
}

/** Reset for testing — re-allows configure to run. Not for production use. */
export function _resetAmplifyConfig(): void {
  configured = false;
}
