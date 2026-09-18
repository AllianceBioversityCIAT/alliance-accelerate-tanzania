// @sdd-spec admin/actor-crud-audit (T-8)
'use client';

/**
 * /admin/actors/edit — edit actor page (FR-8).
 *
 * Static-export compliance (NFR-2 / design.md §8 ADR):
 *   EditActorView uses useSearchParams() which triggers a CSR bailout under
 *   `output: 'export'`. Wrapping EditActorView in <Suspense> satisfies the
 *   Next.js static-export requirement and allows the build to succeed.
 *
 * Route shape: /admin/actors/edit?id=<actorId>
 *   A query-param client page (not a [id] dynamic segment) so any actor id
 *   resolves at runtime without build-time API coupling.
 *
 * Auth guard: the (admin) layout already wraps this in <RequireRole allow={['Admin']}>;
 * we additionally resolve the access token via getSession() and redirect to /login
 * on unauthenticated or AuthFailureError.
 *
 * On successful update the user is returned to /admin/actors.
 */

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { getSession } from '@/lib/auth/auth-client';
import { adminGetActor, type AdminActor } from '@/lib/api/actors-admin';
import { AuthFailureError } from '@/lib/api/client';

import ActorForm from '@/components/admin/ActorForm';
import { ActorHistoryPanel } from '@/components/admin/ActorHistoryPanel';
import Button from '@/components/ui/Button';
import Skeleton from '@/components/ui/Skeleton';

// ---------------------------------------------------------------------------
// Not-found / error state
// ---------------------------------------------------------------------------

interface NotFoundStateProps {
  title?: string;
  description?: string;
}

function NotFoundState({ title = 'Actor not found', description }: NotFoundStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-md border border-border bg-surface py-16 px-4 text-center">
      <p className="text-base font-semibold text-fg">{title}</p>
      {description && <p className="text-sm text-muted">{description}</p>}
      <Button href="/admin/actors" variant="secondary">
        Back to actors
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suspense fallback
// ---------------------------------------------------------------------------

function EditFallback() {
  return (
    <div className="mx-auto max-w-4xl">
      <Skeleton className="mb-2 h-8 w-48 rounded-md" />
      <Skeleton className="mb-6 h-4 w-72 rounded-sm" />
      <Skeleton className="h-96 w-full rounded-md" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit view (uses useSearchParams)
// ---------------------------------------------------------------------------

function EditActorView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');

  const [token, setToken] = useState<string | null>(null);
  const [actor, setActor] = useState<AdminActor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // R-1 (delta round item 3) — this effect's deps are [id, router], so
      // it re-runs on every searchParams-only id change, but `error`/`loading`
      // were never reset here. Without this, a failed fetch for one id
      // (`error` set) followed by navigating to a DIFFERENT, valid id left
      // `error` truthy forever: `if (error || !actor)` below stays true even
      // after the new fetch succeeds and `actor` is populated, so the page
      // keeps showing the stale "Could not load actor" state instead of the
      // form. Resetting both here means each id gets its own loading/error
      // lifecycle, same as a fresh mount would.
      setError(null);
      setLoading(true);

      const session = await getSession();
      if (cancelled) return;

      if (!session) {
        router.push('/login');
        return;
      }

      setToken(session.accessToken);

      if (!id) {
        setLoading(false);
        return;
      }

      try {
        const data = await adminGetActor(id, session.accessToken);
        if (cancelled) return;
        setActor(data);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof AuthFailureError) {
          router.push('/login');
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to load actor.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void init();
    return () => { cancelled = true; };
  }, [id, router]);

  const handleSuccess = useCallback(() => {
    router.push('/admin/actors');
  }, [router]);

  const handleAuthFailure = useCallback(() => {
    router.push('/login');
  }, [router]);

  if (loading) {
    return <EditFallback />;
  }

  if (!token) {
    return null;
  }

  if (!id) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-extrabold text-fg">Edit actor</h1>
          <p className="mt-1 text-sm text-muted">No actor id provided.</p>
        </div>
        <NotFoundState title="Missing actor id" description="Use the link from the actors table to edit a record." />
      </div>
    );
  }

  if (error || !actor) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-extrabold text-fg">Edit actor</h1>
          <p className="mt-1 text-sm text-muted">Could not load the requested actor.</p>
        </div>
        <NotFoundState
          title={error?.toLowerCase().includes('not found') ? 'Actor not found' : 'Could not load actor'}
          description={error ?? undefined}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold text-fg">Edit actor</h1>
        <p className="mt-1 text-sm text-muted">{actor.traderName}</p>
      </div>

      {/*
        key={actor.id} is load-bearing (R-1 fix): App Router does not unmount
        this route on a searchParams-only navigation (?id=A -> ?id=B via
        back/forward), and ActorForm freezes its field values in a one-shot
        useState(() => toFormValues(initialValues)) that never re-syncs to a
        changed `initialValues` prop. Without a key keyed on the resolved
        actor id, editing actor B after having viewed actor A keeps A's
        field values mounted while `doSubmit` targets `initialValues.id` (B)
        -- a save silently writes A's data onto B. The key forces a remount
        so the lazy initializer re-runs against B's data.
      */}
      <ActorForm
        key={actor.id}
        mode="edit"
        initialValues={actor}
        token={token}
        onSuccess={handleSuccess}
        onAuthFailure={handleAuthFailure}
      />

      <ActorHistoryPanel actorId={actor.id} token={token} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page with Suspense boundary
// ---------------------------------------------------------------------------

export default function EditActorPage() {
  return (
    <Suspense fallback={<EditFallback />}>
      <EditActorView />
    </Suspense>
  );
}
