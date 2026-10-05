// @sdd-spec actors/consent-intake/intake-required-fields (T-6)
'use client';

/**
 * DuplicateConfirmDialog — the FR-3 strong-match gate on admin create.
 *
 * Shown when `POST /api/v1/admin/actors` responds 409 with
 * `duplicateCandidates` (design.md §3): the admin's new actor strongly
 * matches (same email or phone as) one or more existing actors, or the
 * server has not yet seen the admin confirm them. The admin chooses
 * *Not a duplicate — create* (resubmits with the candidates' ids in
 * `confirmedNotDuplicateOf`) or *Cancel* (abandons the create).
 *
 * **Candidates carry no PII.** `DuplicateCandidate` is `{actorId, traderId,
 * traderName, matchedOn}` — never a `phone`/`email` value (NFR-3). Labels for
 * `matchedOn` mirror `DuplicateWarningCard.tsx`'s vocabulary (registration
 * queue) so "matched on X" reads identically everywhere in the admin console.
 *
 * **Stateless by design (design.md DD-4).** This component does not track
 * which candidates have been confirmed across rounds — the server recomputes
 * the strong-match set on every request, so a changed email that now matches
 * a DIFFERENT actor is never silently waved through. The caller
 * (`ActorForm.tsx`) is responsible for accumulating the UNION of every
 * candidate id confirmed across however many 409 rounds occur, and for
 * resubmitting that full union each time — never just the latest round's
 * ids, or an earlier confirmation is dropped (forward pointer, T-3
 * `execution.md`).
 *
 * Built on `DialogFooter` + `useDialogFocusTrap`, the `shadow-lg` + `bg-backdrop`
 * elevation, tokens only (frontend/CLAUDE.md). Announced via `aria-live`
 * (NFR-4).
 */

import { useEffect, useId } from 'react';

import { DialogFooter } from './DialogFooter';
import { useDialogFocusTrap } from '@/lib/admin/useDialogFocusTrap';
import type { DuplicateCandidate, DuplicateMatchAttribute } from '@/lib/api/actors-admin';

// ---------------------------------------------------------------------------
// Match-attribute labels — shared with ActorHistoryPanel.tsx (T-6)
// ---------------------------------------------------------------------------

/**
 * Human-readable label for each `DuplicateMatchAttribute` — a TOTAL `Record`
 * so a widened union is a compile error. Mirrors
 * `DuplicateWarningCard.tsx`'s `MATCH_ATTRIBUTE_LABEL` (registration queue)
 * so the same vocabulary reads identically across the admin console —
 * duplicated here rather than imported, since that component is owned by a
 * different spec and is not in this task's file list.
 */
export const MATCH_ATTRIBUTE_LABEL: Record<DuplicateMatchAttribute, string> = {
  phone: 'phone number',
  email: 'email address',
  traderName: 'organisation name',
  gps: 'location proximity',
};

/** Renders a candidate's `matchedOn` as a human-readable, comma-joined list. */
export function matchedOnLabel(matchedOn: DuplicateMatchAttribute[]): string {
  return matchedOn.map((attr) => MATCH_ATTRIBUTE_LABEL[attr]).join(', ');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DuplicateConfirmDialogProps {
  /** Whether the dialog is visible. */
  open: boolean;
  /** Unconfirmed strong candidates from the 409 response. */
  candidates: DuplicateCandidate[];
  /** Called when the admin confirms none of `candidates` is a duplicate. */
  onConfirm: () => void;
  /** Called when the admin cancels or presses Escape. */
  onCancel: () => void;
  /** True while the resubmitted create is in flight (disables controls). */
  loading?: boolean;
  /** Inline error from a failed resubmit. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DuplicateConfirmDialog({
  open,
  candidates,
  onConfirm,
  onCancel,
  loading = false,
  error,
}: Readonly<DuplicateConfirmDialogProps>) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
  const errorId = `${uid}-error`;

  const { dialogRef, onKeyDown: handleKeyDown } = useDialogFocusTrap<HTMLDivElement>(onCancel);

  // Focus a real control on open — the panel itself is never a focus target
  // (the shared trap only steps in once focus is already on the dialog's
  // first/last focusable element; landing on the panel leaves Shift+Tab free
  // to walk out to whatever is behind the backdrop). `DialogFooter`'s
  // Cancel/Confirm buttons aren't individually ref-able from here, so query
  // for the first enabled button under the panel instead, same as
  // `DuplicateWarningInfoDialog` (`app/(admin)/admin/actors/new/page.tsx`)
  // does with its own ref.
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => {
        dialogRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [open, dialogRef]);

  if (!open) return null;

  const count = candidates.length;
  const describedBy = error ? `${descId} ${errorId}` : descId;

  return (
    <>
      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      <div className="fixed inset-0 z-50 bg-backdrop" aria-hidden="true" onClick={onCancel} />

      {/* ── Dialog panel ──────────────────────────────────────────────────── */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        onKeyDown={handleKeyDown}
        className={[
          'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
          'rounded-md bg-surface p-6 shadow-lg border border-border',
        ].join(' ')}
      >
        <h2 id={titleId} className="text-base font-semibold text-fg">
          Possible duplicate
        </h2>

        <p id={descId} className="mt-2 text-sm text-muted">
          This actor matches {count} existing {count === 1 ? 'record' : 'records'} closely enough
          that it has not been created. Confirm it is not the same actor, or cancel.
        </p>

        {/* Announces the candidate count to assistive tech (NFR-4). */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {count} possible {count === 1 ? 'duplicate' : 'duplicates'} found.
        </div>

        <ul role="list" className="mt-4 space-y-2">
          {candidates.map((candidate) => (
            <li
              key={candidate.actorId}
              role="listitem"
              className="rounded-md border border-border bg-surface-alt p-3"
            >
              <p className="text-sm font-medium text-fg">{candidate.traderName}</p>
              <p className="text-xs text-muted">
                Existing record <span className="font-medium text-fg">{candidate.traderId}</span>
                {' — matched on '}
                <span className="font-medium text-fg">{matchedOnLabel(candidate.matchedOn)}</span>
              </p>
            </li>
          ))}
        </ul>

        <DialogFooter
          error={error}
          errorId={errorId}
          onCancel={onCancel}
          loading={loading}
          onConfirm={onConfirm}
          confirmDisabled={loading}
          confirmLabel="Not a duplicate — create"
          tone="primary"
        />
      </div>
    </>
  );
}
