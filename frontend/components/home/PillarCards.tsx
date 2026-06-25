// PillarCards — shared presentational grid mapping the three ACCELERATE pillars.
// Server component: no 'use client', no hooks, no motion (T-2, FR-5, FR-12, §5.5).
//
// Used by:
//   - HowItWorks (home page §2.4) — wraps with 'use client' + useReveal stagger.
//   - About page Approach section (§3.3) — rendered inline, no motion wrapper.
//
// Grid: grid-cols-1 (mobile) → md:grid-cols-3 (≥ md). Cards are DIRECT children
// of the grid div so a parent useReveal can stagger via ':scope > div > *'.
//
// Design: icon-led institutional card with a faint decorative ordinal (NFR-1).
// Icon tile: bg-primary/10 text-primary — matches eyebrow pill token pattern.
// Ordinal: absolute top-right, text-primary/10 — purely decorative, aria-hidden.
//
// Usage (server):
//   <PillarCards />
//
// Usage (with motion wrapper in a client component):
//   const gridRef = useReveal<HTMLDivElement>({ targets: ':scope > div > *' });
//   <div ref={gridRef}><PillarCards /></div>

import { PILLARS } from '@/lib/content/pillars';

// ---------------------------------------------------------------------------
// SVG icons — Heroicons v2 outline style (24×24, stroke-width 1.5)
// Paths sourced from heroicons.com v2 outline set.
// ---------------------------------------------------------------------------

// index 0 — arrows-right-left (Information flow)
// Heroicons v2 outline `arrows-right-left` path data.
function IconArrowsRightLeft() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-6 h-6"
      aria-hidden="true"
    >
      <path d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  );
}

// index 1 — building-storefront (Marketplace traders)
// Heroicons v2 outline `building-storefront` path data.
function IconBuildingStorefront() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-6 h-6"
      aria-hidden="true"
    >
      <path d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016 2.993 2.993 0 0 0 2.25-1.016 3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
    </svg>
  );
}

// index 2 — building-library (Institutional buyers)
// Heroicons v2 outline `building-library` path data.
function IconBuildingLibrary() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-6 h-6"
      aria-hidden="true"
    >
      <path d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z" />
    </svg>
  );
}

// Ordered to match PILLARS index 0 → 1 → 2.
const ICONS = [IconArrowsRightLeft, IconBuildingStorefront, IconBuildingLibrary];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PillarCards() {
  return (
    // Responsive pillar card grid — 1 col mobile, 3 col ≥ md (NFR-2, T-2).
    // Direct children === the three cards so :scope > div > * stagger works.
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {PILLARS.map((pillar, index) => {
        const Icon = ICONS[index];
        return (
          // Institutional icon card — bg-surface, border-border, rounded-lg, shadow-sm.
          // relative enables the decorative ordinal positioned top-right.
          <div
            key={pillar.title}
            className="relative bg-surface border border-border rounded-lg shadow-sm p-6 flex flex-col gap-4"
          >
            {/* Decorative ordinal — top-right corner, faint primary tint, aria-hidden. */}
            <span
              aria-hidden="true"
              className="absolute top-5 right-6 text-4xl font-bold text-primary/10 leading-none select-none"
            >
              {index + 1}
            </span>

            {/* Icon tile — bg-primary/10 text-primary, matches eyebrow pill pattern (NFR-1). */}
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary shrink-0">
              <Icon />
            </span>

            {/* Pillar title — h3 because cards sit under a parent section <h2> (§5.5). */}
            <h3 className="text-base font-bold text-fg leading-snug">
              {pillar.title}
            </h3>

            {/* Body copy — flex-1 equalizes card height across the row. */}
            <p className="text-sm text-muted leading-relaxed flex-1">
              {pillar.body}
            </p>
          </div>
        );
      })}
    </div>
  );
}
