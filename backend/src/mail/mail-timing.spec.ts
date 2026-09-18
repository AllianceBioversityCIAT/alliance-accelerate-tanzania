// @sdd-spec enhancement/email-notification-microservice (T-1)
/**
 * T-1 — Pins the §12.1/§12.2 values verbatim and proves the two §12.3
 * invariants over them (NFR-7, NFR-1, DD-10).
 *
 * **Why the values are pinned individually, not just via the invariants.**
 * Four numbers satisfying the two inequalities below is not the same claim
 * as "these are §12.1's numbers" — a future edit could shrink
 * `MAIL_SEND_TIMEOUT_MS` and grow `VERIFICATION_CODE_PRESEND_ALLOWANCE_MS`
 * to keep invariant 1 green while drifting silently away from the values
 * `design.md` §12.1 actually specifies. The pin tests below close that gap;
 * the invariant tests close a different one (a value changing without
 * anyone checking the arithmetic still holds).
 *
 * **The `VERIFICATION_CODE_RESPONSE_FLOOR_MS` question — resolved by T-7,
 * then extended by F4.** That constant lives in
 * `registrations/registrations.service.ts`. At T-1 time it was still
 * `900`, set by an earlier, unrelated fix predating this spec, and
 * re-deriving it to §12.1's then-current two-term sum (`PRESEND_ALLOWANCE
 * + SEND_TIMEOUT`, DD-10) was T-7's task — this file therefore carried a
 * target-only gate (asserting the §12.1 arithmetic in isolation) plus a
 * second test pinning the then-true, expected gap against the still-`900`
 * live import. **T-7 landed** (`registrations.service.ts` COMPUTED the
 * constant as that sum, imported from `mail-timing.ts`), which retired
 * both T-1 tests: the gap test would have asserted a false equality, and
 * a target-only gate would have duplicated what became a real, permanent
 * invariant test against the LIVE constant in
 * `registrations.service.spec.ts` (`design.md` §10's nominated home).
 * ⚠️ **F4 (2026-09-17) then found the two-term sum itself incomplete** —
 * `MAIL_LOCK_WAIT_TIMEOUT_MS` was a real, timed term inside the same
 * padded window and had never been composed in — and added it, raising
 * the floor. §12.1 carries the current term count and value; neither is
 * restated in this historical paragraph, on purpose, so this note cannot
 * go stale the way the paragraph it replaces did. Both T-1 tests were
 * removed here rather than
 * repaired in place — see that spec file for invariant 1's current test.
 */
import {
  MAIL_LOCK_WAIT_TIMEOUT_MS,
  MAIL_PROBE_TIMEOUT_MS,
  MAIL_SEND_TIMEOUT_MS,
  VERIFICATION_CODE_PRESEND_ALLOWANCE_MS,
} from './mail-timing';

describe('mail-timing constants — §12.1/§12.2 values, verbatim', () => {
  it('pins MAIL_SEND_TIMEOUT_MS to the §12.1 value', () => {
    expect(MAIL_SEND_TIMEOUT_MS).toBe(3000);
  });

  it('pins MAIL_LOCK_WAIT_TIMEOUT_MS to the §12.2 value', () => {
    expect(MAIL_LOCK_WAIT_TIMEOUT_MS).toBe(200);
  });

  it('pins MAIL_PROBE_TIMEOUT_MS to the §12.2 value', () => {
    expect(MAIL_PROBE_TIMEOUT_MS).toBe(250);
  });

  it('pins VERIFICATION_CODE_PRESEND_ALLOWANCE_MS to the §12.1 value', () => {
    expect(VERIFICATION_CODE_PRESEND_ALLOWANCE_MS).toBe(800);
  });
});

// §12.3 invariant 1 is not gated here. `VERIFICATION_CODE_RESPONSE_FLOOR_MS`
// is a real, computed constant (`registrations.service.ts`) — see that
// file's spec, the home `design.md` §10 nominates, for its current pin.
// ⚠️ Corrected 2026-09-17 (Reviewer, round 4): this comment used to state
// invariant 1's formula in its pre-F4 two-term form and call the sibling
// spec's assertion an "invariant test" — it is a value PIN, not a
// falsification test over the inequality (see that file's comment for why
// no such test exists or can). Neither the formula nor the description is
// restated here, on purpose. See this file's header for the removed tests
// this replaced.

// ⚠️ Restated 2026-09-17 (F4 follow-up, D-I review). Previously
// `LOCK_WAIT + PROBE < SEND_TIMEOUT` (`200 + 250 = 450 < 3000`) — but
// `MAIL_LOCK_WAIT_TIMEOUT_MS` is not a term of this container at all:
// `MicroserviceMailTransport.send` acquires the mutex BEFORE opening the
// `try` that races `sendLocked` (where the probe runs) against
// `MAIL_SEND_TIMEOUT_MS`, so the lock wait was never actually consumed
// from this budget. Its real containment is invariant 1
// (`registrations.service.spec.ts`), where F4 already composed it into
// the floor — removing it here loses no coverage, it removes a term that
// was never true of this container. **The margin is larger than
// previously documented, not smaller** — `250 < 3000` has more headroom
// than the old `450 < 3000` claimed; this loosens nothing in reality, it
// stops overstating a constraint that was never binding.
describe('§12.3 invariant 2 — PROBE < SEND_TIMEOUT (DD-11)', () => {
  it('leaves a real reconnect budget inside the send deadline — 250 < 3000', () => {
    expect(MAIL_PROBE_TIMEOUT_MS).toBeLessThan(MAIL_SEND_TIMEOUT_MS);
  });
});
