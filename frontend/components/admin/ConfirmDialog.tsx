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

import { useEffect, useRef, useCallback, useId, useState } from 'react';

import { useDialogFocusTrap } from '@/lib/admin/useDialogFocusTrap';

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
  /** Exact phrase the user must type to enable the confirm button (optional typed-phrase gate). */
  acknowledgementText?: string;
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
  acknowledgementText,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  loading = false,
  error,
}: ConfirmDialogProps) {
  const uid           = useId();
  const titleId       = `${uid}-title`;
  const descId        = `${uid}-desc`;
  const inputId       = `${uid}-input`;
  const hintId        = `${uid}-hint`;
  const errorId       = `${uid}-error`;

  const inputRef      = useRef<HTMLInputElement>(null);
  const cancelRef     = useRef<HTMLButtonElement>(null);
  const [value,       setValue]       = useState('');

  const gateEnabled   = acknowledgementText !== undefined;
  const acknowledged  = gateEnabled ? value === acknowledgementText : true;

  // ── Focus trap ────────────────────────────────────────────────────────────

  // Move focus to the acknowledgement input (if gated) or cancel button when the dialog opens.
  useEffect(() => {
    if (open) {
      setValue('');
      const target = gateEnabled ? inputRef.current : cancelRef.current;
      const id = requestAnimationFrame(() => target?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open, gateEnabled]);

  const handleConfirm = useCallback(() => {
    if (!acknowledged || loading) return;
    onConfirm();
  }, [acknowledged, loading, onConfirm]);

  // Keyboard: Escape → cancel; Tab / Shift+Tab → cycle within dialog.
  const { dialogRef, onKeyDown: handleKeyDown } = useDialogFocusTrap<HTMLDivElement>(onCancel);

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
        aria-describedby={`${descId}${gateEnabled ? ` ${hintId}` : ''}${error ? ` ${errorId}` : ''}`}
        onKeyDown={handleKeyDown}
        className={[
          'fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2',
          'rounded-md bg-surface p-6 shadow-lg border border-border',
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

        {/* Optional typed-phrase gate */}
        {gateEnabled && (
          <div className="mt-4 flex flex-col gap-1.5">
            <label
              htmlFor={inputId}
              className="text-sm font-medium text-fg"
            >
              Type “{acknowledgementText}” to confirm
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={loading}
              aria-describedby={`${hintId}${error ? ` ${errorId}` : ''}`}
              aria-invalid={!acknowledged && value.length > 0 ? 'true' : undefined}
              autoComplete="off"
              className={[
                'block w-full rounded-md border bg-surface px-3 py-2 text-sm text-fg',
                'placeholder:text-muted',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'border-border',
              ].join(' ')}
            />
            <p
              id={hintId}
              aria-live="polite"
              className="text-xs text-muted"
            >
              Confirm is disabled until the acknowledgement is entered exactly.
            </p>
          </div>
        )}

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
            onClick={handleConfirm}
            disabled={!acknowledged || loading}
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
