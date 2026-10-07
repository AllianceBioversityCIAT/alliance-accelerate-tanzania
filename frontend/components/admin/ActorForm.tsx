// @sdd-spec admin/actor-crud-audit (T-8)
// @sdd-spec enhancement/searchable-region-select (T-7)
'use client';

/**
 * ActorForm — shared create/edit form for the admin actor registry (FR-8).
 *
 * Covers the full Actor field set in sections: Identity, Location/GPS,
 * Capacity & support, Contact (PII), Crops, and Consent & provenance.
 *
 * Client validation mirrors the backend DTOs and the shared intake contract
 * (FR-1). Server 400 field errors are mapped inline via aria-describedby. A
 * change that sets consentStatus to GRANTED from another status (or in
 * create mode) opens the existing AcknowledgeDialog and only sends
 * acknowledged: true after typed confirmation. A 409 carrying unconfirmed
 * strong duplicate candidates (FR-3) opens DuplicateConfirmDialog instead of
 * mapping to a field error — Trader ID is system-generated (FR-2) and is no
 * longer an input on create; it is shown read-only on edit.
 *
 * Static-export safe (no SSR); tokens only (system-design §7); WCAG 2.1 AA.
 */

import { useCallback, useId, useRef, useState } from 'react';

import { AcknowledgeDialog } from './AcknowledgeDialog';
import { DuplicateConfirmDialog } from './DuplicateConfirmDialog';
import { ConsentDocumentField } from './ConsentDocumentField';
import Button from '../ui/Button';
import { SearchableSelect } from '../ui/SearchableSelect';

import CoordinatePicker from '@/components/map/CoordinatePicker';
import { REGIONS } from '@/lib/content/regions';
import { ROLES } from '@/lib/content/roles';
import AdditionalTypesField from '@/components/ui/AdditionalTypesField';
import {
  CONTACT_PERSON_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  FRONTEND_INTAKE_REQUIRED_FIELDS,
  PHONE_MAX_LENGTH,
  TRADER_NAME_MAX_LENGTH,
} from '@/lib/content/intake-required-fields';
import {
  createActor,
  updateActor,
  type AdminActor,
  type AdminActorCreateInput,
  type AdminActorCreateResult,
  type AdminActorUpdateInput,
  type ConsentMethod,
  type DuplicateCandidate,
  type DuplicateConflictBody,
  type RegistrationSource,
} from '@/lib/api/actors-admin';
import { ApiError, AuthFailureError } from '@/lib/api/client';
import { ACTOR_FORM_CONSENT_COPY } from '@/lib/content/consent-requests';
import {
  LATITUDE_HINT,
  LONGITUDE_HINT,
  latitudeRangeError,
  longitudeRangeError,
} from '@/lib/geo/coordinates';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACKNOWLEDGEMENT_TEXT = 'I confirm consent is on file';

const CROP_NAMES = [
  { value: 'sorghum', label: 'Sorghum' },
  { value: 'common_bean', label: 'Common bean' },
  { value: 'groundnut', label: 'Groundnut' },
] as const;

const SEX_OPTIONS = [
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
  { value: 'Other', label: 'Other' },
] as const;

const CONSENT_OPTIONS = [
  { value: 'GRANTED', label: 'Granted' },
  { value: 'DENIED', label: 'Denied' },
  { value: 'UNKNOWN', label: 'Unknown' },
] as const;

// T-7 (design.md §5.6) — computed once at module scope, mirroring
// RegistrationForm's REGION_OPTIONS (T-4), for SearchableSelect's `options` prop.
const REGION_OPTIONS = REGIONS.map((region) => ({ value: region, label: region }));

/**
 * T-9 (FR-2, FR-6) — mirrors the labels used by the admin actors table filter
 * (`app/(admin)/admin/actors/page.tsx` `CONSENT_METHOD_OPTIONS`) so the same
 * enum reads identically everywhere in the admin console. `NOT_RECORDED` is
 * listed deliberately (it is the schema default, not an "unset" sentinel) —
 * the select has no separate blank option — except the transient empty "Select…" shown after an `EMAIL_LINK` status swap (see `renderConsentMethodSelect`).
 */
const CONSENT_METHOD_OPTIONS: { value: ConsentMethod; label: string }[] = [
  { value: 'NOT_RECORDED', label: 'Not recorded' },
  { value: 'PORTAL_CHECKBOX', label: 'Portal checkbox' },
  { value: 'SIGNED_FORM', label: 'Signed form' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'VERBAL_FIELD', label: 'Verbal (field)' },
];

/**
 * T-9 (FR-6 closure) — mirrors the labels the admin actors table already
 * renders for this field: `sourceLabel`/`SourceBadge` in `ActorsTable.tsx`
 * and `SOURCE_OPTIONS` in `app/(admin)/admin/actors/page.tsx`. Typed against
 * the Prisma-generated `RegistrationSource` union (not `as const`), the same
 * discipline `CONSENT_METHOD_OPTIONS` uses, so a typo'd literal is a compile
 * error rather than a runtime `400` from the backend's `@IsIn`.
 */
const REGISTRATION_SOURCE_OPTIONS: { value: RegistrationSource; label: string }[] = [
  { value: 'TEAM_MANAGED', label: 'Team-managed' },
  { value: 'SELF_REGISTERED', label: 'Self-registered' },
];

/**
 * Tanzania is East Africa Time, UTC+3 year-round (no DST) — a fixed, safe
 * offset. Single-sourced as a number: `TANZANIA_UTC_OFFSET` (the `+03:00`
 * string `dateOnlyToInstant` anchors new/edited dates to) and
 * `TANZANIA_UTC_OFFSET_MS` (what `instantToDateOnly` shifts by before
 * slicing) both derive from it, so there is exactly one place that encodes
 * "3 hours" — editing this alone keeps both directions of the round trip
 * in sync.
 */
