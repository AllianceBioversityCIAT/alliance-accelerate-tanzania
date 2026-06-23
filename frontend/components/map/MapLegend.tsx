'use client';

// MapLegend — role color legend + privacy-zone note, rendered as an overlay
// inside the map region (FR-2, FR-6, NFR-3, NFR-4).
//
// Positioned: absolutely bottom-left within the map section (see ActorMap.tsx).
// Accessible: <ul> with text labels — not color-only (NFR-3).
// Token-driven: swatch colors come from ROLE_BG_CLASS (same source as markers).
// No raw hex (NFR-4).
//
// Privacy-zone item (FR-6):
//   A static entry "Privacy zone — no consent" at the bottom of the legend.
//   Conveys that non-consented actors are excluded server-side and not plotted.
//   This is pure static copy — no data, no computation, no PII.

import { ROLES } from '@/lib/content/roles';
import type { TraderType } from '@/lib/content/roles';
import { ROLE_BG_CLASS } from './RoleBadge';

// Ordered list of traderTypes for stable legend rendering.
const TRADER_TYPES: TraderType[] = [
  'seed_company',
  'cooperative',
  'ngo',
  'offtaker',
  'research_institute',
  'informal_trader',
];

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Map legend panel.
 * Mount inside a `relative` container; the panel sits at the bottom-left.
 * Uses `pointer-events-auto` so the Leaflet map can still receive events
 * outside the legend bounds.
 */
export default function MapLegend() {
  return (
    <div
      className="
        pointer-events-auto absolute bottom-6 left-3 z-[1000]
        rounded-md border border-border bg-surface/95 p-3 shadow-md
        backdrop-blur-sm
      "
      // NFR-3: the legend is a complementary landmark so assistive technology
      // can navigate directly to it.
      role="complementary"
      aria-label="Map legend"
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Legend
      </p>

      {/* Role swatches — one per traderType (FR-2) */}
      <ul className="space-y-1.5" aria-label="Actor roles">
        {TRADER_TYPES.map((type) => {
          const { label } = ROLES[type];
          const bgClass   = ROLE_BG_CLASS[type] ?? 'bg-muted';
          return (
            <li key={type} className="flex items-center gap-2">
              {/* Color swatch — aria-hidden; text label conveys the role */}
              <span
                className={`h-3 w-3 flex-shrink-0 rounded-full ${bgClass}`}
                aria-hidden="true"
              />
              <span className="text-xs text-fg">{label}</span>
            </li>
          );
        })}

        {/* Privacy-zone item — FR-6 static copy */}
        <li className="mt-2 flex items-center gap-2 border-t border-border pt-2">
          {/* Hatched / dashed swatch conveys "absent" — styled with border, no fill */}
          <span
            className="h-3 w-3 flex-shrink-0 rounded-full border-2 border-dashed border-muted"
            aria-hidden="true"
          />
          <span className="text-xs italic text-muted">
            Privacy zone — no consent
          </span>
        </li>
      </ul>
    </div>
  );
}
