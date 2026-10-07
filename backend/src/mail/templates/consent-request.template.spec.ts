// @sdd-spec actors/consent-intake/consent-request-email (T-4)
/**
 * FR-7 — subject, link-fragment and no-leak coverage for the consent-request
 * email (design.md §5.3, §7.1).
 */
import { buildConsentRequestMessage, CONSENT_REQUEST_SUBJECT } from './consent-request.template';

describe('buildConsentRequestMessage', () => {
  const original = process.env.PUBLIC_APP_BASE_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.PUBLIC_APP_BASE_URL;
    } else {
      process.env.PUBLIC_APP_BASE_URL = original;
    }
  });

  beforeEach(() => {
    process.env.PUBLIC_APP_BASE_URL = 'https://registry.example.org';
  });

  it('FR-7 scenario "fixed subject" — two different actors produce byte-identical subjects', () => {
    const a = buildConsentRequestMessage('a@example.com', 'Organization Alpha', 'token-a');
    const b = buildConsentRequestMessage('b@example.com', 'Organization Beta Co.', 'token-b');

    expect(a.subject).toBe(b.subject);
    expect(a.subject).toBe(CONSENT_REQUEST_SUBJECT);
  });

  it('AND IT MUST NOT — the subject carries no trader name, address, token or request id', () => {
    const msg = buildConsentRequestMessage(
      'respondent@example.com',
      'A Very Distinctive Organization Name Ltd',
      'super-secret-token-value',
    );

    expect(msg.subject).not.toContain('A Very Distinctive Organization Name Ltd');
    expect(msg.subject).not.toContain('respondent@example.com');
    expect(msg.subject).not.toContain('super-secret-token-value');
  });

  it('FR-7 scenario "the link carries the token only in the fragment"', () => {
    const msg = buildConsentRequestMessage('a@example.com', 'Organization Alpha', 'the-raw-token');

    // The body also names the site address as plain wording (Reviewer B
    // issue 1), so locate the ACTION link specifically — the "Review and
    // respond:" line — rather than the first bare URL in the whole text.
    const reviewLine = msg.text.split('\n').find((line) => line.startsWith('Review and respond:'));
    expect(reviewLine).toBeDefined();
    const link = reviewLine!.replace('Review and respond: ', '').trim();

    const [beforeHash, afterHash] = link.split('#');
    expect(beforeHash).toBe('https://registry.example.org/consent/');
    expect(afterHash).toBe('t=the-raw-token');
    // No token anywhere outside the fragment.
    expect(beforeHash).not.toContain('the-raw-token');
  });

  it('FR-7 Content / design.md §7.1 — the intro paragraph names the site address as WORDING, not only inside the link href', () => {
    const msg = buildConsentRequestMessage('a@example.com', 'Organization Alpha', 'tok');

    const introLine = msg.text.split('\n\n')[0];
    expect(introLine).toContain('https://registry.example.org');
    expect(introLine).not.toContain('Review and respond:');

    // Same in the HTML part: everything BEFORE the action button's `<a
    // href=…>` must already contain the site address as rendered wording,
    // not merely as the anchor's `href` attribute value.
    const html = msg.html ?? '';
    const firstAnchorStart = html.indexOf('<a href=');
    expect(firstAnchorStart).toBeGreaterThan(-1);
    const introHtml = html.slice(0, firstAnchorStart);
    expect(introHtml).toContain('https://registry.example.org');
  });

  it('the HTML part carries the same fragment-only link', () => {
    const msg = buildConsentRequestMessage('a@example.com', 'Organization Alpha', 'html-token');

    expect(msg.html).toContain('href="https://registry.example.org/consent/#t=html-token"');
  });

  it('the body names the organization and the expiry, and the data-protection contact', () => {
    const msg = buildConsentRequestMessage('a@example.com', 'Organization Alpha', 'tok');

    expect(msg.text).toContain('Organization Alpha');
    expect(msg.text).toContain('30 days');
    expect(msg.text).toContain('S.Kalemera@cgiar.org');
  });

  it('leaves `reference` undefined — dispatch logs the request id itself, not this template', () => {
    const msg = buildConsentRequestMessage('a@example.com', 'Organization Alpha', 'tok');
    expect(msg.reference).toBeUndefined();
  });
});
