// @sdd-spec admin/registration-review-queue (T-13)
'use client';

/**
 * RegistrationDetailPanel — the review screen's composed body (FR-10, FR-11
 * scenario 1; `design.md` §7.3).
 *
 * Composes, in `design.md` §7.3's order:
 *   1. Header — the reference code (FR-10 scenario 1's "must show the
 *      reference code, so the reviewer can quote it in any out-of-band
 *      contact") plus a status badge.
 *   2. `DuplicateWarningCard` — read-only here (FR-11 scenario 1). Per-
 *      candidate dismissal is T-14's wiring into that same file.
 *   3. The submitted-details table — every payload field EXCEPT
 *      `gpsLatitude`/`gpsLongitude` (which the location card renders as raw
 *      coordinates), with `contactPerson` and `otherCrops` explicitly
 *      marked as review context that will not be published (see
 *      `REVIEW_CONTEXT_FIELDS` below — the human half of DC-23).
 *   4. The location card — raw GPS coordinates and an OpenStreetMap link
 *      (D-5 excludes GPS/district consistency validation; this is a raw
 *      display only).
 *   5. `ConsentRecordCard`, `ActivityTrail`.
 *
 * The decision panel (approve/reject) is T-14's addition to this file — not
 * built here (D-4: no payload editing; T-13 is display-only).
 *
 * Tokens only; no hardcoded colours/geometry (NFR-6).
 */

import type { AdminRegistrationDetail, AdminRegistrationPayload } from '@/lib/api/registrations-admin';
import { roleLabel, type TraderType } from '@/lib/content/roles';
import { CROPS } from '@/lib/content/crops';

import { DuplicateWarningCard } from './DuplicateWarningCard';
import { ConsentRecordCard } from './ConsentRecordCard';
import { ActivityTrail } from './ActivityTrail';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The two payload fields with no `Actor` column (FR-12's projection table —
 * `contactPerson` -> nothing, `otherCrops` -> nothing). FR-10 scenario 1
 * requires them shown but explicitly marked as review context that will
 * not be published, so a reviewer is not misled into thinking they will
 * appear on the public profile — this set is the ONE place that marking is
 * decided, so the two fields cannot drift apart between the table rows and
 * the badge.
 *
 * **This is the human half of DC-23.** Removing either key from this set
 * removes the marking from that field's row without touching the row
 * itself — the specific mutation the falsifying test proves reddens.
 */
