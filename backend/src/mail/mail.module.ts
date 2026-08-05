// @sdd-spec actors/public-self-registration (T-3)
import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * T-3 — MailModule: `MailService` only.
 *
 * The transport (SES vs no-op) is resolved lazily inside
 * `mail-transport.factory.ts` on first send, not here — so importing this
 * module does not require `MAIL_TRANSPORT` to be set. Not yet registered in
 * `app.module.ts`: nothing consumes `MailService` until 3a's OTP/submission
 * services (T-7, T-10) and 3b's approval/rejection notices import it — that
 * registration belongs to whichever task adds the first consumer.
 */
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
