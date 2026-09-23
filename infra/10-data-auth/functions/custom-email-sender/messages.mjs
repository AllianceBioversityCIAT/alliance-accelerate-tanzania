// T-2 (docs/specs/auth/forgot-password-delivery, design.md §3 step 4, §5).
//
// The two message bodies this function's handler (T-4) builds and
// publishes. Rendering only — no decryption, no Cognito event handling, no
// publishing. T-4's handler decrypts Cognito's code, decides which of these
// two builders to call based on `triggerSource` (design.md §5), and passes
// each the plaintext `code` and the recipient's validated email address.
//
// Both builders take a CODE, never a password (FR-1's `BUT it must NOT`) —
// there is no password parameter on either signature, so there is nothing
// here that could be one.
//
// Only the attribute-verification message contains a link. The password-
// reset message deliberately does not (T-2 attempt 2, Reviewer FAIL): the
// frontend's `/forgot-password` form always opens at its in-memory
// `step: 'request'` (email + "Send reset code") with no query-param entry
// to the code-entry step, so a link back to that path would tell the
// reader to do something the page cannot do — re-issuing a new code would
// invalidate the one just sent. Fixing that is a frontend change §7
// forecloses for this spec ("no component, no copy, no error mapping"),
// not something this task can patch around with a link. Instead the reset
// message tells the reader to return to the window where they started —
// which is already on the code-entry step, email pre-filled — carrying the
// code and nothing else. The attribute-verification message still derives
// its `/login` link from `PUBLIC_APP_BASE_URL` via `getPublicAppBaseUrl()`
// (NFR-3) — never a literal host — which throws rather than emitting a
// broken or wrong-host link (see config.mjs).
//
// FR-4's `BUT it must NOT`: neither body claims the message *arrived* —
// only ever that a code was issued / a change was made. Delivery is not
// something this function (or Cognito, or the microservice) can promise.

import { getPublicAppBaseUrl } from './config.mjs';
import { renderEmailHtml } from './email-layout.mjs';

/** Where the attribute-verification message points — no dedicated confirm
 *  screen exists in this app for a Cognito attribute-verification code
 *  (grep of frontend/ found none), so this points at sign-in, same as
 *  backend/src/mail/templates/admin-reset.template.ts's `SIGN_IN_PATH`. */
const SIGN_IN_PATH = '/login';

/**
 * Resolved per call, never at module load — same contract as every
 * backend/src/mail/templates/*.ts link helper (ATP-67): a module-level
 * throw would take down anything that merely imports this file, including
 * a test that never builds a message.
 */
function signInUrl() {
  return `${getPublicAppBaseUrl()}${SIGN_IN_PATH}`;
}

/**
 * `CustomEmailSender_ForgotPassword` (design.md §5) — a user requested a
 * self-service password reset. Carries the decrypted code, never a
 * password.
 *
 * Deliberately emits **no link** (T-2 attempt 2, Reviewer FAIL): the reader
 * already has the window where they requested the reset open, sitting on
 * the code-entry step with their email pre-filled, and that is where the
 * code must be typed — the reset is code-based, read on one device and
 * typed on another if the two differ, same as most code-based resets. This
 * builder does not call `getPublicAppBaseUrl()` at all, so it renders (and
 * this whole flow keeps working) whether or not `PUBLIC_APP_BASE_URL` is
 * configured.
 *
 * @param {string} to Recipient's email address (validated by the caller —
 *   T-4's recipient-validation step, design.md §3 step 3 — before this is
 *   invoked; this module does not validate `to`, it only renders).
 * @param {string} code The decrypted one-time reset code.
 * @returns {{to: string, subject: string, text: string, html: string}}
 */
export function buildPasswordResetMessage(to, code) {
  return {
    to,
    subject: 'Your ACCELERATE Tanzania password reset code',
    text:
      'A password reset was requested for your ACCELERATE Tanzania account.\n\n' +
      `Your reset code is ${code}.\n\n` +
      'Go back to the window or tab where you requested this reset and ' +
      'enter the code there to choose a new password — it is already ' +
      'waiting on that step, with your email address filled in.\n\n' +
      'If you did not request this, you can ignore this message — your ' +
      'password will not change unless this code is used.',
    html: renderEmailHtml({
      preheader: `Your reset code is ${code}.`,
      heading: 'Reset your password',
      blocks: [
        {
          kind: 'paragraph',
          text: 'A password reset was requested for your ACCELERATE Tanzania account.',
        },
        {
          kind: 'callout',
          label: 'Reset code',
          value: code,
          caption:
            'Go back to the window or tab where you requested this reset ' +
            'and enter it there — it is already waiting on that step, ' +
            'with your email address filled in.',
        },
        {
          kind: 'note',
          text:
            'If you did not request this, you can ignore this message — ' +
            'your password will not change unless this code is used.',
        },
      ],
    }),
  };
}

/**
 * `CustomEmailSender_VerifyUserAttribute` (design.md §5) — an administrator
 * changed a user's email address (`users.service.ts`'s
 * `AdminUpdateUserAttributesCommand`) and Cognito needs the new address
 * verified. Carries the decrypted code, never a password.
 *
 * @param {string} to Recipient's email address — the NEW address being
 *   verified (validated by the caller before this is invoked).
 * @param {string} code The decrypted one-time verification code.
 * @returns {{to: string, subject: string, text: string, html: string}}
 */
export function buildAttributeVerificationMessage(to, code) {
  const SIGN_IN_URL = signInUrl();

  return {
    to,
    subject: 'Verify your ACCELERATE Tanzania email address',
    text:
      'An administrator updated the email address on your ACCELERATE ' +
      'Tanzania account.\n\n' +
      `Your verification code is ${code}.\n\n` +
      'Once verified, sign in as usual:\n' +
      `${SIGN_IN_URL}\n\n` +
      'If you did not expect this change, contact your administrator.',
    html: renderEmailHtml({
      preheader: `Your verification code is ${code}.`,
      heading: 'Verify your email address',
      blocks: [
        {
          kind: 'paragraph',
          text: 'An administrator updated the email address on your ACCELERATE Tanzania account.',
        },
        { kind: 'callout', label: 'Verification code', value: code },
        { kind: 'link', label: 'Sign in', href: SIGN_IN_URL },
        {
          kind: 'note',
          text: 'If you did not expect this change, contact your administrator.',
        },
      ],
    }),
  };
}
