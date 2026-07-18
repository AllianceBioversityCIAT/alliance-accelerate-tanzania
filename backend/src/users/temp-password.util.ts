// @sdd-spec admin/user-management
/**
 * Cryptographically-random temporary password generator for admin-mediated
 * credential handoff.
 *
 * The team chose admin-mediated credential sharing over email invites because
 * recipients are corporate @cgiar.org inboxes with poor deliverability. The
 * admin creates/resets a user, Cognito sends NO email (`MessageAction: 'SUPPRESS'`
 * / `AdminSetUserPassword` with `Permanent: false`), and the backend returns this
 * one-time temporary password so the admin can share it out-of-band. The user is
 * left in `FORCE_CHANGE_PASSWORD` and must change it at first sign-in.
 *
 * The generated password satisfies the Cognito pool password policy: length >= 12
 * with at least one uppercase, one lowercase, one digit, and one symbol. An
 * ambiguity-free alphabet is used for legibility when the admin reads it aloud or
 * copies it (no `0/O`, `1/l/I`, etc.).
 *
 * SECURITY: the value this returns is a secret. Callers MUST return it ONLY in the
 * Admin-guarded HTTP response body — never log it, store it, or place it in an
 * error message.
 */

import { randomInt } from 'node:crypto';

/** Fixed generated length (>= the pool minimum of 12). */
const PASSWORD_LENGTH = 16;

/** Ambiguity-free character classes (no 0/O/1/l/I and similar look-alikes). */
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%*?-_';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

/** Pick one random character from a class using a CSPRNG. */
function pick(pool: string): string {
  return pool[randomInt(pool.length)];
}

/** In-place Fisher–Yates shuffle driven by `crypto.randomInt`. */
function shuffle(chars: string[]): void {
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
}

/**
 * Generate a 16-char, policy-valid temporary password. Guarantees at least one
 * character from each required class, fills the remainder from the full
 * alphabet, then shuffles so the guaranteed characters are not positionally
 * predictable.
 */
export function generateTemporaryPassword(): string {
  const chars: string[] = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];

  while (chars.length < PASSWORD_LENGTH) {
    chars.push(pick(ALL));
  }

  shuffle(chars);
  return chars.join('');
}
