import { RegistrationStatus } from '@prisma/client';
import {
  ActivityTrailEvent,
  ActivityTrailSourceRow,
  buildActivityTrail,
} from './activity-trail.serializer';

/**
 * T-6 — Unit tests for the activity trail (FR-10 scenario 3, `design.md`
 * §6.6).
 *
 * KZ-002 discipline (this file's Disqualifying clause): a test that only
 * asserts events APPEAR is worthless. Every test below builds its
 * "expected" array by hand from the fixture row's OWN fields — never by
 * calling {@link buildActivityTrail} a second time, which would be
 * tautological — and compares with `toEqual`, which fails on an EXTRA key
 * the expectation does not name. That is what makes the purity assertion
 * (below) catch "no field in the output that has no source column": adding
 * any unsourced field to any event — a fabricated `duplicateCheckedAt`
 * included — reddens the same assertion the same way.
 */

function fixtureRow(overrides: Partial<ActivityTrailSourceRow> = {}): ActivityTrailSourceRow {
  return {
    createdAt: new Date('2026-03-01T08:00:00.000Z'),
    emailVerifiedAt: new Date('2026-03-01T08:05:00.000Z'),
    consentAcceptedAt: new Date('2026-03-01T08:10:00.000Z'),
    consentPolicyVersion: 'v3',
    duplicateDismissals: null,
    reviewedAt: null,
    reviewedBySub: null,
    reviewedByEmail: null,
    status: RegistrationStatus.PENDING_REVIEW,
    ...overrides,
  };
}

