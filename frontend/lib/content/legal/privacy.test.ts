/**
 * privacy.ts — the unfilled-field inventory gate (validation remediation,
 * PART 2).
 *
 * `/privacy` deliberately publishes Legal's unfilled fields — "Insert
 * Date", "Insert CIAT Legal Entity", and the four blank "Contact Us"
 * values (Contact / Email / Address / Telephone) — as ordinary text
 * (privacy.ts module doc, product-owner decision, unchanged by this test).
 * No prior gate could see any of them: the placeholder tripwire (FR-2)
 * matches only the literal word "placeholder", and the pre-existing
 * `privacy-a11y.test.tsx` *pins* `/effective insert date/i` as satisfying
 * FR-5's visible-effective-date clause — that assertion certifies the
 * defect rather than naming it.
 *
 * This test is NOT a check that these fields are filled in, and it must
 * NEVER be made permanently red — that would break CI and train people to
 * ignore red. It asserts the SET of unfilled tokens in PRIVACY_POLICY
 * equals an explicit expected list (`unfilled-fields.ts`). Effect:
 *   - adding a new unfilled field to privacy.ts reddens this test;
 *   - filling in one of the fields already listed below ALSO reddens this
 *     test, so a fill can never happen silently — updating the expected
 *     list below is a deliberate, reviewable edit;
 *   - when the expected list below is empty, `/privacy` is publishable.
 *     A NON-EMPTY list — the current state — means the document is NOT
 *     YET publishable.
 *
 * Note: the "Who is Responsible for the Registry?" section's inline
 * "CIAT Address: Email:" line is Legal's own blank prose, not a
 * structured `contact` block entry — it is out of this gate's minimum
 * scope (paragraph text, not a labelled contact value) and is not
 * inventoried here.
 */

import { PRIVACY_POLICY } from './privacy';
import { collectUnfilledFieldTokens } from './unfilled-fields';

describe('privacy.ts — unfilled-field inventory (PART 2, not yet publishable)', () => {
  it('the set of unfilled Legal tokens equals the expected list', () => {
    expect(collectUnfilledFieldTokens(PRIVACY_POLICY)).toEqual([
      'Address: (blank, in prose)',
      'Address: (blank)',
      // Legal's "Who is Responsible for the Registry?" section renders as
      // "CIAT Address: Email:" — two labels with nothing after them, in prose
      // rather than a structured contact block. Tracked because an inventory
      // that could reach an EMPTY list while the page still shows a blank
      // would report a publishability it does not have.
      'Contact: (blank)',
      'Email: (blank, in prose)',
      'Email: (blank)',
      'Insert CIAT Legal Entity',
      'Insert Date',
      'Telephone: (blank)',
    ]);
  });
});
