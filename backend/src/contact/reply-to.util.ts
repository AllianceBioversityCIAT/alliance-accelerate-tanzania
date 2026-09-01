// @sdd-spec contact/contact-channels (T-2)
/**
 * T-2 — `Reply-To` display-name composition (design.md §4.5, FR-4).
 *
 * `Reply-To` is the one header in the contact-form message that carries
 * requester-supplied text (design.md §4.5: "`Reply-To` is the one header
 * carrying attacker-supplied text"). `composeReplyTo` produces the value
 * `MailMessage.replyTo` carries into the SES `ReplyToAddresses` API field
 * — SES assembles the actual header itself (amendment 1 overturned the
 * earlier premise that this code writes a header directly)
 * (`mail-transport.interface.ts`, `ses-mail.transport.ts`). This file does
 * NOT touch `mail/` — it is a pure, side-effect-free string transform with
 * no Nest decorators, no DI, no I/O, consumed by a later task's template
 * and service wiring (tasks.md T-3/T-6).
 *
 * **Order of operations, and why it is exactly this order:**
 *
 * 1. **Strip CR and LF from BOTH `name` and `address` before anything else
 *    runs.** A literal `\r`/`\n` in a submitted field is a header-injection
 *    vector regardless of what any later branch does with the value, so no
 *    quoting, encoding or length decision may see one.
 * 2. **An empty name composes nothing useful.** If nothing is left after
 *    stripping (or nothing was submitted), the result is the bare address —
 *    there is no display name to protect or encode.
 * 3. **Non-ASCII always wins over quoting, never both.** RFC 2047 §5 lists
 *    the exact contexts an `encoded-word` may appear in, and a
 *    `quoted-string` is explicitly not one of them — decoders are not
 *    required to recognize an encoded-word nested inside quotes. A raw
 *    non-ASCII octet is equally not valid RFC 5322 `qtext`. So a name
 *    containing ANY non-ASCII character is RFC 2047-encoded in full, even
 *    if it ALSO contains one of the eight quoting-trigger characters below
 *    — those characters need no separate escaping once the whole name is
 *    inside encoded-words (the encoded form is pure base64 alphabet, no
 *    specials survive into it).
 * 4. **Otherwise, a name containing any of `"` `\` `<` `>` `,` `;` `:` `@`**
 *    is wrapped as an RFC 5322 `quoted-string`. Inside a quoted-string only
 *    `"` and `\` require a backslash escape (`qtext` already permits the
 *    other six as literal characters) — they are why quoting is triggered
 *    at all, since none of the eight is otherwise valid in an unquoted
 *    `atom`/`dot-atom` display name.
 * 5. **A plain ASCII name with none of the above is emitted unquoted** —
 *    RFC 5322 `phrase` allows multiple space-separated `atom`s, so
 *    "Jane Requester" needs no quoting just because it contains a space.
 *
 * **RFC 2047 encoded-word splitting (step 3).** A single encoded-word is
 * capped at 75 octets (RFC 2047 §5). The DTO caps `name` at 200 characters
 * (design.md §4.1.1) — at up to 4 UTF-8 octets/character that is up to 800
 * octets, which blows through that limit if emitted as one encoded-word.
 * `encodeRfc2047` below splits the UTF-8 byte stream into chunks small
 * enough that every resulting encoded-word stays at or under 75 octets,
 * then joins the words with a single space (RFC 2047 §5's required
 * separation between adjacent encoded-words). **This value is passed to
 * SES's `SendEmail` as `ReplyToAddresses: [...]` — a structured field, not
 * an assembled header line.** SES builds the MIME header itself, so this
 * function never folds: a literal `CRLF SP` inside the value would be a
 * raw-header artifact in a field that never asked for one, and is the
 * shape address-list parameter validators commonly reject as containing
 * control characters. RFC 2047 §6.2 still has a decoder discard any linear
 * whitespace between two adjacent encoded-words when reassembling them, so
 * a single space still reconstructs the exact original text with no
 * spurious space introduced at the chunk boundary. *(design.md §4.5,
 * amendment 1, 2026-08-28 — the previously-required 998-octet fold is
 * withdrawn; line length is SES's concern now that SES assembles the
 * line.)*
 *
 * **Never throws, never emits a malformed header (step 4 of FR-4's own
 * text).** Composition is wrapped defensively: if anything unexpected
 * throws while composing, the result falls back to the bare address rather
 * than risk a malformed `Reply-To` value. Length is no longer part of what
 * "malformed" means here — SES assembles and wraps the header line.
 */

