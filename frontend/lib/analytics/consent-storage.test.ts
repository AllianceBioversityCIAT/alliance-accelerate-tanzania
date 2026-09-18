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

/** Restores whatever `window.localStorage` accessor existed before a test
 *  that replaces it, so throwing tests cannot leak into later tests. */
function withPatchedLocalStorage(
  descriptor: PropertyDescriptor,
  run: () => void,
): void {
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', { ...descriptor, configurable: true });
  try {
    run();
  } finally {
    if (original) {
      Object.defineProperty(window, 'localStorage', original);
    }
  }
}

beforeEach(() => {
  window.localStorage.clear();
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
