// /profile route — Actor Profile page (FR-5, design.md §5, NFR-5).
//
// Static-export compliance (NFR-5 / design.md §8 ADR):
//   ProfileView uses useSearchParams() which triggers a CSR bailout under
//   `output: 'export'`. Wrapping ProfileView in <Suspense> satisfies the
//   Next.js static-export requirement and allows the build to succeed.
//
// Route shape: /profile?id=<actorId>
//   A query-param client page (not a [id] dynamic segment) so any actor id
//   resolves at runtime without build-time API coupling (design.md §8).
//
// No SSR, no route handlers, no getServerSideProps — all data is client-fetched
// by ProfileView → useActor → getActor (NFR-5 static export safe).

import { Suspense } from 'react';
import ProfileView from '@/components/profile/ProfileView';
import Skeleton from '@/components/ui/Skeleton';

// ── Suspense fallback ─────────────────────────────────────────────────────────

/**
 * Lightweight fallback shown while ProfileView hydrates / suspends.
 * Uses Skeleton so it's token-driven and matches the in-component loading state.
 */
function ProfileFallback() {
  return (
    <div aria-label="Loading profile" aria-busy="true">
      <Skeleton className="mb-2 h-8 w-2/3 rounded-md" />
      <Skeleton className="mb-3 h-5 w-28 rounded-full" />
      <Skeleton className="mb-6 h-4 w-40 rounded-sm" />
      <Skeleton className="mb-6 h-24 w-full rounded-md" />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  return (
    // Container matches the public shell convention (max-w-3xl, centred, padded).
    // max-w-3xl keeps profile content readable without a sidebar (NFR-6).
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      {/*
        Suspense boundary is REQUIRED here:
        ProfileView calls useSearchParams() which triggers a static-export CSR
        bailout in Next.js. Without this boundary, `next build` fails under
        output: 'export'. See design.md §8 ADR.
      */}
      <Suspense fallback={<ProfileFallback />}>
        <ProfileView />
      </Suspense>
    </div>
  );
}
