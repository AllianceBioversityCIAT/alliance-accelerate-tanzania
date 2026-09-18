/**
 * types.ts — the shared content contract for the three public legal
 * documents (Cookie Notice, Terms of Use, Privacy Policy). T-2 (FR-7,
 * design.md §5.1); extended T-8 (FR-4, FR-5) to carry Legal's own
 * structure once the approved Terms of Use and Privacy Policy texts
 * landed.
 *
 * A `LegalDocument` is deliberately narrow: headings, paragraphs, and
 * optional bulleted enumerations. It does not model arbitrary rich text —
 * Legal's supplied structure never needs more than that, and if a delivered
 * text ever does, the shape is extended once, in one place, rather than
 * each page inventing its own markup (design.md §5.1).
 *
 * `LegalDocumentView` (this directory's sibling component) is the one
 * renderer for all three documents; content modules under
 * `frontend/lib/content/legal/*.ts` (cookies.ts, terms.ts, privacy.ts —
 * T-3/T-5/T-8) supply `LegalDocument` values against this contract and are
 * not created by this task.
 *
 * ---------------------------------------------------------------------
 * T-8 extension — why `LegalContentBlock` exists
 * ---------------------------------------------------------------------
 * The approved Terms of Use and Privacy Policy texts do not fit the
 * original "paragraphs, then one optional bullet list" shape a section
 * offered. Reviewing the full approved texts surfaced three distinct
 * needs, all additive:
 *
 *   1. A bullet that itself carries nested sub-bullets (Terms §"Profile
 *      Updates and Removal": "Remove profiles or information that:"
 *      followed by five sub-bullets).
 *   2. A labelled sub-block — a sub-heading with its own prose underneath,
 *      not a bullet and not a full section (Privacy §"How We Collect
 *      Information": Self-registration / Administrator-managed
 *      registration / Platform operation).
 *   3. A closing contact block — label/value lines (Contact / Email /
 *      Address / Telephone) rendered as a semantic description list, not
 *      loose paragraphs.
 *
 * A fourth need showed up that the product owner's three-item list did not
 * anticipate: almost every bulleted section in both approved documents
 * places ANOTHER paragraph *after* its bullet list before the next heading
 * (e.g. Privacy §"Information We Collect": intro paragraph, thirteen
 * bullets, then "Not all information is necessarily personal data...").
 * The original `paragraphs`-then-`bullets` shape renders all paragraphs
 * before the bullet list, which would silently reorder that trailing
 * sentence ahead of the list it explains — exactly what the brief's
 * "do not flatten, reorder, merge" instruction forbids.
 *
 * `LegalSection.blocks` is the single, additive answer to all four: an
 * ordered list of content pieces (paragraph / bullets / subBlocks /
 * contact) rendered in exactly the order given. It subsumes the three
 * requested shapes and also preserves inter-paragraph/bullet ordering that
 * the flat fields cannot. `paragraphs`/`bullets` are UNCHANGED and stay the
 * simple path `cookies.ts` already uses — `blocks` is only read when a
 * section sets it, so no existing document is affected.
 */

/**
 * One bulleted list item. A plain `string` is a leaf bullet (unchanged
 * shape from before T-8). The object form additionally carries nested
 * sub-bullets, rendered under it as its own indented list — e.g. Terms
 * §"Profile Updates and Removal"'s "Remove profiles or information that:"
 * bullet, which is followed by five sub-bullets.
 */
export interface LegalBulletItem {
  /** The bullet's own text. */
  text: string;
  /** Optional nested sub-bullets, rendered under this item. */
  children?: string[];
}

/**
 * A labelled sub-block: a sub-heading with its own ordered prose
 * underneath. Distinct from a bullet (it is prose, not an enumerated
 * item) and from a full section (it has no `id`/`aria-labelledby` region
 * of its own — it lives inside its parent section). E.g. Privacy §"How We
 * Collect Information"'s Self-registration / Administrator-managed
 * registration / Platform operation blocks.
 */
export interface LegalSubBlock {
  /** Visible sub-heading text. */
  heading: string;
  /** Ordered prose paragraphs rendered under the sub-heading. */
  paragraphs: string[];
}

/**
 * One label/value line in a closing contact block (Contact / Email /
 * Address / Telephone, etc.). `value` may be an empty string when Legal's
 * own source left the field blank (e.g. "Email: " with nothing after) —
 * reproduced as-is; engineering does not invent or drop the line.
 */