const REVIEW_CONTEXT_FIELDS: ReadonlySet<keyof AdminRegistrationPayload> = new Set([
  'contactPerson',
  'otherCrops',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusLabel(status: AdminRegistrationDetail['status']): string {
  switch (status) {
    case 'PENDING_REVIEW':
      return 'Pending review';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
    case 'AWAITING_APPLICANT':
      return 'Awaiting applicant';
    case 'WITHDRAWN':
      return 'Withdrawn';
    default:
      return status;
  }
}

function statusBadgeClasses(status: AdminRegistrationDetail['status']): string {
  switch (status) {
    case 'APPROVED':
      return 'bg-highlight-tint text-success';
    case 'REJECTED':
      return 'bg-danger-soft text-danger';
    default:
      return 'bg-border text-muted';
  }
}

function cropLabel(slug: string): string {
  return CROPS.find((c) => c.slug === slug)?.name ?? slug;
}

function formatValue(value: string | number | null): string {
  if (value === null) return '—';
  return String(value);
}

/** One row of the submitted-details table. */
interface PayloadFieldRow {
  key: keyof AdminRegistrationPayload;
  label: string;
  value: string;
}

function buildPayloadRows(detail: AdminRegistrationDetail): PayloadFieldRow[] {
  const { payload } = detail;
  return [
    { key: 'traderName', label: 'Trader name', value: formatValue(payload.traderName) },
    {
      key: 'traderType',
      label: 'Trader type',
      value: roleLabel(payload.traderType as TraderType),
    },
    { key: 'contactPerson', label: 'Contact person', value: formatValue(payload.contactPerson) },
    { key: 'position', label: 'Position', value: formatValue(payload.position) },
    { key: 'district', label: 'District', value: formatValue(payload.district) },
    { key: 'marketLocation', label: 'Market location', value: formatValue(payload.marketLocation) },
    { key: 'sex', label: 'Sex', value: formatValue(payload.sex) },
    { key: 'region', label: 'Region', value: formatValue(payload.region) },
    {
      key: 'crops',
      label: 'Crops',
      value: payload.crops.length > 0 ? payload.crops.map(cropLabel).join(', ') : '—',
    },
    { key: 'otherCrops', label: 'Other crops', value: formatValue(payload.otherCrops) },
    { key: 'capacityTons', label: 'Capacity (tons)', value: formatValue(payload.capacityTons) },
    { key: 'phone', label: 'Phone', value: formatValue(payload.phone) },
    // Not a payload field (Registration.submitterEmail) but part of what
    // was submitted, and it IS published (FR-12's projection table:
    // submitterEmail -> Actor.email -> yes) — not review context.
  ];
}

function mapUrl(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ReviewContextBadge() {
  return (
    <span
      className={[
        'ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        'bg-primary-soft text-primary',
      ].join(' ')}
    >
      Review context — will not be published
    </span>
  );
}

function SubmittedDetailsTable({ detail }: { detail: AdminRegistrationDetail }) {
  const rows = buildPayloadRows(detail);

  return (
    <section aria-labelledby="submitted-details-heading" className="rounded-md border border-border bg-surface p-4 shadow-sm">
      <h2 id="submitted-details-heading" className="text-sm font-semibold text-fg">
        Submitted details
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <caption className="sr-only">
            Every field submitted with this registration. Fields marked
            &quot;Review context — will not be published&quot; have no
            corresponding column on the public directory record and will
            never appear there.
          </caption>
          <tbody className="divide-y divide-border">
            <tr>
              <th scope="row" className="w-48 py-2 pr-4 text-left align-top text-xs font-medium uppercase tracking-wide text-muted">
                Email
              </th>
              <td className="py-2 text-fg">{detail.submitterEmail}</td>
            </tr>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" className="w-48 py-2 pr-4 text-left align-top text-xs font-medium uppercase tracking-wide text-muted">
                  {row.label}
                </th>
                <td className="py-2 text-fg">
                  {row.value}
                  {REVIEW_CONTEXT_FIELDS.has(row.key) && <ReviewContextBadge />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LocationCard({ payload }: { payload: AdminRegistrationPayload }) {
  const hasCoordinates = payload.gpsLatitude !== null && payload.gpsLongitude !== null;

  return (
    <section aria-labelledby="location-heading" className="rounded-md border border-border bg-surface p-4 shadow-sm">
      <h2 id="location-heading" className="text-sm font-semibold text-fg">
        Location
      </h2>
      {hasCoordinates ? (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted">Latitude</dt>
              <dd className="mt-0.5 font-medium text-fg">{payload.gpsLatitude}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted">Longitude</dt>
              <dd className="mt-0.5 font-medium text-fg">{payload.gpsLongitude}</dd>
            </div>
          </dl>
          <a
            href={mapUrl(payload.gpsLatitude as number, payload.gpsLongitude as number)}
            target="_blank"
            rel="noopener noreferrer"
            className={[
              'mt-3 inline-flex items-center text-sm font-medium text-primary',
              'hover:text-primary-hover',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded-sm',
            ].join(' ')}
          >
            View on map
          </a>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted">No coordinates submitted.</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegistrationDetailPanelProps {
  detail: AdminRegistrationDetail;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RegistrationDetailPanel({ detail }: RegistrationDetailPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Registration</p>
          <h1 className="font-display text-2xl font-extrabold text-fg">{detail.reference}</h1>
        </div>
        <span
          className={[
            'inline-flex items-center self-start rounded-full px-2.5 py-1 text-xs font-medium',
            statusBadgeClasses(detail.status),
          ].join(' ')}
        >
          {statusLabel(detail.status)}
        </span>
      </header>

      <DuplicateWarningCard candidates={detail.duplicateCandidates} />

      <SubmittedDetailsTable detail={detail} />

      <LocationCard payload={detail.payload} />

      <ConsentRecordCard consent={detail.consent} />

      <ActivityTrail events={detail.activityTrail} />
    </div>
  );
}
