/**
 * useSession — auth-wiring spec, design.md §5, FR-2.
 *
 * Returns the current session ({ role, user }) from the SessionProvider context.
 * Falls back to the Public default when used outside the provider (e.g. during
 * static prerender) so the app never crashes — NFR-2 / NFR-7.
 *
 * TYPES ARE INTENTIONALLY UNCHANGED from the stub so that all existing consumers
 * compile without edits (FR-2 contract — do not alter Role, SessionUser, Session,
 * or the useSession() signature).
 *
 * Usage (inside any 'use client' component):
 *   const { role, user } = useSession();
 *   if (role === 'Admin') { ... }
 */

'use client';

import { useSessionContext } from './SessionProvider';

// ---------------------------------------------------------------------------
// Exported types — MUST remain identical to the original stub (FR-2)
// ---------------------------------------------------------------------------

export type Role = 'Public' | 'Staff' | 'Admin';

export interface SessionUser {
  name: string;
  role: Role;
}

export interface Session {
  role: Role;
  user: SessionUser | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useSession — returns the current session.
 *
 * Reads role and user from the nearest SessionProvider.
 * Returns { role: 'Public', user: null } when no provider is mounted
 * (static prerender, test isolation) — never throws.
 */
export function useSession(): Session {
  // useSessionContext returns the DEFAULT_CONTEXT (Public/no-user) when
  // called outside the provider, so this is safe during SSG/prerender.
  const { session } = useSessionContext();
  return session;
}
