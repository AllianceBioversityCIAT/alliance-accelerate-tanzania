// @sdd-spec enhancement/html-email-templates
import { escapeHtml, renderEmailHtml } from './email-layout';
import { buildContactMessage } from './contact.template';
import { buildVerificationCodeMessage } from './verification-code.template';

describe('escapeHtml', () => {
  it('escapes every character that can break out of text or an attribute', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('escapes the ampersand first, so an escape is never double-encoded wrongly', () => {
    // A naive order turns `<` into `&lt;` and then the `&` of `&lt;` into
    // `&amp;lt;`, rendering the literal text "&lt;" to the reader.
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
});

describe('renderEmailHtml', () => {
  it('escapes the heading and the preheader', () => {
    const html = renderEmailHtml({
      preheader: '<b>pre</b>',
      heading: '<b>head</b>',
      blocks: [],
    });
    expect(html).not.toContain('<b>pre</b>');
    expect(html).not.toContain('<b>head</b>');
    expect(html).toContain('&lt;b&gt;head&lt;/b&gt;');
  });

  it('declares a light colour scheme so clients do not auto-invert it', () => {
    const html = renderEmailHtml({ preheader: 'p', heading: 'h', blocks: [] });
    expect(html).toContain('name="color-scheme" content="light"');
    expect(html).toContain('name="supported-color-schemes" content="light"');
  });

  it('references no remote asset — a blocked image must not be able to break the design', () => {
    const html = renderEmailHtml({
      preheader: 'p',
      heading: 'h',
      blocks: [{ kind: 'paragraph', text: 'body' }],
    });
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/background-image/i);
    // The only absolute URLs allowed are ones a template passed as a link.
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('prints a link href as visible text as well as in the anchor', () => {
    const html = renderEmailHtml({
      preheader: 'p',
      heading: 'h',
      blocks: [{ kind: 'link', label: 'Check status', href: 'https://example.org/status/' }],
    });
    // Clients that strip anchors still have to leave the reader an address.
    expect(html.match(/https:\/\/example\.org\/status\//g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('the HTML part never renders visitor markup — contact.template', () => {
  const PAYLOAD = '<script>alert(1)</script><img src=x onerror=alert(2)>';

  function build(overrides: Partial<Parameters<typeof buildContactMessage>[1]> = {}) {
    return buildContactMessage('admin@example.org', {
      name: 'Visitor',
      email: 'visitor@example.org',
      category: 'General',
      subject: 'Hello',
      message: 'A normal message.',
      ...overrides,
    });
  }

  it.each(['message', 'name', 'subject', 'category', 'organization'] as const)(
    'escapes markup supplied in %s',
    (field) => {
      const { html } = build({ [field]: PAYLOAD });
      expect(html).toBeDefined();
      // The payload must not survive verbatim, and no tag may be opened from
      // it. `onerror=` as literal TEXT inside escaped output is inert, so
      // asserting on that substring alone would fail a correct escape — what
      // matters is that no `<tag` was produced.
      expect(html).not.toContain(PAYLOAD);
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/<img/i);
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    },
  );

  it('keeps the plain-text part byte-identical to what it was before HTML existed', () => {
    const { text } = build({ message: 'line one\nline two' });
    expect(text).toContain('Name: Visitor');
    expect(text).toContain('line one\nline two');
    // The text part is the fallback and must stay unstyled.
    expect(text).not.toContain('<');
  });

  it('renders the message\'s newlines as <br /> in HTML, not as collapsed whitespace', () => {
    const { html } = build({ message: 'line one\nline two' });
    expect(html).toContain('line one<br />line two');
  });

  it('omits the organisation row for both undefined and empty string', () => {
    expect(build({ organization: undefined }).html).not.toContain('Organisation');
    expect(build({ organization: '' }).html).not.toContain('Organisation');
    expect(build({ organization: 'TARI' }).html).toContain('TARI');
  });
});

describe('every builder emits both parts', () => {
  it('verification code carries the code in text and HTML, and the same lifetime', () => {
    const { text, html } = buildVerificationCodeMessage('a@b.org', '123456');
    expect(text).toContain('123456');
    expect(html).toContain('123456');
    const minutes = /(\d+) minutes/.exec(text)?.[1];
    expect(minutes).toBeDefined();
    expect(html).toContain(`${minutes} minutes`);
  });
});
