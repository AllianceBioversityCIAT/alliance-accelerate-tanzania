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
 *  - Logo'd partners (alliance, pabra, bmgf) render an <img> with an accessible name.
 *  - Text-fallback partners (TARI, TOSCI, CIMMYT) render their name as visible text.
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
    // Each partner link has aria-label="${name} — opens in a new tab"
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
  // Logo'd partners — alliance, pabra, bmgf
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

  it('renders an <img> with accessible name for the BMGF partner', () => {
    render(<PartnersStrip />);
    const bmgfPartner = PARTNERS.find((p) => p.key === 'bmgf')!;
    const img = screen.getByRole('img', {
      name: new RegExp(escapeRegex(bmgfPartner.name), 'i'),
    });
    expect(img).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Text-fallback partners — TARI, TOSCI, CIMMYT
  // ---------------------------------------------------------------------------

  it('renders TARI name as visible text (no logo asset)', () => {
    render(<PartnersStrip />);
    const tariPartner = PARTNERS.find((p) => p.key === 'tari')!;
    expect(screen.getByText(tariPartner.name)).toBeInTheDocument();
  });

  it('renders TOSCI name as visible text (no logo asset)', () => {
    render(<PartnersStrip />);
    const tosciPartner = PARTNERS.find((p) => p.key === 'tosci')!;
    expect(screen.getByText(tosciPartner.name)).toBeInTheDocument();
  });

  it('renders CIMMYT name as visible text (no logo asset)', () => {
    render(<PartnersStrip />);
    const cimmytPartner = PARTNERS.find((p) => p.key === 'cimmyt')!;
    expect(screen.getByText(cimmytPartner.name)).toBeInTheDocument();
  });
});
