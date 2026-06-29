'use client';

// CropCoverage — FR-4 section: crop coverage cards with live per-crop actor counts.
// 'use client' is required: consumes the useMetrics hook (browser-side fetch).
//
// Maps the static CROPS content array to live CropMetric data by matching slug
// values.  Falls back to null when metrics are unavailable (FR-4 / DD-3).
//
// Responsive grid (NFR-2):
//   mobile (<md) : 1 column stacked
//   ≥md/lg       : 3 columns side-by-side
//
// Max-width container matches Hero: mx-auto max-w-7xl px-4 sm:px-6 lg:px-8.
// "View all actors" link: /directory route, secondary Button for a11y discernible name.
//
// Motion (FR-5, FR-7, FR-8): useReveal stagger-reveals the crop cards as the section
// enters the viewport. Uses gsap.from (progressive enhancement) so cards are visible
// without GSAP. Reduced-motion users see the static final state (matchMedia gate inside
// useReveal). The section header reveals via a separate useReveal with no stagger.

import Link from 'next/link';
import { useMetrics } from '@/lib/api/useMetrics';
import { CROPS } from '@/lib/content/crops';
import CropCard from '@/components/home/CropCard';
import Button from '@/components/ui/Button';
import { useReveal } from '@/lib/motion/useReveal';

// ---------------------------------------------------------------------------
// CropCoverage
// ---------------------------------------------------------------------------

export default function CropCoverage() {
  const { data, loading } = useMetrics();

  // Section header reveal — single element, no stagger (FR-5).
  const headerRef = useReveal<HTMLDivElement>({ stagger: 0 });

  // Card grid reveal — stagger across the three CropCard children (FR-5).
  // useReveal defaults targets to ':scope > *' which selects the direct CropCard
  // children of the grid div, producing the stagger effect.
  const gridRef = useReveal<HTMLDivElement>();

  return (
    <section
      className="bg-bg py-16"
      aria-labelledby="crop-coverage-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Section header — reveals once as the section enters the viewport (FR-5). */}
        <div
          ref={headerRef}
          className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10"
        >
          <div>
            {/* Eyebrow */}
            <span className="inline-flex items-center rounded-full bg-primary-soft text-primary px-3 py-1 text-xs font-semibold tracking-wide mb-3">
              Value chains
            </span>
            <h2
              id="crop-coverage-heading"
              className="text-2xl lg:text-3xl font-bold text-fg leading-tight"
            >
              Crop coverage
            </h2>
            <p className="text-sm text-muted mt-1 max-w-prose">
              Registry actors mapped across Tanzania&rsquo;s three priority seed-system value chains.
            </p>
          </div>

          {/* "View all actors" CTA — secondary Button; href gives discernible link name (a11y) */}
          <div className="shrink-0">
            <Button variant="secondary" href="/directory">
              View all actors
            </Button>
          </div>
        </div>

        {/*
          Responsive crop card grid (NFR-2):
            grid-cols-1       → single column on mobile
            md:grid-cols-3    → three columns on medium screens and up
          Motion: gridRef (useReveal) stagger-reveals the three CropCard children
          as the grid scrolls into view (FR-5). Progressive enhancement: cards are
          rendered visible at their natural state; GSAP only provides the entrance.
        */}
        <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {CROPS.map((crop) => {
            // Join static crop entry to live CropMetric by slug.
            // Falls back to null when data is null or the slug is absent.
            const metric = data?.crops.find((c) => c.slug === crop.slug);
            const mappedActors = metric?.mappedActors ?? null;

            return (
              <CropCard
                key={crop.slug}
                crop={crop}
                mappedActors={loading ? undefined : mappedActors}
                loading={loading}
              />
            );
          })}
        </div>

      </div>
    </section>
  );
}
