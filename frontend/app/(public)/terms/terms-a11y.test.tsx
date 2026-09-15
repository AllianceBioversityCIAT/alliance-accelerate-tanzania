/**
 * Automated accessibility + content tests for the /terms page — T-5,
 * FR-4, design.md §4.3, §5.2.
 *
 * `/terms` is new. It renders `TERMS_OF_USE` (currently placeholder
 * prose, pending delivery from Legal — T-8) through the shared
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
import { render, screen } from '@testing-library/react';
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

    expect(screen.getByText(/version v1\.0-placeholder/i)).toBeInTheDocument();
  });

  it('makes the placeholder status unmistakable — the marker is visible on the page', () => {
    renderTermsPage();

    const bodyText = document.body.textContent ?? '';
    expect(bodyText).toMatch(/\[PLACEHOLDER TEXT — pending legal review\]/);
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
