'use client';

// AboutStrip — copy brief §2.3: project background + origin story strip.
//
// Converted to two-column layout (text LEFT, video media panel RIGHT).
// Requires 'use client' for the matchMedia reduced-motion gate.
//
// Surface: bg-surface-alt, py-16, standard container.
// Structure (lg+): LEFT = eyebrow pill → h2 → body paragraph → supporting
//   paragraph → secondary CTA; RIGHT = grain-shop video media panel.
// Structure (mobile): single column, text first, panel below (DOM order).
//
// Video gate: identical pattern to ClosingCTA — `playable` defaults false
//   (SSR-safe / no-JS / reduced-motion / tests), set true only when
//   matchMedia('(prefers-reduced-motion: no-preference)').matches.
//
// A11y: <section aria-labelledby="about-strip-heading"> with a single <h2>.
//   Video + poster are aria-hidden (decorative); copy carries meaning.
// Tokens only — no hardcoded colors (NFR-4).
//
// Usage:
//   import AboutStrip from '@/components/home/AboutStrip';
//   <AboutStrip />

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Button from '@/components/ui/Button';

// ---------------------------------------------------------------------------
// AboutStrip
// ---------------------------------------------------------------------------

export default function AboutStrip() {
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
      className="bg-surface-alt py-16"
      aria-labelledby="about-strip-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Two-column grid: single col on mobile, side-by-side on lg+ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">

          {/* ── LEFT column — existing content unchanged ── */}
          <div>

            {/* Eyebrow pill */}
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold tracking-wide mb-4">
              About the project
            </span>

            {/* Section heading — exactly one h2, no h1 */}
            <h2
              id="about-strip-heading"
              className="text-2xl lg:text-3xl font-bold text-fg leading-tight mb-6"
            >
              Accelerating variety turnover for Tanzania&rsquo;s farmers
            </h2>

            {/* Body paragraph — em wraps the initiative sub-title clause */}
            <p className="text-fg/80 max-w-prose mb-4">
              ACCELERATE &mdash;{' '}
              <em>
                Accelerated Variety Turnover for Open-Pollinated Crops in Tanzania
              </em>{' '}
              &mdash; is a four-year initiative (2023&ndash;2026) led by the
              Alliance of Bioversity International &amp; CIAT and the Pan-Africa
              Bean Research Alliance (PABRA), funded by the Bill &amp; Melinda
              Gates Foundation. It builds a scalable, demand-led model that helps
              new, higher-yielding seed varieties reach the farmers who need
              them &mdash; faster.
            </p>

            {/* Supporting paragraph — bold the "3% of farmers' planting needs" phrase */}
            <p className="text-muted max-w-prose mb-8">
              Today only about{' '}
              <strong>3% of farmers&rsquo; planting needs</strong> are met by the
              formal seed sector. Most farmers still plant old, low-yielding
              varieties that are vulnerable to climate stress. ACCELERATE closes
              that gap by connecting seed producers with the traders, processors,
              and institutions that actually drive demand.
            </p>

            {/* CTA */}
            <Button variant="secondary" href="/about">
              Read the full story
            </Button>

          </div>

          {/* ── RIGHT column — grain-shop video media panel ── */}
          <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border shadow-md">

            {/* Poster base layer (always rendered — no-JS / reduced-motion fallback) */}
            <Image
              src="/about-grain-shop-poster.jpg"
              alt=""
              fill
              className="object-cover"
              aria-hidden={true}
            />

            {/* Conditional video — only when prefers-reduced-motion: no-preference */}
            {playable && (
              <video
                className="absolute inset-0 h-full w-full object-cover"
                autoPlay
                muted
                loop
                playsInline
                preload="none"
                aria-hidden="true"
                poster="/about-grain-shop-poster.jpg"
              >
                <source src="/about-grain-shop.mp4" type="video/mp4" />
              </video>
            )}

          </div>

        </div>
      </div>
    </section>
  );
}
