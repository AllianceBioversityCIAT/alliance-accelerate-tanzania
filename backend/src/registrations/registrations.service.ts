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
 * **Superseded by `fix/otp-mail-lambda-freeze` (2026-09-03) — the send is
 * now AWAITED, not fire-and-forget.** This method used to dispatch
 * `MailService.sendVerificationCode` without awaiting it, reasoning (see
 * the paragraphs this replaces, in `git log -p` for this file) that
 * awaiting the send would make the accepted path measurably slower than
 * the rate-limited early return, reopening FR-4's oracle through timing.
 * That reasoning about the ORACLE was correct; what it missed was a worse
 * failure mode of NOT awaiting. CloudWatch on the deployed Dev Lambda
 * (`accelerate-tz-dev-backend-api`, 2026-09-03) showed `MailService`'s
 * ATTEMPT line with NO matching outcome line on every verification-code
 * send — `202` returned ~20 ms after the attempt, well inside the window a
 * frozen Lambda execution environment can stop mid-flight. **This is
 * exactly the failure this docblock's earlier revision predicted as a
 * named, accepted risk** ("the Lambda freeze can drop the send entirely,
 * silently") and it materialised in production: `lambda.ts`'s
 * `context.callbackWaitsForEmptyEventLoop = true` (added 2026-08-07 as the
 * intended mitigation) did not prevent it, because this handler is
 * `async` — Lambda settles the invocation when the RETURNED PROMISE
 * resolves, not via the callback that flag governs (see `lambda.ts` for
 * the corrected account of why). SES — then the active transport — had
 * permissions that were also broken until shortly before this fix; fixing
 * them turned a loud, fast `AccessDenied`
 * (logged inside the pre-freeze window) into this silent one — the freeze
 * was always there, masked by an unrelated failure until it wasn't.
 *
 * **The fix: await the send inside this method's own try/catch, and pay
 * for FR-4's timing property with a measured floor instead of with never
 * awaiting.** `sendVerificationCode` is now on this method's awaited
 * chain, so Lambda cannot freeze the container mid-send — the invocation
 * (and the HTTP response) does not settle until the send has, one way or
 * the other. That reopens the oracle the original fire-and-forget design
 * existed to close: absent a compensating change, the accepted path would
 * again run measurably slower than the rate-limited one, because only the
 * accepted path pays the mail-transport round trip (SES, at the time this
 * paragraph was written; T-10 has since deleted that transport, and the
 * round trip is now against the notification microservice — the timing
 * property this paragraph reasons about is unaffected by which transport
 * is live). {@link
 * VERIFICATION_CODE_RESPONSE_FLOOR_MS} is that compensating change — BOTH
 * the rate-limited early return and the send-awaited return pad to the
 * same fixed floor, measured from this method's own entry, before the
 * method resolves (see {@link padToVerificationCodeResponseFloor} below).
 *
 * **How the floor value was picked — evidence, not taste.** The one real
 * number this incident produced is the deployed endpoint's own observed
 * handler latency: CloudWatch, 2026-09-03, `latencyMs 498.9` for a request
 * whose mail send never got far enough to spend any of that time — so
 * ~500 ms is this endpoint's baseline SYNCHRONOUS cost (validation,
 * `issueCode`'s Prisma write, hashing) with the SES call still
 * outstanding when the container froze. `VERIFICATION_CODE_RESPONSE_FLOOR_MS`
 * is set to 900 ms: comfortably above that ~500 ms baseline, so the floor
 * is reachable without the common case growing sluggish, and — the
 * property that actually matters for FR-4 — comfortably above a plausible
 * SES `SendEmail` round trip from a Lambda in the same region (typically
 * well under 500 ms once the SDK client and its TLS session are warm; a
 * cold client can add a further few hundred ms for the handshake, which
 * 900 ms still covers). **This is a reasoned engineering bound picked from
 * the one real latency figure this incident produced, NOT a measured
 * p95/p99 of this endpoint's own SES calls** — no such measurement exists
 * yet. Saying so plainly, rather than implying a rigor the number doesn't
 * have, continues this file's existing discipline (an earlier revision of
 * this same docblock was corrected — rework attempt 2 — for claiming a
 * "measured" timing gap that a mocked test had actually only asserted by
 * construction).
 *
 * **Superseded by `enhancement/email-notification-microservice` T-7
 * (`design.md` DD-10).** The `900` this paragraph reasoned to is no longer
 * the live value — DD-10 revision 3 found this exact reasoning
 * insufficient: it is a two-term comparison (`SES timeout < floor`) that
 * silently ignores the synchronous work `issueCode` performs BEFORE the
 * send is even attempted, and a later revision of this file's own history
 * shipped precisely that gap (`1500 + ~500 > 1800`, found in review before
 * it reached production). {@link VERIFICATION_CODE_RESPONSE_FLOOR_MS} is
 * now COMPOSED at runtime from two independently-enforced bounds rather
 * than reasoned from one incident's figure — see that constant's own
 * docblock for the current derivation, and `mail/mail-timing.ts` for the
 * single home of the inputs.
 *
 * **The residual limitation, stated honestly — narrower than it used to
 * be, not yet closed.** T-7 bounds the PRE-SEND term ({@link
 * VERIFICATION_CODE_PRESEND_ALLOWANCE_MS}, via `withPreSendAllowance`
 * below): a breach now FAILS the request loudly instead of silently
 * running past the floor. The SEND term ({@link MAIL_SEND_TIMEOUT_MS}) is
 * bounded at the transport level by a sibling task (T-6) — until both
 * transports actually enforce it, a slow send can still take longer than
 * `VERIFICATION_CODE_RESPONSE_FLOOR_MS` allows for, and the timing oracle
 * FR-4 forbids reopens for that tail. Closing the tail completely needs the
 * send off the request's critical path entirely — e.g. an outbox row
 * written synchronously and a worker that sends it, so the `202` never
 * waits on the transport at all — which is why a queue-based fix is being
 * tracked separately rather than attempted here. This fix's job was to
 * stop the SILENT DROP (the production bug), and it does that
 * unconditionally; the residual timing tail is a smaller, pre-existing
 * class of risk FR-4 already accepts in degree (its own "Code request and
 * successful verification" scenario already tolerates the transport's
 * variable RTT as part of "the same response shape and timing
 * characteristics"), not a new one this fix introduces.
 *
 * **T-7's third-exit question, answered.** A pre-send allowance breach now
 * reaches the same unpadded `throw err;` exit an unexpected `issueCode`
 * failure already used — is that still safe once a TIMEOUT, not just an
 * infrastructure error, can land there?
 *
 * **The branches are NOT symmetric — say so plainly, per DD-10's own
 * Consequences, rather than deny it.** `issueCode` decides which branch to
 * pay for from `newSends > OTP_MAX_SENDS_PER_HOUR`: the over-cap branch
 * throws immediately after the `$transaction`; the accepted (under-cap)
 * branch additionally pays `generateCode`, `hashCode` and a second DB round
 * trip (`emailVerification.create`). Which branch runs genuinely is a
 * function of the address's prior sends in the window, so an attacker who
 * picks an address whose pre-send region lands in the cheaper (over-cap)
 * branch makes this allowance marginally LESS likely to breach than one
 * that lands in the accepted branch. Safety rests on bounding that
 * asymmetry, not on denying it exists:
 *
 * (a) **The delta is bounded and small.** The extra work the accepted
 *     branch pays over the over-cap branch is exactly one `INSERT`
 *     (`emailVerification.create`) plus in-memory CSPRNG generation and one
 *     HMAC-SHA-256 computation (`generateCode`/`hashCode`) — not a query
 *     whose cost scales with the address's history (i.e. O(1) in that
 *     history, not O(n)).
 * (b) **{@link VERIFICATION_CODE_PRESEND_ALLOWANCE_MS} is sized on the
 *     LARGER (accepted) branch** (its own docblock in `mail/mail-timing.ts`;
 *     DD-10 Consequences). The smaller, over-cap branch therefore carries
 *     STRICTLY MORE margin inside the same allowance — the (a) delta sits
 *     far inside a budget already sized to cover the more expensive path,
 *     so a breach requires ambient conditions (DB load, network jitter) far
 *     beyond either branch's normal cost, not merely "the accepted branch's
 *     extra round trip".
 * (c) **The exit's own latency, when the ALLOWANCE is what triggers it, is
 *     constant at `VERIFICATION_CODE_PRESEND_ALLOWANCE_MS`, regardless of
 *     which `issueCode` statement was pending.** `withPreSendAllowance`'s
 *     deadline timer is armed once, at call entry, via a plain `setTimeout`
 *     racing `issueCode(...)`'s promise (`Promise.race`); the timer fires at
 *     a fixed wall-clock offset from that arming, independent of which
 *     internal `issueCode` step is in flight when it does — `Promise.race`
 *     has no visibility into the loser's internal state. So a breach caused
 *     BY the allowance discloses nothing through timing: every such breach
 *     surfaces after the same elapsed time. (This is distinct from — and
 *     does not extend to — a plain infrastructure failure that lands here
 *     without ever reaching the deadline; that pre-existing case's latency
 *     is whatever the underlying failure took, which is the
 *     already-accepted "address-independent infrastructure failure" this
 *     exit was scoped to before T-7.)
 * (d) **What (a)–(c) together mean under sufficient ambient load: the exit
 *     converts the bounded (a) delta into a STATUS-CODE difference, not a
 *     timing one.** Near the allowance boundary, whichever branch's
 *     pre-send work is cheaper is marginally less likely to breach and get
 *     the unpadded `throw` (an uncaught `Error` → Nest's default `500`);
 *     whichever is more expensive is marginally more likely to breach.
 *     Both outcomes still exist on the byte-identity surface FR-4 governs
 *     only through their RESPONSE, never through how long the caller waited
 *     for it — a `500` observed occasionally under load is DD-10's accepted
 *     trade ("Failing loudly beats leaking silently"), not a silent timing
 *     leak.
 *
 * The one caveat worth naming beyond (a)–(d): an attacker who already knows
 * a target address could flood requests FOR THAT SAME ADDRESS to contend
 * the single `EmailSendBudget` row keyed on it and raise ITS OWN request's
 * chance of breaching the allowance — but that is a self-inflicted,
 * self-targeted effect (contending your own request against your own
 * concurrent requests), not a way to learn something about the address from
 * a single request's timing, and it is no different in kind from contending
 * any other address's row the same way. It does not turn the exit into an
 * oracle distinguishing addresses from one another.
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { Prisma, Registration, RegistrationStatus } from '@prisma/client';
import {
  EmailVerificationSendLimitExceededError,
  EmailVerificationService,
  normalizeEmail,
} from './email-verification.service';
import { getOtpHmacSecret } from './email-verification.config';
import { MailService } from '../mail/mail.service';
import {
  MAIL_SEND_TIMEOUT_MS,
  VERIFICATION_CODE_PRESEND_ALLOWANCE_MS,
} from '../mail/mail-timing';
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
import {
  PublicRegistrationLookup,
  toPublicRegistrationLookup,
} from './serializers/public-registration.serializer';

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

/**
 * T-11 — `POST /registrations/lookup` (FR-6, FR-8, `design.md` §3.1 decision
 * 3–4, §4.4 L-1…L-4).
 *
 * **Mechanism chosen, and why it is not one of the three rejected in
 * `design.md` §4.4.** A bare per-reference counter fails L-3 — references
 * are sequential and enumerable (§4.5), so an attacker guessing ONE
 * reference against many emails would lock out every genuine applicant
 * checking that same reference (RA3). A per-reference lockout returning a
 * distinct status or message fails L-2 AND reintroduces the exact
 * membership oracle §3.1 decision 4 exists to eliminate — a lockout is only
 * reachable for a reference that actually EXISTS (RA2). Relying on
 * `RegistrationsThrottleGuard` alone fails L-1: its in-memory counter bounds
 * a single container and resets on cold start (C-4).
 *
 * **The accepted mechanism (rework attempt 2): {@link RegistrationLookupAttempt},
 * a DB-persisted counter keyed on the COMPOSITE `(ip, reference, windowStart)`.**
 * Being DB-persisted and shared across every container satisfies L-1. Keying
 * on the caller's `ip` at all — rather than `reference` alone — is what
 * makes L-3 hold: only the abusive caller's OWN budget is ever spent, so an
 * attacker guessing against a real applicant's reference can only lock out
 * THEMSELVES, never the applicant. The SAME atomic `INSERT … ON DUPLICATE
 * KEY UPDATE` + session-variable technique `EmailSendBudget`/
 * `RegistrationSequence` already use and have proven under real concurrent
 * load (T-7, T-10) is reused here rather than a check-then-act read+write,
 * which is exactly the race that defeated `EmailSendBudget`'s first two
 * attempts (see `email-verification.service.ts`'s class doc) — a handful of
 * genuinely concurrent requests from one caller could otherwise all read the
 * same pre-write count and all pass, bypassing the cap by concurrency alone.
 *
 * **Attempt 1 keyed on `(ip)` alone and was FAILED at review for an
 * interaction between L-3 and L-4, not a defect in either constraint read in
 * isolation.** `design.md` §4.4 states "a per-caller dimension, OR a
 * per-caller-and-reference composite, satisfies L-3" — true on its own — but
 * a per-caller-ONLY key makes L-4's reset (below) fire on ANY match, and
 * this endpoint's own sibling capability, `submitRegistration`, hands every
 * applicant a `{ reference }` they can legitimately look up at will. An
 * attacker can therefore interleave `LOOKUP_MAX_ATTEMPTS_PER_WINDOW - 1`
 * wrong-email guesses against a VICTIM's reference with one genuine lookup
 * of their OWN reference every `LOOKUP_MAX_ATTEMPTS_PER_WINDOW` requests,
 * resetting their SHARED counter indefinitely — L-4 held and L-1 was
 * defeated in effect, leaving only the per-container throttler as the
 * surviving bound (≈1,080 guesses/hour from one IP, more across containers
 * — a ~100× amplification over the intended cap, and the exact insufficiency
 * L-1 exists to close). The composite key closes this structurally: a
 * success on the attacker's OWN reference resets ONLY
 * `(ip, ownReference, windowStart)`, which shares no row with
 * `(ip, victimReference, windowStart)` — the two budgets cannot interact,
 * so self-resetting one can never touch the other.
 *
 * **L-2 — byte-identity, including the locked exit.** {@link
 * buildLookupNotFoundError} is a single constant-body helper, and this
 * class's `lookupRegistration` has exactly ONE throw site that calls it —
 * for the locked exit AND for "reference absent" AND for "email mismatch".
 * All three are therefore structurally the same object, not three call
 * sites that happen to agree today (the same "one lookup-and-compare with a
 * single exit" discipline `design.md` §3.1 decision 4 asks for, extended to
 * the lockout exit).
 *
 * **L-4 — a successful lookup does not leave the applicant closer to a
 * lockout against THAT reference.** The counter is incremented
 * UNCONDITIONALLY on every call (mirroring `EmailSendBudget.sends`' own "raw
 * attempt count" shape — the cap decision is made off the per-call
 * session-variable position, not off the stored value), but reset to `0`
 * for the MATCHED `(callerIp, reference, windowStart)` triple immediately
 * after a match against that exact reference. A failed guess against a
 * DIFFERENT reference from the same caller is never erased by this reset —
 * that guarantee is now structural (disjoint rows), not merely a "benign
 * race in the applicant's favour" as attempt 1 claimed; see the paragraph
 * above for why that framing understated a real, deliberately exploitable
 * path rather than an accidental one.
 *
 * **T5-A2 — resolved: the class-level `RegistrationsThrottleGuard`'s `429`
 * stays in place on this route and is NOT suppressed with `@SkipThrottle()`.**
 * `design.md`'s §3.1 contract table for THIS route (§3.1's endpoint table,
 * the `POST /registrations/lookup` row) already lists `429` as a possible
 * response ALONGSIDE the `404`, and FR-6's own scenario names "both failure
 * modes" as the two that must be identical (reference-absent,
 * email-mismatch) — the contract does not read `429` into that set, so a
 * visible `429` does not, on its own wording, violate L-2. Independently,
 * `design.md:192` (§3.1 decision 1) grants that "a `429` from the throttler
 * remains visible, because it keys on the caller, not on the submitted
 * address" for `POST /verify` — reasoning that generalises here because the
 * guard's key, `sha256(class + handler + ip)` (`registrations-throttle.guard.ts`),
 * **never reads the request body at all** (a property of what the guard's
 * `generateKey` touches, not of pipeline ORDERING — Express's body-parser
 * middleware does run before Nest's guards, so `req.body` is in fact
 * populated by the time this guard runs; the guard simply never looks at
 * it), so its `429` trigger is identical whether the submitted reference
 * exists or not, and whether the submitted email matches or not. It
 * discloses nothing about any particular reference, so it is not part of
 * the oracle L-2 exists to close. `@SkipThrottle()` was considered and
 * rejected: removing the per-container guard here would force EVERY flood
 * request through this method's own DB-backed counter before being
 * rejected, regressing FR-7's "must NOT open a database connection … to
 * reach that decision" for the common flood case that guard exists to
 * reject cheaply. The two controls stay layered exactly as `design.md`
 * §4.4's table already prescribes for every other public path: the
 * per-container guard as the cheap first line, `RegistrationLookupAttempt`
 * as the second, persistent, cross-container bound L-1 requires.
 *
 * **What this unit tier proves and what it structurally cannot.** The unit
 * tests below (L-1's fresh-instance and concurrent-increment tests, L-4's
 * cap-th-success test) are where the persistence and reset properties are
 * actually pinned — a real MySQL round trip, proven once already for the
 * identical technique under T-7/T-10's dev-RDS load runs. The HTTP e2e
 * suite (`registrations-lookup.e2e.spec.ts`) proves the three exits are
 * byte-identical, which is a genuinely different claim: a lock and a
 * mismatch are DESIGNED to be unobservable apart at the HTTP layer, so the
 * e2e's "the locked exit fires" is inferred from request COUNT (built by
 * construction, asserted via `callsSoFar`), never observed as a distinct
 * signal — there is no HTTP-visible way to observe it directly, and there
 * should not be.
 */

/** L-1…L-4: attempts allowed per CALLER **and REFERENCE** (rework attempt 2's composite key — a caller gets this many attempts against EACH reference, not a single shared budget across all of them) within {@link LOOKUP_ATTEMPT_WINDOW_MS}. */
export const LOOKUP_MAX_ATTEMPTS_PER_WINDOW = 10;
/** Fixed-bucket width for the lookup-attempt cap — same recorded fixed-vs-rolling deviation as {@link OTP_SEND_WINDOW_MS}. */
export const LOOKUP_ATTEMPT_WINDOW_MS = 60 * 60 * 1000;

/**
 * L-2: the ONE byte-identical `404` for "reference absent", "email
 * mismatch", and "caller over the lookup-attempt cap". A plain constant that
 * never reads any exception or lookup state — the same discipline
 * `buildCodeRejectedError` already established for T-10's `400`.
 */
/**
 * T11-A1 — keyed digest of the caller's IP, stored in place of the address
 * itself in `RegistrationLookupAttempt.ip`.
 *
 * **Why keyed and not a bare hash.** A plain `sha256(ip)` is NOT
 * pseudonymisation: the IPv4 space is 2^32 and enumerates in seconds, so an
 * attacker holding the table recovers every address. HMAC under a server
 * secret makes the digest unusable without that secret — the same reasoning
 * `design.md` §4.3 gives for hashing OTP codes.
 *
 * **Why this reuses `OTP_HMAC_SECRET` rather than introducing a fourth.**
 * The `"lookup-ip:"` prefix is **domain separation**: the two constructions
 * operate over disjoint, differently-prefixed message spaces, so a digest
 * from one can never be mistaken for or correlated with a digest from the
 * other. This is one root secret distinguished by a context tag, not key
 * reuse in the unsafe sense — and unlike the OTP hash, this one is a
 * rate-limit bucket key, not an authenticator over untrusted input. A fourth
 * secret would mean a fourth thing to provision, and T3-A1 is the standing
 * evidence of what an unprovisioned env var costs.
 *
 * **What this does NOT fix.** Rows still accumulate one per caller per hour
 * with no TTL, and pruning still full-scans (`ip` leads the composite PK).
 * Pseudonymisation shrinks the blast radius of a table leak; it is not a
 * retention policy. §6.4's accepted "no purge is designed" risk stands.
 */
function pseudonymiseCallerIp(callerIp: string): string {
  return createHmac('sha256', getOtpHmacSecret()).update(`lookup-ip:${callerIp}`).digest('hex');
}

function buildLookupNotFoundError(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    error: 'Not Found',
    message: 'No registration was found matching that reference and email.',
  });
}

