'use client';

/**
 * LoginForm — Staff/Admin sign-in form (FR-1, NFR-4, NFR-7).
 *
 * Step 1 (default): email + password → signIn from the T-3 auth-client.
 * Step 2 (challenge): if signIn returns { status: 'new_password_required' },
 *   surfaces a "set new password" field + calls confirmNewPassword (OQ-3).
 *
 * On success: routes to `redirect` query param if present, else '/'.
 * On error: shows an accessible error region (role="alert", aria-live="assertive").
 *
 * Reuses <Button> and §7 design tokens only (NFR-4). No raw hex. No SSR (NFR-2).
 *
 * Usage:
 *   import LoginForm from '@/components/auth/LoginForm';
 *   <LoginForm />
 */

import { type FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Button from '@/components/ui/Button';
import { signIn, confirmNewPassword } from '@/lib/auth/auth-client';

// ---------------------------------------------------------------------------
// Sub-components
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
  type: 'email' | 'password';
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
// LoginForm
// ---------------------------------------------------------------------------

type Step = 'credentials' | 'new_password';

export default function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  // ── Form state ─────────────────────────────────────────────────────────────
  const [step, setStep]         = useState<Step>('credentials');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [newPass, setNewPass]   = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** After a successful sign-in, route to the redirect param or root. */
  function onSuccess() {
    const redirect = searchParams?.get('redirect') ?? '/';
    router.push(redirect);
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleCredentialsSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const result = await signIn({ username: email, password });

    setBusy(false);

    if (result.status === 'authenticated') {
      onSuccess();
      return;
    }

    if (result.status === 'new_password_required') {
      // First-login challenge — advance to step 2 (FR-1, OQ-3).
      setStep('new_password');
      return;
    }

    // result.status === 'error'
    setError(result.message);
  }

  async function handleNewPasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const result = await confirmNewPassword(newPass);

    setBusy(false);

    if (result.status === 'authenticated') {
      onSuccess();
      return;
    }

    // Narrow to the error variant before accessing .message (new_password_required has none)
    setError(result.status === 'error' ? result.message : 'Unexpected challenge after password change.');
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    // Card container — surface token, shadow-md, rounded-md (token geometry, NFR-4)
    <div className="w-full max-w-md bg-surface shadow-md rounded-lg px-8 py-10 border border-border">

      {/* ── Heading ─────────────────────────────────────────────────────────── */}
      <h1 className="text-2xl font-bold text-fg mb-2 text-center">
        {step === 'credentials' ? 'Staff sign-in' : 'Set your new password'}
      </h1>
      <p className="text-sm text-muted text-center mb-8">
        {step === 'credentials'
          ? 'Sign in to access the ACCELERATE Tanzania registry.'
          : 'Your account requires a new password. Please set one to continue.'}
      </p>

      {/* ── Accessible error region (NFR-7, NFR-4) ─────────────────────────── */}
      {/*
        role="alert" + aria-live="assertive": screen readers announce errors
        immediately when they appear. aria-atomic="true": the entire region
        is read together (WCAG 2.1 §4.1.3 / SC 4.1.3 — Status Messages).
        The region is always rendered (empty) so the DOM node already exists
        when the error is injected; this ensures aria-live fires correctly.
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

      {/* ── Step 1: email + password ─────────────────────────────────────────── */}
      {step === 'credentials' && (
        <form onSubmit={handleCredentialsSubmit} noValidate>
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

          <div className="mb-8">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
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
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      )}

      {/* ── Step 2: new-password challenge ──────────────────────────────────── */}
      {step === 'new_password' && (
        <form onSubmit={handleNewPasswordSubmit} noValidate>
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
            {busy ? 'Setting password…' : 'Set password and sign in'}
          </Button>
        </form>
      )}

    </div>
  );
}
