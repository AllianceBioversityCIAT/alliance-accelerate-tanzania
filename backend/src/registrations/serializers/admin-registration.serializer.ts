import { RegistrationStatus } from '@prisma/client';
import { DuplicateCandidate } from '../duplicate-detection.service';
import {
  ActivityTrailEvent,
  ActivityTrailSourceRow,
  buildActivityTrail,
} from './activity-trail.serializer';

/**
 * T-6 — Admin registration DETAIL projection (FR-10 scenarios 1, 2; `design.md`
 * §5's `GET /api/v1/admin/registrations/:id` contract row, §7.3).
 *
 * Unlike `AdminRegistrationListRow` (`admin-registrations.service.ts`), this
 * is the ONE surface that renders the full submitted payload — including the
 * two fields with no `Actor` column (`contactPerson`, `otherCrops`), which
 * FR-10 scenario 1 requires shown but marked as review context that will not
 * be published. **That marking is a FRONTEND concern (T-13)** — this
 * serializer's job stops at returning every submitted field, literal-picked
 * (no spread), so no field is silently added or dropped between the DTO and
 * the wire.
 *
 * Admin-only. Never reachable by `Public` or `Staff` (guarded at the
 * controller class level, same stack every admin route in this module uses).
 */

/**
 * The submitted payload, verbatim — every `RegistrationPayloadDto` leaf
 * field (`dto/registration-create.dto.ts`), explicit literal pick so a
 * schema field can never be silently omitted or (per DD-18's adjacency
 * trap, which this file is not exempt from just because nothing here
 * writes to `Actor`) accidentally aliased onto the wrong key.
 */
export interface AdminRegistrationPayload {
  traderName: string;
  traderType: string;
  /** Review context only — no `Actor` column exists (FR-12's projection table). */
  contactPerson: string;
  position: string | null;
  district: string | null;
  marketLocation: string | null;
  sex: string | null;
  region: string;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  crops: string[];
  /** Review context only — no `Actor` column exists (FR-12's projection table). */
  otherCrops: string | null;
  capacityTons: number;
  phone: string;
}

/**
 * FR-10 scenario 2's consent block: "states the consenting party, the
 * policy version, and the acceptance timestamp."
 */
export interface AdminConsentRecord {
  /** The organisation being asked to consent — `payload.traderName`. */
  consentingOrganisation: string;
  policyVersion: string;
  /**
   * ISO-8601, always UTC (`Z` suffix) — timezone-explicit at the wire level
   * by construction, satisfying FR-10 scenario 2's "must name its
   * timezone." `ConsentRecordCard` (T-13) still renders an explicit
   * designator in the UI; this is the data it renders from.
   */
  acceptedAt: string;
  /**
   * FR-10 scenario 2's "recorded at submission" qualifier, carried as DATA
   * rather than left to UI copy alone — `Registration`'s own `schema.prisma`
   * comment records that the contract collects no client acceptance
   * timestamp by design, making `acceptedAt` an upper bound on the
   * applicant's true acceptance moment, never an independently attested
   * one. A fixed literal, not a fabricated field: it names what `acceptedAt`
   * already is, it does not invent a new fact.
   */
  acceptedAtQualifier: 'RECORDED_AT_SUBMISSION';
}

export interface AdminRegistrationDetail {
  id: string;
  reference: string;
  status: RegistrationStatus;
  payload: AdminRegistrationPayload;
  /** PII. Admin-only surface — never reaches `Public`/`Staff` (NFR-1). */
  submitterEmail: string;
  consent: AdminConsentRecord;
  /** Read-time only, never a persisted verdict (FR-11). */
  duplicateCandidates: DuplicateCandidate[];
  /** Derived, order-stable, no fabricated timestamp (FR-10 scenario 3). */
  activityTrail: ActivityTrailEvent[];
}

/** Raw shape of `RegistrationPayloadDto` as stored in the opaque `payload` JSON column. */
interface RawRegistrationPayload {
  traderName: string;
  traderType: string;
  contactPerson: string;
  position?: string | null;
  district?: string | null;
  marketLocation?: string | null;
  sex?: string | null;
  region: string;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  crops: string[];
  otherCrops?: string | null;
  capacityTons: number;
  phone: string;
}

/** The columns {@link toAdminRegistrationDetail} reads — a superset of {@link ActivityTrailSourceRow}. */
export interface AdminRegistrationSourceRow extends ActivityTrailSourceRow {
  id: string;
  reference: string;
  payload: unknown;
  submitterEmail: string;
}

function toAdminRegistrationPayload(raw: RawRegistrationPayload): AdminRegistrationPayload {
  return {
    traderName: raw.traderName,
    traderType: raw.traderType,
    contactPerson: raw.contactPerson,
    position: raw.position ?? null,
    district: raw.district ?? null,
    marketLocation: raw.marketLocation ?? null,
    sex: raw.sex ?? null,
    region: raw.region,
    gpsLatitude: raw.gpsLatitude ?? null,
    gpsLongitude: raw.gpsLongitude ?? null,
    crops: raw.crops,
    otherCrops: raw.otherCrops ?? null,
    capacityTons: raw.capacityTons,
    phone: raw.phone,
  };
}

/**
 * Project one `Registration` row plus its (already-computed) duplicate
 * candidates onto the admin detail shape. `duplicateCandidates` is passed
 * in rather than fetched here — `DuplicateDetectionService.detectForBatch`
 * is the one detection entry point (DD-20; `list` and `getById` are both
 * call sites into it), and this serializer has no Prisma access of its
 * own; keeping I/O out of a serializer is the same discipline
 * `admin-actor.serializer.ts` (T-1, `actors/`) already follows.
 */
export function toAdminRegistrationDetail(
  row: AdminRegistrationSourceRow,
  duplicateCandidates: DuplicateCandidate[],
): AdminRegistrationDetail {
  const rawPayload = row.payload as RawRegistrationPayload;
  const payload = toAdminRegistrationPayload(rawPayload);

  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    payload,
    submitterEmail: row.submitterEmail,
    consent: {
      consentingOrganisation: payload.traderName,
      policyVersion: row.consentPolicyVersion,
      acceptedAt: row.consentAcceptedAt.toISOString(),
      acceptedAtQualifier: 'RECORDED_AT_SUBMISSION',
    },
    duplicateCandidates,
    activityTrail: buildActivityTrail(row),
  };
}
