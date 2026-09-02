// @sdd-spec admin/registration-review-queue (T-14)
'use client';

/**
 * RejectDialog — the reject-registration confirmation modal (FR-13
 * scenario 1, `design.md` §7.4).
 *
 * **Deliberately NOT `AcknowledgeDialog`.** Rejection grants no consent, so
 * there is nothing to type-match against. It instead collects two inputs —
 * a required structured reason (a `<select>`, so the choice is countable
 * later — FR-11 scenario 3) and an optional applicant-facing note — and
 * carries an explicit irreversibility notice (FR-13 scenario 1: "the
 * interface states that rejection cannot be undone from that screen and
 * that the applicant must submit again").
 *
 * **Not `ConfirmDialog` either** (`design.md` §7.4): `ConfirmDialog` is
 * built for a single typed-phrase gate, has no structured-reason input, and
 * — separately — is the right place for `bg-danger` on its confirm button,
 * since THIS action genuinely is destructive/terminal-for-this-chunk.
 * `danger` styles this dialog's confirm button and nothing about approval,
 * per this project's rule that `danger` means destructive (NFR-6).
 *
 * **A-71 (carried from T-11's review).** `RejectionReasonCode` is a closed
 * five-member union but had no exhaustive consumer, so a future widening to
 * `string` would go undetected. `REJECTION_REASON_LABEL` below is a TOTAL
 * `Record<RejectionReasonCode, string>` — the same pattern
 * `ActorHistoryPanel.tsx`'s `actionBadgeClasses` (`design.md` DD-21) uses —
 * so a member removed from the union is a compile error, not a silently
 * unlabelled option.
 *
 * **A-62 (carried from T-9's review).** `design.md` §5's five admin routes
 * include none that serve this reason list, so it cannot be fetched or
 * imported across the module boundary (frontend and backend are separate
 * deployables with no shared workspace in this repo — there is no import
 * path from `backend/src/registrations/rejection-reasons.ts` into a
 * static-export Next.js build). The five code/label pairs below are
 * therefore hand-duplicated from that file and MUST be kept in step with
 * it by hand; there is no compiler or test in this repo that catches a
 * label or code drifting out of sync between the two copies.
 *
 * **The empty-string note (carried from T-9's review).** T-9 closed
 * `note: '' -> null` on the WRITE side precisely because a blank controlled
 * `<textarea>` submits `''`, not `undefined`. This dialog does not trim or
 * omit an empty note client-side — it sends exactly what the applicant-
 * facing textarea holds at confirm time and lets the server normalise it.
 *
 * Accessibility (WCAG 2.1 AA / `frontend/CLAUDE.md`):
 *   - role="dialog" + aria-modal="true" + aria-labelledby + aria-describedby
 *   - Focus trap: on open, focus moves to the reason select; Tab/Shift+Tab
 *     cycle within the dialog; Escape closes without confirming.
 *   - Backdrop click closes the dialog (cancel behaviour).
 *   - Live region for the "reason required" hint and for in-flight errors.
 *
 * Tokens only; no hardcoded colours/geometry (NFR-6).
 */

import { useEffect, useRef, useCallback, useId, useState } from 'react';

import type { RejectionReasonCode } from '@/lib/api/registrations-admin';
import { useDialogFocusTrap } from '@/lib/admin/useDialogFocusTrap';

// ---------------------------------------------------------------------------
// Reason vocabulary — A-71 / A-62 (see file-level doc comment above)
// ---------------------------------------------------------------------------

/**
 * Total `Record<RejectionReasonCode, string>` — mirrors
 * `REJECTION_REASONS_SOURCE` in `backend/src/registrations/rejection-reasons.ts`
 * exactly (code and label both). Duplicated by hand (A-62); keep the two in
 * step. `DUPLICATE_OF_EXISTING_RECORD` is listed first, matching the
 * backend's own ordering and FR-11 scenario 3's framing of it as the
 * first-class duplicate reason.
 */
const REJECTION_REASON_LABEL: Record<RejectionReasonCode, string> = {
  DUPLICATE_OF_EXISTING_RECORD: 'Duplicate of an existing registry record',
  INCOMPLETE_OR_INVALID_INFORMATION: 'Incomplete or invalid information',
  NOT_A_SEED_SYSTEM_ACTOR: 'Not a seed-system actor',
  UNABLE_TO_VERIFY_CONTACT_DETAILS: 'Unable to verify contact details',
  OTHER: 'Other',
};

/**
 * Render order for the `<select>` — derived from
 * {@link REJECTION_REASON_LABEL}'s own key order rather than a second,
 * independently-maintained list, so the option list and the label map
 * cannot drift apart from each other (they remain free to drift from the
 * backend's list per A-62 above, which has no gate against that).
 */
const REJECTION_REASON_ORDER = Object.keys(REJECTION_REASON_LABEL) as RejectionReasonCode[];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RejectDialogInput {
  reason: RejectionReasonCode;
  /** Exactly what the textarea held at confirm time — never trimmed or omitted client-side (see file-level doc comment). */
  note: string;
}

