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
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, RegistrationStatus } from '@prisma/client';
import {
  EmailVerificationSendLimitExceededError,
  EmailVerificationService,
  normalizeEmail,
} from './email-verification.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { FieldErrorDetail } from '../common/validation-pipe';
import {
  ConsentInputDto,
  RegistrationCreateDto,
  RegistrationPayloadDto,
} from './dto/registration-create.dto';
import { isKnownConsentPolicyVersion } from './consent-policy';
import {
  MAX_REFERENCE_ALLOCATION_ATTEMPTS,
  allocateRegistrationReference,
  isReferenceCollisionError,
} from './registration-reference.util';

/**
 * T-10 rework (R2-A4) — a schema-version marker INSIDE the `payload` JSON
 * blob itself, so a future shape change to what this endpoint stores can be
 * distinguished by a 3b/later reader without a Prisma migration (`payload`
 * is already a `Json` column; this is a value inside it, not a column).
 * Bump this the day `RegistrationPayloadDto`'s shape genuinely changes.
 */
export const REGISTRATION_PAYLOAD_SCHEMA_VERSION = 1;

/**
 * T-10 rework (T9-A4) — normalizes every OPTIONAL `RegistrationPayloadDto`
 * field to an explicit `null` when absent, rather than persisting whatever
 * shape happened to survive validation. Without this, an applicant who
 * OMITS a field and one who explicitly submits it as JSON `null` — both
 * valid under `@IsOptional()`, which class-validator treats identically —
 * produce two different stored shapes for the identical "not provided"
 * case (an omitted key vs. an explicit `null` key). A single, stable shape
 * matters here specifically because nothing enforces a schema on a `Json`
 * column, so "what shape does this payload have" is otherwise answerable
 * only by reading every row.
 */
function buildStoredPayload(payload: RegistrationPayloadDto): Prisma.InputJsonValue {
  return {
    schemaVersion: REGISTRATION_PAYLOAD_SCHEMA_VERSION,
    traderName: payload.traderName,
    traderType: payload.traderType,
    contactPerson: payload.contactPerson,
    position: payload.position ?? null,
    district: payload.district ?? null,
    marketLocation: payload.marketLocation ?? null,
    sex: payload.sex ?? null,
    region: payload.region,
    gpsLatitude: payload.gpsLatitude ?? null,
    gpsLongitude: payload.gpsLongitude ?? null,
    crops: payload.crops,
    otherCrops: payload.otherCrops ?? null,
    capacityTons: payload.capacityTons,
    phone: payload.phone,
  } as unknown as Prisma.InputJsonValue;
}

/**
 * T-10 — `POST /registrations` response (design.md §3.1, FR-5). The ONLY
 * shape `submitRegistration` ever returns — see the method's own doc for why
 * this is a literal pick, never a spread.
 */
export interface RegistrationCreateResponse {
  reference: string;
}

/**
 * T-10 — V-5-style byte-identical rejection for a code that failed
 * verification (wrong, expired, already-consumed, or attempts-exhausted —
 * `EmailVerificationService.verifyCode`'s own `REJECTED` outcome collapses
 * all four already) AND for the one additional way a MATCHED code can still
 * fail to redeem: `consumeCode`'s conditional write losing a race to a
 * concurrent request for the SAME code (V-4). Both paths return this exact
 * object so a caller cannot distinguish "your code was wrong" from "someone
 * else's request consumed it a moment before yours" (design.md §3.1 decision
 * 2: "collapses code-wrong, code-expired and code-consumed into one
 * indistinguishable 400").
 */
function buildCodeRejectedError(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: 'The verification code could not be confirmed. Request a new code and try again.',
    details: [],
  });
}

