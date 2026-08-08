// @sdd-spec admin/actor-crud-audit (T-8)
'use client';

/**
 * ActorForm — shared create/edit form for the admin actor registry (FR-8).
 *
 * Covers the full Actor field set in sections: Identity, Location/GPS,
 * Capacity & support, Contact (PII), Crops, and Consent & provenance.
 *
 * Client validation mirrors the backend DTOs. Server 400 field errors and
 * 409 duplicate traderId are mapped inline via aria-describedby. A change
 * that sets consentStatus to GRANTED from another status (or in create mode)
 * opens the existing AcknowledgeDialog and only sends acknowledged: true
 * after typed confirmation.
 *
 * Static-export safe (no SSR); tokens only (system-design §7); WCAG 2.1 AA.
 */

import { useCallback, useId, useState } from 'react';

import { AcknowledgeDialog } from './AcknowledgeDialog';
import Button from '../ui/Button';

import { REGIONS } from '@/lib/content/regions';
import { ROLES } from '@/lib/content/roles';
import {
  createActor,
  updateActor,
  type AdminActor,
  type AdminActorCreateInput,
  type ConsentMethod,
  type RegistrationSource,
} from '@/lib/api/actors-admin';
import { ApiError, AuthFailureError } from '@/lib/api/client';

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

/**
 * T-9 (FR-2, FR-6) — mirrors the labels used by the admin actors table filter
 * (`app/(admin)/admin/actors/page.tsx` `CONSENT_METHOD_OPTIONS`) so the same
 * enum reads identically everywhere in the admin console. `NOT_RECORDED` is
 * listed deliberately (it is the schema default, not an "unset" sentinel) —
 * the select has no separate blank option, see `renderConsentMethodSelect`.
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
  sex: string;
  position: string;
  region: string;
  district: string;
  marketLocation: string;
  gpsLatitude: string;
  gpsLongitude: string;
  gpsAltitude: string;
  gpsAccuracy: string;
  capacityTons: string;
  technicalSupport: string;
  phone: string;
  email: string;
  crops: string[];
  consentStatus: string;
  /**
   * T-9 (FR-6 closure) — mirrors the backend `RegistrationSource` enum.
   * Non-nullable with a schema default (`TEAM_MANAGED`) — always a real
   * value, never a blank sentinel, exactly like `consentMethod` below.
   */
  registrationSource: string;
  /** T-9 (FR-2) — mirrors the backend `ConsentMethod` enum; always a real value, never a blank sentinel. */
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
  onSuccess: () => void;
  onAuthFailure: () => void;
}

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
      sex: '',
      position: '',
      region: '',
      district: '',
      marketLocation: '',
      gpsLatitude: '',
      gpsLongitude: '',
      gpsAltitude: '',
      gpsAccuracy: '',
      capacityTons: '',
      technicalSupport: '',
      phone: '',
      email: '',
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
    sex: actor.sex ?? '',
    position: actor.position ?? '',
    region: actor.region,
    district: actor.district ?? '',
    marketLocation: actor.marketLocation ?? '',
    gpsLatitude: actor.gpsLatitude?.toString() ?? '',
    gpsLongitude: actor.gpsLongitude?.toString() ?? '',
    gpsAltitude: actor.gpsAltitude?.toString() ?? '',
    gpsAccuracy: actor.gpsAccuracy?.toString() ?? '',
    capacityTons: actor.capacityTons?.toString() ?? '',
    technicalSupport: actor.technicalSupport ?? '',
    phone: actor.phone ?? '',
    email: actor.email ?? '',
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

function validate(
  values: FormValues,
  mode: 'create' | 'edit',
  initialValues?: AdminActor,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!values.traderId.trim()) errors.traderId = 'Trader ID is required.';
  if (!values.traderName.trim()) errors.traderName = 'Trader name is required.';
  if (!values.region) errors.region = 'Region is required.';
  if (!values.traderType) errors.traderType = 'Trader type is required.';
  if (!values.consentStatus) errors.consentStatus = 'Consent status is required.';

  if (values.email.trim() && !isValidEmail(values.email)) {
    errors.email = 'Enter a valid email address.';
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
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      errors.gpsLatitude = 'Latitude must be between -90 and 90.';
    }
  }

  if (values.gpsLongitude.trim()) {
    const lng = Number(values.gpsLongitude);
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      errors.gpsLongitude = 'Longitude must be between -180 and 180.';
    }
  }

  if (values.capacityTons.trim()) {
    const cap = Number(values.capacityTons);
    if (Number.isNaN(cap) || cap < 0) {
      errors.capacityTons = 'Capacity must be 0 or greater.';
    }
  }

  return errors;
}

