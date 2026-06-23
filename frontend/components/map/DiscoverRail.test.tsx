/**
 * Unit tests for DiscoverRail — T-4, FR-1, FR-4, FR-5, FR-7, NFR-2, NFR-5.
 *
 * Filter: `DiscoverRail` (matched via filename).
 *
 * Covers:
 *   (a) count header shows "N actors shown" using the `total` prop (FR-4)
 *   (b) count falls back to actors.length when total is undefined
 *   (c) empty state renders when actors=[] and not loading/not error (FR-7)
 *   (d) error state renders when error=true (FR-7, DD-6)
 *   (e) loading state renders skeleton rows when loading=true (FR-7)
 *   (f) actors list renders when actors are provided and not loading/error
 *   (g) PII guard — no phone/email in the rendered output (NFR-5)
 *   (h) mobile toggle button is present (NFR-2)
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DiscoverRail from './DiscoverRail';
import type { PublicActor, ActorsQuery } from '@/lib/api/actors';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ACTOR_A: PublicActor = {
  id: 'actor-1',
  traderName: 'Dodoma Seeds Ltd',
  region: 'Dodoma',
  district: 'Dodoma Urban',
  traderType: 'seed_company',
  capacityTons: 500,
  crops: ['sorghum'],
  gps: { lat: -6.17, long: 35.74 },
};

const ACTOR_B: PublicActor = {
  id: 'actor-2',
  traderName: 'Mbeya Cooperative',
  region: 'Mbeya',
  district: null,
  traderType: 'cooperative',
  capacityTons: null,
  crops: ['common_bean'],
  gps: null,
};

const ACTORS = [ACTOR_A, ACTOR_B];

// Default props used in most tests — override as needed.
const DEFAULT_PROPS = {
  actors: ACTORS,
  total: 2,
  loading: false,
  error: false,
  filters: {} as ActorsQuery,
  selectedActorId: null,
  onFilterChange: jest.fn(),
  onSelectActor: jest.fn(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiscoverRail', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── (a) Count header: "N actors shown" from total prop ────────────────────

  it('shows "2 actors shown" when total=2', () => {
    render(<DiscoverRail {...DEFAULT_PROPS} total={2} />);

    expect(screen.getByText(/2 actors shown/i)).toBeInTheDocument();
  });

  it('shows "7 actors shown" when total=7 (non-actors-array count)', () => {
    render(
      <DiscoverRail
        {...DEFAULT_PROPS}
        actors={ACTORS}
        total={7}
      />,
    );

    expect(screen.getByText(/7 actors shown/i)).toBeInTheDocument();
  });

  it('uses singular "actor" when total=1', () => {
    render(
      <DiscoverRail
        {...DEFAULT_PROPS}
        actors={[ACTOR_A]}
        total={1}
      />,
    );

    expect(screen.getByText(/1 actor shown/i)).toBeInTheDocument();
    // Must NOT use plural form.
    expect(screen.queryByText(/1 actors shown/i)).not.toBeInTheDocument();
  });

  // ── (b) Count fallback: actors.length when total is undefined ─────────────

  it('falls back to actors.length for count when total is undefined', () => {
    render(
      <DiscoverRail
        {...DEFAULT_PROPS}
        total={undefined}
        actors={ACTORS}
      />,
    );

    // ACTORS.length = 2
    expect(screen.getByText(/2 actors shown/i)).toBeInTheDocument();
  });

  // ── (c) Empty state ────────────────────────────────────────────────────────

  it('renders empty state when actors=[] and not loading/error', () => {
    render(
      <DiscoverRail
        {...DEFAULT_PROPS}
        actors={[]}
        total={0}
        loading={false}
        error={false}
      />,
    );

    expect(screen.getByText(/no actors match your filters/i)).toBeInTheDocument();
  });

  // ── (d) Error state ────────────────────────────────────────────────────────

  it("renders 'Couldn't load actors' when error=true", () => {
    render(
      <DiscoverRail
        {...DEFAULT_PROPS}
        actors={[]}
        loading={false}
        error={true}
      />,
    );

    expect(screen.getByText(/couldn't load actors/i)).toBeInTheDocument();
  });

  it('does not throw when error=true (DD-6 resilience)', () => {
    expect(() =>
      render(
        <DiscoverRail
          {...DEFAULT_PROPS}
          actors={[]}
          loading={false}
          error={true}
        />,
      ),
    ).not.toThrow();
  });

  // ── (e) Loading state ──────────────────────────────────────────────────────

  it('renders the loading status region when loading=true', () => {
    render(
      <DiscoverRail
        {...DEFAULT_PROPS}
        actors={[]}
        loading={true}
        error={false}
      />,
    );

    expect(screen.getByRole('status', { name: /loading actors/i })).toBeInTheDocument();
  });

  // ── (f) Actors list renders when data present and not loading/error ────────

  it('renders actor names in the list when data is loaded', () => {
    render(<DiscoverRail {...DEFAULT_PROPS} />);

    expect(screen.getByText('Dodoma Seeds Ltd')).toBeInTheDocument();
    expect(screen.getByText('Mbeya Cooperative')).toBeInTheDocument();
  });

  // ── (g) PII guard (NFR-5) ─────────────────────────────────────────────────

  it('does not render any phone or email text (PII guard, NFR-5)', () => {
    render(<DiscoverRail {...DEFAULT_PROPS} />);

    // Negative assertion — PublicActor carries no PII but guard at test level.
    expect(screen.queryByText(/phone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
  });

  // ── (h) Mobile toggle (NFR-2) ─────────────────────────────────────────────

  it('renders a "Filters & list" mobile toggle button', () => {
    render(<DiscoverRail {...DEFAULT_PROPS} />);

    // The button is in the DOM (hidden on ≥ md via md:hidden, visible on mobile).
    expect(
      screen.getByRole('button', { name: /filters & list/i }),
    ).toBeInTheDocument();
  });

  it('toggles to "Hide list" after the mobile toggle is clicked', () => {
    render(<DiscoverRail {...DEFAULT_PROPS} />);

    const toggle = screen.getByRole('button', { name: /filters & list/i });
    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: /hide list/i })).toBeInTheDocument();
  });

  // ── FilterControls are rendered (FR-4) ────────────────────────────────────

  it('renders filter selects inside the rail', () => {
    render(<DiscoverRail {...DEFAULT_PROPS} />);

    expect(screen.getByLabelText(/filter by crop/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter by actor role/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter by region/i)).toBeInTheDocument();
  });
});
