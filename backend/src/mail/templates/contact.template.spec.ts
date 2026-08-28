// @sdd-spec contact/contact-channels (T-3)
/**
 * `contact.template.ts` unit tests — FR-4, design.md §4.5, §6's
 * content-abuse row.
 *
 * Every assertion below is discriminating (KZ-002): each one would fail if
 * the control it exercises were deleted or reverted to a naive
 * implementation. In particular:
 *  - the provenance-line assertion checks the exact leading line, not mere
 *    presence of *a* line;
 *  - the "no requester text in the subject" assertion drives distinctive
 *    marker strings through every requester-supplied field and asserts none
 *    of them appear in `message.subject`, which is also asserted to equal
 *    the exact fixed constant;
 *  - the CR/LF assertions for the four single-line fields (name,
 *    organization, category, the visitor subject) inject a
 *    header-injection-shaped payload (`"John\r\nBcc: evil@example.com"`)
 *    and assert the body renders it concatenated onto one line rather
 *    than as a second, spoofed line — a test that would fail if
 *    stripping were removed from that field;
 *  - `message` is the inverse case (design.md §4.5, amended 2026-08-28):
 *    a multi-paragraph `message` must KEEP its newlines in the rendered
 *    body — a test that would fail if stripping were reinstated — and a
 *    `message` shaped like a header-injection attempt is asserted to be
 *    harmless anyway, because it lands only in the rendered body text
 *    and never touches `to`, `subject`, or `replyTo`;
 *  - the empty-vs-absent-organization assertion compares the two renders
 *    for byte-for-byte equality, not merely "no crash".
 */
import { buildContactMessage, CONTACT_PROVENANCE_LINE, CONTACT_SUBJECT, ContactSubmissionData } from './contact.template';
import { composeReplyTo } from '../../contact/reply-to.util';

function baseData(overrides: Partial<ContactSubmissionData> = {}): ContactSubmissionData {
  return {
    name: 'Jane Requester',
    email: 'jane@example.org',
    organization: 'Acme Cooperative',
    category: 'General inquiry',
    subject: 'Question about sorghum data',
    message: 'Hello,\nI have a question about the registry.',
    ...overrides,
  };
}