export interface RejectDialogProps {
  /** Whether the dialog is visible. */
  open: boolean;
  /** The reference code of the registration being rejected, for the title/description. */
  reference: string;
  /** Called with the collected reason/note when the reviewer confirms. */
  onConfirm: (input: RejectDialogInput) => void;
  /** Called when the reviewer cancels or presses Escape. */
  onCancel: () => void;
  /** True while the async action is in-flight (disables controls). */
  loading?: boolean;
  /** Inline error from the failed mutation. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RejectDialog({
  open,
  reference,
  onConfirm,
  onCancel,
  loading = false,
  error,
}: RejectDialogProps) {
  const uid          = useId();
  const titleId      = `${uid}-title`;
  const descId       = `${uid}-desc`;
  const noticeId     = `${uid}-notice`;
  const reasonId     = `${uid}-reason`;
  const reasonHintId = `${uid}-reason-hint`;
  const noteId       = `${uid}-note`;
  const errorId      = `${uid}-error`;

  const reasonRef  = useRef<HTMLSelectElement>(null);
  const [reason, setReason] = useState<RejectionReasonCode | ''>('');
  const [note,   setNote]   = useState('');

  const canConfirm = reason !== '';

  // Reset inputs when the dialog opens; focus the reason select.
  useEffect(() => {
    if (open) {
      setReason('');
      setNote('');
      const id = requestAnimationFrame(() => reasonRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  // Keyboard: Escape → cancel; Tab / Shift+Tab → cycle within dialog.
  const { dialogRef, onKeyDown: handleKeyDown } = useDialogFocusTrap<HTMLDivElement>(onCancel);

  const handleConfirm = useCallback(() => {
    if (!canConfirm || loading) return;
    onConfirm({ reason: reason as RejectionReasonCode, note });
  }, [canConfirm, loading, onConfirm, reason, note]);

  if (!open) return null;

  return (
    <>
      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      <div
        className="fixed inset-0 z-50 bg-backdrop"
        aria-hidden="true"
        onClick={onCancel}
      />

      {/* ── Dialog panel ──────────────────────────────────────────────────── */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${descId} ${noticeId}${error ? ` ${errorId}` : ''}`}
        onKeyDown={handleKeyDown}
        className={[
          'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
          'rounded-md bg-surface p-6 shadow-lg border border-border',
        ].join(' ')}
      >
        {/* Title */}
        <h2 id={titleId} className="text-base font-semibold text-fg">
          Reject {reference}
        </h2>

        {/* Description */}
        <p id={descId} className="mt-2 text-sm text-muted">
          Rejecting this registration records a reason for the record and does not create an
          actor. No field is published and the stored consent record is left untouched.
        </p>

        {/* Irreversibility notice — FR-13 scenario 1 */}
        <p
          id={noticeId}
          className="mt-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-fg"
        >
          This cannot be undone from this screen. Once rejected, the applicant must submit a new
          registration.
        </p>

        {/* Reason select — required (FR-13 scenario 1) */}
        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor={reasonId} className="text-sm font-medium text-fg">
            Reason
            <span aria-hidden="true" className="ml-0.5 text-danger">*</span>
          </label>
          <select
            ref={reasonRef}
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value as RejectionReasonCode | '')}
            disabled={loading}
            required
            aria-describedby={reasonHintId}
            className={[
              'block w-full rounded-md border bg-surface px-3 py-2 text-sm text-fg',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'border-border',
            ].join(' ')}
          >
            <option value="">Select a reason…</option>
            {REJECTION_REASON_ORDER.map((code) => (
              <option key={code} value={code}>
                {REJECTION_REASON_LABEL[code]}
              </option>
            ))}
          </select>
          <p id={reasonHintId} aria-live="polite" className="text-xs text-muted">
            Reject is disabled until a reason is selected.
          </p>
        </div>

        {/* Optional note */}
        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor={noteId} className="text-sm font-medium text-fg">
            Note to applicant (optional)
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={loading}
            rows={3}
            className={[
              'block w-full resize-none rounded-md border bg-surface px-3 py-2 text-sm text-fg',
              'placeholder:text-muted',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'border-border',
            ].join(' ')}
          />
        </div>

        {/* Inline error live region */}
        {error && (
          <p
            id={errorId}
            role="alert"
            aria-live="assertive"
            className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className={[
              'rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-fg',
              'transition-colors hover:bg-surface-alt',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
            ].join(' ')}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm || loading}
            aria-busy={loading}
            className={[
              'rounded-md bg-danger px-4 py-2 text-sm font-medium text-primary-fg',
              'transition-colors hover:opacity-90',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
            ].join(' ')}
          >
            {loading ? 'Please wait…' : 'Reject'}
          </button>
        </div>
      </div>
    </>
  );
}
