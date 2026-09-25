// /reset-password — where the admin-reset email lands (admin-reset.template.ts).
//
// It exists because /login redirects a visitor who already has a session
// straight into the app (LoginForm's already-authenticated guard), so a
// recipient with an open session never reached the form and kept working on
// the password the reset had just invalidated. This page clears the session
// first, then renders the same LoginForm.
//
// Static export compliance (NFR-2): client-side only, no route handlers.

'use client';

import { Suspense, useEffect, useState } from 'react';
import LoginForm from '@/components/auth/LoginForm';
import { useAuth } from '@/lib/auth/useAuth';

export default function ResetPasswordPage() {
  const { signOut, loading } = useAuth();
  const [cleared, setCleared] = useState(false);

  // Unconditional — signs out whether or not a session resolved, so a stale
  // token in storage cannot survive into the form. signOut never throws
  // (auth-client, NFR-7) and the provider sets Public before it resolves,
  // so LoginForm's guard cannot fire once this flips.
  useEffect(() => {
    if (loading) return;

    let active = true;
    void signOut().finally(() => {
      if (active) setCleared(true);
    });

    return () => {
      active = false;
    };
    // signOut is useCallback([]) in SessionProvider — stable for this purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12">
      {cleared ? (
        // LoginForm calls useSearchParams(); Suspense is required for static export.
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      ) : (
        <p role="status" aria-live="polite" className="text-sm text-muted">
          Signing you out…
        </p>
      )}
    </div>
  );
}
