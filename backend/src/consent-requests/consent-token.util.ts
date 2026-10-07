/**
 * T-4 — Consent-link token minting (design.md §5.3, DD-3; FR-8, NFR-1).
 *
 * `randomBytes(32)` is 256 bits from the platform CSPRNG, base64url-encoded
 * so it drops cleanly into a URL fragment with no escaping. Only the SHA-256
 * hash of the raw value is ever persisted (`ConsentRequest.tokenHash`) — the
 * raw token exists only in `ConsentRequestsService.dispatch`'s call stack and
 * the outgoing email body, never in a log line, the database, or any
 * response (NFR-1).
 */
import { createHash, randomBytes } from 'crypto';

/** 256 bits (NFR-1's floor), before base64url encoding. */
export const CONSENT_TOKEN_BYTES = 32;

/** Mint a fresh raw token. Never logged, never stored directly. */
export function generateConsentToken(): string {
  return randomBytes(CONSENT_TOKEN_BYTES).toString('base64url');
}

/** The constant-cost lookup key stored against the row (`findUnique({ tokenHash })`). */
export function hashConsentToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
