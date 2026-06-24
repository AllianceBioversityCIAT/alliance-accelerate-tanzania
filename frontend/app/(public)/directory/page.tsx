// /directory page — public Actor Directory route (FR-1, FR-2, FR-3, NFR-5).
//
// Static-export compliance (NFR-5 / design.md §5):
//   DirectoryView uses useSearchParams() which triggers a CSR bailout under
//   `output: 'export'`. Wrapping DirectoryView in <Suspense> satisfies the
//   Next.js static-export requirement and allows the build to succeed.
//   Mirrors the pattern established in frontend/app/(public)/profile/page.tsx.
//
// No SSR, no ISR, no route handlers — all data is client-fetched by
// DirectoryView → useActors → getActors (NFR-5 static export safe).

import { Suspense } from 'react';
import DirectoryView from '@/components/directory/DirectoryView';
import Skeleton from '@/components/ui/Skeleton';

// ── Suspense fallback ──────────────────────────────────────────────────────────

/**
 * Lightweight fallback shown while DirectoryView hydrates / suspends.
 * Uses Skeleton so it is token-driven and visually consistent with the
 * in-component loading state (NFR-4).
 */
function DirectoryFallback() {
  return (
    <div
      className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
      aria-label="Loading directory"
      aria-busy="true"
    >
      <Skeleton className="mb-2 h-8 w-48 rounded-md" />
      <Skeleton className="mb-6 h-4 w-80 rounded-sm" />
      <Skeleton className="mb-6 h-10 w-full rounded-md" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DirectoryPage() {
  return (
    /*
      Suspense boundary is REQUIRED here:
      DirectoryView calls useSearchParams() which triggers a static-export CSR
      bailout in Next.js. Without this boundary, `next build` fails under
      output: 'export'. See design.md §5 / §8.
    */
    <Suspense fallback={<DirectoryFallback />}>
      <DirectoryView />
    </Suspense>
  );
}
