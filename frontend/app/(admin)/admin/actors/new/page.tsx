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
 * On successful creation the user is returned to /admin/actors — unless the
 * create produced weak duplicate warnings (T-6, FR-3's weak scenario), in
 * which case an informational dialog names them first: a single OK button,
 * no choice to make (a weak match is never gated, only disclosed).
 */

import { useEffect, useState, useCallback, useId, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { getSession } from '@/lib/auth/auth-client';
import type { AdminActor, AdminActorCreateResult, DuplicateCandidate } from '@/lib/api/actors-admin';

import ActorForm from '@/components/admin/ActorForm';
import { matchedOnLabel } from '@/components/admin/DuplicateConfirmDialog';
import { useDialogFocusTrap } from '@/lib/admin/useDialogFocusTrap';
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
// Weak-duplicate informational dialog (T-6, FR-3's weak scenario)
//
// A weak match (name or GPS proximity only) never blocks creation — the
// actor already exists by the time this shows. A single OK button, no choice
// to make: this is disclosure, not a gate (requirements.md FR-3, "weak match
// only... BUT it MUST NOT ask for confirmation").
// ---------------------------------------------------------------------------

interface DuplicateWarningInfoDialogProps {
  open: boolean;
  traderId: string;
  warnings: DuplicateCandidate[];
  onOk: () => void;
}

function DuplicateWarningInfoDialog({
  open,
  traderId,
  warnings,
  onOk,
}: Readonly<DuplicateWarningInfoDialogProps>) {
  const titleId = useId();
  const descId = `${titleId}-desc`;
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => okRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  // No real "cancel" exists for a single-OK informational dialog — Escape
  // and the backdrop both resolve to the same OK action.
  const { dialogRef, onKeyDown: handleKeyDown } = useDialogFocusTrap<HTMLDivElement>(onOk);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-backdrop" aria-hidden="true" onClick={onOk} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onKeyDown={handleKeyDown}
        className={[
          'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
          'rounded-md bg-surface p-6 shadow-lg border border-border',
        ].join(' ')}
      >
        <h2 id={titleId} className="text-base font-semibold text-fg">
          Actor created
        </h2>
        <p id={descId} className="mt-2 text-sm text-muted">
          Created {traderId}. Similar actors:
        </p>

        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {warnings.length} similar {warnings.length === 1 ? 'actor' : 'actors'} found.
        </div>

        <ul role="list" className="mt-3 space-y-2">
          {warnings.map((warning) => (
            <li
              key={warning.actorId}
              role="listitem"
              className="rounded-md border border-border bg-surface-alt p-3"
            >
              <p className="text-sm font-medium text-fg">{warning.traderName}</p>
              <p className="text-xs text-muted">
                {warning.traderId} — matched on {matchedOnLabel(warning.matchedOn)}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex justify-end">
          {/*
            A plain token-styled <button>, not the shared ui/Button — this
            needs a real DOM ref for focus management on open (the same
            reason ConfirmDialog/AcknowledgeDialog use a raw <button> rather
            than that shared component).
          */}
          <button
            ref={okRef}
            type="button"
            onClick={onOk}
            className={[
              'rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg',
              'transition-colors hover:bg-primary-hover',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            ].join(' ')}
          >
            OK
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewActorPage() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createdWithWarnings, setCreatedWithWarnings] = useState<AdminActorCreateResult | null>(
    null,
  );

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

  const handleSuccess = useCallback((actor?: AdminActorCreateResult | AdminActor) => {
    if (actor && 'duplicateWarnings' in actor && (actor.duplicateWarnings?.length ?? 0) > 0) {
      setCreatedWithWarnings(actor);
      return;
    }
    router.push('/admin/actors');
  }, [router]);

  const handleDuplicateWarningOk = useCallback(() => {
    setCreatedWithWarnings(null);
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

      <DuplicateWarningInfoDialog
        open={createdWithWarnings !== null}
        traderId={createdWithWarnings?.traderId ?? ''}
        warnings={createdWithWarnings?.duplicateWarnings ?? []}
        onOk={handleDuplicateWarningOk}
      />
    </div>
  );
}
