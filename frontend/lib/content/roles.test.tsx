/**
 * Trader-taxonomy widening tests — FR-15, T-14, `design.md` §1.3/§5.7.
 *
 * Behavioral proof, not a presence assertion (KZ-002): `roles.ts` is one of
 * FOUR maps that must be total over the ten canonical trader types —
 * `ROLES` here, plus `ROLE_BG_CLASS`/`ROLE_CSS_VAR` in `RoleBadge.tsx` and
 * `TRADER_TYPES` in `MapLegend.tsx`. `ROLE_BG_CLASS` holds full literal
 * Tailwind class strings, so a missing entry there degrades *silently* to
 * `bg-muted` (a neutral grey) rather than a compile error (C-6) — a test
 * asserting only that `ROLES` has ten keys would pass while the map renders
 * four categories grey. This suite asserts totality on all four maps, and
 * proves `MapLegend`'s totality by rendering it and reading its output,
 * not by inspecting its source array.
 *
 * The canonical ten types are hand-mirrored (not imported) from
 * `backend/src/common/normalize.ts`'s `TRADER_TYPES` — `frontend/CLAUDE.md`
 * mandates hand-mirrored contract types; the frontend build cannot import
 * from the backend package.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ROLES } from './roles';
import { ROLE_BG_CLASS, ROLE_CSS_VAR } from '../../components/map/RoleBadge';
import MapLegend from '../../components/map/MapLegend';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CANONICAL_TRADER_TYPES = [
  'seed_company',
  'cooperative',
  'ngo',
  'offtaker',
  'research_institute',
  'informal_trader',
  'humanitarian',
  'digital_service_provider',
  'qds_producer',
  'bulk_buyer',
] as const;

// The four types chunk 1's FR-4 added — the ones this task widens onto.
const NEW_TRADER_TYPES = [
  'humanitarian',
  'digital_service_provider',
  'qds_producer',
  'bulk_buyer',
] as const;

const EXPECTED_LABELS: Record<(typeof CANONICAL_TRADER_TYPES)[number], string> = {
  seed_company: 'Seed Company',
  cooperative: 'Cooperative',
  ngo: 'NGO',
  offtaker: 'Offtaker',
  research_institute: 'Research Institute',
  informal_trader: 'Informal Trader',
  humanitarian: 'Humanitarian / INGO',
  digital_service_provider: 'Digital Service Provider',
  qds_producer: 'QDS Producer',
  bulk_buyer: 'Bulk Buyer',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('trader taxonomy — ten types across four files (FR-15)', () => {
  it('ROLES (roles.ts) is total over all ten types with human-readable labels, no raw snake_case fallback', () => {
    expect(Object.keys(ROLES).sort()).toEqual([...CANONICAL_TRADER_TYPES].sort());

    for (const type of CANONICAL_TRADER_TYPES) {
      const label = ROLES[type]?.label;
      expect(label).toBe(EXPECTED_LABELS[type]);
      expect(label).not.toBe(type); // not the raw snake_case key
    }
  });

  it('ROLE_BG_CLASS (RoleBadge.tsx) is total over all ten types with a real bg-* class, not the muted degrade', () => {
    expect(Object.keys(ROLE_BG_CLASS).sort()).toEqual([...CANONICAL_TRADER_TYPES].sort());

    for (const type of NEW_TRADER_TYPES) {
      expect(ROLE_BG_CLASS[type]).toBeDefined();
      expect(ROLE_BG_CLASS[type]).toMatch(/^bg-/);
      expect(ROLE_BG_CLASS[type]).not.toBe('bg-muted');
    }
  });

  it('ROLE_CSS_VAR (RoleBadge.tsx) is total over all ten types with a real token variable, not the muted degrade', () => {
    expect(Object.keys(ROLE_CSS_VAR).sort()).toEqual([...CANONICAL_TRADER_TYPES].sort());

    for (const type of NEW_TRADER_TYPES) {
      expect(ROLE_CSS_VAR[type]).toBeDefined();
      expect(ROLE_CSS_VAR[type]).not.toBe('--color-muted');
    }
  });

  it('MapLegend renders all ten labels (proves TRADER_TYPES in MapLegend.tsx is total, by rendered output)', () => {
    render(<MapLegend />);

    for (const type of CANONICAL_TRADER_TYPES) {
      expect(screen.getByText(EXPECTED_LABELS[type])).toBeInTheDocument();
    }
  });

  it('MapLegend swatches for the four new types are not the neutral-grey silent degrade (C-6)', () => {
    render(<MapLegend />);

    for (const type of NEW_TRADER_TYPES) {
      const labelNode = screen.getByText(EXPECTED_LABELS[type]);
      const item = labelNode.closest('li');
      const swatch = item?.querySelector('span[aria-hidden="true"]');
      expect(swatch).not.toBeNull();
      expect(swatch?.className ?? '').not.toMatch(/bg-muted/);
    }
  });
});
