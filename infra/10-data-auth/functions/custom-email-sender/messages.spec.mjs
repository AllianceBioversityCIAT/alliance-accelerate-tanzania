// T-2 — the falsifier suite named in tasks.md: base URL "*" and unset must
// redden the attribute-verification builder; a host hardcoded in either
// message must redden.
//
// Disqualifier this suite is written against: asserting the substring
// "https://" is present proves *a* link exists, never that it is the
// *configured* one — and never that it is at the *expected path*. Every
// host assertion below is keyed to the derived host (not a bare
// `https://`), and every builder additionally gets its exact emitted path
// pinned (T-2 attempt 2, Reviewer FAIL B), so a future edit that
// re-points a link at the wrong path reddens even though the host is
// still correct.
//
// T-2 attempt 2 (Reviewer FAIL A): the password-reset message no longer
// emits any link at all — see messages.mjs's builder-level comment. It is
// therefore NOT part of the shared host/falsifier sweep below; it gets its
// own "emits zero URLs" block, which is the positive form of the same
// vacuity guard (never silently pass over an empty set — assert the empty
// set on purpose).

import { buildPasswordResetMessage, buildAttributeVerificationMessage } from './messages.mjs';

const CODE = '482913';
const TO = 'user@example.org';
const ORIGINAL = process.env.PUBLIC_APP_BASE_URL;

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.PUBLIC_APP_BASE_URL;
  } else {
    process.env.PUBLIC_APP_BASE_URL = ORIGINAL;
  }
});

/** Every http(s) URL-shaped substring in a string, deduped. */
function urlsIn(text) {
  return new Set(text.match(/https?:\/\/[^\s"'<>]+/g) || []);
}

/** Union of every URL-shaped substring across both the text and html parts. */
function allUrls(message) {
  return new Set([...urlsIn(message.text), ...urlsIn(message.html)]);
}

// ---------------------------------------------------------------------------
// Shared behaviour — both builders, regardless of whether they emit a link.
// ---------------------------------------------------------------------------

const BUILDERS = [
  ['password reset', buildPasswordResetMessage],
  ['attribute verification', buildAttributeVerificationMessage],
];

describe.each(BUILDERS)('%s message', (name, build) => {
  it('carries the code, not a password (FR-1 BUT it must NOT)', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://configured.example.org';
    const message = build(TO, CODE);
    expect(message.text).toContain(CODE);
    expect(message.html).toContain(CODE);
    // No credential-handoff phrasing (contrast with
    // backend/src/mail/templates/admin-reset.template.ts, which legitimately
    // carries a real password and says so) — this flow never has one to say.
    expect(message.text.toLowerCase()).not.toMatch(/new password is|temporary password/);
    expect(message.html.toLowerCase()).not.toMatch(/new password is|temporary password/);
  });

  it('does not claim the message arrived (FR-4 BUT it must NOT — delivery is not asserted)', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://configured.example.org';
    const message = build(TO, CODE);
    expect(message.text.toLowerCase()).not.toMatch(/\b(arrived|delivered|received)\b/);
    expect(message.html.toLowerCase()).not.toMatch(/\b(arrived|delivered|received)\b/);
  });

  it('carries the recipient address unchanged, for the caller to publish to', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://configured.example.org';
    const message = build(TO, CODE);
    expect(message.to).toBe(TO);
  });
});

// ---------------------------------------------------------------------------
// Password reset — emits NO link (T-2 attempt 2, Reviewer FAIL A).
// ---------------------------------------------------------------------------

