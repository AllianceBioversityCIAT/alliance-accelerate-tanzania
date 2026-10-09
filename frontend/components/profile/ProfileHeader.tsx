// ProfileHeader — name and actor types (FR-5, design.md §5).
// Server-renderable: no hooks, no 'use client'. Pure presentational.
// Token-driven: no raw hex (NFR-4). Uses existing RoleBadge + §7 utilities.

import type { PublicActor } from '@/lib/api/actors';
import { RoleBadges } from '@/components/map/RoleBadge';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ProfileHeaderProps {
  /** PII-safe actor shape — no phone/email (NFR-1). */
  actor: PublicActor;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Renders the top section of the Actor Profile:
 *   • Actor name (traderName) as the page heading
 *   • Main type and other types as chips (RoleBadges, labelled layout)
 * Region and district are shown once, in the Location section below.
 *
 * PII contract: PublicActor carries no phone/email — this component MUST NOT
 * reference or render those fields.
 */
export default function ProfileHeader({ actor }: ProfileHeaderProps) {
  return (
    <header className="mb-6">
      {/* Actor name — h1 for page semantics; responsive size */}
      <h1 className="mb-6 text-2xl font-extrabold text-fg leading-tight sm:text-3xl">
        {actor.traderName}
      </h1>

      {/* Role badge */}
      <div>
        <RoleBadges
          traderType={actor.traderType}
          additionalTraderTypes={actor.additionalTraderTypes}
          layout="labelled"
        />
      </div>
    </header>
  );
}