const TANZANIA_UTC_OFFSET_HOURS = 3;
const TANZANIA_UTC_OFFSET = `+${String(TANZANIA_UTC_OFFSET_HOURS).padStart(2, '0')}:00`;
const TANZANIA_UTC_OFFSET_MS = TANZANIA_UTC_OFFSET_HOURS * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormValues {
  traderId: string;
  traderName: string;
  traderType: string;
  additionalTraderTypes: string[];
  sex: string;
  position: string;
  region: string;
  district: string;
  marketLocation: string;
  gpsLatitude: string;
  gpsLongitude: string;
  capacityTons: string;
  technicalSupport: string;
  phone: string;
  email: string;
  /**
   * Named natural person, published deliberately once consent is `GRANTED`
   * (`actors/public-profile-disclosure` FR-4).
   */
  contactPerson: string;
  /** Actor-declared free text, published (FR-4). */
  otherCrops: string;
  crops: string[];
  consentStatus: string;
  /**
   * T-9 (FR-6 closure) — mirrors the backend `RegistrationSource` enum.
   * Non-nullable with a schema default (`TEAM_MANAGED`) — always a real
   * value, never a blank sentinel, exactly like `consentMethod` below (the one exception: `consentMethod` is '' after an `EMAIL_LINK` status swap, until the admin chooses).
   */
  registrationSource: string;
  /** T-9 (FR-2) — mirrors the backend `ConsentMethod` enum; always a real value, except '' after an `EMAIL_LINK` status swap until the admin chooses. */
  consentMethod: string;
  /** T-9 (FR-2) — `YYYY-MM-DD`, the native shape of `<input type="date">`; empty string when unset. */
  consentObtainedAt: string;
  /** T-9 (FR-2) — free-text evidence pointer; empty string when unset (never required). */
  consentReference: string;
}

export interface ActorFormProps {
  mode: 'create' | 'edit';
  initialValues?: AdminActor;
  token: string;
  /**
   * Called after a successful create/update with the saved actor (T-6) — a
   * create's result also carries `duplicateWarnings` (FR-3's weak scenario),
   * which `new/page.tsx` reads to decide whether to show the informational
   * dialog before redirecting. Called with no argument on Cancel, which has
   * no actor to report.
   */
  onSuccess: (actor?: AdminActorCreateResult | AdminActor, extras?: ActorFormSuccessExtras) => void;
  onAuthFailure: () => void;
  /**
   * D-26 — called when the admin chooses "Reload" on the stale-form notice.
   * The edit page re-reads the actor and remounts the form; without it the
   * form falls back to a full page reload.
   */
  onReload?: () => void;
}

/**
 * Passed to `onSuccess` after a CREATE. The form only HOLDS the optional
 * consent document; the page uploads it once the actor exists (FR-15), so a
 * rejected create can never leave an upload behind.
 */
export interface ActorFormSuccessExtras {
  documentFile: File | null;
}

/** The submit body: the create shape plus D-26's edit-only `expectedUpdatedAt`. */
type SubmitDto = AdminActorCreateInput & Pick<AdminActorUpdateInput, 'expectedUpdatedAt'>;

