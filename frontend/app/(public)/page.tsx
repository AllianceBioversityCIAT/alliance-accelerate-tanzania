// Home page — rendered inside PublicShell via (public)/layout.tsx (FR-1).
// T-4: Hero section with CTAs implemented.
// T-6: MetricsBand (FR-3) and CropCoverage (FR-4) sections added.

import Hero from '@/components/home/Hero';
import MetricsBand from '@/components/home/MetricsBand';
import CropCoverage from '@/components/home/CropCoverage';

export default function HomePage() {
  return (
    <>
      <Hero />
      <MetricsBand />
      <CropCoverage />
    </>
  );
}
