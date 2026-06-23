/**
 * Unit tests for MapLegend — T-3, FR-2, FR-6, NFR-4.
 *
 * Filter: `MapLegend` (matched via filename).
 *
 * Covers:
 *   (a) all 6 role labels render (one swatch+label per traderType)
 *   (b) the static "Privacy zone — no consent" item renders (FR-6)
 *
 * No Leaflet is rendered — MapLegend is a pure React component.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import MapLegend from './MapLegend';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MapLegend', () => {
  // ── (a) All 6 role labels ──────────────────────────────────────────────────

  it('renders a label for each of the 6 actor roles', () => {
    render(<MapLegend />);

    // Labels from ROLES (roles.ts) — one per traderType.
    expect(screen.getByText('Seed Company')).toBeInTheDocument();
    expect(screen.getByText('Cooperative')).toBeInTheDocument();
    expect(screen.getByText('NGO')).toBeInTheDocument();
    expect(screen.getByText('Offtaker')).toBeInTheDocument();
    expect(screen.getByText('Research Institute')).toBeInTheDocument();
    expect(screen.getByText('Informal Trader')).toBeInTheDocument();
  });

  // ── (b) Privacy-zone item (FR-6) ──────────────────────────────────────────

  it('renders the static "Privacy zone — no consent" item (FR-6)', () => {
    render(<MapLegend />);

    // FR-6: static copy conveying non-consented actors are not plotted.
    expect(
      screen.getByText(/privacy zone\s*—\s*no consent/i),
    ).toBeInTheDocument();
  });
});
