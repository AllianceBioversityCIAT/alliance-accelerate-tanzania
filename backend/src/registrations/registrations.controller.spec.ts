import { RegistrationsController } from './registrations.controller';
import {
  CONSENT_POLICY_VERSION,
  isKnownConsentPolicyVersion,
} from './consent-policy';

/**
 * T-2 — RegistrationsController unit tests (FR-3).
 *
 * No TestingModule bootstrap needed — the controller has no injected
 * dependencies (`metrics.controller.spec.ts` is the project's precedent for
 * a plain `new Controller()` unit test).
 */
describe('RegistrationsController', () => {
  let controller: RegistrationsController;

  beforeEach(() => {
    controller = new RegistrationsController();
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
});
