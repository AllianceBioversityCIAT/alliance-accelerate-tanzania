/**
 * Unit tests for lib/dashboard/aggregate.ts
 *
 * Covers FR-4, FR-5, OQ-3:
 *  (a) empty input → zeros + empty arrays, no throw
 *  (b) null capacityTons excluded from sum/median but counted in matchingCount & byType
 *  (c) capacityReportingCount reflects only reporting actors
 *  (d) median for odd and even reporting sets
 *  (e) distinct regionsCovered / actorTypes
 *  (f) byCrop counts an actor under each of its crops (multi-crop actor)
 */

import { aggregate } from './aggregate';
import type { PublicActor } from '@/lib/api/actors';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeActor(overrides: Partial<PublicActor> & Pick<PublicActor, 'id'>): PublicActor {
  return {
    traderName: `Actor ${overrides.id}`,
    region: 'Dodoma',
    traderType: 'cooperative',
    crops: ['sorghum'],
    capacityTons: null,
    ...overrides,
  };
}

// ── (a) Empty input ───────────────────────────────────────────────────────────

describe('aggregate — empty input', () => {
  it('returns all-zero KPIs and empty series without throwing', () => {
    const result = aggregate([]);
    expect(result.kpis.matchingCount).toBe(0);
    expect(result.kpis.totalCapacityTons).toBe(0);
    expect(result.kpis.medianCapacityTons).toBe(0);
    expect(result.kpis.capacityReportingCount).toBe(0);
    expect(result.kpis.regionsCovered).toBe(0);
    expect(result.kpis.actorTypes).toBe(0);
    expect(result.capacityByRegion).toEqual([]);
    expect(result.byCrop).toEqual([]);
    expect(result.byType).toEqual([]);
  });
});

// ── (b) null / undefined capacityTons exclusion ──────────────────────────────

describe('aggregate — null capacityTons handling', () => {
  const actors: PublicActor[] = [
    makeActor({ id: '1', capacityTons: null,      traderType: 'ngo'            }),
    makeActor({ id: '2', capacityTons: undefined,  traderType: 'cooperative'   }),
    makeActor({ id: '3', capacityTons: 100,        traderType: 'seed_company'  }),
  ];

  it('matchingCount includes actors with null capacity', () => {
    expect(aggregate(actors).kpis.matchingCount).toBe(3);
  });

  it('totalCapacityTons sums only the reporting actor', () => {
    expect(aggregate(actors).kpis.totalCapacityTons).toBe(100);
  });

  it('medianCapacityTons uses only the reporting actor', () => {
    expect(aggregate(actors).kpis.medianCapacityTons).toBe(100);
  });

  it('byType includes all three actors regardless of capacity', () => {
    const result = aggregate(actors);
    const total = result.byType.reduce((s, p) => s + p.value, 0);
    expect(total).toBe(3);
  });

  it('capacityByRegion has no entry for actors without capacity', () => {
    // All actors share the same region; only 1 is reporting
    const result = aggregate(actors);
    const regionEntry = result.capacityByRegion.find((p) => p.label === 'Dodoma');
    expect(regionEntry?.value).toBe(100);
  });
});

// ── (c) capacityReportingCount ────────────────────────────────────────────────

describe('aggregate — capacityReportingCount', () => {
  it('counts only actors with non-null finite capacityTons', () => {
    const actors: PublicActor[] = [
      makeActor({ id: '1', capacityTons: 50    }),
      makeActor({ id: '2', capacityTons: null  }),
      makeActor({ id: '3', capacityTons: 200   }),
      makeActor({ id: '4', capacityTons: NaN   }),   // non-finite — excluded
      makeActor({ id: '5', capacityTons: Infinity }), // non-finite — excluded
    ];
    expect(aggregate(actors).kpis.capacityReportingCount).toBe(2);
  });
});

// ── (d) Median — odd and even sets ──────────────────────────────────────────

describe('aggregate — medianCapacityTons', () => {
  it('returns the middle value for an odd-length reporting set', () => {
    // sorted: [10, 30, 50] → median = 30
    const actors: PublicActor[] = [
      makeActor({ id: '1', capacityTons: 50 }),
      makeActor({ id: '2', capacityTons: 10 }),
      makeActor({ id: '3', capacityTons: 30 }),
    ];
    expect(aggregate(actors).kpis.medianCapacityTons).toBe(30);
  });

  it('returns the average of the two middle values for an even-length reporting set', () => {
    // sorted: [10, 20, 30, 40] → median = (20+30)/2 = 25
    const actors: PublicActor[] = [
      makeActor({ id: '1', capacityTons: 40 }),
      makeActor({ id: '2', capacityTons: 10 }),
      makeActor({ id: '3', capacityTons: 20 }),
      makeActor({ id: '4', capacityTons: 30 }),
    ];
    expect(aggregate(actors).kpis.medianCapacityTons).toBe(25);
  });

  it('returns 0 when no actor reports capacity', () => {
    const actors: PublicActor[] = [
      makeActor({ id: '1', capacityTons: null }),
      makeActor({ id: '2', capacityTons: null }),
    ];
    expect(aggregate(actors).kpis.medianCapacityTons).toBe(0);
  });
});

