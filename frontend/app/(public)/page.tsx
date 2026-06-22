// Home page — rendered inside PublicShell via (public)/layout.tsx.
// Hero, MetricsBand, and CropCoverage sections are implemented in T-4/T-6.
// This placeholder satisfies the route registration for the static export (/).

export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-3xl font-bold text-fg">ACCELERATE Tanzania Seed Registry</h1>
      <p className="mt-4 text-muted">Registry portal — Hero, Metrics and Crop sections coming in T-4/T-6.</p>
    </div>
  );
}
