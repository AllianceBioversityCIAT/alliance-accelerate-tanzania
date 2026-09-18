import {
  DUPLICATE_OF_EXISTING_RECORD_REASON_CODE,
  REJECTION_REASON_CODES,
  REJECTION_REASONS,
} from './rejection-reasons';

/**
 * T-9 — `rejection-reasons.ts` (FR-11 scenario 3, FR-13 scenario 1).
 */
describe('rejection-reasons', () => {
  it('is frozen — the list and every element (append-only discipline, mirroring consent-policy.ts)', () => {
    expect(Object.isFrozen(REJECTION_REASONS)).toBe(true);
    for (const reason of REJECTION_REASONS) {
      expect(Object.isFrozen(reason)).toBe(true);
    }
    expect(Object.isFrozen(REJECTION_REASON_CODES)).toBe(true);
  });

  it('FR-11 scenario 3 — "Duplicate of an existing registry record" is present, first-class and structured', () => {
    const duplicateReason = REJECTION_REASONS.find(
      (reason) => reason.code === DUPLICATE_OF_EXISTING_RECORD_REASON_CODE,
    );
    expect(duplicateReason).toBeDefined();
    expect(duplicateReason?.label).toBe('Duplicate of an existing registry record');
  });

  it('REJECTION_REASON_CODES is derived from REJECTION_REASONS, never a second hand-copied list', () => {
    expect(REJECTION_REASON_CODES).toEqual(REJECTION_REASONS.map((r) => r.code));
  });

  it('every code is unique', () => {
    expect(new Set(REJECTION_REASON_CODES).size).toBe(REJECTION_REASON_CODES.length);
  });
});
