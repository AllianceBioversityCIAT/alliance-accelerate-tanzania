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
 * **The `VERIFICATION_CODE_RESPONSE_FLOOR_MS` question — resolved here.**
 * That constant already exists in `registrations/registrations.service.ts`,
 * set to `900` by an earlier, unrelated fix, predating this spec. §12.1's
 * value for the SAME constant is `2000` (`= PRESEND_ALLOWANCE +
 * SEND_TIMEOUT`, DD-10). Re-deriving the LIVE constant to `2000` is T-7's
 * task (`tasks.md` T-7: "re-derive the floor"), not this one — T-1 must not
 * modify `registrations.service.ts`.
 *
 * Chosen resolution — **Option A** (of the two the task brief offered):
 * invariant 1's gate test below asserts the §12.1 TARGET value
 * (`VERIFICATION_CODE_RESPONSE_FLOOR_TARGET_MS = 2000`, defined locally in
 * this file, not exported from `mail-timing.ts`) rather than importing and
 * asserting directly against the live, still-`900` constant. Reasoning:
 * `tasks.md` T-7's own `Files:` list is `email-verification.service.ts`,
 * `registrations.service.ts`, `registrations.service.spec.ts`,
 * `registrations-verify.e2e.spec.ts` — it does NOT include `mail-timing.ts`
 * or this file, so T-7 is not planned to import a floor constant FROM this
 * module (ruling out the brief's "define the target floor in your new
 * module and have T-7 wire it up" alternative — there is no planned wiring
 * step for it to land in). Asserting the gate against the live import
 * instead would ship this task with one PERMANENTLY red test that no task
 * in `tasks.md` is scoped to fix, which is worse than the gap it would
 * document (see this file's final `Not Done / Assumptions` note, reported
 * upstream, for the recommendation this raises for `tasks.md`).
 *
 * The live constant IS still imported and asserted against, exactly as
 * instructed — in the second test below, which documents today's known,
 * expected gap (`LIVE_VERIFICATION_CODE_RESPONSE_FLOOR_MS`, `900`, is below
 * the §12.1 target) as a currently-TRUE, non-tautological fact. `// T-7
 * will make this pass` marks the exact line that must invert once T-7 lands
 * — at `900` today `900 < 2000` holds; once T-7 raises the live constant to
 * `2000` this assertion will itself start failing (`2000 < 2000` is
 * false), which is the intended signal that this test needs updating
 * alongside T-7's change, not a defect in either task.
 */
import {
  MAIL_LOCK_WAIT_TIMEOUT_MS,
  MAIL_PROBE_TIMEOUT_MS,
  MAIL_SEND_TIMEOUT_MS,
  VERIFICATION_CODE_PRESEND_ALLOWANCE_MS,
} from './mail-timing';
// Read-only: T-1 must NOT modify this constant. Imported so invariant 1's
// "not yet satisfied" gap is asserted against the REAL, current value
// rather than a copy that could drift from it — see the file header.
import { VERIFICATION_CODE_RESPONSE_FLOOR_MS as LIVE_VERIFICATION_CODE_RESPONSE_FLOOR_MS } from '../registrations/registrations.service';

describe('mail-timing constants — §12.1/§12.2 values, verbatim', () => {
  it('pins MAIL_SEND_TIMEOUT_MS to the §12.1 value', () => {
    expect(MAIL_SEND_TIMEOUT_MS).toBe(1200);
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

describe('§12.3 invariant 1 — PRESEND_ALLOWANCE + SEND_TIMEOUT ≤ FLOOR (DD-10)', () => {
  /**
   * The §12.1 TARGET value for `VERIFICATION_CODE_RESPONSE_FLOOR_MS`
   * (`2000`) — see this file's header for why the gate below is asserted
   * against this local constant rather than the live, still-`900` one in
   * `registrations.service.ts`.
   */
  const VERIFICATION_CODE_RESPONSE_FLOOR_TARGET_MS = 2000;

  it(
    'holds against the §12.1 target floor — 800 + 1200 = 2000 ≤ 2000 ' +
      '(the gate this task delivers; mutation-tested below)',
    () => {
      expect(
        VERIFICATION_CODE_PRESEND_ALLOWANCE_MS + MAIL_SEND_TIMEOUT_MS,
      ).toBeLessThanOrEqual(VERIFICATION_CODE_RESPONSE_FLOOR_TARGET_MS);
    },
  );

  it(
    'does NOT yet hold against the LIVE registrations.service.ts floor (900ms, pre-T-7) — ' +
      'expected, not a bug (T-1 must not modify that constant; T-7 owns re-deriving it)',
    () => {
      expect(LIVE_VERIFICATION_CODE_RESPONSE_FLOOR_MS).toBeLessThan(
        VERIFICATION_CODE_PRESEND_ALLOWANCE_MS + MAIL_SEND_TIMEOUT_MS,
      );
      // T-7 will make this pass: once the live constant is re-derived to
      // the §12.1 target (2000), `900 < 2000` above becomes `2000 < 2000`,
      // which is false — this assertion must be updated (or removed, with
      // reliance shifting entirely to invariant 1's own gate test above)
      // in the same change that lands T-7.
    },
  );
});

describe('§12.3 invariant 2 — LOCK_WAIT + PROBE < SEND_TIMEOUT (DD-11)', () => {
  it('leaves a real reconnect budget inside the send deadline — 200 + 250 = 450 < 1200', () => {
    expect(MAIL_LOCK_WAIT_TIMEOUT_MS + MAIL_PROBE_TIMEOUT_MS).toBeLessThan(MAIL_SEND_TIMEOUT_MS);
  });
});