@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);

  constructor(
    private readonly emailVerificationService: EmailVerificationService,
    private readonly mailService: MailService,
    private readonly prisma: PrismaService,
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

  /**
   * T-10 — `POST /registrations` (FR-2, FR-3, FR-4, FR-5, FR-8, design.md
   * §4.1, §4.5). Order of operations, exactly as §4.1 lists them (cap/pipe
   * already ran by the time this method is called; consent → verify →
   * transact are this method's job):
   *
   * 1. Consent check ({@link assertConsentAccepted}): `accepted === true` AND
   *    a known `policyVersion`, else `400` with **zero rows** — nothing
   *    below this line has run yet, so there is nothing to roll back.
   * 2. **Verify the code, OUTSIDE any transaction (V-1a).**
   *    `EmailVerificationService.verifyCode` durably increments the
   *    mismatch counter on its own connection with no `$transaction` around
   *    it — see that method's own doc for why a caller cannot accidentally
   *    enrol that write in a later transaction. On `REJECTED`, this method
   *    throws immediately and opens no transaction at all, which is what
   *    keeps the increment from ever being rolled back by this endpoint.
   * 3. **Allocate the reference** ({@link allocateRegistrationReference}),
   *    entered only once step 2 returned `MATCHED` — in its OWN, separately
   *    committed `$transaction` (see that function's doc for why it must
   *    be: a `Prisma.TransactionClient` cannot open a nested one).
   * 4. **One `$transaction`**: consume the code (A23 — inside the SAME
   *    transaction as the row write, so a downstream failure here cannot
   *    burn a single-use code against the 5-per-code cap) → create the row
   *    with the reference step 3 already allocated.
   *
   * **Recorded deviation from §4.1's literal listed order** ("consumed →
   * allocate → create", all inside one transaction). Splitting allocation
   * into its own prior, committed step — rather than nesting it inside the
   * consume-and-create transaction — is required by a structural Prisma
   * constraint (above) and is also what makes A-3's retry (below) actually
   * work: had allocation run inside the SAME transaction as a later
   * `reference`-collision, retrying by re-running that transaction would
   * roll the counter increment back too, so the retry would recompute the
   * IDENTICAL `seq` and collide again, every time, never making progress.
   * §4.1 explicitly allows a different arrangement provided the properties
   * it names still hold and are evidenced — they are (see below and the
   * consume/create ordering's A23 note).
   *
   * **The two obligations steps 2 and 4 satisfy, separately (design.md
   * §4.1's "two constraints pull in opposite directions" note).** A23 wants
   * the consume inside the write transaction; V-1a wants the MISMATCH
   * counter write to survive a rejection. Putting the whole verification
   * inside one transaction would satisfy A23 and destroy V-1a — a `400`
   * thrown from inside an interactive transaction rolls back every write in
   * it, counter included (RB1, the trap that swallowed two prior revisions
   * of this design). This method never opens a transaction until AFTER the
   * mismatch path has already committed its own write on its own
   * connection, so there is nothing here for a later `400` to undo.
   *
   * **A-3's bounded retry.** `allocateRegistrationReference` is expected to
   * never collide (see its own doc), but the `@unique` constraint on
   * `reference` is the actual backstop — a violation surfaces as `P2002`
   * from `tx.registration.create(...)`, caught below and retried from step
   * 3, up to {@link MAX_REFERENCE_ALLOCATION_ATTEMPTS} times, never
   * surfaced as a `500`. Each retry allocates a genuinely FRESH reference
   * (never the one the failed attempt already abandoned) and re-runs the
   * consume-and-create transaction: the failed attempt's rollback already
   * undid its `consumeCode` write, so the retry's `consumeCode` call finds
   * `consumedAt: null` again and re-consumes the SAME code rather than
   * needing (or burning) a second one. **On exhaustion** (every attempt
   * collided), this method throws a controlled `503` in the documented
   * envelope — never the raw `PrismaClientKnownRequestError` — preceded by
   * a distinct, PII-free `logger.error` carrying only `year` and the
   * attempt count. `503`, not `409`: the LAST attempt's rollback restored
   * `consumedAt: null` on the applicant's code, so a retry by the applicant
   * is genuinely actionable, which is what `503` means (design.md §4.5
   * line 367 resolves the parallel `traderId`-collision case at approval
   * the same way — a controlled response, never a raw throw).
   *
   * **`consentAcceptedAt` and `emailVerifiedAt`, both set from ONE captured
   * `now`, not a client-submitted timestamp — recorded, not silently
   * assumed.** `design.md`'s `Registration` field table describes
   * `consentAcceptedAt` as "the applicant's acceptance time, not the write
   * time", but `RegistrationCreateDto` (T-9, already reviewed) — matching
   * `design.md` §3.1's own request shape — carries no client-supplied
   * acceptance timestamp; the request carries only `consent: { accepted,
   * policyVersion }`. There is no earlier persisted "shown"/"accepted"
   * event with its own timestamp to read back: the OTP verification and the
   * consent acceptance both happen synchronously within this ONE request,
   * so `now`, captured once before the transaction opens, is the honest
   * value for both columns — not a stand-in for a client timestamp the
   * contract never collects. Recorded here and in this task's completion
   * report rather than left implicit.
   *
   * **The response, and why it is a literal object, never a spread
   * (FR-5, DC-2).** `{ reference }` is constructed field by field; nothing
   * about `dto.payload`, `submitterEmail`, or the created row's internal
   * `id` is ever in scope where a response object is built. A renamed or
   * added `Registration` column cannot leak here because there is no
   * mapping step from the row to the response for it to leak through.
   *
   * **Receipt mail dispatches AFTER commit, fire-and-forget (DD-9, FR-14).**
   * Mirrors `requestVerificationCode`'s established pattern exactly: not
   * awaited, failure logged by the error's class name only, reference only
   * — never the address.
   */
  async submitRegistration(dto: RegistrationCreateDto): Promise<RegistrationCreateResponse> {
    this.assertConsentAccepted(dto.consent);

    const verification = await this.emailVerificationService.verifyCode(dto.email, dto.code);
    if (verification.outcome === 'REJECTED') {
      throw buildCodeRejectedError();
    }

    const now = new Date();
    const submitterEmail = normalizeEmail(dto.email);

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_REFERENCE_ALLOCATION_ATTEMPTS; attempt += 1) {
      try {
        // Allocated and COMMITTED in its own transaction, BEFORE the
        // consume-and-create transaction below opens — see
        // `allocateRegistrationReference`'s doc for why it must be (a
        // `Prisma.TransactionClient` cannot open a nested `$transaction`),
        // and for why this ordering is what makes a retry below actually
        // make progress: a fresh call here always returns a NEW, never-
        // before-issued value, never the one a rolled-back attempt already
        // (uselessly) consumed.
        const reference = await allocateRegistrationReference(this.prisma, now);

        await this.prisma.$transaction(async (tx) => {
          const consumed = await this.emailVerificationService.consumeCode(tx, verification.id);
          if (!consumed) {
            // V-4's losing side of a race on the SAME code — collapsed into
            // the identical rejection shape (see buildCodeRejectedError's
            // doc). Throwing here rolls back nothing of value beyond the
            // already-committed (and now abandoned, per A-2's "a gap is not
            // a reuse") reference allocation above.
            throw buildCodeRejectedError();
          }

          await tx.registration.create({
            data: {
              reference,
              status: RegistrationStatus.PENDING_REVIEW,
              payload: buildStoredPayload(dto.payload),
              submitterEmail,
              emailVerifiedAt: now,
              consentAcceptedAt: now,
              consentPolicyVersion: dto.consent.policyVersion,
            },
          });
        });

        this.dispatchReceiptEmail(submitterEmail, reference);
        return { reference };
      } catch (err) {
        lastError = err;
        if (isReferenceCollisionError(err)) {
          if (attempt < MAX_REFERENCE_ALLOCATION_ATTEMPTS) {
            continue;
          }
          // **A-3's backstop path, rework attempt 2 (FAIL 1).** §4.5's own
          // parallel case (approval's `traderId` collision, §4.5 line 367)
          // resolves this class as a controlled response, never a raw
          // unhandled throw — a `500` with no `error` key is exactly the
          // envelope defect §4.4 required `throttler-exception.filter.ts`
          // to fix, and letting one leak here would be that same defect on
          // this endpoint. This attempt's transaction already rolled back,
          // which restored `consumedAt: null` on the applicant's code — so
          // a `503` (retry is genuinely actionable) is the honest status,
          // not a `409` (which would name a conflict the applicant cannot
          // resolve). The log line is the alarm hook a raw throw does not
          // give an operator: distinct, greppable, and carries only `year`
          // and the attempt count — never the address or the payload.
          this.logger.error(
            `registration reference allocation exhausted: year=${now.getUTCFullYear()} ` +
              `attempts=${MAX_REFERENCE_ALLOCATION_ATTEMPTS}`,
          );
          throw new ServiceUnavailableException({
            statusCode: 503,
            error: 'Service Unavailable',
            message: 'Unable to complete the submission right now. Please try again.',
          });
        }
        throw err;
      }
    }

    // Unreachable (the loop above always either returns or throws), kept
    // only so TypeScript's control-flow analysis sees every path return or
    // throw.
    throw lastError;
  }

  /**
   * FR-3 scenario 3 / design.md §4.1 step 4. `accepted` being anything other
   * than the literal `true`, or `policyVersion` not being one of the
   * versions this server currently accepts, each get their own `details`
   * entry — these describe the applicant's OWN submitted `consent` object,
   * never a stored value, so echoing the field name back is not a leak
   * (design.md §3.1's "no response ever echoes a stored value" is about
   * DIFFERENT data).
   */
  private assertConsentAccepted(consent: ConsentInputDto): void {
    const details: FieldErrorDetail[] = [];
    if (consent.accepted !== true) {
      details.push({
        field: 'consent.accepted',
        message: 'Consent must be accepted to submit a registration.',
      });
    }
    if (!isKnownConsentPolicyVersion(consent.policyVersion)) {
      details.push({
        field: 'consent.policyVersion',
        message: 'This consent policy version is not recognised.',
      });
    }
    if (details.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Consent is required to submit a registration.',
        details,
      });
    }
  }

  /**
   * DD-9 / FR-14: dispatched only after the caller's transaction has
   * committed, never awaited, and a failure is logged by the error's CLASS
   * NAME only — see `requestVerificationCode`'s identical, already-reviewed
   * pattern for why (a transport failure can embed the destination address
   * verbatim in its message).
   */
  private dispatchReceiptEmail(to: string, reference: string): void {
    void this.mailService.sendReceipt(to, reference).catch((err: unknown) => {
      const errorType = err instanceof Error ? err.name : 'UnknownError';
      this.logger.error(
        `registration receipt send failed: errorType=${errorType} reference=${reference}`,
      );
    });
  }
}
