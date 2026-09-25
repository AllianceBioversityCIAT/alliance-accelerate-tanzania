/**
 * Automated accessibility + content tests for the /terms page — T-5
 * scaffold, T-8 approved-copy landing (FR-4, design.md §4.3, §5.2).
 *
 * `/terms` renders `TERMS_OF_USE` — as of T-8, the Terms of Use text
 * approved by the Alliance/CIAT legal owners — through the shared
 * `LegalDocumentView`, with no slot, so it carries no acceptance
 * control, checkbox, or "I agree" affordance — D-6: nobody accepts this
 * document (only the consent policy is, and only by an applicant
 * registering an organisation).
 *
 * NOT covered here (NFR-2, NFR-5): jsdom has no layout engine and
 * evaluates neither contrast nor rendered legibility — that is the human
 * check routed to T-10's HITL pause, same as `LegalDocumentView.test.tsx`
 * and `privacy-a11y.test.tsx` already record.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

import TermsPage from './page';

function renderTermsPage() {
  return render(
    <main>
      <TermsPage />
    </main>
  );
}

describe('/terms page — accessibility (NFR-2)', () => {
  it('has no axe violations (WCAG 2.1 AA)', async () => {
    const { container } = renderTermsPage();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  it('has exactly one h1', () => {
    renderTermsPage();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('/terms page — content (FR-4)', () => {
  it('renders the document title', () => {
    renderTermsPage();

    expect(screen.getByRole('heading', { level: 1, name: /terms of use/i })).toBeInTheDocument();
  });

  it('renders a visible version identifier and effective date', () => {
    renderTermsPage();

    expect(screen.getByText(/version v1\.0/i)).toBeInTheDocument();
    expect(screen.getByText(/effective date: 30 september 2026/i)).toBeInTheDocument();
  });

  it('carries no placeholder marker — the approved text has landed (T-8)', () => {
    renderTermsPage();

    const bodyText = document.body.textContent ?? '';
    expect(bodyText.toLowerCase()).not.toMatch(/placeholder/);
  });
});

describe('/terms page — the lede is Legal\'s three source paragraphs, not one merged string (T-8 rework, FR-4)', () => {
  // DEMONSTRATED FALSIFIER (mandatory): collapsing TERMS_OF_USE's `lede`
  // back into a single string must redden this assertion — the Reviewer
  // caught the original merge, which folded the binding assent clause
  // into the same paragraph as the welcome and operator identity (D-6's
  // "no acceptance control" is unaffected either way; this is about
  // paragraph structure, not content). Run with `lede` collapsed to one
  // string, observe red, then revert — see the Implementer's report for
  // the failing output.
  it('renders the welcome, operator identity, and binding assent clause as three separate paragraphs', () => {
    renderTermsPage();

    const welcome = screen.getByText(/welcome to the accelerate tanzania registry/i);
    const operator = screen.getByText(/the registry is operated by the international center for tropical agriculture/i);
    const assent = screen.getByText(/by accessing or using the registry, you agree to comply/i);

    expect(welcome.tagName).toBe('P');
    expect(operator.tagName).toBe('P');
    expect(assent.tagName).toBe('P');
    // Three DISTINCT <p> elements — proves the assent clause was not
    // merged into the same paragraph as the welcome/operator sentences.
    expect(welcome).not.toBe(operator);
    expect(operator).not.toBe(assent);
    expect(welcome).not.toBe(assent);
  });
});

describe('/terms page — nested bullet (T-8, types.ts LegalBulletItem.children)', () => {
  // DEMONSTRATED FALSIFIER (mandatory, tasks.md T-8): removing a nested
  // sub-bullet from terms.ts's "Profile Updates and Removal" section must
  // redden this assertion. Run with a sub-bullet removed, observe red,
  // then revert — see the Implementer's report for the failing output.
  it('renders the nested sub-bullets under "Remove profiles or information that:"', () => {
    renderTermsPage();

    const parentBullet = screen
      .getByText('Remove profiles or information that:')
      .closest('li')!;
    expect(within(parentBullet).getByText('Appears inaccurate;')).toBeInTheDocument();
    expect(within(parentBullet).getByText('Violates these Terms;')).toBeInTheDocument();
    expect(
      within(parentBullet).getByText('Creates legal, security, operational, or reputational risks;'),
    ).toBeInTheDocument();
    expect(within(parentBullet).getByText('Is the subject of a valid removal request;')).toBeInTheDocument();
    expect(
      within(parentBullet).getByText('Is no longer relevant to the purposes of the Registry.'),
    ).toBeInTheDocument();
  });
});

describe('/terms page — no acceptance control (FR-4 BUT, D-6)', () => {
  // DEMONSTRATED FALSIFIER (mandatory, tasks.md T-5): adding an "I agree"
  // checkbox to TERMS_OF_USE's document composition must redden this
  // assertion. Run with the checkbox added, observe red, then revert —
  // see the Implementer's report for the failing output.
  it('presents no acceptance control, checkbox, or "I agree" affordance', () => {
    renderTermsPage();

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toMatch(/i agree/i);
    expect(bodyText).not.toMatch(/accept these terms/i);
  });
});
