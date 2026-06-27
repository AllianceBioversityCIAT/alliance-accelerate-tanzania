'use client';

// FilterControls — crop / role / region labeled selects for the DiscoverRail.
//
// FR-4: Each select updates the parent ActorsQuery on change. Selecting
// "All …" clears that filter (sets the field to `undefined`) and resets
// `page` to 1 so the server re-queries from the beginning (DD-3).
//
// NFR-3: Every <select> has an associated <label> via htmlFor/id so it is a
// real labeled control (screen-reader and keyboard accessible).
// NFR-4: Token-driven classes only — no raw hex, text-white, bg-white, etc.

import type { ActorsQuery } from '@/lib/api/actors';
import { CROPS } from '@/lib/content/crops';
import { ROLES } from '@/lib/content/roles';
import type { TraderType } from '@/lib/content/roles';
import { REGIONS } from '@/lib/content/regions';

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
  // Only show regions that have actors when provided; otherwise the full list.
  const regionOptions = regions && regions.length > 0 ? regions : REGIONS;

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

  function handleRegion(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
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
        <select
          id="filter-region"
          value={filters.region ?? ''}
          onChange={handleRegion}
          className={SELECT_CLASS}
          aria-label="Filter by region"
        >
          <option value="">All regions</option>
          {regionOptions.map((region) => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </select>
      </div>

    </div>
  );
}
