// @sdd-spec actors/public-self-registration (T-8)
/**
 * T-8 — `RegistrationsService.requestVerificationCode` (FR-4, FR-8,
 * design.md §3.1 decision 1).
 *
 * The one method this task adds. Its whole job is to make `POST
 * /registrations/verify` return `202` with an empty body for EVERY accepted
 * input — a deliverable address, an undeliverable one, and one already over
 * {@link OTP_MAX_SENDS_PER_HOUR} — with no observable difference between
 * them. `T-10`'s submission service and `T-11`'s lookup service are siblings
 * in this file's eventual final shape, not built here.
 *
 * **The cap is enforced by silently not sending, never by refusing.**
 * `EmailVerificationService.issueCode` throws
 * `EmailVerificationSendLimitExceededError` — a plain domain error, deliberately
 * carrying no email or code (T-7's choice) — once the per-email budget is
 * spent. This method is what turns that domain error into "no observable
 * difference": the error is caught here and swallowed. The controller never
 * sees it, and returns exactly the same `202`/empty body it would for any
 * other accepted address (design.md §3.1 decision 1; requirements.md FR-4's
 * "Code request and successful verification" scenario).
 *
 * **The timing residue T-7 flagged, and what this method does about it.**
 * `issueCode` throws BEFORE creating an `EmailVerification` row and before
 * any mail is sent, so a naive `await issueCode(); await mail.send(...)`
 * shape would make the capped path measurably faster than the uncapped one
 * — the response latency itself becomes an oracle for "a code was recently
 * requested for this address", reintroducing C-3's oracle through timing
 * rather than status. The dominant cost on the uncapped path is not the one
 * extra `EmailVerification.create` row — it is `MailService.sendVerificationCode`,
 * which round-trips to SES (or the no-op transport). This method does NOT
 * await that call: it is dispatched and its outcome is only logged, never
 * awaited or rethrown. That removes the one cost that scales with an
 * external network call from the response-time budget of BOTH branches —
 * the capped branch was already not paying it, so removing it from the
 * uncapped branch is what actually equalises the two, rather than trying to
 * add equivalent artificial latency to the capped branch (which would need
 * to track SES's variable RTT to stay accurate, and would slow down the
 * common case for every applicant to do it).
 *
 * **What is NOT closed, stated honestly — reasoned, not measured.** The
 * uncapped path still performs one extra `await` — `EmailVerification.create`
 * inside `issueCode` — that the capped path does not reach. That is a real
 * residue: one additional Prisma round-trip on a shared connection pool, not
 * a network call to a third party. **This is a reasoned bound, not a wall-
 * clock measurement**: an earlier revision of this file and of
 * `registrations-verify.e2e.spec.ts` claimed the gap was "measured" via a
 * paired capped/uncapped timing comparison, but that comparison mocked
 * `issueCode` itself and injected the identical artificial delay into both
 * branches — which proves the mock's own construction, not this endpoint's
 * behaviour, and was corrected (rework attempt 2) rather than kept. What
 * genuinely IS proven, deterministically, by
 * `registrations-verify.e2e.spec.ts`: the response does not wait on mail —
 * a mail-send promise that is never resolved during the test still lets the
 * request complete. Whether the remaining one-write residue is "small" is
 * therefore an engineering judgement (one local Prisma round-trip vs. an SES
 * network call), not a number this suite can honestly claim to have
 * measured. Closing that last increment would require either making
 * `issueCode` itself not await its own write (T-7's method, out of this
 * task's file list and a correctness trade-off that is T-7's to make, not
 * this endpoint's to force) or padding every response to a fixed floor
 * (rejected here: it would tax every applicant's common-case latency to
 * hide a residue reasoned to be much smaller than the SES call it replaces,
 * without a load-bearing measurement to size it precisely).
 *
 * **A second, more severe residue: the Lambda freeze can drop the send
 * entirely, silently.** `serverless-http` resolves the HTTP response as soon
 * as this method's returned promise settles — which, by design above, is
 * BEFORE the fire-and-forget `sendVerificationCode(...)` call has finished.
 * Lambda is permitted to freeze the execution environment immediately after
 * the response is written; a frozen environment does not run pending
 * microtasks, so if the container is not re-invoked before the freeze, the
 * in-flight SES call — and this method's own `.catch()` — may never
 * complete or run at all. No failure line is ever logged for that send.
 * This compounds the fragility FR-4's own accepted-cost paragraph already
 * signs off on (`requirements.md` §6 FR-4: "the one place email is
 * load-bearing", with "no in-band fallback") — a freeze-dropped send fails
 * exactly the same way a real SES failure does, but WITHOUT the outcome
 * line design.md §4.10 relies on for diagnosability. *(Corrected rework
 * attempt 3: an earlier revision of this paragraph cited that accepted-cost
 * paragraph as "R-1", a risk-register ID that does not resolve anywhere —
 * `requirements.md` §12 is Dependencies & Assumptions and enumerates only
 * `DEP-*`/`A-*`; this spec has no R-register at all. The substance above is
 * unchanged and accurate; only the dangling ID is removed.)* It is accepted
 * here for the same timing reason the rest of
 * this residue is — awaiting the send to guarantee its outcome is logged
 * would restore the latency oracle this method exists to remove. **There is
 * a real, if partial, detection channel already in place though nobody has
 * wired an alarm to it**: `MailService.dispatch` (`mail.service.ts`) logs
 * its ATTEMPT line synchronously, before its first `await` — so that line
 * survives a freeze that drops everything after it. An attempt line with no
 * matching outcome line, accumulating in CloudWatch, is a countable signal
 * for a systemic mail outage (freezes dropping sends, not just this one
 * verification-code path). Recording that here so it can be built into an
 * alarm later; nothing in this task wires one.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  EmailVerificationSendLimitExceededError,
  EmailVerificationService,
} from './email-verification.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);

  constructor(
    private readonly emailVerificationService: EmailVerificationService,
    private readonly mailService: MailService,
  ) {}

  /**
   * FR-4 / FR-8. Never throws for an over-cap address — the cap is enforced
   * silently (design.md §3.1 decision 1). A malformed email never reaches
   * here at all: `RegistrationVerifyDto`'s `@IsEmail()` rejects it in the
   * pipe, before the controller method runs.
   */
  async requestVerificationCode(rawEmail: string): Promise<void> {
    let issued: { code: string };
    try {
      issued = await this.emailVerificationService.issueCode(rawEmail);
    } catch (err) {
      if (err instanceof EmailVerificationSendLimitExceededError) {
        // The cap's entire observable effect: no code is sent. The caller
        // gets back exactly the same 202/empty response as every other
        // accepted address (see the class doc's timing note above).
        return;
      }
      throw err;
    }

    // Deliberately NOT awaited (see class doc): the SES/no-op round trip
    // must never be part of the response-time budget this endpoint returns
    // in, on EITHER branch. Failure is logged, never surfaced to the caller
    // — a 202 has already been decided, and this is a fire-and-forget
    // notification, not a write this request's correctness depends on.
    //
    // Rework attempt 2 (FAIL 1): this used to log `err.message` — but
    // `MailService.dispatch` rethrows a transport failure UNCHANGED
    // (`mail.service.ts`, deliberate — DD-9), and the AWS SDK's own
    // `MessageRejected` error (thrown, in this repo's documented SES-sandbox
    // configuration, for every unverified destination address —
    // `ses-mail.transport.ts`, `backend/CLAUDE.md`) puts the destination
    // address VERBATIM in its `message`. That made this the only
    // `logger.*` call in `backend/src` that interpolates an unbounded
    // value, and would have written the applicant's email to CloudWatch —
    // a PII leak on an unauthenticated public path (design.md §4.10/§6.3:
    // "Never logged: … email addresses"). It was also redundant:
    // `MailService.dispatch` already logs a bounded
    // `kind=verification-code reference=n/a status=failed` outcome line
    // before rethrowing. Logging only the error's CLASS NAME below (an SDK
    // discriminator like `MessageRejected`/`AccessDenied`/`TimeoutError`,
    // never its message) adds operationally-useful detail without
    // reintroducing the leak — see `registrations.service.spec.ts` for the
    // regression test asserting the emitted line never contains the address.
    void this.mailService.sendVerificationCode(rawEmail, issued.code).catch((err: unknown) => {
      const errorType = err instanceof Error ? err.name : 'UnknownError';
      this.logger.error(`verification code send failed: errorType=${errorType}`);
    });
  }
}