/**
 * The fixed bucket {@link RegistrationLookupAttempt} keys on — mirrors
 * `email-verification.service.ts`'s `sendBudgetWindowStart` exactly (`now`
 * truncated to the start of its epoch-aligned {@link LOOKUP_ATTEMPT_WINDOW_MS}
 * interval), re-derived locally rather than imported so this module's own
 * lookup-attempt mechanism has no compile-time dependency on
 * `EmailVerificationService`'s internals beyond the already-exported
 * {@link normalizeEmail}.
 */
function lookupAttemptWindowStart(now: Date): Date {
  return new Date(Math.floor(now.getTime() / LOOKUP_ATTEMPT_WINDOW_MS) * LOOKUP_ATTEMPT_WINDOW_MS);
}

/**
 * `enhancement/email-notification-microservice` T-7 — `design.md` §12.1,
 * DD-10. The constant-time floor {@link
 * RegistrationsService.requestVerificationCode} pads BOTH its branches to,
 * measured from the method's own entry.
 *
 * **Re-derived here — was `900`, a single reasoned figure from one
 * production incident.** See `RegistrationsService`'s class doc for that
 * original reasoning and why DD-10 revision 3 found it insufficient: it
 * compared the send timeout against the floor directly (`timeout < floor`)
 * and ignored the synchronous work `issueCode` performs BEFORE the send is
 * even attempted — a gap this file's own history shipped once
 * (`1500 + ~500 > 1800`, caught in review, never in production).
 *
 * **Composed, not measured — this is DD-10's whole point.** The value is
 * the SUM of the two bounds that now run inside the padded window, both
 * enforced at runtime and imported from `mail/mail-timing.ts` — the single
 * home for every value this spec introduces (§12) — never restated as a
 * literal here:
 *
 *   - {@link VERIFICATION_CODE_PRESEND_ALLOWANCE_MS} — the deadline
 *     {@link withPreSendAllowance} applies over the WHOLE `issueCode(...)`
 *     call, as a unit. NOT a timeout on `issueCode`'s own `$transaction`,
 *     which wraps only the `EmailSendBudget` upsert — `generateCode`,
 *     `hashCode` and `emailVerification.create` all run outside it, and
 *     are exactly the work only the ACCEPTED branch pays (the over-cap
 *     branch throws immediately after the transaction) — precisely the
 *     divergence this floor exists to erase (T-7 advisory A3, corrected
 *     during review from an earlier, insufficient "transaction timeout"
 *     plan).
 *   - {@link MAIL_SEND_TIMEOUT_MS} — the transport's own deadline (T-6),
 *     both implementations.
 *
 * Composing the two IN CODE — rather than writing their sum as a literal —
 * is what makes §12.3 invariant 1 (`PRESEND_ALLOWANCE + SEND_TIMEOUT ≤
 * FLOOR`) hold BY CONSTRUCTION: raising either input raises this constant
 * with it, so the two can never silently drift apart the way the pre-T-7
 * `900` (and DD-10 revision 2's `1800`) both could, and once did.
 */
