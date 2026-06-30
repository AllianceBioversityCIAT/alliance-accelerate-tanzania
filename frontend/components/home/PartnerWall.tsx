// PartnerWall — shared headless logo-wall component (server component, no hooks).
//
// Renders the three-tier partner grouping (funder → "Funded by", lead → "Led by",
// partner → "In partnership with") as a self-contained wall with NO outer <section>,
// NO eyebrow, NO <h2> — purely the visual tier groups + logos.
//
// Used by:
//   - PartnersStrip (home page §5.3): wrapped in a <section> with heading
//   - /about page §3.5: wrapped in the Partners section with heading
//
// Logo treatment (NFR-4, FR-5):
//   - Logo'd partners: next/image inside a fixed h-12 cell so logos of varying
//     aspect ratio align vertically. max-h-9 md:max-h-10 w-auto object-contain.
//     Grayscale + opacity-80 at rest, transitions to full color on hover/focus-visible.
//     CSS-only, no JS. motion-reduce:transition-none respects prefers-reduced-motion.
//   - Text-fallback partners (no logo asset): styled <span> inside the same
//     accessible link wrapper, vertically centered in the h-12 cell.
//
// Focus ring: focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
// External links: target="_blank" rel="noopener noreferrer" aria-label with " — opens in a new tab".
// Tokens only — no hardcoded hex.

import Image from 'next/image';
import { PARTNERS, type Partner } from '@/lib/content/partners';

// ---------------------------------------------------------------------------
// Tier config — order and labels for each tier group
// ---------------------------------------------------------------------------

const TIER_GROUPS: Array<{
  tier: Partner['tier'];
  label: string;
}> = [
  { tier: 'funder',  label: 'Funded by' },
  { tier: 'lead',    label: 'Led by' },
  { tier: 'partner', label: 'In partnership with' },
];

// Intrinsic dimensions per logo (width × height) for correct next/image layout.
// Gates wordmark ~1000×202; TARI ~176×64; TOSCI ~200×52; Alliance/PABRA keep prior values.
const LOGO_DIMS: Record<string, { width: number; height: number }> = {
  alliance: { width: 400,  height: 80  },
  pabra:    { width: 477,  height: 181 },
  tari:     { width: 176,  height: 64  },
  tosci:    { width: 200,  height: 52  },
  cimmyt:   { width: 615,  height: 88  },
  bmgf:     { width: 1000, height: 202 },
};

// ---------------------------------------------------------------------------
// TierLabel — hairline-ruled caption
// ---------------------------------------------------------------------------

function TierLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 mb-5">
      <span className="h-px w-8 bg-border" aria-hidden="true" />
      <span className="text-xs font-semibold tracking-widest uppercase text-muted">
        {label}
      </span>
      <span className="h-px w-8 bg-border" aria-hidden="true" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// PartnerLogo — accessible external link with logo or text fallback
// ---------------------------------------------------------------------------

/**
 * Renders a single partner as an accessible external link.
 * Logo'd partners use next/image in a fixed h-12 cell with grayscale-to-color
 * hover treatment. Partners without a logo asset fall back to a styled text label,
 * also vertically centered in an h-12 cell so it aligns with the logos.
 */
function PartnerLogo({ p }: { p: Partner }) {
  const dims = LOGO_DIMS[p.key] ?? { width: 160, height: 48 };

  return (
    <a
      href={p.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${p.name} — opens in a new tab`}
      className="group inline-flex items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <span className="flex h-12 items-center">
        {p.logo ? (
          <Image
            src={p.logo}
            alt={p.name}
            width={dims.width}
            height={dims.height}
            className="max-h-9 md:max-h-10 w-auto object-contain grayscale opacity-80 transition group-hover:grayscale-0 group-hover:opacity-100 group-focus-visible:grayscale-0 group-focus-visible:opacity-100 motion-reduce:transition-none"
          />
        ) : (
          <span className="text-sm font-semibold text-muted">{p.name}</span>
        )}
      </span>
    </a>
  );
}

// ---------------------------------------------------------------------------
// PartnerWall — headless tier-grouped logo wall
// ---------------------------------------------------------------------------

/**
 * Renders the full three-tier partner logo wall.
 * Headless: no <section>, no eyebrow, no heading — callers supply those.
 *
 * @example
 * // Inside a <section> with its own heading:
 * <section aria-labelledby="partners-heading">
 *   <h2 id="partners-heading">Partners</h2>
 *   <PartnerWall />
 * </section>
 */
export default function PartnerWall() {
  return (
    <div className="flex flex-col items-center gap-12">
      {TIER_GROUPS.map(({ tier, label }) => {
        const tieredPartners = PARTNERS.filter((p) => p.tier === tier);
        if (tieredPartners.length === 0) return null;
        return (
          <div key={tier} className="w-full flex flex-col items-center">
            <TierLabel label={label} />
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
              {tieredPartners.map((partner) => (
                <PartnerLogo key={partner.key} p={partner} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