interface FieldErrorDetail {
  field: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toFormValues(actor?: AdminActor): FormValues {
  if (!actor) {
    return {
      traderId: '',
      traderName: '',
      traderType: '',
      additionalTraderTypes: [],
      sex: '',
      position: '',
      region: '',
      district: '',
      marketLocation: '',
      gpsLatitude: '',
      gpsLongitude: '',
      capacityTons: '',
      technicalSupport: '',
      phone: '',
      email: '',
      contactPerson: '',
      otherCrops: '',
      crops: [],
      consentStatus: '',
      registrationSource: 'TEAM_MANAGED',
      consentMethod: 'NOT_RECORDED',
      consentObtainedAt: '',
      consentReference: '',
    };
  }
  return {
    traderId: actor.traderId,
    traderName: actor.traderName,
    traderType: actor.traderType,
    additionalTraderTypes: actor.additionalTraderTypes ?? [],
    sex: actor.sex ?? '',
    position: actor.position ?? '',
    region: actor.region,
    district: actor.district ?? '',
    marketLocation: actor.marketLocation ?? '',
    gpsLatitude: actor.gpsLatitude?.toString() ?? '',
    gpsLongitude: actor.gpsLongitude?.toString() ?? '',
    capacityTons: actor.capacityTons?.toString() ?? '',
    technicalSupport: actor.technicalSupport ?? '',
    phone: actor.phone ?? '',
    email: actor.email ?? '',
    contactPerson: actor.contactPerson ?? '',
    otherCrops: actor.otherCrops ?? '',
    crops: actor.crops ?? [],
    consentStatus: actor.consentStatus,
    registrationSource: actor.registrationSource,
    consentMethod: actor.consentMethod,
    consentObtainedAt: instantToDateOnly(actor.consentObtainedAt),
    consentReference: actor.consentReference ?? '',
  };
}

/**
 * Converts the date-only value from an `<input type="date">` (`YYYY-MM-DD`)
 * into a full RFC-3339 instant, or `null` when empty.
 *
 * `ActorCreateDto.consentObtainedAt` is validated server-side with
 * `@IsDateString()` (`class-validator`'s `isISO8601`), which happily accepts
 * a bare `YYYY-MM-DD` string — but there is no `@Type(() => Date)` on the
 * DTO, so a date-only string reaches Prisma untransformed. Prisma's
 * `DateTime` column requires a full instant and raises a
 * `PrismaClientValidationError`, which is NOT a `PrismaClientKnownRequestError`
 * — `mapPrismaError` rethrows it and Nest renders an unhandled 500, not a
 * clean 400. Building the full instant here, client-side, avoids ever
 * sending the bare date.
 *
 * Anchored at Tanzania midnight, not UTC midnight: `IsNotFutureDate`
 * (`actor-create.dto.ts`) compares against `Date.now()` in UTC, and Tanzania
 * (EAT, UTC+3, no DST) is far enough ahead that a UTC-midnight instant for
 * "today" can land after the real "now" between 00:00–03:00 EAT — an admin
 * recording consent as "today" in that window would otherwise get a
 * spurious "must not be a future date" rejection.
 *
 * Only called for a date the admin actually set or changed — see
 * {@link resolveConsentObtainedAt}, which is what `buildDto` uses to decide
 * between this and resending the stored instant verbatim.
 */
function dateOnlyToInstant(dateOnly: string): string | null {
  const trimmed = dateOnly.trim();
  return trimmed ? `${trimmed}T00:00:00${TANZANIA_UTC_OFFSET}` : null;
}

/**
 * Inverse of {@link dateOnlyToInstant} — extracts the `YYYY-MM-DD` Tanzania
 * calendar date from a stored RFC-3339 instant, for display in
 * `<input type="date">`, and as the baseline `resolveConsentObtainedAt` uses
 * to detect whether the admin actually touched the date field. Naively
 * slicing the UTC ISO string the API returns would be off by one day near
 * midnight (a value written as Tanzania midnight is stored as UTC 21:00 the
 * *previous* day) — shifting by the fixed offset before slicing keeps this
 * calendar-date extraction correct.
 *
 * This round trip is NOT what keeps an untouched date from registering as a
 * spurious provenance change server-side. `isSameValue`
 * (`consent-provenance.policy.ts`) normalises a stored `Date` via
 * `toISOString()` and compares the result to the submitted value as a
 * STRING, not as an instant — so rebuilding an instant from this function's
 * output via `dateOnlyToInstant` would still differ byte-for-byte from a
 * stored value that carries a real time-of-day (e.g.
 * `2026-01-15T10:30:00.000Z`, written by import or the API), and would
 * silently rewrite it to Tanzania midnight. That is why `buildDto` never
 * rebuilds an untouched date through this function + `dateOnlyToInstant`: it
 * resends the stored instant verbatim instead (see
 * {@link resolveConsentObtainedAt}), which is what actually gives
 * `isSameValue` a byte-identical match.
 */
function instantToDateOnly(iso: string | null): string {
  if (!iso) return '';
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return '';
  const tanzaniaLocal = new Date(instant.getTime() + TANZANIA_UTC_OFFSET_MS);
  return tanzaniaLocal.toISOString().slice(0, 10);
}

/**
 * Decides what `buildDto` sends for `consentObtainedAt` (T-9 rework,
 * conformance Issue 1): does the admin's current date-field value differ
 * from what this actor already has on file?
 *
 * - **Untouched** (edit mode, and the field still reads back to the same
 *   Tanzania calendar date `instantToDateOnly` derives from the stored
 *   instant): resend `initialValues.consentObtainedAt` **verbatim**. This
 *   preserves any stored time-of-day byte-for-byte and is what makes
 *   `isSameValue` (`consent-provenance.policy.ts`) compare equal — avoiding
 *   both a phantom `consentObtainedAt` entry in the audit diff and a
 *   possible spurious FR-3 rejection on an edit that never touched consent.
 * - **New or changed** (create mode, or the field no longer matches the
 *   baseline): build a fresh instant via `dateOnlyToInstant`, anchored at
 *   Tanzania midnight. This is the only path allowed to invent a
 *   time-of-day, because it is the only path where the admin is actually
 *   asserting a new date.
 */
function resolveConsentObtainedAt(
  values: FormValues,
  mode: 'create' | 'edit',
  initialValues?: AdminActor,
): string | null {
  if (mode === 'edit' && initialValues) {
    const storedDateOnly = instantToDateOnly(initialValues.consentObtainedAt);
    if (storedDateOnly === values.consentObtainedAt) {
      return initialValues.consentObtainedAt;
    }
  }
  return dateOnlyToInstant(values.consentObtainedAt);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * FR-3, design.md §4.1 — the client-side UX mirror of the backend's shared
 * consent-provenance invariant (`backend/src/common/consent-provenance.policy.ts`).
 * This is UX only (design.md §5) — it exists to give the Admin an inline
 * error instead of a round trip, NOT as the enforcement point. T-3's server
 * rejection is independently tested and remains the real gate.
 *
 * Mirrors only the two firing conditions from the backend's §4.1 truth
 * table, never field presence:
 *  (a) a TRANSITION into GRANTED — create mode, or edit mode where the
 *      actor's stored `consentStatus` was not already GRANTED; or
 *  (b) an edit that changes one of the three provenance fields away from
 *      what the actor already has on file.
 *
 * The distinction this function exists to get right: a legacy actor that is
 * ALREADY `GRANTED` with unchanged provenance — every one of the 436 live
 * actors today (`GRANTED` + `NOT_RECORDED` + null date) — must NOT trip this
 * guard merely by being `GRANTED`. Firing on presence/status alone would
 * make every such actor uneditable from this form, the exact regression
 * design.md DD-3/R-9 exists to prevent.
 */
function needsProvenanceCheck(
  mode: 'create' | 'edit',
  values: FormValues,
  initialValues?: AdminActor,
): boolean {
  if (values.consentStatus !== 'GRANTED') return false;

  const transitionsIntoGranted = mode === 'create' || initialValues?.consentStatus !== 'GRANTED';
  if (transitionsIntoGranted) return true;

  const baseline = toFormValues(initialValues);
  return (
    values.consentMethod !== baseline.consentMethod ||
    values.consentObtainedAt !== baseline.consentObtainedAt ||
    values.consentReference.trim() !== baseline.consentReference.trim()
  );
}

/**
 * FR-1 / NFR-1 — one entry per {@link FRONTEND_INTAKE_REQUIRED_FIELDS} member,
 * `Record`-typed against it so adding or removing an entry there is a
 * compile error here until this map is updated too. `validate()` below
 * loops over the constant itself rather than re-declaring each field's
 * "is required" check inline — that is what makes the pin test
 * (`ActorForm.test.tsx`, "declares exactly the same required set…") and a
 * per-field "left blank" test redden on the SAME mutation: drop `'phone'`
 * from the constant and this loop stops checking it, while the pin test's
 * literal comparison also goes red. Bounds/format (max length, email shape)
 * are NOT part of "required" and stay as separate per-field checks below.
 *
 * Deliberately stricter than the backend's `isBlankScalar` (`intake-contract.ts`),
 * which counts a whitespace-only string as present (length >= 1, never
 * trimmed): these `isBlank` checks trim first, matching the `trim() || null`
 * normalization applied to the same fields when building the submit payload
 * below — a whitespace-only value is caught here rather than passing client
 * validation and then being normalized to `null` and rejected by the server
 * instead.
 */
const REQUIRED_FIELD_CHECKS: Record<
  (typeof FRONTEND_INTAKE_REQUIRED_FIELDS)[number],
  { message: string; isBlank: (values: FormValues) => boolean }
> = {
  contactPerson: { message: 'Contact person is required.', isBlank: (v) => !v.contactPerson.trim() },
  // `otherCrops` alone does NOT satisfy the crop requirement (FR-1's "no
  // crop, only Other crops" scenario) — only the fixed 3-crop checkboxes count.
  crops: { message: 'Select at least one crop.', isBlank: (v) => v.crops.length < 1 },
  capacityTons: { message: 'Capacity is required.', isBlank: (v) => !v.capacityTons.trim() },
  phone: { message: 'Phone is required.', isBlank: (v) => !v.phone.trim() },
  email: { message: 'Email is required.', isBlank: (v) => !v.email.trim() },
};

function validate(
  values: FormValues,
  mode: 'create' | 'edit',
  initialValues?: AdminActor,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!values.traderName.trim()) {
    errors.traderName = 'Trader name is required.';
  } else if (values.traderName.trim().length > TRADER_NAME_MAX_LENGTH) {
    errors.traderName = `Trader name must be ${TRADER_NAME_MAX_LENGTH} characters or fewer.`;
  }
  if (!values.region) errors.region = 'Region is required.';
  if (!values.traderType) errors.traderType = 'Main actor type is required.';
  if (!values.consentStatus) errors.consentStatus = 'Consent status is required.';

  for (const field of FRONTEND_INTAKE_REQUIRED_FIELDS) {
    const check = REQUIRED_FIELD_CHECKS[field];
    if (check.isBlank(values)) {
      errors[field] = check.message;
    }
  }

  // Bounds/format checks: per field, and only meaningful once the required
  // check above has already passed (mirrors the previous if/else-if chain).
  if (!errors.contactPerson && values.contactPerson.trim().length > CONTACT_PERSON_MAX_LENGTH) {
    errors.contactPerson = `Contact person must be ${CONTACT_PERSON_MAX_LENGTH} characters or fewer.`;
  }

  if (!errors.capacityTons) {
    const cap = Number(values.capacityTons);
    if (Number.isNaN(cap) || cap < 0) {
      errors.capacityTons = 'Capacity must be 0 or greater.';
    }
  }

  if (!errors.phone && values.phone.trim().length > PHONE_MAX_LENGTH) {
    errors.phone = `Phone must be ${PHONE_MAX_LENGTH} characters or fewer.`;
  }

  if (!errors.email) {
    if (!isValidEmail(values.email)) {
      errors.email = 'Enter a valid email address.';
    } else if (values.email.trim().length > EMAIL_MAX_LENGTH) {
      errors.email = `Email must be ${EMAIL_MAX_LENGTH} characters or fewer.`;
    }
  }

  if (needsProvenanceCheck(mode, values, initialValues)) {
    if (!values.consentMethod || values.consentMethod === 'NOT_RECORDED') {
      errors.consentMethod = 'Select how consent was obtained before granting consent.';
    }
    if (!values.consentObtainedAt.trim()) {
      errors.consentObtainedAt = 'Enter the date consent was obtained before granting consent.';
    }
  }

  if (values.gpsLatitude.trim()) {
    const lat = Number(values.gpsLatitude);
    const latError = latitudeRangeError(lat);
    if (latError) errors.gpsLatitude = latError;
  }

  if (values.gpsLongitude.trim()) {
    const lng = Number(values.gpsLongitude);
    const lngError = longitudeRangeError(lng);
    if (lngError) errors.gpsLongitude = lngError;
  }

  return errors;
}

/**
 * FR-10 / design §5.7 — the stored consent was given by the actor's own act
 * (`EMAIL_LINK`). Admins can never assert that method, so while it stands the
 * form shows it read-only instead of an assertable select.
 */
function isStoredEmailLink(mode: 'create' | 'edit', initialValues?: AdminActor): boolean {
  return mode === 'edit' && initialValues?.consentMethod === 'EMAIL_LINK';
}

/**
 * Rule 3 (frozen evidence): `GRANTED` by link with the status unchanged. The
 * method, date and reference are the actor's evidence and render read-only.
 */
function isLinkEvidenceFrozen(
  mode: 'create' | 'edit',
  values: FormValues,
  initialValues?: AdminActor,
): boolean {
  return (
    isStoredEmailLink(mode, initialValues) &&
    initialValues?.consentStatus === 'GRANTED' &&
    values.consentStatus === initialValues.consentStatus
  );
}

/**
 * Select swap (design §5.7, rules 2 and 4): while the status equals the stored
 * one the stored link evidence stands; when it differs the assertable method
 * select comes back EMPTY. A re-grant must carry its own method, date and
 * reference — the link-era date and reference are cleared so they cannot ride
 * along under an admin method (D-24).
 */
function applyConsentStatusChange(prev: FormValues, status: string, initial: AdminActor): FormValues {
  const next = { ...prev, consentStatus: status };
  if (initial.consentMethod !== 'EMAIL_LINK') return next;
  const baseline = toFormValues(initial);
  if (status === initial.consentStatus) {
    return {
      ...next,
      consentMethod: baseline.consentMethod,
      consentObtainedAt: baseline.consentObtainedAt,
      consentReference: baseline.consentReference,
    };
  }
  if (status === 'GRANTED') {
    return { ...next, consentMethod: '', consentObtainedAt: '', consentReference: '' };
  }
  return {
    ...next,
    consentMethod: '',
    consentObtainedAt: baseline.consentObtainedAt,
    consentReference: baseline.consentReference,
  };
}

function buildDto(
  values: FormValues,
  mode: 'create' | 'edit',
  initialValues?: AdminActor,
): SubmitDto {
  return {
    // D-26 — edit ALWAYS names the version the form loaded, so a save made on
    // top of a newer actor (e.g. the actor just answered by link) is refused.
    ...(mode === 'edit' && initialValues ? { expectedUpdatedAt: initialValues.updatedAt } : {}),
    traderName: values.traderName.trim(),
    region: values.region,
    traderType: values.traderType,
    additionalTraderTypes: values.additionalTraderTypes,
    consentStatus: values.consentStatus as 'GRANTED' | 'DENIED' | 'UNKNOWN',
    registrationSource: values.registrationSource as RegistrationSource,
    // An emptied select (swap while the stored method is EMAIL_LINK, status not GRANTED)
    // re-sends the stored value unchanged — rule 1 only refuses a CHANGE to it.
    consentMethod: (values.consentMethod || initialValues?.consentMethod) as ConsentMethod,
    consentObtainedAt: resolveConsentObtainedAt(values, mode, initialValues),
    // C-3/E-1 carry-forward: '' and null are NOT the same to isSameValue() in
    // consent-provenance.policy.ts. Keep the trim()||null idiom so a legacy
    // actor's stored null round-trips as null, never as '' (which would read
    // as "changed" and re-trigger the FR-3 guard server-side on an unrelated edit).
    consentReference: values.consentReference.trim() || null,
    district: values.district.trim() || null,
    contactPerson: values.contactPerson.trim() || null,
    sex: values.sex || null,
    position: values.position.trim() || null,
    marketLocation: values.marketLocation.trim() || null,
    capacityTons: values.capacityTons.trim() ? Number(values.capacityTons) : null,
    otherCrops: values.otherCrops.trim() || null,
    technicalSupport: values.technicalSupport.trim() || null,
    phone: values.phone.trim() || null,
    email: values.email.trim() || null,
    gpsLatitude: values.gpsLatitude.trim() ? Number(values.gpsLatitude) : null,
    gpsLongitude: values.gpsLongitude.trim() ? Number(values.gpsLongitude) : null,
    crops: values.crops,
  };
}

function needsAcknowledgement(
  mode: 'create' | 'edit',
  values: FormValues,
  initialConsentStatus?: string,
): boolean {
  if (values.consentStatus !== 'GRANTED') return false;
  if (mode === 'create') return true;
  return initialConsentStatus !== 'GRANTED';
}

/**
 * T-6 (design.md §3) — type-narrows `ApiError.body` for the 409 "Possible
 * duplicate" shape. A 409 that is NOT duplicate-shaped (e.g. some other
 * conflict) falls through to {@link mapApiError}'s generic form-error path —
 * `mapApiError` no longer assumes every 409 is a Trader ID collision (P-13):
 * that collision can no longer even occur, since Trader ID is system-
 * generated and never client-supplied (FR-2).
 */
function hasDuplicateCandidates(body: unknown): body is DuplicateConflictBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    Array.isArray((body as Partial<DuplicateConflictBody>).duplicateCandidates)
  );
}

