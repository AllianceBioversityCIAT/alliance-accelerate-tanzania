// @sdd-spec auth/account-access-emails (T-2)
import { MailMessage } from '../mail-transport.interface';
import { getPublicAppBaseUrl } from '../mail.config';
import { renderEmailHtml } from './email-layout';

/**
 * FR-5 — the admin-initiated reset. `UsersService.resetPassword()`
 * dispatches this template (T-5, deps T-3, design.md §5.3 — as of T-2 this
 * was not yet wired up; T-5 (shipped) now resolves the recipient's `sub`
 * via `AdminGetUser` (already imported and used by `UsersService.get()`,
 * `users.service.ts`) rather than passing the caller's `id`, which is the
 * email address (design.md §5.2 DD-3/J-4). `MailService.sendAdminReset`
 * calls `buildAdminResetMessage` and hands the result to the
 * already-existing private `dispatch()` (`mail.service.ts`) — built in T-3.
 *
 * Unlike {@link ../templates/invitation.template.ts | buildInvitationMessage},
 * this is sent to a user who **already has an account** — an administrator
 * has reset its password, not created it. The copy below says so explicitly
 * (existing account, previous password no longer valid) so a recipient
 * cannot mistake it for a second invitation. `AdminSetUserPassword`'s
 * `Permanent: false` stays unchanged by this spec (design.md §5.4,
 * confirmed in `users.service.ts`'s `resetPassword()`), so — same as the
 * invitation — the credential this carries is single-use.
 */
/**
 * Path the sign-in link points at, under the public app base URL.
 *
 * NOT `/login`: that page redirects a visitor who already has a session
 * straight into the app (`LoginForm.tsx`'s already-authenticated guard), so
 * a recipient with an open session never saw the sign-in form and kept
 * working on the password this email just invalidated.
 * `/reset-password` clears the session first, then shows the same form.
 */
const SIGN_IN_PATH = '/reset-password';

/**
 * Resolved per call, from `PUBLIC_APP_BASE_URL`, never at module load —
 * same contract as `invitation.template.ts`'s `signInUrl` and
 * `receipt.template.ts`'s `statusLookupUrl` (ATP-67).
 *
 * `getPublicAppBaseUrl` throws on a missing, `*`, or non-http(s) value. At
 * module load that throw would take down every suite that merely imports
 * this file, including ones that never send a reset email. Resolved here
 * instead, the blast radius is one email: `MailService.dispatch` rethrows a
 * transport failure unchanged and does not absorb this (`mail.service.ts`),
 * so it is `UsersService.resetPassword` (T-5, design.md §5.3) that will
 * await the dispatch inside its own `try`/`catch` and report
 * `emailSent: false` — not yet implemented as of this task.
 */
function signInUrl(): string {
  return `${getPublicAppBaseUrl()}${SIGN_IN_PATH}`;
}

/**
 * @param to Recipient's email address.
 * @param temporaryPassword The new single-use credential `UsersService` generated
 *   and set on the Cognito account via `AdminSetUserPassword(Permanent: false)`.
 *   That call leaves the account requiring a password change at next sign-in
 *   (design §5.4), so this credential is single-use regardless of the
 *   channel it travels over.
 * @param reference Correlation id for `MailService`'s attempt/outcome log
 *   lines — the Cognito `sub`, resolved by the caller via `AdminGetUser`
 *   (design §5.2 DD-3), never the email address (NFR-1). Optional: when
 *   `sub` cannot be resolved the caller passes none, and `dispatch` logs
 *   `reference=n/a` rather than substituting the address.
 */
export function buildAdminResetMessage(
  to: string,
  temporaryPassword: string,
  reference?: string,
): MailMessage {
  const SIGN_IN_URL = signInUrl();

  return {
    to,
    reference,
    subject: 'Your ACCELERATE Tanzania password has been reset',
    text:
      'An administrator has reset the password on your existing ACCELERATE ' +
      'Tanzania account.\n\n' +
      `Your new temporary password is: ${temporaryPassword}\n\n` +
      'Your previous password no longer works. This new one is single-use ' +
      `— sign in with it and you will be asked to set a new password ` +
      `immediately:\n${SIGN_IN_URL}\n\n` +
      'If you did not expect this, contact your administrator.',
    html: renderEmailHtml({
      preheader: 'An administrator has reset your ACCELERATE Tanzania account password.',
      heading: 'Your password has been reset',
      blocks: [
        {
          kind: 'paragraph',
          text: 'An administrator has reset the password on your existing ACCELERATE Tanzania account.',
        },
        {
          kind: 'callout',
          label: 'New temporary password',
          value: temporaryPassword,
          caption:
            'Single-use — your previous password no longer works. You will be ' +
            'asked to set a new one when you sign in.',
        },
        { kind: 'link', label: 'Sign in and set a new password', href: SIGN_IN_URL },
        {
          kind: 'note',
          text: 'If you did not expect this, contact your administrator.',
        },
      ],
    }),
  };
}
