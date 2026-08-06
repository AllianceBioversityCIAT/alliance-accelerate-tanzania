import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';
import {
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

    it('marks section bodies as an unmistakable placeholder pending OQ-1', () => {
      // The mechanism is this task's deliverable; the prose is not. Legal
      // owns the wording (tasks.md T-2) — asserting the placeholder marker
      // guards against someone later swapping in authoritative-sounding
      // copy without also resolving OQ-1.
      const { sections } = controller.getConsentPolicy();

      for (const section of sections) {
        expect(section.body).toContain('PLACEHOLDER');
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
  });

  describe('isKnownConsentPolicyVersion (T-10\'s acceptance check)', () => {
    it('rejects a version the server has never issued', () => {
      expect(isKnownConsentPolicyVersion('not-a-real-version')).toBe(false);
      expect(isKnownConsentPolicyVersion('')).toBe(false);
    });

    it('accepts the version currently served', () => {
      expect(isKnownConsentPolicyVersion(CONSENT_POLICY_VERSION)).toBe(true);
    });
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
      consent: { accepted: true, policyVersion: 'v1.0-placeholder' },
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
