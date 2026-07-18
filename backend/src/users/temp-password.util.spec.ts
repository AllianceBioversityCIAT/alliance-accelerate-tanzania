// @sdd-spec admin/user-management
/**
 * Unit tests for {@link generateTemporaryPassword}: it must produce a legible,
 * 16-char password that satisfies the Cognito pool policy (>= 1 upper, lower,
 * digit, symbol) and be non-repeating across many generations (randomness
 * sanity — a broken/constant generator would collide immediately).
 */

import { generateTemporaryPassword } from './temp-password.util';

describe('generateTemporaryPassword', () => {
  it('is exactly 16 characters long', () => {
    expect(generateTemporaryPassword()).toHaveLength(16);
  });

  it('contains at least one uppercase, lowercase, digit, and symbol', () => {
    // Run many times so a class that is only "usually" present would be caught.
    for (let i = 0; i < 200; i += 1) {
      const pw = generateTemporaryPassword();
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(/[!@#$%*?\-_]/);
    }
  });

  it('uses only the legible (ambiguity-free) alphabet', () => {
    const allowed = /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%*?\-_]+$/;
    for (let i = 0; i < 200; i += 1) {
      expect(generateTemporaryPassword()).toMatch(allowed);
    }
  });

  it('produces 100 distinct passwords (randomness sanity)', () => {
    const generated = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      generated.add(generateTemporaryPassword());
    }
    expect(generated.size).toBe(100);
  });
});
