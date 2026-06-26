/**
 * Unit tests for lib/dashboard/csv.ts — T-12, FR-9, NFR-1.
 * Spec: dashboard/discovery-dashboard.
 *
 * Covers:
 *   (a) Public columns appear in the header and a sample actor's values appear in the data rows.
 *   (b) Output NEVER contains "phone" or "email" — even when the actor object
 *       carries stray extra keys (cast to unknown), the allowlist ensures they
 *       are not serialised.
 *   (c) CSV escaping: fields containing commas, double-quotes, and newlines are
 *       correctly quoted and double-quote characters are doubled.
 *   (d) KPI summary values appear in the output.
 */

import { buildDashboardCsv } from './csv';
import type { PublicActor } from '@/lib/api/actors';
import type { DashboardKpis } from '@/lib/dashboard/aggregate';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeActor(overrides: Partial<PublicActor> = {}): PublicActor {
  return {
    id: 'actor-1',
    traderName: 'Kilimo Seeds Ltd',
    region: 'Dodoma',
    district: 'Kondoa',
    traderType: 'seed_company',
    capacityTons: 200,
    crops: ['sorghum', 'common_bean'],
    gps: null,
    ...overrides,
  };
}

const BASE_KPIS: DashboardKpis = {
  matchingCount: 5,
  totalCapacityTons: 1000,
  medianCapacityTons: 200,
  capacityReportingCount: 4,
  regionsCovered: 3,
  actorTypes: 2,
};

// ── (a) Public columns and actor values ──────────────────────────────────────

describe('buildDashboardCsv — public columns and actor values', () => {
  it('includes all allowlisted column headers in the output', () => {
    const csv = buildDashboardCsv({ actors: [makeActor()], kpis: BASE_KPIS });
    expect(csv).toContain('traderName');
    expect(csv).toContain('region');
    expect(csv).toContain('district');
    expect(csv).toContain('traderType');
    expect(csv).toContain('capacityTons');
    expect(csv).toContain('crops');
  });

  it('serialises the sample actor traderName in the data rows', () => {
    const actor = makeActor({ traderName: 'Alliance Agro' });
    const csv = buildDashboardCsv({ actors: [actor], kpis: BASE_KPIS });
    expect(csv).toContain('Alliance Agro');
  });

  it('serialises region and district values', () => {
    const actor = makeActor({ region: 'Mwanza', district: 'Sengerema' });
    const csv = buildDashboardCsv({ actors: [actor], kpis: BASE_KPIS });
    expect(csv).toContain('Mwanza');
    expect(csv).toContain('Sengerema');
  });

  it('serialises traderType value', () => {
    const actor = makeActor({ traderType: 'cooperative' });
    const csv = buildDashboardCsv({ actors: [actor], kpis: BASE_KPIS });
    expect(csv).toContain('cooperative');
  });

  it('serialises capacityTons as a number string', () => {
    const actor = makeActor({ capacityTons: 350 });
    const csv = buildDashboardCsv({ actors: [actor], kpis: BASE_KPIS });
    expect(csv).toContain('350');
  });

  it('serialises crops joined by semicolons', () => {
    const actor = makeActor({ crops: ['sorghum', 'groundnut'] });
    const csv = buildDashboardCsv({ actors: [actor], kpis: BASE_KPIS });
    expect(csv).toContain('sorghum;groundnut');
  });

  it('renders an empty string for null district', () => {
    const actor = makeActor({ district: null });
    const csv = buildDashboardCsv({ actors: [actor], kpis: BASE_KPIS });
    // The district column field should be empty — we look for consecutive commas
    // in the data row after region, indicating an empty district cell.
    const lines = csv.split('\n');
    const dataLine = lines.find((l) => l.includes(actor.traderName));
    expect(dataLine).toBeDefined();
    // district is the third column; consecutive commas around it means it's empty.
    expect(dataLine).toMatch(/[^,]+,[^,]+,,/);
  });

  it('renders an empty string for null/undefined capacityTons', () => {
    const actor = makeActor({ capacityTons: null });
    const csv = buildDashboardCsv({ actors: [actor], kpis: BASE_KPIS });
    const lines = csv.split('\n');
    const dataLine = lines.find((l) => l.includes(actor.traderName));
    // capacityTons is 5th column — not present as a number, present as empty string
    expect(dataLine).toBeDefined();
    expect(dataLine).toMatch(/,,/); // at least one empty field
  });

  it('produces multiple data rows when multiple actors are supplied', () => {
    const actors = [
      makeActor({ id: '1', traderName: 'Actor A' }),
      makeActor({ id: '2', traderName: 'Actor B' }),
      makeActor({ id: '3', traderName: 'Actor C' }),
    ];
    const csv = buildDashboardCsv({ actors, kpis: BASE_KPIS });
    expect(csv).toContain('Actor A');
    expect(csv).toContain('Actor B');
    expect(csv).toContain('Actor C');
  });

  it('produces only the header row (no data rows) when actors is empty', () => {
    const csv = buildDashboardCsv({ actors: [], kpis: BASE_KPIS });
    // Header still present
    expect(csv).toContain('traderName');
    // No extra lines beyond summary + blank + header
    const headerIndex = csv.split('\n').findIndex((l) => l.startsWith('traderName'));
    const linesAfterHeader = csv.split('\n').slice(headerIndex + 1).filter((l) => l !== '');
    expect(linesAfterHeader).toHaveLength(0);
  });

  it('does NOT include the actor id in the output', () => {
    const actor = makeActor({ id: 'unique-sentinel-id-xyz' });
    const csv = buildDashboardCsv({ actors: [actor], kpis: BASE_KPIS });
    expect(csv).not.toContain('unique-sentinel-id-xyz');
  });

  it('does NOT include GPS coordinates in the output', () => {
    const actor = makeActor({ gps: { lat: -6.17221, long: 35.73947 } });
    const csv = buildDashboardCsv({ actors: [actor], kpis: BASE_KPIS });
    expect(csv).not.toContain('-6.17221');
    expect(csv).not.toContain('35.73947');
    expect(csv).not.toContain('lat');
    expect(csv).not.toContain('long');
  });
});

