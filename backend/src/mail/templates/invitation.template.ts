// @sdd-spec auth/account-access-emails (T-1)
import { MailMessage } from '../mail-transport.interface';
import { getPublicAppBaseUrl } from '../mail.config';
import { renderEmailHtml } from './email-layout';

/**
 * FR-1 — the invitation `UsersService.create()` will dispatch to a
 * newly-created Staff/Admin user once wired up (T-4, deps T-3, design.md
 * §5.3 — not yet built as of this task).
 *
 * Carries the temporary password (FR-1 scenario 1, Q-2 "carry it") and a
 * sign-in link built from `PUBLIC_APP_BASE_URL` (FR-1's link `AND`, NFR-3).
 * `MessageAction: 'SUPPRESS'` is already set on `create()`'s
 * `AdminCreateUser` call (`users.service.ts`) and stays unchanged (design.md
 * §5.4) — so today Cognito sends the recipient no invitation mail at all;
 * once T-4 dispatches this template, it becomes the only invitation mail
 * the recipient gets, replacing the manual handoff, not Cognito's own
 * mailer.
 */
/** Path the sign-in link points at, under the public app base URL. */
const SIGN_IN_PATH = '/login';

/**
 * Resolved per call, from `PUBLIC_APP_BASE_URL`, never at module load —
 * mirrors `receipt.template.ts`'s `statusLookupUrl` (ATP-67).
 *
 * `getPublicAppBaseUrl` throws on a missing, `*`, or non-http(s) value. At
 * module load that throw would take down every suite that merely imports
 * this file, including ones that never send an invitation. Resolved here
 * instead, the blast radius is one email: `MailService.dispatch` rethrows a
 * transport failure unchanged and does not absorb this (`mail.service.ts`),
 * so it is `UsersService.create` / `resetPassword` (T-4/T-5, design.md
 * §5.3) that will await the dispatch inside their own `try`/`catch` and
 * report `emailSent: false` — not yet implemented as of this task.
 */
function signInUrl(): string {
  return `${getPublicAppBaseUrl()}${SIGN_IN_PATH}`;
}

/**
 * @param to Recipient's email address.
 * @param temporaryPassword The single-use credential `UsersService` generated
 *   and set on the Cognito account.
 *   `FORCE_CHANGE_PASSWORD` is left in place by `UsersService.create` (design
 *   §5.4), so this credential is single-use regardless of the channel it
 *   travels over.
 * @param reference Correlation id for `MailService`'s attempt/outcome log
 *   lines — the Cognito `sub`, resolved by the caller (design §5.2 DD-3),
 *   never the email address (NFR-1). Optional: when `sub` cannot be
 *   resolved the caller passes none, and `dispatch` logs `reference=n/a`
 *   rather than substituting the address.
 */
export function buildInvitationMessage(
  to: string,
  temporaryPassword: string,
  reference?: string,
): MailMessage {
  const SIGN_IN_URL = signInUrl();

  return {
    to,
    reference,
    subject: 'You have been invited to ACCELERATE Tanzania',
    text:
      'An administrator has created an ACCELERATE Tanzania account for you.\n\n' +
      `Your temporary password is: ${temporaryPassword}\n\n` +
      'This password is single-use — sign in with it and you will be asked ' +
      `to set a new password immediately:\n${SIGN_IN_URL}\n\n` +
      'If you were not expecting this invitation, you can ignore this message.',
    html: renderEmailHtml({
      preheader: 'An administrator has created an ACCELERATE Tanzania account for you.',
      heading: 'You have been invited to ACCELERATE Tanzania',
      blocks: [
        {
          kind: 'paragraph',
          text: 'An administrator has created an ACCELERATE Tanzania account for you.',
        },
        {
          kind: 'callout',
          label: 'Temporary password',
          value: temporaryPassword,
          caption: 'Single-use — you will be asked to set a new password when you sign in.',
        },
        { kind: 'link', label: 'Sign in', href: SIGN_IN_URL },
        {
          kind: 'note',
          text: 'If you were not expecting this invitation, you can ignore this message.',
        },
      ],
    }),
  };
}
