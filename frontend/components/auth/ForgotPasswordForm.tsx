'use client';

/**
 * ForgotPasswordForm — self-service password reset (FR-2, FR-3, FR-4, FR-5).
 *
 * Step 1 (request): email → resetPassword from the T-1 auth-client.
 *   On { status: 'code_sent' } → advances to the submit step, keeps the email
 *   pre-filled (FR-4), and shows a neutral, enumeration-safe notice (FR-2).
 * Step 2 (submit): email (editable, pre-filled) + reset code + new password →
 *   confirmResetPassword. On { status: 'done' } → routes to
 *   '/login?reset=success' (no code/password ever placed in a URL).
 * On error: shows an accessible error region (role="alert", aria-live="assertive")
 *   and stays on the current step.
 *
 * Reuses <Button> and §7 design tokens only. No raw hex. No SSR — no
 * useSearchParams; this component is fully self-contained.
 *
 * Usage:
 *   import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm';
 *   <ForgotPasswordForm />
 */

import { type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { resetPassword, confirmResetPassword } from '@/lib/auth/auth-client';

// ---------------------------------------------------------------------------
// Sub-components (mirror LoginForm)
// ---------------------------------------------------------------------------

/** Accessible, token-styled form label. */
function Label({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-sm font-medium text-fg mb-1"
    >
      {children}
    </label>
  );
}

/** Accessible, token-styled text input (type forwarded for password support). */
function Input({
  id,
  type,
  autoComplete,
  value,
  onChange,
  disabled,
}: {
  id: string;
  type: 'email' | 'password' | 'text';
  autoComplete?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      id={id}
      name={id}
      type={type}
      autoComplete={autoComplete}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      required
      className={[
        'block w-full rounded-md border border-border bg-surface text-fg',
        'px-3 py-2 text-sm placeholder:text-muted',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        'transition-shadow motion-reduce:transition-none',
      ].join(' ')}
    />
  );
}

// ---------------------------------------------------------------------------
// ForgotPasswordForm
// ---------------------------------------------------------------------------

type Step = 'request' | 'submit';

/** Minimal, non-over-engineered email sanity check (mirrors LoginForm's noValidate approach). */
function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && /.+@.+\..+/.test(trimmed);
}

export default function ForgotPasswordForm() {
  const router = useRouter();

  // ── Form state ─────────────────────────────────────────────────────────────
  const [step, setStep]       = useState<Step>('request');
  const [email, setEmail]     = useState('');
  const [code, setCode]       = useState('');
  const [newPass, setNewPass] = useState('');
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [notice, setNotice]   = useState<string | null>(null);

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleRequestSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!looksLikeEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }

    setBusy(true);
    const result = await resetPassword(email);
    setBusy(false);

    if (result.status === 'code_sent') {
      // Enumeration-safe notice (FR-2); keep email pre-filled (FR-4) and advance.
      setError(null);
      setNotice('If an account exists, a reset code has been sent to your email.');
      setStep('submit');
      return;
    }

    // result.status === 'error'
    setError(result.message);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const result = await confirmResetPassword({
      username: email,
      code,
      newPassword: newPass,
    });

    if (result.status === 'done') {
      // No secrets in the URL — only a success flag for /login (FR-2, NFR).
      router.replace('/login?reset=success');
      return;
    }

    setBusy(false);
    // result.status === 'error' — stay on the submit step.
    setError(result.message);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    // Card container — surface token, shadow-md, rounded-lg (token geometry).
    <div className="w-full max-w-md bg-surface shadow-md rounded-lg px-8 py-10 border border-border">

      {/* ── Heading ─────────────────────────────────────────────────────────── */}
      <h1 className="text-2xl font-extrabold text-fg mb-2 text-center">
        {step === 'request' ? 'Reset your password' : 'Enter your reset code'}
      </h1>
      <p className="text-sm text-muted text-center mb-8">
        {step === 'request'
          ? 'Enter your email address and we’ll send you a code to reset your password.'
          : 'Enter the code from your email along with a new password.'}
      </p>

      {/* ── Accessible notice region (neutral / success, enumeration-safe) ──── */}
      {/*
        aria-live="polite": screen readers announce the confirmation after the
        current utterance completes. Styled with the established highlight/success
        tokens (no invented colours).
      */}
      <div aria-live="polite" aria-atomic="true" className="mb-4">
        {notice && (
          <p className="rounded-md bg-highlight-tint border border-highlight-tint text-success px-4 py-3 text-sm font-medium">
            {notice}
          </p>
        )}
      </div>

      {/* ── Accessible error region ─────────────────────────────────────────── */}
      {/*
        role="alert" + aria-live="assertive": screen readers announce errors
        immediately. aria-atomic="true": the entire region is read together
        (WCAG 2.1 SC 4.1.3 — Status Messages). Always rendered (empty) so the
        DOM node exists before the error is injected.
      */}
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="mb-6"
      >
        {error && (
          <p className="rounded-md bg-danger/10 border border-danger/30 text-danger px-4 py-3 text-sm">
            {error}
          </p>
        )}
      </div>

      {/* ── Step 1: request a reset code ────────────────────────────────────── */}
      {step === 'request' && (
        <form onSubmit={handleRequestSubmit} noValidate>
          <div className="mb-8">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={setEmail}
              disabled={busy}
            />
          </div>

          <Button
            variant="primary"
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className="w-full justify-center"
          >
            {busy ? 'Sending…' : 'Send reset code'}
          </Button>
        </form>
      )}

      {/* ── Step 2: submit code + new password ──────────────────────────────── */}
      {step === 'submit' && (
        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-5">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={setEmail}
              disabled={busy}
            />
          </div>

          <div className="mb-5">
            <Label htmlFor="code">Reset code</Label>
            <Input
              id="code"
              type="text"
              autoComplete="one-time-code"
              value={code}
              onChange={setCode}
              disabled={busy}
            />
          </div>

          <div className="mb-8">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPass}
              onChange={setNewPass}
              disabled={busy}
            />
          </div>

          <Button
            variant="primary"
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className="w-full justify-center"
          >
            {busy ? 'Setting password…' : 'Set new password'}
          </Button>
        </form>
      )}

    </div>
  );
}
