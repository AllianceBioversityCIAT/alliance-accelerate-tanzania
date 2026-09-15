// LegalDocumentView — the one shared renderer for the three public legal
// documents (Cookie Notice, Terms of Use, Privacy Policy). T-2 (FR-7,
// design.md §5.1, §5.3); extended T-8 to render the richer structure the
// approved Terms of Use and Privacy Policy texts carry (nested bullets,
// labelled sub-blocks, contact blocks — see types.ts's module doc).
//
// Static server component: no 'use client', no hooks, no useSearchParams.
// Every one of the three route modules that consume this
// (`app/(public)/{cookies,terms,privacy}/page.tsx`) stays compatible with
// `output: 'export'` (ADR-002) as long as this file only takes props and
// renders markup. `next/link` is safe to use here for the same reason
// Footer.tsx and ContactForm.tsx already do — it renders a plain `<a>` at
// build time, no client runtime required.
//
// Markup mirrors the existing `/privacy` page's heading hierarchy,
// `aria-labelledby` section pattern, and token classes exactly (FR-7's
// "structural uniformity" scenario) so all three documents present their
// version/date stamp in the same position and share heading/token
// treatment. Only the *content* differs per document.
//
// A section renders its content one of two ways:
//   - the simple path: `paragraphs` (always), then `bullets` (if set) —
//     unchanged since T-2, and the only path `cookies.ts` ever uses.
//   - the `blocks` path: when a section sets a non-empty `blocks` array,
//     it is rendered INSTEAD of `paragraphs`/`bullets`, block by block, in
//     the exact order given. This is what `terms.ts`/`privacy.ts` (T-8)
//     use for every section whose structure does not fit the simple path.
//
// The optional `slot` lets a document place one interactive control inside
// its flow, immediately after a named section, rather than bolted on below
// the whole document (design.md §5.3). `/cookies` uses it to place
// `ConsentChoiceControl` after the Cookie Notice's "Changing your choice"
// section; `/terms` and `/privacy` pass no slot and so render identically
// to each other structurally.

import type { ReactNode } from 'react';
import Link from 'next/link';

import type {
  LegalBulletItem,
  LegalContentBlock,
  LegalDocument,
  LegalSection,
} from '@/lib/content/legal/types';

export interface LegalDocumentSlot {
  /**
   * The exact `heading` of the `LegalSection` this slot renders after.
   * If no section in the document matches, the slot is silently not
   * rendered — a document and its slot can therefore never disagree about
   * a section that does not exist.
   */
  afterHeading: string;
  /** The interactive content placed in that position. */
  content: ReactNode;
}

export interface LegalDocumentViewProps {
  /** The document to render. */
  document: LegalDocument;
  /** Optional post-section slot — see module doc above and design.md §5.3. */
  slot?: LegalDocumentSlot;
}

/**
 * Derives a stable, unique `id` for a section heading so `aria-labelledby`
 * always resolves. Prefixed with the section's index so two sections that
 * share (or both omit) a heading never collide, and so an empty heading
 * still yields a syntactically valid `id` — the resulting section simply
 * has no meaningful accessible name, which is the intended, falsifiable
 * failure mode (see LegalDocumentView.test.tsx).
 */
function sectionHeadingId(heading: string, index: number): string {
  const slug = heading
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `legal-section-${index}${slug ? `-${slug}` : ''}-heading`;
}

