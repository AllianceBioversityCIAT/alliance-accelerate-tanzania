/**
 * Unit tests for the three T-8 discovery charts:
 *   - CapacityByRegionChart
 *   - CropDistributionChart
 *   - ActorTypeChart
 *
 * Strategy: Recharts' ResponsiveContainer renders with 0×0 dimensions in jsdom
 * so Recharts SVG bars never appear. We assert through ChartCard's guaranteed
 * DOM output instead:
 *   (a) The chart title renders.
 *   (b) The <details> data-table contains the friendly-mapped labels + values.
 *   (c) Empty data → ChartCard's empty state ("No data for this filter") shows.
 *   (d) Renders without throwing for both populated and empty data.
 *
 * Traces: FR-5, FR-6, NFR-4, NFR-5, design.md §5.4.
 * Spec: docs/specs/dashboard/discovery-dashboard.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import CapacityByRegionChart from './CapacityByRegionChart';
import CropDistributionChart from './CropDistributionChart';
import ActorTypeChart from './ActorTypeChart';

// ---------------------------------------------------------------------------
// Mock: ResponsiveContainer → fixed-size div so children render in jsdom.
// This silences the "width/height=0" console noise without hiding ChartCard.
// ---------------------------------------------------------------------------

jest.mock('recharts', () => {
  const actual = jest.requireActual<typeof import('recharts')>('recharts');
  const MockResponsiveContainer = ({
    children,
  }: {
    children: React.ReactElement;
  }) => <div data-testid="responsive-container" style={{ width: 400, height: 300 }}>{children}</div>;
  MockResponsiveContainer.displayName = 'MockResponsiveContainer';
  return { ...actual, ResponsiveContainer: MockResponsiveContainer };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REGION_DATA = [
  { label: 'Dodoma',  value: 500 },
  { label: 'Arusha',  value: 320 },
  { label: 'Mwanza',  value: 180 },
];

const CROP_DATA = [
  { label: 'sorghum',     value: 42 },
  { label: 'common_bean', value: 31 },
  { label: 'groundnut',   value: 18 },
];

const TYPE_DATA = [
  { label: 'seed_company',       value: 20 },
  { label: 'cooperative',        value: 15 },
  { label: 'ngo',                value: 7  },
  { label: 'offtaker',           value: 5  },
  { label: 'research_institute', value: 3  },
  { label: 'informal_trader',    value: 2  },
];

// ============================================================================
// CapacityByRegionChart
// ============================================================================

describe('CapacityByRegionChart', () => {
  describe('(a) title renders', () => {
    it('renders the chart title', () => {
      render(<CapacityByRegionChart data={REGION_DATA} />);
      expect(screen.getByText('Capacity by region (t)')).toBeInTheDocument();
    });
  });

  describe('(b) data-table contains correct labels and values', () => {
    it('shows all region labels in the data table', () => {
      render(<CapacityByRegionChart data={REGION_DATA} />);
      expect(screen.getByText('Dodoma')).toBeInTheDocument();
      expect(screen.getByText('Arusha')).toBeInTheDocument();
      expect(screen.getByText('Mwanza')).toBeInTheDocument();
    });

    it('shows all capacity values in the data table', () => {
      render(<CapacityByRegionChart data={REGION_DATA} />);
      expect(screen.getByText('500')).toBeInTheDocument();
      expect(screen.getByText('320')).toBeInTheDocument();
      expect(screen.getByText('180')).toBeInTheDocument();
    });

    it('renders a <details> data-table element when data is non-empty', () => {
      const { container } = render(<CapacityByRegionChart data={REGION_DATA} />);
      expect(container.querySelector('details')).toBeInTheDocument();
    });

    it('renders one tbody row per data point', () => {
      const { container } = render(<CapacityByRegionChart data={REGION_DATA} />);
      const rows = container.querySelectorAll('tbody tr');
      expect(rows).toHaveLength(REGION_DATA.length);
    });
  });

  describe('(c) empty data → empty state', () => {
    it('shows the ChartCard empty-state message', () => {
      render(<CapacityByRegionChart data={[]} />);
      expect(screen.getByText('No data for this filter')).toBeInTheDocument();
    });

    it('does not render a data table when data is empty', () => {
      const { container } = render(<CapacityByRegionChart data={[]} />);
      expect(container.querySelector('details')).not.toBeInTheDocument();
    });
  });

  describe('(d) no throw', () => {
    it('renders without throwing for populated data', () => {
      expect(() => render(<CapacityByRegionChart data={REGION_DATA} />)).not.toThrow();
    });

    it('renders without throwing for empty data', () => {
      expect(() => render(<CapacityByRegionChart data={[]} />)).not.toThrow();
    });
  });
});

// ============================================================================
// CropDistributionChart
// ============================================================================

describe('CropDistributionChart', () => {
  describe('(a) title renders', () => {
    it('renders the chart title', () => {
      render(<CropDistributionChart data={CROP_DATA} />);
      expect(screen.getByText('Actors by crop')).toBeInTheDocument();
    });
  });

  describe('(b) data-table contains friendly crop names and values', () => {
    it('maps sorghum slug to "Sorghum" in the data table', () => {
      render(<CropDistributionChart data={CROP_DATA} />);
      expect(screen.getByText('Sorghum')).toBeInTheDocument();
    });

    it('maps common_bean slug to "Common Bean" in the data table', () => {
      render(<CropDistributionChart data={CROP_DATA} />);
      expect(screen.getByText('Common Bean')).toBeInTheDocument();
    });

    it('maps groundnut slug to "Groundnut" in the data table', () => {
      render(<CropDistributionChart data={CROP_DATA} />);
      expect(screen.getByText('Groundnut')).toBeInTheDocument();
    });

    it('shows correct actor count values', () => {
      render(<CropDistributionChart data={CROP_DATA} />);
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('31')).toBeInTheDocument();
      expect(screen.getByText('18')).toBeInTheDocument();
    });

    it('renders a <details> data-table element when data is non-empty', () => {
      const { container } = render(<CropDistributionChart data={CROP_DATA} />);
      expect(container.querySelector('details')).toBeInTheDocument();
    });

    it('renders one tbody row per data point', () => {
      const { container } = render(<CropDistributionChart data={CROP_DATA} />);
      const rows = container.querySelectorAll('tbody tr');
      expect(rows).toHaveLength(CROP_DATA.length);
    });
  });

  describe('(c) empty data → empty state', () => {
    it('shows the ChartCard empty-state message', () => {
      render(<CropDistributionChart data={[]} />);
      expect(screen.getByText('No data for this filter')).toBeInTheDocument();
    });

    it('does not render a data table when data is empty', () => {
      const { container } = render(<CropDistributionChart data={[]} />);
      expect(container.querySelector('details')).not.toBeInTheDocument();
    });
  });

  describe('(d) no throw', () => {
    it('renders without throwing for populated data', () => {
      expect(() => render(<CropDistributionChart data={CROP_DATA} />)).not.toThrow();
    });

    it('renders without throwing for empty data', () => {
      expect(() => render(<CropDistributionChart data={[]} />)).not.toThrow();
    });

    it('falls back to raw slug label for unknown crop slugs', () => {
      const unknown = [{ label: 'cassava', value: 5 }];
      expect(() => render(<CropDistributionChart data={unknown} />)).not.toThrow();
      expect(screen.getByText('cassava')).toBeInTheDocument();
    });
  });
});

// ============================================================================
// ActorTypeChart
// ============================================================================

describe('ActorTypeChart', () => {
  describe('(a) title renders', () => {
    it('renders the chart title', () => {
      render(<ActorTypeChart data={TYPE_DATA} />);
      expect(screen.getByText('Actors by type')).toBeInTheDocument();
    });
  });

  describe('(b) data-table contains friendly role labels and values', () => {
    it('maps seed_company to "Seed Company"', () => {
      render(<ActorTypeChart data={TYPE_DATA} />);
      expect(screen.getByText('Seed Company')).toBeInTheDocument();
    });

    it('maps cooperative to "Cooperative"', () => {
      render(<ActorTypeChart data={TYPE_DATA} />);
      expect(screen.getByText('Cooperative')).toBeInTheDocument();
    });

    it('maps ngo to "NGO"', () => {
      render(<ActorTypeChart data={TYPE_DATA} />);
      expect(screen.getByText('NGO')).toBeInTheDocument();
    });

    it('maps offtaker to "Offtaker"', () => {
      render(<ActorTypeChart data={TYPE_DATA} />);
      expect(screen.getByText('Offtaker')).toBeInTheDocument();
    });

    it('maps research_institute to "Research Institute"', () => {
      render(<ActorTypeChart data={TYPE_DATA} />);
      expect(screen.getByText('Research Institute')).toBeInTheDocument();
    });

    it('maps informal_trader to "Informal Trader"', () => {
      render(<ActorTypeChart data={TYPE_DATA} />);
      expect(screen.getByText('Informal Trader')).toBeInTheDocument();
    });

    it('shows correct actor count values', () => {
      render(<ActorTypeChart data={TYPE_DATA} />);
      expect(screen.getByText('20')).toBeInTheDocument();
      expect(screen.getByText('15')).toBeInTheDocument();
      expect(screen.getByText('7')).toBeInTheDocument();
    });

    it('renders a <details> data-table element when data is non-empty', () => {
      const { container } = render(<ActorTypeChart data={TYPE_DATA} />);
      expect(container.querySelector('details')).toBeInTheDocument();
    });

    it('renders one tbody row per data point', () => {
      const { container } = render(<ActorTypeChart data={TYPE_DATA} />);
      const rows = container.querySelectorAll('tbody tr');
      expect(rows).toHaveLength(TYPE_DATA.length);
    });
  });

  describe('(c) empty data → empty state', () => {
    it('shows the ChartCard empty-state message', () => {
      render(<ActorTypeChart data={[]} />);
      expect(screen.getByText('No data for this filter')).toBeInTheDocument();
    });

    it('does not render a data table when data is empty', () => {
      const { container } = render(<ActorTypeChart data={[]} />);
      expect(container.querySelector('details')).not.toBeInTheDocument();
    });
  });

  describe('(d) no throw', () => {
    it('renders without throwing for populated data', () => {
      expect(() => render(<ActorTypeChart data={TYPE_DATA} />)).not.toThrow();
    });

    it('renders without throwing for empty data', () => {
      expect(() => render(<ActorTypeChart data={[]} />)).not.toThrow();
    });

    it('falls back to raw slug when traderType is not in ROLES', () => {
      const unknown = [{ label: 'unknown_type', value: 3 }];
      expect(() => render(<ActorTypeChart data={unknown} />)).not.toThrow();
      // roleLabel falls back to the raw type string
      expect(screen.getByText('unknown_type')).toBeInTheDocument();
    });
  });
});