// ── (e) Distinct regionsCovered and actorTypes ───────────────────────────────

describe('aggregate — regionsCovered and actorTypes', () => {
  it('counts distinct regions across all actors', () => {
    const actors: PublicActor[] = [
      makeActor({ id: '1', region: 'Dodoma'   }),
      makeActor({ id: '2', region: 'Arusha'   }),
      makeActor({ id: '3', region: 'Dodoma'   }),  // duplicate
      makeActor({ id: '4', region: 'Mwanza'   }),
    ];
    expect(aggregate(actors).kpis.regionsCovered).toBe(3);
  });

  it('counts distinct traderTypes across all actors', () => {
    const actors: PublicActor[] = [
      makeActor({ id: '1', traderType: 'cooperative'        }),
      makeActor({ id: '2', traderType: 'ngo'                }),
      makeActor({ id: '3', traderType: 'cooperative'        }),  // duplicate
      makeActor({ id: '4', traderType: 'seed_company'       }),
    ];
    expect(aggregate(actors).kpis.actorTypes).toBe(3);
  });
});

// ── (f) byCrop — multi-crop actor ────────────────────────────────────────────

describe('aggregate — byCrop multi-crop counting', () => {
  it('counts an actor under each of its crops', () => {
    const actors: PublicActor[] = [
      makeActor({ id: '1', crops: ['sorghum', 'common_bean', 'groundnut'] }),
      makeActor({ id: '2', crops: ['sorghum', 'groundnut']                }),
      makeActor({ id: '3', crops: ['common_bean']                         }),
    ];
    const { byCrop } = aggregate(actors);

    const get = (label: string) => byCrop.find((p) => p.label === label)?.value ?? 0;
    expect(get('sorghum')).toBe(2);
    expect(get('common_bean')).toBe(2);
    expect(get('groundnut')).toBe(2);
  });

  it('includes only crops that actually occur', () => {
    const actors: PublicActor[] = [
      makeActor({ id: '1', crops: ['sorghum'] }),
    ];
    const { byCrop } = aggregate(actors);
    expect(byCrop.map((p) => p.label)).toEqual(['sorghum']);
  });

  it('sorts byCrop descending by value', () => {
    const actors: PublicActor[] = [
      makeActor({ id: '1', crops: ['groundnut']                }),
      makeActor({ id: '2', crops: ['sorghum', 'groundnut']    }),
      makeActor({ id: '3', crops: ['sorghum', 'groundnut']    }),
      makeActor({ id: '4', crops: ['common_bean']             }),
    ];
    // groundnut:3, sorghum:2, common_bean:1
    const { byCrop } = aggregate(actors);
    expect(byCrop[0].label).toBe('groundnut');
    expect(byCrop[0].value).toBe(3);
    expect(byCrop[1].label).toBe('sorghum');
    expect(byCrop[2].label).toBe('common_bean');
  });
});

// ── byType sort order ─────────────────────────────────────────────────────────

describe('aggregate — byType sort order', () => {
  it('sorts byType descending by count', () => {
    const actors: PublicActor[] = [
      makeActor({ id: '1', traderType: 'ngo'           }),
      makeActor({ id: '2', traderType: 'cooperative'   }),
      makeActor({ id: '3', traderType: 'cooperative'   }),
      makeActor({ id: '4', traderType: 'ngo'           }),
      makeActor({ id: '5', traderType: 'seed_company'  }),
    ];
    const { byType } = aggregate(actors);
    // cooperative:2, ngo:2, seed_company:1 (stable desc)
    expect(byType[byType.length - 1].label).toBe('seed_company');
    expect(byType[byType.length - 1].value).toBe(1);
  });
});

// ── capacityByRegion sort and aggregation ─────────────────────────────────────

describe('aggregate — capacityByRegion', () => {
  it('sums capacity per region for reporting actors only', () => {
    const actors: PublicActor[] = [
      makeActor({ id: '1', region: 'Dodoma', capacityTons: 100 }),
      makeActor({ id: '2', region: 'Dodoma', capacityTons: 50  }),
      makeActor({ id: '3', region: 'Arusha', capacityTons: 200 }),
      makeActor({ id: '4', region: 'Dodoma', capacityTons: null }),  // excluded
    ];
    const { capacityByRegion } = aggregate(actors);
    expect(capacityByRegion[0]).toEqual({ label: 'Arusha', value: 200 });
    expect(capacityByRegion[1]).toEqual({ label: 'Dodoma', value: 150 });
  });

  it('excludes regions that have no reporting actors', () => {
    const actors: PublicActor[] = [
      makeActor({ id: '1', region: 'Dodoma', capacityTons: null }),
      makeActor({ id: '2', region: 'Arusha', capacityTons: 75  }),
    ];
    const { capacityByRegion } = aggregate(actors);
    expect(capacityByRegion).toHaveLength(1);
    expect(capacityByRegion[0].label).toBe('Arusha');
  });
});
