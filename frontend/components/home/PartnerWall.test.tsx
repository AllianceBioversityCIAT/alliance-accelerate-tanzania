/**
 * PartnerWall unit tests — headless shared logo-wall component.
 *
 * Verifies the core structural invariants of the extracted PartnerWall:
 *   - Renders all six partner links.
 *   - Renders the three tier labels.
 *   - Logo'd partners render <img>; CIMMYT renders text fallback.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import PartnerWall from './PartnerWall';
import { PARTNERS } from '@/lib/content/partners';

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('PartnerWall', () => {
  it('renders all six partner links', () => {
    render(<PartnerWall />);
    for (const partner of PARTNERS) {
      const link = screen.getByRole('link', {
        name: new RegExp(escapeRegex(partner.name), 'i'),
      });
      expect(link).toBeInTheDocument();
    }
  });

  it('renders exactly 5 logo <img> elements (CIMMYT is text fallback)', () => {
    render(<PartnerWall />);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(5);
  });

  it('renders CIMMYT as visible text (no logo asset)', () => {
    render(<PartnerWall />);
    const cimmyt = PARTNERS.find((p) => p.key === 'cimmyt')!;
    expect(screen.getByText(cimmyt.name)).toBeInTheDocument();
  });

  it('renders the "Funded by" tier label', () => {
    render(<PartnerWall />);
    expect(screen.getByText('Funded by')).toBeInTheDocument();
  });

  it('renders the "Led by" tier label', () => {
    render(<PartnerWall />);
    expect(screen.getByText('Led by')).toBeInTheDocument();
  });

  it('renders the "In partnership with" tier label', () => {
    render(<PartnerWall />);
    expect(screen.getByText('In partnership with')).toBeInTheDocument();
  });

  it('every partner link opens in a new tab with noopener noreferrer', () => {
    render(<PartnerWall />);
    for (const partner of PARTNERS) {
      const link = screen.getByRole('link', {
        name: new RegExp(escapeRegex(partner.name), 'i'),
      });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });
});
