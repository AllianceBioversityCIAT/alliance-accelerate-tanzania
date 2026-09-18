/**
 * Unit tests for lib/dashboard/csv.ts — T-12, FR-9, NFR-1; extended by T-16
 * for FR-7 (actors/public-profile-disclosure).
 *
 * Covers:
 *   (a) Public columns appear in the header and a sample actor's values appear in the data rows,
 *       including the FR-7-added `sex`/`otherCrops` columns.
 *   (b) Output NEVER contains "phone" or "email" — even when the actor object
 *       carries stray extra keys (cast to unknown), the allowlist ensures they
 *       are not serialised.
 *   (c) CSV escaping: fields containing commas, double-quotes, and newlines are
 *       correctly quoted and double-quote characters are doubled.
 *   (d) KPI summary values appear in the output.
 *   (e) Registration source / consent provenance never appears (FR-7, prior spec).
 *   (f) Contact block (contactPerson/position/phone/email/marketLocation) never
 *       appears, named explicitly — a *second* guard behind the type system,
 *       since `PublicActor` has no contact fields at all (design.md D-1b/RV-4).
 *   (g) Filtered-set fidelity — the CSV carries only the actors it is given,
 *       no more and no less (design.md D-15).
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
    sex: null,
    otherCrops: null,
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

  it('includes sex and otherCrops column headers in the output (FR-7)', () => {
    const csv = buildDashboardCsv({ actors: [makeActor()], kpis: BASE_KPIS });
    expect(csv).toContain('sex');
    expect(csv).toContain('otherCrops');
  });

  it('serialises sex and otherCrops values from the actor (FR-7)', () => {
    const actor = makeActor({ sex: 'female', otherCrops: 'Sesame, Cassava' });
    const csv = buildDashboardCsv({ actors: [actor], kpis: BASE_KPIS });
    expect(csv).toContain('female');
    // otherCrops contains a comma so RFC 4180 escaping must quote the field.
    expect(csv).toContain('"Sesame, Cassava"');
  });

  it('renders an empty string for null sex/otherCrops', () => {
    const actor = makeActor({ sex: null, otherCrops: null });
    const csv = buildDashboardCsv({ actors: [actor], kpis: BASE_KPIS });
    const lines = csv.split('\n');
    const dataLine = lines.find((l) => l.includes(actor.traderName));
    expect(dataLine).toBeDefined();
    // sex and otherCrops are the 7th and 8th (last) columns — a trailing
    // ",," with nothing after means both are empty.
    expect(dataLine).toMatch(/,,$/);
  });

  it('renders an empty string for null district', () => {
    const actor = makeActor({ district: null });
    const csv = buildDashboardCsv({ actors: [actor], kpis: BASE_KPIS });
    const lines = csv.split('\n');
    const dataLine = lines.find((l) => l.includes(actor.traderName));
    expect(dataLine).toBeDefined();
    // Anchor by column index, not comma pattern: a comma-count regex here
    // reads as satisfied by the unrelated trailing sex/otherCrops empties
    // (both null by default in makeActor) once those columns exist, which
    // makes the assertion pass regardless of district's own value.
    // Columns: traderName, region, district, traderType, capacityTons, crops, sex, otherCrops.
    const fields = (dataLine as string).split(',');
    expect(fields[2]).toBe('');
  });

  it('renders an empty string for null/undefined capacityTons', () => {
    const actor = makeActor({ capacityTons: null });
    const csv = buildDashboardCsv({ actors: [actor], kpis: BASE_KPIS });
    const lines = csv.split('\n');
    const dataLine = lines.find((l) => l.includes(actor.traderName));
    expect(dataLine).toBeDefined();
    // Anchor by column index, not comma pattern — see the district test above
    // for why a bare "look for ,," check is vacuous once trailing empty
    // columns exist.
    // Columns: traderName, region, district, traderType, capacityTons, crops, sex, otherCrops.
    const fields = (dataLine as string).split(',');
    expect(fields[4]).toBe('');
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

// ── (f) Contact block gate (FR-7 scenario 2, design.md D-1b) ─────────────────
//
// `PublicActor` (== `PublicActorListItem`, DD-6) has no contact fields at
// all, so `actor.phone` etc. is a compile error anywhere this module is
// used — the primary guard here is the type system (design.md RV-4), not
// this test. This assertion is a *second*, independent guard: it simulates
// `PublicActor` widening to carry the contact block (what FR-1 does to the
// *detail* type) via a cast, and proves the CSV serializer still would not
// emit it even if the input object carried the values at runtime.

describe('buildDashboardCsv — contact block gate (FR-7 / D-1b)', () => {
  it('never serialises contactPerson, position, phone, email, or marketLocation, even when present on the actor object', () => {
    const poisonedActor = {
      ...makeActor(),
      contactPerson: 'Jane Contact',
      position: 'Director',
      phone: '+255700000000',
      email: 'director@example.com',
      marketLocation: 'Arusha Central Market',
    } as unknown as PublicActor;

    const csv = buildDashboardCsv({ actors: [poisonedActor], kpis: BASE_KPIS });

    // Sentinel values must not appear anywhere in the output.
    expect(csv).not.toContain('Jane Contact');
    expect(csv).not.toContain('Director');
    expect(csv).not.toContain('+255700000000');
    expect(csv).not.toContain('director@example.com');
    expect(csv).not.toContain('Arusha Central Market');

    // Nor the key names — named explicitly, not asserted by column count
    // (a rename of an existing column would pass a count check).
    expect(csv.toLowerCase()).not.toContain('contactperson');
    expect(csv.toLowerCase()).not.toContain('position');
    expect(csv.toLowerCase()).not.toContain('phone');
    expect(csv.toLowerCase()).not.toContain('email');
    expect(csv.toLowerCase()).not.toContain('marketlocation');
  });
});

// ── (g) Filtered-set fidelity (FR-7's BUT clause, design.md D-15) ────────────
//
// The CSV must not carry any actor outside the caller's filtered `GRANTED`
// set. `buildDashboardCsv` has no data source of its own — it only ever
// serialises the `actors` array it is given — so this asserts the function
// introduces nothing extra and drops nothing it was given.

describe('buildDashboardCsv — filtered-set fidelity (D-15)', () => {
  it('exports exactly the actors it is given — no actor outside that set appears, and none given is dropped', () => {
    const includedA = makeActor({ id: 'incl-1', traderName: 'Included Actor One' });
    const includedB = makeActor({ id: 'incl-2', traderName: 'Included Actor Two' });
    // Represents an actor that exists but was filtered OUT upstream (e.g.
    // not GRANTED, or outside the current dashboard filter) — it is never
    // passed to buildDashboardCsv and must not appear in its output.
    const excludedSentinel = 'Excluded Sentinel Actor Never Passed In';

    const csv = buildDashboardCsv({ actors: [includedA, includedB], kpis: BASE_KPIS });

    expect(csv).toContain('Included Actor One');
    expect(csv).toContain('Included Actor Two');
    expect(csv).not.toContain(excludedSentinel);

    // Exactly one data row per actor passed in — no extra rows appear.
    const lines = csv.split('\n');
    const headerIdx = lines.findIndex((l) => l.startsWith('traderName'));
    const dataLines = lines.slice(headerIdx + 1).filter((l) => l !== '');
    expect(dataLines).toHaveLength(2);
  });
});

// ── (e) T-7 gate — registration source / consent provenance MUST NEVER appear ─
//
// FR-7: registrationSource, consentMethod, consentObtainedAt, and
// consentReference are admin-only (DD-6 in the registration-source-and-consent
// spec) and are not on PublicActor. Values below are deliberately NON-DEFAULT
// (defaults are TEAM_MANAGED / NOT_RECORDED / null / null) — a default-valued
// check would pass vacuously since most live rows carry exactly those defaults.

describe('buildDashboardCsv — registration source / consent provenance gate (FR-7)', () => {
  it('does not contain any of the four field names in any case', () => {
    const csv = buildDashboardCsv({ actors: [makeActor()], kpis: BASE_KPIS });
    expect(csv.toLowerCase()).not.toContain('registrationsource');
    expect(csv.toLowerCase()).not.toContain('consentmethod');
    expect(csv.toLowerCase()).not.toContain('consentobtainedat');
    expect(csv.toLowerCase()).not.toContain('consentreference');
  });

  it('does not serialise stray provenance keys even if cast onto an actor object', () => {
    // Cast a "poisoned" object — the allowlist must ignore extra keys entirely,
    // including ones the backend would never actually send on PublicActor.
    const poisonedActor = {
      ...makeActor(),
      registrationSource: 'SELF_REGISTERED',
      consentMethod: 'SIGNED_FORM',
      consentObtainedAt: '2026-02-14T00:00:00.000Z',
      consentReference: 'CONSENT-REF-SIGNED-9931',
    } as unknown as PublicActor;

    const csv = buildDashboardCsv({ actors: [poisonedActor], kpis: BASE_KPIS });

    // The sentinel (non-default) values must not appear anywhere in the output.
    expect(csv).not.toContain('SELF_REGISTERED');
    expect(csv).not.toContain('SIGNED_FORM');
    expect(csv).not.toContain('2026-02-14');
    expect(csv).not.toContain('CONSENT-REF-SIGNED-9931');
    // Nor the key names.
    expect(csv.toLowerCase()).not.toContain('registrationsource');
    expect(csv.toLowerCase()).not.toContain('consentmethod');
    expect(csv.toLowerCase()).not.toContain('consentobtainedat');
    expect(csv.toLowerCase()).not.toContain('consentreference');
  });

  it('does not serialise stray provenance keys across multiple poisoned actors', () => {
    const actors = Array.from({ length: 3 }, (_, i) => ({
      ...makeActor({ id: `actor-${i}`, traderName: `Actor ${i}` }),
      registrationSource: 'SELF_REGISTERED',
      consentMethod: 'SIGNED_FORM',
      consentObtainedAt: `2026-02-1${i}T00:00:00.000Z`,
      consentReference: `CONSENT-REF-SIGNED-993${i}`,
    } as unknown as PublicActor));

    const csv = buildDashboardCsv({ actors, kpis: BASE_KPIS });
    expect(csv.toLowerCase()).not.toContain('registrationsource');
    expect(csv.toLowerCase()).not.toContain('consentmethod');
    expect(csv.toLowerCase()).not.toContain('consentobtainedat');
    expect(csv.toLowerCase()).not.toContain('consentreference');
    actors.forEach((_, i) => {
      expect(csv).not.toContain(`2026-02-1${i}`);
      expect(csv).not.toContain(`CONSENT-REF-SIGNED-993${i}`);
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