// ── (b) PII gate — phone / email must NEVER appear ───────────────────────────

describe('buildDashboardCsv — PII gate (NFR-1)', () => {
  it('does not contain the word "phone" in any case', () => {
    const csv = buildDashboardCsv({ actors: [makeActor()], kpis: BASE_KPIS });
    expect(csv.toLowerCase()).not.toContain('phone');
  });

  it('does not contain the word "email" in any case', () => {
    const csv = buildDashboardCsv({ actors: [makeActor()], kpis: BASE_KPIS });
    expect(csv.toLowerCase()).not.toContain('email');
  });

  it('does not serialise stray phone/email keys even if cast onto an actor object', () => {
    // Cast a "poisoned" object — the allowlist must ignore extra keys entirely.
    const poisonedActor = {
      ...makeActor(),
      phone: '+255712345678',
      email: 'actor@example.com',
    } as unknown as PublicActor;

    const csv = buildDashboardCsv({ actors: [poisonedActor], kpis: BASE_KPIS });

    // The sentinel values must not appear anywhere in the output.
    expect(csv).not.toContain('+255712345678');
    expect(csv).not.toContain('actor@example.com');
    // Nor the key names.
    expect(csv.toLowerCase()).not.toContain('phone');
    expect(csv.toLowerCase()).not.toContain('email');
  });

  it('does not serialise stray phone/email keys across multiple poisoned actors', () => {
    const actors = Array.from({ length: 5 }, (_, i) => ({
      ...makeActor({ id: `actor-${i}`, traderName: `Actor ${i}` }),
      phone: `+25571234567${i}`,
      email: `actor${i}@example.com`,
    } as unknown as PublicActor));

    const csv = buildDashboardCsv({ actors, kpis: BASE_KPIS });
    expect(csv.toLowerCase()).not.toContain('phone');
    expect(csv.toLowerCase()).not.toContain('email');
    actors.forEach((_, i) => {
      expect(csv).not.toContain(`+25571234567${i}`);
      expect(csv).not.toContain(`actor${i}@example.com`);
    });
  });
});

// ── (c) CSV escaping ─────────────────────────────────────────────────────────

