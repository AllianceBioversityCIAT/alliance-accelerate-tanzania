// @sdd-spec auth/account-access-emails (T-2)
/**
 * FR-5 / NFR-3 — the admin-reset's sign-in link comes from configuration,
 * not from a domain baked into the template.
 *
 * Mirrors `invitation.template.spec.ts` (T-1) and `receipt.template.spec.ts`
 * (ATP-67): the link must be *derived* from `PUBLIC_APP_BASE_URL`, resolved
 * per call, and an unusable configuration must be refused loudly rather
 * than mailing a broken link. Resolution must stay per call: if it is
 * hoisted to module load, these refusal tests cannot pass — with
 * `PUBLIC_APP_BASE_URL` unset the import itself throws and the suite fails
 * to run (observed for T-1's identical shape, Falsifier 2).
 *
 * Also asserts the copy is distinguishable from the invitation (T-2 done-when):
 * a reset must not read as a second welcome.
 */
import { buildAdminResetMessage } from './admin-reset.template';

const TO = 'existing-user@example.org';
const NEW_TEMP_PASSWORD = 'Rk4!wQmX8t';
const SUB = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

/** A host that must never appear literally in this template's output. */
const HARDCODED_HOST = 'd3idqvvg0xa1r7.cloudfront.net';

describe('buildAdminResetMessage — sign-in link (FR-5, NFR-3)', () => {
  const original = process.env.PUBLIC_APP_BASE_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.PUBLIC_APP_BASE_URL;
    } else {
      process.env.PUBLIC_APP_BASE_URL = original;
    }
  });

  it('builds the sign-in link from PUBLIC_APP_BASE_URL, in both the text and HTML parts', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://registry.example.org';

    const msg = buildAdminResetMessage(TO, NEW_TEMP_PASSWORD, SUB);

    expect(msg.text).toContain('https://registry.example.org/reset-password');
    expect(msg.html).toContain('https://registry.example.org/reset-password');
  });

  it('does not double the slash when the configured base has a trailing one', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://registry.example.org/';

    const msg = buildAdminResetMessage(TO, NEW_TEMP_PASSWORD, SUB);

    expect(msg.text).toContain('https://registry.example.org/reset-password');
    expect(msg.text).not.toContain('example.org//reset-password');
    expect(msg.html).not.toContain('example.org//reset-password');
  });

  it('carries the new temporary password in both parts (FR-5 AND)', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://registry.example.org';

    const msg = buildAdminResetMessage(TO, NEW_TEMP_PASSWORD, SUB);

    expect(msg.text).toContain(NEW_TEMP_PASSWORD);
    expect(msg.html).toContain(NEW_TEMP_PASSWORD);
  });

  it('passes the given reference through, and leaves it undefined when the caller has none', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://registry.example.org';

    const withSub = buildAdminResetMessage(TO, NEW_TEMP_PASSWORD, SUB);
    expect(withSub.reference).toBe(SUB);

    const withoutSub = buildAdminResetMessage(TO, NEW_TEMP_PASSWORD);
    expect(withoutSub.reference).toBeUndefined();
  });

  it('never emits a hardcoded host — only the derived one', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://registry.example.org';

    const msg = buildAdminResetMessage(TO, NEW_TEMP_PASSWORD, SUB);

    expect(msg.text).not.toContain(HARDCODED_HOST);
    expect(msg.html).not.toContain(HARDCODED_HOST);
    // The layout prints the link's href twice (a button and, for clients
    // that strip links, the plain address below it) — every occurrence must
    // point at the SAME, configured host, never a second independently
    // written one.
    const urls = msg.html!.match(/https?:\/\/[^\s"<]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith('https://registry.example.org')).toBe(true);
    }
  });

  // ── Refusals. Each of these would otherwise mail a broken link. ───────────

  it('throws when PUBLIC_APP_BASE_URL is unset rather than falling back to a domain', () => {
    delete process.env.PUBLIC_APP_BASE_URL;

    expect(() => buildAdminResetMessage(TO, NEW_TEMP_PASSWORD, SUB)).toThrow(
      /PUBLIC_APP_BASE_URL/,
    );
  });

  it('throws on "*" — the value a bootstrap deploy leaves in AllowedOrigin', () => {
    process.env.PUBLIC_APP_BASE_URL = '*';

    expect(() => buildAdminResetMessage(TO, NEW_TEMP_PASSWORD, SUB)).toThrow(
      /PUBLIC_APP_BASE_URL/,
    );
  });

  it('throws on a value that is not an absolute http(s) URL', () => {
    process.env.PUBLIC_APP_BASE_URL = 'registry.example.org';

    expect(() => buildAdminResetMessage(TO, NEW_TEMP_PASSWORD, SUB)).toThrow(
      /PUBLIC_APP_BASE_URL/,
    );
  });

  it('accepts http, not only https, so a local stack can be configured', () => {
    process.env.PUBLIC_APP_BASE_URL = 'http://localhost:3000';

    expect(buildAdminResetMessage(TO, NEW_TEMP_PASSWORD, SUB).text).toContain(
      'http://localhost:3000/reset-password',
    );
  });
});

describe('buildAdminResetMessage — copy is distinguishable from the invitation (T-2 done-when)', () => {
  const original = process.env.PUBLIC_APP_BASE_URL;

  beforeEach(() => {
    process.env.PUBLIC_APP_BASE_URL = 'https://registry.example.org';
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.PUBLIC_APP_BASE_URL;
    } else {
      process.env.PUBLIC_APP_BASE_URL = original;
    }
  });

  it('does not use invitation language ("invited") anywhere in either part', () => {
    const msg = buildAdminResetMessage(TO, NEW_TEMP_PASSWORD, SUB);

    expect(msg.subject.toLowerCase()).not.toContain('invited');
    expect(msg.text.toLowerCase()).not.toContain('invited');
    expect(msg.html!.toLowerCase()).not.toContain('invited');
  });

  it('states the account already exists, not that one was created', () => {
    const msg = buildAdminResetMessage(TO, NEW_TEMP_PASSWORD, SUB);

    expect(msg.text.toLowerCase()).toContain('existing');
    expect(msg.html!.toLowerCase()).toContain('existing');
  });

  it('says the previous password no longer works, a fact only true of a reset', () => {
    const msg = buildAdminResetMessage(TO, NEW_TEMP_PASSWORD, SUB);

    expect(msg.text.toLowerCase()).toContain('previous password');
    expect(msg.html!.toLowerCase()).toContain('previous password');
  });
});

describe('buildAdminResetMessage — the link must not land on /login', () => {
  // The regression this file's SIGN_IN_PATH comment records: /login redirects
  // a visitor who already has a session into the app, so the recipient never
  // reached the form and kept using the password this email invalidated.
  it('points at /reset-password and never at the bare /login path', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://registry.example.org';

    const msg = buildAdminResetMessage(TO, NEW_TEMP_PASSWORD, SUB);

    expect(msg.text).toContain('https://registry.example.org/reset-password');
    expect(msg.text).not.toContain('https://registry.example.org/login');
    expect(msg.html).not.toContain('https://registry.example.org/login');
  });
});
