// @sdd-spec enhancement/email-notification-microservice (T-1)
/**
 * T-1 — Canonical timing constants for the mail-send path (`design.md` §12
 * in full — §12.1 values, §12.2 sub-budgets, §12.3 invariants — DD-10,
 * NFR-7, NFR-1).
 *
 * **Why this file exists at all.** `design.md` §12's opening line is blunt
 * about the failure this file is the countermeasure for: *"Every timing
 * value this spec introduces lives here and nowhere else."* Judgment
 * rounds 2 and 3 of that spec's review both failed on the SAME mechanism —
 * a constant written into four documents, updated in two, leaving a gate
 * that asserted an invariant the decision record had already replaced.
 * `docs/specs/.../requirements.md` NFR-1 and NFR-7 both point at `design.md`
 * §12 rather than restating a number, for the same reason. This module is
 * that discipline's one home **in code**: every call site that needs one of
 * these four figures imports it from here, so a future change is a single
 * edit rather than a sweep.
 *
 * **What this file deliberately does NOT export.**
 * `VERIFICATION_CODE_RESPONSE_FLOOR_MS` — the fourth row of §12.1's table —
 * is not defined here. It lives in `registrations/registrations.service.ts`,
 * where it is now (T-7) COMPUTED as `VERIFICATION_CODE_PRESEND_ALLOWANCE_MS
 * + MAIL_SEND_TIMEOUT_MS`, imported from this file — `2000`, per §12.1.
 * *(At T-1 time, when this paragraph was first written, it was still the
 * literal `900` an earlier, unrelated production fix
 * (`fix/otp-mail-lambda-freeze`) had reasoned from the one real latency
 * figure that incident produced; re-deriving it was T-7's task, now done.
 * `mail-timing.spec.ts`'s history records the gap that existed in between.)*
 *
 * **DD-10 — why the floor is COMPOSED, not merely compared.** An earlier
 * revision of this spec set a publish timeout, raised the floor, and
 * asserted only `timeout < floor` — a two-term comparison that silently
 * ignored the synchronous work `issueCode` performs BEFORE the send is even
 * attempted (the Prisma `INSERT … ON DUPLICATE KEY UPDATE` plus HMAC
 * hashing). Worst case that revision allowed: `~500ms` (pre-send) +
 * `1500ms` (send) = `2000ms` against an `1800ms` floor — the padding
 * function no-ops on a negative remainder, so the address-enumeration
 * timing oracle NFR-7 exists to close would have stayed OPEN while a new
 * test asserted it was closed. §12.3's invariant 1 fixes this by composing
 * the floor as a SUM of every term inside the padded window
 * (`PRESEND_ALLOWANCE + SEND_TIMEOUT ≤ FLOOR`) rather than comparing one
 * term against it in isolation. All three terms are enforced at runtime —
 * this module's two, plus `VERIFICATION_CODE_PRESEND_ALLOWANCE_MS` via T-7's
 * deadline over `issueCode(...)`'s WHOLE call (⚠️ corrected during T-1
 * review, advisory A3: a Prisma transaction timeout on `issueCode` was the
 * original plan here and is insufficient — its `$transaction` wraps only
 * the `EmailSendBudget` upsert, leaving `generateCode`, `hashCode` and
 * `emailVerification.create` unbounded, which is exactly the work only the
 * ACCEPTED branch pays) — so a value being wrong produces a failed request
 * or a warn line, never a silent divergence between the accepted and
 * over-cap branches.
 */

/**
 * The single deadline a mail send must complete or abort within —
 * `design.md` §4.3 step 0. Covers the lock wait (DD-11), the pre-publish
 * liveness probe (DD-11), any reconnect, the publish, and the confirm.
 * Connection teardown is detached and explicitly does NOT count against it
 * (NFR-1's own wording).
 *
 * Bounds **both** transports — DD-10's *"both implementations"* clause.
 * Phase A also gives `ses-mail.transport.ts` this same deadline (T-6):
 * today it constructs `new SESClient({ region })` with no `requestTimeout`
 * and SDK-default retries, i.e. genuinely unbounded, which would make
 * Phase A's higher floor unearned while SES is still the active transport.
 */
export const MAIL_SEND_TIMEOUT_MS = 1200;

/**
 * Sub-budget of {@link MAIL_SEND_TIMEOUT_MS} for acquiring the module-scope
 * mutex DD-11 introduces (held from probe/acquire through the confirm, so
 * a concurrent fire-and-forget receipt send cannot tear the channel out
 * from under an awaited contact or OTP publish). A send that cannot
 * acquire the lock within this budget fails having never touched the
 * broker — reported distinctly from a broker failure so an operator can
 * tell the two apart from logs alone.
 */
export const MAIL_LOCK_WAIT_TIMEOUT_MS = 200;

/**
 * Sub-budget of {@link MAIL_SEND_TIMEOUT_MS} for DD-11's pre-publish
 * liveness probe (one `checkQueue` round-trip on a cached connection/
 * channel pair, run before anything is written). Bounded separately
 * because D-F's canonical failure — a half-open socket left by a frozen
 * Lambda container — does not throw on a round-trip, it hangs waiting for
 * a reply that never arrives. Without its own ceiling the probe would
 * consume the ENTIRE send deadline on exactly the failure it exists to
 * detect, leaving nothing for the reconnect DD-4 depends on to recover
 * D-F. §12.3's invariant 2 keeps this (together with the lock wait) small
 * enough that a real reconnect budget always remains.
 */
export const MAIL_PROBE_TIMEOUT_MS = 250;

/**
 * Bounds the synchronous work `RegistrationsService.requestVerificationCode`
 * performs BEFORE it awaits the mail send: the WHOLE `EmailVerificationService
 * .issueCode(...)` call — its interactive Prisma transaction (the
 * `EmailSendBudget` upsert), plus code generation, hashing, and
 * `emailVerification.create`, none of which run inside that transaction.
 *
 * DD-10 makes this a runtime ceiling rather than an assumption: T-7's
 * `RegistrationsService.requestVerificationCode` races the ENTIRE
 * `issueCode(...)` call against this value (`withPreSendAllowance`) — ⚠️
 * corrected during T-1 review, advisory A3: an earlier plan put an explicit
 * timeout on `issueCode`'s `$transaction` instead, which is insufficient,
 * since that transaction wraps only the `EmailSendBudget` upsert and would
 * have left `emailVerification.create` — work only the ACCEPTED branch
 * pays — unbounded. This repo documents Prisma's own default interactive-
 * transaction ceiling on that transaction alone as `5000ms` — 6.25× this
 * allowance — so leaving the call unbounded would let a slow database
 * silently reopen the timing oracle this constant, composed with {@link
 * MAIL_SEND_TIMEOUT_MS}, exists to close. A call that breaches this budget
 * now fails the request loudly (the existing, deliberately-unpadded third
 * exit — address-independent infrastructure failure) instead of leaking a
 * timing signal. Wiring the actual deadline is T-7's task
 * (`registrations.service.ts`); this constant is only the number T-7
 * applies.
 */
export const VERIFICATION_CODE_PRESEND_ALLOWANCE_MS = 800;
