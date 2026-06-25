'use client';

/**
 * useAuth — auth-wiring spec, design.md §5.
 *
 * Returns the auth action surface from the SessionProvider: signIn, signOut,
 * and the loading flag. Intended for action components (LoginForm, Header
 * sign-out button) that need to trigger auth flows.
 *
 * Read-only role/user consumers should use useSession() instead.
 *
 * Usage (inside a 'use client' component):
 *   const { signIn, signOut, loading } = useAuth();
 */

import { useSessionContext } from './SessionProvider';
import type { SignInCredentials, SignInResult } from './auth-client';

export interface UseAuthResult {
  /** Initiates sign-in; returns a discriminated result (authenticated | new_password_required | error). */
  signIn:  (credentials: SignInCredentials) => Promise<SignInResult>;
  /** Clears the session; useSession() will return Public afterwards (FR-3). */
  signOut: () => Promise<void>;
  /** Re-resolves the session (e.g. after confirmNewPassword). */
  refresh: () => Promise<void>;
  /** True while the initial session fetch is in-flight. */
  loading: boolean;
}

/**
 * useAuth — exposes signIn / signOut / refresh / loading from the SessionProvider.
 * Returns no-op defaults when used outside the provider (safe during prerender).
 */
export function useAuth(): UseAuthResult {
  const { signIn, signOut, refresh, loading } = useSessionContext();
  return { signIn, signOut, refresh, loading };
}
