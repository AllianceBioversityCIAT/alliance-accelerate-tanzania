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
 * is not defined here. It already exists in
 * `registrations/registrations.service.ts`, set to `900` by an earlier,
 * unrelated production fix (`fix/otp-mail-lambda-freeze`) that reasoned from
 * the one real latency figure that incident produced. §12.1's value for the
 * SAME constant is `2000` — composed as `PRESEND_ALLOWANCE + SEND_TIMEOUT`
 * per DD-10 below — and re-deriving the live constant to match is T-7's
 * task (`design.md` DD-10, §12; `tasks.md` T-7), not this one. This file's
 * own spec (`mail-timing.spec.ts`) imports the live value read-only to
 * prove today's known gap without asserting past this task's scope; see
 * that file's header for the exact shape of that proof.
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
 * this module's two, plus `VERIFICATION_CODE_PRESEND_ALLOWANCE_MS` via
 * T-7's Prisma transaction timeout — so a value being wrong produces a
 * failed request or a warn line, never a silent divergence between the
 * accepted and over-cap branches.
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
 * performs BEFORE it awaits the mail send: `EmailVerificationService
 * .issueCode`'s interactive Prisma transaction (the `EmailSendBudget`
 * upsert, `emailVerification.create`, and code generation/hashing).
 *
 * DD-10 makes this a runtime ceiling rather than an assumption: T-7 gives
 * `issueCode`'s transaction an explicit timeout equal to this value. This
 * repo documents Prisma's own default interactive-transaction ceiling on
 * that exact code path as `5000ms` — 6.25× this allowance — so leaving it
 * unbounded would let a slow database silently reopen the timing oracle
 * this constant, composed with {@link MAIL_SEND_TIMEOUT_MS}, exists to
 * close. A transaction that breaches this budget now fails the request
 * loudly (the existing, deliberately-unpadded third exit — address-
 * independent infrastructure failure) instead of leaking a timing signal.
 * Wiring the actual Prisma timeout is T-7's task; this constant is only
 * the number T-7 applies.
 */
export const VERIFICATION_CODE_PRESEND_ALLOWANCE_MS = 800;
