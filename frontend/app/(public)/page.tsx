// Home page — rendered inside PublicShell via (public)/layout.tsx (FR-1).
// T-4: Hero section with CTAs implemented.
// T-6: Full home composition: Hero → MetricsBand → AboutStrip → HowItWorks →
//       CropCoverage → PartnersStrip → ClosingCTA (FR-2, FR-3, FR-4, FR-5, FR-6, §2.0).
// T-16: LandingCTA inserted directly below Hero — "below the hero actions"
//       per docs/specs/actors/public-self-registration/design.md §5.7 — the
//       public-self-registration spec's FR-1 "Landing CTA" scenario.

import Hero from '@/components/home/Hero';
import LandingCTA from '@/components/home/LandingCTA';
import MetricsBand from '@/components/home/MetricsBand';
import AboutStrip from '@/components/home/AboutStrip';
import HowItWorks from '@/components/home/HowItWorks';
import CropCoverage from '@/components/home/CropCoverage';
import PartnersStrip from '@/components/home/PartnersStrip';
import ClosingCTA from '@/components/home/ClosingCTA';

export default function HomePage() {
  return (
    <>
      <Hero />
      <LandingCTA />
      <MetricsBand />
      <AboutStrip />
      <HowItWorks />
      <CropCoverage />
      <PartnersStrip />
      <ClosingCTA />
    </>
  );
}
