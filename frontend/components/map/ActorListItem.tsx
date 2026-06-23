'use client';

// ActorListItem — one accessible, keyboard-operable list entry.
//
// FR-5: Clicking or pressing Enter calls `onSelect(actor.id)`, which updates
// `selectedActorId` on the page → map flies to and opens the actor's popup.
// NFR-3: Uses a <button> so it is natively keyboard-focusable. Sets
// `aria-current="true"` when selected, `aria-pressed` signals selection state.
// NFR-4: Token-driven classes only — no raw hex.
//
// Actors without GPS (gps == null) are still shown in the list (FR-2) but
// display a small "List only — no map location" hint since they cannot be
// plotted (clicking them still sets selectedActorId; the map ignores IDs
// with no coordinates).

import type { PublicActor } from '@/lib/api/actors';
import RoleBadge from './RoleBadge';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ActorListItemProps {
  actor: PublicActor;
  /** Whether this item is currently selected (list ↔ map sync). */
  selected: boolean;
  /** Called with the actor's id when the item is activated. */
  onSelect: (id: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Single actor row inside ActorList.
 * Renders: traderName, RoleBadge, region · district, capacity, list-only hint
 * when gps is null. Token-driven; no PII (PublicActor has none).
 */
export default function ActorListItem({ actor, selected, onSelect }: ActorListItemProps) {
  const { id, traderName, region, district, traderType, gps, capacityTons } = actor;

  // Location string: "Region · District" or just "Region"
  const location = district ? `${region} · ${district}` : region;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(id)}
        // aria-current="true" marks the active/selected item for screen readers.
        aria-current={selected ? 'true' : undefined}
        // aria-pressed: toggled state communicates selection clearly.
        aria-pressed={selected}
        className={[
          // Base layout: full-width, left-aligned, vertical flex.
          'w-full rounded-md px-3 py-2.5 text-left transition-colors',
          'flex flex-col gap-1',
          // Focus ring (token, NFR-4 / NFR-3).
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          // Selection highlight vs. hover state.
          selected
            ? 'bg-surface-alt ring-1 ring-primary'
            : 'bg-surface hover:bg-surface-alt',
        ].join(' ')}
      >
        {/* ── Actor name ───────────────────────────────────────────────────── */}
        <span className="text-sm font-semibold text-fg leading-snug">
          {traderName}
        </span>

        {/* ── Role badge ────────────────────────────────────────────────────── */}
        <RoleBadge traderType={traderType} />

        {/* ── Location ─────────────────────────────────────────────────────── */}
        <span className="text-xs text-muted">{location}</span>

        {/* ── Capacity (when available) ─────────────────────────────────────── */}
        {capacityTons != null && (
          <span className="text-xs text-muted">
            Capacity: {capacityTons} t
          </span>
        )}

        {/* ── List-only hint for actors without GPS (FR-2) ─────────────────── */}
        {gps == null && (
          <span
            className="mt-0.5 inline-flex items-center gap-1 rounded-sm bg-border px-1.5 py-0.5 text-xs text-muted"
            aria-label="This actor has no map location and appears in the list only"
          >
            {/* Icon placeholder — purely decorative */}
            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-sm bg-muted" />
            List only — no map location
          </span>
        )}
      </button>
    </li>
  );
}
