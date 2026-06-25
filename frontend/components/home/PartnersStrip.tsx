// PartnersStrip — FR-6, §5.3 section: logo wall for the six-partner coalition.
// Server component — no hooks, no 'use client'.
//
// Provides the section wrapper, eyebrow pill, <h2>, and intro <p> for the home
// page partners section. The actual tier-grouped logo wall is delegated to the
// shared <PartnerWall /> component (components/home/PartnerWall.tsx) so the
// same visual treatment can be reused on /about without duplicating markup.
//
// Section uses bg-surface py-16, aria-labelledby="partners-heading" (a11y).
// Eyebrow pill pattern matches CropCoverage and Hero sections.
// Max-width container: mx-auto max-w-7xl px-4 sm:px-6 lg:px-8.
// Exactly one <h2> in this component.

import PartnerWall from '@/components/home/PartnerWall';

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

        {/* Tier groups (FR-6, §5.3) — delegated to shared PartnerWall */}
        <PartnerWall />

      </div>
    </section>
  );
}
