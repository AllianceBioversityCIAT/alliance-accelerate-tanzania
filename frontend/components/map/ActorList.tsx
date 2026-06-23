'use client';

// ActorList — accessible list of actors, the non-map equivalent of the map.
//
// FR-5: Renders ALL actors (with and without GPS) in a <ul> list.
// NFR-3: <ul role="list"> with aria-label documents this as the accessible
// map fallback. Each item is handled by ActorListItem.
// NFR-4: Token-driven classes only.

import type { PublicActor } from '@/lib/api/actors';
import ActorListItem from './ActorListItem';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ActorListProps {
  actors: PublicActor[];
  /** Currently selected actor id — drives highlight + aria-current. */
  selectedActorId: string | null;
  /** Called with an actor id when the user selects a list item. */
  onSelectActor: (id: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Scrollable, accessible list of PublicActor items.
 * This is the documented non-map equivalent of the Leaflet map (NFR-3, FR-5).
 * All actors — including those without GPS — appear here.
 */
export default function ActorList({
  actors,
  selectedActorId,
  onSelectActor,
}: ActorListProps) {
  return (
    // role="list" reinforces list semantics (some CSS resets strip them from <ul>).
    // aria-label makes the purpose clear to assistive technology as the non-map
    // fallback.
    <ul
      role="list"
      aria-label="Actor list — accessible alternative to the map"
      className="flex flex-col gap-1"
    >
      {actors.map((actor) => (
        <ActorListItem
          key={actor.id}
          actor={actor}
          selected={actor.id === selectedActorId}
          onSelect={onSelectActor}
        />
      ))}
    </ul>
  );
}
