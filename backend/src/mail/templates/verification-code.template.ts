// @sdd-spec actors/public-self-registration (T-3)
import { MailMessage } from '../mail-transport.interface';

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
      `Your verification code is ${code}. It expires in 15 minutes.\n\n` +
      'If you did not request this code, you can ignore this message.',
  };
}
