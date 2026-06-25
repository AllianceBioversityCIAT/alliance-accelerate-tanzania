'use client';

// HowItWorks — FR-5 section: demand-led model explainer with pillar card stagger.
// 'use client' is required: consumes useReveal (browser-side GSAP + ScrollTrigger).
//
// Copy matches copy brief §2.4 exactly (eyebrow, h2, intro paragraph).
//
// Motion (FR-5, NFR-5): two useReveal calls —
//   headerRef: reveals the eyebrow + h2 + intro as a single unit (stagger: 0).
//   gridRef:   stagger-reveals the three PillarCards children.
//
//   PillarCards renders its own inner grid <div class="grid…"> whose direct children
//   are the three pillar cards.  Attaching gridRef to the outer wrapper div means
//   the selector ':scope > *' would only match the single grid div — no card stagger.
//   We use ':scope > div > *' instead so the path is:
//     wrapper (gridRef scope) → PillarCards grid div → the 3 card divs.
//   This produces the correct per-card stagger without modifying PillarCards.
//
// Progressive enhancement (FR-8): gsap.from is used inside useReveal so the resting
// DOM is always the natural visible state — content is fully readable without GSAP
// or under prefers-reduced-motion (the matchMedia gate inside useReveal).
//
// Accessibility: single <h2 id="how-it-works-heading">, section aria-labelledby.
// No <h1> in this component. Pillar card headings are <h3> (inside PillarCards).

import PillarCards from '@/components/home/PillarCards';
import { useReveal } from '@/lib/motion/useReveal';

// ---------------------------------------------------------------------------
// HowItWorks
// ---------------------------------------------------------------------------

export default function HowItWorks() {
  // Section header reveal — single block, no stagger between children (FR-5).
  const headerRef = useReveal<HTMLDivElement>({ stagger: 0 });

  // Pillar card stagger reveal.
  // ':scope > div > *' traverses: wrapper div (scope) → PillarCards grid div → 3 cards.
  // This targets individual cards for the stagger rather than the grid wrapper itself.
  // See header docstring for the full rationale.
  const gridRef = useReveal<HTMLDivElement>({ targets: ':scope > div > *' });

  return (
    <section
      className="bg-bg py-16"
      aria-labelledby="how-it-works-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Section header — reveals once as the section enters the viewport (FR-5). */}
        <div ref={headerRef} className="mb-10">
          {/* Eyebrow pill — primary accent, matches CropCoverage pattern (NFR-1). */}
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold tracking-wide mb-3">
            The model
          </span>

          <h2
            id="how-it-works-heading"
            className="text-2xl font-bold text-fg leading-tight"
          >
            A demand-led seed system
          </h2>

          <p className="text-sm text-muted mt-2 max-w-prose">
            Instead of pushing seed at farmers, ACCELERATE starts with demand. By linking formal,
            semi-formal, and informal seed sectors to the traders and buyers who already move grain,
            quality seed gets pulled through the value chain.
          </p>
        </div>

        {/*
          Pillar card grid wrapper.
          gridRef scope sits here; ':scope > div > *' reaches through PillarCards'
          own grid div to stagger-reveal each of the three card divs (FR-5, NFR-5).
          Progressive enhancement: no inline opacity/visibility set — GSAP only
          provides the entrance animation; static render is always fully visible.
        */}
        <div ref={gridRef}>
          <PillarCards />
        </div>

      </div>
    </section>
  );
}
