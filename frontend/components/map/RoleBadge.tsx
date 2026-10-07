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
//   seed_company             → bg-primary
//   cooperative              → bg-success
//   ngo                      → bg-accent
//   offtaker                 → bg-crop-sorghum
//   research_institute       → bg-muted
//   informal_trader          → bg-bean
//   humanitarian             → bg-highlight
//   digital_service_provider → bg-highlight-soft
//   qds_producer             → bg-crop-groundnut
//   bulk_buyer               → bg-warning

import type { TraderType } from '@/lib/content/roles';
import { ROLES, roleSummary } from '@/lib/content/roles';

// ── Static class map (purge-safe — full strings required by Tailwind scanner) ──

/**
 * Maps each traderType to the full Tailwind bg-* class for its role color.
 * These strings MUST appear as complete literals so Tailwind's content scan
 * picks them up and includes the utility in the bundle.
 */
export const ROLE_BG_CLASS: Record<TraderType, string> = {
  seed_company:             'bg-primary',
  cooperative:              'bg-success',
  ngo:                      'bg-accent',
  offtaker:                 'bg-crop-sorghum',
  research_institute:       'bg-muted',
  informal_trader:          'bg-bean',
  humanitarian:             'bg-highlight',
  digital_service_provider: 'bg-highlight-soft',
  qds_producer:             'bg-crop-groundnut',
  bulk_buyer:               'bg-warning',
};

/**
 * Maps each traderType to the CSS custom-property for inline-style usage
 * (e.g. Leaflet divIcon HTML where Tailwind purge cannot scan the string).
 * References §7 tokens — never a raw hex value.
 */
export const ROLE_CSS_VAR: Record<TraderType, string> = {
  seed_company:             '--color-primary',
  cooperative:              '--color-success',
  ngo:                      '--color-accent',
  offtaker:                 '--crop-sorghum',
  research_institute:       '--color-muted',
  informal_trader:          '--color-bean',
  humanitarian:             '--color-highlight',
  digital_service_provider: '--color-highlight-soft',
  qds_producer:             '--crop-groundnut',
  bulk_buyer:               '--color-warning',
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface RoleBadgeProps {
  /** The actor's role/type. */
  traderType: TraderType;
  /** `secondary` is the quieter chip used for an actor's other types. */
  variant?: 'main' | 'secondary';
  /** Optional extra class names on the badge wrapper. */
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Renders a small color swatch + role label pill.
 * Used in ActorPopup and MapLegend so the visual encoding is consistent.
 */
export default function RoleBadge({ traderType, variant = 'main', className = '' }: RoleBadgeProps) {
  const { label } = ROLES[traderType] ?? { label: traderType };
  const bgClass   = ROLE_BG_CLASS[traderType] ?? 'bg-muted';
  const chipClass =
    variant === 'main'
      ? 'gap-1.5 border border-border bg-surface px-2 font-medium text-fg'
      : 'gap-1 border border-transparent px-1 text-muted';

  return (
    <span className={`inline-flex items-center rounded-full py-0.5 text-xs ${chipClass} ${className}`}>
      {/* Color swatch — aria-hidden; the text label conveys the role */}
      <span
        className={`flex-shrink-0 rounded-full ${variant === 'main' ? 'h-2.5 w-2.5' : 'h-2 w-2'} ${bgClass}`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

// ── Main + other types ────────────────────────────────────────────────────────

export interface RoleBadgesProps {
  traderType: TraderType;
  /** Other types beyond the main one; renders nothing extra when empty/absent. */
  additionalTraderTypes?: readonly string[];
  /**
   * `compact` (popup, lists, cards): main chip, then quieter chips, no visible
   * headings. `labelled` (profile): "Main type" / "Other types" rows.
   */
  layout?: 'compact' | 'labelled';
  className?: string;
}

export function RoleBadges({
  traderType,
  additionalTraderTypes,
  layout = 'compact',
  className = '',
}: RoleBadgesProps) {
  const others = (additionalTraderTypes ?? []) as readonly TraderType[];

  if (layout === 'labelled') {
    return (
      <dl className={`grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2 ${className}`}>
        <dt className="pt-0.5 text-xs font-medium text-muted">Main type</dt>
        <dd className="m-0">
          <RoleBadge traderType={traderType} />
        </dd>
        {others.length > 0 && (
          <>
            <dt className="pt-0.5 text-xs font-medium text-muted">Other types</dt>
            <dd className="m-0 flex flex-wrap gap-1.5">
              {others.map((t) => (
                <RoleBadge key={t} traderType={t} />
              ))}
            </dd>
          </>
        )}
      </dl>
    );
  }

  return (
    <span className={`flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 ${className}`}>
      <span className="sr-only">Main type:</span>
      <RoleBadge traderType={traderType} />
      {others.length > 0 && <span className="sr-only">Other types:</span>}
      {others.map((t) => (
        <RoleBadge key={t} traderType={t} variant="secondary" />
      ))}
    </span>
  );
}

/**
 * Table-cell text "Main +N". The full list is announced to assistive tech via
 * an sr-only span, since a `title` alone is unreachable by keyboard and touch.
 */
export function RoleSummaryText({
  traderType,
  additionalTraderTypes,
}: Readonly<{ traderType: string; additionalTraderTypes?: readonly string[] }>) {
  const { text, title } = roleSummary(traderType, additionalTraderTypes);
  if (text === title) return <>{text}</>;
  return (
    <>
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{title}</span>
    </>
  );
}
