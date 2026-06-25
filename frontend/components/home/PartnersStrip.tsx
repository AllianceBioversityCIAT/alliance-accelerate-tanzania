// PartnersStrip — FR-6, §5.3 section: logo wall for the six-partner coalition.
// Server component — no hooks, no 'use client'.
//
// Maps over PARTNERS (lib/content/partners.ts) to render a responsive, centered
// wrapping row of partner logos and text-label fallbacks.
//
// Section uses bg-surface py-16, aria-labelledby="partners-heading" (a11y).
// Eyebrow pill pattern matches CropCoverage and Hero sections.
// Max-width container: mx-auto max-w-7xl px-4 sm:px-6 lg:px-8.
//
// Logo treatment (NFR-4, FR-5):
//   - Logo'd partners: next/image, grayscale + opacity-80 at rest,
//     transitions to full color on hover/focus-visible. CSS-only, no JS.
//     motion-reduce:transition-none respects prefers-reduced-motion.
//   - Text-fallback partners (no logo asset): styled <span> inside the same
//     accessible link wrapper.
//
// Focus ring: focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
// External links: target="_blank" rel="noopener noreferrer" aria-label with " — opens in a new tab".
// Exactly one <h2> in this component.

import Image from 'next/image';
import { PARTNERS, type Partner } from '@/lib/content/partners';

// ---------------------------------------------------------------------------
// PartnerLogo — internal sub-component
// ---------------------------------------------------------------------------

/**
 * Renders a single partner as an accessible external link.
 * Logo'd partners use next/image with grayscale-to-color hover treatment.
 * Partners without a logo asset fall back to a styled text label.
 */
function PartnerLogo({ p }: { p: Partner }) {
  return (
    <a
      href={p.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${p.name} — opens in a new tab`}
      className="group inline-flex items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      {p.logo ? (
        <Image
          src={p.logo}
          alt={p.name}
          width={160}
          height={48}
          className="h-10 w-auto grayscale opacity-80 transition hover:grayscale-0 hover:opacity-100 group-focus-visible:grayscale-0 motion-reduce:transition-none"
        />
      ) : (
        <span className="text-sm font-semibold text-muted">{p.name}</span>
      )}
    </a>
  );
}

// ---------------------------------------------------------------------------
// PartnersStrip
// ---------------------------------------------------------------------------

export default function PartnersStrip() {
  return (
    <section
      className="bg-surface py-16"
      aria-labelledby="partners-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Section header */}
        <div className="flex flex-col items-center text-center mb-10">
          {/* Eyebrow pill */}
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold tracking-wide mb-3">
            Partners
          </span>

          <h2
            id="partners-heading"
            className="text-2xl font-bold text-fg leading-tight"
          >
            Built by a coalition of research and seed-system institutions
          </h2>

          <p className="text-sm text-muted mt-3 max-w-prose mx-auto text-center">
            ACCELERATE is delivered by the Alliance of Bioversity International &amp; CIAT / PABRA
            with the Tanzania Agricultural Research Institute (TARI), the Tanzania Official Seed
            Certification Institute (TOSCI), and CIMMYT &mdash; funded by the Bill &amp; Melinda
            Gates Foundation.
          </p>
        </div>

        {/* Logo wall — responsive centered wrapping row (FR-6, §5.3) */}
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
          {PARTNERS.map((partner) => (
            <PartnerLogo key={partner.key} p={partner} />
          ))}
        </div>

      </div>
    </section>
  );
}
