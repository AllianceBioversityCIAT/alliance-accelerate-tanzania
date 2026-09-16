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
 * **The `VERIFICATION_CODE_RESPONSE_FLOOR_MS` question — resolved by T-7.**
 * That constant lives in `registrations/registrations.service.ts`. At T-1
 * time it was still `900`, set by an earlier, unrelated fix predating this
 * spec, and re-deriving it to §12.1's `3800` (`= PRESEND_ALLOWANCE +
 * SEND_TIMEOUT`, DD-10) was T-7's task — this file therefore carried a
 * target-only gate (asserting the §12.1 arithmetic in isolation) plus a
 * second test pinning the then-true, expected gap against the still-`900`
 * live import. **T-7 has since landed** (`registrations.service.ts` now
 * COMPUTES the constant as that same sum, imported from `mail-timing.ts`),
 * which retired both: the gap test would assert `3800 < 3800` — false — and
 * a target-only gate duplicates what is now a real, permanent invariant
 * test against the LIVE constant in `registrations.service.spec.ts`
 * (`design.md` §10's nominated home). Both were removed here rather than
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

// §12.3 invariant 1 (PRESEND_ALLOWANCE + SEND_TIMEOUT ≤ FLOOR, DD-10) is no
// longer gated here. T-7 made `VERIFICATION_CODE_RESPONSE_FLOOR_MS` a real,
// computed constant (`registrations.service.ts`), so the invariant is now
// tested there, against the LIVE value — see that file's spec, the home
// `design.md` §10 nominates — rather than duplicated here against a local
// target. See this file's header for the removed tests this replaced.

describe('§12.3 invariant 2 — LOCK_WAIT + PROBE < SEND_TIMEOUT (DD-11)', () => {
  it('leaves a real reconnect budget inside the send deadline — 200 + 250 = 450 < 3000', () => {
    expect(MAIL_LOCK_WAIT_TIMEOUT_MS + MAIL_PROBE_TIMEOUT_MS).toBeLessThan(MAIL_SEND_TIMEOUT_MS);
  });
});
