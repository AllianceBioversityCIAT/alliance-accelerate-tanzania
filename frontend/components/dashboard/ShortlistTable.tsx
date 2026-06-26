'use client';

/**
 * ShortlistTable — FR-8, NFR-1, design.md §5.7.
 * Spec: dashboard/discovery-dashboard, T-11.
 *
 * Renders a capped, accessible table of PublicActor rows for the Discovery
 * Dashboard shortlist panel.  When the full result set exceeds `maxRows`, a
 * "See all N in the Directory →" link navigates to /directory carrying the
 * current filter state encoded as a querystring.
 *
 * PII contract (NFR-1): PublicActor carries NO phone/email fields.
 * This component MUST NOT reference phone or email — enforced by type.
 * Token-driven: no hardcoded hex (NFR-4).
 */

import Link from 'next/link';
import type { PublicActor, ActorsQuery } from '@/lib/api/actors';
import { roleLabel } from '@/lib/content/roles';
import { CROPS } from '@/lib/content/crops';
import { encodeFilters } from '@/lib/dashboard/filters-url';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ShortlistTableProps {
  /** PII-safe actor list — no phone/email exists on this type (NFR-1). */
  actors: PublicActor[];
  /** Active filter state used to build the "See all" link querystring. */
  filters: ActorsQuery;
  /**
   * Maximum number of actor rows to display before showing the overflow link.
   * @default 10
   */
  maxRows?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve human-readable crop names from crop slug array.
 * Preserves order; unknown slugs fall back to the raw slug string.
 */
function cropNames(slugs: PublicActor['crops']): string {
  if (slugs.length === 0) return '—';
  return slugs
    .map((slug) => CROPS.find((c) => c.slug === slug)?.name ?? slug)
    .join(', ');
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Accessible shortlist table for the Discovery Dashboard.
 *
 * Columns: Name (linked to /profile?id=<id>), Region/District, Type, Crops,
 * Capacity (t).  Caps at `maxRows`; renders a "See all N in the Directory →"
 * overflow link when needed.  Empty state when actors is empty.
 *
 * Usage:
 *   <ShortlistTable actors={actors} filters={activeFilters} maxRows={10} />
 */
export default function ShortlistTable({
  actors,
  filters,
  maxRows = 10,
}: ShortlistTableProps) {
  const total = actors.length;
  const visibleRows = actors.slice(0, maxRows);

  // Build the "See all" href once — /directory + encoded filter querystring.
  const directoryQs = encodeFilters(filters).toString();
  const directoryHref = directoryQs ? `/directory?${directoryQs}` : '/directory';

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (total === 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-md border border-border bg-surface px-4 py-6 text-center text-sm text-muted"
      >
        No actors match these filters.
      </div>
    );
  }

  // ── Table ───────────────────────────────────────────────────────────────────
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full border-collapse text-sm"
        aria-label="Shortlisted actors"
      >
        <caption className="sr-only">
          Actor shortlist — showing {visibleRows.length} of {total} results
        </caption>

        {/* ── Column headers ──────────────────────────────────────────────── */}
        <thead>
          <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <th scope="col" className="py-2 pr-4">
              Name
            </th>
            <th scope="col" className="py-2 pr-4">
              Region / District
            </th>
            <th scope="col" className="py-2 pr-4">
              Type
            </th>
            <th scope="col" className="py-2 pr-4">
              Crops
            </th>
            <th scope="col" className="py-2 text-right">
              Capacity (t)
            </th>
          </tr>
        </thead>

        {/* ── Actor rows ──────────────────────────────────────────────────── */}
        <tbody>
          {visibleRows.map((actor) => {
            const {
              id,
              traderName,
              region,
              district,
              traderType,
              capacityTons,
              crops,
            } = actor;

            // Location: "Region · District" or just "Region"
            const location = district ? `${region} · ${district}` : region;

            return (
              <tr
                key={id}
                className="border-b border-border last:border-0 hover:bg-surface-alt transition-colors"
              >
                {/* Name — links to actor profile using the canonical route pattern */}
                <td className="py-3 pr-4 font-medium text-fg">
                  <Link
                    href={`/profile?id=${id}`}
                    className="text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
                    aria-label={`View profile for ${traderName}`}
                  >
                    {traderName}
                  </Link>
                </td>

                {/* Region / District */}
                <td className="py-3 pr-4 text-muted">{location}</td>

                {/* Actor type — human-readable label */}
                <td className="py-3 pr-4 text-muted">{roleLabel(traderType)}</td>

                {/* Crops — comma-separated names */}
                <td className="py-3 pr-4 text-muted">{cropNames(crops)}</td>

                {/* Capacity (t) — right-aligned; em-dash when unavailable */}
                <td className="py-3 text-right text-muted">
                  {capacityTons != null ? `${capacityTons}` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ── "See all N in the Directory →" overflow link ────────────────────── */}
      {total > maxRows && (
        <div className="mt-3 text-right">
          <Link
            href={directoryHref}
            className="text-sm font-medium text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
            aria-label={`See all ${total} actors in the Directory`}
          >
            See all {total} in the Directory &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
