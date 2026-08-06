// @sdd-spec actors/public-self-registration (T-3, T-8)
import { MailMessage } from '../mail-transport.interface';
import { OTP_LIFETIME_MS } from '../../registrations/email-verification.service';

/**
 * T-8 correction — the lifetime text below previously hardcoded "15
 * minutes" as a string literal while `email-verification.service.ts`
 * exported `OTP_LIFETIME_MS = 15 * 60 * 1000` — two sources of truth for
 * one number, the exact drift class this spec keeps finding (see
 * design.md's revision history). Derived here instead, so a future change
 * to `OTP_LIFETIME_MS` cannot silently leave this copy describing the wrong
 * window.
 */
const OTP_LIFETIME_MINUTES = OTP_LIFETIME_MS / (60 * 1000);

/**
 * FR-4 — the one-time verification-code message.
 *
 * Sent BEFORE any Registration row exists (FR-4: "No Registration row is
 * written until the code has been verified"), so no reference has been
 * allocated yet — this message carries none. See
 * `mail-transport.interface.ts` for why `reference` is optional.
 */
export function buildVerificationCodeMessage(to: string, code: string): MailMessage {
  return {
    to,
    subject: 'Your ACCELERATE Tanzania verification code',
    text:
      `Your verification code is ${code}. It expires in ${OTP_LIFETIME_MINUTES} minutes.\n\n` +
      'If you did not request this code, you can ignore this message.',
  };
}
