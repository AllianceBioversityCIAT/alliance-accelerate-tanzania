/**
 * Unit tests for DirectoryView — T-3, FR-1, FR-8, NFR-1, NFR-3, NFR-7.
 *
 * Filter: `DirectoryView` (matched via filename).
 *
 * Covers:
 *   (a) loaded state — renders ActorCard grid with actor names from mocked useActors
 *   (b) result count — "N organizations found" displays the total from the hook
 *   (c) loading state — Skeleton cards render; count is suppressed; no actor names
 *   (d) error state — "Could not load organizations" renders; no crash (NFR-7)
 *   (e) empty state — "No organizations found" renders distinctly from error
 *   (f) PII guard — no phone/email text in the rendered output (NFR-1)
 *
 * useActors is mocked so no network calls are made.
 * Mocking style mirrors @/app/(public)/map/map-a11y.test.tsx.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import DirectoryView from './DirectoryView';
import type { PublicActor, PublicActorList } from '@/lib/api/actors';

// ── Module mocks ──────────────────────────────────────────────────────────────

// useActors — mock to control hook state for each test scenario.
// Declared before imports via jest.mock hoisting.
jest.mock('@/lib/api/useActors', () => ({
  useActors: jest.fn(),
}));

/* eslint-disable */
const { useActors } = require('@/lib/api/useActors') as {
  useActors: jest.Mock;
};
/* eslint-enable */

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
  crops: ['common_bean', 'groundnut'],
  gps: null,
};

const ACTOR_LIST: PublicActorList = {
  data: [ACTOR_A, ACTOR_B],
  page: 1,
  pageSize: 20,
  total: 2,
};

const EMPTY_LIST: PublicActorList = {
  data: [],
  page: 1,
  pageSize: 20,
  total: 0,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DirectoryView', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── (a) Loaded state — grid renders with actor names ──────────────────────

  it('renders actor names in the grid when data is loaded', () => {
    useActors.mockReturnValue({ data: ACTOR_LIST, loading: false, error: false });
    render(<DirectoryView />);

    expect(screen.getByText('Dodoma Seeds Ltd')).toBeInTheDocument();
    expect(screen.getByText('Mbeya Cooperative')).toBeInTheDocument();
  });

  it('renders one card per actor in the list', () => {
    useActors.mockReturnValue({ data: ACTOR_LIST, loading: false, error: false });
    render(<DirectoryView />);

    // Each actor has a "View Profile" link — two links means two cards.
    const links = screen.getAllByRole('link', { name: /view profile/i });
    expect(links).toHaveLength(2);
  });

  it('renders profile links with the correct actor id', () => {
    useActors.mockReturnValue({ data: ACTOR_LIST, loading: false, error: false });
    render(<DirectoryView />);

    // ACTOR_A's link should point to /profile?id=actor-1
    const linkA = screen.getByRole('link', { name: /view profile for Dodoma Seeds Ltd/i });
    expect(linkA).toHaveAttribute('href', '/profile?id=actor-1');

    // ACTOR_B's link should point to /profile?id=actor-2
    const linkB = screen.getByRole('link', { name: /view profile for Mbeya Cooperative/i });
    expect(linkB).toHaveAttribute('href', '/profile?id=actor-2');
  });

  // ── (b) Result count ──────────────────────────────────────────────────────

  it('shows "2 organizations found" when total=2', () => {
    useActors.mockReturnValue({ data: ACTOR_LIST, loading: false, error: false });
    render(<DirectoryView />);

    expect(screen.getByText('2 organizations found')).toBeInTheDocument();
  });

  it('shows "1 organization found" (singular) when total=1', () => {
    const singleList: PublicActorList = {
      data: [ACTOR_A],
      page: 1,
      pageSize: 20,
      total: 1,
    };
    useActors.mockReturnValue({ data: singleList, loading: false, error: false });
    render(<DirectoryView />);

    expect(screen.getByText('1 organization found')).toBeInTheDocument();
    // Must NOT use plural form.
    expect(screen.queryByText('1 organizations found')).not.toBeInTheDocument();
  });

  // ── (c) Loading state ─────────────────────────────────────────────────────

  it('renders the loading status region when loading=true', () => {
    useActors.mockReturnValue({ data: null, loading: true, error: false });
    render(<DirectoryView />);

    expect(screen.getByRole('status', { name: /loading organizations/i })).toBeInTheDocument();
  });

  it('suppresses the result count while loading', () => {
    useActors.mockReturnValue({ data: null, loading: true, error: false });
    render(<DirectoryView />);

    // ResultCount renders nothing when loading=true (polite region stays quiet).
    expect(screen.queryByText(/organizations found/i)).not.toBeInTheDocument();
  });

  it('does not render actor names during loading', () => {
    useActors.mockReturnValue({ data: null, loading: true, error: false });
    render(<DirectoryView />);

    expect(screen.queryByText('Dodoma Seeds Ltd')).not.toBeInTheDocument();
  });

  // ── (d) Error state — distinct; no crash ──────────────────────────────────

  it('renders "Could not load organizations" when error=true', () => {
    useActors.mockReturnValue({ data: null, loading: false, error: true });
    render(<DirectoryView />);

    expect(screen.getByText(/could not load organizations/i)).toBeInTheDocument();
  });

  it('does not throw when error=true (NFR-7 resilience)', () => {
    useActors.mockReturnValue({ data: null, loading: false, error: true });
    expect(() => render(<DirectoryView />)).not.toThrow();
  });

  it('does not render actor names during the error state', () => {
    useActors.mockReturnValue({ data: null, loading: false, error: true });
    render(<DirectoryView />);

    expect(screen.queryByText('Dodoma Seeds Ltd')).not.toBeInTheDocument();
  });

  // ── (e) Empty state — distinct from error ─────────────────────────────────

  it('renders "No organizations found" when data is empty and not error', () => {
    useActors.mockReturnValue({ data: EMPTY_LIST, loading: false, error: false });
    render(<DirectoryView />);

    expect(screen.getByText(/no organizations found/i)).toBeInTheDocument();
  });

  it('does not show the error message in the empty state', () => {
    useActors.mockReturnValue({ data: EMPTY_LIST, loading: false, error: false });
    render(<DirectoryView />);

    // Empty state must be distinct from error (FR-8).
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
  });

  it('shows "0 organizations found" count in the empty state', () => {
    useActors.mockReturnValue({ data: EMPTY_LIST, loading: false, error: false });
    render(<DirectoryView />);

    // ResultCount with count=0 should still display (loading=false).
    expect(screen.getByText('0 organizations found')).toBeInTheDocument();
  });

  // ── (f) PII guard — no phone/email ever rendered (NFR-1) ──────────────────

  it('does not render any phone or email text in the loaded state (PII guard)', () => {
    useActors.mockReturnValue({ data: ACTOR_LIST, loading: false, error: false });
    render(<DirectoryView />);

    expect(screen.queryByText(/phone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
  });

  it('does not render phone or email in the error state (PII guard)', () => {
    useActors.mockReturnValue({ data: null, loading: false, error: true });
    render(<DirectoryView />);

    expect(screen.queryByText(/phone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
  });
});
