import { RegistrationStatus } from '@prisma/client';
import { DuplicateCandidate } from '../duplicate-detection.service';
import {
  AdminRegistrationSourceRow,
  toAdminRegistrationDetail,
} from './admin-registration.serializer';

/**
 * T-6 — Unit tests for the admin registration detail projection (FR-10
 * scenarios 1, 2; `design.md` §5, §7.3).
 */

function fixtureRow(
  overrides: Partial<AdminRegistrationSourceRow> = {},
): AdminRegistrationSourceRow {
  return {
    id: 'reg-internal-id',
    reference: 'REG-2026-0042',
    payload: {
      traderName: 'Mbeya Seed Traders Ltd',
      traderType: 'seed_company',
      contactPerson: 'Amina Hassan',
      position: 'Managing Director',
      district: 'Mbeya Urban',
      marketLocation: 'Mwanjelwa Market',
      sex: 'F',
      region: 'Mbeya',
      gpsLatitude: -8.9094,
      gpsLongitude: 33.4607,
      crops: ['sorghum', 'groundnut'],
      otherCrops: 'Sunflower',
      capacityTons: 120,
      phone: '+255700000000',
    },
    createdAt: new Date('2026-03-01T08:00:00.000Z'),
    status: RegistrationStatus.PENDING_REVIEW,
    submitterEmail: 'applicant@example.com',
    duplicateDismissals: null,
    emailVerifiedAt: new Date('2026-03-01T08:05:00.000Z'),
    consentAcceptedAt: new Date('2026-03-01T08:10:00.000Z'),
    consentPolicyVersion: 'v3',
    reviewedAt: null,
    reviewedBySub: null,
    reviewedByEmail: null,
    ...overrides,
  };
}

describe('toAdminRegistrationDetail — FR-10 scenarios 1, 2', () => {
  describe('full payload is shown (FR-10 scenario 1)', () => {
    it('projects every submitted field, INCLUDING the two with no Actor column', () => {
      const row = fixtureRow();

      const result = toAdminRegistrationDetail(row, []);

      expect(result.payload).toEqual({
        traderName: 'Mbeya Seed Traders Ltd',
        traderType: 'seed_company',
        contactPerson: 'Amina Hassan',
        position: 'Managing Director',
        district: 'Mbeya Urban',
        marketLocation: 'Mwanjelwa Market',
        sex: 'F',
        region: 'Mbeya',
        gpsLatitude: -8.9094,
        gpsLongitude: 33.4607,
        crops: ['sorghum', 'groundnut'],
        otherCrops: 'Sunflower',
        capacityTons: 120,
        phone: '+255700000000',
      });
    });

    it('includes the reference code, so the reviewer can quote it out-of-band', () => {
      const row = fixtureRow({ reference: 'REG-2026-9999' });

      const result = toAdminRegistrationDetail(row, []);

      expect(result.reference).toBe('REG-2026-9999');
    });

    it('null-coalesces absent optional payload fields rather than fabricating a value', () => {
      const row = fixtureRow({
        payload: {
          traderName: 'Minimal Traders',
          traderType: 'ngo',
          contactPerson: 'Someone',
          region: 'Dodoma',
          crops: ['sorghum'],
          capacityTons: 10,
          phone: '+255700000001',
          // position, district, marketLocation, sex, gpsLatitude,
          // gpsLongitude, otherCrops all omitted — optional in the DTO
        },
      });

      const result = toAdminRegistrationDetail(row, []);

      expect(result.payload.position).toBeNull();
      expect(result.payload.district).toBeNull();
      expect(result.payload.marketLocation).toBeNull();
      expect(result.payload.sex).toBeNull();
      expect(result.payload.gpsLatitude).toBeNull();
      expect(result.payload.gpsLongitude).toBeNull();
      expect(result.payload.otherCrops).toBeNull();
    });
  });

  describe('consent record is legible (FR-10 scenario 2)', () => {
    it('states the consenting party, the policy version, and a timezone-explicit acceptance timestamp', () => {
      const row = fixtureRow({
        consentPolicyVersion: 'v7',
        consentAcceptedAt: new Date('2026-04-01T14:30:00.000Z'),
      });

      const result = toAdminRegistrationDetail(row, []);

      expect(result.consent.consentingOrganisation).toBe(
        (row.payload as { traderName: string }).traderName,
      );
      expect(result.consent.policyVersion).toBe('v7');
      // ISO-8601 with a `Z` designator — timezone-explicit at the wire
      // level by construction (FR-10 scenario 2's "must name its timezone").
      expect(result.consent.acceptedAt).toBe('2026-04-01T14:30:00.000Z');
      expect(result.consent.acceptedAt).toMatch(/Z$/);
    });

    it("labels the timestamp 'recorded at submission', never an independently attested acceptance moment", () => {
      const row = fixtureRow();

      const result = toAdminRegistrationDetail(row, []);

      expect(result.consent.acceptedAtQualifier).toBe('RECORDED_AT_SUBMISSION');
    });
  });

  describe('duplicate candidates are passed through, never fetched here', () => {
    it('places the candidates array exactly where the caller supplied it', () => {
      const row = fixtureRow();
      const candidates: DuplicateCandidate[] = [
        { actorId: 'actor-1', traderId: 'TZ-0001', traderName: 'Existing Traders', matchedOn: ['phone'] },
      ];

      const result = toAdminRegistrationDetail(row, candidates);

      expect(result.duplicateCandidates).toBe(candidates);
    });

    it('is an empty array when the caller found no candidates', () => {
      const row = fixtureRow();

      const result = toAdminRegistrationDetail(row, []);

      expect(result.duplicateCandidates).toEqual([]);
    });
  });

  describe('activity trail is delegated to buildActivityTrail, not re-derived here', () => {
    it('includes the SUBMITTED and CONSENT_RECORDED events sourced from the same row', () => {
      const row = fixtureRow();

      const result = toAdminRegistrationDetail(row, []);

      expect(result.activityTrail.map((e) => e.type)).toEqual([
        'SUBMITTED',
        'EMAIL_VERIFIED',
        'CONSENT_RECORDED',
      ]);
    });
  });

  describe('PII containment — this serializer is the ONE surface that renders it (Admin-only)', () => {
    it('exposes submitterEmail on the detail response (unlike the list row, which never does)', () => {
      const row = fixtureRow({ submitterEmail: 'org-admin@example.com' });

      const result = toAdminRegistrationDetail(row, []);

      expect(result.submitterEmail).toBe('org-admin@example.com');
    });
  });
});
