// @sdd-spec admin/user-management (T-9)
'use client';

/**
 * CreateUserDialog — modal form to create a new Cognito user.
 *
 * Fields:
 *   - email (required, validated as email format)
 *   - role (admin / staff / none via RoleSelect)
 *
 * On submit → createUser(input, token). On success → calls onSuccess() so the
 * parent page can refetch the list and show a success affordance.
 *
 * Accessibility (WCAG 2.1 AA / §10):
 *   - role="dialog" + aria-modal + aria-labelledby
 *   - Focus trap: first focusable element on open; Escape closes.
 *   - Labeled inputs; aria-describedby for errors; aria-live error region.
 *   - Buttons disabled + aria-busy while in-flight.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createUser } from '@/lib/api/users';
import { RoleSelect, type RoleValue } from './RoleSelect';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateUserDialogProps {
  open: boolean;
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

export function CreateUserDialog({
  open,
  token,
  onSuccess,
  onCancel,
}: CreateUserDialogProps) {
  const titleId   = 'create-user-dialog-title';
  const dialogRef = useRef<HTMLDivElement>(null);
  const emailRef  = useRef<HTMLInputElement>(null);

  const [email,        setEmail]        = useState('');
  const [role,         setRole]         = useState<RoleValue>('none');
  const [emailError,   setEmailError]   = useState<string | undefined>();
  const [submitError,  setSubmitError]  = useState<string | undefined>();
  const [loading,      setLoading]      = useState(false);

  // Reset form state on open/close.
  useEffect(() => {
    if (open) {
      setEmail('');
      setRole('none');
      setEmailError(undefined);
      setSubmitError(undefined);
      setLoading(false);
      // Focus first field after render.
      const id = requestAnimationFrame(() => emailRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

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

      const err = validateEmail(email);
      setEmailError(err);
      if (err) return;

      setSubmitError(undefined);
      setLoading(true);

      try {
        await createUser(
          {
            email: email.trim(),
            ...(role !== 'none' ? { role } : {}),
          },
          token
        );
        onSuccess();
      } catch (caught: unknown) {
        const message =
          caught instanceof Error ? caught.message : 'Failed to create user.';
        setSubmitError(message);
      } finally {
        setLoading(false);
      }
    },
    [email, role, token, onSuccess]
  );

  if (!open) return null;

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
          Create user
        </h2>

        <form onSubmit={handleSubmit} noValidate className="mt-4 flex flex-col gap-4">

          {/* Email field */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="create-user-email"
              className="text-sm font-medium text-fg"
            >
              Email address <span aria-hidden="true" className="text-danger">*</span>
            </label>
            <input
              ref={emailRef}
              id="create-user-email"
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
              aria-describedby={emailError ? 'create-user-email-error' : undefined}
              placeholder="user@example.com"
              className={[
                'block w-full rounded-md border bg-surface px-3 py-2 text-sm text-fg',
                'placeholder:text-muted',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
                emailError ? 'border-danger' : 'border-border',
              ].join(' ')}
            />
            {emailError && (
              <p
                id="create-user-email-error"
                role="alert"
                className="text-xs text-danger"
              >
                {emailError}
              </p>
            )}
          </div>

          {/* Role field */}
          <RoleSelect
            id="create-user-role"
            value={role}
            onChange={setRole}
            disabled={loading}
          />

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
              {loading ? 'Creating…' : 'Create user'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
