// @sdd-spec admin/registration-review-queue (T-13, T-14)
'use client';

/**
 * RegistrationDetailPanel — the review screen's composed body (FR-10, FR-11,
 * FR-12, FR-13; `design.md` §7.3-§7.4).
 *
 * Composes, in `design.md` §7.3's order:
 *   1. Header — the reference code (FR-10 scenario 1's "must show the
 *      reference code, so the reviewer can quote it in any out-of-band
 *      contact") plus a status badge.
 *   2. An `aria-live` result banner (T-14) for the outcome of the latest
 *      approve/reject/dismiss action.
 *   3. `DuplicateWarningCard`, wired for per-candidate dismissal (T-14;
 *      FR-11 scenario 1/2 — T-13 built the read-only naming, T-14 wires the
 *      action).
 *   4. The submitted-details table — every payload field EXCEPT
 *      `gpsLatitude`/`gpsLongitude` (which the location card renders as raw
 *      coordinates), with `contactPerson` and `otherCrops` explicitly
 *      marked as review context that will not be published (see
 *      `REVIEW_CONTEXT_FIELDS` below — the human half of DC-23).
 *   5. The location card — raw GPS coordinates and an OpenStreetMap link
 *      (D-5 excludes GPS/district consistency validation; this is a raw
 *      display only).
 *   6. The decision panel (T-14) — approve behind `AcknowledgeDialog`,
 *      reject behind `RejectDialog`. Hidden once the registration is no
 *      longer `PENDING_REVIEW` (FR-12/FR-13's double-adjudication refusal
 *      is a `409` server-side; this keeps the UI from inviting a request
 *      that can only fail).
 *   7. `ConsentRecordCard`, `ActivityTrail`.
 *
 * No payload editing (D-4).
 *
 * **T-14's mutation wiring lives here, not in the page.** `approve
 * Registration`/`rejectRegistration`/`dismissDuplicateCandidate` all return
 * MINIMAL envelopes (`registrations-admin.ts`'s doc comments) — the
 * refreshed status, activity trail, and duplicate-candidate list arrive on
 * the next `GET /:id`, not the mutation response. `onRefresh` is what the
 * caller (`app/(admin)/admin/registrations/review/page.tsx`) uses to
 * re-fetch and hand this panel a new `detail` after any successful action.
 *
 * Tokens only; no hardcoded colours/geometry (NFR-6). `danger` styles the
 * reject path only — never the approve/publish path (NFR-6, `design.md`
 * §7.4).
 */

import { useCallback, useState } from 'react';

import type {
  AdminRegistrationDetail,
  AdminRegistrationPayload,
} from '@/lib/api/registrations-admin';
import {
  approveRegistration,
  rejectRegistration,
  dismissDuplicateCandidate,
} from '@/lib/api/registrations-admin';
import { ApiError, AuthFailureError } from '@/lib/api/client';
import { roleLabel, type TraderType } from '@/lib/content/roles';
import { CROPS } from '@/lib/content/crops';
import {
  REGISTRATION_STATUS_LABEL,
  REGISTRATION_STATUS_BADGE_CLASSES,
} from '@/lib/content/registration-status';

import { DuplicateWarningCard } from './DuplicateWarningCard';
import { ConsentRecordCard } from './ConsentRecordCard';
import { ActivityTrail } from './ActivityTrail';
import { AcknowledgeDialog } from './AcknowledgeDialog';
import { RejectDialog, type RejectDialogInput } from './RejectDialog';

// ---------------------------------------------------------------------------
// Constants — the approve gate (FR-12 scenario 3, design.md §7.4)
// ---------------------------------------------------------------------------

/**
 * MUST match `APPROVAL_ACKNOWLEDGEMENT_TEXT` server-side EXACTLY
 * (`RegistrationApproveInput.acknowledgement`'s doc comment in
 * `registrations-admin.ts`). The client gate below is UX only — T-8 owns
 * the server-side re-validation this text does NOT prove (disqualifying
 * note in T-14's brief).
 */
const APPROVAL_ACKNOWLEDGEMENT_TEXT = 'I confirm consent is on file';

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

// statusLabel/statusBadgeClasses moved to `@/lib/content/registration-status`
// (T-14, carried forward from T-13's review, A-78/A-79) — this file
// previously carried a byte-equivalent copy of `RegistrationsTable.tsx`'s
// functions of the same name.

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

/**
 * Hoisted to module scope (react-doctor `js-hoist-intl`) — `Intl.DateTimeFormat`
 * construction is comparatively expensive, and the format never varies
 * across calls, so building one instance per render/call is wasted work.
 */
