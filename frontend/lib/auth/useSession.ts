/**
 * Session stub — DD-4 (design.md §10).
 *
 * Returns the default unauthenticated Public session.
 * Cognito wiring is a future spec: when the auth spec lands, replace this
 * implementation with a real token-validation hook (e.g. via Amplify or a
 * Cognito JWT check) while keeping the same exported types/hook signature so
 * that every consumer compiles without changes.
 */

export type Role = 'Public' | 'Staff' | 'Admin';

export interface SessionUser {
  name: string;
  role: Role;
}

export interface Session {
  role: Role;
  user: SessionUser | null;
}

/**
 * useSession — returns the current session.
 *
 * Default (stub): unauthenticated Public visitor.
 * Future: swap body for Cognito/Amplify token resolution; types remain stable.
 */
export function useSession(): Session {
  // Stub: always returns Public / no user.
  // Replace with real auth detection when Cognito spec is implemented.
  return { role: 'Public', user: null };
}
