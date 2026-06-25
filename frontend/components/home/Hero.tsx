'use client';

// Hero — Two-column landing hero section (T-4, FR-2, FR-3, FR-7, FR-8, NFR-2).
// Client component: refs + GSAP entrance timeline added in T-4 (portal-animations).
//
// Layout:
//   lg+  : two columns side-by-side (text left, visual panel right)
//   <lg  : single column stacked (text on top, visual panel below)
//
// Motion (T-4 portal-animations):
//   - Entrance timeline: stagger-reveal eyebrow → h1 → p → CTA row (autoAlpha+y).
//   - Photo panel: subtle scale 1.04→1 on a wrapper div — the next/image priority
//     photo is NEVER animated from opacity:0 so LCP is not delayed (NFR-2 / FR-3).
//   - LiveRegistryCard count-up: useCountUp animates 0→1000; "1,000+" is always
//     rendered in JSX so it shows without GSAP / under reduced-motion (FR-8).
//   - All motion gated on `(prefers-reduced-motion: no-preference)` via gsap.matchMedia
//     inside useGSAP — reduced-motion users see the fully visible static state (FR-7).

import { useRef } from 'react';
import Image from 'next/image';
import Button from '@/components/ui/Button';
import { registerGsap, gsap, useGSAP } from '@/lib/motion/gsap-setup';
import { useCountUp } from '@/lib/motion/useCountUp';
import { DURATION, EASE, REVEAL } from '@/lib/motion/motion-tokens';

// ---------------------------------------------------------------------------
// Decorative right-arrow icon — aria-hidden (a11y: purely decorative glyph)
// ---------------------------------------------------------------------------
function ArrowRight() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// LiveRegistryCard — pinned overlay on the visual panel
// ---------------------------------------------------------------------------
interface LiveRegistryCardProps {
  /** Ref forwarded to the count-up number node. */
  countRef: React.RefObject<HTMLElement | null>;
}

