/**
 * Hero component unit tests (T-4 portal-animations, FR-3, FR-7, FR-8, NFR-5).
 *
 * GSAP is mocked via jest.config.ts moduleNameMapper so animations are no-ops.
 * useGSAP runs the callback once in useEffect without real animation.
 * gsap.matchMedia().add() is a no-op — the animation callback never fires.
 *
 * Key invariants verified here:
 *  FR-8: All hero content (eyebrow, h1, copy, CTAs, "1,000+") is present and
 *        visible in the DOM without GSAP running.
 *  FR-3: "1,000+" is always rendered as the final value (progressive enhancement).
 *  FR-7: With GSAP mocked (matchMedia.add no-ops) no animation fires → static state.
 *  NFR-1: axe reports 0 violations on the animated Hero.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import Hero from './Hero';

expect.extend(toHaveNoViolations);

// next/navigation is not used by Hero directly, but jest may warn about
// missing mocks for downstream imports — guard here for completeness.
jest.mock('next/navigation', () => ({
  usePathname: jest.fn().mockReturnValue('/'),
}));

describe('Hero — with GSAP mocked', () => {
  // FR-8: eyebrow text is present without GSAP
  it('renders the eyebrow badge text', () => {
    render(<Hero />);
    expect(
      screen.getByText(/institutional seed-system intelligence/i),
    ).toBeInTheDocument();
  });

  // FR-8: h1 is present and has the correct id for landmark navigation
  it('renders the h1 headline with id="hero-heading"', () => {
    render(<Hero />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveAttribute('id', 'hero-heading');
    expect(heading).toHaveTextContent(/connective tissue/i);
  });

  // FR-8: supporting copy is present
  it('renders the supporting copy paragraph', () => {
    render(<Hero />);
    expect(screen.getByText(/single trusted registry/i)).toBeInTheDocument();
  });

  // FR-8 / T-15: CTA buttons are present
  it('renders the primary CTA "Explore the Dashboard" pointing to /dashboard', () => {
    render(<Hero />);
    const link = screen.getByRole('link', { name: /explore the dashboard/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('renders the secondary CTA "Explore the Map" pointing to /map', () => {
    render(<Hero />);
    const link = screen.getByRole('link', { name: /explore the map/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/map');
  });

  it('renders the tertiary CTA "Browse Directory" pointing to /directory', () => {
    render(<Hero />);
    const link = screen.getByRole('link', { name: /browse directory/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/directory');
  });

  // FR-3 / FR-8: "1,000+" must be the final rendered value in the DOM —
  // even when GSAP is mocked and the count-up animation never fires.
  it('FR-3/FR-8: renders "1,000+" as the LiveRegistryCard figure without GSAP', () => {
    render(<Hero />);
    // The span rendered by useCountUp JSX always holds "1,000+" as its text.
    expect(screen.getByText('1,000+')).toBeInTheDocument();
  });

  // FR-7 / FR-8: with matchMedia.add no-op (simulates reduced-motion or mocked env),
  // no animation runs and content is in its final visible state.
  it('FR-7: LiveRegistryCard value stays "1,000+" when matchMedia.add is a no-op', () => {
    render(<Hero />);
    const node = screen.getByText('1,000+');
    // textContent is exactly what JSX rendered — hook did not blank it.
    expect(node.textContent).toBe('1,000+');
  });

  // Section landmark must carry an accessible label via aria-labelledby
  it('has aria-labelledby="hero-heading" on the section element', () => {
    render(<Hero />);
    const section = screen.getByRole('region', { name: /connective tissue/i });
    expect(section).toBeInTheDocument();
  });

  // LiveRegistryCard region must have its own accessible label
  it('renders the Live Registry region with accessible label', () => {
    render(<Hero />);
    expect(
      screen.getByRole('region', { name: /live registry summary/i }),
    ).toBeInTheDocument();
  });

  // NFR-1: axe finds no accessibility violations on the animated Hero
  it('NFR-1: has no axe violations', async () => {
    const { container } = render(<Hero />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  // Unmounts without throwing (cleanup safety)
  it('unmounts cleanly', () => {
    const { unmount } = render(<Hero />);
    expect(() => unmount()).not.toThrow();
  });
});
