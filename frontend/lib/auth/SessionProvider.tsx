'use client';

/**
 * SessionProvider — auth-wiring spec, design.md §5.
 *
 * Client component boundary that:
 *   1. Configures Amplify once on mount.
 *   2. Resolves the current Cognito session (survives reload via token refresh — FR-2).
 *   3. Exposes { session, loading, signIn, signOut, refresh } via SessionContext.
 *
 * Mount once in frontend/app/layout.tsx wrapping {children}.
 * Public pages render correctly even when NEXT_PUBLIC_COGNITO_* are absent
 * (static prerender — the provider degrades to Public / loading=false — NFR-2).
 *
 * Usage:
 *   // layout.tsx
 *   import { SessionProvider } from '@/lib/auth/SessionProvider';
 *   <SessionProvider>{children}</SessionProvider>
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { configureAmplify } from './amplify-config';
import {
  getSession,
  signIn   as clientSignIn,
  signOut  as clientSignOut,
  type SignInCredentials,
  type SignInResult,
} from './auth-client';
import type { Role, Session } from './useSession';

// ---------------------------------------------------------------------------
// Context value shape
// ---------------------------------------------------------------------------

export interface SessionContextValue {
  /** Current resolved session (role + user). */
  session: Session;
  /** True while the initial token fetch is in-flight. */
  loading: boolean;
  /** Sign in with email+password. Returns the discriminated result. */
  signIn: (credentials: SignInCredentials) => Promise<SignInResult>;
  /** Sign out; transitions session to Public. */
  signOut: () => Promise<void>;
  /** Re-read the current Amplify session (e.g. after confirmNewPassword). */
  refresh: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const PUBLIC_SESSION: Session = { role: 'Public', user: null };

const DEFAULT_CONTEXT: SessionContextValue = {
  session: PUBLIC_SESSION,
  loading: false,
  signIn:  async () => ({ status: 'error', message: 'SessionProvider not mounted.' }),
  signOut: async () => {},
  refresh: async () => {},
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const SessionContext = createContext<SessionContextValue>(DEFAULT_CONTEXT);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>(PUBLIC_SESSION);
  const [loading, setLoading] = useState<boolean>(true);

  /** Fetches the Amplify session and maps it to our Session shape. */
  const resolveSession = useCallback(async () => {
    const auth = await getSession();

    if (!auth) {
      setSession(PUBLIC_SESSION);
      return;
    }

    setSession({
      role: auth.role as Role,
      user: { name: auth.user.name, role: auth.role as Role },
    });
  }, []);

  // On mount: configure Amplify then resolve the current session (FR-2).
  useEffect(() => {
    let cancelled = false;

    async function init() {
      configureAmplify();
      await resolveSession();
      if (!cancelled) setLoading(false);
    }

    init();

    return () => {
      cancelled = true;
    };
  // resolveSession is stable (useCallback with no deps) — safe to include.
  }, [resolveSession]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleSignIn = useCallback(
    async (credentials: SignInCredentials): Promise<SignInResult> => {
      const result = await clientSignIn(credentials);
      if (result.status === 'authenticated') {
        await resolveSession();
      }
      return result;
    },
    [resolveSession]
  );

  const handleSignOut = useCallback(async () => {
    await clientSignOut();
    setSession(PUBLIC_SESSION);
  }, []);

  const handleRefresh = useCallback(async () => {
    await resolveSession();
  }, [resolveSession]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <SessionContext.Provider
      value={{
        session,
        loading,
        signIn:  handleSignIn,
        signOut: handleSignOut,
        refresh: handleRefresh,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Internal hook (consumed by useSession + useAuth)
// ---------------------------------------------------------------------------

/**
 * Returns the raw SessionContextValue.
 * Exported for useAuth; prefer useSession() for read-only role/user access.
 */
export function useSessionContext(): SessionContextValue {
  return useContext(SessionContext);
}
