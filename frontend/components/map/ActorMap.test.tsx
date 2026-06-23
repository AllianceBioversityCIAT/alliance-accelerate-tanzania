/**
 * Unit tests for ActorMap — T-2, FR-7, DD-6.
 *
 * Filter: `ActorMap` (matched via filename).
 *
 * Covers:
 *   (a) loading state  — renders accessible loading UI when loading=true
 *   (b) error state    — renders "Couldn't load actors" when error=true
 *   (c) empty state    — renders "No actors match" when actors=[] and not loading/error
 *   (d) data state     — renders the (mocked) LeafletMap when actors are present
 *
 * LeafletMap is mocked to avoid Leaflet/jsdom canvas and window issues.
 * The mock is declared before the import so jest.mock hoisting works correctly.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import ActorMap from './ActorMap';
import type { PublicActor, PublicActorList } from '@/lib/api/actors';

// ── Module mocks ──────────────────────────────────────────────────────────────

// Mock next/dynamic so the dynamic import resolves synchronously in tests.
// We replace LeafletMap with a lightweight stub that just renders a test ID.
jest.mock('next/dynamic', () => ({
  __esModule: true,
  // next/dynamic() normally returns a React component; our factory returns one directly.
  default: (
    importFn: () => Promise<{ default: React.ComponentType<unknown> }>,
    _options?: unknown,
  ) => {
    // Return a synchronous stub so tests don't need async resolution.
    // The test just verifies that the wrapper renders this stub when data exists.
    const MockLeafletMap = (props: unknown) => (
      <div data-testid="leaflet-map-mock" data-props={JSON.stringify(props)} />
    );
    MockLeafletMap.displayName = 'MockLeafletMap';
    // Satisfy the dynamic import signature (unused in tests but required by type).
    void importFn;
    return MockLeafletMap;
  },
}));

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

const FULL_LIST: PublicActorList = {
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

// Shared no-op for onSelectActor — prop contract requires it.
const noop = () => undefined;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ActorMap', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── (a) Loading state ─────────────────────────────────────────────────────

  it('renders the loading state when loading=true', () => {
    render(
      <ActorMap
        data={null}
        loading={true}
        error={false}
        selectedActorId={null}
        onSelectActor={noop}
      />,
    );

    // Accessible loading region should be present.
    expect(screen.getByRole('status', { name: /loading actors/i })).toBeInTheDocument();

    // The mock LeafletMap must NOT be rendered during loading.
    expect(screen.queryByTestId('leaflet-map-mock')).not.toBeInTheDocument();
  });

  // ── (b) Error state ───────────────────────────────────────────────────────

  it('renders the error state when error=true (page must not throw)', () => {
    expect(() =>
      render(
        <ActorMap
          data={null}
          loading={false}
          error={true}
          selectedActorId={null}
          onSelectActor={noop}
        />,
      ),
    ).not.toThrow();

    // DD-6 / FR-7: clear, non-broken fallback message.
    expect(screen.getByText(/couldn't load actors/i)).toBeInTheDocument();
    // Additional context message.
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();

    // LeafletMap must NOT render in the error state.
    expect(screen.queryByTestId('leaflet-map-mock')).not.toBeInTheDocument();
  });

  // ── (c) Empty state ───────────────────────────────────────────────────────

  it('renders the empty state when actors array is empty (not loading, not error)', () => {
    render(
      <ActorMap
        data={EMPTY_LIST}
        loading={false}
        error={false}
        selectedActorId={null}
        onSelectActor={noop}
      />,
    );

    // FR-7: "No actors match" empty state.
    expect(screen.getByText(/no actors match/i)).toBeInTheDocument();

    // LeafletMap must NOT render when there are no actors.
    expect(screen.queryByTestId('leaflet-map-mock')).not.toBeInTheDocument();
  });

  // ── (d) Data state — LeafletMap renders with actors ──────────────────────

  it('renders the mocked LeafletMap when actors are present', () => {
    render(
      <ActorMap
        data={FULL_LIST}
        loading={false}
        error={false}
        selectedActorId={null}
        onSelectActor={noop}
      />,
    );

    // The mock stub should be present in the DOM.
    const mapEl = screen.getByTestId('leaflet-map-mock');
    expect(mapEl).toBeInTheDocument();

    // Neither error nor empty state should appear.
    expect(screen.queryByText(/couldn't load actors/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no actors match/i)).not.toBeInTheDocument();

    // Sanity: no PII fields (phone/email) exist on PublicActor — guard anyway.
    expect(screen.queryByText(/phone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
  });

  // ── (e) Data state with null data (actors derived as []) ──────────────────

  it('renders empty state when data is null and not loading/error', () => {
    // Edge case: error=false but data is null (hook initializing with no prior data).
    // Treats as empty — no crash.
    expect(() =>
      render(
        <ActorMap
          data={null}
          loading={false}
          error={false}
          selectedActorId={null}
          onSelectActor={noop}
        />,
      ),
    ).not.toThrow();

    // data?.data ?? [] → [] → triggers empty state.
    expect(screen.getByText(/no actors match/i)).toBeInTheDocument();
  });
});