export const VERIFICATION_CODE_RESPONSE_FLOOR_MS =
  VERIFICATION_CODE_PRESEND_ALLOWANCE_MS + MAIL_SEND_TIMEOUT_MS;

/**
 * Thrown by {@link withPreSendAllowance} when `issueCode(...)` has not
 * settled within {@link VERIFICATION_CODE_PRESEND_ALLOWANCE_MS}. Carries no
 * email — this reaches `requestVerificationCode`'s existing, deliberately
 * UNPADDED third exit (address-independent infrastructure failure,
 * unchanged by T-7 — see that method's own comment at its `throw err;`),
 * and that exit's safety depends on nothing in its message or type naming
 * the address that triggered it.
 */
export class VerificationCodePreSendAllowanceExceededError extends Error {
  constructor() {
    super(
      `issueCode(...) did not settle within the ${VERIFICATION_CODE_PRESEND_ALLOWANCE_MS} ms pre-send allowance.`,
    );
    this.name = 'VerificationCodePreSendAllowanceExceededError';
  }
}

/**
 * Sleep for exactly `ms`. The one primitive {@link
 * padToVerificationCodeResponseFloor} needs and the one thing under test's
 * fake timers actually intercept — kept as its own function so the padding
 * logic below reads as "compute the remainder, then wait it out".
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * DD-10's corrected mechanism (T-7, advisory A3): applies {@link
 * VERIFICATION_CODE_PRESEND_ALLOWANCE_MS} as a deadline over the WHOLE
 * `issueCode(...)` call, as a unit — not over its `$transaction`, which
 * wraps only one of the four things that call does (see {@link
 * VERIFICATION_CODE_RESPONSE_FLOOR_MS}'s docblock). Because the deadline
 * races the ENTIRE call rather than a piece of it, nothing `issueCode` does
 * — the transaction, `generateCode`, `hashCode`, or `emailVerification.create`
 * — can keep the CALLER waiting past this budget; a breach rejects and
 * `requestVerificationCode` fails the request via its existing unpadded
 * third exit, loudly, instead of leaking a timing signal.
 *
 * **This does not (and cannot, in plain Node/Prisma without an
 * `AbortSignal` threaded all the way in) stop `issueCode`'s own database
 * work once the deadline has won the race — Promise.race has no mechanism
 * to cancel the loser.** What it bounds is the CALLER's observable wait,
 * which is the property the timing oracle actually depends on: the
 * response can never take longer than the allowance to decide this call
 * has failed, regardless of what the database is doing in the background.
 *
 * **Two failure modes this repo has already paid for, both closed here:**
 *  - *The orphaned promise.* If `issueCode`'s promise loses the race and
 *    rejects later, nothing else awaits it — an unhandled rejection would
 *    terminate the process (`backend/src` registers no
 *    `unhandledRejection` handler; DD-5 learned this same lesson for the
 *    mail transport). `promise.catch(() => {})` is attached at race
 *    construction so that later rejection is always observed.
 *  - *The leaked timer.* `setTimeout`'s handle is cleared in a `finally`
 *    regardless of which side of the race settles first, so a pending
 *    timer never outlives this call or keeps a Lambda event loop alive.
 */
