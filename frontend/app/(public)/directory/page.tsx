// /directory page — public Actor Directory route (FR-1, NFR-5).
//
// Minimal page: delegates all rendering to <DirectoryView> (client component).
// No SSR/ISR/route handlers — static-export safe (NFR-5).
//
// T-4 will extend DirectoryView with URL-synced search/filter/pagination.
// This page stays minimal and does not need to change for those additions.

import DirectoryView from '@/components/directory/DirectoryView';

export default function DirectoryPage() {
  return <DirectoryView />;
}
