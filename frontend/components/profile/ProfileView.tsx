'use client';

// ProfileView — orchestrates the Actor Profile page body (FR-5, FR-6, FR-8).
//
// 'use client' required: uses useSearchParams() (browser-only) and the
// useActor() hook (data fetch).
//
// Static-export requirement (NFR-5 / design.md §8 ADR):
//   This component is wrapped in <Suspense> inside profile/page.tsx so the
//   useSearchParams() call does not break the static export build (Next.js
//   requires a Suspense boundary around any component using useSearchParams
//   under output: 'export').
//
// States handled (FR-8):
//   loading     → skeleton placeholders
//   not-found   → id missing from URL OR data null (404 / not consented)
//   error       → distinct from not-found (useActor sets error when data is null,
//                 but we treat both null-data cases as "not found" since the
//                 backend contract: 404 for missing/non-consented is indistinguishable)
//   success     → renders all profile sections + RestrictedContactPanel
//
// PII contract (NFR-1): useActor returns a PublicActor which has no phone/email.
// RestrictedContactPanel is ALWAYS rendered for the Public role (FR-6).

import { useSearchParams } from 'next/navigation';
import { useActor } from '@/lib/api/useActor';
import Skeleton from '@/components/ui/Skeleton';
import ProfileHeader from './ProfileHeader';
import ProfileLocation from './ProfileLocation';
import ProfileMarketActivity from './ProfileMarketActivity';
import ProfileCapacity from './ProfileCapacity';
import RestrictedContactPanel from './RestrictedContactPanel';

// ── Loading skeleton ───────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading profile">
      {/* Header skeleton */}
      <div className="mb-6">
        <Skeleton className="mb-2 h-8 w-2/3 rounded-md" />
        <Skeleton className="mb-3 h-5 w-28 rounded-full" />
        <Skeleton className="h-4 w-40 rounded-sm" />
      </div>
      {/* Section skeleton blocks */}
      <Skeleton className="mb-6 h-24 w-full rounded-md" />
      <Skeleton className="mb-6 h-16 w-full rounded-md" />
      <Skeleton className="mb-6 h-12 w-48 rounded-md" />
      <Skeleton className="mb-6 h-28 w-full rounded-md" />
    </div>
  );
}

// ── Not-found state ────────────────────────────────────────────────────────────

function ProfileNotFound() {
  return (
    <div
      role="alert"
      className="rounded-md border border-border bg-surface-alt px-6 py-10 text-center"
    >
      <p className="mb-1 text-lg font-semibold text-fg">Profile not available</p>
      <p className="text-sm text-muted">
        This actor profile could not be found or is not yet publicly available.
        It may be pending consent authorization.
      </p>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Profile page body — reads `?id=` from the URL, fetches actor data, and
 * renders all profile sections. Must be wrapped in <Suspense> in page.tsx
 * (NFR-5 / design.md §8 ADR).
 */
export default function ProfileView() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');

  // Missing id in URL → treat as not-found immediately (FR-8)
  const { data, loading, error } = useActor(id ?? '');

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading && id) {
    return <ProfileSkeleton />;
  }

  // ── Not-found state: no id in URL, data null (404), or error ──────────────
  // Per spec (FR-5 AC): "id absent OR data null → not-found".
  // The backend makes non-consented and missing actors indistinguishable (both 404).
  if (!id || error || data === null) {
    return <ProfileNotFound />;
  }

  // ── Success state ──────────────────────────────────────────────────────────
  return (
    <article aria-label={`Profile: ${data.traderName}`}>
      <ProfileHeader actor={data} />
      <ProfileLocation actor={data} />
      <ProfileMarketActivity actor={data} />
      <ProfileCapacity actor={data} />
      {/* Always-locked for Public role (FR-6, NFR-1) */}
      <RestrictedContactPanel />
    </article>
  );
}
