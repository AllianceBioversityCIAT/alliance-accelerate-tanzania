// @sdd-spec actors/public-self-registration (T-3)
// @sdd-spec contact/contact-channels (T-1)
/**
 * T-3 — `MailService` (FR-14, NFR-10, design.md §4.9).
 *
 * The only caller-facing surface of the `mail` module. Each method builds a
 * message from its `templates/*.template.ts` function and dispatches it
 * through whichever `MailTransport` `MAIL_TRANSPORT` selects
 * (`mail-transport.factory.ts`) — the notification microservice or no-op.
 * Callers cannot tell which is selected except by observing whether bytes
 * left the process.
 *
 * 3b's decision-notice templates (approval, rejection) slot in the same way:
 * add a `sendApproval`/`sendRejection` method + template function, both
 * calling the same private `dispatch()`. No change to `MailTransport`, to
 * `MailModule`'s wiring, or to this class's shape is needed — see
 * `mail-transport.interface.ts` for the message contract 3b's templates
 * build against.
 *
 * `sendContactMessage` (contact/contact-channels T-1, design.md §2, §4.6)
 * departs from that shape in one way: it takes an already-rendered
 * `MailMessage` rather than building one from a template internally, because
 * the contact form's recipients are resolved by the caller (Cognito `admin`
 * group membership, T-5), not known to this service. It still dispatches
 * through the same private `dispatch()` and carries no `reference` — nothing
 * is persisted on the contact path, so there is no applicant-facing
 * correlator to allocate (FR-7).
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
import { buildApprovalMessage } from './templates/approval.template';
import { buildRejectionMessage } from './templates/rejection.template';
import { buildInvitationMessage } from './templates/invitation.template';
import { buildAdminResetMessage } from './templates/admin-reset.template';

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
   * `admin/registration-review-queue` T-8 — FR-12 / FR-14 scenario 1: send
   * the approval-decision message. Callers MUST dispatch this only after
   * their adjudication transaction has committed (DD-9) — this method
   * itself enforces nothing about ordering; see
   * `AdminRegistrationsService.approve`'s `dispatchApprovalEmail`.
   */
  async sendApproval(to: string, reference: string): Promise<void> {
    await this.dispatch('approval', buildApprovalMessage(to, reference));
  }

  /**
   * `admin/registration-review-queue` T-9 — FR-13 / FR-14 scenario 2: send
   * the rejection-decision message. Callers MUST dispatch this only after
   * their adjudication transaction has committed (DD-9) — same contract as
   * {@link sendApproval}; see `AdminRegistrationsService.reject`'s
   * `dispatchRejectionEmail`.
   */
  async sendRejection(to: string, reference: string): Promise<void> {
    await this.dispatch('rejection', buildRejectionMessage(to, reference));
  }

  /**
   * auth/account-access-emails T-3 — FR-1: send the invitation email
   * `UsersService.create()` dispatches after a new Staff/Admin account is
   * created (T-4, design.md §5.3 — as of T-3 this was not yet built; T-4
   * (shipped) now dispatches `sendInvitation` from
   * `users.service.ts::create()`, at :340).
   *
   * `reference` is expected to be the created user's Cognito `sub`,
   * resolved by that caller via `../users/cognito-sub.util.ts`'s
   * `resolveCognitoSub` — **never** the account's `id`/`Username`, which is
   * the email address in this system (NFR-1; design.md §5.2 DD-3 as
   * corrected by judgment round 1's J-4). Optional: when the caller could
   * not resolve a `sub` it passes none, and {@link dispatch} logs
   * `reference=n/a` rather than a substitute.
   */
  async sendInvitation(
    to: string,
    temporaryPassword: string,
    reference?: string,
  ): Promise<void> {
    await this.dispatch('invitation', buildInvitationMessage(to, temporaryPassword, reference));
  }

  /**
   * auth/account-access-emails T-3 — FR-5: send the new temporary password
   * `UsersService.resetPassword()` dispatches after an admin-initiated
   * reset (T-5, design.md §5.2/§5.3 — as of T-3 this was not yet built;
   * T-5 (shipped) now dispatches `sendAdminReset` from
   * `users.service.ts::resetPassword()`, at :543). Same `reference`
   * contract as {@link sendInvitation}: the target user's Cognito `sub`,
   * which that caller resolves via an `AdminGetUser` call (already
   * imported and used by `UsersService.get()`) rather than the `id`
   * already in scope at that call site — the same email-shaped value
   * NFR-1 forbids logging.
   */
  async sendAdminReset(
    to: string,
    temporaryPassword: string,
    reference?: string,
  ): Promise<void> {
    await this.dispatch('admin-reset', buildAdminResetMessage(to, temporaryPassword, reference));
  }

  /**
   * contact/contact-channels FR-2, FR-4 — dispatch an already-rendered
   * contact-form message (recipients, subject and body all built by the
   * caller). Rethrows unchanged on transport failure, same as every
   * other `dispatch()` caller — the contact endpoint turns that rejection
   * into its `502` (design.md §4.6). Carries no `reference` (see class docblock).
   */
  async sendContactMessage(message: MailMessage): Promise<void> {
    await this.dispatch('contact', message);
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