/** D-26 — the 409 whose `details` name `expectedUpdatedAt`: the actor changed since the form loaded. */
function isStaleFormConflict(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 409 &&
    Array.isArray(err.details) &&
    err.details.some((d) => (d as Partial<FieldErrorDetail>)?.field === 'expectedUpdatedAt')
  );
}

function mapApiError(err: unknown): { formError?: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};

  if (err instanceof ApiError) {
    if (err.status === 400 && Array.isArray(err.details)) {
      for (const d of err.details) {
        const detail = d as Partial<FieldErrorDetail>;
        if (typeof detail.field === 'string' && typeof detail.message === 'string') {
          fieldErrors[detail.field] = detail.message;
        }
      }
      if (Object.keys(fieldErrors).length > 0) {
        return { fieldErrors };
      }
    }

    return { formError: err.message, fieldErrors };
  }

  return {
    formError: err instanceof Error ? err.message : 'An unexpected error occurred.',
    fieldErrors,
  };
}

// ---------------------------------------------------------------------------
// Reusable field wrapper
// ---------------------------------------------------------------------------

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}

function Field({ id, label, error, hint, required, children }: FieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
        {required && <span aria-hidden="true" className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function inputClasses(error?: boolean): string {
  return [
    'block w-full rounded-md border bg-surface px-3 py-2 text-sm text-fg',
    'shadow-xs',
    'placeholder:text-muted',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-50',
    error ? 'border-danger' : 'border-border',
  ].join(' ');
}

/** Read-only twin of `inputClasses`: same geometry, the alt surface marks it as not editable. */
function readOnlyInputClasses(): string {
  return [
    'block w-full rounded-md border border-border bg-surface-alt px-3 py-2 text-sm text-fg',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ActorForm({
  mode,
  initialValues,
  token,
  onSuccess,
  onAuthFailure,
  onReload,
}: ActorFormProps) {
  const [values, setValues] = useState<FormValues>(() => toFormValues(initialValues));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAck, setShowAck] = useState(false);
  const [pendingDto, setPendingDto] = useState<SubmitDto | null>(null);
  // FR-15 — create mode only: the chosen consent document, held until the actor exists.
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  // D-26 — the last save was refused because the actor changed since this form loaded.
  const [stale, setStale] = useState(false);

  // ── Duplicate gate (T-6, FR-3) ───────────────────────────────────────────
  // Unconfirmed strong candidates from the most recent 409, or `null` when
  // the dialog is closed — this one drives DuplicateConfirmDialog's `open`/
  // `candidates` props, so it stays state (it affects render output).
  const [duplicateCandidates, setDuplicateCandidates] = useState<DuplicateCandidate[] | null>(
    null,
  );
  // The dto that produced the 409, and the UNION of every candidate id
  // confirmed so far THIS session (across however many 409 rounds). Neither
  // is ever read during render — both are read only inside event-handler
  // code (`handleDuplicateConfirm`) — so a ref avoids a redundant re-render
  // every confirm round (vercel-react-best-practices: rerender-state-only-in-handlers).
  // A 409 only lists the CURRENTLY unconfirmed candidates (design.md DD-4) —
  // resubmitting with only the latest round's ids would drop an earlier
  // confirmation and loop (forward pointer, T-3 execution.md: confirm A,
  // 409 names B, confirm B must resubmit {A, B}).
  const pendingDuplicateDtoRef = useRef<SubmitDto | null>(null);
  const confirmedActorIdsRef = useRef<Set<string>>(new Set());

  const baseId = useId();

  const fieldId = useCallback((field: keyof FormValues) => `${baseId}-${field}`, [baseId]);

  const setField = useCallback(<K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    setValues((prev) =>
      field === 'consentStatus' && initialValues
        ? applyConsentStatusChange(prev, value as string, initialValues)
        : {
            ...prev,
            [field]: value,
            // Picking a main type that was ticked as "other" drops it from the set.
            ...(field === 'traderType'
              ? { additionalTraderTypes: prev.additionalTraderTypes.filter((t) => t !== value) }
              : {}),
          },
    );
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setFormError(null);
  }, [initialValues]);

  const toggleAdditionalType = useCallback((type: string) => {
    setValues((prev) => ({
      ...prev,
      additionalTraderTypes: prev.additionalTraderTypes.includes(type)
        ? prev.additionalTraderTypes.filter((t) => t !== type)
        : [...prev.additionalTraderTypes, type],
    }));
    setErrors((prev) => {
      if (!prev.additionalTraderTypes) return prev;
      const next = { ...prev };
      delete next.additionalTraderTypes;
      return next;
    });
  }, []);

  const toggleCrop = useCallback((crop: string) => {
    setValues((prev) => {
      const next = new Set(prev.crops);
      if (next.has(crop)) next.delete(crop);
      else next.add(crop);
      return { ...prev, crops: Array.from(next) };
    });
    setErrors((prev) => {
      if (!prev.crops) return prev;
      const next = { ...prev };
      delete next.crops;
      return next;
    });
  }, []);

  const doSubmit = useCallback(
    async (dto: SubmitDto) => {
      setLoading(true);
      setFormError(null);
      setErrors({});

      try {
        if (mode === 'create') {
          const created = await createActor(dto, token);
          setDuplicateCandidates(null);
          pendingDuplicateDtoRef.current = null;
          onSuccess(created, { documentFile });
        } else {
          if (!initialValues) throw new Error('Missing actor id for update.');
          const updated = await updateActor(initialValues.id, dto, token);
          onSuccess(updated);
        }
      } catch (err) {
        if (err instanceof AuthFailureError) {
          onAuthFailure();
          return;
        }

        // FR-3 — a strong, unconfirmed duplicate match. Open the dialog
        // instead of treating this like any other error (create-only: the
        // duplicate gate never runs on edit, design.md §3).
        if (mode === 'create' && err instanceof ApiError && err.status === 409 && hasDuplicateCandidates(err.body)) {
          setDuplicateCandidates(err.body.duplicateCandidates);
          pendingDuplicateDtoRef.current = dto;
          setLoading(false);
          return;
        }

        // D-26 — keep every typed value; the admin chooses when to reload.
        if (mode === 'edit' && isStaleFormConflict(err)) {
          setStale(true);
          setLoading(false);
          return;
        }

        const mapped = mapApiError(err);
        if (mapped.formError) {
          setFormError(mapped.formError);
        }
        setErrors(mapped.fieldErrors);
        setLoading(false);
      }
    },
    [mode, initialValues, token, documentFile, onSuccess, onAuthFailure],
  );

  const handleDuplicateConfirm = useCallback(() => {
    const pendingDto = pendingDuplicateDtoRef.current;
    if (!pendingDto || !duplicateCandidates) return;

    for (const candidate of duplicateCandidates) {
      confirmedActorIdsRef.current.add(candidate.actorId);
    }

    const dtoWithConfirmation: SubmitDto = {
      ...pendingDto,
      confirmedNotDuplicateOf: Array.from(confirmedActorIdsRef.current),
    };
    setDuplicateCandidates(null);
    pendingDuplicateDtoRef.current = null;
    void doSubmit(dtoWithConfirmation);
  }, [duplicateCandidates, doSubmit]);

  const handleDuplicateCancel = useCallback(() => {
    setDuplicateCandidates(null);
    pendingDuplicateDtoRef.current = null;
    setLoading(false);
    // confirmedActorIdsRef is NOT cleared here — a later resubmit still
    // needs the union of ids confirmed in earlier rounds (DD-4).
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const validationErrors = validate(values, mode, initialValues);
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }

      const dto = buildDto(values, mode, initialValues);

      if (needsAcknowledgement(mode, values, initialValues?.consentStatus)) {
        setPendingDto(dto);
        setShowAck(true);
        return;
      }

      void doSubmit(dto);
    },
    [values, mode, initialValues, doSubmit],
  );

  const handleAckConfirm = useCallback(() => {
    if (pendingDto) {
      void doSubmit({ ...pendingDto, acknowledged: true });
    }
    setShowAck(false);
    setPendingDto(null);
  }, [pendingDto, doSubmit]);

  const handleAckCancel = useCallback(() => {
    setShowAck(false);
    setPendingDto(null);
  }, []);

  // ── Render helpers ───────────────────────────────────────────────────────

  const renderSelect = (
    field: keyof FormValues,
    label: string,
    options: readonly { value: string; label: string }[],
    required = false,
  ) => {
    const id = fieldId(field);
    const error = errors[field];
    const value = values[field] as string;
    return (
      <Field id={id} label={label} error={error} required={required}>
        <select
          id={id}
          value={value}
          onChange={(e) => setField(field, e.target.value as FormValues[typeof field])}
          disabled={loading}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={inputClasses(!!error)}
        >
          <option value="">{required ? 'Select…' : '—'}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Field>
    );
  };

  /**
   * T-7 (design.md §5.6) — `SearchableSelect` swapped in for the native
   * `<select>` `renderSelect` still renders for `traderType`/`sex`/`consentStatus`, inside
   * the SAME `Field` wrapper so the label, required asterisk, and inline
   * error message are unchanged. `invalid`/`describedBy` are computed the
   * same way `renderSelect` computes them for every other field, so
   * `aria-invalid`/`aria-describedby` follow the one `errors` record with no
   * second path. No `clearOptionLabel` — region is required here too.
   */
  const renderRegionField = () => {
    const field: keyof FormValues = 'region';
    const id = fieldId(field);
    const error = errors[field];
    return (
      <Field id={id} label="Region" error={error} required>
        <SearchableSelect
          id={id}
          value={values.region}
          onChange={(next) => setField('region', next)}
          options={REGION_OPTIONS}
          placeholder="Select…"
          disabled={loading}
          invalid={!!error}
          describedBy={error ? `${id}-error` : undefined}
        />
      </Field>
    );
  };

  /**
   * T-6 (FR-2) — edit mode only: the Trader ID is shown read-only (disabled,
   * never submitted — `buildDto` has no `traderId` key at all). Not wrapped
   * by `renderInput`/`validate()`'s required-field machinery, since it is
   * never user-editable and never part of the required set.
   */
  const renderReadOnlyTraderId = () => {
    const id = fieldId('traderId');
    return (
      <Field id={id} label="Trader ID">
        <input
          id={id}
          type="text"
          value={values.traderId}
          readOnly
          disabled
          className={inputClasses(false)}
        />
      </Field>
    );
  };

  const renderInput = (
    field: keyof FormValues,
    label: string,
    type: 'text' | 'email' | 'number' | 'date' = 'text',
    required = false,
    hint?: string,
    maxLength?: number,
  ) => {
    const id = fieldId(field);
    const error = errors[field];
    const value = values[field] as string;
    return (
      <Field id={id} label={label} error={error} required={required} hint={hint}>
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => setField(field, e.target.value as FormValues[typeof field])}
          disabled={loading}
          maxLength={maxLength}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={inputClasses(!!error)}
        />
      </Field>
    );
  };

  const renderTextarea = (
    field: keyof FormValues,
    label: string,
    required = false,
    maxLength?: number,
  ) => {
    const id = fieldId(field);
    const error = errors[field];
    const value = values[field] as string;
    return (
      <Field id={id} label={label} error={error} required={required}>
        <textarea
          id={id}
          value={value}
          onChange={(e) => setField(field, e.target.value as FormValues[typeof field])}
          disabled={loading}
          rows={3}
          maxLength={maxLength}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={inputClasses(!!error)}
        />
      </Field>
    );
  };

  /**
   * T-9 (FR-2) — `consentMethod` is deliberately NOT rendered via the generic
   * `renderSelect`: that helper always prepends a blank "—" option meaning
   * "unset". `NOT_RECORDED` already IS the schema default / "unset" value
   * for this enum, so a second blank option would be a redundant, ambiguous
   * (the one deliberate exception is the empty "Select…" after an EMAIL_LINK status swap, below)
   * second way to express the same state (and one that fails `@IsIn` server-
   * side if ever submitted, since `''` is not a member of `ConsentMethod`).
   */
  const renderConsentMethodSelect = () => {
    const id = fieldId('consentMethod');
    const error = errors.consentMethod;
    // Design §5.7: while the stored method is EMAIL_LINK and the status is
    // unchanged, a <select> with no matching option would submit a wrong value
    // — show it read-only instead; `buildDto` re-sends the stored value.
    if (isStoredEmailLink(mode, initialValues) && values.consentStatus === initialValues?.consentStatus) {
      return (
        <Field id={id} label="Consent method" hint={ACTOR_FORM_CONSENT_COPY.emailLinkMethodHint}>
          <input
            id={id}
            type="text"
            value={ACTOR_FORM_CONSENT_COPY.emailLinkMethod}
            readOnly
            aria-readonly="true"
            className={readOnlyInputClasses()}
          />
        </Field>
      );
    }
    // After the swap the select comes back EMPTY (rule 2 / D-24): the admin must choose.
    const swapped = isStoredEmailLink(mode, initialValues);
    return (
      <Field id={id} label="Consent method" error={error} hint="Required when publishing (Granted)">
        <select
          id={id}
          value={values.consentMethod}
          onChange={(e) => setField('consentMethod', e.target.value)}
          disabled={loading}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={inputClasses(!!error)}
        >
          {swapped && <option value="">Select…</option>}
          {CONSENT_METHOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Field>
    );
  };

  /**
   * Rule 3 — the consent date and reference of a record `GRANTED` by link are
   * frozen evidence: rendered read-only, with the way out stated.
   */
  const renderFrozenInput = (field: 'consentObtainedAt' | 'consentReference', label: string, type: 'text' | 'date') => {
    const id = fieldId(field);
    return (
      <Field id={id} label={label} hint={ACTOR_FORM_CONSENT_COPY.frozenDateHint}>
        <input
          id={id}
          type={type}
          value={values[field]}
          readOnly
          aria-readonly="true"
          placeholder="—"
          className={readOnlyInputClasses()}
        />
      </Field>
    );
  };

  /**
   * T-9 (FR-6 closure) — like `renderConsentMethodSelect`, `registrationSource`
   * is NOT rendered via the generic `renderSelect`: that helper always
   * prepends a blank "—" option meaning "unset", but this enum is
   * non-nullable with a schema default (`TEAM_MANAGED`) and has no "unset"
   * state to express. A blank option here could submit `''`, which fails
   * the backend's `@IsIn(RegistrationSource)` with a `400`.
   */
  const renderRegistrationSourceSelect = () => {
    const id = fieldId('registrationSource');
    const error = errors.registrationSource;
    return (
      <Field id={id} label="Registration source" error={error}>
        <select
          id={id}
          value={values.registrationSource}
          onChange={(e) => setField('registrationSource', e.target.value)}
          disabled={loading}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={inputClasses(!!error)}
        >
          {REGISTRATION_SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Field>
    );
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
        {/* D-26 — stale form: typed values stay put; Reload is the admin's call. */}
        {stale && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-danger sm:flex-row sm:items-center sm:justify-between"
          >
            <span>{ACTOR_FORM_CONSENT_COPY.staleNotice}</span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => (onReload ? onReload() : window.location.reload())}
            >
              {ACTOR_FORM_CONSENT_COPY.reload}
            </Button>
          </div>
        )}

        {/* Top-level form error */}
        {formError && (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-danger"
          >
            {formError}
          </div>
        )}

        {/* Identity */}
        <div className="rounded-md border border-border bg-surface p-4 sm:p-6 shadow-sm">
          <fieldset className="border-0 p-0 m-0">
            <legend className="mb-4 text-base font-semibold text-fg">Identity</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/*
                T-6 (FR-2) — Trader ID is system-generated: no input on
                create at all; read-only on edit (the admin sees it, never
                types it, and it never changes).
              */}
              {mode === 'edit' && renderReadOnlyTraderId()}
              {renderInput('traderName', 'Trader name', 'text', true, undefined, TRADER_NAME_MAX_LENGTH)}
              {renderSelect(
                'traderType',
                'Main actor type',
                Object.entries(ROLES).map(([value, meta]) => ({ value, label: meta.label })),
                true,
              )}
              {renderSelect('sex', 'Sex', SEX_OPTIONS)}
              {renderInput('position', 'Position')}
              <div className="sm:col-span-2 lg:col-span-3">
                <AdditionalTypesField
                  baseId={baseId}
                  groupId={fieldId('additionalTraderTypes')}
                  mainType={values.traderType}
                  selected={values.additionalTraderTypes}
                  onToggle={toggleAdditionalType}
                  disabled={loading}
                  error={errors.additionalTraderTypes}
                />
              </div>
            </div>
          </fieldset>
        </div>

        {/* Location */}
        <div className="rounded-md border border-border bg-surface p-4 sm:p-6 shadow-sm">
          <fieldset className="border-0 p-0 m-0">
            <legend className="mb-4 text-base font-semibold text-fg">Location</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {renderRegionField()}
              {renderInput('district', 'District')}
              {renderInput('marketLocation', 'Market location')}
              {renderInput('gpsLatitude', 'GPS latitude', 'number', false, LATITUDE_HINT)}
              {renderInput('gpsLongitude', 'GPS longitude', 'number', false, LONGITUDE_HINT)}
            </div>
            {/* T-5 (FR-5): sibling below the grid, not a grid cell — a grid
                cell would cap the map at ~1/3 card width on lg. Mounted
                eagerly (FR-7): this is a desktop admin surface, and seeing a
                wrong pin without clicking is the whole point (proposal
                Success Criteria 2). */}
            <div className="mt-4">
              <CoordinatePicker
                initiallyOpen
                latitude={values.gpsLatitude}
                longitude={values.gpsLongitude}
                disabled={loading}
                onChange={(lat, lng) => {
                  setField('gpsLatitude', lat);
                  setField('gpsLongitude', lng);
                }}
              />
            </div>
          </fieldset>
        </div>

        {/* Capacity & support */}
        <div className="rounded-md border border-border bg-surface p-4 sm:p-6 shadow-sm">
          <fieldset className="border-0 p-0 m-0">
            <legend className="mb-4 text-base font-semibold text-fg">Capacity & support</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {renderInput('capacityTons', 'Capacity (tons)', 'number', true, 'Must be 0 or greater')}
              {renderTextarea('technicalSupport', 'Technical support required')}
            </div>
          </fieldset>
        </div>

        {/* Contact */}
        <div className="rounded-md border border-border bg-surface p-4 sm:p-6 shadow-sm">
          <fieldset className="border-0 p-0 m-0">
            <legend className="mb-4 text-base font-semibold text-fg">Contact</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {renderInput('contactPerson', 'Contact person', 'text', true, undefined, CONTACT_PERSON_MAX_LENGTH)}
              {renderInput('phone', 'Phone', 'text', true, undefined, PHONE_MAX_LENGTH)}
              {renderInput('email', 'Email', 'email', true, undefined, EMAIL_MAX_LENGTH)}
            </div>
          </fieldset>
        </div>

        {/* Crops */}
        <div className="rounded-md border border-border bg-surface p-4 sm:p-6 shadow-sm">
          <fieldset className="border-0 p-0 m-0">
            <legend className="mb-4 text-base font-semibold text-fg">
              <span id={`${baseId}-crops-group-label`}>Crops</span>
              <span aria-hidden="true" className="ml-0.5 text-danger">*</span>
            </legend>
            <fieldset
              aria-labelledby={`${baseId}-crops-group-label`}
              aria-describedby={errors.crops ? `${baseId}-crops-error` : undefined}
              className="flex flex-wrap gap-4 border-0 p-0 m-0 min-w-0"
            >
              <legend className="sr-only" />
              {CROP_NAMES.map((crop) => {
                const id = `${baseId}-crop-${crop.value}`;
                const checked = values.crops.includes(crop.value);
                return (
                  <div key={crop.value} className="flex items-center gap-2">
                    <input
                      id={id}
                      type="checkbox"
                      value={crop.value}
                      checked={checked}
                      onChange={() => toggleCrop(crop.value)}
                      disabled={loading}
                      className="h-4 w-4 rounded border-border text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    />
                    <label htmlFor={id} className="text-sm text-fg">
                      {crop.label}
                    </label>
                  </div>
                );
              })}
            </fieldset>
            {errors.crops && (
              <p id={`${baseId}-crops-error`} role="alert" className="mt-1.5 text-xs text-danger">
                {errors.crops}
              </p>
            )}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {renderInput(
                'otherCrops',
                'Other crop(s)',
                'text',
                false,
                undefined,
                300,
              )}
            </div>
          </fieldset>
        </div>

        {/* Consent & provenance */}
        <div className="rounded-md border border-border bg-surface p-4 sm:p-6 shadow-sm">
          <fieldset className="border-0 p-0 m-0">
            <legend className="mb-4 text-base font-semibold text-fg">Consent & provenance</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {renderRegistrationSourceSelect()}
              {renderSelect('consentStatus', 'Consent status', CONSENT_OPTIONS, true)}
              {renderConsentMethodSelect()}
              {isLinkEvidenceFrozen(mode, values, initialValues)
                ? renderFrozenInput('consentObtainedAt', 'Consent obtained on', 'date')
                : renderInput('consentObtainedAt', 'Consent obtained on', 'date', false)}
              {isLinkEvidenceFrozen(mode, values, initialValues)
                ? renderFrozenInput('consentReference', 'Consent reference', 'text')
                : renderInput(
                    'consentReference',
                    'Consent reference',
                    'text',
                    false,
                    'Optional — e.g. document ID or email thread',
                  )}
            </div>
            {/* FR-15 — held here, uploaded by the page after the actor exists. */}
            {mode === 'create' && (
              <div className="mt-4">
                <ConsentDocumentField
                  mode="deferred"
                  token={token}
                  onAuthFailure={onAuthFailure}
                  file={documentFile}
                  onFileChange={setDocumentFile}
                  disabled={loading}
                />
              </div>
            )}
          </fieldset>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onSuccess()}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving…' : mode === 'create' ? 'Create actor' : 'Save changes'}
          </Button>
        </div>
      </form>

      <AcknowledgeDialog
        open={showAck}
        title="Publish this actor?"
        description="Setting consent to Granted publishes PII and GPS coordinates to the public directory. Only confirm if written consent is on file for this actor."
        acknowledgementText={ACKNOWLEDGEMENT_TEXT}
        confirmLabel="Grant consent"
        onConfirm={handleAckConfirm}
        onCancel={handleAckCancel}
        loading={loading}
      />

      <DuplicateConfirmDialog
        open={duplicateCandidates !== null}
        candidates={duplicateCandidates ?? []}
        onConfirm={handleDuplicateConfirm}
        onCancel={handleDuplicateCancel}
        loading={loading}
      />
    </>
  );
}
