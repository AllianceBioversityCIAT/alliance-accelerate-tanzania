// Hero — Two-column landing hero section (T-4, FR-2, NFR-2).
// Server component: no 'use client' needed — no interactivity or browser APIs here.
//
// Layout:
//   lg+  : two columns side-by-side (text left, visual panel right)
//   <lg  : single column stacked (text on top, visual panel below)
//
// The "1,000+" figure is a STATIC placeholder matching the approved mockup.
// TODO (T-5/T-6): optionally bind this to `actorsMapped` from the live metrics
// hook (useMetrics) once the MetricsBand and metrics API client are wired up.

import Button from '@/components/ui/Button';

// ---------------------------------------------------------------------------
// Decorative right-arrow icon — aria-hidden (a11y: purely decorative glyph)
// ---------------------------------------------------------------------------
function ArrowRight() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// LiveRegistryCard — pinned overlay on the visual panel
// ---------------------------------------------------------------------------
function LiveRegistryCard() {
  return (
    <div
      // bg-surface with shadow-md and rounded-md — token-only (NFR-4)
      className="absolute bottom-5 left-5 bg-surface shadow-md rounded-md px-4 py-3 min-w-[180px]"
      role="region"
      aria-label="Live registry summary"
    >
      {/* Label pill */}
      <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-1">
        Live Registry
      </p>
      {/* Static placeholder — see TODO above re: T-5/T-6 binding */}
      <p className="text-3xl font-bold text-fg leading-none">1,000+</p>
      <p className="text-xs text-muted mt-1 leading-snug">
        verified seed-system actors and growing
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VisualPanel — right-column image placeholder
// ---------------------------------------------------------------------------
function VisualPanel() {
  return (
    // relative so the LiveRegistryCard can use absolute positioning inside it.
    // bg-restricted is the subtle warm off-white token (#F1F0EA) — no raw hex.
    // The diagonal stripe pattern is achieved purely with CSS using token colors.
    <div className="relative w-full h-72 lg:h-full min-h-[320px]">
      <div
        className="absolute inset-0 rounded-lg bg-restricted border border-border overflow-hidden"
        // Decorative placeholder: aria-hidden because it carries no meaningful content.
        aria-hidden="true"
      >
        {/* Diagonal stripe overlay — CSS background only, token-based opacity */}
        <div
          className="absolute inset-0 opacity-40 text-border"
          style={{
            // SVG data-URI stripe: fill='currentColor' inherits CSS `color`,
            // which is set to var(--color-border) by the `text-border` utility.
            // This makes the stripe color fully token-driven — no hardcoded hex —
            // and will correctly track --color-border in future dark-mode themes.
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='currentColor' fill-opacity='1'%3E%3Cpath d='M0 0l20 20M-5 15l10 10M15-5l10 10'/%3E%3C/svg%3E\")",
            backgroundSize: '20px 20px',
          }}
        />
        {/* Placeholder label — centered in the panel, visible but muted */}
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-xs font-medium tracking-wider uppercase text-muted/60 select-none text-center px-4">
            Field / harvest photography
          </p>
        </div>
      </div>

      {/* Live Registry stat card — pinned to bottom-left of the panel */}
      <LiveRegistryCard />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------
export default function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="bg-bg"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* ----------------------------------------------------------------
              LEFT COLUMN — copy + CTAs
          ---------------------------------------------------------------- */}
          <div className="flex flex-col gap-6">

            {/* Eyebrow badge — pill with subtle primary tint */}
            <div>
              <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold tracking-wide">
                Institutional seed-system intelligence
              </span>
            </div>

            {/* Headline — h1 for page-level heading (a11y) */}
            <h1
              id="hero-heading"
              className="text-4xl font-bold text-fg leading-tight tracking-tight"
            >
              The connective tissue of Tanzania&rsquo;s seed system.
            </h1>

            {/* Supporting copy */}
            <p className="text-lg text-muted leading-relaxed max-w-prose">
              A single trusted registry mapping seed companies, cooperatives,
              offtakers, and partners across sorghum, common bean, and groundnut
              value chains &mdash; so institutions can find the right actors, fast.
            </p>

            {/* CTAs — flex row, wrap gracefully on narrow screens */}
            <div className="flex flex-wrap gap-3 mt-2">
              <Button variant="primary" href="/map">
                Explore the Map
                <ArrowRight />
              </Button>
              <Button variant="secondary" href="/directory">
                Browse Directory
              </Button>
            </div>

          </div>

          {/* ----------------------------------------------------------------
              RIGHT COLUMN — visual panel with stat overlay
          ---------------------------------------------------------------- */}
          <VisualPanel />

        </div>
      </div>
    </section>
  );
}
