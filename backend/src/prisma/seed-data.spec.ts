/**
 * T-7 — Dataset-shape unit test (DB-INDEPENDENT).
 *
 * There is no reachable MySQL here, so the live `prisma db seed` run is a
 * DEFERRED step. What we CAN — and must — prove without a database is that the
 * exported seed dataset honours the FR-8 / DD-4 contract: only consented actors
 * are public, coverage spans the required crops/types/regions, every GPS sits in
 * Tanzania, and NO real PII (names/phone/email) is present.
 *
 * The dataset is consumed straight from `prisma/seed-data.ts` (the same const
 * the runner writes), and validated through the T-3 normalizers so the seed is
 * held to the identical canonical rules as live writes.
 */

import {
  CANONICAL_REGIONS,
  TRADER_TYPES,
  isValidLatitude,
  isValidLongitude,
  normalizeRegion,
  normalizeTraderType,
  parseCapacityTons,
} from '../common/normalize';
import {
  PUBLIC_SEED_ACTORS,
  SEED_ACTORS,
  SEED_CROP_SLUGS,
  TANZANIA_BOUNDS,
} from '../../prisma/seed-data';

describe('Seed dataset shape (FR-8 / DD-4, no DB)', () => {
  it('contains 12 public (GRANTED) sample actors matching the mockup', () => {
    expect(PUBLIC_SEED_ACTORS).toHaveLength(12);
    for (const actor of PUBLIC_SEED_ACTORS) {
      expect(actor.consentStatus).toBe('GRANTED');
    }
  });

  it('every PUBLIC_SEED_ACTORS entry is GRANTED (no leak of non-consented rows)', () => {
    const nonGranted = PUBLIC_SEED_ACTORS.filter(
      (a) => a.consentStatus !== 'GRANTED',
    );
    expect(nonGranted).toEqual([]);
  });

  it('includes at least one UNKNOWN and one DENIED actor for filter coverage', () => {
    const statuses = SEED_ACTORS.map((a) => a.consentStatus);
    expect(statuses).toContain('UNKNOWN');
    expect(statuses).toContain('DENIED');
  });

  it('public actors cover all three crops', () => {
    const covered = new Set<string>();
    for (const actor of PUBLIC_SEED_ACTORS) {
      for (const crop of actor.crops) covered.add(crop);
    }
    for (const slug of SEED_CROP_SLUGS) {
      expect(covered.has(slug)).toBe(true);
    }
    expect(covered.size).toBe(3);
  });

  it('public actors span >= 3 canonical traderTypes', () => {
    const types = new Set(PUBLIC_SEED_ACTORS.map((a) => a.traderType));
    expect(types.size).toBeGreaterThanOrEqual(3);
    // Each traderType is a canonical OQ-2 code (T-3 round-trips it unchanged).
    for (const type of types) {
      expect(normalizeTraderType(type)).toBe(type);
      expect(TRADER_TYPES).toContain(type);
    }
  });

  it('public actors span >= 4 canonical regions', () => {
    const regions = new Set(PUBLIC_SEED_ACTORS.map((a) => a.region));
    expect(regions.size).toBeGreaterThanOrEqual(4);
    for (const region of regions) {
      // Region is canonical: T-3 normalizes it to itself, never quarantined.
      const result = normalizeRegion(region);
      expect(result.quarantined).toBe(false);
      expect(result.region).toBe(region);
      expect(CANONICAL_REGIONS).toContain(region);
    }
  });

  it('every actor has valid GPS inside Tanzania and a valid capacity', () => {
    for (const actor of SEED_ACTORS) {
      expect(isValidLatitude(actor.gpsLatitude)).toBe(true);
      expect(isValidLongitude(actor.gpsLongitude)).toBe(true);

      expect(actor.gpsLatitude).toBeGreaterThanOrEqual(TANZANIA_BOUNDS.latMin);
      expect(actor.gpsLatitude).toBeLessThanOrEqual(TANZANIA_BOUNDS.latMax);
      expect(actor.gpsLongitude).toBeGreaterThanOrEqual(
        TANZANIA_BOUNDS.longMin,
      );
      expect(actor.gpsLongitude).toBeLessThanOrEqual(TANZANIA_BOUNDS.longMax);

      const capacity = parseCapacityTons(actor.capacityTons);
      expect(capacity).not.toBeNull();
      expect(capacity).toBeGreaterThanOrEqual(0);
    }
  });

  it('carries NO real PII — phone/email null and fictional org names', () => {
    // A name with two capitalised "words" and no org keyword would read like a
    // person; require an organization marker on every name as a no-real-name
    // heuristic, and forbid any non-null phone/email outright.
    const ORG_MARKERS =
      /(ltd|company|cooperative|co-?op|union|institute|foundation|society|seeds?|agro|agri|traders?|growers?|aggregators?|buyers?|distributors?)/i;

    for (const actor of SEED_ACTORS) {
      expect(actor.phone).toBeNull();
      expect(actor.email).toBeNull();
      expect(actor.traderName).toMatch(ORG_MARKERS);
    }
  });

  it('uses unique traderIds (upsert key is stable / reproducible)', () => {
    const ids = SEED_ACTORS.map((a) => a.traderId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
