// @sdd-spec admin/user-management (T-9)
'use client';

/**
 * EditUserDialog — modal form to edit an existing user's email and enabled state.
 *
 * Fields:
 *   - email (pre-filled; validated as email format)
 *   - enabled (checkbox toggle)
 *
 * On submit → updateUser(id, input, token). On success → onSuccess() so the
 * parent page can refetch and display a success affordance.
 *
 * Accessibility (WCAG 2.1 AA / §10):
 *   - role="dialog" + aria-modal + aria-labelledby
 *   - Focus trap: first focusable element on open; Escape closes.
 *   - Labeled inputs; aria-describedby for inline errors; aria-live error region.
 *   - Disabled + aria-busy while in-flight.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { updateUser, type AdminUser } from '@/lib/api/users';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EditUserDialogProps {
  open: boolean;
  user: AdminUser | null;
  token: string;
  onSuccess: () => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): string | undefined {
  if (!email.trim()) return 'Email is required.';
  if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address.';
  return undefined;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditUserDialog({
  open,
  user,
  token,
  onSuccess,
  onCancel,
}: EditUserDialogProps) {
  const titleId   = 'edit-user-dialog-title';
  const dialogRef = useRef<HTMLDivElement>(null);
  const emailRef  = useRef<HTMLInputElement>(null);

  const [email,       setEmail]       = useState('');
  const [enabled,     setEnabled]     = useState(true);
  const [emailError,  setEmailError]  = useState<string | undefined>();
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [loading,     setLoading]     = useState(false);

  // Sync form with the user being edited when dialog opens or user changes.
  useEffect(() => {
    if (open && user) {
      setEmail(user.email);
      setEnabled(user.enabled);
      setEmailError(undefined);
      setSubmitError(undefined);
      setLoading(false);
      const id = requestAnimationFrame(() => emailRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open, user]);

  // ── Focus trap ────────────────────────────────────────────────────────────

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

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user) return;

      const err = validateEmail(email);
      setEmailError(err);
      if (err) return;

      setSubmitError(undefined);
      setLoading(true);

      try {
        await updateUser(
          user.id,
          {
            email: email.trim(),
            enabled,
          },
          token
        );
        onSuccess();
      } catch (caught: unknown) {
        const message =
          caught instanceof Error ? caught.message : 'Failed to update user.';
        setSubmitError(message);
      } finally {
        setLoading(false);
      }
    },
    [email, enabled, user, token, onSuccess]
  );

  if (!open || !user) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-fg/40"
        aria-hidden="true"
        onClick={onCancel}
      />

      {/* Dialog panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className={[
          'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
          'rounded-md bg-surface p-6 shadow-md border border-border',
        ].join(' ')}
      >
        <h2
          id={titleId}
          className="text-base font-semibold text-fg"
        >
          Edit user
        </h2>

        <form onSubmit={handleSubmit} noValidate className="mt-4 flex flex-col gap-4">

          {/* Email field */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="edit-user-email"
              className="text-sm font-medium text-fg"
            >
              Email address <span aria-hidden="true" className="text-danger">*</span>
            </label>
            <input
              ref={emailRef}
              id="edit-user-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(validateEmail(e.target.value));
              }}
              disabled={loading}
              aria-required="true"
              aria-invalid={!!emailError}
              aria-describedby={emailError ? 'edit-user-email-error' : undefined}
              className={[
                'block w-full rounded-md border bg-surface px-3 py-2 text-sm text-fg',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
                emailError ? 'border-danger' : 'border-border',
              ].join(' ')}
            />
            {emailError && (
              <p
                id="edit-user-email-error"
                role="alert"
                className="text-xs text-danger"
              >
                {emailError}
              </p>
            )}
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center gap-3">
            <input
              id="edit-user-enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={loading}
              className={[
                'h-4 w-4 rounded border-border text-primary',
                'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
              ].join(' ')}
            />
            <label
              htmlFor="edit-user-enabled"
              className="text-sm font-medium text-fg select-none"
            >
              Account enabled
            </label>
          </div>

          {/* Mutation error live region */}
          {submitError && (
            <p
              role="alert"
              aria-live="assertive"
              className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              {submitError}
            </p>
          )}

          {/* Actions */}
          <div className="mt-1 flex justify-end gap-3">
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
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className={[
                'rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg',
                'transition-colors hover:bg-primary-hover',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
              ].join(' ')}
            >
              {loading ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
