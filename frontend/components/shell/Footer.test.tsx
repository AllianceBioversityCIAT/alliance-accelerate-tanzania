/**
 * Unit tests for Footer — T-10 (contact-channels spec).
 *
 * Filter: `header profile` in this task's Verify line does not catch this
 * file (it matches neither substring); it is exercised by the broader
 * `npm test -- --silent` full run and by `npm run build`'s static-export
 * assertion for the routes it links to.
 *
 * Covers (FR-1, DC-11): Footer links /contact and /privacy, alongside the
 * pre-existing /about link, all from a single footer nav — not asserting
 * layout/visual density (that is DC-9's manual gate, out of jsdom's reach).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import Footer from './Footer';

describe('Footer — links (T-10, FR-1, DC-11)', () => {
  it('links "About this project" to /about (pre-existing)', () => {
    render(<Footer />);

    const link = screen.getByRole('link', { name: /about this project/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/about');
  });

  it('links "Contact" to /contact', () => {
    render(<Footer />);

    const link = screen.getByRole('link', { name: /^contact$/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/contact');
  });

  it('links "Privacy notice" to /privacy', () => {
    render(<Footer />);

    const link = screen.getByRole('link', { name: /privacy notice/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/privacy');
  });
});
