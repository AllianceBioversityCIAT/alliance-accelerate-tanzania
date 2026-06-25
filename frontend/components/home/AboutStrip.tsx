// AboutStrip — copy brief §2.3: project background + origin story strip.
// Server component (no hooks, no 'use client').
//
// Surface: bg-surface-alt, py-16, standard container.
// Structure: eyebrow pill → h2 → body paragraph (with <em> clause) →
//            supporting paragraph (with <strong> "3%" phrase) → secondary CTA.
//
// A11y: <section aria-labelledby="about-strip-heading"> with a single <h2>.
// Tokens only — no hardcoded colors (NFR-4).
//
// Usage:
//   import AboutStrip from '@/components/home/AboutStrip';
//   <AboutStrip />

import Button from '@/components/ui/Button';

// ---------------------------------------------------------------------------
// AboutStrip
// ---------------------------------------------------------------------------

export default function AboutStrip() {
  return (
    <section
      className="bg-surface-alt py-16"
      aria-labelledby="about-strip-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Eyebrow pill */}
        <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold tracking-wide mb-4">
          About the project
        </span>

        {/* Section heading — exactly one h2, no h1 */}
        <h2
          id="about-strip-heading"
          className="text-2xl font-bold text-fg leading-tight mb-6"
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
    </section>
  );
}
