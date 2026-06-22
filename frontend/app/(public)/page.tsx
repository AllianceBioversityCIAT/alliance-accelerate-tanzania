// Home page — rendered inside PublicShell via (public)/layout.tsx (FR-1).
// T-4: Hero section with CTAs implemented.
// T-6: MetricsBand and CropCoverage sections will be added here later.

import Hero from '@/components/home/Hero';

export default function HomePage() {
  return (
    <>
      <Hero />
      {/* MetricsBand and CropCoverage added in T-6 */}
    </>
  );
}