const CR_LF = /[\r\n]/g;
const NON_ASCII = /[^\x00-\x7F]/;
/** The eight RFC 5322 characters that force `quoted-string` wrapping (FR-4, design.md §4.5). */
const QUOTING_TRIGGERS = /["\\<>,;:@]/;
/** Inside a `quoted-string`, only these two characters require a `\`-escape. */
const QUOTED_STRING_ESCAPES = /[\\"]/g;

const ENCODED_WORD_CHARSET = 'UTF-8';
const ENCODED_WORD_ENCODING = 'B';
const ENCODED_WORD_PREFIX = `=?${ENCODED_WORD_CHARSET}?${ENCODED_WORD_ENCODING}?`;
const ENCODED_WORD_SUFFIX = '?=';

/** RFC 2047 §5: an entire encoded-word token MUST NOT exceed this many octets. */
export const MAX_ENCODED_WORD_OCTETS = 75;

/** Base64 payload budget that keeps a whole encoded-word within MAX_ENCODED_WORD_OCTETS. */
const MAX_BASE64_PAYLOAD_OCTETS =
  MAX_ENCODED_WORD_OCTETS - (ENCODED_WORD_PREFIX.length + ENCODED_WORD_SUFFIX.length);

/**
 * Max raw UTF-8 octets per chunk so its Base64 rendering (4 output chars per
 * 3 input octets) never exceeds MAX_BASE64_PAYLOAD_OCTETS. Floored to a
 * multiple of 3 so every chunk's Base64 form is exact-length (no padding),
 * which keeps the budget exact rather than needing a per-chunk re-check.
 */
const MAX_CHUNK_OCTETS = Math.floor(MAX_BASE64_PAYLOAD_OCTETS / 4) * 3;

/**
 * Joins adjacent encoded-words with a single space (design.md §4.5, amendment
 * 1). Not a header fold — SES assembles the MIME header from the structured
 * `ReplyToAddresses` field and would reject a literal `CRLF SP` inside it.
 */
const ENCODED_WORD_JOINER = ' ';

/** Step 1: strip CR and LF — the only sanitization every field gets before any other processing. */
function stripCrLf(value: string): string {
  return value.replace(CR_LF, '');
}

/** Step 4's escaping: only `\` and `"` need a backslash inside a `quoted-string`. */
function escapeQuotedString(value: string): string {
  return value.replace(QUOTED_STRING_ESCAPES, (ch) => `\\${ch}`);
}

/**
 * Split `value` into the fewest chunks of at most `maxOctets` UTF-8 octets
 * each, never splitting a single Unicode code point. Iterating with
 * `for...of` walks the string by code point, so an astral character's
 * surrogate pair is always kept whole in one chunk.
 */
function splitByUtf8Octets(value: string, maxOctets: number): string[] {
  const chunks: string[] = [];
  let current = '';
  let currentOctets = 0;

  for (const char of value) {
    const charOctets = Buffer.byteLength(char, 'utf8');
    if (current.length > 0 && currentOctets + charOctets > maxOctets) {
      chunks.push(current);
      current = '';
      currentOctets = 0;
    }
    current += char;
    currentOctets += charOctets;
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

/** Step 3: RFC 2047 Base64 encoded-word(s), split and joined per the file doc above. */
function encodeRfc2047(value: string): string {
  const chunks = splitByUtf8Octets(value, MAX_CHUNK_OCTETS);
  const words = chunks.map(
    (chunk) => `${ENCODED_WORD_PREFIX}${Buffer.from(chunk, 'utf8').toString('base64')}${ENCODED_WORD_SUFFIX}`,
  );
  return words.join(ENCODED_WORD_JOINER);
}

/**
 * Compose `Display Name <address>` for the SES `ReplyToAddresses` header
 * (design.md §4.5, FR-4). Both `name` and `address` are visitor-submitted,
 * untrusted text — see the file doc above for the full decision order.
 */
export function composeReplyTo(name: string, address: string): string {
  const safeAddress = stripCrLf(address ?? '');
  const safeName = stripCrLf(name ?? '');

  if (safeName.length === 0) {
    return safeAddress;
  }

  try {
    let displayName: string;
    if (NON_ASCII.test(safeName)) {
      displayName = encodeRfc2047(safeName);
    } else if (QUOTING_TRIGGERS.test(safeName)) {
      displayName = `"${escapeQuotedString(safeName)}"`;
    } else {
      displayName = safeName;
    }

    return `${displayName} <${safeAddress}>`;
  } catch {
    return safeAddress;
  }
}