describe('password reset message', () => {
  it('emits zero URLs in either part — the positive form of the vacuity guard: an empty set is the assertion, not an oversight', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://configured.example.org';
    const message = buildPasswordResetMessage(TO, CODE);
    expect(urlsIn(message.text).size).toBe(0);
    expect(urlsIn(message.html).size).toBe(0);
  });

  it('directs the reader back to where they started, not to any page or path', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://configured.example.org';
    const message = buildPasswordResetMessage(TO, CODE);
    expect(message.text.toLowerCase()).not.toMatch(/forgot-password|reset page|password reset page/);
    expect(message.html.toLowerCase()).not.toMatch(/forgot-password|reset page|password reset page/);
  });

  it('renders identically regardless of PUBLIC_APP_BASE_URL — unset, "*", or any value — because it never reads it', () => {
    delete process.env.PUBLIC_APP_BASE_URL;
    const unset = buildPasswordResetMessage(TO, CODE);

    process.env.PUBLIC_APP_BASE_URL = '*';
    const star = buildPasswordResetMessage(TO, CODE);

    process.env.PUBLIC_APP_BASE_URL = 'https://configured.example.org';
    const configured = buildPasswordResetMessage(TO, CODE);

    expect(unset).toEqual(star);
    expect(star).toEqual(configured);
  });
});

// ---------------------------------------------------------------------------
// Attribute verification — keeps the full derived-host sweep and the
// falsifiers, since it is the only builder left that emits a link.
// ---------------------------------------------------------------------------

describe('attribute verification message', () => {
  it('FALSIFIER 2 — refuses (throws) when PUBLIC_APP_BASE_URL is unset, rather than emitting a link', () => {
    delete process.env.PUBLIC_APP_BASE_URL;
    expect(() => buildAttributeVerificationMessage(TO, CODE)).toThrow(/PUBLIC_APP_BASE_URL/);
  });

  it('FALSIFIER 1 — refuses (throws) when PUBLIC_APP_BASE_URL is "*", rather than emitting a link', () => {
    process.env.PUBLIC_APP_BASE_URL = '*';
    expect(() => buildAttributeVerificationMessage(TO, CODE)).toThrow(/PUBLIC_APP_BASE_URL/);
  });

  it('FALSIFIER 3 — every URL in both the text and html parts is on the configured host, and no other host appears anywhere', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://configured.example.org';
    const message = buildAttributeVerificationMessage(TO, CODE);

    const textUrls = urlsIn(message.text);
    const htmlUrls = urlsIn(message.html);
    // Sweep: both parts must actually carry a link. If either produced zero
    // URLs the assertions below would vacuously pass without proving anything.
    expect(textUrls.size).toBeGreaterThan(0);
    expect(htmlUrls.size).toBeGreaterThan(0);

    for (const url of [...textUrls, ...htmlUrls]) {
      expect(url.startsWith('https://configured.example.org/')).toBe(true);
    }

    // Disqualifier-proof: not "contains https://" but "contains no host
    // other than the configured one", checked over both parts separately.
    expect(message.text).not.toMatch(/https?:\/\/(?!configured\.example\.org\/)\S+/);
    expect(message.html).not.toMatch(/https?:\/\/(?!configured\.example\.org\/)\S+/);
  });

  it('pins the exact path — /login, not merely the configured host (T-2 attempt 2, Reviewer FAIL B)', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://configured.example.org';
    const message = buildAttributeVerificationMessage(TO, CODE);
    // Self-sufficient non-vacuity guard (T-2 review ADVISORY 3): FALSIFIER 3
    // supplies this today, but in a DIFFERENT test — deleting that one would
    // silently make this pin vacuous, since a for-of over an empty set passes.
    expect(allUrls(message).size).toBeGreaterThan(0);
    for (const url of allUrls(message)) {
      expect(url).toBe('https://configured.example.org/login');
    }
  });

  it('the emitted host tracks PUBLIC_APP_BASE_URL — changing the config changes every URL emitted', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://one.example.org';
    const first = buildAttributeVerificationMessage(TO, CODE);
    for (const url of allUrls(first)) {
      expect(url.startsWith('https://one.example.org/')).toBe(true);
    }
    expect(first.text).not.toContain('two.example.org');
    expect(first.html).not.toContain('two.example.org');

    process.env.PUBLIC_APP_BASE_URL = 'https://two.example.org';
    const second = buildAttributeVerificationMessage(TO, CODE);
    for (const url of allUrls(second)) {
      expect(url.startsWith('https://two.example.org/')).toBe(true);
    }
    expect(second.text).not.toContain('one.example.org');
    expect(second.html).not.toContain('one.example.org');
  });
});
