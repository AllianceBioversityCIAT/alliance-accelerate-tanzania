// ProfileLocation — geographic detail section (FR-5, design.md §5, OQ-3).
// Server-renderable: no hooks, no 'use client'.
//
// Shows region, district, and GPS coordinates as TEXT (OQ-3 / requirements.md OQ-4):
// Phase-1 decision is textual coordinates only — no Leaflet on the profile bundle.
// Token-driven: no raw hex (NFR-4).

import type { PublicActor } from '@/lib/api/actors';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ProfileLocationProps {
  /** PII-safe actor shape — no phone/email (NFR-1). */
  actor: PublicActor;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a GPS coordinate pair as a compact textual string. */
function formatGps(lat: number, long: number): string {
  return `${lat.toFixed(4)}° N, ${long.toFixed(4)}° E`;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Location detail block: region, district (when present), and GPS
 * coordinates as text (no Leaflet — Phase-1 decision, design.md §8 OQ-3).
 */
export default function ProfileLocation({ actor }: ProfileLocationProps) {
  return (
    <section aria-labelledby="profile-location-heading" className="mb-6">
      <h2
        id="profile-location-heading"
        className="mb-3 text-base font-semibold text-fg"
      >
        Location
      </h2>

      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {/* Region */}
        <div className="rounded-md border border-border bg-surface-alt px-4 py-3">
          <dt className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted">
            Region
          </dt>
          <dd className="text-sm font-semibold text-fg">{actor.region}</dd>
        </div>

        {/* District */}
        <div className="rounded-md border border-border bg-surface-alt px-4 py-3">
          <dt className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted">
            District
          </dt>
          <dd className="text-sm font-semibold text-fg">
            {actor.district ?? '—'}
          </dd>
        </div>

        {/* GPS coordinates — textual, Phase-1 (OQ-3) */}
        {actor.gps && (
          <div className="rounded-md border border-border bg-surface-alt px-4 py-3 sm:col-span-2">
            <dt className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted">
              Coordinates
            </dt>
            <dd className="font-mono text-sm text-fg">
              {formatGps(actor.gps.lat, actor.gps.long)}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
