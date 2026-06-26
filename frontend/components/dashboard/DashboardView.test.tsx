/**
 * Unit tests for DashboardView — T-14, FR-1, FR-2, FR-10, FR-11, NFR-2, NFR-6.
 * Spec: dashboard/discovery-dashboard.
 *
 * Filter: `DashboardView` (matched via filename).
 *
 * Strategy:
 *   • Mock next/navigation (useSearchParams, useRouter) — no real Next.js router.
 *   • Mock @/lib/dashboard/useDashboardActors — no real fetch.
 *   • Mock @/components/map/ActorMap — avoids Leaflet / window.L in jsdom.
 *   • Mock chart components (Recharts) — avoids SVG / ResizeObserver issues in jsdom.
 *
 * Covers:
 *   (a) Renders h1 "Seed Discovery Dashboard", filter group, KPI band section,
 *       a chart title, the map panel, and the shortlist table.
 *   (b) When useDashboardActors returns truncated:true, the truncation notice renders.
 *   (c) When useDashboardActors returns error:true, the error panel renders and
 *       normal panels are hidden.
 *   (d) When actors is empty (and not loading, not error), the empty state renders.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Module mocks ──────────────────────────────────────────────────────────────

// ── next/navigation ───────────────────────────────────────────────────────────
// Provide a minimal stub for useSearchParams and useRouter so DashboardView
// can call decodeFilters(searchParams) and router.replace(...) without Next.js.

const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: mockReplace }),
}));

// ── @/lib/dashboard/useDashboardActors ────────────────────────────────────────
// Controlled by `mockHookResult` — tests override this per-case.

import type { UseDashboardActorsResult } from '@/lib/dashboard/useDashboardActors';

let mockHookResult: UseDashboardActorsResult = {
  actors: [],
  total: 0,
  truncated: false,
  loading: false,
  error: false,
};

jest.mock('@/lib/dashboard/useDashboardActors', () => ({
  useDashboardActors: () => mockHookResult,
}));

// ── @/components/map/ActorMap ─────────────────────────────────────────────────
// Replace with a stub so Leaflet / window.L never runs in jsdom.

jest.mock('@/components/map/ActorMap', () => {
  const Stub = () => <div data-testid="actor-map-stub" />;
  Stub.displayName = 'ActorMapStub';
  return Stub;
});

// ── Chart components ──────────────────────────────────────────────────────────
// Replace with lightweight stubs so Recharts / ResizeObserver is never used.

jest.mock('@/components/dashboard/charts/CapacityByRegionChart', () => {
  const Stub = () => (
    <div data-testid="capacity-by-region-chart">Capacity by region (t)</div>
  );
  Stub.displayName = 'CapacityByRegionChartStub';
  return Stub;
});

jest.mock('@/components/dashboard/charts/CropDistributionChart', () => {
  const Stub = () => (
    <div data-testid="crop-distribution-chart">Actors by crop</div>
  );
  Stub.displayName = 'CropDistributionChartStub';
  return Stub;
});

jest.mock('@/components/dashboard/charts/ActorTypeChart', () => {
  const Stub = () => (
    <div data-testid="actor-type-chart">Actors by type</div>
  );
  Stub.displayName = 'ActorTypeChartStub';
  return Stub;
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

import type { PublicActor } from '@/lib/api/actors';

function makeActor(overrides: Partial<PublicActor> = {}): PublicActor {
  return {
    id: 'actor-1',
    traderName: 'Kilimo Seeds Ltd',
    region: 'Dodoma',
    district: 'Kondoa',
    traderType: 'seed_company',
    capacityTons: 200,
    crops: ['sorghum'],
    gps: { lat: -6.17, long: 35.74 },
    ...overrides,
  };
}

function makeActors(n: number): PublicActor[] {
  return Array.from({ length: n }, (_, i) =>
    makeActor({ id: `actor-${i + 1}`, traderName: `Actor ${i + 1}` }),
  );
}

// ── Import component under test (after all jest.mock calls) ──────────────────

import DashboardView from './DashboardView';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderView() {
  return render(<DashboardView />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DashboardView', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    // Default: one actor, no truncation, no error, not loading.
    mockHookResult = {
      actors: makeActors(1),
      total: 1,
      truncated: false,
      loading: false,
      error: false,
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // ── (a) Normal render — all key panels present ────────────────────────────

  describe('(a) normal render with one actor', () => {
    it('renders the h1 "Seed Discovery Dashboard"', () => {
      renderView();
      expect(
        screen.getByRole('heading', { level: 1, name: /seed discovery dashboard/i }),
      ).toBeInTheDocument();
    });

    it('renders the filter panel group', () => {
      renderView();
      // DashboardFilters renders role="group" aria-label="Filter dashboard actors"
      expect(
        screen.getByRole('group', { name: /filter dashboard actors/i }),
      ).toBeInTheDocument();
    });

    it('renders the KPI band section', () => {
      renderView();
      // KpiBand renders <section aria-label="Key performance indicators">
      expect(
        screen.getByRole('region', { name: /key performance indicators/i }),
      ).toBeInTheDocument();
    });

    it('renders at least one chart title (Capacity by region)', () => {
      renderView();
      // Chart stub renders text "Capacity by region (t)"
      expect(screen.getByText(/capacity by region/i)).toBeInTheDocument();
    });

    it('renders the map panel stub', () => {
      renderView();
      expect(screen.getByTestId('actor-map-stub')).toBeInTheDocument();
    });

    it('renders the shortlist table', () => {
      renderView();
      // ShortlistTable renders an accessible table with aria-label "Shortlisted actors"
      expect(
        screen.getByRole('table', { name: /shortlisted actors/i }),
      ).toBeInTheDocument();
    });

    it('renders all three chart stubs', () => {
      renderView();
      expect(screen.getByTestId('capacity-by-region-chart')).toBeInTheDocument();
      expect(screen.getByTestId('crop-distribution-chart')).toBeInTheDocument();
      expect(screen.getByTestId('actor-type-chart')).toBeInTheDocument();
    });
  });

  // ── (b) Truncation notice — renders when truncated:true ──────────────────

  describe('(b) truncation notice', () => {
    it('renders the truncation notice when truncated=true', () => {
      mockHookResult = {
        actors: makeActors(500),
        total: 1200,
        truncated: true,
        loading: false,
        error: false,
      };

      renderView();

      // The notice must mention the actor count and total, and link to /directory.
      const notice = screen.getByRole('status');
      expect(notice).toHaveTextContent(/500/);
      expect(notice).toHaveTextContent(/1,200/);
      expect(
        screen.getByRole('link', { name: /open the full directory/i }),
      ).toBeInTheDocument();
    });

    it('does NOT render the truncation notice when truncated=false', () => {
      mockHookResult = {
        actors: makeActors(5),
        total: 5,
        truncated: false,
        loading: false,
        error: false,
      };

      renderView();

      // No status role with truncation text
      const statusEls = screen.queryAllByRole('status');
      const hasTruncation = statusEls.some((el) =>
        /open the full directory/i.test(el.textContent ?? ''),
      );
      expect(hasTruncation).toBe(false);
    });
  });

  // ── (c) Error state ───────────────────────────────────────────────────────

  describe('(c) error state', () => {
    beforeEach(() => {
      mockHookResult = {
        actors: [],
        total: 0,
        truncated: false,
        loading: false,
        error: true,
      };
    });

    it('renders the error alert panel', () => {
      renderView();
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent(/couldn't load registry data/i);
    });

    it('does NOT render the h1 heading when error=true', () => {
      renderView();
      // In error state the component returns early before the main layout
      expect(
        screen.queryByRole('heading', { level: 1 }),
      ).not.toBeInTheDocument();
    });

    it('does NOT render the KPI band when error=true', () => {
      renderView();
      expect(
        screen.queryByRole('region', { name: /key performance indicators/i }),
      ).not.toBeInTheDocument();
    });

    it('does NOT render the map panel when error=true', () => {
      renderView();
      expect(screen.queryByTestId('actor-map-stub')).not.toBeInTheDocument();
    });
  });

  // ── (d) Empty state ───────────────────────────────────────────────────────

  describe('(d) empty state', () => {
    beforeEach(() => {
      mockHookResult = {
        actors: [],
        total: 0,
        truncated: false,
        loading: false,
        error: false,
      };
    });

    it('renders the empty state message when actors is empty', () => {
      renderView();
      expect(
        screen.getByText(/no actors match these filters/i),
      ).toBeInTheDocument();
    });

    it('does NOT render the shortlist table when actors is empty', () => {
      renderView();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('renders the h1 heading even in empty state', () => {
      renderView();
      expect(
        screen.getByRole('heading', { level: 1, name: /seed discovery dashboard/i }),
      ).toBeInTheDocument();
    });

    it('renders the filter panel even in empty state', () => {
      renderView();
      expect(
        screen.getByRole('group', { name: /filter dashboard actors/i }),
      ).toBeInTheDocument();
    });

    it('renders the KPI band even in empty state', () => {
      renderView();
      expect(
        screen.getByRole('region', { name: /key performance indicators/i }),
      ).toBeInTheDocument();
    });

    it('renders the map panel even in empty state', () => {
      renderView();
      expect(screen.getByTestId('actor-map-stub')).toBeInTheDocument();
    });
  });

  // ── Filter onChange — router.replace is called with encoded params ─────────

  describe('filter change behaviour', () => {
    it('calls router.replace with encoded filter params on filter change', () => {
      renderView();

      // Locate the crop select and change it — DashboardFilters renders
      // a <select> with aria-label "Filter by crop".
      const cropSelect = screen.getByRole('combobox', { name: /filter by crop/i });
      fireEvent.change(cropSelect, { target: { value: 'sorghum' } });

      // router.replace must have been called with a URL beginning with "?"
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringMatching(/^\?/),
        { scroll: false },
      );
    });
  });
});
