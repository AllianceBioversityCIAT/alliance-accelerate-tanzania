// T-2 (docs/specs/auth/forgot-password-delivery, design.md §3 step 4, NFR-3).
//
// Mirrors backend/src/mail/mail.config.ts's getPublicAppBaseUrl() — same
// validation, same refusal behaviour, same "no trailing slash" contract —
// but DUPLICATED, not imported: design.md DD-1a decided this function
// carries its own minimal renderer/config rather than depending on the
// NestJS app, because this package is a standalone Lambda in a different
// deployable (`10-data-auth`, plain-JS ESM per DD-1b) and cannot import
// `backend/`'s TypeScript source.
//
// Read lazily — call this at message-build time, never cache the result at
// module load — so importing this module (e.g. from a test that never
// builds a message) cannot throw on its own.
//
// ATP-67's reasoning, restated here because it is the reason this throws
// rather than defaults: a hardcoded or silently-blank host means a link
// that quietly points at the wrong place forever, with nothing catching it.
// `*` is rejected explicitly because it is exactly the value a bootstrap
// deploy leaves an equivalent parameter at elsewhere in this system.

const BASE_URL_PATTERN = /^https?:\/\/[^\s*]+$/;

/**
 * Returns `PUBLIC_APP_BASE_URL` with no trailing slash, so callers append
 * their own path. Throws — refuses to return anything — when the variable
 * is unset, empty, `*`, or not an absolute http(s) URL (FR-1's
 * `AND IT MUST`, NFR-3).
 */
export function getPublicAppBaseUrl() {
  const value = process.env.PUBLIC_APP_BASE_URL;

  if (!value) {
    throw new Error(
      'Missing required PUBLIC_APP_BASE_URL. custom-email-sender refuses to ' +
        'build a link without a configured public app base URL (NFR-3; ' +
        "mirrors backend/src/mail/mail.config.ts's getPublicAppBaseUrl()).",
    );
  }

  if (!BASE_URL_PATTERN.test(value)) {
    throw new Error(
      'Invalid PUBLIC_APP_BASE_URL — expected an absolute http(s) URL for ' +
        'the public application (e.g. https://example.cloudfront.net). ' +
        'Refusing to build a link from it (NFR-3, ATP-67\'s mechanism, ' +
        'mirrored here). `*` is rejected explicitly.',
    );
  }

  return value.replace(/\/+$/, '');
}
