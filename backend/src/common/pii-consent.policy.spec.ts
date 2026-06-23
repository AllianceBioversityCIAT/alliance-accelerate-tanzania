import { ConsentStatus, Prisma } from '@prisma/client';
import { PII_ALLOWLIST, isPublic, publicGps } from './pii-consent.policy';

/**
 * T-4 — Unit tests for the single PII/consent policy (DD-1). Pure, no DB/Nest.
 * This is the security boundary: consent gates exact GPS (FR-5/DD-3) and the
 * allowlist is the one legal-ratifiable PII set (NFR-5).
 */
describe('PII_ALLOWLIST', () => {
  it('is exactly the legal-ratifiable public-hidden PII field set (NFR-5)', () => {
    expect([...PII_ALLOWLIST]).toEqual([
      'phone',
      'email',
      'sex',
      'position',
      'marketLocation',
      'technicalSupport',
    ]);
  });
});

describe('isPublic', () => {
  it('is true ONLY for GRANTED consent (FR-4)', () => {
    expect(isPublic({ consentStatus: ConsentStatus.GRANTED })).toBe(true);
    expect(isPublic({ consentStatus: ConsentStatus.DENIED })).toBe(false);
    expect(isPublic({ consentStatus: ConsentStatus.UNKNOWN })).toBe(false);
  });
});

describe('publicGps', () => {
  const lat = new Prisma.Decimal('-8.9094000');
  const long = new Prisma.Decimal('33.4607000');

  it('returns exact {lat,long} when consent is GRANTED', () => {
    expect(
      publicGps({
        consentStatus: ConsentStatus.GRANTED,
        gpsLatitude: lat,
        gpsLongitude: long,
      }),
    ).toEqual({ lat: -8.9094, long: 33.4607 });
  });

  it('returns null for non-GRANTED consent even with GPS present (FR-5/DD-3)', () => {
    for (const consentStatus of [ConsentStatus.UNKNOWN, ConsentStatus.DENIED]) {
      expect(
        publicGps({ consentStatus, gpsLatitude: lat, gpsLongitude: long }),
      ).toBeNull();
    }
  });

  it('returns null when a coordinate is missing even if GRANTED', () => {
    expect(
      publicGps({
        consentStatus: ConsentStatus.GRANTED,
        gpsLatitude: lat,
        gpsLongitude: null,
      }),
    ).toBeNull();
    expect(publicGps({ consentStatus: ConsentStatus.GRANTED })).toBeNull();
  });

  it('accepts numeric and string coordinates and never leaks NaN', () => {
    expect(
      publicGps({
        consentStatus: ConsentStatus.GRANTED,
        gpsLatitude: -8.9094,
        gpsLongitude: '33.4607',
      }),
    ).toEqual({ lat: -8.9094, long: 33.4607 });

    expect(
      publicGps({
        consentStatus: ConsentStatus.GRANTED,
        gpsLatitude: 'not-a-number',
        gpsLongitude: long,
      }),
    ).toBeNull();
  });
});
