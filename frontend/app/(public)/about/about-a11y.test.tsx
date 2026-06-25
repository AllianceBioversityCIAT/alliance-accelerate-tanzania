/**
 * Automated accessibility tests for the /about page — T-9, NFR-3.
 *
 * Uses jest-axe to assert WCAG 2.1 AA compliance against the full rendered
 * static About page composition.
 *
 * AboutPage is a pure server component (no hooks, no data fetching). It
 * imports next/image, Button, PillarCards, and the static CROPS array — all
 * of which render directly in RTL without additional mocks.
 *
 * Mocks:
 *   - next/navigation — usePathname is NOT used by AboutPage itself (no
 *     Header/Footer in scope here), but next/link (used by Button) resolves
 *     it; mock provided for safety in case middleware resolves it transitively.
 *
 * next/image: no mock needed — next/jest transform renders a real <img> in
 * jsdom (confirmed by home-a11y.test.tsx which renders next/image without a
 * mock).
 *
 * Assertions:
 *   1. axe(container) → toHaveNoViolations (WCAG 2.1 AA).
 *   2. Exactly ONE <h1> (the About hero heading).
 *   3. The external Alliance credits link is present with a discernible name
 *      and rel="noopener noreferrer".
 *   4. Registry CTA links render: "Explore the Map" → /map,
 *      "Browse the Directory" → /directory.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

// Extend jest-dom expect with the jest-axe matcher.
expect.extend(toHaveNoViolations);

// ---------------------------------------------------------------------------
// Component under test — default-import only (do NOT render `metadata`).
// ---------------------------------------------------------------------------

import AboutPage from './page';

// ---------------------------------------------------------------------------
// Module mocks — hoisted before dynamic imports resolve.
// ---------------------------------------------------------------------------

// next/navigation — usePathname consumed transitively by next/link internals in
// some Next.js builds; guard against any routing context errors in jsdom.
jest.mock('next/navigation', () => ({
  usePathname: jest.fn().mockReturnValue('/about'),
}));

// ---------------------------------------------------------------------------
// Helper — render the About page into the DOM.
// AboutPage emits a self-contained <div> with multiple <section> elements —
// wrap in <main> to satisfy the landmark structure axe evaluates.
// ---------------------------------------------------------------------------

function renderAboutPage() {
  return render(
    <main>
      <AboutPage />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/about page — axe accessibility (T-9, NFR-3)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('has no axe violations (WCAG 2.1 AA compliance)', async () => {
    const { container } = renderAboutPage();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  it('T-9: has exactly one h1 on the About page (hero heading)', () => {
    renderAboutPage();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('T-9: Alliance credits external link has a discernible name and rel="noopener noreferrer"', () => {
    renderAboutPage();

    // The link wraps the text "Alliance project page" and points to the
    // Alliance project page on alliancebioversityciat.org.
    const creditsLink = screen.getByRole('link', { name: /alliance project page/i });

    expect(creditsLink).toBeInTheDocument();
    expect(creditsLink).toHaveAttribute('rel', 'noopener noreferrer');
    expect(creditsLink).toHaveAttribute(
      'href',
      'https://alliancebioversityciat.org/projects/accelerate'
    );
  });

  it('T-9: registry CTAs render — "Explore the Map" → /map and "Browse the Directory" → /directory', () => {
    renderAboutPage();

    const exploreLink = screen.getByRole('link', { name: /explore the map/i });
    expect(exploreLink).toBeInTheDocument();
    expect(exploreLink).toHaveAttribute('href', '/map');

    const directoryLink = screen.getByRole('link', { name: /browse the directory/i });
    expect(directoryLink).toBeInTheDocument();
    expect(directoryLink).toHaveAttribute('href', '/directory');
  });
});
