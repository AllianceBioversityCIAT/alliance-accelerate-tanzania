'use client';

// DirectoryFilters — crop / role / region selects + clear control for the
// Actor Directory (FR-2, NFR-3, NFR-4).
//
// Mirrors the select/label pattern from components/map/FilterControls.tsx.
// Region options come from REGIONS (reconciled to CANONICAL_REGIONS) so no
// selected value can produce a backend 400 (OQ-1 resolved).
//
// NFR-3: every select has an associated <label> via htmlFor/id.
// NFR-4: token-driven classes only — no raw hex.

import type { ActorsQuery } from '@/lib/api/actors';
import { CROPS } from '@/lib/content/crops';
import { ROLES } from '@/lib/content/roles';
import type { TraderType } from '@/lib/content/roles';
import { REGIONS } from '@/lib/content/regions';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DirectoryFiltersProps {
  /** Current active filters — mirrors the URL params. */
  filters: Pick<ActorsQuery, 'crop' | 'role' | 'region'>;
  /**
   * Called whenever a select changes or clear is activated.
   * Receives a new merged object with the changed field applied (or cleared to
   * undefined when "All …" is selected / clear pressed).
   * Caller is responsible for resetting page to 1 (FR-2).
   */
  onChange: (next: Pick<ActorsQuery, 'crop' | 'role' | 'region'>) => void;
  /** Called when the "Clear filters" button is activated (FR-2). */
  onClear: () => void;
}

// ── Shared style constants (mirror FilterControls.tsx) ────────────────────────

const LABEL_CLASS =
  'block text-xs font-medium uppercase tracking-wide text-muted mb-1';

const SELECT_CLASS = [
  'w-full rounded-md border border-border bg-surface px-2.5 py-1.5',
  'text-sm text-fg shadow-sm',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** True when at least one filter is active (controls clear-button visibility). */
function hasActiveFilters(
  filters: Pick<ActorsQuery, 'crop' | 'role' | 'region'>,
): boolean {
  return (
    filters.crop != null || filters.role != null || filters.region != null
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Three labeled filter selects: crop, actor role, and region.
 * Each select has an "All …" option that clears that field from the query.
 * A "Clear filters" button appears when any filter is active (FR-2).
 */
export default function DirectoryFilters({
  filters,
  onChange,
  onClear,
}: DirectoryFiltersProps) {
  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleCrop(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    onChange({ ...filters, crop: value !== '' ? value : undefined });
  }

  function handleRole(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    onChange({ ...filters, role: value !== '' ? value : undefined });
  }

  function handleRegion(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    onChange({ ...filters, region: value !== '' ? value : undefined });
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <fieldset className="border-0 p-0 m-0">
      <legend className="sr-only">Filter organizations</legend>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">

        {/* ── Crop ─────────────────────────────────────────────────────────── */}
        <div className="min-w-[10rem] flex-1">
          <label htmlFor="dir-filter-crop" className={LABEL_CLASS}>
            Crop
          </label>
          <select
            id="dir-filter-crop"
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
        <div className="min-w-[10rem] flex-1">
          <label htmlFor="dir-filter-role" className={LABEL_CLASS}>
            Role
          </label>
          <select
            id="dir-filter-role"
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
        <div className="min-w-[10rem] flex-1">
          <label htmlFor="dir-filter-region" className={LABEL_CLASS}>
            Region
          </label>
          <select
            id="dir-filter-region"
            value={filters.region ?? ''}
            onChange={handleRegion}
            className={SELECT_CLASS}
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

        {/* ── Clear filters button (FR-2) ───────────────────────────────────── */}
        {hasActiveFilters(filters) && (
          <div className="flex items-end">
            <button
              type="button"
              onClick={onClear}
              className={[
                'rounded-md border border-border bg-surface px-3 py-1.5',
                'text-sm text-muted shadow-sm transition-colors',
                'hover:border-primary hover:text-fg',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              ].join(' ')}
              aria-label="Clear all filters"
            >
              Clear filters
            </button>
          </div>
        )}

      </div>
    </fieldset>
  );
}
