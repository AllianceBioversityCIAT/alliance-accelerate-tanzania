// @sdd-spec actors/consent-intake/consent-request-email (T-4)
/**
 * `consent-token.util` (design.md §5.3, DD-3; FR-8 "not derivable from anything
 * else the system exposes", NFR-1).
 */
import * as crypto from 'crypto';
import { CONSENT_TOKEN_BYTES, generateConsentToken, hashConsentToken } from './consent-token.util';

// `crypto`'s exports are non-configurable, so spyOn cannot patch them; wrap randomBytes
// as a pass-through jest.fn the one test below can override.
jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto');
  return { ...actual, randomBytes: jest.fn(actual.randomBytes) };
});

describe('consent-token.util', () => {

  it('two mints differ', () => {
    expect(generateConsentToken()).not.toBe(generateConsentToken());
  });

  it('the token is exactly base64url of CSPRNG bytes (randomBytes is its only entropy source)', () => {
    const fixed = Buffer.from(Array.from({ length: CONSENT_TOKEN_BYTES }, (_, i) => i + 1));
    const spy = crypto.randomBytes as unknown as jest.Mock;
    spy.mockReturnValueOnce(fixed);

    expect(generateConsentToken()).toBe(fixed.toString('base64url'));
    expect(spy).toHaveBeenLastCalledWith(32);
  });

  it('the hash is sha256 hex of the token and differs per token', () => {
    const a = generateConsentToken();
    const b = generateConsentToken();
    expect(hashConsentToken(a)).toBe(crypto.createHash('sha256').update(a).digest('hex'));
    expect(hashConsentToken(a)).not.toBe(hashConsentToken(b));
  });
});
