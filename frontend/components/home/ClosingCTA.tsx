// ClosingCTA — copy brief §2.7: dark closing call-to-action strip.
// Server component (no hooks, no 'use client').
//
// Surface: bg-fg text-bg (inverted / dark), py-16, standard container, centered.
// Structure: h2 → body paragraph → two CTAs side-by-side (flex-wrap).
//
// CTA notes:
//   Primary button  → Button variant="primary"  (maroon reads fine on dark bg).
//   Secondary-on-dark → raw next/link styled to match Button geometry using only
//     tokens (bg/border tokens on a dark canvas; Button's secondary uses bg-surface
//     which is a light token, inappropriate here).
//
// A11y: <section aria-labelledby="closing-cta-heading"> with a single <h2>.
// Tokens only — no hardcoded colors (NFR-4).
//
// Usage:
//   import ClosingCTA from '@/components/home/ClosingCTA';
//   <ClosingCTA />

import Link from 'next/link';
import Button from '@/components/ui/Button';

// ---------------------------------------------------------------------------
// ClosingCTA
// ---------------------------------------------------------------------------

export default function ClosingCTA() {
  return (
    <section
      className="bg-fg text-bg py-16"
      aria-labelledby="closing-cta-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">

        {/* Section heading — exactly one h2, no h1 */}
        <h2
          id="closing-cta-heading"
          className="text-2xl font-bold leading-tight mb-4"
        >
          Find the right seed-system actors, faster.
        </h2>

        {/* Body paragraph — bg token (white) at reduced opacity on the dark surface */}
        <p className="text-bg opacity-80 max-w-prose mx-auto mb-8">
          Explore 1,000+ verified actors across sorghum, common bean, and
          groundnut value chains &mdash; or learn how the ACCELERATE model
          works.
        </p>

        {/* CTA pair — flex, gap, wrap, centered */}
        <div className="flex flex-wrap items-center justify-center gap-4">

          {/* Primary CTA — maroon bg reads fine on the dark canvas */}
          <Button variant="primary" href="/map">
            Explore the Map
          </Button>

          {/*
            Secondary-on-dark — hand-crafted link matching Button geometry.
            Uses only tokens: text-bg (white), border-bg/40, hover:bg-bg/10,
            focus ring offset against the dark canvas (ring-offset-fg).
            Button's secondary variant (bg-surface / light) is inappropriate here.
          */}
          <Link
            href="/about"
            className={[
              'inline-flex items-center gap-2 px-5 py-2.5',
              'text-sm font-medium leading-none',
              'rounded-md',
              'border border-bg/40 text-bg',
              'transition-colors motion-reduce:transition-none',
              'hover:bg-bg/10',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bg',
              'focus-visible:ring-offset-2 focus-visible:ring-offset-fg',
              'whitespace-nowrap',
            ].join(' ')}
          >
            About the project
          </Link>

        </div>

      </div>
    </section>
  );
}
