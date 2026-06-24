// ProfileCapacity — operational capacity section (FR-5, design.md §5).
// Server-renderable: no hooks, no 'use client'.
// Token-driven: no raw hex (NFR-4).
// Graceful fallback: renders "—" when capacityTons is null/undefined (FR-8).

import type { PublicActor } from '@/lib/api/actors';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ProfileCapacityProps {
  /** PII-safe actor shape — no phone/email (NFR-1). */
  actor: PublicActor;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Operational capacity panel (FR-5).
 * Shows capacity in metric tonnes; falls back to "—" when absent (FR-8).
 */
export default function ProfileCapacity({ actor }: ProfileCapacityProps) {
  const capacityDisplay =
    actor.capacityTons != null
      ? `${actor.capacityTons.toLocaleString()} t`
      : '—';

  return (
    <section aria-labelledby="profile-capacity-heading" className="mb-6">
      <h2
        id="profile-capacity-heading"
        className="mb-3 text-base font-semibold text-fg"
      >
        Operational Capacity
      </h2>

      <div className="inline-flex items-baseline gap-1.5 rounded-md border border-border bg-surface-alt px-4 py-3">
        <span className="text-2xl font-bold tabular-nums text-fg">
          {capacityDisplay}
        </span>
        {actor.capacityTons != null && (
          <span className="text-sm text-muted">metric tonnes</span>
        )}
      </div>
    </section>
  );
}
