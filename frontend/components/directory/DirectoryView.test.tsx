/**
 * Unit tests for DirectoryView — T-3 (existing) + T-4 (URL-sync extension).
 * FR-1, FR-2, FR-3, FR-8, NFR-1, NFR-3, NFR-7.
 *
 * Filter: `DirectoryView` (matched via filename).
 *
 * Covers:
 *   T-3 (preserved):
 *     (a) loaded state — renders ActorCard grid with actor names
 *     (b) result count — "N organizations found"
 *     (c) loading state — Skeleton cards; count suppressed; no actor names
 *     (d) error state — "Could not load organizations"; no crash (NFR-7)
 *     (e) empty state — "No organizations found" distinct from error
 *     (f) PII guard — no phone/email text (NFR-1)
 *
 *   T-4 (new):
 *     (g) DirectorySearch renders inside DirectoryView
 *     (h) DirectoryFilters renders inside DirectoryView
 *     (i) DirectoryPagination renders when total > pageSize
 *     (j) DirectoryPagination hidden when total ≤ pageSize
 *
 * useActors + next/navigation mocked (no network calls).
 * Mocking style mirrors @/app/(public)/map/map-a11y.test.tsx.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import DirectoryView from './DirectoryView';
import type { PublicActor, PublicActorList } from '@/lib/api/actors';

// ── Module mocks ──────────────────────────────────────────────────────────────

// useActors — mock to control hook state for each scenario.
jest.mock('@/lib/api/useActors', () => ({
  useActors: jest.fn(),
}));

// next/navigation — required because DirectoryView uses useSearchParams and
// useRouter. Both must be mocked for static-export test environments.
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => new URLSearchParams()),
  useRouter: jest.fn(() => ({ replace: jest.fn() })),
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

/** Multi-page list (total > pageSize) to test pagination visibility. */
const MULTI_PAGE_LIST: PublicActorList = {
  data: [ACTOR_A],
  page: 1,
  pageSize: 20,
  total: 25,
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

    const linkA = screen.getByRole('link', { name: /view profile for Dodoma Seeds Ltd/i });
    expect(linkA).toHaveAttribute('href', '/profile?id=actor-1');

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
    expect(screen.queryByText('1 organizations found')).not.toBeInTheDocument();
  });

  // ── (c) Loading state ─────────────────────────────────────────────────────

  it('renders the loading status region when loading=true', () => {
    useActors.mockReturnValue({ data: null, loading: true, error: false });
    render(<DirectoryView />);

    expect(
      screen.getByRole('status', { name: /loading organizations/i }),
    ).toBeInTheDocument();
  });

  it('suppresses the result count while loading', () => {
    useActors.mockReturnValue({ data: null, loading: true, error: false });
    render(<DirectoryView />);

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

    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
  });

  it('shows "0 organizations found" count in the empty state', () => {
    useActors.mockReturnValue({ data: EMPTY_LIST, loading: false, error: false });
    render(<DirectoryView />);

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

  // ── (g) DirectorySearch renders inside DirectoryView ──────────────────────

  it('renders the search input', () => {
    useActors.mockReturnValue({ data: ACTOR_LIST, loading: false, error: false });
    render(<DirectoryView />);

    expect(
      screen.getByRole('searchbox', { name: /search organizations/i }),
    ).toBeInTheDocument();
  });

  // ── (h) DirectoryFilters renders inside DirectoryView ─────────────────────

  it('renders the crop filter select', () => {
    useActors.mockReturnValue({ data: ACTOR_LIST, loading: false, error: false });
    render(<DirectoryView />);

    expect(screen.getByLabelText(/filter by crop/i)).toBeInTheDocument();
  });

  it('renders the role filter select', () => {
    useActors.mockReturnValue({ data: ACTOR_LIST, loading: false, error: false });
    render(<DirectoryView />);

    expect(screen.getByLabelText(/filter by actor role/i)).toBeInTheDocument();
  });

  it('renders the region filter select', () => {
    useActors.mockReturnValue({ data: ACTOR_LIST, loading: false, error: false });
    render(<DirectoryView />);

    expect(screen.getByLabelText(/filter by region/i)).toBeInTheDocument();
  });

  // ── (i) DirectoryPagination renders when total > pageSize ─────────────────

  it('renders pagination when total exceeds pageSize', () => {
    useActors.mockReturnValue({ data: MULTI_PAGE_LIST, loading: false, error: false });
    render(<DirectoryView />);

    expect(
      screen.getByRole('navigation', { name: /directory pagination/i }),
    ).toBeInTheDocument();
  });

  // ── (j) DirectoryPagination hidden when total ≤ pageSize ──────────────────

  it('does not render pagination when all results fit on one page', () => {
    useActors.mockReturnValue({ data: ACTOR_LIST, loading: false, error: false });
    render(<DirectoryView />);

    expect(
      screen.queryByRole('navigation', { name: /directory pagination/i }),
    ).not.toBeInTheDocument();
  });
});
