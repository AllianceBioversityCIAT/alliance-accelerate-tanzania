'use client';

// CapacityRangeControl — min/max numeric inputs for capacity filtering.
//
// FR-3: Allows filtering actors by capacity range in tons.
// NFR-4: Token-driven classes only — no raw hex or hardcoded geometry.
// A11y: Every <input> has an associated <label> via htmlFor/id.
//
// Empty input → field emitted as undefined.
// Negative or NaN values are treated as undefined (ignored).
// "Clear" button resets both fields to undefined via onChange.

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CapacityRange {
  capacityMin?: number;
  capacityMax?: number;
}

export interface CapacityRangeControlProps {
  /** Current capacity range — value-controlled from parent. */
  value: CapacityRange;
  /** Called with the next merged range whenever either input changes or Clear is pressed. */
  onChange: (next: CapacityRange) => void;
}

// ── Shared style constants ────────────────────────────────────────────────────

const LABEL_CLASS =
  'block text-xs font-medium uppercase tracking-wide text-muted mb-1';

const INPUT_CLASS = [
  'w-full rounded-md border border-border bg-surface px-2.5 py-1.5',
  'text-sm text-fg shadow-sm',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');

const CLEAR_CLASS = [
  'text-xs underline text-muted hover:text-fg',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded',
].join(' ');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parses a raw string input value into a valid positive number or undefined.
 * Empty string, NaN, or negative values all return undefined.
 */
function parseCapacity(raw: string): number | undefined {
  if (raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Two labeled numeric inputs for filtering by min and max capacity in tons.
 * Emits partial CapacityRange on every change; empty or invalid → undefined.
 * "Clear" button resets both to undefined.
 *
 * Usage:
 *   <CapacityRangeControl
 *     value={{ capacityMin: filters.capacityMin, capacityMax: filters.capacityMax }}
 *     onChange={({ capacityMin, capacityMax }) =>
 *       setFilters(prev => ({ ...prev, capacityMin, capacityMax }))
 *     }
 *   />
 */
export default function CapacityRangeControl({
  value,
  onChange,
}: CapacityRangeControlProps) {
  const { capacityMin, capacityMax } = value;

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleMin(e: React.ChangeEvent<HTMLInputElement>) {
    onChange({
      capacityMin: parseCapacity(e.target.value),
      capacityMax,
    });
  }

  function handleMax(e: React.ChangeEvent<HTMLInputElement>) {
    onChange({
      capacityMin,
      capacityMax: parseCapacity(e.target.value),
    });
  }

  function handleClear() {
    onChange({ capacityMin: undefined, capacityMax: undefined });
  }

  const hasClear = capacityMin !== undefined || capacityMax !== undefined;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div role="group" aria-label="Capacity range filter">
      {/* ── Header row with optional Clear ──────────────────────────────── */}
      <div className="flex items-center justify-between mb-1">
        <span className={LABEL_CLASS} aria-hidden="true">
          Capacity (t)
        </span>
        {hasClear && (
          <button
            type="button"
            onClick={handleClear}
            className={CLEAR_CLASS}
            aria-label="Clear capacity range"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Min / Max side-by-side ──────────────────────────────────────── */}
      <div className="flex gap-2">
        {/* Min */}
        <div className="flex-1">
          <label htmlFor="capacity-min" className={LABEL_CLASS}>
            Min capacity (t)
          </label>
          <input
            id="capacity-min"
            type="number"
            min={0}
            placeholder="Min"
            value={capacityMin ?? ''}
            onChange={handleMin}
            className={INPUT_CLASS}
            aria-label="Minimum capacity in tons"
          />
        </div>

        {/* Max */}
        <div className="flex-1">
          <label htmlFor="capacity-max" className={LABEL_CLASS}>
            Max capacity (t)
          </label>
          <input
            id="capacity-max"
            type="number"
            min={0}
            placeholder="Max"
            value={capacityMax ?? ''}
            onChange={handleMax}
            className={INPUT_CLASS}
            aria-label="Maximum capacity in tons"
          />
        </div>
      </div>
    </div>
  );
}