function withPreSendAllowance<T>(promise: Promise<T>): Promise<T> {
  let timer!: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new VerificationCodePreSendAllowanceExceededError());
    }, VERIFICATION_CODE_PRESEND_ALLOWANCE_MS);
  });
  promise.catch(() => {
    // See docblock: prevents an unhandled rejection if `issueCode` loses
    // the race and settles afterward, with nobody else listening.
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Pads out to {@link VERIFICATION_CODE_RESPONSE_FLOOR_MS}, measured from
 * `startedAtMs` (a `Date.now()` snapshot taken at the top of {@link
 * RegistrationsService.requestVerificationCode}). A no-op once the floor
 * has already elapsed — this only ever ADDS latency, never removes it, and
 * never on the branch that throws an unexpected (non-cap) error, which is
 * explicitly outside the byte-identity surface this floor protects (see
 * that method's own comment at its `throw err;`).
 *
 * T-7 (DD-10's "second signal, retained") — a NEGATIVE remainder means the
 * two bounded terms inside the padded window (the pre-send allowance, the
 * send timeout) together still ran longer than the composed floor. That
 * should not happen once both are genuinely enforced, but "should not" is
 * not a gate: `logger.warn` makes a residual overrun OBSERVABLE — carrying
 * the overrun in ms and, deliberately, no address, since this fires on an
 * unauthenticated public path (design.md §4.10/§6.3: "Never logged: …
 * email addresses"). T-9 confirms this line is absent under normal load.
 */
async function padToVerificationCodeResponseFloor(
  startedAtMs: number,
  logger: Logger,
): Promise<void> {
  const remainingMs = VERIFICATION_CODE_RESPONSE_FLOOR_MS - (Date.now() - startedAtMs);
  if (remainingMs > 0) {
    await delay(remainingMs);
    return;
  }
  if (remainingMs < 0) {
    logger.warn(`verification code response floor overrun: overrunMs=${-remainingMs}`);
  }
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
   *
   * `fix/otp-mail-lambda-freeze` — `startedAtMs` anchors {@link
   * padToVerificationCodeResponseFloor} for EVERY exit this method has;
   * see the class doc above for why the send is now awaited and why both
   * branches pad to the same floor.
   *
   * T-7 (DD-10) — `issueCode(...)` is called through {@link
   * withPreSendAllowance}, which bounds the WHOLE call, not merely its
   * `$transaction`. A breach throws {@link
   * VerificationCodePreSendAllowanceExceededError}, which is not an
   * `EmailVerificationSendLimitExceededError` and so falls straight through
   * to this method's existing, deliberately UNPADDED third exit below —
   * address-independent infrastructure failure, unchanged by this task.
   */
  async requestVerificationCode(rawEmail: string): Promise<void> {
    const startedAtMs = Date.now();

    let issued: { code: string };
    try {
      issued = await withPreSendAllowance(this.emailVerificationService.issueCode(rawEmail));
    } catch (err) {
      if (err instanceof EmailVerificationSendLimitExceededError) {
        // The cap's entire observable effect: no code is sent. The caller
        // gets back exactly the same 202/empty response as every other
        // accepted address, in comparable time (see the class doc's
        // timing note above) — the pad below is what makes "comparable
        // time" true now that the accepted branch below awaits its send.
        await padToVerificationCodeResponseFloor(startedAtMs, this.logger);
        return;
      }
      // Deliberately NOT padded: an unexpected (non-cap) failure here is
      // infrastructure trouble, not part of the byte-identity/timing
      // surface FR-4 governs (that surface covers only "known address",
      // "unknown address" and "over-cap address" — never "the database is
      // unavailable"). Padding this exit would hide a real outage behind
      // an artificial delay for no timing benefit this method claims. A
      // pre-send allowance breach (T-7) reaches this same exit — see the
      // class doc's third-exit note above for why that stays safe.
      throw err;
    }

    // Awaited (fix/otp-mail-lambda-freeze — see the class doc for the
    // production incident this reverses): the mail-transport/no-op round
    // trip is now part of this method's own awaited chain, so Lambda cannot freeze the
    // container mid-send. Failure is still only logged, never surfaced to
    // the caller — a 202 has already been decided, and a notification
    // failure must never turn into a caller-visible error (design.md
    // DD-9) — but it is no longer fire-and-forget: the method does not
    // return until the send has settled, one way or the other.
    //
    // Rework attempt 2 (FAIL 1) — preserved intent, unchanged: this used
    // to log `err.message` — but `MailService.dispatch` rethrows a
    // transport failure UNCHANGED (`mail.service.ts`, deliberate — DD-9),
    // and a transport rejection's message can carry the destination
    // address VERBATIM — true of AWS SES's `MessageRejected` (this repo's
    // former SES-sandbox configuration threw exactly that, for every
    // unverified destination address) — and this `catch` cannot assume
    // otherwise of any transport: `MicroserviceMailTransport` sanitizes its
    // own escaping errors to fixed messages (design.md §4.4), but
    // `MailService.dispatch` rethrows whatever it is handed, so no
    // transport-specific list of "safe" error shapes is relied on here.
    // Logging `err.message` made this the only `logger.*` call in `backend/src`
    // that interpolates an unbounded value, and would have written the
    // applicant's email to CloudWatch —
    // a PII leak on an unauthenticated public path (design.md §4.10/§6.3:
    // "Never logged: … email addresses"). It was also redundant:
    // `MailService.dispatch` already logs a bounded
    // `kind=verification-code reference=n/a status=failed` outcome line
    // before rethrowing. Logging only the error's CLASS NAME below (a
    // discriminator like `MessageRejected`/`AccessDenied`/`TimeoutError`/
    // `MicroserviceMailConnectionError`, never its message) adds
    // operationally-useful detail without reintroducing the leak — see
    // `registrations.service.spec.ts` for the regression test asserting
    // the emitted line never contains the address. That test is unchanged
    // by this rework: it only moved from observing a `.catch()` callback
    // to observing a `catch` block, the logged line itself is identical.
    try {
      await this.mailService.sendVerificationCode(rawEmail, issued.code);
    } catch (err: unknown) {
      const errorType = err instanceof Error ? err.name : 'UnknownError';
      this.logger.error(`verification code send failed: errorType=${errorType}`);
    }

    await padToVerificationCodeResponseFloor(startedAtMs, this.logger);
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

  /**
   * T-11 — FR-6, FR-8, `design.md` §3.1 decision 3–4 / §4.4 L-1…L-4. See this
   * file's class-spanning doc comment above (immediately before
   * {@link LOOKUP_MAX_ATTEMPTS_PER_WINDOW}) for the full mechanism rationale
   * and the T5-A2 resolution.
   *
   * Order, deliberately: the cap is checked BEFORE the reference/email
   * lookup ever runs. A locked caller therefore gets the identical `404`
   * regardless of whether the reference+email they submitted was actually
   * correct — anything else would make "am I locked" and "was I right"
   * observably different outcomes, which is itself a second, subtler oracle
   * L-2 does not name explicitly but the Disqualifying clause's "cannot make
   * its refusal indistinguishable" test would still catch.
   */
  async lookupRegistration(
    reference: string,
    rawEmail: string,
    callerIp: string,
  ): Promise<PublicRegistrationLookup> {
    const now = new Date();

    // T11-A1 — the caller key is PSEUDONYMISED before it reaches either DB
    // helper, so `RegistrationLookupAttempt.ip` never stores a plaintext
    // address. An IP is personal data (GDPR Art. 4(1); CJEU C-582/14 Breyer),
    // and this table's population is broader than the other PII-bearing ones:
    // it writes a row for EVERY caller, BEFORE any content check, one row per
    // caller per hour, with no TTL. Nothing needs the address back — the
    // column is only ever compared for equality as part of the composite key
    // — so a keyed digest preserves every property the mechanism uses.
    //
    // Transformed HERE, once, rather than in each helper: both the increment
    // and the L-4 reset must derive the SAME bucket, and a second call site
    // is a second chance to forget.
    const callerKey = pseudonymiseCallerIp(callerIp);

    const newAttempts = await this.incrementLookupAttempts(callerKey, reference, now);
    if (newAttempts > LOOKUP_MAX_ATTEMPTS_PER_WINDOW) {
      throw buildLookupNotFoundError();
    }

    const registration = await this.findMatchingRegistrationForLookup(reference, rawEmail);
    if (!registration) {
      throw buildLookupNotFoundError();
    }

    // L-4: this caller's budget for THIS reference is reset on a match — a
    // correct pair does not leave them any closer to a lockout against the
    // SAME reference. It has no effect on any OTHER reference's budget for
    // this caller (the composite key's whole point — see the class doc).
    await this.resetLookupAttempts(callerKey, reference, now);

    return toPublicRegistrationLookup(registration);
  }

  /**
   * design.md §3.1 decision 4: "implemented as one lookup-and-compare with a
   * single exit so they cannot drift apart." `reference` is looked up via
   * the `@unique` column (never a WHERE filter on email, so the EMAIL
   * comparison cannot be satisfied by MySQL's `utf8mb4_unicode_ci` table
   * collation silently doing the case-folding); the case-insensitive match
   * FR-6 requires is then performed explicitly in application code via
   * {@link normalizeEmail} — the SAME normalisation
   * `RegistrationsService.submitRegistration` already applies before
   * persisting `submitterEmail`, reused rather than re-derived so the two
   * stay in agreement by construction.
   *
   * **The `reference` WHERE clause itself is NOT immune to the same
   * collation** — unlike the email comparison above, this method makes no
   * attempt to normalise `reference`, and real MySQL under
   * `utf8mb4_unicode_ci` WOULD match `reg-2026-0184` against a stored
   * `REG-2026-0184` at the database level. `registrations.service.spec.ts`'s
   * fake `findUnique` does a strict `===` on `reference` and is therefore
   * STRICTER than production here, never looser — the safe direction for a
   * test double to diverge in, but recorded so nobody mistakes the fake's
   * behaviour for a case-sensitivity guarantee this method does not
   * actually provide or need to (no requirement asks for case-sensitive
   * reference matching; applicants are given the exact casing to quote back).
   *
   * Returns `null` for BOTH "no such reference" and "reference exists,
   * email does not match" — the caller (`lookupRegistration`) throws the
   * identical `404` for either, so this
   * method's return type carries no distinction between them at all.
   */
  private async findMatchingRegistrationForLookup(
    reference: string,
    rawEmail: string,
  ): Promise<Registration | null> {
    const registration = await this.prisma.registration.findUnique({ where: { reference } });
    if (!registration) return null;

    if (normalizeEmail(rawEmail) !== registration.submitterEmail) return null;

    return registration;
  }

  /**
   * L-1/L-3/L-4: atomically increments {@link RegistrationLookupAttempt} for
   * the COMPOSITE `(callerIp, reference, windowStart)` and returns THIS
   * call's own post-increment position — the identical technique
   * `EmailVerificationService.issueCode` uses for `EmailSendBudget` and
   * `allocateRegistrationReference` uses for `RegistrationSequence` (see
   * either's class doc for the three empirical rounds that ruled out an
   * affected-rows check and a bare-read-after-increment race). Both
   * statements are pinned to ONE connection via `$transaction`, since the
   * MySQL session variable `@newLookupAttempts` is connection-scoped.
   * Keying on `reference` too (rework attempt 2) is what keeps this
   * caller's budget against ONE reference from being resettable by a match
   * against a DIFFERENT one — see this file's class doc on
   * `lookupRegistration` for the attack this closes.
   */
  private async incrementLookupAttempts(
    callerIp: string,
    reference: string,
    now: Date,
  ): Promise<number> {
    const windowStart = lookupAttemptWindowStart(now);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO RegistrationLookupAttempt (ip, reference, windowStart, attempts)
        VALUES (${callerIp}, ${reference}, ${windowStart}, (@newLookupAttempts := 1))
        ON DUPLICATE KEY UPDATE attempts = (@newLookupAttempts := attempts + 1)
      `;
      const rows = await tx.$queryRaw<Array<{ newLookupAttempts: bigint | number }>>`
        SELECT @newLookupAttempts AS newLookupAttempts
      `;
      return Number(rows[0]?.newLookupAttempts);
    });
  }

  /**
   * L-4: zeroes the caller's budget for THIS `reference`'s CURRENT window,
   * after a successful lookup MATCHED against that exact reference — never
   * any other reference's row for the same caller (rework attempt 2's fix;
   * see the class doc). Safe as a plain `update` (never an `upsert`) because
   * the row is guaranteed to already exist — `incrementLookupAttempts`
   * above unconditionally wrote it for this exact
   * `(callerIp, reference, windowStart)` triple earlier in the same
   * request, and nothing in this class ever deletes a
   * `RegistrationLookupAttempt` row.
   */
  private async resetLookupAttempts(
    callerIp: string,
    reference: string,
    now: Date,
  ): Promise<void> {
    const windowStart = lookupAttemptWindowStart(now);
    await this.prisma.registrationLookupAttempt.update({
      where: { ip_reference_windowStart: { ip: callerIp, reference, windowStart } },
      data: { attempts: 0 },
    });
  }
}