function LiveRegistryCard({ countRef }: LiveRegistryCardProps) {
  return (
    <div
      // bg-surface with shadow-md and rounded-md — token-only (NFR-4)
      className="absolute bottom-5 left-5 bg-surface shadow-md rounded-md px-4 py-3 min-w-[180px]"
      role="region"
      aria-label="Live registry summary"
    >
      {/* Label pill */}
      <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-1">
        Live Registry
      </p>
      {/*
        Count-up target — always renders "1,000+" in JSX so the value is present
        without GSAP (progressive enhancement, FR-8). useCountUp overwrites
        textContent in the animation path only.
      */}
      <p className="text-3xl font-bold text-fg leading-none">
        <span ref={countRef}>1,000+</span>
      </p>
      <p className="text-xs text-muted mt-1 leading-snug">
        verified seed-system actors and growing
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VisualPanel — right-column field/harvest photography with stat overlay
// ---------------------------------------------------------------------------
interface VisualPanelProps {
  /** Ref for the scale-only entrance on the panel wrapper (LCP-safe). */
  panelRef: React.RefObject<HTMLDivElement | null>;
  /** Ref forwarded to the count-up number node inside the card. */
  countRef: React.RefObject<HTMLElement | null>;
}

function VisualPanel({ panelRef, countRef }: VisualPanelProps) {
  return (
    // relative so the LiveRegistryCard can use absolute positioning inside it.
    <div className="relative w-full h-72 lg:h-full min-h-[320px]">
      {/*
        panelRef is placed on THIS wrapper — scale animates the outer shell, not
        the <Image> itself, so the priority photo is always fully painted (NFR-2).
        The image's opacity is never changed; only the wrapper scale transitions.
      */}
      <div ref={panelRef} className="absolute inset-0 rounded-lg bg-restricted border border-border overflow-hidden">
        {/* Real field/harvest photography — meaningful image (informative alt). */}
        <Image
          src="/hero-harvest.jpg"
          alt="A young bean farmer sorting freshly harvested red beans at a community drying site in the Tanzanian highlands."
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover object-[50%_30%]"
        />
        {/* Bottom scrim for depth + overlay legibility — token-based (fg), no raw
            hex; tracks --color-fg so the LiveRegistryCard always reads clearly. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-fg/70 to-transparent"
        />
      </div>

      {/* Live Registry stat card — pinned to bottom-left of the panel */}
      <LiveRegistryCard countRef={countRef} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------
export default function Hero() {
  // Scope ref for the useGSAP entrance timeline — all selectors are scoped here.
  const containerRef = useRef<HTMLElement>(null);

  // Ref for the image panel wrapper; scale 1.04→1 only (no opacity — LCP safe).
  const panelRef = useRef<HTMLDivElement>(null);

  // count-up: 0→1000 with "+" suffix; JSX already renders "1,000+" (FR-8).
  const { ref: countRef } = useCountUp(1000, { suffix: '+' });

  // Entrance timeline — runs once on mount, client-only (NFR-3).
  useGSAP(
    () => {
      registerGsap();

      // Reduced-motion gate (FR-7 / gsap-core skill §matchMedia).
      // The `reduce` branch is a no-op → all content already visible in its
      // natural state (FR-8).  useGSAP auto-reverts the matchMedia context on
      // unmount (gsap-react skill).
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // Stagger-reveal: eyebrow badge → h1 → supporting copy → CTA row.
        // `gsap.from` so the resting DOM is the natural visible state (FR-8).
        // Targets are scoped via { scope: containerRef } on useGSAP (gsap-react skill).
        gsap.from('[data-hero-text]', {
          autoAlpha:  0,                 // opacity+visibility fade-in (gsap-core skill)
          y:          REVEAL.y,          // slight upward rise on entry
          duration:   DURATION.base,
          ease:       EASE.out,
          stagger:    REVEAL.stagger,
        });

        // Photo panel: subtle scale only — image opacity is untouched (LCP-safe, NFR-2).
        if (panelRef.current) {
          gsap.from(panelRef.current, {
            scale:    1.04,
            duration: DURATION.slow,
            ease:     EASE.out,
          });
        }
      });
    },
    { scope: containerRef },
  );

  return (
    <section
      ref={containerRef}
      aria-labelledby="hero-heading"
      className="bg-bg"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* ----------------------------------------------------------------
              LEFT COLUMN — copy + CTAs
          ---------------------------------------------------------------- */}
          <div className="flex flex-col gap-6">

            {/* Eyebrow badge — pill with subtle primary tint */}
            <div data-hero-text>
              <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold tracking-wide">
                Institutional seed-system intelligence
              </span>
            </div>

            {/* Headline — h1 for page-level heading (a11y) */}
            <h1
              id="hero-heading"
              data-hero-text
              className="text-4xl font-bold text-fg leading-tight tracking-tight"
            >
              The connective tissue of Tanzania&rsquo;s seed system.
            </h1>

            {/* Supporting copy */}
            <p data-hero-text className="text-lg text-muted leading-relaxed max-w-prose">
              A single trusted registry mapping seed companies, cooperatives,
              offtakers, and partners across sorghum, common bean, and groundnut
              value chains &mdash; so institutions can find the right actors, fast.
            </p>

            {/* CTAs — flex row, wrap gracefully on narrow screens */}
            <div data-hero-text className="flex flex-wrap gap-3 mt-2">
              <Button variant="primary" href="/map">
                Explore the Map
                <ArrowRight />
              </Button>
              <Button variant="secondary" href="/directory">
                Browse Directory
              </Button>
            </div>

          </div>

          {/* ----------------------------------------------------------------
              RIGHT COLUMN — visual panel with stat overlay
          ---------------------------------------------------------------- */}
          <VisualPanel panelRef={panelRef} countRef={countRef} />

        </div>
      </div>
    </section>
  );
}
