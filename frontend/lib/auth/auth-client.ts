/**
 * Auth client — thin wrappers over Amplify v6 — auth-wiring spec, design.md §5.
 *
 * All functions are pure-ish (no React dependency) so they are unit-testable
 * with Amplify mocked at the module level.
 *
 * Role derivation (FR-2):
 *   cognito:groups includes 'admin' → 'Admin'
 *   cognito:groups includes 'staff' (and not admin) → 'Staff'
 *   no recognised group → 'Public'
 *
 * Token storage posture is handled by Amplify (see amplify-config.ts, NFR-5).
 */

import {
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  fetchAuthSession,
  confirmSignIn,
  resetPassword as amplifyResetPassword,
  confirmResetPassword as amplifyConfirmResetPassword,
  type SignInOutput,
} from 'aws-amplify/auth';
import type { Role } from './useSession';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthSession {
  role: Role;
  user: { name: string };
  accessToken: string;
}

export interface SignInCredentials {
  username: string;
  password: string;
}

/** Outcome of signIn — either authenticated or awaiting new-password challenge. */
export type SignInResult =
  | { status: 'authenticated' }
  | { status: 'new_password_required' }
  | { status: 'error'; message: string };

/** Outcome of a password-reset request (FR-5). */
export type ResetRequestResult =
  | { status: 'code_sent' }
  | { status: 'error'; message: string };

/** Outcome of confirming a password reset with a code (FR-6). */
export type ResetConfirmResult =
  | { status: 'done' }
  | { status: 'error'; message: string };

// ---------------------------------------------------------------------------
// Role helper (FR-2)
// ---------------------------------------------------------------------------

/**
 * Derives the app Role from the Cognito groups array in the token payload.
 * Exported for direct unit testing.
 */
export function roleFromGroups(groups: string[] | undefined): Role {
  if (!groups) return 'Public';
  if (groups.includes('admin')) return 'Admin';
  if (groups.includes('staff')) return 'Staff';
  return 'Public';
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/**
 * Fetches the current Amplify session and maps it to our AuthSession shape.
 * Returns null when unauthenticated or when the token cannot be retrieved.
 * Never throws — NFR-7 resilience.
 */
export async function getSession(): Promise<AuthSession | null> {
  try {
    const session = await fetchAuthSession();

    const accessToken = session.tokens?.accessToken;
    const idToken     = session.tokens?.idToken;

    if (!accessToken) return null;

    // Role comes from the ID-token's cognito:groups payload (design.md §5).
    /* eslint-disable-next-line */
    const idPayload = idToken?.payload as Record<string, any> | undefined;
    const groups    = idPayload?.['cognito:groups'] as string[] | undefined;
    const role      = roleFromGroups(groups);

    // Prefer 'name' claim; fall back to 'email' (sub if neither present).
    const name: string =
      (idPayload?.['name'] as string | undefined) ??
      (idPayload?.['email'] as string | undefined) ??
      (idPayload?.['sub'] as string | undefined) ??
      'User';

    return {
      role,
      user: { name },
      accessToken: accessToken.toString(),
    };
  } catch {
    // Unauthenticated or Amplify not yet configured — return null (NFR-7).
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sign-in (FR-1)
// ---------------------------------------------------------------------------

/**
 * Initiates sign-in with email+password.
 * Handles the CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED next-step that
 * admin-created Cognito accounts receive on first login (FR-1/OQ-3).
 * Never throws — returns a discriminated union result.
 */
export async function signIn(credentials: SignInCredentials): Promise<SignInResult> {
  try {
    const output: SignInOutput = await amplifySignIn({
      username: credentials.username,
      password: credentials.password,
    });

    const nextStep = output.nextStep?.signInStep;

    if (
      nextStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' ||
      // Legacy Amplify v5 key — guard for completeness
      nextStep === ('NEW_PASSWORD_REQUIRED' as string)
    ) {
      return { status: 'new_password_required' };
    }

    if (output.isSignedIn) {
      return { status: 'authenticated' };
    }

    return { status: 'error', message: 'Sign-in incomplete — unexpected next step.' };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'An unexpected error occurred during sign-in.';
    return { status: 'error', message };
  }
}

// ---------------------------------------------------------------------------
// Confirm new password (FR-1 — first-login challenge)
// ---------------------------------------------------------------------------

/**
 * Completes the NEW_PASSWORD_REQUIRED / CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED
 * challenge for admin-created accounts. Called after signIn returns
 * { status: 'new_password_required' }.
 * Never throws — returns a discriminated union result.
 */
export async function confirmNewPassword(newPassword: string): Promise<SignInResult> {
  try {
    const output = await confirmSignIn({ challengeResponse: newPassword });

    if (output.isSignedIn) {
      return { status: 'authenticated' };
    }

    return { status: 'error', message: 'Password change incomplete — unexpected next step.' };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'An unexpected error occurred while setting password.';
    return { status: 'error', message };
  }
}

// ---------------------------------------------------------------------------
// Sign-out (FR-3)
// ---------------------------------------------------------------------------

/**
 * Signs the current user out (local sign-out — clears this device only; OQ-4).
 * Never throws — NFR-7.
 */
export async function signOut(): Promise<void> {
  try {
    await amplifySignOut();
  } catch {
    // Suppress — session is already gone in the error case.
  }
}

// ---------------------------------------------------------------------------
// Password reset (FR-5, FR-6)
// ---------------------------------------------------------------------------

/**
 * Maps a Cognito reset error to a safe, user-facing message (design.md §4.2).
 * Reads the error name defensively and NEVER echoes the raw name or message
 * back to the caller (NFR-4 — no internal leakage / account enumeration).
 */
function resetErrorMessage(err: unknown): string {
  const name =
    typeof err === 'object' && err !== null && typeof (err as { name?: unknown }).name === 'string'
      ? (err as { name: string }).name
      : '';

  switch (name) {
    case 'CodeMismatchException':
      return "That code isn't correct. Check the code from your email, or request a new one.";
    case 'ExpiredCodeException':
      return 'That code has expired. Request a new one and try again.';
    case 'InvalidPasswordException':
      return "That password doesn't meet the requirements. Try a stronger one.";
    case 'LimitExceededException':
      return 'Too many attempts. Please wait a few minutes and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

/**
 * Requests a password-reset code for the given username (FR-5).
 * Account-enumeration safe (FR-2/NFR-4): a UserNotFoundException is treated as
 * success — we never reveal whether an account exists.
 * Never throws — returns a discriminated union result.
 */
export async function resetPassword(username: string): Promise<ResetRequestResult> {
  try {
    await amplifyResetPassword({ username });
    return { status: 'code_sent' };
  } catch (err: unknown) {
    // Do not reveal non-existence on the request path (NFR-4).
    const name =
      typeof err === 'object' && err !== null && typeof (err as { name?: unknown }).name === 'string'
        ? (err as { name: string }).name
        : '';
    if (name === 'UserNotFoundException') {
      return { status: 'code_sent' };
    }
    return { status: 'error', message: resetErrorMessage(err) };
  }
}

/**
 * Confirms a password reset using the emailed code and a new password (FR-6).
 * Never throws — returns a discriminated union result.
 */
export async function confirmResetPassword(input: {
  username: string;
  code: string;
  newPassword: string;
}): Promise<ResetConfirmResult> {
  try {
    await amplifyConfirmResetPassword({
      username: input.username,
      confirmationCode: input.code,
      newPassword: input.newPassword,
    });
    return { status: 'done' };
  } catch (err: unknown) {
    return { status: 'error', message: resetErrorMessage(err) };
  }
}
