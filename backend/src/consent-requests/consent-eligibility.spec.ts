// @sdd-spec actors/consent-intake/consent-request-email (T-3)
import {
  ConsentEligibilityRequest,
  emptyConsentSkipCounts,
  evaluateConsentEligibility,
} from './consent-eligibility';

const NOW = new Date('2026-10-05T12:00:00.000Z');

function request(
  overrides: Partial<ConsentEligibilityRequest> = {},
): ConsentEligibilityRequest {
  return {
    status: 'SENT',
    expiresAt: new Date('2026-11-04T12:00:00.000Z'),
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('evaluateConsentEligibility (FR-2)', () => {
  describe('the five-reason matrix — one actor per reason, bulk scope (FR-2 scenario 1)', () => {
    it('no_email: an actor with no email', () => {
      expect(
        evaluateConsentEligibility({ email: null, consentStatus: 'UNKNOWN' }, [], 'bulk', NOW),
      ).toBe('no_email');
    });

    it('granted: consentStatus GRANTED', () => {
      expect(
        evaluateConsentEligibility(
          { email: 'a@example.com', consentStatus: 'GRANTED' },
          [],
          'bulk',
          NOW,
        ),
      ).toBe('granted');
    });

    it('pending_request: an open QUEUED/SENDING/FAILED/unexpired-SENT request', () => {
      expect(
        evaluateConsentEligibility(
          { email: 'a@example.com', consentStatus: 'UNKNOWN' },
          [request({ status: 'QUEUED' })],
          'bulk',
          NOW,
        ),
      ).toBe('pending_request');
    });

    it('declined: the latest request was DECLINED (D-21)', () => {
      expect(
        evaluateConsentEligibility(
          { email: 'a@example.com', consentStatus: 'DENIED' },
          [request({ status: 'DECLINED', createdAt: new Date('2026-10-02T00:00:00Z') })],
          'bulk',
          NOW,
        ),
      ).toBe('declined');
    });

    it('eligible: has email, not GRANTED, no pending request, latest request (if any) not DECLINED', () => {
      expect(
        evaluateConsentEligibility(
          { email: 'a@example.com', consentStatus: 'UNKNOWN' },
          [],
          'bulk',
          NOW,
        ),
      ).toBe('eligible');
    });
  });

  it('an expired request does not block (FR-2 scenario 2)', () => {
    const outcome = evaluateConsentEligibility(
      { email: 'a@example.com', consentStatus: 'UNKNOWN' },
      [request({ status: 'SENT', expiresAt: new Date('2026-09-01T00:00:00Z') })],
      'bulk',
      NOW,
    );
    expect(outcome).toBe('eligible');
  });

  it('a SENT request with no expiresAt is never treated as pending (defensive — malformed data)', () => {
    const outcome = evaluateConsentEligibility(
      { email: 'a@example.com', consentStatus: 'UNKNOWN' },
      [request({ status: 'SENT', expiresAt: null })],
      'bulk',
      NOW,
    );
    expect(outcome).toBe('eligible');
  });

  describe('single vs bulk scope on a decliner (FR-2 scenario 3)', () => {
    const declinerRequests = [
      request({ status: 'DECLINED', createdAt: new Date('2026-10-02T00:00:00Z') }),
    ];

    it('bulk skips a decliner', () => {
      expect(
        evaluateConsentEligibility(
          { email: 'a@example.com', consentStatus: 'DENIED' },
          declinerRequests,
          'bulk',
          NOW,
        ),
      ).toBe('declined');
    });

    it('single re-asks a decliner — it is eligible', () => {
      expect(
        evaluateConsentEligibility(
          { email: 'a@example.com', consentStatus: 'DENIED' },
          declinerRequests,
          'single',
          NOW,
        ),
      ).toBe('eligible');
    });
  });

  it("single scope does not skip a pending request — it is eligible (enqueue supersedes it, FR-3)", () => {
    const outcome = evaluateConsentEligibility(
      { email: 'a@example.com', consentStatus: 'UNKNOWN' },
      [request({ status: 'QUEUED' })],
      'single',
      NOW,
    );
    expect(outcome).toBe('eligible');
  });

  it('uses the MOST RECENT request to decide "declined", not just any request with that status', () => {
    const outcome = evaluateConsentEligibility(
      { email: 'a@example.com', consentStatus: 'UNKNOWN' },
      [
        request({ status: 'DECLINED', createdAt: new Date('2026-09-01T00:00:00Z') }),
        request({ status: 'SUPERSEDED', createdAt: new Date('2026-10-01T00:00:00Z') }),
      ],
      'bulk',
      NOW,
    );
    expect(outcome).toBe('eligible');
  });

  describe('FAILED is in the pending set (falsifier: dropping it must redden a double-enqueue fixture)', () => {
    it('a FAILED request blocks a bulk send (resume with Retry, never a fresh send)', () => {
      const outcome = evaluateConsentEligibility(
        { email: 'a@example.com', consentStatus: 'UNKNOWN' },
        [request({ status: 'FAILED' })],
        'bulk',
        NOW,
      );
      expect(outcome).toBe('pending_request');
    });
  });

  it('SENDING blocks a bulk send', () => {
    const outcome = evaluateConsentEligibility(
      { email: 'a@example.com', consentStatus: 'UNKNOWN' },
      [request({ status: 'SENDING' })],
      'bulk',
      NOW,
    );
    expect(outcome).toBe('pending_request');
  });
});

describe('emptyConsentSkipCounts', () => {
  it('returns a zero-initialized record for all four skip reasons', () => {
    expect(emptyConsentSkipCounts()).toEqual({
      no_email: 0,
      granted: 0,
      pending_request: 0,
      declined: 0,
    });
  });
});
