/**
 * Unit tests for Footer — T-10 (contact-channels spec), extended at
 * legal/legal-notices-and-consent-copy T-6 (FR-6) to five destinations.
 *
 * Filter: `header profile` in this task's Verify line does not catch this
 * file (it matches neither substring); it is exercised by the broader
 * `npm test -- --silent` full run and by `npm run build`'s static-export
 * assertion for the routes it links to.
 *
 * Covers (FR-6): Footer links About, Contact, Cookie Notice, Privacy
 * Policy and Terms of Use — five separate assertions, one per destination,
 * so losing any single link reddens exactly its own test and leaves the
 * other four green (T-6 falsifier 2). Each asserts only the `href` string
 * — it proves the link's target text, not that the destination exists;
 * `npm run build` under `output: 'export'` is the half that proves
 * emission (KZ-002). Not asserting layout/visual density (that is DC-9's
 * manual gate, out of jsdom's reach).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import Footer from './Footer';

describe('Footer — links (FR-6, T-6)', () => {
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

  it('links "Cookie Notice" to /cookies', () => {
    render(<Footer />);

    const link = screen.getByRole('link', { name: /^cookie notice$/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/cookies');
  });

  it('links "Privacy Policy" to /privacy', () => {
    render(<Footer />);

    const link = screen.getByRole('link', { name: /^privacy policy$/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/privacy');
  });

  it('links "Terms of Use" to /terms', () => {
    render(<Footer />);

    const link = screen.getByRole('link', { name: /^terms of use$/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/terms');
  });

  // FR-6 "AND IT MUST reuse the existing FOOTER_LINK_CLASSES treatment so
  // the row stays visually uniform" — previously unguarded: the five tests
  // above assert only `href`, never `className`. This pins the CLASS
  // STRING each link carries, not the rendered result — jsdom applies no
  // CSS, so this cannot prove the five links actually render identically,
  // only that they share the same className attribute value.
  // FALSIFIER (mandatory): give one of the five links a different
  // className and this is the one test that reddens — see the
  // Implementer's report for the failing output.
  it('all five links share the same FOOTER_LINK_CLASSES treatment', () => {
    render(<Footer />);

    const names = [
      /about this project/i,
      /^contact$/i,
      /^cookie notice$/i,
      /^privacy policy$/i,
      /^terms of use$/i,
    ];
    const classNames = names.map(
      (name) => screen.getByRole('link', { name }).className
    );

    expect(new Set(classNames).size).toBe(1);
  });
});
