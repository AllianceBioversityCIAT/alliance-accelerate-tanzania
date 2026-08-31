/**
 * Automated accessibility + content tests for the /privacy page — T-10,
 * FR-6, DC-11.
 *
 * This route is FR-6's link target: before this task, `/privacy` did not
 * exist and `ContactForm.tsx`'s (T-9, PASSED) privacy-acknowledgement link
 * went nowhere. DC-11 requires a test asserting "the link resolves to a
 * page that exists" — the strongest form of that assertion Jest can make
 * without an HTTP server is that this page's own module resolves, renders,
 * and carries the content design.md §5.2 requires (what is collected, who
 * receives it, that it is relayed and not stored, and that submitting is
 * not consent to publish). The build assertion (`out/privacy/index.html`
 * emitted under `trailingSlash: true`) is the complementary static-export
 * half of that proof (NFR-5) and is exercised by `npm run build`, not here.
 *
 * PrivacyPage is a pure static server component: no hooks, no data
 * fetching, no useSearchParams.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

jest.mock('next/navigation', () => ({
  usePathname: jest.fn().mockReturnValue('/privacy'),
}));

import PrivacyPage from './page';

function renderPrivacyPage() {
  return render(
    <main>
      <PrivacyPage />
    </main>
  );
}

describe('/privacy page — axe accessibility (T-10, NFR-3)', () => {
  it('has no axe violations (WCAG 2.1 AA compliance)', async () => {
    const { container } = renderPrivacyPage();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  it('has exactly one h1', () => {
    renderPrivacyPage();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('/privacy page — content per design.md §5.2 (FR-6)', () => {
  it('states what a submission collects', () => {
    renderPrivacyPage();

    expect(
      screen.getByRole('heading', { name: /what a submission collects/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/name, email address/i)).toBeInTheDocument();
  });

  it('states who receives it', () => {
    renderPrivacyPage();

    expect(screen.getByRole('heading', { name: /who receives it/i })).toBeInTheDocument();
    expect(screen.getByText(/accelerate tanzania programme team/i)).toBeInTheDocument();
  });

  it('states messages are relayed by email and NOT stored by the platform', () => {
    renderPrivacyPage();

    expect(screen.getByText(/relayed by email and is not stored/i)).toBeInTheDocument();
  });

  it('states submitting is NOT consent to publish anything', () => {
    renderPrivacyPage();

    expect(
      screen.getByText(/not consent to publish any organisation.s information/i)
    ).toBeInTheDocument();
  });
});
