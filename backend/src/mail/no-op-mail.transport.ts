// @sdd-spec actors/public-self-registration (T-3)
import { MailMessage, MailTransport } from './mail-transport.interface';

/** One recorded send attempt. Never carries `to`, `subject`, or `text` — only the non-PII reference (design.md §4.10's never-logged list applies equally to anything this class retains). */
export interface RecordedSend {
  reference?: string;
  at: Date;
}

/**
 * T-3 — no-op transport (NFR-10, design.md §4.9).
 *
 * `send()` records that an attempt was made and resolves successfully
 * WITHOUT constructing an SES client, opening a network connection, or
 * touching any credential — zero bytes leave the process. This is what makes
 * "email disabled" a runnable configuration rather than a thought
 * experiment: selecting `MAIL_TRANSPORT=no-op` must make the applicant flow
 * complete exactly as if mail had been sent, with nothing actually sent.
 */
export class NoOpMailTransport implements MailTransport {
  private readonly recorded: RecordedSend[] = [];

  async send(message: MailMessage): Promise<void> {
    this.recorded.push({ reference: message.reference, at: new Date() });
  }

  /** Test/ops seam — attempts recorded so far. Never exposes `to`, `subject`, or `text`. */
  getRecordedSends(): readonly RecordedSend[] {
    return this.recorded;
  }
}
