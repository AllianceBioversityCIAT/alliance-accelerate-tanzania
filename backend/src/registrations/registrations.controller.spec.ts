import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';
import {
  CONSENT_ACCEPTANCE_STATEMENT,
  CONSENT_POLICY_VERSION,
  isKnownConsentPolicyVersion,
} from './consent-policy';

/**
 * T-2 — RegistrationsController unit tests (FR-3).
 * T-8 adds `RegistrationsService` as a constructor dependency (`POST
 * /registrations/verify`) — a plain jest mock stands in for it here; the
 * mock's OWN behaviour (byte-identity across known/unknown/over-cap, the
 * timing mitigation) is proven at the HTTP level in
 * `registrations-verify.e2e.spec.ts`, not at this unit level. This suite's
 * job is only: does the controller call the service with the right
 * argument, and does it add no branching of its own.
 */
describe('RegistrationsController', () => {
  let controller: RegistrationsController;
  let service: {
    requestVerificationCode: jest.Mock;
    submitRegistration: jest.Mock;
    lookupRegistration: jest.Mock;
  };

  beforeEach(() => {
    service = {
      requestVerificationCode: jest.fn().mockResolvedValue(undefined),
      submitRegistration: jest.fn().mockResolvedValue({ reference: 'REG-2026-0001' }),
      lookupRegistration: jest.fn().mockResolvedValue({ status: 'PENDING_REVIEW' }),
    };
    controller = new RegistrationsController(service as unknown as RegistrationsService);
  });

  describe('GET /registrations/consent-policy', () => {
    it('returns a version and an ordered, non-empty list of sections', () => {
      const result = controller.getConsentPolicy();

      expect(typeof result.version).toBe('string');
      expect(result.version.length).toBeGreaterThan(0);
      expect(Array.isArray(result.sections)).toBe(true);
      expect(result.sections.length).toBeGreaterThan(0);
      for (const section of result.sections) {
        expect(typeof section.heading).toBe('string');
        expect(typeof section.body).toBe('string');
        expect(section.heading.length).toBeGreaterThan(0);
        expect(section.body.length).toBeGreaterThan(0);
      }
    });

    it('carries no PLACEHOLDER marker in the current edition — the inverted tripwire (T-9, FR-2 scenario 1)', () => {
      // INVERTED at T-9. Before the approved copy landed, this test asserted
      // the OPPOSITE — every section.body DID contain 'PLACEHOLDER' — as a
      // guard against shipping the mechanism without resolving OQ-1. Now
      // that the approved v1.0 edition is current, the risk points the
      // other way: approved-sounding copy that still carries a leftover
      // placeholder marker. This is the tripwire requirements.md FR-2
      // scenario 1 names explicitly for inversion — NOT
      // `consent-policy.spec.ts`'s `getConsentPolicyEdition('v1.0-placeholder')`
      // assertion, which is a retention guard over the historical edition
      // and stays correctly true forever (D-8). Searched case-insensitively
      // across BOTH heading and body, per FR-2 scenario 1's own wording.
      const { sections } = controller.getConsentPolicy();

      for (const section of sections) {
        expect(section.heading.toLowerCase()).not.toContain('placeholder');
        expect(section.body.toLowerCase()).not.toContain('placeholder');
      }
    });

    it(
      'returns a version that the server\'s own acceptance check will later ' +
        'honour — the FR-3/DD-7 round-trip property',
      () => {
        // This is the behavioural claim the Disqualifying clause demands:
        // not "the endpoint returns 200", and not two independent literals
        // that happen to match today, but that the *value the endpoint
        // just handed a client* is accepted by the predicate T-10 will run
        // server-side at POST /registrations. The expected value is
        // derived from the response itself, never hardcoded a second time
        // — hardcoding CONSENT_POLICY_VERSION on both sides would pass even
        // if the endpoint and the acceptance set had silently diverged,
        // which is exactly the drift hole DD-7 exists to close.
        const response = controller.getConsentPolicy();

        expect(isKnownConsentPolicyVersion(response.version)).toBe(true);
      },
    );

    it('serves the current CONSENT_POLICY_VERSION (sanity on the fixture above)', () => {
      expect(controller.getConsentPolicy().version).toBe(CONSENT_POLICY_VERSION);
    });

    it(
      'pins the exact response key set to {acceptanceStatement, version, sections} — T-9 ' +
        'rework attempt 2, Part 3, a DELIBERATE contract widen, not drift',
      () => {
        // This assertion REDDENED when `acceptanceStatement` was added to
        // the controller response — that was the correct, expected
        // consequence of a real contract change, per the Leader's brief:
        // CONSENT_ACCEPTANCE_STATEMENT previously had no reachable
        // consumer (the frontend cannot import `backend/src`), so
        // ConsentPolicyDisclosure.tsx hand-copied Legal's checkbox-label
        // sentence instead — exactly the two-divergent-copies problem
        // DD-7/D-1 exist to prevent. Widening this endpoint to serve the
        // one real sentence is the fix. Do NOT read a future redden here
        // as drift without first checking whether it is another
        // deliberate, Leader-directed widen like this one.
        const result = controller.getConsentPolicy();

        expect(Object.keys(result).sort()).toEqual(['acceptanceStatement', 'sections', 'version']);
      },
    );

    it('serves the acceptance statement wired to CONSENT_ACCEPTANCE_STATEMENT, not a copy', () => {
      expect(controller.getConsentPolicy().acceptanceStatement).toBe(CONSENT_ACCEPTANCE_STATEMENT);
    });
  });

  describe('isKnownConsentPolicyVersion (T-10\'s acceptance check)', () => {
    it('rejects a version the server has never issued', () => {
      expect(isKnownConsentPolicyVersion('not-a-real-version')).toBe(false);
      expect(isKnownConsentPolicyVersion('')).toBe(false);
    });

    it('accepts the version currently served', () => {
      expect(isKnownConsentPolicyVersion(CONSENT_POLICY_VERSION)).toBe(true);
    });

    it(
      'accepts a superseded version that is still in the known set (v1.0-placeholder, D-8, ' +
        'FR-2 scenario 2 — in-flight submissions do not break)',
      () => {
        expect(isKnownConsentPolicyVersion('v1.0-placeholder')).toBe(true);
      },
    );
  });

  describe('POST /registrations/verify (T-8)', () => {
    it('delegates to RegistrationsService.requestVerificationCode with the DTO email, once', async () => {
      await controller.requestVerificationCode({ email: 'applicant@example.com' });

      expect(service.requestVerificationCode).toHaveBeenCalledTimes(1);
      expect(service.requestVerificationCode).toHaveBeenCalledWith('applicant@example.com');
    });

    it('returns undefined regardless of what the service does internally — no branching lives here', async () => {
      const result = await controller.requestVerificationCode({ email: 'anyone@example.com' });

      expect(result).toBeUndefined();
    });

    it(
      'propagates only if the service itself throws (it never does for the cap — see ' +
        'RegistrationsService — so this handler adds no catch of its own)',
      async () => {
        const boom = new Error('unexpected failure');
        service.requestVerificationCode.mockRejectedValueOnce(boom);

        await expect(
          controller.requestVerificationCode({ email: 'anyone@example.com' }),
        ).rejects.toThrow(boom);
      },
    );
  });

  describe('POST /registrations (T-10)', () => {
    const dto = {
      email: 'neema@khsc.co.tz',
      code: '123456',
      // The service is a jest mock in this suite (see the file header) so
      // this DTO's job is only to be a plausible payload for the delegation
      // assertions below — it does not exercise real acceptance-check
      // behaviour. Sourced from CONSENT_POLICY_VERSION rather than a
      // hardcoded literal (T-9) since a hardcoded 'v1.0-placeholder' here
      // meant "the current version" pre-T-9 and would silently keep meaning
      // "a superseded version" post-T-9 if left as a stale literal.
      consent: { accepted: true, policyVersion: CONSENT_POLICY_VERSION },
      payload: { traderName: 'Mbeya Seed Traders Ltd' },
    } as unknown as Parameters<RegistrationsController['submitRegistration']>[0];

    it('delegates to RegistrationsService.submitRegistration with the DTO, once', async () => {
      await controller.submitRegistration(dto);

      expect(service.submitRegistration).toHaveBeenCalledTimes(1);
      expect(service.submitRegistration).toHaveBeenCalledWith(dto);
    });

    it('returns EXACTLY what the service returns — no spread, no added or dropped keys (FR-5, DC-2)', async () => {
      service.submitRegistration.mockResolvedValueOnce({ reference: 'REG-2026-0184' });

      const result = await controller.submitRegistration(dto);

      expect(result).toEqual({ reference: 'REG-2026-0184' });
      expect(Object.keys(result)).toEqual(['reference']);
    });

    it('propagates only if the service itself throws — this handler adds no branching of its own', async () => {
      const boom = new Error('unexpected failure');
      service.submitRegistration.mockRejectedValueOnce(boom);

      await expect(controller.submitRegistration(dto)).rejects.toThrow(boom);
    });
  });

  describe('POST /registrations/lookup (T-11)', () => {
    const dto = { reference: 'REG-2026-0184', email: 'neema@khsc.co.tz' };

    function fakeRequest(ip: string | undefined): Parameters<
      RegistrationsController['lookupRegistration']
    >[1] {
      return { ip } as unknown as Parameters<RegistrationsController['lookupRegistration']>[1];
    }

    it('delegates to RegistrationsService.lookupRegistration with reference, email, and req.ip', async () => {
      await controller.lookupRegistration(dto, fakeRequest('203.0.113.99'));

      expect(service.lookupRegistration).toHaveBeenCalledTimes(1);
      expect(service.lookupRegistration).toHaveBeenCalledWith(
        'REG-2026-0184',
        'neema@khsc.co.tz',
        '203.0.113.99',
      );
    });

    it(
      "falls back to a bounded 'unknown' caller identity when req.ip is undefined, rather than " +
        'throwing — this endpoint must never 500 over a missing rate-limiting tracker',
      async () => {
        await controller.lookupRegistration(dto, fakeRequest(undefined));

        expect(service.lookupRegistration).toHaveBeenCalledWith(
          'REG-2026-0184',
          'neema@khsc.co.tz',
          'unknown',
        );
      },
    );

    it('returns EXACTLY what the service returns — no spread, no added or dropped keys (FR-6, DC-2)', async () => {
      service.lookupRegistration.mockResolvedValueOnce({
        status: 'REJECTED',
        reviewNote: 'Duplicate of an existing registry record.',
      });

      const result = await controller.lookupRegistration(dto, fakeRequest('203.0.113.99'));

      expect(result).toEqual({
        status: 'REJECTED',
        reviewNote: 'Duplicate of an existing registry record.',
      });
      expect(Object.keys(result).sort()).toEqual(['reviewNote', 'status']);
    });

    it('propagates only if the service itself throws (the byte-identical 404 lives in the service, not here)', async () => {
      const notFound = new Error('Not Found');
      service.lookupRegistration.mockRejectedValueOnce(notFound);

      await expect(
        controller.lookupRegistration(dto, fakeRequest('203.0.113.99')),
      ).rejects.toThrow(notFound);
    });
  });
});
