// @sdd-spec admin/registration-review-queue (T-13)
'use client';

/**
 * /admin/registrations/review?id=<registrationId> — Admin registration
 * detail (FR-10, FR-11 scenario 1, NFR-7).
 *
 * **Static-export compliance (NFR-7 — "unusually, a green build here is
 * real evidence").** `ReviewView` uses `useSearchParams()`, which triggers
 * the Next.js static-export CSR bailout under `output: 'export'` — wrapping
 * it in `<Suspense>` is what lets `npm run build` succeed at all. A `[id]`
 * dynamic segment or an un-Suspensed `useSearchParams()` both fail the
 * build outright (`frontend/CLAUDE.md`'s query-param pattern; mirrors
 * `app/(admin)/admin/actors/edit/page.tsx`'s `?id=` shape exactly).
 *
 * **A-72 — the id is guarded before use.** `registrations-admin.ts`'s
 * `adminGetRegistration` interpolates the id UNENCODED
 * (`` `${BASE}/${id}` ``, matching `adminGetActor`'s identical pattern in
 * `actors-admin.ts`). A crafted `?id=` value containing `../` would be
 * normalised by the URL parser before the request is sent, redirecting it
 * off the intended path. `sanitizeRegistrationId` below rejects anything
 * outside a registration id's actual shape (a Prisma `cuid()` — lowercase
 * alphanumerics only) BEFORE it ever reaches `adminGetRegistration`; an
 * invalid id is treated identically to a missing one and never becomes a
 * network call.
 *
 * Auth guard: the `(admin)` layout already wraps this in
 * `<RequireRole allow={['Admin']}>`; this page additionally resolves the
 * access token via `getSession()` and redirects to `/login` on
 * unauthenticated or `AuthFailureError` — server-side enforcement is the
 * real gate (DD-22 / `frontend/CLAUDE.md`).
 */

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { getSession } from '@/lib/auth/auth-client';
import { adminGetRegistration, type AdminRegistrationDetail } from '@/lib/api/registrations-admin';
import { ApiError, AuthFailureError } from '@/lib/api/client';

import { RegistrationDetailPanel } from '@/components/admin/RegistrationDetailPanel';
import Button from '@/components/ui/Button';
import Skeleton from '@/components/ui/Skeleton';

// ---------------------------------------------------------------------------
// A-72 — id shape guard
// ---------------------------------------------------------------------------

/**
 * A Prisma `cuid()` is lowercase alphanumeric only (no `/`, `.`, or other
 * URL-structural characters). Anything else — including a value carrying
 * `../` — is rejected here rather than being passed to
 * `adminGetRegistration`, which interpolates it unencoded.
 */
const SAFE_ID_PATTERN = /^[a-z0-9]+$/i;

function sanitizeRegistrationId(raw: string | null): string | null {
  if (!raw) return null;
  if (!SAFE_ID_PATTERN.test(raw)) return null;
  return raw;
}

// ---------------------------------------------------------------------------
// Not-found / error state
// ---------------------------------------------------------------------------

interface NotFoundStateProps {
  title?: string;
  description?: string;
}

function NotFoundState({ title = 'Registration not found', description }: NotFoundStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-md border border-border bg-surface py-16 px-4 text-center">
      <p className="text-base font-semibold text-fg">{title}</p>
      {description && <p className="text-sm text-muted">{description}</p>}
      <Button href="/admin/registrations" variant="secondary">
        Back to registrations
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suspense fallback
// ---------------------------------------------------------------------------

function ReviewFallback() {
  return (
    <div className="mx-auto max-w-4xl">
      <Skeleton className="mb-2 h-8 w-48 rounded-md" />
      <Skeleton className="mb-6 h-4 w-72 rounded-sm" />
      <Skeleton className="h-96 w-full rounded-md" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review view (uses useSearchParams)
// ---------------------------------------------------------------------------

function ReviewView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = sanitizeRegistrationId(searchParams.get('id'));

  const [token, setToken] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminRegistrationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
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
        const data = await adminGetRegistration(id, session.accessToken);
        if (cancelled) return;
        setDetail(data);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof AuthFailureError) {
          router.push('/login');
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          setError('Registration not found.');
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load registration.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  if (loading) {
    return <ReviewFallback />;
  }

  if (!token) {
    return null;
  }

  if (!id) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-extrabold text-fg">Registration review</h1>
          <p className="mt-1 text-sm text-muted">No registration id provided.</p>
        </div>
        <NotFoundState
          title="Missing registration id"
          description="Use the Review link from the registrations queue."
        />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-extrabold text-fg">Registration review</h1>
          <p className="mt-1 text-sm text-muted">Could not load the requested registration.</p>
        </div>
        <NotFoundState description={error ?? undefined} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <RegistrationDetailPanel detail={detail} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page with Suspense boundary
// ---------------------------------------------------------------------------

export default function RegistrationReviewPage() {
  return (
    <Suspense fallback={<ReviewFallback />}>
      <ReviewView />
    </Suspense>
  );
}
