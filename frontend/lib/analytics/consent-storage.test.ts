// @sdd-spec enhancement/usage-analytics (T-1)
/**
 * consent-storage.test.ts
 *
 * TDD red -> green loop for the FR-3 consent storage contract
 * (requirements.md FR-3, design.md §5.2, DD-2).
 *
 * The disqualifier this suite exists to satisfy: a storage stand-in whose
 * accessor merely returns benign values (e.g. `{ getItem: () => null }`)
 * proves only the absent-record path, not failure tolerance. The
 * throwing-storage tests below instead replace `window.localStorage`
 * itself with an accessor that genuinely raises — the same shape as the
 * real Safari-private-mode failure this clause exists for, where reading
 * `window.localStorage` (not just calling a method on it) throws a
 * `SecurityError`.
 */

import {
  readConsent,
  writeConsent,
  clearConsent,
  CONSENT_STORAGE_KEY,
  CONSENT_POLICY_VERSION,
} from './consent-storage';

/**
 * The pristine `window.localStorage` descriptor, captured ONCE at module load
 * — before any test has patched anything.
 *
 * Captured here rather than inside the helper because the helper's own
 * capture is what broke: it read the descriptor at patch time and restored
 * only `if (original)`. On the Jenkins agent that capture came back empty for
 * the second patch, the restore was skipped, and the `{ getItem, setItem,
 * removeItem }` stub — which has no `clear` — leaked into the `beforeEach`
 * below. Every later test in the file then died on
 * `window.localStorage.clear is not a function`, three of them, while the
 * production code under test was perfectly fine.
 *
 * If this is ever empty the suite refuses to run, rather than degrading: an
 * earlier revision of this fix fell back to `delete window.localStorage`, and
 *measurement showed that is strictly worse here — jsdom exposes `localStorage` as an OWN
 * accessor with nothing behind it on the prototype, so deleting it leaves
 * `undefined` and every test in the file dies instead of three.
 */
const capturedLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');

if (!capturedLocalStorage) {
  throw new Error(
    'consent-storage.test.ts cannot guarantee test isolation: window.localStorage ' +
      'is not an own property of window in this jsdom, so the patched stub could ' +
      'not be reliably put back. Failing loudly at load beats three confusing ' +
      '"clear is not a function" errors several tests later.',
  );
}

const PRISTINE_LOCAL_STORAGE: PropertyDescriptor = capturedLocalStorage;

/** Put `window.localStorage` back exactly as the module found it. Unconditional. */
function restorePristineLocalStorage(): void {
  Object.defineProperty(window, 'localStorage', PRISTINE_LOCAL_STORAGE);
}

/** Replaces `window.localStorage` for one test, then always puts it back. */
function withPatchedLocalStorage(
  descriptor: PropertyDescriptor,
  run: () => void,
): void {
  Object.defineProperty(window, 'localStorage', { ...descriptor, configurable: true });
  try {
    run();
  } finally {
    restorePristineLocalStorage();
  }
}

// Three restore points, none of them load-bearing alone. Measured, not
// assumed — each covers a case the others do not:
//   · beforeEach — starts every test from a known storage object, so one
//     escaped stub cannot cascade through the rest of the file (the observed
//     Jenkins failure: three tests down from a single leak).
//   · the helper's own `finally` — puts it back immediately, so a test that
//     inspects storage after `withPatchedLocalStorage` returns sees reality.
//   · afterEach — covers the LAST test in the file, where there is no next
//     `beforeEach` to clean up. Disabling the `finally` and running under
//     Node 20 showed this exact gap: a throwing getter left installed past
//     the final test takes down the jsdom teardown with "Test suite failed
//     to run", not a normal assertion failure.
beforeEach(() => {
  // Restore FIRST, then clear — clearing whatever the previous test left is
  // precisely what threw "clear is not a function".
  restorePristineLocalStorage();
  window.localStorage.clear();
});

afterEach(() => {
  restorePristineLocalStorage();
});

describe('consent-storage — round trip (FR-3 scenario 1)', () => {
  it('a granted choice written via writeConsent is read back as granted', () => {
    writeConsent('granted');
    expect(readConsent()).toBe('granted');
  });

  it('survives being read again without a fresh write (reload/navigation)', () => {
    writeConsent('granted');
    expect(readConsent()).toBe('granted');
    expect(readConsent()).toBe('granted');
  });
});

describe('consent-storage — denied persists as denied, not absence (FR-3 "AND IT MUST")', () => {
  it('a denied choice is read back as denied, never as undecided', () => {
    writeConsent('denied');
    expect(readConsent()).toBe('denied');
  });
});

describe('consent-storage — absent record (FR-3 "BUT it must NOT")', () => {
  it('reads as undecided when nothing has ever been written', () => {
    expect(readConsent()).toBe('undecided');
  });

  it('reads as undecided after the record is cleared', () => {
    writeConsent('granted');
    clearConsent();
    expect(readConsent()).toBe('undecided');
  });
});

describe('consent-storage — stale policy version (FR-3 scenario 2)', () => {
  it('a record written against a lower policy version reads as undecided', () => {
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({
        version: CONSENT_POLICY_VERSION - 1,
        choice: 'granted',
        timestamp: new Date().toISOString(),
      }),
    );
    expect(readConsent()).toBe('undecided');
  });

  it('a record at the current policy version is honoured, not treated as stale', () => {
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({
        version: CONSENT_POLICY_VERSION,
        choice: 'granted',
        timestamp: new Date().toISOString(),
      }),
    );
    expect(readConsent()).toBe('granted');
  });
});

describe('consent-storage — throwing storage (FR-3 scenario 3)', () => {
  it('readConsent yields undecided, without propagating, when window.localStorage itself throws', () => {
    withPatchedLocalStorage(
      {
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      },
      () => {
        expect(() => readConsent()).not.toThrow();
        expect(readConsent()).toBe('undecided');
      },
    );
  });

  it('readConsent yields undecided, without propagating, when getItem itself throws', () => {
    withPatchedLocalStorage(
      {
        value: {
          getItem: () => {
            throw new DOMException('The operation is insecure.', 'SecurityError');
          },
          setItem: () => {},
          removeItem: () => {},
        },
      },
      () => {
        expect(() => readConsent()).not.toThrow();
        expect(readConsent()).toBe('undecided');
      },
    );
  });

  it('writeConsent does not propagate when window.localStorage itself throws', () => {
    withPatchedLocalStorage(
      {
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      },
      () => {
        expect(() => writeConsent('granted')).not.toThrow();
      },
    );
  });

  it('writeConsent does not propagate when setItem itself throws (quota/private-mode)', () => {
    withPatchedLocalStorage(
      {
        value: {
          getItem: () => null,
          setItem: () => {
            throw new DOMException('QuotaExceededError', 'QuotaExceededError');
          },
          removeItem: () => {},
        },
      },
      () => {
        expect(() => writeConsent('granted')).not.toThrow();
      },
    );
  });

  it('clearConsent does not propagate when window.localStorage itself throws', () => {
    withPatchedLocalStorage(
      {
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      },
      () => {
        expect(() => clearConsent()).not.toThrow();
      },
    );
  });
});
