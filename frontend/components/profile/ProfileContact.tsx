// ProfileContact — Contact and Profile detail sections (FR-1, FR-6, design.md §8).
// Server-renderable: no hooks, no 'use client'.
//
// Replaces RestrictedContactPanel (deleted, FR-6): for a GRANTED actor,
// consent now unlocks the full actor-supplied record (FR-1), so this renders
// the contact and profile fields directly instead of an always-locked panel.
//
// Two sections (design.md §8):
//   Contact — contact person, position, phone, email, market location.
//             These five are CONTACT_BLOCK_FIELDS: detail-only, never on the
//             list endpoint, map, dashboard, or CSV (FR-9).
//   Profile — sex, other crops.
//             These sit next to the Contact section in the UI but are NOT
//             CONTACT_BLOCK_FIELDS members — they ship on the list set and
//             the CSV too (A-1, requirements.md glossary). Do not
//             "harmonise" them into the Contact section's field set.
//
// Every row's label always renders; an absent value shows an em-dash (FR-6)
// — hiding empty rows was considered and rejected as not worth the
// complexity (proposal.md §5.3). Matches the existing district/capacityTons
// placeholder behavior (ProfileLocation, ProfileCapacity).
//
// Phone and email render as PLAIN TEXT, never `tel:`/`mailto:` (DD-7): an
// anchor puts contact data in an href, which is trivially harvested and
// offers a visitor nothing over selecting the text.
//
// Token-driven: no raw hex (NFR-4). Mimics ProfileLocation's structure and
// tokens verbatim: labelled <section>, <h2>, <dl> grid of bordered cards on
// bg-surface-alt with border-border.

import type { PublicActorDetail } from '@/lib/api/actors';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ProfileContactProps {
  /** Detail shape — includes the contact block (FR-1, DD-6). */
  actor: PublicActorDetail;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Contact and Profile detail sections (FR-6): the real contact and
 * commercial data for a GRANTED actor, replacing the always-locked panel.
 */
export default function ProfileContact({ actor }: ProfileContactProps) {
  return (
    <>
      {/* Contact — CONTACT_BLOCK_FIELDS, detail-only (FR-9) */}
      <section aria-labelledby="profile-contact-heading" className="mb-6">
        <h2
          id="profile-contact-heading"
          className="mb-3 text-base font-semibold text-fg"
        >
          Contact
        </h2>

        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-surface-alt px-4 py-3">
            <dt className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted">
              Contact Person
            </dt>
            <dd className="text-sm font-semibold text-fg">
              {actor.contactPerson ?? '—'}
            </dd>
          </div>

          <div className="rounded-md border border-border bg-surface-alt px-4 py-3">
            <dt className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted">
              Position
            </dt>
            <dd className="text-sm font-semibold text-fg">
              {actor.position ?? '—'}
            </dd>
          </div>

          <div className="rounded-md border border-border bg-surface-alt px-4 py-3">
            <dt className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted">
              Phone
            </dt>
            {/* Plain text — never a tel: anchor (DD-7) */}
            <dd className="text-sm font-semibold text-fg">
              {actor.phone ?? '—'}
            </dd>
          </div>

          <div className="rounded-md border border-border bg-surface-alt px-4 py-3">
            <dt className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted">
              Email
            </dt>
            {/* Plain text — never a mailto: anchor (DD-7) */}
            <dd className="text-sm font-semibold text-fg">
              {actor.email ?? '—'}
            </dd>
          </div>

          <div className="rounded-md border border-border bg-surface-alt px-4 py-3 sm:col-span-2">
            <dt className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted">
              Market Location
            </dt>
            <dd className="text-sm font-semibold text-fg">
              {actor.marketLocation ?? '—'}
            </dd>
          </div>
        </dl>
      </section>

      {/* Profile — sex, other crops: list-set members, NOT the contact block */}
      <section aria-labelledby="profile-details-heading" className="mb-6">
        <h2
          id="profile-details-heading"
          className="mb-3 text-base font-semibold text-fg"
        >
          Profile
        </h2>

        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-surface-alt px-4 py-3">
            <dt className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted">
              Sex
            </dt>
            <dd className="text-sm font-semibold text-fg">
              {actor.sex ?? '—'}
            </dd>
          </div>

          <div className="rounded-md border border-border bg-surface-alt px-4 py-3">
            <dt className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted">
              Other Crops
            </dt>
            <dd className="text-sm font-semibold text-fg">
              {actor.otherCrops ?? '—'}
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}
