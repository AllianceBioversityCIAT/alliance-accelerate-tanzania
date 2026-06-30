// @sdd-spec admin/user-management (T-9)
'use client';

/**
 * ConfirmDialog — reusable destructive-action confirmation modal.
 *
 * Used by:
 *   - Delete user: "This action cannot be undone."
 *   - Reset password: "A password-reset email will be sent to the user."
 *
 * Accessibility (WCAG 2.1 AA / §10):
 *   - role="dialog" + aria-modal="true" + aria-labelledby + aria-describedby
 *   - Focus trap: on open, focus moves to the cancel button; Tab/Shift+Tab cycle
 *     within the dialog; Escape closes without confirming.
 *   - Backdrop click closes the dialog (cancel behaviour).
 *   - Live region for in-flight errors.
 */

import { useEffect, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConfirmDialogProps {
  /** Whether the dialog is visible. */
  open: boolean;
  /** Dialog title (maps to aria-labelledby). */
  title: string;
  /** Descriptive body text (maps to aria-describedby). */
  description: string;
  /** Label for the destructive confirm button (default: "Confirm"). */
  confirmLabel?: string;
  /** Called when user confirms the action. */
  onConfirm: () => void;
  /** Called when user cancels or presses Escape. */
  onCancel: () => void;
  /** True while the async action is in-flight (disables buttons). */
  loading?: boolean;
  /** Inline error from the failed mutation. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  loading = false,
  error,
}: ConfirmDialogProps) {
  const titleId       = 'confirm-dialog-title';
  const descId        = 'confirm-dialog-desc';
  const errorId       = 'confirm-dialog-error';
  const cancelRef     = useRef<HTMLButtonElement>(null);
  const dialogRef     = useRef<HTMLDivElement>(null);

  // ── Focus trap ────────────────────────────────────────────────────────────

  // Move focus to cancel button when the dialog opens.
  useEffect(() => {
    if (open) {
      // requestAnimationFrame ensures the dialog is rendered before focusing.
      const id = requestAnimationFrame(() => cancelRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  // Keyboard: Escape → cancel; Tab / Shift+Tab → cycle within dialog.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }

      if (e.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('disabled'));

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last  = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onCancel]
  );

  if (!open) return null;

  return (
    <>
      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      <div
        className="fixed inset-0 z-50 bg-fg/40"
        aria-hidden="true"
        onClick={onCancel}
      />

      {/* ── Dialog panel ──────────────────────────────────────────────────── */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${descId}${error ? ` ${errorId}` : ''}`}
        onKeyDown={handleKeyDown}
        className={[
          'fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2',
          'rounded-md bg-surface p-6 shadow-md border border-border',
        ].join(' ')}
      >
        {/* Title */}
        <h2
          id={titleId}
          className="text-base font-semibold text-fg"
        >
          {title}
        </h2>

        {/* Description */}
        <p
          id={descId}
          className="mt-2 text-sm text-muted"
        >
          {description}
        </p>

        {/* Inline error live region */}
        {error && (
          <p
            id={errorId}
            role="alert"
            aria-live="assertive"
            className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-3">
          <button
            ref={cancelRef}
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
            onClick={onConfirm}
            disabled={loading}
            aria-busy={loading}
            className={[
              'rounded-md bg-danger px-4 py-2 text-sm font-medium text-primary-fg',
              'transition-colors hover:opacity-90',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
            ].join(' ')}
          >
            {loading ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
