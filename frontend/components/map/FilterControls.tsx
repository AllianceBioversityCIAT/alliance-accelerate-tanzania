'use client';

// FilterControls — crop / role / region labeled selects for the DiscoverRail.
//
// FR-4: Each select updates the parent ActorsQuery on change. Selecting
// "All …" clears that filter (sets the field to `undefined`) and resets
// `page` to 1 so the server re-queries from the beginning (DD-3).
//
// T-5 (enhancement/searchable-region-select, design.md §5.6): the region
// select is the searchable `SearchableSelect` primitive rather than a native
// `<select>`. Crop and role keep native `<select>`s (3 and ~8 options — a
// searcher adds cost with no benefit, requirements.md §6). The `<label
// htmlFor>` below is what gives the control its accessible name now that the
// redundant `aria-label="Filter by region"` is gone (OQ-1, JD-4 — this is the
// second of the two adopted sites the fix must land at).
//
// NFR-3: Every select/control has an associated <label> via htmlFor/id so it
// is a real labeled control (screen-reader and keyboard accessible).
// NFR-4: Token-driven classes only — no raw hex, text-white, bg-white, etc.

import { useMemo } from 'react';
import type { ActorsQuery } from '@/lib/api/actors';
import { CROPS } from '@/lib/content/crops';
import { ROLES } from '@/lib/content/roles';
import type { TraderType } from '@/lib/content/roles';
import { REGIONS } from '@/lib/content/regions';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface FilterControlsProps {
  /** Current active filters — mirrors page-level ActorsQuery state. */
  filters: ActorsQuery;
  /**
   * Called whenever any select changes. Receives a new merged ActorsQuery
   * with the changed field applied (or cleared to undefined when "All …"
   * is selected) and page reset to 1.
   */
  onChange: (next: ActorsQuery) => void;
  /**
   * Region options for the dropdown. When provided (e.g. only the regions that
   * actually have actors), these are used instead of the full canonical list.
   * Falls back to all canonical REGIONS when undefined (e.g. before data loads).
   */
  regions?: string[];
}

// ── Shared select + label style ───────────────────────────────────────────────

// Full utility strings here so Tailwind's content scanner picks them up.
const LABEL_CLASS =
  'block text-xs font-medium uppercase tracking-wide text-muted mb-1';

const SELECT_CLASS = [
  'w-full rounded-md border border-border bg-surface px-2.5 py-1.5',
  'text-sm text-fg shadow-sm',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Three labeled filter selects: crop, actor role, and region.
 * Each select has an "All …" option that clears that field from the query.
 * Changes call `onChange` with a new merged ActorsQuery (page reset to 1).
 */
export default function FilterControls({ filters, onChange, regions }: FilterControlsProps) {
  // Only show regions that have actors when provided; otherwise the full
  // list (FR-5's "Dynamic option subset" scenario, both clauses). Memoized
  // so a stable `regions` prop doesn't hand SearchableSelect a new `options`
  // array identity every render.
  const regionOptions = useMemo(
    () =>
      (regions && regions.length > 0 ? regions : REGIONS).map((region) => ({
        value: region,
        label: region,
      })),
    [regions],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleCrop(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    onChange({
      ...filters,
      crop: value !== '' ? value : undefined,
      page: 1,
    });
  }

  function handleRole(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    onChange({
      ...filters,
      role: value !== '' ? value : undefined,
      page: 1,
    });
  }

  // SearchableSelect's onChange hands back the committed option's value
  // directly (never the typed search text — FR-3) rather than a change
  // event, so this takes a string, not a ChangeEvent. The clear entry
  // (`clearOptionLabel`) commits `''` via that same path, which this then
  // maps to `undefined` — FR-5's `BUT it must NOT` send `region=` as an
  // empty parameter — while still resetting `page` to 1 (DD-3).
  function handleRegion(value: string) {
    onChange({
      ...filters,
      region: value !== '' ? value : undefined,
      page: 1,
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3" role="group" aria-label="Filter actors">

      {/* ── Crop ─────────────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="filter-crop" className={LABEL_CLASS}>
          Crop
        </label>
        <select
          id="filter-crop"
          value={filters.crop ?? ''}
          onChange={handleCrop}
          className={SELECT_CLASS}
          aria-label="Filter by crop"
        >
          <option value="">All crops</option>
          {CROPS.map((crop) => (
            <option key={crop.slug} value={crop.slug}>
              {crop.name}
            </option>
          ))}
        </select>
      </div>

      {/* ── Actor role ────────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="filter-role" className={LABEL_CLASS}>
          Role
        </label>
        <select
          id="filter-role"
          value={filters.role ?? ''}
          onChange={handleRole}
          className={SELECT_CLASS}
          aria-label="Filter by actor role"
        >
          <option value="">All roles</option>
          {(Object.entries(ROLES) as [TraderType, { label: string }][]).map(
            ([type, meta]) => (
              <option key={type} value={type}>
                {meta.label}
              </option>
            ),
          )}
        </select>
      </div>

      {/* ── Region ───────────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="filter-region" className={LABEL_CLASS}>
          Region
        </label>
        <SearchableSelect
          id="filter-region"
          value={filters.region ?? ''}
          onChange={handleRegion}
          options={regionOptions}
          clearOptionLabel="All regions"
          placeholder="All regions"
        />
      </div>

    </div>
  );
}