const CONSENT_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/**
 * Formats `consent.acceptedAt` for the approve dialog body — a single,
 * narrow date-only rendering (no timezone designator needed here, unlike
 * `ConsentRecordCard.tsx`'s full timestamp, since this string exists only
 * to let the reviewer recognise WHICH consent record they are attesting
 * to, not to stand alone as the record of it — `ConsentRecordCard` remains
 * the one place that carries the exact, timezone-qualified attestation).
 */
function formatConsentDate(iso: string): string {
  try {
    return CONSENT_DATE_FORMATTER.format(new Date(iso));
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Decision panel (T-14) — approve / reject (design.md §7.4)
// ---------------------------------------------------------------------------

interface DecisionPanelProps {
  detail: AdminRegistrationDetail;
  onApproveClick: () => void;
  onRejectClick: () => void;
}

function DecisionPanel({ detail, onApproveClick, onRejectClick }: DecisionPanelProps) {
  if (detail.status !== 'PENDING_REVIEW') {
    return (
      <section aria-labelledby="decision-heading" className="rounded-md border border-border bg-surface p-4 shadow-sm">
        <h2 id="decision-heading" className="text-sm font-semibold text-fg">
          Decision
        </h2>
        <p className="mt-1 text-sm text-muted">
          This registration has already been adjudicated — no further action is available here.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="decision-heading" className="rounded-md border border-border bg-surface p-4 shadow-sm">
      <h2 id="decision-heading" className="text-sm font-semibold text-fg">
        Decision
      </h2>
      <p className="mt-1 text-sm text-muted">
        Approving creates an actor record and publishes this organisation&apos;s contact details
        and coordinates to the public directory. Rejecting cannot be undone from this screen.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onApproveClick}
          className={[
            'rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg',
            'transition-colors hover:opacity-90',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          ].join(' ')}
        >
          Approve
        </button>
        <button
          type="button"
          onClick={onRejectClick}
          className={[
            'rounded-md border border-danger bg-surface px-4 py-2 text-sm font-medium text-danger',
            'transition-colors hover:bg-danger-soft',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2',
          ].join(' ')}
        >
          Reject
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegistrationDetailPanelProps {
  detail: AdminRegistrationDetail;
  /** Cognito access token used for approve/reject/dismiss (T-14's mutations). */
  token: string;
  /**
   * Called after a successful approve/reject/dismiss so the caller can
   * re-fetch `GET /:id` and hand this panel a fresh `detail` — the mutation
   * responses are minimal and do NOT carry the refreshed status, activity
   * trail, or duplicate-candidate list (see file-level doc comment).
   */
  onRefresh: () => Promise<void>;
  /** Called on a 401 from any mutation. Falls back to an inline session-expired message when omitted. */
  onAuthFailure?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RegistrationDetailPanel({
  detail,
  token,
  onRefresh,
  onAuthFailure,
}: RegistrationDetailPanelProps) {
  const [activeDialog, setActiveDialog] = useState<'approve' | 'reject' | null>(null);
  // react-doctor no-unowned-async-error-clear: approve and reject each own
  // an INDEPENDENT loading/error pair rather than sharing one. Only one
  // dialog can be open at a time, but a successful mutation closes its
  // dialog and THEN awaits `onRefresh()` — during that window
  // `activeDialog` is already back to `null`, so a shared pair would let a
  // still-in-flight approve's `finally { setDialogLoading(false) }` clear
  // loading/error state a newly-opened reject dialog had just set,
  // prematurely re-enabling its Cancel/Confirm buttons mid-request.
  const [approveLoading, setApproveLoading] = useState(false);
  const [approveError, setApproveError] = useState<string | undefined>();
  const [rejectLoading, setRejectLoading] = useState(false);
  const [rejectError, setRejectError] = useState<string | undefined>();
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | undefined>();
  const [announcementError, setAnnouncementError] = useState<string | undefined>();

  const closeDialog = useCallback(() => {
    setActiveDialog(null);
    setApproveError(undefined);
    setRejectError(undefined);
  }, []);

  /**
   * Called on a 401 from any mutation. `setInlineError` routes the fallback
   * message (used only when `onAuthFailure` is omitted) to whichever
   * caller's OWN error state — approve's, reject's, or the announcement
   * banner's — rather than a field another in-flight caller could stomp.
   */
  const handleAuthFailure = useCallback(
    (setInlineError: (message: string) => void) => {
      if (onAuthFailure) {
        onAuthFailure();
        return;
      }
      setInlineError('Your session has expired. Please sign in again.');
    },
    [onAuthFailure]
  );

  const handleApproveConfirm = useCallback(async () => {
    setApproveError(undefined);
    setApproveLoading(true);
    try {
      await approveRegistration(detail.id, { acknowledgement: APPROVAL_ACKNOWLEDGEMENT_TEXT }, token);
      setActiveDialog(null);
      setAnnouncementError(undefined);
      setAnnouncement(`${detail.reference} approved and published to the public directory.`);
      await onRefresh();
    } catch (caught: unknown) {
      if (caught instanceof AuthFailureError) {
        handleAuthFailure(setApproveError);
        return;
      }
      const message =
        caught instanceof ApiError || caught instanceof Error
          ? caught.message
          : 'Failed to approve this registration.';
      setApproveError(message);
    } finally {
      setApproveLoading(false);
    }
  }, [detail.id, detail.reference, token, onRefresh, handleAuthFailure]);

  const handleRejectConfirm = useCallback(
    async (input: RejectDialogInput) => {
      setRejectError(undefined);
      setRejectLoading(true);
      try {
        await rejectRegistration(detail.id, { reason: input.reason, note: input.note }, token);
        setActiveDialog(null);
        setAnnouncementError(undefined);
        setAnnouncement(`${detail.reference} rejected.`);
        await onRefresh();
      } catch (caught: unknown) {
        if (caught instanceof AuthFailureError) {
          handleAuthFailure(setRejectError);
          return;
        }
        const message =
          caught instanceof ApiError || caught instanceof Error
            ? caught.message
            : 'Failed to reject this registration.';
        setRejectError(message);
      } finally {
        setRejectLoading(false);
      }
    },
    [detail.id, detail.reference, token, onRefresh, handleAuthFailure]
  );

  const handleDismiss = useCallback(
    async (candidateActorId: string) => {
      setAnnouncementError(undefined);
      setDismissingId(candidateActorId);
      try {
        await dismissDuplicateCandidate(detail.id, { candidateActorId }, token);
        setAnnouncement('Candidate marked as not a duplicate.');
        await onRefresh();
      } catch (caught: unknown) {
        if (caught instanceof AuthFailureError) {
          handleAuthFailure(setAnnouncementError);
          return;
        }
        const message =
          caught instanceof ApiError || caught instanceof Error
            ? caught.message
            : 'Failed to update this candidate.';
        setAnnouncement(undefined);
        setAnnouncementError(message);
      } finally {
        setDismissingId(null);
      }
    },
    [detail.id, token, onRefresh, handleAuthFailure]
  );

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
            REGISTRATION_STATUS_BADGE_CLASSES[detail.status],
          ].join(' ')}
        >
          {REGISTRATION_STATUS_LABEL[detail.status]}
        </span>
      </header>

      {/* ── Result announcement (T-14) ─────────────────────────────────── */}
      {announcement && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-highlight-tint bg-highlight-tint px-4 py-3 text-sm font-medium text-success"
        >
          {announcement}
        </div>
      )}
      {announcementError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-md border border-danger-soft bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
        >
          {announcementError}
        </div>
      )}

      <DuplicateWarningCard
        candidates={detail.duplicateCandidates}
        onDismiss={handleDismiss}
        dismissingId={dismissingId}
      />

      <SubmittedDetailsTable detail={detail} />

      <LocationCard payload={detail.payload} />

      <DecisionPanel
        detail={detail}
        onApproveClick={() => setActiveDialog('approve')}
        onRejectClick={() => setActiveDialog('reject')}
      />

      <ConsentRecordCard consent={detail.consent} />

      <ActivityTrail events={detail.activityTrail} />

      {/* ── Approve — AcknowledgeDialog, never ConfirmDialog (design.md §7.4) ── */}
      <AcknowledgeDialog
        open={activeDialog === 'approve'}
        title={`Approve ${detail.reference}`}
        description={
          `You are attesting that consent is on file under policy version ` +
          `${detail.consent.policyVersion}, accepted ${formatConsentDate(detail.consent.acceptedAt)}. ` +
          `Approving creates an actor record and publishes this organisation's contact details ` +
          `and coordinates to the public directory.`
        }
        acknowledgementText={APPROVAL_ACKNOWLEDGEMENT_TEXT}
        confirmLabel="Approve"
        onConfirm={handleApproveConfirm}
        onCancel={closeDialog}
        loading={approveLoading}
        error={approveError}
      />

      {/* ── Reject — RejectDialog, never ConfirmDialog or AcknowledgeDialog ── */}
      <RejectDialog
        open={activeDialog === 'reject'}
        reference={detail.reference}
        onConfirm={handleRejectConfirm}
        onCancel={closeDialog}
        loading={rejectLoading}
        error={rejectError}
      />
    </div>
  );
}
