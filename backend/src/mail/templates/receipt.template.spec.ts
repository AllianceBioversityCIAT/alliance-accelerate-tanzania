// @sdd-spec actors/public-self-registration (T-3)
/**
 * ATP-67 — the receipt's status-lookup link comes from configuration, not
 * from a domain baked into the template.
 *
 * The failure this guards against is specifically a QUIET one. The URL used
 * to be a module constant holding the current CloudFront domain; when the
 * app moves, that email keeps pointing applicants at the old address, the
 * build stays green, and nobody finds out except the applicant who cannot
 * reach their status page. So these tests assert the link is *derived*, and
 * that an unusable configuration is refused loudly instead of producing a
 * broken link.
 */
import { buildReceiptMessage } from './receipt.template';

const REFERENCE = 'SR-2026-0042';
const TO = 'applicant@example.org';

/** The domain this template used to hardcode. It must not come back. */
const RETIRED_HARDCODED_DOMAIN = 'd3idqvvg0xa1r7.cloudfront.net';

describe('buildReceiptMessage — status-lookup link (ATP-67)', () => {
  const original = process.env.PUBLIC_APP_BASE_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.PUBLIC_APP_BASE_URL;
    } else {
      process.env.PUBLIC_APP_BASE_URL = original;
    }
  });

  it('builds the link from PUBLIC_APP_BASE_URL, in both the text and HTML parts', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://registry.example.org';

    const msg = buildReceiptMessage(TO, REFERENCE);

    expect(msg.text).toContain('https://registry.example.org/register/status/');
    expect(msg.html).toContain('https://registry.example.org/register/status/');
  });

  it('does not double the slash when the configured base has a trailing one', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://registry.example.org/';

    const msg = buildReceiptMessage(TO, REFERENCE);

    expect(msg.text).toContain('https://registry.example.org/register/status/');
    expect(msg.text).not.toContain('example.org//register');
    expect(msg.html).not.toContain('example.org//register');
  });

  it('no longer emits the retired hardcoded CloudFront domain', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://registry.example.org';

    const msg = buildReceiptMessage(TO, REFERENCE);

    expect(msg.text).not.toContain(RETIRED_HARDCODED_DOMAIN);
    expect(msg.html).not.toContain(RETIRED_HARDCODED_DOMAIN);
  });

  it('still carries the reference — the thing the applicant actually needs', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://registry.example.org';

    const msg = buildReceiptMessage(TO, REFERENCE);

    expect(msg.reference).toBe(REFERENCE);
    expect(msg.subject).toContain(REFERENCE);
    expect(msg.text).toContain(REFERENCE);
    expect(msg.html).toContain(REFERENCE);
  });

  // ── Refusals. Each of these would otherwise mail a broken link. ───────────

  it('throws when PUBLIC_APP_BASE_URL is unset rather than falling back to a domain', () => {
    delete process.env.PUBLIC_APP_BASE_URL;

    expect(() => buildReceiptMessage(TO, REFERENCE)).toThrow(/PUBLIC_APP_BASE_URL/);
  });

  it('throws on "*" — the value a bootstrap deploy leaves in AllowedOrigin', () => {
    // The deployed stack derives this from AllowedOrigin, which is literally
    // "*" on the bootstrap path. "*/register/status/" is not a link.
    process.env.PUBLIC_APP_BASE_URL = '*';

    expect(() => buildReceiptMessage(TO, REFERENCE)).toThrow(/PUBLIC_APP_BASE_URL/);
  });

  it('throws on a value that is not an absolute http(s) URL', () => {
    process.env.PUBLIC_APP_BASE_URL = 'registry.example.org';

    expect(() => buildReceiptMessage(TO, REFERENCE)).toThrow(/PUBLIC_APP_BASE_URL/);
  });

  it('accepts http, not only https, so a local stack can be configured', () => {
    process.env.PUBLIC_APP_BASE_URL = 'http://localhost:3000';

    expect(buildReceiptMessage(TO, REFERENCE).text).toContain(
      'http://localhost:3000/register/status/',
    );
  });
});
