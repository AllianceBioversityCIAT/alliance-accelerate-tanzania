'use client';

// RoleBadge — compact role label + color swatch for a given traderType.
//
// Used inside ActorPopup (FR-3) and MapLegend (FR-2, FR-6).
// Token-driven — no raw hex (NFR-4). Uses bg-* Tailwind utilities whose full
// strings appear statically here so Tailwind's purge scanner can see them;
// they are therefore safe to reference from divIcon HTML strings as well
// (the static-class-in-JSX approach documented in the task brief).
//
// Rendered swatch classes by traderType (must appear verbatim for purge safety):
//   seed_company       → bg-primary
//   cooperative        → bg-success
//   ngo                → bg-accent
//   offtaker           → bg-crop-sorghum
//   research_institute → bg-muted
//   informal_trader    → bg-bean

import type { TraderType } from '@/lib/content/roles';
import { ROLES } from '@/lib/content/roles';

// ── Static class map (purge-safe — full strings required by Tailwind scanner) ──

/**
 * Maps each traderType to the full Tailwind bg-* class for its role color.
 * These strings MUST appear as complete literals so Tailwind's content scan
 * picks them up and includes the utility in the bundle.
 */
export const ROLE_BG_CLASS: Record<TraderType, string> = {
  seed_company:       'bg-primary',
  cooperative:        'bg-success',
  ngo:                'bg-accent',
  offtaker:           'bg-crop-sorghum',
  research_institute: 'bg-muted',
  informal_trader:    'bg-bean',
};

/**
 * Maps each traderType to the CSS custom-property for inline-style usage
 * (e.g. Leaflet divIcon HTML where Tailwind purge cannot scan the string).
 * References §7 tokens — never a raw hex value.
 */
export const ROLE_CSS_VAR: Record<TraderType, string> = {
  seed_company:       '--color-primary',
  cooperative:        '--color-success',
  ngo:                '--color-accent',
  offtaker:           '--crop-sorghum',
  research_institute: '--color-muted',
  informal_trader:    '--color-bean',
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface RoleBadgeProps {
  /** The actor's role/type. */
  traderType: TraderType;
  /** Optional extra class names on the badge wrapper. */
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Renders a small color swatch + role label pill.
 * Used in ActorPopup and MapLegend so the visual encoding is consistent.
 */
export default function RoleBadge({ traderType, className = '' }: RoleBadgeProps) {
  const { label } = ROLES[traderType] ?? { label: traderType };
  const bgClass   = ROLE_BG_CLASS[traderType] ?? 'bg-muted';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-medium text-fg ${className}`}
    >
      {/* Color swatch — aria-hidden; the text label conveys the role */}
      <span
        className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${bgClass}`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
