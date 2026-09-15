// LegalDocumentView — the one shared renderer for the three public legal
// documents (Cookie Notice, Terms of Use, Privacy Policy). T-2 (FR-7,
// design.md §5.1, §5.3).
//
// Static server component: no 'use client', no hooks, no useSearchParams.
// Every one of the three route modules that will consume this (T-4, T-5,
// T-8 — not built by this task) stays compatible with `output: 'export'`
// (ADR-002) as long as this file only takes props and renders markup.
//
// Markup mirrors the existing `/privacy` page's heading hierarchy,
// `aria-labelledby` section pattern, and token classes exactly (FR-7's
// "structural uniformity" scenario) so all three documents present their
// version/date stamp in the same position and share heading/token
// treatment. Only the *content* differs per document.
//
// The optional `slot` lets a document place one interactive control inside
// its flow, immediately after a named section, rather than bolted on below
// the whole document (design.md §5.3). `/cookies` (T-4) will use it to
// place `ConsentChoiceControl` after the Cookie Notice's "Changing your
// choice" section; `/terms` and `/privacy` (T-5/T-8) pass no slot and so
// render identically to each other structurally.

import type { ReactNode } from 'react';

import type { LegalDocument } from '@/lib/content/legal/types';

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

export default function LegalDocumentView({ document, slot }: LegalDocumentViewProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-extrabold leading-tight text-fg lg:text-3xl">
        {document.title}
      </h1>

      {/* Version + effective-date stamp — fixed position (h1, then stamp,
          then optional lede, then sections) and format across all three
          documents, per FR-7's structural-uniformity scenario. */}
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Version {document.version} &middot; Effective {document.effectiveDate}
      </p>

      {document.lede && (
        <p className="mt-2 max-w-prose text-sm text-muted">{document.lede}</p>
      )}

      <div className="mt-8 flex flex-col gap-8">
        {document.sections.flatMap((section, index) => {
          const headingId = sectionHeadingId(section.heading, index);
          const showSlotAfter = slot?.afterHeading === section.heading;

          const elements: ReactNode[] = [
            <section key={headingId} aria-labelledby={headingId}>
              <h2 id={headingId} className="text-lg font-semibold text-fg">
                {section.heading}
              </h2>

              {section.paragraphs.map((paragraph, paragraphIndex) => (
                <p
                  key={paragraphIndex}
                  className="mt-2 max-w-prose text-sm leading-relaxed text-muted"
                >
                  {paragraph}
                </p>
              ))}

              {section.bullets && section.bullets.length > 0 && (
                <ul className="mt-2 max-w-prose list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted">
                  {section.bullets.map((bullet, bulletIndex) => (
                    <li key={bulletIndex}>{bullet}</li>
                  ))}
                </ul>
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
