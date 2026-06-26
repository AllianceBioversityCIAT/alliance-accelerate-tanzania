'use client';

/**
 * DownloadViewButton — T-12, FR-9, NFR-1, design.md §5.7/§6.
 * Spec: dashboard/discovery-dashboard.
 *
 * Client component: calls buildDashboardCsv on click, creates a Blob, and
 * triggers a client-side download via a temporary object URL + <a> element.
 * The object URL is revoked immediately after click (no memory leaks).
 *
 * PII gate (NFR-1): delegates to buildDashboardCsv which uses an explicit
 * allowlist — this component never references phone or email.
 *
 * Token-driven (NFR-4): no hardcoded hex — uses the Button primitive's
 * secondary variant (border/surface tokens).
 *
 * Accessibility:
 *   - type="button" (via Button primitive) prevents accidental form submission.
 *   - aria-label="Download this view" provides an unambiguous accessible name.
 *   - The icon has aria-hidden so screen readers see only the text label.
 *
 * Usage:
 *   <DownloadViewButton actors={actors} kpis={kpis} />
 *   <DownloadViewButton actors={actors} kpis={kpis} filenameBase="my-export" />
 */

import { buildDashboardCsv } from '@/lib/dashboard/csv';
import type { PublicActor } from '@/lib/api/actors';
import type { DashboardKpis } from '@/lib/dashboard/aggregate';
import Button from '@/components/ui/Button';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DownloadViewButtonProps {
  /** PII-safe actor list (no phone/email on this type — NFR-1). */
  actors: PublicActor[];
  /** KPI aggregate for the summary section of the exported CSV. */
  kpis: DashboardKpis;
  /**
   * Base name for the downloaded file (without .csv extension).
   * Defaults to "accelerate-tz-actors".
   */
  filenameBase?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build an ISO date suffix in YYYY-MM-DD format for the filename. */
function isoDateSuffix(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Token-styled download button for the Discovery Dashboard.
 *
 * On click:
 *   1. Calls buildDashboardCsv to produce a UTF-8 PII-free CSV string.
 *   2. Wraps it in a Blob (text/csv;charset=utf-8).
 *   3. Creates a temporary object URL, attaches to a transient <a>, clicks it,
 *      and immediately revokes the object URL.
 *   4. No server route, no SSR, no Next.js API handler required.
 */
export default function DownloadViewButton({
  actors,
  kpis,
  filenameBase = 'accelerate-tz-actors',
}: DownloadViewButtonProps) {
  function handleDownload() {
    // 1. Build PII-free CSV (allowlist enforced inside buildDashboardCsv).
    const csv = buildDashboardCsv({ actors, kpis });

    // 2. Create a UTF-8 Blob.
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });

    // 3. Create a temporary object URL.
    const url = URL.createObjectURL(blob);

    // 4. Attach to a transient <a> and trigger the download.
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${filenameBase}-${isoDateSuffix()}.csv`;
    // The anchor must be in the document for Firefox compatibility.
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();

    // 5. Clean up: remove the anchor and revoke the object URL to free memory.
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  return (
    <Button
      variant="secondary"
      onClick={handleDownload}
      aria-label="Download this view"
    >
      {/* Download icon — decorative, aria-hidden so screen readers skip it */}
      <svg
        aria-hidden="true"
        focusable="false"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M8 1v9m0 0L5 7m3 3 3-3M2 12v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Download this view
    </Button>
  );
}
