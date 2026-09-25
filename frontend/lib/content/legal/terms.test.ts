/**
 * terms.ts — the unfilled-field inventory gate (validation remediation,
 * PART 2).
 *
 * `/terms` used to publish Legal's unfilled fields — "Insert Date",
 * "Insert Email", "Insert Address", "Insert Telephone Number", and the
 * blank "Contact person" line — as ordinary text (terms.ts module doc,
 * product-owner decision, unchanged by this test). No prior gate could see
 * any of them: the placeholder tripwire (FR-2) matches only the literal
 * word "placeholder".
 *
 * This test is NOT a check that these fields are filled in, and it must
 * NEVER be made permanently red — that would break CI and train people to
 * ignore red. It asserts the SET of unfilled tokens in TERMS_OF_USE equals
 * an explicit expected list (`unfilled-fields.ts`). Effect:
 *   - adding a new unfilled field to terms.ts reddens this test;
 *   - filling in one of the fields already listed below ALSO reddens this
 *     test, so a fill can never happen silently — updating the expected
 *     list below is a deliberate, reviewable edit;
 *   - when the expected list below is empty, `/terms` is publishable.
 *     A NON-EMPTY list — the current state — means the document is NOT
 *     YET publishable.
 */

import { TERMS_OF_USE } from './terms';
import { collectUnfilledFieldTokens } from './unfilled-fields';

describe('terms.ts — unfilled-field inventory (PART 2 — list now empty: publishable)', () => {
  it('the set of unfilled Legal tokens equals the expected list', () => {
    // EMPTY as of 2026-09-25: CIAT filled the effective date, the operating
    // entity and all four contact values. Per this file's own rule, an empty
    // list is the signal that /terms is publishable.
    expect(collectUnfilledFieldTokens(TERMS_OF_USE)).toEqual([]);
  });
});