function buildDto(
  values: FormValues,
  mode: 'create' | 'edit',
  initialValues?: AdminActor,
): AdminActorCreateInput {
  return {
    traderId: values.traderId.trim(),
    traderName: values.traderName.trim(),
    region: values.region,
    traderType: values.traderType,
    consentStatus: values.consentStatus as 'GRANTED' | 'DENIED' | 'UNKNOWN',
    registrationSource: values.registrationSource as RegistrationSource,
    consentMethod: values.consentMethod as ConsentMethod,
    consentObtainedAt: resolveConsentObtainedAt(values, mode, initialValues),
    // C-3/E-1 carry-forward: '' and null are NOT the same to isSameValue() in
    // consent-provenance.policy.ts. Keep the trim()||null idiom so a legacy
    // actor's stored null round-trips as null, never as '' (which would read
    // as "changed" and re-trigger the FR-3 guard server-side on an unrelated edit).
    consentReference: values.consentReference.trim() || null,
    district: values.district.trim() || null,
    sex: values.sex || null,
    position: values.position.trim() || null,
    marketLocation: values.marketLocation.trim() || null,
    capacityTons: values.capacityTons.trim() ? Number(values.capacityTons) : null,
    technicalSupport: values.technicalSupport.trim() || null,
    phone: values.phone.trim() || null,
    email: values.email.trim() || null,
    gpsLatitude: values.gpsLatitude.trim() ? Number(values.gpsLatitude) : null,
    gpsLongitude: values.gpsLongitude.trim() ? Number(values.gpsLongitude) : null,
    gpsAltitude: values.gpsAltitude.trim() ? Number(values.gpsAltitude) : null,
    gpsAccuracy: values.gpsAccuracy.trim() ? Number(values.gpsAccuracy) : null,
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

function mapApiError(err: unknown): { formError?: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};

  if (err instanceof ApiError) {
    if (err.status === 409) {
      fieldErrors.traderId = err.message;
      return { fieldErrors };
    }

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ActorForm({
  mode,
  initialValues,
  token,
  onSuccess,
  onAuthFailure,
}: ActorFormProps) {
  const [values, setValues] = useState<FormValues>(() => toFormValues(initialValues));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAck, setShowAck] = useState(false);
  const [pendingDto, setPendingDto] = useState<AdminActorCreateInput | null>(null);

  const baseId = useId();

  const fieldId = useCallback((field: keyof FormValues) => `${baseId}-${field}`, [baseId]);

  const setField = useCallback(<K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setFormError(null);
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
    async (dto: AdminActorCreateInput) => {
      setLoading(true);
      setFormError(null);
      setErrors({});

      try {
        if (mode === 'create') {
          await createActor(dto, token);
        } else {
          if (!initialValues) throw new Error('Missing actor id for update.');
          await updateActor(initialValues.id, dto, token);
        }
        onSuccess();
      } catch (err) {
        if (err instanceof AuthFailureError) {
          onAuthFailure();
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
    [mode, initialValues, token, onSuccess, onAuthFailure],
  );

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

  const renderInput = (
    field: keyof FormValues,
    label: string,
    type: 'text' | 'email' | 'number' | 'date' = 'text',
    required = false,
    hint?: string,
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
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={inputClasses(!!error)}
        />
      </Field>
    );
  };

  const renderTextarea = (field: keyof FormValues, label: string, required = false) => {
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
   * second way to express the same state (and one that fails `@IsIn` server-
   * side if ever submitted, since `''` is not a member of `ConsentMethod`).
   */
  const renderConsentMethodSelect = () => {
    const id = fieldId('consentMethod');
    const error = errors.consentMethod;
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
              {renderInput('traderId', 'Trader ID', 'text', true)}
              {renderInput('traderName', 'Trader name', 'text', true)}
              {renderSelect(
                'traderType',
                'Trader type',
                Object.entries(ROLES).map(([value, meta]) => ({ value, label: meta.label })),
                true,
              )}
              {renderSelect('sex', 'Sex', SEX_OPTIONS)}
              {renderInput('position', 'Position')}
            </div>
          </fieldset>
        </div>

        {/* Location */}
        <div className="rounded-md border border-border bg-surface p-4 sm:p-6 shadow-sm">
          <fieldset className="border-0 p-0 m-0">
            <legend className="mb-4 text-base font-semibold text-fg">Location</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {renderSelect(
                'region',
                'Region',
                REGIONS.map((r) => ({ value: r, label: r })),
                true,
              )}
              {renderInput('district', 'District')}
              {renderInput('marketLocation', 'Market location')}
              {renderInput('gpsLatitude', 'GPS latitude', 'number', false, 'Decimal between -90 and 90')}
              {renderInput('gpsLongitude', 'GPS longitude', 'number', false, 'Decimal between -180 and 180')}
              {renderInput('gpsAltitude', 'GPS altitude', 'number')}
              {renderInput('gpsAccuracy', 'GPS accuracy', 'number')}
            </div>
          </fieldset>
        </div>

        {/* Capacity & support */}
        <div className="rounded-md border border-border bg-surface p-4 sm:p-6 shadow-sm">
          <fieldset className="border-0 p-0 m-0">
            <legend className="mb-4 text-base font-semibold text-fg">Capacity & support</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {renderInput('capacityTons', 'Capacity (tons)', 'number', false, 'Must be 0 or greater')}
              {renderTextarea('technicalSupport', 'Technical support required')}
            </div>
          </fieldset>
        </div>

        {/* Contact */}
        <div className="rounded-md border border-border bg-surface p-4 sm:p-6 shadow-sm">
          <fieldset className="border-0 p-0 m-0">
            <legend className="mb-4 text-base font-semibold text-fg">Contact</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {renderInput('phone', 'Phone')}
              {renderInput('email', 'Email', 'email')}
            </div>
          </fieldset>
        </div>

        {/* Crops */}
        <div className="rounded-md border border-border bg-surface p-4 sm:p-6 shadow-sm">
          <fieldset className="border-0 p-0 m-0">
            <legend className="mb-4 text-base font-semibold text-fg">Crops</legend>
            <div className="flex flex-wrap gap-4">
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
              {renderInput('consentObtainedAt', 'Consent obtained on', 'date', false)}
              {renderInput(
                'consentReference',
                'Consent reference',
                'text',
                false,
                'Optional — e.g. document ID or email thread',
              )}
            </div>
          </fieldset>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onSuccess}
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
    </>
  );
}
