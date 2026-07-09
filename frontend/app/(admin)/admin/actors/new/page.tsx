// @sdd-spec admin/actor-crud-audit (T-8)
'use client';

/**
 * /admin/actors/new — create actor page (FR-8).
 *
 * Static-export safe: 'use client'; no SSR / route handlers.
 * Auth guard: the (admin) layout already wraps this in <RequireRole allow={['Admin']}>;
 * we additionally resolve the access token via getSession() and redirect to /login
 * when unauthenticated.
 *
 * On successful creation the user is returned to /admin/actors.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { getSession } from '@/lib/auth/auth-client';

import ActorForm from '@/components/admin/ActorForm';
import Button from '@/components/ui/Button';
import Skeleton from '@/components/ui/Skeleton';

// ---------------------------------------------------------------------------
// Loading fallback
// ---------------------------------------------------------------------------

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-4xl">
      <Skeleton className="mb-2 h-8 w-48 rounded-md" />
      <Skeleton className="mb-6 h-4 w-72 rounded-sm" />
      <Skeleton className="h-96 w-full rounded-md" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewActorPage() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const session = await getSession();
      if (cancelled) return;

      if (!session) {
        router.push('/login');
        return;
      }

      setToken(session.accessToken);
      setLoading(false);
    }

    void init();
    return () => { cancelled = true; };
  }, [router]);

  const handleSuccess = useCallback(() => {
    router.push('/admin/actors');
  }, [router]);

  const handleAuthFailure = useCallback(() => {
    router.push('/login');
  }, [router]);

  if (loading) {
    return <PageSkeleton />;
  }

  if (!token) {
    return null;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold text-fg">New actor</h1>
        <p className="mt-1 text-sm text-muted">Create a new registry actor.</p>
      </div>

      <ActorForm
        mode="create"
        token={token}
        onSuccess={handleSuccess}
        onAuthFailure={handleAuthFailure}
      />
    </div>
  );
}
