// @sdd-spec admin/bulk-actor-operations (T-7)
'use client';

/**
 * AcknowledgeDialog — typed-acknowledgement confirmation modal.
 *
 * Used by the bulk actor unlock action (FR-4): because unlocking publishes
 * PII + GPS to the public directory, the Admin must type an exact phrase
 * before the confirm button is enabled.
 *
 * Accessibility (WCAG 2.1 AA / system-design §10):
 *   - role="dialog" + aria-modal="true" + aria-labelledby + aria-describedby
 *   - Focus trap: on open, focus moves to the acknowledgement input;
 *     Tab/Shift+Tab cycle within the dialog; Escape closes without confirming.
 *   - Backdrop click closes the dialog (cancel behaviour).
 *   - Live region for in-flight errors and for the mismatch hint.
 *   - Labelled input with aria-describedby pointing to instructions + error.
 */

import { useEffect, useRef, useCallback, useId, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AcknowledgeDialogProps {
  /** Whether the dialog is visible. */
  open: boolean;
  /** Dialog title (maps to aria-labelledby). */
  title: string;
  /** Descriptive body text (maps to aria-describedby). */
  description: string;
  /** Exact phrase the user must type to enable the confirm button. */
  acknowledgementText: string;
  /** Label for the confirm button (default: "Confirm"). */
  confirmLabel?: string;
  /** Called when user confirms the action. */
  onConfirm: () => void;
  /** Called when user cancels or presses Escape. */
  onCancel: () => void;
  /** True while the async action is in-flight (disables controls). */
  loading?: boolean;
  /** Inline error from the failed mutation. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AcknowledgeDialog({
  open,
  title,
  description,
  acknowledgementText,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  loading = false,
  error,
}: AcknowledgeDialogProps) {
  const uid           = useId();
  const titleId       = `${uid}-title`;
  const descId        = `${uid}-desc`;
  const inputId       = `${uid}-input`;
  const hintId        = `${uid}-hint`;
  const errorId       = `${uid}-error`;

  const inputRef      = useRef<HTMLInputElement>(null);
  const dialogRef     = useRef<HTMLDivElement>(null);
  const [value,       setValue]       = useState('');

  const acknowledged = value === acknowledgementText;

  // Reset input when the dialog opens; focus the input.
  useEffect(() => {
    if (open) {
      setValue('');
      const id = requestAnimationFrame(() => inputRef.current?.focus());
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

  const handleConfirm = useCallback(() => {
    if (!acknowledged || loading) return;
    onConfirm();
  }, [acknowledged, loading, onConfirm]);

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
        aria-describedby={`${descId} ${hintId}${error ? ` ${errorId}` : ''}`}
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

        {/* Acknowledgement input */}
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
