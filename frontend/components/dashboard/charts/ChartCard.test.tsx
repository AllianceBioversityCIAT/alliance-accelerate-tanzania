/**
 * Unit tests for ChartCard (FR-5, FR-6, NFR-4, design.md §5.4).
 *
 * Covers:
 *   (a) renders the title as an accessible figure with correct aria-label
 *   (b) non-empty series → data-table with a row per point + <details> present
 *   (c) empty series → empty-state text shown, chart children NOT rendered
 *   (d) renders without crashing when matchMedia is undefined
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import ChartCard, { type ChartSeriesPoint } from './ChartCard';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SERIES: ChartSeriesPoint[] = [
  { label: 'Dodoma',   value: 120 },
  { label: 'Arusha',   value: 85  },
  { label: 'Mwanza',   value: 60  },
];

// ---------------------------------------------------------------------------
// (a) Accessible figure — title as aria-label
// ---------------------------------------------------------------------------

describe('ChartCard — accessible figure', () => {
  it('renders a <figure> element with role="figure" and the correct aria-label', () => {
    render(
      <ChartCard title="Actors by Region" series={SERIES}>
        <div>chart</div>
      </ChartCard>,
    );

    const figure = screen.getByRole('figure', { name: 'Actors by Region' });
    expect(figure).toBeInTheDocument();
  });

  it('renders the title as a visible heading inside the card', () => {
    render(
      <ChartCard title="Seed Volumes" series={SERIES}>
        <div>chart</div>
      </ChartCard>,
    );

    expect(screen.getByText('Seed Volumes')).toBeInTheDocument();
  });

  it('uses the provided valueHeader in the table column heading', () => {
    render(
      <ChartCard title="Chart" series={SERIES} valueHeader="Actor count">
        <div>chart</div>
      </ChartCard>,
    );

    expect(screen.getByText('Actor count')).toBeInTheDocument();
  });

  it('defaults the value column header to "Value" when valueHeader is omitted', () => {
    render(
      <ChartCard title="Chart" series={SERIES}>
        <div>chart</div>
      </ChartCard>,
    );

    expect(screen.getByText('Value')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// (b) Non-empty series — data table with a row per point + <details>
// ---------------------------------------------------------------------------

describe('ChartCard — non-empty series (FR-6)', () => {
  it('renders a <details> element containing the data table', () => {
    const { container } = render(
      <ChartCard title="Chart" series={SERIES}>
        <div>chart</div>
      </ChartCard>,
    );

    const details = container.querySelector('details');
    expect(details).toBeInTheDocument();
  });

  it('renders a <summary> with "Data table" text', () => {
    render(
      <ChartCard title="Chart" series={SERIES}>
        <div>chart</div>
      </ChartCard>,
    );

    expect(screen.getByText('Data table')).toBeInTheDocument();
  });

  it('renders the Category column header in the table', () => {
    render(
      <ChartCard title="Chart" series={SERIES}>
        <div>chart</div>
      </ChartCard>,
    );

    expect(screen.getByText('Category')).toBeInTheDocument();
  });

  it('renders one table row per series point with the correct label', () => {
    render(
      <ChartCard title="Chart" series={SERIES}>
        <div>chart</div>
      </ChartCard>,
    );

    expect(screen.getByText('Dodoma')).toBeInTheDocument();
    expect(screen.getByText('Arusha')).toBeInTheDocument();
    expect(screen.getByText('Mwanza')).toBeInTheDocument();
  });

  it('renders one table row per series point with the correct value', () => {
    render(
      <ChartCard title="Chart" series={SERIES}>
        <div>chart</div>
      </ChartCard>,
    );

    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
  });

  it('renders exactly the same number of data rows as series points', () => {
    const { container } = render(
      <ChartCard title="Chart" series={SERIES}>
        <div>chart</div>
      </ChartCard>,
    );

    // tbody rows only (excludes the thead row)
    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(SERIES.length);
  });

  it('renders the chart children when series is non-empty', () => {
    render(
      <ChartCard title="Chart" series={SERIES}>
        <div data-testid="chart-child">chart content</div>
      </ChartCard>,
    );

    expect(screen.getByTestId('chart-child')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// (c) Empty series — empty state shown, chart children NOT rendered (FR-5)
// ---------------------------------------------------------------------------

describe('ChartCard — empty series (FR-5)', () => {
  it('renders the empty-state message when series is an empty array', () => {
    render(
      <ChartCard title="Chart" series={[]}>
        <div data-testid="chart-child">chart content</div>
      </ChartCard>,
    );

    expect(screen.getByText('No data for this filter')).toBeInTheDocument();
  });

  it('does NOT render the chart children when series is empty', () => {
    render(
      <ChartCard title="Chart" series={[]}>
        <div data-testid="chart-child">chart content</div>
      </ChartCard>,
    );

    expect(screen.queryByTestId('chart-child')).not.toBeInTheDocument();
  });

  it('does NOT render a data table or <details> when series is empty', () => {
    const { container } = render(
      <ChartCard title="Chart" series={[]}>
        <div>chart</div>
      </ChartCard>,
    );

    expect(container.querySelector('details')).not.toBeInTheDocument();
    expect(container.querySelector('table')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// (d) Renders without crashing when matchMedia is undefined (SSR/jsdom guard)
// ---------------------------------------------------------------------------

describe('ChartCard — matchMedia undefined guard (NFR-4)', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    // Simulate an environment where matchMedia is not available.
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('renders without crashing when window.matchMedia is undefined', () => {
    expect(() =>
      render(
        <ChartCard title="No matchMedia" series={SERIES}>
          <div>chart</div>
        </ChartCard>,
      ),
    ).not.toThrow();
  });

  it('still renders the title and data table when matchMedia is undefined', () => {
    render(
      <ChartCard title="Robust Chart" series={SERIES}>
        <div>chart</div>
      </ChartCard>,
    );

    expect(screen.getByText('Robust Chart')).toBeInTheDocument();
    expect(screen.getByText('Dodoma')).toBeInTheDocument();
  });
});
