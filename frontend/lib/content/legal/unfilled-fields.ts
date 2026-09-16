/**
 * unfilled-fields.ts — inventory support for `/terms` and `/privacy`'s
 * unfilled-field gate (validation remediation, PART 2).
 *
 * `/terms` and `/privacy` deliberately publish Legal's unfilled fields —
 * "Insert Date", "Insert CIAT Legal Entity", "Insert Email", "Insert
 * Address", "Insert Telephone Number", and several blank contact `value`
 * entries — as ordinary text (terms.ts / privacy.ts module docs). Carrying
 * them is a deliberate product-owner decision and is NOT changed here.
 *
 * The defect this closes is that no gate could see them at all: the
 * placeholder tripwire (FR-2) matches only the literal word "placeholder",
 * and the pre-existing `/privacy` test *pinned*
 * `/effective insert date/i` as satisfying FR-5's visible-effective-date
 * clause — i.e. the only assertion that touched this text certified the
 * defect rather than naming it.
 *
 * This module does not flag anything as wrong, and it is not a
 * permanently-red test. It gives `terms.test.ts` / `privacy.test.ts`
 * something to assert an EXACT, EXPLICIT set against:
 *   - adding a new unfilled field to either document changes the actual
 *     set and reddens the test;
 *   - filling in a field that is already tracked also changes the actual
 *     set and reddens the test — so a fill can never happen silently,
 *     it always requires a deliberate edit to the test's expected list;
 *   - when a document's expected list is empty, that document is
 *     publishable — a non-empty list is this gate's way of saying the
 *     document is NOT yet publishable.
 *
 * Matches, at minimum, `/insert (date|email|address|telephone
 * number|ciat legal entity)/i`, generalized to any "Insert <Word(s)>"
 * placeholder so a genuinely NEW unfilled field (not just the five known
 * ones) also reddens — plus every contact block entry whose `value` is
 * the empty string.
 */

import type { LegalContactEntry, LegalContentBlock, LegalDocument, LegalSection } from './types';

/**
 * Matches "Insert <Word>", "Insert <Word> <Word>", … (up to four words),
 * case-insensitively. A superset of the minimum `/insert (date|email|
 * address|telephone number|ciat legal entity)/i` the remediation brief
 * names — generalized so a placeholder this module has never seen before
 * (e.g. a future "Insert Fax Number") is still caught, rather than only
 * the five fields known today.
 */
const UNFILLED_FIELD_PATTERN = /\binsert(?: [a-z][a-z]*){1,4}\b/gi;

/**
 * A label with nothing after it, inside ordinary prose rather than a
 * structured `contact` block — e.g. Legal's "CIAT Address: Email:" in the
 * Privacy Policy's "Who is Responsible for the Registry?" section, where
 * the address and email were never filled in.
 *
 * Closing this was not optional. Without it the inventory could reach an
 * EMPTY list — its own signal that the document is publishable — while the
 * page still rendered a visible blank to a data subject trying to exercise
 * a right. A completeness gate with a known hole reports completeness it
 * does not have, which is worse than no gate.
 */
/**
 * ⚠️ **A CLOSED list of contact-field labels, and that limit is deliberate.**
 *
 * Generalizing it to any capitalised word before a colon was tried and
 * reverted: it matched Legal's ordinary prose colons ("…through the
 * Registry may:", "…in the Registry until:"), which introduce bullet lists.
 * A blank field and a list lead-in are indistinguishable from the string
 * alone — both are a label, a colon, and nothing after it in that string.
 *
 * False positives are worse than a narrow pattern here. An inventory that
 * cries wolf trains its reader to update the expected list without reading
 * it, which destroys the gate more thoroughly than a miss does.
 *
 * **What this therefore does NOT catch:** a blank label whose name is not
 * in this list — a future "Fax:" or "Website:" would pass. Demonstrated,
 * not assumed: adding "Fax:" to Legal's prose reddened nothing. The
 * generalized half of this module is {@link UNFILLED_FIELD_PATTERN}, which
 * does catch an "Insert <anything>" it has never seen. Between them the
 * realistic space is covered; neither covers it alone, and this comment
 * exists so nobody reads an empty inventory as proof of more than it is.
 */
