// @sdd-spec actors/public-self-registration (T-3)
import { MailTransport } from './mail-transport.interface';
import { getMailTransportKind } from './mail.config';
import { SesMailTransport } from './ses-mail.transport';
import { NoOpMailTransport } from './no-op-mail.transport';

/**
 * Lazily resolve + cache the configured `MailTransport` (design.md §4.9),
 * selected by `MAIL_TRANSPORT`. Resolved on first send, not at module init —
 * mirrors `auth.config.ts` / `users/cognito-admin.client.ts`'s lazy-resolution
 * pattern, so a checkout without `MAIL_TRANSPORT` set can still boot and serve
 * every other route; the error surfaces only when `MailService` is actually
 * asked to send.
 */
let transport: MailTransport | undefined;

export function getMailTransport(): MailTransport {
  if (!transport) {
    transport =
      getMailTransportKind() === 'ses' ? new SesMailTransport() : new NoOpMailTransport();
  }
  return transport;
}

/** Test seam — reset the cached transport singleton between specs. */
export function resetMailTransport(): void {
  transport = undefined;
}
