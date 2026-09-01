// @sdd-spec enhancement/usage-analytics (T-1)
/**
 * consent-storage.ts — the FR-3 consent storage contract
 * (requirements.md FR-3, design.md §5.2, DD-2).
 *
 * Owns the storage key, the policy-version constant, and total tolerance
 * of unavailable or throwing storage. Pure module: no React, no component,
 * nothing rendered — the three-state value this file computes is consumed
 * by `ConsentProvider` (a later task), never produced by it.
 *
 * Why `localStorage`, not a cookie: DD-2. Under ADR-002 (static export)
 * there is no server to read a cookie, so a cookie would be transmitted on
 * every API request for no consumer; `localStorage` is the only client-side
 * home for a choice that never needs to leave the browser.
 *
 * Graceful-absence posture, matched to `frontend/lib/auth/amplify-config.ts`:
 * the variable (here, a readable, working `window.localStorage`) may be
 * missing or may throw on access — during static prerender `window` does
 * not exist at all, and in real browsers some private-browsing modes make
 * *reading* `window.localStorage` itself raise a `SecurityError`, not just
 * calling a method on it. Every exported function degrades quietly in both
 * cases and never throws. design.md §5.2 pins the safe direction: absence
 * (of `window`, of a record, or of a workable accessor) always resolves to
 * `undecided` — it must never resolve to `granted`, because a `granted`
 * value returned when nothing was actually stored would let analytics load
 * without consent (FR-1).
 */

/** Bumping this re-prompts every visitor — the mechanism a materially
 *  revised disclosure (FR-6) will need. */
export const CONSENT_POLICY_VERSION = 1;

export const CONSENT_STORAGE_KEY = 'accelerate-tz:analytics-consent';

export type ConsentChoice = 'granted' | 'denied';

/** The three states design.md §5.2 names. `undecided` is the initial value
 *  on every render path, including the one where storage throws. */
export type ConsentState = 'undecided' | ConsentChoice;

interface StoredConsentRecord {
  version: number;
  choice: ConsentChoice;
  timestamp: string;
}

function isConsentChoice(value: unknown): value is ConsentChoice {
  return value === 'granted' || value === 'denied';
}

/** Structural validation of parsed JSON — a record shaped by an older
 *  build of this module, or corrupted, is treated as absent rather than
 *  trusted. Absence must never resolve to `granted` (FR-3). */
function isStoredConsentRecord(value: unknown): value is StoredConsentRecord {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.version === 'number' &&
    isConsentChoice(candidate.choice) &&
    typeof candidate.timestamp === 'string'
  );
}

/**
 * Reads the visitor's consent record.
 *
 * Resolves to `undecided` — never throws — when: `window` does not exist
 * (SSR/static prerender); `window.localStorage` itself throws on access
 * (private-mode `SecurityError`); no record is stored; the stored record
 * fails structural validation; or the stored record's version is older
 * than `CONSENT_POLICY_VERSION`. A `denied` record at the current version
 * resolves to `denied`, not `undecided` — rejection is durable (FR-3
 * "AND IT MUST").
 */
export function readConsent(): ConsentState {
  try {
    if (typeof window === 'undefined') return 'undecided';

    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return 'undecided';

    const parsed: unknown = JSON.parse(raw);
    if (!isStoredConsentRecord(parsed)) return 'undecided';
    if (parsed.version < CONSENT_POLICY_VERSION) return 'undecided';

    return parsed.choice;
  } catch {
    // Any failure reading/parsing storage resolves to the safe direction.
    return 'undecided';
  }
}

/**
 * Writes the visitor's choice against the current policy version. Total
 * tolerance of storage that is absent or throws (FR-3): a failed write
 * never propagates, and simply leaves the visitor `undecided` on the next
 * read — the banner will re-appear rather than the app crashing.
 */
export function writeConsent(choice: ConsentChoice): void {
  try {
    if (typeof window === 'undefined') return;

    const record: StoredConsentRecord = {
      version: CONSENT_POLICY_VERSION,
      choice,
      timestamp: new Date().toISOString(),
    };
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Swallow — a rejected write must not crash the page (FR-3, FR-7 posture).
  }
}

/**
 * Clears the visitor's stored choice. Exposed for the `/privacy`
 * change-choice control (T-6, FR-6) to reset state before re-recording a
 * new choice; not required to succeed for the module's contract to hold.
 */
export function clearConsent(): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    // Swallow — same tolerance as readConsent/writeConsent.
  }
}