describe('buildDashboardCsv — CSV escaping', () => {
  it('wraps a field in double-quotes when it contains a comma', () => {
    const actor = makeActor({ traderName: 'Seeds, Cooperative' });
    const csv = buildDashboardCsv({ actors: [actor], kpis: BASE_KPIS });
    // The field must be quoted
    expect(csv).toContain('"Seeds, Cooperative"');
  });

  it('doubles internal double-quotes and wraps the field', () => {
    const actor = makeActor({ traderName: 'Alliance "Seeds" Ltd' });
    const csv = buildDashboardCsv({ actors: [actor], kpis: BASE_KPIS });
    // RFC 4180: inner " → ""
    expect(csv).toContain('"Alliance ""Seeds"" Ltd"');
  });

  it('wraps a field that contains a newline character', () => {
    const actor = makeActor({ traderName: 'Agro\nCoop' });
    const csv = buildDashboardCsv({ actors: [actor], kpis: BASE_KPIS });
    expect(csv).toContain('"Agro\nCoop"');
  });

  it('wraps a field that contains a carriage return', () => {
    const actor = makeActor({ traderName: 'Agro\rCoop' });
    const csv = buildDashboardCsv({ actors: [actor], kpis: BASE_KPIS });
    expect(csv).toContain('"Agro\rCoop"');
  });

  it('does NOT wrap a plain field that needs no escaping', () => {
    const actor = makeActor({ traderName: 'SimpleName' });
    const csv = buildDashboardCsv({ actors: [actor], kpis: BASE_KPIS });
    // The field should appear without surrounding quotes
    expect(csv).toContain('SimpleName');
    expect(csv).not.toContain('"SimpleName"');
  });
});

// ── (d) KPI summary values appear in the output ──────────────────────────────

describe('buildDashboardCsv — KPI summary block', () => {
  it('includes the matchingCount value in the summary', () => {
    const kpis: DashboardKpis = { ...BASE_KPIS, matchingCount: 42 };
    const csv = buildDashboardCsv({ actors: [], kpis });
    expect(csv).toContain('42');
  });

  it('includes the totalCapacityTons value in the summary', () => {
    const kpis: DashboardKpis = { ...BASE_KPIS, totalCapacityTons: 7890 };
    const csv = buildDashboardCsv({ actors: [], kpis });
    expect(csv).toContain('7890');
  });

  it('includes the medianCapacityTons value in the summary', () => {
    const kpis: DashboardKpis = { ...BASE_KPIS, medianCapacityTons: 175 };
    const csv = buildDashboardCsv({ actors: [], kpis });
    expect(csv).toContain('175');
  });

  it('includes capacityReportingCount in the summary', () => {
    const kpis: DashboardKpis = { ...BASE_KPIS, capacityReportingCount: 9 };
    const csv = buildDashboardCsv({ actors: [], kpis });
    expect(csv).toContain('9');
  });

  it('includes regionsCovered in the summary', () => {
    const kpis: DashboardKpis = { ...BASE_KPIS, regionsCovered: 11 };
    const csv = buildDashboardCsv({ actors: [], kpis });
    expect(csv).toContain('11');
  });

  it('includes actorTypes in the summary', () => {
    const kpis: DashboardKpis = { ...BASE_KPIS, actorTypes: 6 };
    const csv = buildDashboardCsv({ actors: [], kpis });
    expect(csv).toContain('6');
  });

  it('summary rows appear BEFORE the column header row', () => {
    const csv = buildDashboardCsv({ actors: [makeActor()], kpis: BASE_KPIS });
    const lines = csv.split('\n');
    const summaryIdx = lines.findIndex((l) => l.startsWith('#'));
    const headerIdx = lines.findIndex((l) => l.startsWith('traderName'));
    expect(summaryIdx).toBeGreaterThanOrEqual(0);
    expect(headerIdx).toBeGreaterThan(summaryIdx);
  });

  it('a blank line separates the summary block from the column header', () => {
    const csv = buildDashboardCsv({ actors: [makeActor()], kpis: BASE_KPIS });
    const lines = csv.split('\n');
    const headerIdx = lines.findIndex((l) => l.startsWith('traderName'));
    // The line immediately before the header must be blank
    expect(lines[headerIdx - 1]).toBe('');
  });
});
