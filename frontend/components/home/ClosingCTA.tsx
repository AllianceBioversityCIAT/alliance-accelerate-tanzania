'use client';

// ClosingCTA — copy brief §2.7: dark closing call-to-action strip.
// Upgraded (T-10, FR-13): ambient background video layered behind the existing content.
//
// Surface: bg-fg text-bg (inverted / dark), py-16, standard container, centered.
// Structure: poster base layer → video overlay (when playable) → token scrim → content.
//
// Z-order (back → front):
//   1. Poster image  — next/image fill, absolute inset-0, -z-10 (always rendered)
//   2. <video>       — absolute inset-0, -z-10 (conditional: no-preference + SSR=off)
//   3. Scrim         — absolute inset-0, bg-fg/70 (decorative, keeps text AA)
//   4. Content       — relative z-10 (heading + body + CTAs unchanged from T-3)
//
// Reduced-motion / autoplay gate (NFR-5):
//   `playable` is false by default (SSR-safe / no-JS / tests).
//   A useEffect sets it true only when matchMedia('(prefers-reduced-motion: no-preference)')
//   matches — same philosophy as useReveal / useCountUp.
//   The jest matchMedia polyfill (jest.setup.ts) returns matches:false for every query,
//   so `playable` stays false and no <video> is rendered in the test environment.
//
// A11y (NFR-4):
//   - Video + poster + scrim are all aria-hidden (decorative).
//   - Section keeps aria-labelledby="closing-cta-heading"; single <h2>.
//   - CTAs unchanged from T-3; AA contrast maintained through scrim + bg-fg base.
//
// CTA notes:
//   Primary button  → Button variant="primary"  (Royal Blue reads fine on dark bg).
//   Secondary-on-dark → raw next/link styled with tokens only (border-bg/40, text-bg).
//
// Usage:
//   import ClosingCTA from '@/components/home/ClosingCTA';
//   <ClosingCTA />

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Button from '@/components/ui/Button';

// ---------------------------------------------------------------------------
// ClosingCTA
// ---------------------------------------------------------------------------

export default function ClosingCTA() {
  // Default false: SSR / no-JS / reduced-motion / tests all show poster-only branch.
  const [playable, setPlayable] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: no-preference)');
    setPlayable(mq.matches);

    // Subscribe to preference changes (e.g. user toggles OS setting mid-session).
    const handleChange = (e: MediaQueryListEvent) => setPlayable(e.matches);
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  return (
    <section
      // Cinematic closing band: a generous min-height gives the 16:9 loop real
      // vertical room so object-cover shows the full field-staff scene (ACCELERATE
      // team at a grain shop) instead of a cropped slice. Content is centred over it.
      className="relative isolate flex items-center overflow-hidden bg-fg text-bg min-h-[30rem] py-20 lg:min-h-[36rem]"
      aria-labelledby="closing-cta-heading"
    >

      {/* ── Poster base layer (always rendered — no-JS / reduced-motion fallback) ── */}
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        <Image
          src="/closing-cta-poster.jpg"
          alt=""
          fill
          // object-position biased up toward the people's faces so the taller band
          // frames them well (matches the video below).
          className="object-cover object-[center_30%]"
          priority={false}
          aria-hidden={true}
        />
      </div>

      {/* ── Video overlay (conditional: only when prefers-reduced-motion: no-preference) ── */}
      {playable && (
        <video
          className="absolute inset-0 h-full w-full object-cover object-[center_30%] -z-10"
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          poster="/closing-cta-poster.jpg"
          aria-hidden="true"
        >
          {/* MP4/h264 only — universal support; smaller than the VP9 re-encode for this clip. */}
          <source src="/closing-cta-loop.mp4" type="video/mp4" />
        </video>
      )}

      {/* ── Token scrim (above poster/video, below content) ── */}
      <div className="absolute inset-0 bg-fg/70" aria-hidden="true" />

      {/* ── Content (relative z-10) — w-full so it fills the flex row and centres ── */}
      <div className="relative z-10 w-full mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">

        {/* Section heading — exactly one h2, no h1 */}
        <h2
          id="closing-cta-heading"
          className="text-2xl lg:text-3xl font-extrabold leading-tight mb-4"
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

          {/* Primary CTA — Royal Blue bg reads fine on the dark canvas */}
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
