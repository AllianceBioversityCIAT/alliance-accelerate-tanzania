// @sdd-spec contact/contact-channels (T-2)
/**
 * `reply-to.util.ts` unit tests — FR-4, design.md §4.5, DC-3.
 *
 * Every assertion below checks the exact composed string (KZ-002: "a
 * presence-assertion is not a behavioral proof"). None would still pass if
 * the escaping, encoding or stripping were deleted.
 *
 * Coverage driven, per the task's own "done when" bar — the FULL §4.5
 * character set, not a subset an earlier revision was caught testing only
 * part of:
 *   `"` `\` `<` `>` `,` `;` `:` `@` (all eight, individually) · CR · LF ·
 *   CRLF · non-ASCII (short, single encoded-word) · a 200-character
 *   non-ASCII name (encoded-word splitting, joined by a single space, no
 *   fold, and no fall-back to the bare address — KZ-002) · the
 *   fall-back-to-bare-address path (empty name, CR/LF-only name).
 *
 * design.md §4.5 amendment 1 (2026-08-28) withdrew the 998-octet line-length
 * clause: SES's `SendEmail` receives `ReplyToAddresses` as a structured
 * field and assembles the MIME header itself, so this module never folds
 * and no longer falls back on length. The two tests that used to assert a
 * length-triggered fallback are gone — asserting it now would assert
 * withdrawn behaviour, and reinstating the guard it depended on would
 * silently discard the display name for long non-ASCII names, which is
 * exactly what the replacement test below guards against.
 */
import { composeReplyTo, MAX_ENCODED_WORD_OCTETS } from './reply-to.util';

/** Reassembles an RFC 2047 Base64 encoded-word (or space-joined sequence of them) back to plain text. */
function decodeRfc2047(value: string): string {
  const words = value.split(' ').map((word) => word.trim());
  const payloads = words.map((word) => {
    const match = /^=\?UTF-8\?B\?([^?]*)\?=$/.exec(word);
    if (!match) {
      throw new Error(`not a valid RFC 2047 Base64 encoded-word: ${word}`);
    }
    return match[1];
  });
  return Buffer.concat(payloads.map((payload) => Buffer.from(payload, 'base64'))).toString('utf8');
}

