// PillarCards — shared presentational grid mapping the three ACCELERATE pillars.
// Server component: no 'use client', no hooks, no motion (T-2, FR-5, FR-12, §5.5).
//
// Used by:
//   - HowItWorks (home page §2.4) — wraps with 'use client' + useReveal stagger.
//   - About page Approach section (§3.3) — rendered inline, no motion wrapper.
//
// Grid: grid-cols-1 (mobile) → md:grid-cols-3 (≥ md). Cards are DIRECT children
// of the grid div so a parent useReveal can stagger via ':scope > *'.
//
// Accent: each card has a numbered badge using bg-primary/10 text-primary — the
// same pattern as the eyebrow pill in CropCoverage (no raw hex, NFR-1).
//
// Card geometry matches CropCard: bg-surface shadow-md rounded-md px-5 py-6.
//
// Usage (server):
//   <PillarCards />
//
// Usage (with motion wrapper in a client component):
//   const gridRef = useReveal<HTMLDivElement>();
//   <div ref={gridRef}><PillarCards /></div>
//   // Note: PillarCards renders each card as a direct child of its own grid div.
//   // To stagger *cards* (not the grid wrapper), attach the ref to the inner grid
//   // via a wrapping pattern or pass the gridRef as a prop in the client layer.

import { PILLARS } from '@/lib/content/pillars';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PillarCards() {
  return (
    // Responsive pillar card grid — 1 col mobile, 3 col ≥ md (NFR-2, T-2).
    // Direct children === the three cards so :scope > * stagger works (T-2 spec).
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {PILLARS.map((pillar, index) => (
        // bg-surface card — geometry mirrors CropCard (shadow-md, rounded-md, px-5 py-6).
        <div
          key={pillar.title}
          className="bg-surface border border-border shadow-md rounded-md overflow-hidden flex flex-col px-5 py-6 gap-4"
        >
          {/* Numbered badge — primary accent using bg-primary/10 text-primary (NFR-1). */}
          <span
            aria-hidden="true"
            className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold leading-none shrink-0 self-start"
          >
            {index + 1}
          </span>

          {/* Pillar title — h3 because cards sit under a parent section <h2> (§5.5). */}
          <h3 className="text-base font-bold text-fg leading-snug">
            {pillar.title}
          </h3>

          {/* Body copy */}
          <p className="text-sm text-muted leading-relaxed flex-1">
            {pillar.body}
          </p>
        </div>
      ))}
    </div>
  );
}
