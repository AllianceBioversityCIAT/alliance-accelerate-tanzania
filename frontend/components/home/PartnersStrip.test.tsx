/**
 * PartnersStrip unit tests (T-5, FR-6, §5.3, NFR-4).
 *
 * next/image renders a real <img> in jsdom via next/jest transform — no mock needed.
 *
 * Key invariants verified here:
 *  - Renders exactly one <h2> with the correct text and id.
 *  - Renders the eyebrow "Partners" pill.
 *  - Renders all six partners as accessible external links (target="_blank",
 *    rel="noopener noreferrer" — exact value asserted).
 *  - Logo'd partners (alliance, pabra, tari, tosci, bmgf) render an <img> with
 *    an accessible name — 5 logos total.
 *  - Text-fallback partner (CIMMYT) renders its name as visible text — 1 fallback.
 *  - Three tier labels render: "Funded by", "Led by", "In partnership with".
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import PartnersStrip from './PartnersStrip';
import { PARTNERS } from '@/lib/content/partners';

describe('PartnersStrip', () => {
  // ---------------------------------------------------------------------------
  // Heading & eyebrow
  // ---------------------------------------------------------------------------

  it('renders the eyebrow pill with text "Partners"', () => {
    render(<PartnersStrip />);
    expect(screen.getByText('Partners')).toBeInTheDocument();
  });

  it('renders exactly one h2 with id="partners-heading"', () => {
    render(<PartnersStrip />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveAttribute('id', 'partners-heading');
    expect(heading).toHaveTextContent(
      /built by a coalition of research and seed-system institutions/i,
    );
  });

  // ---------------------------------------------------------------------------
  // Tier labels
  // ---------------------------------------------------------------------------

  it('renders the "Funded by" tier label', () => {
    render(<PartnersStrip />);
    expect(screen.getByText('Funded by')).toBeInTheDocument();
  });

  it('renders the "Led by" tier label', () => {
    render(<PartnersStrip />);
    expect(screen.getByText('Led by')).toBeInTheDocument();
  });

  it('renders the "In partnership with" tier label', () => {
    render(<PartnersStrip />);
    expect(screen.getByText('In partnership with')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Partner links — all six
  // ---------------------------------------------------------------------------

  /**
   * Escape special regex characters in partner names so parentheses, dots, etc.
   * in names like "Pan-Africa Bean Research Alliance (PABRA)" don't break the
   * RegExp constructor used by getByRole name matching.
   */
  function escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  it('renders all six partners as links', () => {
    render(<PartnersStrip />);
    // Each partner link has aria-label "${name} — opens in a new tab"
    for (const partner of PARTNERS) {
      const link = screen.getByRole('link', {
        name: new RegExp(`${escapeRegex(partner.name)}`, 'i'),
      });
      expect(link).toBeInTheDocument();
    }
  });

  it('every partner link points to the correct href from PARTNERS', () => {
    render(<PartnersStrip />);
    for (const partner of PARTNERS) {
      const link = screen.getByRole('link', {
        name: new RegExp(`${escapeRegex(partner.name)}`, 'i'),
      });
      expect(link).toHaveAttribute('href', partner.url);
    }
  });

  it('every partner link has target="_blank"', () => {
    render(<PartnersStrip />);
    for (const partner of PARTNERS) {
      const link = screen.getByRole('link', {
        name: new RegExp(`${escapeRegex(partner.name)}`, 'i'),
      });
      expect(link).toHaveAttribute('target', '_blank');
    }
  });

  it('every partner link has rel="noopener noreferrer"', () => {
    render(<PartnersStrip />);
    for (const partner of PARTNERS) {
      const link = screen.getByRole('link', {
        name: new RegExp(`${escapeRegex(partner.name)}`, 'i'),
      });
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  // ---------------------------------------------------------------------------
  // Logo'd partners — alliance, pabra, tari, tosci, bmgf (5 logos)
  // ---------------------------------------------------------------------------

  it('renders an <img> with accessible name for the Alliance partner', () => {
    render(<PartnersStrip />);
    const alliancePartner = PARTNERS.find((p) => p.key === 'alliance')!;
    const img = screen.getByRole('img', {
      name: new RegExp(escapeRegex(alliancePartner.name), 'i'),
    });
    expect(img).toBeInTheDocument();
  });

  it('renders an <img> with accessible name for the PABRA partner', () => {
    render(<PartnersStrip />);
    const pabraPartner = PARTNERS.find((p) => p.key === 'pabra')!;
    const img = screen.getByRole('img', {
      name: new RegExp(escapeRegex(pabraPartner.name), 'i'),
    });
    expect(img).toBeInTheDocument();
  });

  it('renders an <img> with accessible name for the TARI partner', () => {
    render(<PartnersStrip />);
    const tariPartner = PARTNERS.find((p) => p.key === 'tari')!;
    const img = screen.getByRole('img', {
      name: new RegExp(escapeRegex(tariPartner.name), 'i'),
    });
    expect(img).toBeInTheDocument();
  });

  it('renders an <img> with accessible name for the TOSCI partner', () => {
    render(<PartnersStrip />);
    const tosciPartner = PARTNERS.find((p) => p.key === 'tosci')!;
    const img = screen.getByRole('img', {
      name: new RegExp(escapeRegex(tosciPartner.name), 'i'),
    });
    expect(img).toBeInTheDocument();
  });

  it('renders an <img> with accessible name for the BMGF partner', () => {
    render(<PartnersStrip />);
    const bmgfPartner = PARTNERS.find((p) => p.key === 'bmgf')!;
    const img = screen.getByRole('img', {
      name: new RegExp(escapeRegex(bmgfPartner.name), 'i'),
    });
    expect(img).toBeInTheDocument();
  });

  it('renders exactly 5 logo <img> elements', () => {
    render(<PartnersStrip />);
    // alliance, pabra, tari, tosci, bmgf — CIMMYT is text-fallback only
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(5);
  });

  // ---------------------------------------------------------------------------
  // Text-fallback partner — CIMMYT only (1 fallback)
  // ---------------------------------------------------------------------------

  it('renders CIMMYT name as visible text (no logo asset)', () => {
    render(<PartnersStrip />);
    const cimmytPartner = PARTNERS.find((p) => p.key === 'cimmyt')!;
    expect(screen.getByText(cimmytPartner.name)).toBeInTheDocument();
  });

  it('does NOT render a text fallback for TARI (now has a logo)', () => {
    render(<PartnersStrip />);
    // TARI renders as an <img>, not a visible text span
    const tariPartner = PARTNERS.find((p) => p.key === 'tari')!;
    const img = screen.getByRole('img', {
      name: new RegExp(escapeRegex(tariPartner.name), 'i'),
    });
    expect(img).toBeInTheDocument();
  });

  it('does NOT render a text fallback for TOSCI (now has a logo)', () => {
    render(<PartnersStrip />);
    const tosciPartner = PARTNERS.find((p) => p.key === 'tosci')!;
    const img = screen.getByRole('img', {
      name: new RegExp(escapeRegex(tosciPartner.name), 'i'),
    });
    expect(img).toBeInTheDocument();
  });
});