describe('composeReplyTo (design.md §4.5, FR-4)', () => {
  const address = 'jane@example.org';

  it('composes a plain ASCII multi-word name unquoted', () => {
    expect(composeReplyTo('Jane Requester', address)).toBe('Jane Requester <jane@example.org>');
  });

  describe('CR/LF stripping — step 1, before any other processing', () => {
    it('strips a bare CR from the name', () => {
      expect(composeReplyTo('Ja\rne', address)).toBe('Jane <jane@example.org>');
    });

    it('strips a bare LF from the name', () => {
      expect(composeReplyTo('Ja\nne', address)).toBe('Jane <jane@example.org>');
    });

    it('strips an injected CRLF header-injection attempt from the name', () => {
      // Deliberately free of the §4.5 quoting triggers (no `@`/`:`/etc.) so this
      // test isolates CR/LF stripping — quoting is covered in its own block below.
      const malicious = 'Jane\r\nBcc EvilHeaderInjection';
      expect(composeReplyTo(malicious, address)).toBe('JaneBcc EvilHeaderInjection <jane@example.org>');
    });

    it('strips CR/LF from the address field too', () => {
      const maliciousAddress = 'jane@example.org\r\nBcc: attacker@evil.example';
      expect(composeReplyTo('Jane', maliciousAddress)).toBe(
        'Jane <jane@example.orgBcc: attacker@evil.example>',
      );
    });

    it('a name that is CR/LF only becomes empty and falls back to the bare address', () => {
      expect(composeReplyTo('\r\n\r\n', address)).toBe('jane@example.org');
    });
  });

  describe('RFC 5322 quoted-string escaping — the full §4.5 trigger set', () => {
    it('escapes a double quote and wraps the whole name', () => {
      expect(composeReplyTo('Jane "Danger" Requester', address)).toBe(
        '"Jane \\"Danger\\" Requester" <jane@example.org>',
      );
    });

    it('escapes a backslash and wraps the whole name (the character most likely to break a quoted-string if mishandled)', () => {
      expect(composeReplyTo('Jane\\Requester', address)).toBe('"Jane\\\\Requester" <jane@example.org>');
    });

    it('wraps a name containing "<" with no extra escaping of the character itself', () => {
      expect(composeReplyTo('Jane <Injected>', address)).toBe('"Jane <Injected>" <jane@example.org>');
    });

    it('wraps a name containing ">"', () => {
      expect(composeReplyTo('Jane> Requester', address)).toBe('"Jane> Requester" <jane@example.org>');
    });

    it('wraps a name containing ","', () => {
      expect(composeReplyTo('Requester, Jane', address)).toBe('"Requester, Jane" <jane@example.org>');
    });

    it('wraps a name containing ";"', () => {
      expect(composeReplyTo('Jane;Requester', address)).toBe('"Jane;Requester" <jane@example.org>');
    });

    it('wraps a name containing ":"', () => {
      expect(composeReplyTo('Jane:Requester', address)).toBe('"Jane:Requester" <jane@example.org>');
    });

    it('wraps a name containing "@"', () => {
      expect(composeReplyTo('Jane@Requester', address)).toBe('"Jane@Requester" <jane@example.org>');
    });

    it('escapes both a quote and a backslash in the same name', () => {
      expect(composeReplyTo('Jane \\"Requester\\"', address)).toBe(
        '"Jane \\\\\\"Requester\\\\\\"" <jane@example.org>',
      );
    });
  });

  describe('RFC 2047 encoding — non-ASCII names', () => {
    it('encodes a short non-ASCII name as a single encoded-word with no fold', () => {
      const result = composeReplyTo('Jané', address);
      expect(result.endsWith(' <jane@example.org>')).toBe(true);
      expect(result).not.toContain('\r\n');
      const wordPart = result.slice(0, result.length - ' <jane@example.org>'.length);
      expect(/^=\?UTF-8\?B\?[A-Za-z0-9+/]+=*\?=$/.test(wordPart)).toBe(true);
      expect(decodeRfc2047(wordPart)).toBe('Jané');
    });

    it('never mixes RFC 2047 encoding with quoted-string wrapping, even when the name also has quoting-trigger characters', () => {
      const mixed = 'Jané "Danger" <x>';
      const result = composeReplyTo(mixed, address);
      expect(result.startsWith('"')).toBe(false);
      const wordPart = result.slice(0, result.length - ' <jane@example.org>'.length);
      expect(decodeRfc2047(wordPart)).toBe(mixed);
    });

    it('splits a 200-character non-ASCII name (the DTO cap) into multiple encoded-words, joined by a single space, and does NOT fall back to the bare address (KZ-002)', () => {
      const longName = '文'.repeat(200); // 200 chars, 3 UTF-8 octets each = 600 octets
      const result = composeReplyTo(longName, address);

      // The trap this test exists to catch: a naive reinstatement of the
      // withdrawn length guard would silently discard the display name here
      // and return the bare address instead. It must not.
      expect(result).not.toBe(address);
      expect(result.endsWith(' <jane@example.org>')).toBe(true);
      const wordPart = result.slice(0, result.length - ' <jane@example.org>'.length);

      // No CRLF anywhere — SES assembles the header, this module never folds.
      expect(result).not.toContain('\r\n');
      expect(result).not.toContain('\r');
      expect(result).not.toContain('\n');

      // Splitting actually happened: more than one encoded-word, joined by spaces.
      const words = wordPart.split(' ');
      expect(words.length).toBeGreaterThan(1);

      // Every single encoded-word stays within the 75-octet RFC 2047 cap.
      for (const word of words) {
        expect(Buffer.byteLength(word, 'utf8')).toBeLessThanOrEqual(MAX_ENCODED_WORD_OCTETS);
      }

      // Joining reconstructs the exact original text, byte for byte.
      expect(decodeRfc2047(wordPart)).toBe(longName);
    });
  });

  describe('fall back to the bare address rather than emit a malformed header', () => {
    it('falls back when the name is empty', () => {
      expect(composeReplyTo('', address)).toBe(address);
    });

    it('falls back to the (also-stripped) bare address when the name is CR/LF only', () => {
      expect(composeReplyTo('\r\n', 'jane@example.org\r\n')).toBe('jane@example.org');
    });
  });
});
