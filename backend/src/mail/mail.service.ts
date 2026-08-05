// @sdd-spec actors/public-self-registration (T-3)
/**
 * T-3 — `MailService` (FR-14, NFR-10, design.md §4.9).
 *
 * The only caller-facing surface of the `mail` module. Each method builds a
 * message from its `templates/*.template.ts` function and dispatches it
 * through whichever `MailTransport` `MAIL_TRANSPORT` selects
 * (`mail-transport.factory.ts`) — SES or no-op. Callers cannot tell which is
 * selected except by observing whether bytes left the process.
 *
 * 3b's decision-notice templates (approval, rejection) slot in the same way:
 * add a `sendApproval`/`sendRejection` method + template function, both
 * calling the same private `dispatch()`. No change to `MailTransport`, to
 * `MailModule`'s wiring, or to this class's shape is needed — see
 * `mail-transport.interface.ts` for the message contract 3b's templates
 * build against.
 *
 * Every dispatch logs an attempt line and an outcome line via Nest's built-in
 * `Logger` (design.md §4.10 attributes these lines to `MailService` directly,
 * separately from T-4's request-level interceptor, which does not exist yet
 * and is not built here). Log lines carry only the message kind and the
 * reference (or `"n/a"` for the verification-code message, which has none) —
 * NEVER the destination address, the OTP code, or any body text. If T-4 later
 * introduces a structured logger, swapping it in here means replacing the
 * `Logger` field with an injected one; no reshaping of the public methods.
 */
import { Injectable, Logger } from '@nestjs/common';
import { MailMessage } from './mail-transport.interface';
import { getMailTransport } from './mail-transport.factory';
import { buildVerificationCodeMessage } from './templates/verification-code.template';
import { buildReceiptMessage } from './templates/receipt.template';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  /** FR-4 — send the one-time verification code. Carries no reference (see the template). */
  async sendVerificationCode(to: string, code: string): Promise<void> {
    await this.dispatch('verification-code', buildVerificationCodeMessage(to, code));
  }

  /** FR-5 / FR-14 — send the submission receipt. Carries the reference. */
  async sendReceipt(to: string, reference: string): Promise<void> {
    await this.dispatch('receipt', buildReceiptMessage(to, reference));
  }

  /**
   * Log the attempt, send through the configured transport, log the outcome.
   * Rethrows a transport failure unchanged — this module does not decide
   * whether a caller treats a failed send as fatal (design.md DD-9: a
   * notification failure must never roll back a DB write; that is the
   * caller's placement to get right, not this method's to enforce).
   */
  private async dispatch(kind: string, message: MailMessage): Promise<void> {
    const reference = message.reference ?? 'n/a';
    this.logger.log(`mail send attempt kind=${kind} reference=${reference}`);

    try {
      await getMailTransport().send(message);
      this.logger.log(`mail send outcome kind=${kind} reference=${reference} status=sent`);
    } catch (err) {
      this.logger.error(`mail send outcome kind=${kind} reference=${reference} status=failed`);
      throw err;
    }
  }
}
