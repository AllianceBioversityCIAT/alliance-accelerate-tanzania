/**
 * types.ts — the shared content contract for the three public legal
 * documents (Cookie Notice, Terms of Use, Privacy Policy). T-2 (FR-7,
 * design.md §5.1).
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
 */

/**
 * One section of a legal document: a heading, one or more ordered
 * paragraphs, and an optional bulleted enumeration rendered after them.
 */
export interface LegalSection {
  /** Visible section heading; also the section's accessible name. */
  heading: string;
  /** Ordered body paragraphs rendered under the heading. */
  paragraphs: string[];
  /** Optional bulleted enumeration, rendered after the paragraphs. */
  bullets?: string[];
}

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
  /** Optional short introductory paragraph rendered under the version/date stamp. */
  lede?: string;
  /** Ordered sections that make up the document's body. */
  sections: LegalSection[];
}
