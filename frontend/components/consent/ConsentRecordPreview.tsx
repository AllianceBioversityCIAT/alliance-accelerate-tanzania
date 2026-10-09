/**
 * ConsentRecordPreview — "Information that will be published"
 * (actors/consent-intake/consent-request-email T-8, FR-9, DD-11, design.md §7.3).
 *
 * A read-only `<dl>` over the public-detail keys of the record the API
 * returned. The API already projects `toPublicDetail` (never any
 * `NEVER_PUBLIC_FIELDS`), so this component can only ever show what the
 * public profile would — and it offers no input: the page MUST NOT let the
 * respondent edit the actor's data (FR-9 BUT clause). Empty values render an
 * em-dash (design.md §1 principle 3); GPS is shown as it would be after accept.
 */

import type { PublicActorDetail } from '@/lib/api/actors';
import { formatHemisphericPair } from '@/lib/geo/coordinates';
import { CROPS } from '@/lib/content/crops';
import { additionalRoleLabels, roleLabel } from '@/lib/content/roles';
import { CONSENT_PAGE_COPY } from '@/lib/content/consent-requests';

const DASH = '—';

function cropList(crops: PublicActorDetail['crops']): string {
  const names = crops.map((slug) => CROPS.find((c) => c.slug === slug)?.name ?? slug);
  return names.length > 0 ? names.join(', ') : DASH;
}

function formatGps(gps: PublicActorDetail['gps']): string {
  return gps ? formatHemisphericPair(gps.lat, gps.long) : DASH;
}

export default function ConsentRecordPreview({ record }: Readonly<{ record: PublicActorDetail }>) {
  const rows: ReadonlyArray<{ label: string; value: string; mono?: boolean }> = [
    { label: 'Organization', value: record.traderName || DASH },
    { label: 'Type', value: record.traderType ? roleLabel(record.traderType) : DASH },
    {
      label: 'Other types',
      value: additionalRoleLabels(record.additionalTraderTypes).join(', ') || DASH,
    },
    { label: 'Region', value: record.region || DASH },
    { label: 'District', value: record.district || DASH },
    {
      label: 'Annual capacity',
      value: record.capacityTons != null ? `${record.capacityTons.toLocaleString()} t` : DASH,
    },
    { label: 'Crops', value: cropList(record.crops) },
    { label: 'Other crops', value: record.otherCrops || DASH },
    { label: 'Coordinates', value: formatGps(record.gps), mono: true },
    { label: 'Contact person', value: record.contactPerson || DASH },
    { label: 'Position', value: record.position || DASH },
    { label: 'Sex', value: record.sex || DASH },
    { label: 'Telephone', value: record.phone || DASH },
    { label: 'Email', value: record.email || DASH },
    { label: 'Market location', value: record.marketLocation || DASH },
  ];

  return (
    <section aria-labelledby="consent-preview-heading">
      <h2 id="consent-preview-heading" className="text-base font-semibold text-fg">
        {CONSENT_PAGE_COPY.previewHeading}
      </h2>
      <p className="mt-1 text-sm text-muted">{CONSENT_PAGE_COPY.previewNote}</p>

      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="min-w-0 rounded-md border border-border bg-surface-alt px-4 py-3"
          >
            <dt className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted">
              {row.label}
            </dt>
            <dd
              className={[
                'break-words text-sm font-semibold text-fg',
                row.mono ? 'font-mono' : '',
              ].join(' ')}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