export interface LegalContactEntry {
  /** The line's label, e.g. `"Email"`. Rendered as the description list's `<dt>`. */
  label: string;
  /** The line's value. May be `""` when Legal's source left it blank. */
  value: string;
}

/**
 * One piece of a section's content, in render order. Used via
 * `LegalSection.blocks` — see the module doc above for why this exists
 * alongside the simpler `paragraphs`/`bullets` fields.
 */
export type LegalContentBlock =
  | {
      kind: 'paragraph';
      /** The paragraph's text. */
      text: string;
      /**
       * Optional trailing inline link, rendered immediately after `text`
       * inside the same paragraph. Used for an engineering-authored
       * cross-reference appended to Legal's own prose (e.g. Privacy
       * §Cookies closing with a pointer to `/cookies`, D-4) — the link
       * itself is never part of Legal's verbatim text.
       */
      link?: {
        href: string;
        label: string;
      };
    }
  | {
      kind: 'bullets';
      items: (string | LegalBulletItem)[];
    }
  | {
      kind: 'subBlocks';
      blocks: LegalSubBlock[];
    }
  | {
      kind: 'contact';
      entries: LegalContactEntry[];
    };

/**
 * One section of a legal document: a heading, plus EITHER the simple
 * `paragraphs`/`bullets` path OR the richer `blocks` path — never both.
 *
 * This is a discriminated union, not a single interface with two optional
 * fields, on purpose (T-8 rework, Reviewer FAIL issue B). The earlier
 * shape — `paragraphs: string[]` always required, `blocks?:
 * LegalContentBlock[]` optional — type-checked `{paragraphs: [...],
 * blocks: [...]}` as valid and the renderer silently discarded
 * `paragraphs` whenever `blocks` was set (see `LegalDocumentView.tsx`'s
 * `useBlocks` branch). On a legal-document renderer, silent content loss
 * is the wrong default: a future author who sets both loses half the
 * document and nothing reddens. Making the two paths mutually exclusive
 * at the type level (`blocks?: never` on the paragraphs variant,
 * `paragraphs?: never` on the blocks variant) turns that mistake into a
 * compile error instead of a silent runtime omission.
 */
export type LegalSection =
  | {
      /** Visible section heading; also the section's accessible name. */
      heading: string;
      /** Ordered body paragraphs rendered under the heading. */
      paragraphs: string[];
      /** Optional bulleted enumeration, rendered after the paragraphs. */
      bullets?: string[];
      blocks?: never;
    }
  | {
      /** Visible section heading; also the section's accessible name. */
      heading: string;
      paragraphs?: never;
      bullets?: never;
      /**
       * Ordered content blocks — the alternative to `paragraphs`/`bullets`
       * for a section whose structure needs more than "paragraphs, then
       * one bullet list" (see the module doc above). Rendered block by
       * block, in the exact order given.
       */
      blocks: LegalContentBlock[];
    };

/**
 * A complete legal document: title, version, effective date, an optional
 * short lede, and its ordered sections.
 *
 * Only the consent policy (`backend/src/registrations/consent-policy.ts`,
 * T-1/T-9 — out of scope here) is ever *accepted*; none of the three
 * documents this type serves carries acceptance machinery (design.md §5,
 * requirements.md D-6). `version`/`effectiveDate` exist purely so a reader
 * can tell which edition of the text they are looking at.
 */
export interface LegalDocument {
  /** Rendered as the page's `h1`. */
  title: string;
  /** Visible version identifier, e.g. `"v1.0"`. */
  version: string;
  /** Visible effective date, e.g. `"15 September 2026"`. Free text, not a Date. */
  effectiveDate: string;
  /**
   * Optional short introductory text rendered under the version/date
   * stamp. A plain `string` renders as one paragraph. `string[]` renders
   * one `<p>` per entry, in order — added T-8 (rework) because Legal's
   * approved Terms and Privacy texts each open with several separate
   * source paragraphs (Terms: 3; Privacy: 2), and merging them into one
   * string was an unratified structural change: it folded Terms' binding
   * assent clause into the same paragraph as the welcome and operator
   * identity. `paragraphs`/`bullets` on `LegalSection` were already an
   * established precedent for "the shape is extended once, in one place"
   * (design.md §5.1) when a delivered text needs more than the original
   * shape expresses.
   */
  lede?: string | string[];
  /** Ordered sections that make up the document's body. */
  sections: LegalSection[];
}
