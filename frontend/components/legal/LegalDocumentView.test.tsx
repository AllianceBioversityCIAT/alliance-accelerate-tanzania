/**
 * LegalDocumentView unit tests. T-2 (FR-7, design.md §5.1, §5.3); extended
 * T-8 to cover the three `blocks` shapes the approved Terms of Use and
 * Privacy Policy texts need (nested bullets, labelled sub-blocks, contact
 * blocks) plus the ordering fidelity `blocks` exists to preserve.
 *
 * Coverage:
 *  - Structural uniformity: title, version/date stamp position, and section
 *    heading/token treatment for a two-section document.
 *  - The optional slot renders after its named section, and is absent when
 *    no slot prop is passed — so /terms and /privacy (no slot) render
 *    identically to each other structurally, matching the Cookie Notice
 *    (with slot) everywhere except the slot's own content.
 *  - Bullets render only when supplied (simple `paragraphs`/`bullets` path).
 *  - The `blocks` path (T-8): a nested bullet's children render as an
 *    indented sub-list; a labelled sub-block renders its own heading text
 *    with prose under it, distinguishable from a full section; a contact
 *    block renders as a `<dl>` with one `<dt>`/`<dd>` pair per entry,
 *    including an entry whose value is the empty string (Legal's source
 *    left it blank — reproduced, not invented); and a paragraph block's
 *    order relative to a bullets block after it is preserved exactly as
 *    given (the fidelity problem `blocks` exists to solve — see types.ts's
 *    module doc). `LegalSection`'s `paragraphs`/`bullets` and `blocks`
 *    paths are mutually exclusive at the TYPE level (a discriminated
 *    union, T-8 rework) — a section literal that sets both is a compile
 *    error (`tsc`/`next build`), not a runtime "precedence" this file
 *    tests; that replaced an earlier runtime-only test of the same idea.
 *  - `lede: string[]` renders one `<p>` per entry, not merged into one
 *    paragraph (T-8 rework — see types.ts's module doc for why the field
 *    was widened).
 *  - DEMONSTRATED FALSIFIER (mandatory): a section whose heading is omitted
 *    (empty string) must NOT be reachable via its intended accessible name —
 *    the aria-labelledby assertion below is required to redden against that
 *    input. Run, observe red, then the mutation is reverted (the assertion
 *    stays; only the malformed fixture is temporary). A second DEMONSTRATED
 *    FALSIFIER (nested bullets, "the blocks path" describe block) proves a
 *    child does not leak across sibling bullets — replacing an earlier
 *    same-named test that could not fail (Reviewer FAIL, T-8 rework).
 *
 * NOT covered by anything in this file (NFR-2, NFR-5): jsdom has no layout
 * engine and does not evaluate contrast or rendered legibility. A passing
 * suite here says nothing about whether the tokens used actually read as
 * legible text at any real viewport — that is the human check routed to
 * T-10's HITL pause.
 */

