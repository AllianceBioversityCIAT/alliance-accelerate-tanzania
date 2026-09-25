// @sdd-spec auth/account-access-emails (T-1)
/**
 * FR-1 / NFR-3 — the invitation's sign-in link comes from configuration, not
 * from a domain baked into the template.
 *
 * Mirrors `receipt.template.spec.ts` (ATP-67): the link must be *derived*
 * from `PUBLIC_APP_BASE_URL`, resolved per call, and an unusable
 * configuration must be refused loudly rather than mailing a broken link.
 * Resolution must stay per call: if it is hoisted to module load, these
 * refusal tests cannot pass — with `PUBLIC_APP_BASE_URL` unset the import
 * itself throws and the suite fails to run (observed, T-1 Falsifier 2).
 */
import { buildInvitationMessage } from './invitation.template';

const TO = 'invitee@example.org';
const TEMP_PASSWORD = 'Tz9!kLmQ2p';
const SUB = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

/** A host that must never appear literally in this template's output. */
const HARDCODED_HOST = 'd3idqvvg0xa1r7.cloudfront.net';

describe('buildInvitationMessage — sign-in link (FR-1, NFR-3)', () => {
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

    const msg = buildInvitationMessage(TO, TEMP_PASSWORD, SUB);

    expect(msg.text).toContain('https://registry.example.org/login');
    expect(msg.html).toContain('https://registry.example.org/login');
  });

  it('does not double the slash when the configured base has a trailing one', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://registry.example.org/';

    const msg = buildInvitationMessage(TO, TEMP_PASSWORD, SUB);

    expect(msg.text).toContain('https://registry.example.org/login');
    expect(msg.text).not.toContain('example.org//login');
    expect(msg.html).not.toContain('example.org//login');
  });

  it('carries the temporary password in both parts (FR-1 scenario 1 AND)', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://registry.example.org';

    const msg = buildInvitationMessage(TO, TEMP_PASSWORD, SUB);

    expect(msg.text).toContain(TEMP_PASSWORD);
    expect(msg.html).toContain(TEMP_PASSWORD);
  });

  it('passes the given reference through, and leaves it undefined when the caller has none', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://registry.example.org';

    const withSub = buildInvitationMessage(TO, TEMP_PASSWORD, SUB);
    expect(withSub.reference).toBe(SUB);

    const withoutSub = buildInvitationMessage(TO, TEMP_PASSWORD);
    expect(withoutSub.reference).toBeUndefined();
  });

  it('never emits a hardcoded host — only the derived one', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://registry.example.org';

    const msg = buildInvitationMessage(TO, TEMP_PASSWORD, SUB);

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

    expect(() => buildInvitationMessage(TO, TEMP_PASSWORD, SUB)).toThrow(
      /PUBLIC_APP_BASE_URL/,
    );
  });

  it('throws on "*" — the value a bootstrap deploy leaves in AllowedOrigin', () => {
    process.env.PUBLIC_APP_BASE_URL = '*';

    expect(() => buildInvitationMessage(TO, TEMP_PASSWORD, SUB)).toThrow(
      /PUBLIC_APP_BASE_URL/,
    );
  });

  it('throws on a value that is not an absolute http(s) URL', () => {
    process.env.PUBLIC_APP_BASE_URL = 'registry.example.org';

    expect(() => buildInvitationMessage(TO, TEMP_PASSWORD, SUB)).toThrow(
      /PUBLIC_APP_BASE_URL/,
    );
  });

  it('accepts http, not only https, so a local stack can be configured', () => {
    process.env.PUBLIC_APP_BASE_URL = 'http://localhost:3000';

    expect(buildInvitationMessage(TO, TEMP_PASSWORD, SUB).text).toContain(
      'http://localhost:3000/login',
    );
  });
});