const BLANK_PROSE_LABELS = ['address', 'e-?mail', 'telephone', 'phone', 'fax', 'website', 'contact person'];

// Built via `new RegExp` from the `BLANK_PROSE_LABELS` list above rather than
// a single alternation literal (typescript:S5843 — "regex too complex"): the
// matching behaviour is byte-for-byte identical (same lookbehind, same
// alternatives, same lookahead) — only the inline alternation is gone,
// replaced by data the list above makes visible and easy to extend.
const BLANK_PROSE_LABEL_PATTERN = new RegExp(
  `(?<!please )\\b(${BLANK_PROSE_LABELS.join('|')}):(?=\\s*$|\\s+[A-Z][a-z]+:)`,
  'gi',
);

function collectBlockText(block: LegalContentBlock): string[] {
  switch (block.kind) {
    case 'paragraph':
      return [block.text, ...(block.link ? [block.link.label] : [])];
    case 'bullets':
      return block.items.flatMap((item) =>
        typeof item === 'string' ? [item] : [item.text, ...(item.children ?? [])]
      );
    case 'subBlocks':
      return block.blocks.flatMap((sub) => [sub.heading, ...sub.paragraphs]);
    case 'contact':
      return block.entries.flatMap((entry) => [entry.label, entry.value]);
    default:
      return [];
  }
}

function collectSectionText(section: LegalSection): string[] {
  if (section.blocks) {
    return [section.heading, ...section.blocks.flatMap(collectBlockText)];
  }
  return [section.heading, ...section.paragraphs, ...(section.bullets ?? [])];
}

function collectContactEntries(document: LegalDocument): LegalContactEntry[] {
  const entries: LegalContactEntry[] = [];
  for (const section of document.sections) {
    if (!section.blocks) continue;
    for (const block of section.blocks) {
      if (block.kind === 'contact') entries.push(...block.entries);
    }
  }
  return entries;
}

/**
 * Normalizes `document.lede` (absent, a single string, or a string[]) to
 * always an array, so the caller below has exactly one shape to spread —
 * pulled out of the nested ternary that used to compute this inline
 * (typescript:S3358), same behaviour.
 */
function normalizeLede(lede: LegalDocument['lede']): string[] {
  if (lede === undefined) return [];
  return Array.isArray(lede) ? lede : [lede];
}

/**
 * Returns the sorted, de-duplicated set of unfilled-Legal-field tokens
 * present anywhere in `document` — every "Insert <…>" placeholder, plus
 * one `"<label>: (blank)"` token per contact entry whose `value` is `''`.
 * See module doc for what a non-empty result means.
 */
export function collectUnfilledFieldTokens(document: LegalDocument): string[] {
  const lede = normalizeLede(document.lede);
  const allText: string[] = [
    document.title,
    document.effectiveDate,
    ...lede,
    ...document.sections.flatMap(collectSectionText),
  ];

  const tokens = new Set<string>();
  for (const text of allText) {
    for (const match of text.matchAll(UNFILLED_FIELD_PATTERN)) {
      tokens.add(match[0]);
    }
    for (const match of text.matchAll(BLANK_PROSE_LABEL_PATTERN)) {
      tokens.add(`${match[1]}: (blank, in prose)`);
    }
  }

  for (const entry of collectContactEntries(document)) {
    if (entry.value === '') tokens.add(`${entry.label}: (blank)`);
  }

  // `localeCompare`, not a bare `.sort()`: the default sorts by UTF-16 code
  // unit, which is not alphabetical once a label carries an accent or a
  // non-ASCII character — and these tokens come from legal prose, which is
  // exactly where that happens (typescript:S2871).
  return Array.from(tokens).sort((a, b) => a.localeCompare(b));
}
