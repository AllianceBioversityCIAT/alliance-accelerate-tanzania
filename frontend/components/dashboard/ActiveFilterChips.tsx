'use client';

// ActiveFilterChips — shows the currently-applied dashboard filters as removable
// chips, with a "Clear all" affordance. Reflects the same ActorsQuery the rest of
// the dashboard is driven by; removing a chip clears that one field (page reset to 1).
//
// Token-only styling. Accessible: each remove control is a real <button> with an
// aria-label; the chip row is labelled for screen readers.

import type { ActorsQuery } from '@/lib/api/actors';
import { CROPS } from '@/lib/content/crops';
import { ROLES, type TraderType } from '@/lib/content/roles';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ActiveFilterChipsProps {
  filters: ActorsQuery;
  onChange: (next: ActorsQuery) => void;
}

// ---------------------------------------------------------------------------
// Helpers — human-readable labels for filter values
// ---------------------------------------------------------------------------

function cropLabel(slug: string): string {
  return CROPS.find((c) => c.slug === slug)?.name ?? slug;
}

function roleLabel(type: string): string {
  return ROLES[type as TraderType]?.label ?? type;
}

function capacityLabel(min?: number, max?: number): string | null {
  if (min != null && max != null) return `${min}–${max} t`;
  if (min != null) return `≥ ${min} t`;
  if (max != null) return `≤ ${max} t`;
  return null;
}

interface Chip {
  /** Stable key for React + the "remove" reset patch. */
  key: keyof ActorsQuery | 'capacity';
  label: string;
  /** Fields cleared when this chip is removed. */
  clear: Partial<ActorsQuery>;
}

function buildChips(f: ActorsQuery): Chip[] {
  const chips: Chip[] = [];
  if (f.crop) chips.push({ key: 'crop', label: `Crop: ${cropLabel(f.crop)}`, clear: { crop: undefined } });
  if (f.role) chips.push({ key: 'role', label: `Type: ${roleLabel(f.role)}`, clear: { role: undefined } });
  if (f.region) chips.push({ key: 'region', label: `Region: ${f.region}`, clear: { region: undefined } });
  if (f.district) chips.push({ key: 'district', label: `District: ${f.district}`, clear: { district: undefined } });
  if (f.search) chips.push({ key: 'search', label: `Search: ${f.search}`, clear: { search: undefined } });
  const cap = capacityLabel(f.capacityMin, f.capacityMax);
  if (cap) chips.push({ key: 'capacity', label: `Capacity: ${cap}`, clear: { capacityMin: undefined, capacityMax: undefined } });
  return chips;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ActiveFilterChips({ filters, onChange }: ActiveFilterChipsProps) {
  const chips = buildChips(filters);

  if (chips.length === 0) {
    return (
      <p className="text-xs text-muted">
        No filters applied — showing all consented actors.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
        Active:
      </span>

      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-fg"
        >
          {chip.label}
          <button
            type="button"
            onClick={() => onChange({ ...filters, ...chip.clear, page: 1 })}
            aria-label={`Remove filter ${chip.label}`}
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted transition-colors hover:bg-primary-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              />
            </svg>
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={() =>
          onChange({
            ...filters,
            crop: undefined,
            role: undefined,
            region: undefined,
            district: undefined,
            search: undefined,
            capacityMin: undefined,
            capacityMax: undefined,
            page: 1,
          })
        }
        className="ml-1 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
      >
        Clear all
      </button>
    </div>
  );
}
