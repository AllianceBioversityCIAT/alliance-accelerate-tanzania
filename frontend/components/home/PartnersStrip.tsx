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

import AccelerateLogo from '@/components/home/AccelerateLogo';
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
          <span className="inline-flex items-center rounded-full bg-primary-soft text-primary px-3 py-1 text-xs font-semibold tracking-wide mb-3">
            Partners
          </span>

          <div className="mb-4">
            <AccelerateLogo />
          </div>

          <h2
            id="partners-heading"
            className="text-2xl lg:text-3xl font-extrabold text-fg leading-tight"
          >
            The coalition behind ACCELERATE
          </h2>

          <p className="text-sm text-muted mt-3 max-w-prose mx-auto text-center">
            ACCELERATE, the project this registry began under, is funded by the Bill &amp; Melinda
            Gates Foundation and led by the Alliance of Bioversity International &amp; CIAT and PABRA,
            with the Tanzania Agricultural Research Institute (TARI), the Tanzania Official Seed
            Certification Institute (TOSCI), and CIMMYT.
          </p>
        </div>

        {/* Tier groups (FR-6, §5.3) — delegated to shared PartnerWall */}
        <PartnerWall />

      </div>
    </section>
  );
}