import { render, screen, within } from '@testing-library/react';
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

  it('renders a string[] lede as one <p> per entry, in order, not merged into one paragraph', () => {
    // T-8 rework: `lede` widened to `string | string[]` because Legal's
    // approved Terms/Privacy texts each open with several separate source
    // paragraphs, and an earlier revision merged them into one string —
    // a structural merge the Reviewer caught (types.ts's module doc).
    const multiLedeDoc: LegalDocument = {
      ...twoSectionDocument,
      lede: ['First lede paragraph.', 'Second lede paragraph.', 'Third lede paragraph.'],
    };
    render(<LegalDocumentView document={multiLedeDoc} />);

    const first = screen.getByText('First lede paragraph.');
    const second = screen.getByText('Second lede paragraph.');
    const third = screen.getByText('Third lede paragraph.');

    // Each entry is its own element (not one shared textContent) — proves
    // the entries were NOT collapsed into a single paragraph string.
    expect(first.tagName).toBe('P');
    expect(second.tagName).toBe('P');
    expect(third.tagName).toBe('P');
    expect(first).not.toBe(second);
    expect(second).not.toBe(third);
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
  // The `blocks` path (T-8) — nested bullets, sub-blocks, contact blocks
  // ---------------------------------------------------------------------

  describe('the blocks path', () => {
    it('renders a nested bullet’s children as an indented sub-list under it', () => {
      const doc = {
        ...twoSectionDocument,
        sections: [
          {
            heading: 'Removal',
            blocks: [
              {
                kind: 'bullets' as const,
                items: [
                  'Correct administrative errors',
                  {
                    text: 'Remove profiles or information that:',
                    children: [
                      'Appears inaccurate',
                      'Violates these Terms',
                      'Is no longer relevant to the purposes of the Registry',
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      render(<LegalDocumentView document={doc} />);

      const parentItem = screen.getByText('Remove profiles or information that:').closest('li')!;
      expect(parentItem).toBeInTheDocument();
      expect(within(parentItem).getByText('Appears inaccurate')).toBeInTheDocument();
      expect(within(parentItem).getByText('Violates these Terms')).toBeInTheDocument();
      expect(
        within(parentItem).getByText('Is no longer relevant to the purposes of the Registry'),
      ).toBeInTheDocument();

      // The sibling top-level bullet must NOT gain the nested children.
      const siblingItem = screen.getByText('Correct administrative errors').closest('li')!;
      expect(within(siblingItem).queryByText('Appears inaccurate')).not.toBeInTheDocument();
    });

    it('renders a labelled sub-block as a sub-heading with its own prose, inside the parent section', () => {
      const doc = {
        ...twoSectionDocument,
        sections: [
          {
            heading: 'How We Collect Information',
            blocks: [
              { kind: 'paragraph' as const, text: 'Information may be collected through:' },
              {
                kind: 'subBlocks' as const,
                blocks: [
                  {
                    heading: 'Self-registration',
                    paragraphs: ['Actors may submit their own information directly.'],
                  },
                  {
                    heading: 'Platform operation',
                    paragraphs: ['Certain technical information is collected automatically.'],
                  },
                ],
              },
            ],
          },
        ],
      };
      render(<LegalDocumentView document={doc} />);

      const parentRegion = screen.getByRole('region', { name: 'How We Collect Information' });
      const subHeading = within(parentRegion).getByText('Self-registration');
      expect(subHeading.tagName).toBe('H3');
      expect(
        within(parentRegion).getByText('Actors may submit their own information directly.'),
      ).toBeInTheDocument();
      expect(within(parentRegion).getByText('Platform operation').tagName).toBe('H3');

      // A sub-block heading is not a document-level section — it is not
      // itself reachable as a named `region`.
      expect(
        screen.queryByRole('region', { name: 'Self-registration' }),
      ).not.toBeInTheDocument();
    });

    it('renders a contact block as a description list, one dt/dd pair per entry, empty values reproduced as-is', () => {
      const doc = {
        ...twoSectionDocument,
        sections: [
          {
            heading: 'Contact Us',
            blocks: [
              { kind: 'paragraph' as const, text: 'Please contact:' },
              {
                kind: 'contact' as const,
                entries: [
                  { label: 'Contact', value: '' },
                  { label: 'Email', value: 'info@example.org' },
                  { label: 'Address', value: '' },
                  { label: 'Telephone', value: '' },
                ],
              },
            ],
          },
        ],
      };
      const { container } = render(<LegalDocumentView document={doc} />);

      const dl = container.querySelector('dl')!;
      expect(dl).toBeInTheDocument();
      const dts = Array.from(dl.querySelectorAll('dt')).map((el) => el.textContent);
      expect(dts).toEqual(['Contact:', 'Email:', 'Address:', 'Telephone:']);
      const dds = Array.from(dl.querySelectorAll('dd')).map((el) => el.textContent);
      // The empty-value entries are reproduced as empty `<dd>`s, not
      // invented and not dropped — the label still appears above.
      expect(dds).toEqual(['', 'info@example.org', '', '']);
    });

    it('renders blocks in exactly the given order — a paragraph after a bullet list is not hoisted ahead of it', () => {
      const doc = {
        ...twoSectionDocument,
        sections: [
          {
            heading: 'Information We Collect',
            blocks: [
              { kind: 'paragraph' as const, text: 'The Registry may collect:' },
              { kind: 'bullets' as const, items: ['Organization name', 'Email address'] },
              {
                kind: 'paragraph' as const,
                text: 'Not all information is necessarily personal data.',
              },
            ],
          },
        ],
      };
      render(<LegalDocumentView document={doc} />);

      const region = screen.getByRole('region', { name: 'Information We Collect' });
      const text = region.textContent!;
      const introIndex = text.indexOf('The Registry may collect:');
      const bulletIndex = text.indexOf('Organization name');
      const trailingIndex = text.indexOf('Not all information is necessarily personal data.');
      expect(introIndex).toBeGreaterThanOrEqual(0);
      expect(bulletIndex).toBeGreaterThan(introIndex);
      expect(trailingIndex).toBeGreaterThan(bulletIndex);
    });

    it('renders a paragraph block’s trailing link distinctly from the paragraph’s own text', () => {
      const doc = {
        ...twoSectionDocument,
        sections: [
          {
            heading: 'Cookies',
            blocks: [
              {
                kind: 'paragraph' as const,
                text: 'See the cookie notice for details.',
                link: { href: '/cookies', label: 'Cookie Notice' },
              },
            ],
          },
        ],
      };
      render(<LegalDocumentView document={doc} />);

      expect(screen.getByText(/see the cookie notice for details\./i)).toBeInTheDocument();
      const link = screen.getByRole('link', { name: 'Cookie Notice' });
      expect(link).toHaveAttribute('href', '/cookies');
    });

    // The former "ignores paragraphs/bullets on a section that also sets a
    // non-empty blocks array (precedence)" runtime test lived here. Setting
    // both `paragraphs` and `blocks` on a `LegalSection` is no longer a
    // reachable runtime state to test a rendering "precedence" for — it is
    // a REJECTED TYPE, enforced by the discriminated union in types.ts
    // (Reviewer FAIL issue B, T-8 rework). A section either has
    // `paragraphs`/`bullets` (with `blocks?: never`) or has `blocks` (with
    // `paragraphs?: never`, `bullets?: never`); `tsc`/`next build` now
    // reject a literal that sets both, which is the intended replacement
    // for the deleted runtime assertion — demonstrated in the
    // Implementer's report (mandatory falsifier (2)).

    it('FALSIFIER (nested bullets): a child present under one bullet does not leak into a sibling bullet that omits it', () => {
      // The previous version of this test built a fixture that never
      // contained the string it then asserted absent — it passed against a
      // correct renderer, a broken renderer, and an empty component alike,
      // so it could not fail and had no business being labelled FALSIFIER
      // (Reviewer FAIL, T-8 rework). This version puts the string in the
      // fixture, under a DIFFERENT sibling bullet, and asserts it is
      // present there and absent under this one — genuinely falsifiable:
      // a renderer bug that shares/reuses one item's `children` across
      // bullets (e.g. a stale-closure or missing per-item scoping defect)
      // would make this red. Demonstrated reddening is recorded in the
      // Implementer's report.
      const doc = {
        ...twoSectionDocument,
        sections: [
          {
            heading: 'Removal',
            blocks: [
              {
                kind: 'bullets' as const,
                items: [
                  {
                    text: 'Remove profiles or information that:',
                    children: [
                      'Appears inaccurate',
                      'Violates these Terms',
                      'Is no longer relevant to the purposes of the Registry',
                    ],
                  },
                  {
                    text: 'Suspend profiles or information that:',
                    children: ['Appears inaccurate', 'Violates these Terms'],
                    // Deliberately omitted here — this sibling's own
                    // nested list must not contain it.
                  },
                ],
              },
            ],
          },
        ],
      };
      render(<LegalDocumentView document={doc} />);

      const removeItem = screen.getByText('Remove profiles or information that:').closest('li')!;
      const suspendItem = screen.getByText('Suspend profiles or information that:').closest('li')!;

      expect(
        within(removeItem).getByText('Is no longer relevant to the purposes of the Registry'),
      ).toBeInTheDocument();
      expect(
        within(suspendItem).queryByText('Is no longer relevant to the purposes of the Registry'),
      ).not.toBeInTheDocument();
    });
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