describe('buildContactMessage (design.md §4.5, FR-4)', () => {
  describe('recipients are passed through, never resolved here', () => {
    it('passes a single-string `to` through unchanged', () => {
      const result = buildContactMessage('admin@example.org', baseData());
      expect(result.to).toBe('admin@example.org');
    });

    it('passes an array `to` through unchanged', () => {
      const to = ['admin1@example.org', 'admin2@example.org'];
      const result = buildContactMessage(to, baseData());
      expect(result.to).toEqual(to);
      expect(result.to).toBe(to);
    });
  });

  describe('server-generated subject (FR-4: no requester-supplied text in Subject)', () => {
    it('is exactly the fixed constant', () => {
      const result = buildContactMessage('admin@example.org', baseData());
      expect(result.subject).toBe(CONTACT_SUBJECT);
    });

    it('contains none of the requester-supplied marker text, however distinctive', () => {
      const data = baseData({
        name: 'MARKER_NAME_9f3a',
        organization: 'MARKER_ORG_2b7c',
        category: 'Other',
        subject: 'MARKER_USERSUBJECT_e1d0',
        message: 'MARKER_MESSAGE_77aa',
      });
      const result = buildContactMessage('admin@example.org', data);

      expect(result.subject).toBe(CONTACT_SUBJECT);
      expect(result.subject).not.toContain('MARKER_NAME_9f3a');
      expect(result.subject).not.toContain('MARKER_ORG_2b7c');
      expect(result.subject).not.toContain('MARKER_USERSUBJECT_e1d0');
      expect(result.subject).not.toContain('MARKER_MESSAGE_77aa');
    });

    it('is unaffected by a header-injection attempt in the visitor-supplied subject field', () => {
      const data = baseData({ subject: 'Ignore this\r\nSubject: Free stuff!!!' });
      const result = buildContactMessage('admin@example.org', data);
      expect(result.subject).toBe(CONTACT_SUBJECT);
    });
  });

  describe('the mandatory provenance line (design.md §4.5, §6)', () => {
    it('opens the body with the exact fixed provenance statement', () => {
      const result = buildContactMessage('admin@example.org', baseData());
      const firstLine = result.text.split('\n')[0];
      expect(firstLine).toBe(CONTACT_PROVENANCE_LINE);
    });

    it('states the submission channel and that identity is unverified', () => {
      expect(CONTACT_PROVENANCE_LINE).toMatch(/public.*contact form/i);
      expect(CONTACT_PROVENANCE_LINE).toMatch(/not been verified/i);
    });

    it('renders the requester address as body data, distinct from the fixed provenance text', () => {
      const result = buildContactMessage('admin@example.org', baseData({ email: 'distinct-marker@example.org' }));
      expect(result.text).toContain('distinct-marker@example.org');
      // The provenance line itself carries no interpolated data.
      expect(CONTACT_PROVENANCE_LINE).not.toContain('@');
    });
  });

  describe('requester data rendered as body data, never as a header', () => {
    it('renders name, organization, category, the visitor subject and message as labelled body data', () => {
      const result = buildContactMessage('admin@example.org', baseData());
      expect(result.text).toContain('Name: Jane Requester');
      expect(result.text).toContain('Organization: Acme Cooperative');
      expect(result.text).toContain('Category: General inquiry');
      expect(result.text).toContain('Subject: Question about sorghum data');
      // `message` keeps its own internal newline — it is not a single-line
      // labelled field like the four above (design.md §4.5, amended).
      expect(result.text).toContain('Hello,\nI have a question about the registry.');
    });
  });

  describe('CR/LF stripped from single-line fields only; message newlines preserved (design.md §4.5, amended 2026-08-28)', () => {
    it('strips CR/LF from name so an injected line cannot masquerade as a second body line', () => {
      const malicious = 'John\r\nBcc: evil@example.com';
      const result = buildContactMessage('admin@example.org', baseData({ name: malicious }));

      expect(result.text).toContain('Name: JohnBcc: evil@example.com');
      expect(result.text.split('\n')).not.toContain('Bcc: evil@example.com');
    });

    it('strips CR/LF from organization', () => {
      const malicious = 'Acme\r\nX-Injected: true';
      const result = buildContactMessage('admin@example.org', baseData({ organization: malicious }));

      expect(result.text).toContain('Organization: AcmeX-Injected: true');
      expect(result.text.split('\n')).not.toContain('X-Injected: true');
    });

    it('strips CR/LF from category', () => {
      const malicious = 'Other\r\nSpoofed: field';
      const result = buildContactMessage('admin@example.org', baseData({ category: malicious }));

      expect(result.text).toContain('Category: OtherSpoofed: field');
      expect(result.text.split('\n')).not.toContain('Spoofed: field');
    });

    it('strips CR/LF from the visitor-supplied subject field', () => {
      const malicious = 'Real subject\r\nSpoofed: field';
      const result = buildContactMessage('admin@example.org', baseData({ subject: malicious }));

      expect(result.text).toContain('Subject: Real subjectSpoofed: field');
      expect(result.text.split('\n')).not.toContain('Spoofed: field');
    });

    it('strips a bare CR (no paired LF) from the four single-line fields', () => {
      const result = buildContactMessage(
        'admin@example.org',
        baseData({ name: 'Ja\rne', organization: 'Ac\rme', category: 'Ot\rher', subject: 'Su\rbject' }),
      );

      expect(result.text).toContain('Name: Jane');
      expect(result.text).toContain('Organization: Acme');
      expect(result.text).toContain('Category: Other');
      expect(result.text).toContain('Subject: Subject');
    });

    it('preserves newlines in a multi-paragraph message — inverted from the pre-amendment behaviour', () => {
      const multiParagraph = 'Paragraph one.\r\nParagraph two.\nParagraph three.';
      const result = buildContactMessage('admin@example.org', baseData({ message: multiParagraph }));

      // Would fail if CR/LF stripping were reinstated on `message`: a
      // stripped render collapses to one line and contains none of these.
      // Split on any newline convention — `message` is verbatim, so its own
      // `\r\n` survives as-is, unlike the LF-only joins between labelled lines.
      const bodyLines = result.text.split(/\r\n|\r|\n/);
      expect(bodyLines).toContain('Paragraph one.');
      expect(bodyLines).toContain('Paragraph two.');
      expect(bodyLines).toContain('Paragraph three.');
      expect(result.text).not.toContain('Paragraph one.Paragraph two.Paragraph three.');
    });

    it('renders a header-injection-shaped message payload as harmless body text, never as a header', () => {
      const payload = 'line one\r\nBcc: evil@example.com\r\nline two';
      const result = buildContactMessage('admin@example.org', baseData({ message: payload }));

      // The payload survives verbatim as body text — proving newlines here
      // are just body structure, not a header-assembly opportunity: this
      // function returns a flat { to, subject, text, replyTo } MailMessage,
      // so `message` has no route into any header field but `text`.
      expect(result.text).toContain(payload);
      const bodyLines = result.text.split(/\r\n|\r|\n/);
      expect(bodyLines).toContain('Bcc: evil@example.com');

      // The only real headers this template produces are untouched by the
      // payload: `to` is passed through, `subject` is the fixed constant,
      // and `replyTo` is composed from name/email only — never from `message`.
      expect(result.to).toBe('admin@example.org');
      expect(result.subject).toBe(CONTACT_SUBJECT);
      expect(result.replyTo).toBe(composeReplyTo(baseData().name, baseData().email));
    });
  });

  describe('organization "" and organization undefined render identically (T-4 review forward-pointer)', () => {
    it('omits the Organization label for both, byte-for-byte', () => {
      const emptyResult = buildContactMessage('admin@example.org', baseData({ organization: '' }));
      const undefinedData = baseData();
      delete (undefinedData as { organization?: string }).organization;
      const undefinedResult = buildContactMessage('admin@example.org', undefinedData);

      expect(emptyResult.text).toBe(undefinedResult.text);
      expect(emptyResult.text).not.toContain('Organization:');
      expect(undefinedResult.text).not.toContain('Organization:');
    });

    it('still renders the Organization label when a non-empty value is supplied', () => {
      const result = buildContactMessage('admin@example.org', baseData({ organization: 'Acme Cooperative' }));
      expect(result.text).toContain('Organization: Acme Cooperative');
    });
  });

  describe('Reply-To composed via T-2\'s composeReplyTo, not reimplemented', () => {
    it('matches composeReplyTo\'s own output for the same name and address', () => {
      const data = baseData({ name: 'Jane Requester', email: 'jane@example.org' });
      const result = buildContactMessage('admin@example.org', data);
      expect(result.replyTo).toBe(composeReplyTo('Jane Requester', 'jane@example.org'));
      expect(result.replyTo).toBe('Jane Requester <jane@example.org>');
    });

    it('delegates non-ASCII / quoting-trigger names to composeReplyTo unchanged', () => {
      const data = baseData({ name: 'José "El Jefe" Örg', email: 'jose@example.org' });
      const result = buildContactMessage('admin@example.org', data);
      expect(result.replyTo).toBe(composeReplyTo('José "El Jefe" Örg', 'jose@example.org'));
    });
  });
});
