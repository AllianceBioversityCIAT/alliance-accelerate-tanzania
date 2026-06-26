'use client';

// DashboardFilters — full filter panel for the Discovery Dashboard.
//
// FR-2 (search / actor-type filter), FR-3 (capacity range filter),
// NFR-4 (token-driven styling only — no hardcoded hex/geometry).
// design.md §5.3 (Discovery Dashboard filter panel).
//
// Mirrors FilterControls.tsx conventions:
//   • Every control has an associated <label> via htmlFor/id (a11y).
//   • Every change merges into the current filters and resets page → 1.
//   • Empty / "All …" selections clear the field to undefined (not "").

import type { ActorsQuery } from '@/lib/api/actors';
import { CROPS } from '@/lib/content/crops';
import { REGIONS } from '@/lib/content/regions';
import { ROLES } from '@/lib/content/roles';
import type { TraderType } from '@/lib/content/roles';
import CapacityRangeControl from './CapacityRangeControl';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DashboardFiltersProps {
  /** Current active filter state — value-controlled from the parent page. */
  filters: ActorsQuery;
  /**
   * Called whenever any filter changes. Receives a new merged ActorsQuery
   * with the changed field applied (or cleared to undefined) and page reset to 1.
   */
  onChange: (next: ActorsQuery) => void;
}

// ── Shared style constants ────────────────────────────────────────────────────

const LABEL_CLASS =
  'block text-xs font-medium uppercase tracking-wide text-muted mb-1';

const CONTROL_CLASS = [
  'w-full rounded-md border border-border bg-surface px-2.5 py-1.5',
  'text-sm text-fg shadow-sm',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Dashboard filter panel containing crop, region, district, actor type,
 * free-text search, and capacity range controls.
 *
 * Usage:
 *   <DashboardFilters
 *     filters={query}
 *     onChange={(next) => setQuery(next)}
 *   />
 */
export default function DashboardFilters({ filters, onChange }: DashboardFiltersProps) {
  // ── Merge helper ─────────────────────────────────────────────────────────────

  /**
   * Returns a new ActorsQuery with the patch applied and page reset to 1.
   * Undefined values from the patch overwrite existing fields (clearing them).
   */
  function merge(patch: Partial<ActorsQuery>): ActorsQuery {
    return { ...filters, ...patch, page: 1 };
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleCrop(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    onChange(merge({ crop: value !== '' ? value : undefined }));
  }

  function handleRegion(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    onChange(merge({ region: value !== '' ? value : undefined }));
  }

  function handleDistrict(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.trim();
    onChange(merge({ district: value !== '' ? value : undefined }));
  }

  function handleRole(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    onChange(merge({ role: value !== '' ? value : undefined }));
  }

  function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    onChange(merge({ search: value !== '' ? value : undefined }));
  }

  function handleCapacity({ capacityMin, capacityMax }: { capacityMin?: number; capacityMax?: number }) {
    onChange(merge({ capacityMin, capacityMax }));
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3" role="group" aria-label="Filter dashboard actors">

      {/* ── Crop ─────────────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="dash-filter-crop" className={LABEL_CLASS}>
          Crop
        </label>
        <select
          id="dash-filter-crop"
          value={filters.crop ?? ''}
          onChange={handleCrop}
          className={CONTROL_CLASS}
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

      {/* ── Region ───────────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="dash-filter-region" className={LABEL_CLASS}>
          Region
        </label>
        <select
          id="dash-filter-region"
          value={filters.region ?? ''}
          onChange={handleRegion}
          className={CONTROL_CLASS}
          aria-label="Filter by region"
        >
          <option value="">All regions</option>
          {REGIONS.map((region) => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </select>
      </div>

      {/* ── District ─────────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="dash-filter-district" className={LABEL_CLASS}>
          District
        </label>
        <input
          id="dash-filter-district"
          type="text"
          placeholder="All districts"
          value={filters.district ?? ''}
          onChange={handleDistrict}
          className={CONTROL_CLASS}
          aria-label="Filter by district"
        />
      </div>

      {/* ── Actor type ───────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="dash-filter-role" className={LABEL_CLASS}>
          Actor type
        </label>
        <select
          id="dash-filter-role"
          value={filters.role ?? ''}
          onChange={handleRole}
          className={CONTROL_CLASS}
          aria-label="Filter by actor type"
        >
          <option value="">All types</option>
          {(Object.entries(ROLES) as [TraderType, { label: string }][]).map(
            ([type, meta]) => (
              <option key={type} value={type}>
                {meta.label}
              </option>
            ),
          )}
        </select>
      </div>

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="dash-filter-search" className={LABEL_CLASS}>
          Search
        </label>
        <input
          id="dash-filter-search"
          type="search"
          placeholder="Search actors…"
          value={filters.search ?? ''}
          onChange={handleSearch}
          className={CONTROL_CLASS}
          aria-label="Search actors by name"
        />
      </div>

      {/* ── Capacity range ───────────────────────────────────────────────── */}
      <CapacityRangeControl
        value={{
          capacityMin: filters.capacityMin,
          capacityMax: filters.capacityMax,
        }}
        onChange={handleCapacity}
      />

    </div>
  );
}
