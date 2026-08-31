// @sdd-spec contact/contact-channels (T-6)
/**
 * T-6 — `ContactService` (FR-2, FR-3, FR-5, FR-7, FR-8, design.md §1, §3,
 * §4.1, §4.4, DD-3, DD-4).
 *
 * The single method this task adds, `submitContact`, is where every earlier
 * task in this spec converges: T-4's DTO, T-5's recipient resolver, T-3's
 * template (which itself calls T-2's `composeReplyTo`), and T-1's
 * `MailService.sendContactMessage`. Order, exactly as design.md §1's diagram
 * states it: resolve recipients -> render one message -> **await** the send
 * -> return. No branch of this method leaves the send unawaited — DD-3
 * retired fire-and-forget dispatch for this feature entirely, so unlike
 * `RegistrationsService.requestVerificationCode`'s deliberately-unawaited
 * `void … .catch(...)` shape, this method's `sendContactMessage` call sits
 * directly in its own `try`/`await`, and a rejection is what becomes the
 * `502` FR-5 requires the visitor to see.
 *
 * **The honeypot branch returns before anything is resolved or dispatched
 * (FR-8).** A filled `website` field short-circuits this method with no call
 * to `AdminRecipientResolver.resolve()`, no template render, and no
 * `MailService` call at all — "zero dispatches" is therefore not a race this
 * method has to avoid, it is a code path that structurally cannot reach the
 * dispatch call. The controller's `@HttpCode(202)` is unconditional, so the
 * honeypot branch's plain `return` produces the identical response a
 * successful send does; there is no second status code anywhere in this
 * method for a caller to distinguish.
 *
 * **The 502 envelope, and what it deliberately omits.** `err.name` (a
 * bounded, class-name-only value) is the only thing this method logs from a
 * transport failure — never `err.message`. `registrations.service.ts`
 * records why: the AWS SDK's `MessageRejected` error puts the destination
 * address verbatim in its `message`, and `MailService.dispatch` rethrows
 * unchanged, so that error reaches this `catch` block exactly as it would
 * reach `RegistrationsService`'s. The thrown `BadGatewayException`'s body
 * carries a fixed, friendly `message` and no `error`-derived text at all —
 * no provider name, no status code, no stack, no recipient address (design.md
 * §3's response table and §6's "Error logging" row; the §3.2 this once cited
 * belonged to a design revision that was later restructured).
 */
import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { AdminRecipientResolver } from './admin-recipient.resolver';
import { ContactCreateDto } from './dto/contact-create.dto';
import { MailService } from '../mail/mail.service';
import { buildContactMessage } from '../mail/templates/contact.template';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly adminRecipientResolver: AdminRecipientResolver,
    private readonly mailService: MailService,
  ) {}

  /**
   * FR-2, FR-3, FR-5, FR-7, FR-8. Returns normally (the controller's `202`)
   * on both a genuine successful send and a filled honeypot; throws a `502`
   * only when the transport itself rejects the send. Never issues a database
   * query anywhere in this method — FR-7's gate (DC-4) depends on that
   * holding for this path exactly as it does for the throttled and
   * validation-rejected paths, which never reach this service at all.
   */
  async submitContact(dto: ContactCreateDto): Promise<void> {
    if (this.isHoneypotFilled(dto)) {
      this.logHoneypotRejection();
      return;
    }

    const recipients = await this.adminRecipientResolver.resolve();
    const message = buildContactMessage(recipients, {
      name: dto.name,
      email: dto.email,
      organization: dto.organization,
      category: dto.category,
      subject: dto.subject,
      message: dto.message,
    });

    try {
      await this.mailService.sendContactMessage(message);
    } catch (err) {
      // Class name only, never `err.message` — see the class docblock and
      // `registrations.service.ts`'s identical, already-reviewed rationale:
      // `MessageRejected` carries the destination address verbatim in its
      // message.
      const errorType = err instanceof Error ? err.name : 'UnknownError';
      this.logger.error(`contact message send failed: errorType=${errorType}`);
      throw new BadGatewayException({
        statusCode: 502,
        error: 'Bad Gateway',
        message: 'We could not send your message right now. Please try again shortly.',
      });
    }
  }

  /**
   * FR-8: any non-empty `website` value is treated as filled — an absent
   * field or an empty string is not. No length check here or anywhere else
   * on this field (design.md §4.1.1, DC-4/DC-5): a cap would make the trap
   * self-identifying, which is exactly what the 32 KB request-body cap
   * (`common/payload-cap.config.ts`) exists to bound instead.
   */
  private isHoneypotFilled(dto: ContactCreateDto): boolean {
    return typeof dto.website === 'string' && dto.website.length > 0;
  }

  /** FR-8: log the rejection kind only — no field values, ever. */
  private logHoneypotRejection(): void {
    this.logger.warn('contact submission rejected: honeypot field was populated');
  }
}
