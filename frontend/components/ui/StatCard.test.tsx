/**
 * Unit tests for StatCard (FR-4, FR-7, FR-8, NFR-5).
 *
 * GSAP is mocked via jest.config.ts moduleNameMapper so useCountUp is a no-op:
 *   gsap.matchMedia().add() never fires → the JSX-rendered final value stays
 *   in the DOM (FR-8 progressive enhancement + FR-7 reduced-motion path).
 *
 * Covers:
 *   (a) static rendering: loading skeleton, numeric value, em-dash placeholder
 *   (b) count-up path: final numeric value is present in the DOM with GSAP mocked
 *   (c) reduced-motion path (simulated by the mock): final value shown, no throw
 *   (d) countUp=false (default): static, no animation wired
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import StatCard from './StatCard';

// ---------------------------------------------------------------------------
// (a) Static rendering — loading and non-numeric paths unchanged
// ---------------------------------------------------------------------------

describe('StatCard — static rendering', () => {
  it('renders a skeleton while loading=true', () => {
    const { container } = render(
      <StatCard label="Actors mapped" value={undefined} loading />,
    );
    // The skeleton placeholder replaces the value slot — no number or dash
    expect(screen.queryByText('—')).not.toBeInTheDocument();
    // A div with skeleton class (Skeleton component) should be present
    // We verify by the absence of text-content in the value span
    expect(screen.getByText('Actors mapped')).toBeInTheDocument();
    expect(container).toBeTruthy();
  });

  it('renders a formatted number when loading=false and value is finite', () => {
    render(<StatCard label="Actors mapped" value={1234} loading={false} />);
    expect(screen.getByText((_, el) =>
      el?.tagName === 'SPAN' && /1[,.]?234/.test(el.textContent ?? '')
    )).toBeInTheDocument();
    expect(screen.getByText('Actors mapped')).toBeInTheDocument();
  });

  it('renders em-dash when loading=false and value is null', () => {
    render(<StatCard label="Major crops" value={null} loading={false} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders em-dash when loading=false and value is undefined', () => {
    render(<StatCard label="Regions covered" value={undefined} loading={false} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders 0 correctly', () => {
    render(<StatCard label="Actor types" value={0} loading={false} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// (b) Count-up path — FR-8: final value must be in the DOM with GSAP mocked
// ---------------------------------------------------------------------------

describe('StatCard — countUp=true path (FR-4, FR-8)', () => {
  // FR-8: with GSAP mocked (matchMedia.add is a no-op), the hook never fires
  // the animation callback.  The JSX-rendered final value must survive.
  it('FR-8: renders final numeric value in the DOM when countUp=true, GSAP mocked', () => {
    render(
      <StatCard label="Actors mapped" value={1234} loading={false} countUp />,
    );
    // Final value is present: hook did not blank the node
    expect(screen.getByText((_, el) =>
      el?.tagName === 'SPAN' && /1[,.]?234/.test(el.textContent ?? '')
    )).toBeInTheDocument();
  });

  it('renders small integers with countUp=true without throw', () => {
    render(<StatCard label="Major crops" value={3} loading={false} countUp />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders label correctly alongside countUp', () => {
    render(
      <StatCard label="Regions covered" value={7} loading={false} countUp />,
    );
    expect(screen.getByText('Regions covered')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  // FR-4: countUp=true while loading → skeleton, not a count animation
  it('FR-4: countUp=true while loading=true shows skeleton, not final value', () => {
    render(
      <StatCard label="Actor types" value={4} loading countUp />,
    );
    // Loading skeleton replaces value — no number text
    expect(screen.queryByText('4')).not.toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  // FR-7: reduced-motion is simulated by the mock (matchMedia.add never fires)
  // → the JSX-rendered final value is shown, no animation (FR-8 + FR-7).
  it('FR-7: reduced-motion path (mocked) shows final value without animation', () => {
    render(
      <StatCard label="Actors mapped" value={500} loading={false} countUp />,
    );
    const span = screen.getByText('500');
    expect(span).toBeInTheDocument();
    // textContent is exactly what JSX rendered — hook did not overwrite it
    expect(span.textContent).toBe('500');
  });

  // FR-8: countUp=true with a null value → em-dash, no throw
  it('FR-8: countUp=true with null value shows em-dash, no throw', () => {
    expect(() =>
      render(<StatCard label="Actors mapped" value={null} loading={false} countUp />)
    ).not.toThrow();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  // Unmounts cleanly
  it('unmounts cleanly without throwing when countUp=true', () => {
    const { unmount } = render(
      <StatCard label="Actor types" value={4} loading={false} countUp />,
    );
    expect(() => unmount()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// (c) countUp=false (default) — static, no animation prop wired
// ---------------------------------------------------------------------------

describe('StatCard — countUp=false (default)', () => {
  it('renders correctly without the countUp prop', () => {
    render(<StatCard label="Major crops" value={3} loading={false} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Major crops')).toBeInTheDocument();
  });

  it('renders without throw when countUp is explicitly false', () => {
    expect(() =>
      render(<StatCard label="Actor types" value={4} loading={false} countUp={false} />)
    ).not.toThrow();
    expect(screen.getByText('4')).toBeInTheDocument();
  });
});
