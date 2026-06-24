// ProfileHeader — name, RoleBadge, region · district (FR-5, design.md §5).
// Server-renderable: no hooks, no 'use client'. Pure presentational.
// Token-driven: no raw hex (NFR-4). Uses existing RoleBadge + §7 utilities.

import type { PublicActor } from '@/lib/api/actors';
import RoleBadge from '@/components/map/RoleBadge';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ProfileHeaderProps {
  /** PII-safe actor shape — no phone/email (NFR-1). */
  actor: PublicActor;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Renders the top section of the Actor Profile:
 *   • Actor name (traderName) as the page heading
 *   • RoleBadge (role swatch + label)
 *   • Region · District location summary (district omitted when absent)
 *
 * PII contract: PublicActor carries no phone/email — this component MUST NOT
 * reference or render those fields.
 */
export default function ProfileHeader({ actor }: ProfileHeaderProps) {
  return (
    <header className="mb-6">
      {/* Actor name — h1 for page semantics; responsive size */}
      <h1 className="mb-2 text-2xl font-bold text-fg leading-tight sm:text-3xl">
        {actor.traderName}
      </h1>

      {/* Role badge */}
      <div className="mb-3">
        <RoleBadge traderType={actor.traderType} />
      </div>

      {/* Region · District */}
      <p className="text-sm text-muted">
        {actor.region}
        {actor.district ? <> &middot; {actor.district}</> : null}
      </p>
    </header>
  );
}
