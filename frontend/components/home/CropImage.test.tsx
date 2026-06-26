/**
 * Unit tests for CropImage — image-led crop panel (home + about).
 *
 * Covers:
 *   (a) renders an <img> with the correct src for each crop
 *   (b) image has alt="" (decorative — adjacent h3 labels it)
 *   (c) panel uses the per-crop soft tint (bg-crop-*-soft token)
 *   (d) renders without errors for all three crops
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import CropImage from './CropImage';
import { CROPS } from '@/lib/content/crops';

describe('CropImage', () => {
  // ── (a) Correct src for each crop ─────────────────────────────────────────

  it.each(CROPS)(
    'renders an img with the correct src for $name',
    (crop) => {
      const { container } = render(<CropImage crop={crop} />);

      // next/image renders as <img> in jsdom (next/jest transform).
      // Images with alt="" have ARIA role "presentation" — use querySelector.
      const img = container.querySelector('img');
      expect(img).toBeInTheDocument();
      // next/image encodes the src as a query param; check the filename stem.
      expect(img!.getAttribute('src')).toContain(
        crop.image.replace('/crops/', '').replace('.webp', '')
      );
    }
  );

  // ── (b) Image is decorative (alt="") ─────────────────────────────────────

  it.each(CROPS)(
    'image for $name has alt="" (decorative)',
    (crop) => {
      const { container } = render(<CropImage crop={crop} />);

      const img = container.querySelector('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('alt', '');
    }
  );

  // ── (c) Panel carries the per-crop soft tint class ────────────────────────

  it.each(CROPS)(
    'panel for $name carries its bg-crop-*-soft tint class',
    (crop) => {
      const { container } = render(<CropImage crop={crop} />);

      // The outer div is the panel; tint = bg-{tokenClass}-soft (e.g. bg-crop-sorghum-soft).
      const panel = container.firstChild as HTMLElement;
      expect(panel.className).toContain(`bg-${crop.tokenClass}-soft`);
    }
  );

  // ── (d) Renders without throwing for all three crops ─────────────────────

  it('renders without errors for all three crops', () => {
    for (const crop of CROPS) {
      expect(() => render(<CropImage crop={crop} />)).not.toThrow();
    }
  });
});
