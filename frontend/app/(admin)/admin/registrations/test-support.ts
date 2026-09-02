/**
 * Shared test setup for the two registrations admin page suites —
 * `page.test.tsx` and `review/page.test.tsx`. Both files are new in this
 * branch and nothing outside them depends on either, so this module only
 * needs to serve the two of them (duplication remediation for
 * admin/registration-review-queue).
 *
 * jest's Babel hoist (`babel-plugin-jest-hoist`) only lets a `jest.mock(...)`
 * factory close over out-of-scope identifiers that are prefixed `mock`
 * (case-insensitive) — so the actual `jest.fn()` spies stay declared
 * locally in each test file. This module only centralises the parts that
 * do NOT need to be one of those closures: the fake error classes (which
 * were byte-identical in both files) and the `jest.requireActual` +
 * override boilerplate used to partially mock
 * `@/lib/api/registrations-admin`. Each `jest.mock(...)` factory pulls
 * these in with a plain `require(...)` call, which the hoist plugin does
 * not restrict (only bare outer-scope identifier references are).
 */

/**
 * Fake `AuthFailureError` — used by both suites so `instanceof` checks in
 * the pages under test keep working without pulling in the rest of
 * `@/lib/api/client`'s real exports (which would require a real fetch
 * environment).
 */
export class AuthFailureError extends Error {
  readonly status = 401;
  constructor(msg = 'Session expired') {
    super(msg);
    this.name = 'AuthFailureError';
  }
}

/**
 * Fake `ApiError` — only `review/page.test.tsx` needs this today (the 404
 * and R5 refresh-failure cases construct one); `page.test.tsx` does not
 * mock it. Kept alongside `AuthFailureError` because both are the same
 * "fake `@/lib/api/client`" concern.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/**
 * Builds a `jest.mock(...)` factory return value that keeps every real
 * export of `modulePath` except the ones named in `overrides` — the
 * pattern both suites use to swap exactly one API function
 * (`adminListRegistrations` / `adminGetRegistration`) for a `jest.fn()`
 * spy while leaving the module's types and other real exports (e.g.
 * request/response type re-exports) untouched.
 */
export function withRealExportsExcept<T extends Record<string, unknown>>(
  modulePath: string,
  overrides: T,
): T {
  const actual = jest.requireActual(modulePath);
  return { ...actual, ...overrides };
}