/** Renders one bullet list item, including its nested sub-bullets if any. */
function BulletItem({ item }: { item: string | LegalBulletItem }) {
  const text = typeof item === 'string' ? item : item.text;
  const children = typeof item === 'string' ? undefined : item.children;

  return (
    <li>
      {text}
      {children && children.length > 0 && (
        <ul className="mt-1 list-[circle] space-y-1 pl-5">
          {children.map((child, index) => (
            <li key={index}>{child}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Renders the ordered `blocks` content of a section, block by block. */
function SectionBlocks({ blocks }: { blocks: LegalContentBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'paragraph':
            return (
              <p
                key={index}
                className="mt-2 text-sm leading-relaxed text-muted"
              >
                {block.text}
                {block.link && (
                  <>
                    {' '}
                    <Link
                      href={block.link.href}
                      className="font-medium text-primary hover:underline"
                    >
                      {block.link.label}
                    </Link>
                    {/* A trailing link closes the sentence its preceding
                        text opened (e.g. privacy.ts's "...see the" +
                        "Cookie Notice"), so a terminal full stop is added
                        here rather than in every block's `text` — the one
                        current consumer omitted it (Reviewer FAIL, T-8
                        rework). */}
                    .
                  </>
                )}
              </p>
            );

          case 'bullets':
            return (
              <ul
                key={index}
                className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted"
              >
                {block.items.map((item, itemIndex) => (
                  <BulletItem key={itemIndex} item={item} />
                ))}
              </ul>
            );

          case 'subBlocks':
            return (
              <div key={index} className="mt-4 flex flex-col gap-4">
                {block.blocks.map((subBlock, subIndex) => (
                  <div key={subIndex}>
                    <h3 className="text-sm font-semibold text-fg">{subBlock.heading}</h3>
                    {subBlock.paragraphs.map((paragraph, paragraphIndex) => (
                      <p
                        key={paragraphIndex}
                        className="mt-1 text-sm leading-relaxed text-muted"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            );

          case 'contact':
            return (
              <dl
                key={index}
                className="mt-3 space-y-1 text-sm leading-relaxed text-muted"
              >
                {block.entries.map((entry, entryIndex) => (
                  <div key={entryIndex} className="flex flex-wrap gap-x-2">
                    <dt className="font-semibold text-fg">{entry.label}:</dt>
                    <dd>{entry.value}</dd>
                  </div>
                ))}
              </dl>
            );

          default:
            return null;
        }
      })}
    </>
  );
}

/** The `LegalSection` union member carrying the simple `paragraphs`/`bullets` path. */
type ParagraphsSection = Extract<LegalSection, { paragraphs: string[] }>;

/** Renders a section's body via the simple `paragraphs`/`bullets` path. */
function SimpleSectionBody({ section }: { section: ParagraphsSection }) {
  return (
    <>
      {section.paragraphs.map((paragraph, paragraphIndex) => (
        <p
          key={paragraphIndex}
          className="mt-2 text-sm leading-relaxed text-muted"
        >
          {paragraph}
        </p>
      ))}

      {section.bullets && section.bullets.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted">
          {section.bullets.map((bullet, bulletIndex) => (
            <li key={bulletIndex}>{bullet}</li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function LegalDocumentView({ document, slot }: LegalDocumentViewProps) {
  return (
    // WIDTH — two controls, and the non-obvious one was the binding constraint.
    // Every paragraph and list used to carry `max-w-prose` (65ch, measured at
    // 574px / ~88 characters here), which capped the text REGARDLESS of this
    // container. Widening the container alone changed nothing visible, which is
    // why the first attempt at this looked identical. `max-w-prose` is gone;
    // this container is now the only cap.
    // `max-w-4xl` (56rem) rather than `3xl` (48rem): the widening the product
    // owner asked for, deliberately NOT full-bleed — line length still governs
    // legibility, and these are long documents.
    // `text-justify` + `hyphens-auto`: justification alone opens rivers of
    // whitespace on narrow viewports, and the hyphenation is what keeps the
    // word spacing even. The two go together; do not keep one without the other.
    <div className="mx-auto max-w-4xl px-4 py-8 text-justify hyphens-auto sm:px-6 lg:px-8">
      <h1 className="text-2xl font-extrabold leading-tight text-fg lg:text-3xl">
        {document.title}
      </h1>

      {/* Version + effective-date stamp — fixed position (h1, then stamp,
          then optional lede, then sections) and format across all three
          documents, per FR-7's structural-uniformity scenario. */}
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Version {document.version} &middot; Effective {document.effectiveDate}
      </p>

      {document.lede
        && (Array.isArray(document.lede) ? (
          document.lede.map((paragraph, index) => (
            <p key={index} className="mt-2 text-sm text-muted">
              {paragraph}
            </p>
          ))
        ) : (
          <p className="mt-2 text-sm text-muted">{document.lede}</p>
        ))}

      <div className="mt-8 flex flex-col gap-8">
        {document.sections.flatMap((section, index) => {
          const headingId = sectionHeadingId(section.heading, index);
          const showSlotAfter = slot?.afterHeading === section.heading;

          const elements: ReactNode[] = [
            <section key={headingId} aria-labelledby={headingId}>
              <h2 id={headingId} className="text-lg font-semibold text-fg">
                {section.heading}
              </h2>

              {section.blocks ? (
                <SectionBlocks blocks={section.blocks} />
              ) : (
                <SimpleSectionBody section={section} />
              )}
            </section>,
          ];

          if (showSlotAfter) {
            elements.push(<div key={`${headingId}-slot`}>{slot!.content}</div>);
          }

          return elements;
        })}
      </div>
    </div>
  );
}
