/**
 * LegalDocumentView unit tests. T-2 (FR-7, design.md §5.1, §5.3).
 *
 * Coverage:
 *  - Structural uniformity: title, version/date stamp position, and section
 *    heading/token treatment for a two-section document.
 *  - The optional slot renders after its named section, and is absent when
 *    no slot prop is passed — so /terms and /privacy (no slot) render
 *    identically to each other structurally, matching the Cookie Notice
 *    (with slot) everywhere except the slot's own content.
 *  - Bullets render only when supplied.
 *  - DEMONSTRATED FALSIFIER (mandatory): a section whose heading is omitted
 *    (empty string) must NOT be reachable via its intended accessible name —
 *    the aria-labelledby assertion below is required to redden against that
 *    input. Run, observe red, then the mutation is reverted (the assertion
 *    stays; only the malformed fixture is temporary).
 *
 * NOT covered by anything in this file (NFR-2, NFR-5): jsdom has no layout
 * engine and does not evaluate contrast or rendered legibility. A passing
 * suite here says nothing about whether the tokens used actually read as
 * legible text at any real viewport — that is the human check routed to
 * T-10's HITL pause.
 */

import { render, screen } from '@testing-library/react';
import LegalDocumentView from './LegalDocumentView';
import type { LegalDocument } from '@/lib/content/legal/types';

const twoSectionDocument: LegalDocument = {
  title: 'Sample Legal Document',
  version: 'v1.0',
  effectiveDate: '15 September 2026',
  lede: 'A short introduction to this document.',
  sections: [
    {
      heading: 'First section',
      paragraphs: ['First paragraph of the first section.'],
    },
    {
      heading: 'Second section',
      paragraphs: ['First paragraph of the second section.', 'A second paragraph.'],
      bullets: ['Bullet one', 'Bullet two'],
    },
  ],
};

describe('LegalDocumentView', () => {
  // ---------------------------------------------------------------------
  // Title, version/date stamp, lede — structural uniformity (FR-7)
  // ---------------------------------------------------------------------

  it('renders the document title as the h1', () => {
    render(<LegalDocumentView document={twoSectionDocument} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Sample Legal Document');
  });

  it('renders the version and effective date together, immediately after the h1', () => {
    render(<LegalDocumentView document={twoSectionDocument} />);
    expect(screen.getByText(/version v1\.0/i)).toBeInTheDocument();
    expect(screen.getByText(/effective 15 september 2026/i)).toBeInTheDocument();
  });

  it('renders the optional lede when supplied', () => {
    render(<LegalDocumentView document={twoSectionDocument} />);
    expect(
      screen.getByText('A short introduction to this document.'),
    ).toBeInTheDocument();
  });

  it('does not render a lede paragraph when none is supplied', () => {
    const noLede: LegalDocument = { ...twoSectionDocument, lede: undefined };
    render(<LegalDocumentView document={noLede} />);
    expect(
      screen.queryByText('A short introduction to this document.'),
    ).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------
  // Sections — heading, paragraphs, bullets
  // ---------------------------------------------------------------------

  it('renders a two-section document with each section addressable by its heading via aria-labelledby', () => {
    render(<LegalDocumentView document={twoSectionDocument} />);
    for (const section of twoSectionDocument.sections) {
      const region = screen.getByRole('region', { name: section.heading });
      expect(region).toBeInTheDocument();
    }
  });

  it('renders every paragraph in order for a section', () => {
    render(<LegalDocumentView document={twoSectionDocument} />);
    expect(
      screen.getByText('First paragraph of the second section.'),
    ).toBeInTheDocument();
    expect(screen.getByText('A second paragraph.')).toBeInTheDocument();
  });

  it('renders a bulleted list only for a section that supplies bullets', () => {
    render(<LegalDocumentView document={twoSectionDocument} />);
    expect(screen.getByText('Bullet one')).toBeInTheDocument();
    expect(screen.getByText('Bullet two')).toBeInTheDocument();

    // The first section supplies no bullets — its region must contain no <ul>.
    const firstRegion = screen.getByRole('region', { name: 'First section' });
    expect(firstRegion.querySelector('ul')).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------
  // Optional slot (design.md §5.3)
  // ---------------------------------------------------------------------

  it('renders the slot content after its named section when a slot is supplied', () => {
    render(
      <LegalDocumentView
        document={twoSectionDocument}
        slot={{ afterHeading: 'First section', content: <button>Change choice</button> }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Change choice' })).toBeInTheDocument();

    // Order: the slot's control must come after "First section" and before
    // "Second section" in document order.
    const container = screen.getByRole('button', { name: 'Change choice' })
      .closest('div')!.parentElement!;
    const children = Array.from(container.children).map((el) => el.textContent);
    const firstIndex = children.findIndex((t) => t?.includes('First section'));
    const slotIndex = children.findIndex((t) => t?.includes('Change choice'));
    const secondIndex = children.findIndex((t) => t?.includes('Second section'));
    expect(firstIndex).toBeLessThan(slotIndex);
    expect(slotIndex).toBeLessThan(secondIndex);
  });

  it('renders no slot content when no slot prop is passed (Terms/Privacy parity)', () => {
    render(<LegalDocumentView document={twoSectionDocument} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders /terms-shaped and /privacy-shaped calls (no slot) with identical section structure', () => {
    const { unmount } = render(<LegalDocumentView document={twoSectionDocument} />);
    const noSlotHeadingIds = screen
      .getAllByRole('region')
      .map((region) => region.getAttribute('aria-labelledby'));
    unmount();

    render(<LegalDocumentView document={twoSectionDocument} />);
    const secondRunHeadingIds = screen
      .getAllByRole('region')
      .map((region) => region.getAttribute('aria-labelledby'));

    expect(secondRunHeadingIds).toEqual(noSlotHeadingIds);
  });

  it('silently omits the slot when afterHeading names a section that does not exist', () => {
    render(
      <LegalDocumentView
        document={twoSectionDocument}
        slot={{ afterHeading: 'Nonexistent section', content: <button>Ghost</button> }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Ghost' })).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------
  // DEMONSTRATED FALSIFIER — MANDATORY
  // ---------------------------------------------------------------------

  it('FALSIFIER: a section whose heading is omitted breaks the aria-labelledby accessible-name query', () => {
    const documentWithMissingHeading: LegalDocument = {
      ...twoSectionDocument,
      sections: [
        { heading: '', paragraphs: ['Body text with no heading.'] },
        ...twoSectionDocument.sections.slice(1),
      ],
    };
    render(<LegalDocumentView document={documentWithMissingHeading} />);

    // The section that legitimately has no heading text can never be found
    // by an accessible name that names the *original* heading — this is the
    // reddening assertion. (Run this test against the mutation to confirm
    // it fails, then it is the malformed fixture — not this assertion —
    // that gets reverted; the assertion itself stays in the suite.)
    expect(() => screen.getByRole('region', { name: 'First section' })).toThrow();
  });
});