describe('buildActivityTrail — FR-10 scenario 3, design.md §6.6', () => {
  describe('purity — the trail is a pure function of stored fields', () => {
    it('for a submitted-only row, the output is EXACTLY the three unconditional events, sourced field for field, no extra key', () => {
      const row = fixtureRow();

      const result = buildActivityTrail(row);

      // Built independently from `row`'s own fields, never by re-invoking
      // the function under test — this is the "same output" half of the
      // purity assertion, and `toEqual` fails on any UNSOURCED extra field
      // (KZ-002; also the concrete redness the falsifying-input mutation —
      // adding `duplicateCheckedAt` to any event — reproduces).
      const expected: ActivityTrailEvent[] = [
        { type: 'SUBMITTED', occurredAt: row.createdAt.toISOString() },
        { type: 'EMAIL_VERIFIED', occurredAt: row.emailVerifiedAt.toISOString() },
        {
          type: 'CONSENT_RECORDED',
          occurredAt: row.consentAcceptedAt.toISOString(),
          policyVersion: row.consentPolicyVersion,
        },
      ];
      expect(result).toEqual(expected);
    });

    it('calling it twice on the SAME row (deep-cloned) yields deep-identical, identically-ordered output — the function is deterministic, not merely correct once', () => {
      const row = fixtureRow({
        duplicateDismissals: [
          {
            actorId: 'actor-dup-1',
            dismissedBySub: 'sub-1',
            dismissedByEmail: 'admin1@example.com',
            dismissedAt: '2026-03-01T09:00:00.000Z',
          },
        ],
        reviewedAt: new Date('2026-03-02T00:00:00.000Z'),
        reviewedBySub: 'sub-reviewer',
        reviewedByEmail: 'reviewer@example.com',
        status: RegistrationStatus.APPROVED,
      });
      const clonedRow: ActivityTrailSourceRow = JSON.parse(JSON.stringify(row), (key, value) =>
        key === 'createdAt' || key === 'emailVerifiedAt' || key === 'consentAcceptedAt' || key === 'reviewedAt'
          ? new Date(value)
          : value,
      );

      const first = buildActivityTrail(row);
      const second = buildActivityTrail(clonedRow);

      expect(second).toEqual(first);
    });

    it('no event in the output carries a field with no source column — the union is closed to exactly the five FR-10 event shapes', () => {
      const row = fixtureRow({
        duplicateDismissals: [
          {
            actorId: 'actor-dup-1',
            dismissedBySub: 'sub-1',
            dismissedByEmail: 'admin1@example.com',
            dismissedAt: '2026-03-01T09:00:00.000Z',
          },
        ],
        reviewedAt: new Date('2026-03-02T00:00:00.000Z'),
        reviewedBySub: 'sub-reviewer',
        reviewedByEmail: 'reviewer@example.com',
        status: RegistrationStatus.APPROVED,
      });

      const result = buildActivityTrail(row);

      const allowedKeysByType: Record<string, string[]> = {
        SUBMITTED: ['type', 'occurredAt'],
        EMAIL_VERIFIED: ['type', 'occurredAt'],
        CONSENT_RECORDED: ['type', 'occurredAt', 'policyVersion'],
        DUPLICATE_DISMISSED: [
          'type',
          'occurredAt',
          'candidateActorId',
          'dismissedBySub',
          'dismissedByEmail',
        ],
        ADJUDICATED: ['type', 'occurredAt', 'status', 'reviewedBySub', 'reviewedByEmail'],
      };
      for (const event of result) {
        expect(Object.keys(event).sort()).toEqual(allowedKeysByType[event.type].sort());
      }
    });
  });

  describe('no fabricated duplicate-check timestamp (FR-10, amended S-4)', () => {
    it('never emits a check-time event or field, regardless of how many candidates exist or are dismissed', () => {
      // Adjudicated too — this is a general "no unsourced field anywhere in
      // the output" assertion, so the fixture carries all five event
      // shapes (SUBMITTED, EMAIL_VERIFIED, CONSENT_RECORDED,
      // DUPLICATE_DISMISSED x2, ADJUDICATED), not just four of the five.
      const row = fixtureRow({
        duplicateDismissals: [
          {
            actorId: 'actor-dup-1',
            dismissedBySub: 'sub-1',
            dismissedByEmail: 'admin1@example.com',
            dismissedAt: '2026-03-01T09:00:00.000Z',
          },
          {
            actorId: 'actor-dup-2',
            dismissedBySub: 'sub-2',
            dismissedByEmail: 'admin2@example.com',
            dismissedAt: '2026-03-01T09:30:00.000Z',
          },
        ],
        reviewedAt: new Date('2026-03-02T00:00:00.000Z'),
        reviewedBySub: 'sub-reviewer',
        reviewedByEmail: 'reviewer@example.com',
        status: RegistrationStatus.APPROVED,
      });

      const result = buildActivityTrail(row);

      expect(result.map((e) => e.type)).toEqual([
        'SUBMITTED',
        'EMAIL_VERIFIED',
        'CONSENT_RECORDED',
        'DUPLICATE_DISMISSED',
        'DUPLICATE_DISMISSED',
        'ADJUDICATED',
      ]);
      expect(result.map((e) => e.type)).not.toContain('DUPLICATE_CHECKED');
      expect(JSON.stringify(result)).not.toContain('duplicateCheckedAt');
      expect(JSON.stringify(result)).not.toContain('checkedAt');
    });
  });

  describe('conditional events', () => {
    it('emits one DUPLICATE_DISMISSED event per duplicateDismissals entry, sourced from that entry only', () => {
      const row = fixtureRow({
        duplicateDismissals: [
          {
            actorId: 'actor-a',
            dismissedBySub: 'sub-a',
            dismissedByEmail: 'a@example.com',
            dismissedAt: '2026-03-01T09:00:00.000Z',
          },
          {
            actorId: 'actor-b',
            dismissedBySub: 'sub-b',
            dismissedByEmail: 'b@example.com',
            dismissedAt: '2026-03-01T09:15:00.000Z',
          },
        ],
      });

      const result = buildActivityTrail(row);
      const dismissed = result.filter((e) => e.type === 'DUPLICATE_DISMISSED');

      expect(dismissed).toEqual([
        {
          type: 'DUPLICATE_DISMISSED',
          occurredAt: '2026-03-01T09:00:00.000Z',
          candidateActorId: 'actor-a',
          dismissedBySub: 'sub-a',
          dismissedByEmail: 'a@example.com',
        },
        {
          type: 'DUPLICATE_DISMISSED',
          occurredAt: '2026-03-01T09:15:00.000Z',
          candidateActorId: 'actor-b',
          dismissedBySub: 'sub-b',
          dismissedByEmail: 'b@example.com',
        },
      ]);
    });

    it('treats an absent duplicateDismissals column and an empty array identically (design.md §4.3)', () => {
      const rowAbsent = fixtureRow({ duplicateDismissals: null });
      const rowEmpty = fixtureRow({ duplicateDismissals: [] });

      expect(buildActivityTrail(rowAbsent)).toEqual(buildActivityTrail(rowEmpty));
    });

    it('skips a malformed dismissal entry (missing a required string field) rather than throwing', () => {
      const row = fixtureRow({
        duplicateDismissals: [
          { actorId: 'actor-a', dismissedBySub: 'sub-a', dismissedByEmail: 'a@example.com' }, // no dismissedAt
          {
            actorId: 'actor-b',
            dismissedBySub: 'sub-b',
            dismissedByEmail: 'b@example.com',
            dismissedAt: '2026-03-01T09:15:00.000Z',
          },
        ],
      });

      const result = buildActivityTrail(row);
      const dismissed = result.filter((e) => e.type === 'DUPLICATE_DISMISSED');

      expect(dismissed).toHaveLength(1);
      expect((dismissed[0] as { candidateActorId: string }).candidateActorId).toBe('actor-b');
    });

    it('emits ADJUDICATED sourced from reviewedAt + status + reviewer when the registration was approved', () => {
      const row = fixtureRow({
        reviewedAt: new Date('2026-03-05T12:00:00.000Z'),
        reviewedBySub: 'sub-reviewer',
        reviewedByEmail: 'reviewer@example.com',
        status: RegistrationStatus.APPROVED,
      });

      const result = buildActivityTrail(row);
      const adjudicated = result.find((e) => e.type === 'ADJUDICATED');

      expect(adjudicated).toEqual({
        type: 'ADJUDICATED',
        occurredAt: '2026-03-05T12:00:00.000Z',
        status: RegistrationStatus.APPROVED,
        reviewedBySub: 'sub-reviewer',
        reviewedByEmail: 'reviewer@example.com',
      });
    });

    it('emits ADJUDICATED for a rejected registration with the rejected status', () => {
      const row = fixtureRow({
        reviewedAt: new Date('2026-03-05T12:00:00.000Z'),
        reviewedBySub: 'sub-reviewer',
        reviewedByEmail: 'reviewer@example.com',
        status: RegistrationStatus.REJECTED,
      });

      const result = buildActivityTrail(row);
      const adjudicated = result.find((e) => e.type === 'ADJUDICATED');

      expect(adjudicated).toMatchObject({ type: 'ADJUDICATED', status: RegistrationStatus.REJECTED });
    });

    it('passes a null reviewer identity through verbatim rather than coalescing to an empty string (design.md §8 — the resolver returns null on failure)', () => {
      const row = fixtureRow({
        reviewedAt: new Date('2026-03-05T12:00:00.000Z'),
        reviewedBySub: null,
        reviewedByEmail: null,
        status: RegistrationStatus.APPROVED,
      });

      const result = buildActivityTrail(row);
      const adjudicated = result.find((e) => e.type === 'ADJUDICATED');

      expect(adjudicated).toEqual({
        type: 'ADJUDICATED',
        occurredAt: '2026-03-05T12:00:00.000Z',
        status: RegistrationStatus.APPROVED,
        reviewedBySub: null,
        reviewedByEmail: null,
      });
    });

    it('omits ADJUDICATED when reviewedAt is null — a pending registration has no adjudication event', () => {
      const row = fixtureRow({ reviewedAt: null, status: RegistrationStatus.PENDING_REVIEW });

      const result = buildActivityTrail(row);

      expect(result.some((e) => e.type === 'ADJUDICATED')).toBe(false);
    });
  });

  describe('ordering (order-stable — same input, same order, every time)', () => {
    it('lists events in chronological order by occurredAt, regardless of internal push order', () => {
      const row = fixtureRow({
        createdAt: new Date('2026-03-01T08:00:00.000Z'),
        emailVerifiedAt: new Date('2026-03-01T08:05:00.000Z'),
        consentAcceptedAt: new Date('2026-03-01T08:10:00.000Z'),
        duplicateDismissals: [
          {
            actorId: 'actor-a',
            dismissedBySub: 'sub-a',
            dismissedByEmail: 'a@example.com',
            // Deliberately BEFORE consentAcceptedAt in wall-clock time, to
            // prove ordering is by occurredAt, not by push order.
            dismissedAt: '2026-03-01T08:07:00.000Z',
          },
        ],
        reviewedAt: new Date('2026-03-02T00:00:00.000Z'),
        reviewedBySub: 'sub-reviewer',
        reviewedByEmail: 'reviewer@example.com',
        status: RegistrationStatus.APPROVED,
      });

      const result = buildActivityTrail(row);

      expect(result.map((e) => e.type)).toEqual([
        'SUBMITTED',
        'EMAIL_VERIFIED',
        'DUPLICATE_DISMISSED',
        'CONSENT_RECORDED',
        'ADJUDICATED',
      ]);
    });
  });
});
