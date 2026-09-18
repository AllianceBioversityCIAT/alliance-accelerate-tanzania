// @sdd-spec actors/public-self-registration (T-3)
// @sdd-spec enhancement/email-notification-microservice (T-4)
import { MailTransport } from './mail-transport.interface';
import { getMailTransportKind, MailTransportKind } from './mail.config';
import { NoOpMailTransport } from './no-op-mail.transport';
import { MicroserviceMailTransport } from './microservice-mail.transport';

/**
 * Lazily resolve + cache the configured `MailTransport` (design.md §4.9),
 * selected by `MAIL_TRANSPORT`. Resolved on first send, not at module init —
 * mirrors `auth.config.ts` / `users/cognito-admin.client.ts`'s lazy-resolution
 * pattern, so a checkout without `MAIL_TRANSPORT` set can still boot and serve
 * every other route; the error surfaces only when `MailService` is actually
 * asked to send.
 */
let transport: MailTransport | undefined;

/**
 * T-4 (design.md §4.1; inherited constraint from T-3's review) — an
 * **exhaustive `switch`** whose `default` THROWS, deliberately NOT a
 * ternary/short-circuit arm.
 *
 * The previous shape, `kind === 'ses' ? Ses : NoOp`, made `NoOpMailTransport`
 * the **silent fallback for every unhandled kind** — appending a branch for
 * `'microservice'` there would have regenerated that exact hazard the moment
 * `MailTransportKind` grew again. That is this spec's own worst-named
 * failure class, **D-J**: *"every request `202`, zero emails, no signal
 * anywhere"* — except one step further back, before a queue is even
 * involved: no transport would run AT ALL, silently swapped for a no-op
 * that reports success.
 *
 * `kind` is `MailTransportKind`, a closed 2-value union as of Phase B
 * (`'microservice' | 'no-op'` — `'ses'` was narrowed out in T-10), so the
 * `default` branch is unreachable through the type system alone — the
 * `exhaustiveCheck: never` assignment is what makes the compiler enforce
 * that every member of the union is handled above. But `getMailTransportKind()`
 * is a **runtime** boundary (it parses `process.env.MAIL_TRANSPORT`), so the
 * `default`'s `throw` is not just a compile-time nicety: it is the guard
 * against exactly the scenario the constraint describes — a future widening
 * of the union that the switch is not updated to match. A guard that is
 * hoped for (a ternary that happens to cover every value that exists today)
 * is not a guard; this one fails loudly on the value it does not recognise.
 */
export function getMailTransport(): MailTransport {
  if (!transport) {
    const kind: MailTransportKind = getMailTransportKind();
    switch (kind) {
      case 'microservice':
        transport = new MicroserviceMailTransport();
        break;
      case 'no-op':
        transport = new NoOpMailTransport();
        break;
      default: {
        const exhaustiveCheck: never = kind;
        throw new Error(
          `Unhandled MAIL_TRANSPORT kind "${String(exhaustiveCheck)}" — no transport is ` +
            'wired for it in mail-transport.factory.ts. Refusing to silently fall back to ' +
            'the no-op transport (design.md §4.1; the D-J failure class).',
        );
      }
    }
  }
  return transport;
}

/** Test seam — reset the cached transport singleton between specs. */
export function resetMailTransport(): void {
  transport = undefined;
}
