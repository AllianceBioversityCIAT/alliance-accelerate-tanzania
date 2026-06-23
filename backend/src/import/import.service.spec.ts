/**
 * T-8 — Unit tests for the design-only import (FR-9). SYNTHETIC rows only.
 *
 * No real source data, no real PII, and NO database: the pure transforms
 * (`mapRow` / `importRows`) are exercised against clearly-fake rows. A Prisma
 * stub whose every method throws proves these transforms never touch the DB.
 */

import { ImportService, type RawSourceRow } from './import.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Prisma stub: any property access yields a function that throws. If `mapRow` or
 * `importRows` ever called a DB method, these tests would fail loudly — which is
 * exactly the guarantee we want (pure transform, no DB dependency exercised).
 */
const throwingPrisma = new Proxy(
  {},
  {
    get() {
      return () => {
        throw new Error('Prisma must NOT be called by importRows/mapRow');
      };
    },
  },
) as unknown as PrismaService;

/** A clean, fully-populated SYNTHETIC source row (fake data only). */
function cleanRow(overrides: Partial<RawSourceRow> = {}): RawSourceRow {
  return {
    Trader_id: 'SYN-0001',
    Trader_name: 'Test Org A',
    Region: 'mbeya',
    District: 'Mbeya Rural',
    'Trader/processor type': 'Seed Company',
    Sex: 'Female',
    Position: 'Manager',
    'Market location': 'Test Market',
    'Capacity (volume in t)': '1250.5',
    'Technical support required': 'Cleaning equipment',
    phone: '+255700000000',
    Email: 'test@example.org',
    gpslatitude: '-8.9094',
    gpslongitude: '33.4607',
    gpsaltitude: '1700',
    gpsaccuracy: '5',
    ...overrides,
  };
}

describe('ImportService', () => {
  let service: ImportService;

  beforeEach(() => {
    service = new ImportService(throwingPrisma);
  });

  describe('mapRow — mapping a clean synthetic row', () => {
    it('normalizes region/traderType/sex, parses decimals, defaults consent UNKNOWN', () => {
      const result = service.mapRow(cleanRow());

      expect(result.quarantined).toBeUndefined();
      const actor = result.actor!;
      expect(actor.traderId).toBe('SYN-0001');
      expect(actor.traderName).toBe('Test Org A');
      // normalized via T-3 normalizers:
      expect(actor.region).toBe('Mbeya'); // 'mbeya' → canonical
      expect(actor.traderType).toBe('seed_company'); // 'Seed Company' → taxonomy
      expect(actor.sex).toBe('F'); // 'Female' → 'F'
      // decimals parsed:
      expect(actor.capacityTons).toBe(1250.5);
      expect(actor.gpsLatitude).toBe(-8.9094);
      expect(actor.gpsLongitude).toBe(33.4607);
      expect(actor.gpsAltitude).toBe(1700);
      expect(actor.gpsAccuracy).toBe(5);
      // PII carried through but never public by default:
      expect(actor.phone).toBe('+255700000000');
      expect(actor.email).toBe('test@example.org');
      expect(actor.consentStatus).toBe('UNKNOWN'); // OQ-3
    });
  });

  describe('mapRow — quarantine rules', () => {
    it('quarantines a row missing Trader_id', () => {
      const result = service.mapRow(cleanRow({ Trader_id: '  ' }));
      expect(result.actor).toBeUndefined();
      expect(result.quarantined?.reason).toMatch(/Trader_id/i);
    });

    it('quarantines a row with missing/invalid GPS', () => {
      const missing = service.mapRow(
        cleanRow({ gpslatitude: '', gpslongitude: '' }),
      );
      expect(missing.actor).toBeUndefined();
      expect(missing.quarantined?.reason).toMatch(/GPS/i);

      const outOfRange = service.mapRow(cleanRow({ gpslatitude: '999' }));
      expect(outOfRange.actor).toBeUndefined();
      expect(outOfRange.quarantined?.reason).toMatch(/GPS/i);
    });

    it('quarantines an ambiguous region ("Arusha/Dodoma") and captures the reason', () => {
      const result = service.mapRow(cleanRow({ Region: 'Arusha/Dodoma' }));
      expect(result.actor).toBeUndefined();
      expect(result.quarantined?.reason).toMatch(/region/i);
      expect(result.quarantined?.reason).toContain('Arusha/Dodoma');
    });
  });

  describe('importRows — pure transform over an array', () => {
    it('dedupes on traderId: later duplicate dropped and counted', () => {
      const summary = service.importRows([
        cleanRow({ Trader_id: 'SYN-DUP' }),
        cleanRow({ Trader_id: 'SYN-DUP', Trader_name: 'Test Org A (dup)' }),
        cleanRow({ Trader_id: 'SYN-OTHER', Trader_name: 'Test Org B' }),
      ]);

      expect(summary.imported).toHaveLength(2);
      expect(summary.deduped).toBe(1);
      // first occurrence wins:
      const dup = summary.imported.find((a) => a.traderId === 'SYN-DUP');
      expect(dup?.traderName).toBe('Test Org A');
    });

    it('collects quarantined rows alongside imported ones', () => {
      const summary = service.importRows([
        cleanRow({ Trader_id: 'SYN-OK' }),
        cleanRow({ Trader_id: '' }), // → quarantined (missing key)
        cleanRow({ Trader_id: 'SYN-BADGEO', gpslatitude: 'abc' }), // → quarantined (GPS)
        cleanRow({ Trader_id: 'SYN-AMBIG', Region: 'Arusha/Dodoma' }), // → quarantined (region)
      ]);

      expect(summary.imported).toHaveLength(1);
      expect(summary.imported[0].traderId).toBe('SYN-OK');
      expect(summary.quarantined).toHaveLength(3);
      expect(summary.quarantined.map((q) => q.reason)).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Trader_id/i),
          expect.stringMatching(/GPS/i),
          expect.stringMatching(/region/i),
        ]),
      );
    });

    it('does NOT touch the database (pure transform — no Prisma call)', () => {
      // The Prisma stub throws on ANY method access; reaching here without a
      // throw proves importRows performed no DB I/O.
      expect(() =>
        service.importRows([cleanRow(), cleanRow({ Trader_id: 'SYN-0002' })]),
      ).not.toThrow();
    });
  });
});
