// @sdd-spec admin/user-management (T-9)
'use client';

/**
 * CredentialHandoff — one-time display of a user's sign-in credentials.
 *
 * The backend RETURNS a temporary password (create + reset) AND attempts to
 * email it (auth/account-access-emails). This presentational block shows the
 * email + temporary password once so the admin can share them securely
 * out-of-band, and states whether the invitation/reset email actually went
 * out. It is NOT a modal — callers wrap it in their own dialog panel.
 *
 * Security / UX:
 *   - The temporary password is display-only; never persisted, logged, or
 *     written to the URL. Copy uses the clipboard API only, guarded for absence.
 *   - The password is shown regardless of `emailSent` (FR-2) — the not-sent
 *     branch is the case where the admin most needs it, so it is never hidden
 *     or de-emphasised there.
 *   - A failed send is presented as a *delivery* failure only, never as a
 *     failure to create/reset the user (FR-3's negative clause) — the
 *     Cognito account already exists by the time this view renders.
 *
 * Accessibility (WCAG 2.1 AA / §10):
 *   - Labelled value rows (email + password) via <dl>.
 *   - Send status and the persistent note both rendered in role="note"
 *     regions.
 *   - Focusable Copy + Done buttons; copy feedback announced via aria-live.
 */

import { useCallback, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CredentialHandoffProps {
  /** The new user's email (the sign-in identifier). */
  email: string;
  /** One-time temporary password returned by the API. */
  temporaryPassword: string;
  /**
   * Whether the invitation/reset email was accepted by the mail transport
   * (auth/account-access-emails FR-3). The password above is shown
   * regardless of this value (FR-2) — never gate its visibility on it.
   */
  emailSent: boolean;
  /** Heading for the block (e.g. "User created — share these credentials"). */
  title: string;
  /** Called when the admin dismisses the handoff. */
  onDone: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CredentialHandoff({
  email,
  temporaryPassword,
  emailSent,
  title,
  onDone,
}: CredentialHandoffProps) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(async () => {
    // Guard for environments without the clipboard API (older browsers / non-secure contexts).
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denied — leave the value visible for manual copy; no logging.
      setCopied(false);
    }
  }, [temporaryPassword]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-fg">{title}</h2>

      {/* Credential rows */}
      <dl className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <dt className="text-sm font-medium text-muted">Email</dt>
          <dd className="text-sm text-fg break-all">{email}</dd>
        </div>

        <div className="flex flex-col gap-1">
          <dt className="text-sm font-medium text-muted">Temporary password</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-fg break-all rounded-sm border border-border bg-surface-alt px-2 py-1">
              {temporaryPassword}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className={[
                'rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg',
                'transition-colors hover:bg-surface-alt',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              ].join(' ')}
            >
              {copied ? 'Copied' : 'Copy password'}
            </button>
            {/* Copy feedback for assistive tech (visually conveyed by the button label above). */}
            <span aria-live="polite" className="sr-only">
              {copied ? 'Password copied to clipboard' : ''}
            </span>
          </dd>
        </div>
      </dl>

      {/* Send status (FR-3) — shown whether or not the email went out; a
          failed send reads as a delivery failure, never as a failure to
          create/reset the user. */}
      {emailSent ? (
        <p role="note" className="text-sm text-success">
          An email with this password was sent to the user.
        </p>
      ) : (
        <p
          role="note"
          className="rounded-md border border-warning bg-surface-alt px-3 py-2 text-sm text-warning"
        >
          The email could not be sent — this did not affect the account.
          Share this password with the user directly.
        </p>
      )}

      {/* Persistent note — shown once, regardless of send status (FR-2) */}
      <p
        role="note"
        className="rounded-md border border-border bg-surface-alt px-3 py-2 text-sm text-fg"
      >
        This password is shown only once. Save it now — the user must set a
        new password at first sign-in.
      </p>

      {/* Actions */}
      <div className="mt-1 flex justify-end">
        <button
          type="button"
          onClick={onDone}
          className={[
            'rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg',
            'transition-colors hover:bg-primary-hover',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          ].join(' ')}
        >
          Done
        </button>
      </div>
    </div>
  );
}
