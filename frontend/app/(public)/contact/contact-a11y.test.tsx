/**
 * Automated accessibility + structural tests for the /contact page — T-10,
 * FR-1, FR-6, NFR-3, NFR-5.
 *
 * Filter: `contact` (matched via test file path — also caught by the header/
 * profile-scoped `npm test -- header profile` filter's neighbours, but this
 * file is the one this task's own `Verify` line names indirectly through
 * `npm run build`'s static-export assertion).
 *
 * ContactPage is a pure static server component (no hooks, no data
 * fetching, no useSearchParams) that mounts `ContactForm` (T-9, already
 * PASSED and out of this task's scope — not re-tested here beyond "it
 * renders").
 *
 * Mocks:
 *   - next/navigation — usePathname/useSearchParams not called by
 *     ContactPage itself, but provided defensively (matches
 *     about-a11y.test.tsx's precedent) in case any transitive import
 *     resolves routing context.
 *   - lib/api/contact — ContactForm's submit path is T-9's concern; this
 *     file only needs the module to resolve so ContactForm mounts. The
 *     mocked `CONTACT_CATEGORIES` mirrors the real fixed set so the
 *     <select> renders identically to production.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

jest.mock('next/navigation', () => ({
  usePathname: jest.fn().mockReturnValue('/contact'),
  useSearchParams: jest.fn(),
}));

jest.mock('@/lib/api/contact', () => ({
  // Mirrors the real `CONTACT_CATEGORIES` (`lib/api/contact.ts`) so the
  // rendered <select> matches production shape-for-shape.
  CONTACT_CATEGORIES: [
    'General inquiry',
    'Join the registry',
    'Update or correct actor information',
    'Privacy or consent request',
    'Technical support',
    'Partnership or collaboration',
    'Feedback or suggestion',
    'Other',
  ],
  submitContact: jest.fn(),
}));

import ContactPage from './page';

function renderContactPage() {
  return render(
    <main>
      <ContactPage />
    </main>
  );
}

describe('/contact page — axe accessibility (T-10, NFR-3)', () => {
  it('has no axe violations (WCAG 2.1 AA compliance)', async () => {
    const { container } = renderContactPage();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  it('has exactly one h1', () => {
    renderContactPage();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('renders ContactForm (T-9) — the form submit control is present', () => {
    renderContactPage();

    expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument();
  });

  // DC-11 / FR-6: ContactForm links the privacy notice at /privacy. This
  // page does not own that copy (ContactForm.tsx, T-9, PASSED, out of
  // scope) — this assertion only proves the link is reachable from the
  // rendered /contact page, mirroring KZ-002 ("presence is not proof it
  // resolves" — the /privacy route's own existence is asserted separately
  // in privacy-a11y.test.tsx, and the build assertion proves
  // out/privacy/index.html is emitted).
  it('links the privacy notice to /privacy (FR-6, DC-11)', () => {
    renderContactPage();

    const privacyLink = screen.getByRole('link', { name: /privacy notice/i });
    expect(privacyLink).toBeInTheDocument();
    expect(privacyLink).toHaveAttribute('href', '/privacy');
  });
});
