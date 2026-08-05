'use client';

/**
 * RegistrationForm — public self-registration form (T-17, FR-2 scenarios 2–4).
 *
 * Follows `ActorForm.tsx` (frontend/components/admin/ActorForm.tsx): plain
 * `useState` for `values`/`errors`, hand-written change handlers and a
 * hand-written DTO builder — no react-hook-form, no zod, no shadcn (none are
 * in this project's `package.json`).
 *
 * Five fieldsets per design.md §5.1 — Identity · Location · Crops & capacity ·
 * Contact · Data protection & consent — mapped onto the 13 fields of
 * `RegistrationPayloadDto` (backend/src/registrations/dto/registration-create.dto.ts)
 * plus the one top-level, OTP-verified `email` (see the T-19-seam note below):
 *   Identity          → traderName, traderType
 *   Location          → region, district, marketLocation, gpsLatitude, gpsLongitude
 *   Crops & capacity  → crops, otherCrops, capacityTons
 *   Contact           → contactPerson, position, sex, phone, email
 *   Data protection & consent → placeholder seam for T-18 (see below)
 *
 * Scope boundary (Leader's brief): this component owns FR-2 only.
 *   - **T-18 seam.** The fifth fieldset renders a minimal, unticked
 *     acceptance checkbox and NOT the real scrollable, scroll-gated policy
 *     text `ConsentPolicyDisclosure` fetches from `GET
 *     /registrations/consent-policy` (design.md §5.2, FR-3). It is a
 *     structural placeholder only — the real disclosure component replaces
 *     this fieldset's body without needing to restructure the surrounding
 *     form. `consentAccepted`/`consentPolicyVersion` stay in this
 *     component's own `values` so the "one error source" property (below)
 *     is not broken by lifting consent state elsewhere.
 *   - **T-19 seam.** This component never calls the network. On successful
 *     validation it calls `onValidated(payload, consent, email)` and stops —
 *     the parent page (T-19's `OtpVerificationStep`) owns requesting/
 *     consuming the OTP and the actual `POST /registrations` call.
 *     *(Corrected 2026-08-05 — Reviewer FAIL, attempt 2.)* `email` IS
 *     collected here, in the Contact fieldset, and format-validated
 *     client-side against the server's `@IsEmail()` on
 *     `RegistrationCreateDto.email` (registration-create.dto.ts:215) — it
 *     joins the same `errors` record as every other field. It is handed up
 *     as a THIRD, top-level argument, a sibling of `payload`/`consent`,
 *     mirroring design.md §3.1's request shape `{ email, code, consent,
 *     payload }`. `RegistrationPayloadDto` still carries no `email` (design.md
 *     §4.1, S-6): the one verified address is collected once, here, and
 *     travels top-level — never folded into `payload`, never duplicated. This
 *     component still does not call the network; T-19 verifies control of
 *     the same address via the OTP round trip.
 *
 * Error contract (disqualifying clause): `errors` is the ONE `Record<string,
 * string>` state that both the summary and every inline message read from.
 * There is no second, derived, or cached copy — see the render below, where
 * both the summary list and each `<Field>`'s inline message index the same
 * `errors` object by the same key.
 *
 * Tokens only (NFR-6) — every class here resolves through
 * `tailwind.config.ts` / `app/globals.css`; zero hex literals. No entrance
 * motion (A26) — nothing here animates on mount.
 */

import { useCallback, useId, useState } from 'react';

import { ROLES } from '@/lib/content/roles';
import { REGIONS } from '@/lib/content/regions';

// ---------------------------------------------------------------------------
// Constants — mirrors design.md §4.1 / registration-create.dto.ts verbatim
// ---------------------------------------------------------------------------

/** Matches `RegistrationPayloadDto.crops`'s `CROP_NAMES` (three canonical crops). */
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

/** `@MaxLength` bounds, transcribed field-for-field from `registration-create.dto.ts`. */
const MAX_LENGTHS = {
  traderName: 200,
  contactPerson: 120,
  position: 120,
  district: 120,
  marketLocation: 120,
  otherCrops: 300,
  phone: 40,
} as const;

/**
 * Client-side mirror of the server's `@IsEmail()` on
 * `RegistrationCreateDto.email` (registration-create.dto.ts:215) — a
 * pragmatic email-shape check, not a full RFC 5322 implementation. It is
 * NOT the gate: FR-2 scenario 1 requires server-side validation regardless
 * of any client-side check, so a determined attacker bypassing this regex
 * still hits the same `@IsEmail()` on submission.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Human labels for the error summary — keyed identically to `FormValues`/`errors`. */
const FIELD_LABELS: Record<keyof FormValues, string> = {
  traderName: 'Organisation name',
  traderType: 'Trader type',
  contactPerson: 'Contact person',
  position: 'Position',
  district: 'District',
  marketLocation: 'Market location',
  sex: 'Sex',
  region: 'Region',
  gpsLatitude: 'GPS latitude',
  gpsLongitude: 'GPS longitude',
  crops: 'Crops',
  otherCrops: 'Other crop(s)',
  capacityTons: 'Capacity (tons)',
  phone: 'Phone',
  email: 'Email',
  consentAccepted: 'Data protection & consent',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormValues {
  traderName: string;
  traderType: string;
  contactPerson: string;
  position: string;
  district: string;
  marketLocation: string;
  sex: string;
  region: string;
  gpsLatitude: string;
  gpsLongitude: string;
  crops: string[];
  otherCrops: string;
  capacityTons: string;
  phone: string;
  /**
   * The one verified, top-level address (S-6) — NOT part of
   * `RegistrationPayloadInput`/`RegistrationPayloadDto`. See the file
   * header's T-19-seam note.
   */
  email: string;
  /** T-18 seam — see file header. Unticked at every initial render (FR-3). */
  consentAccepted: boolean;
}

/**
 * The payload this component builds and hands upward — shape mirrors
 * `RegistrationPayloadDto` exactly. Optional fields are OMITTED, never sent
 * as `''` — see {@link buildPayload}'s doc for why this is load-bearing
 * (a live trap surfaced during T-9's review: a blank `useState` number input
 * yields `''`, and `''` fails the DTO's `@IsNumber()` with a 400 on a field
 * FR-2 requires to be optional).
 */
export interface RegistrationPayloadInput {
  traderName: string;
  traderType: string;
  contactPerson: string;
  position?: string;
  district?: string;
  marketLocation?: string;
  sex?: string;
  region: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
  crops: string[];
  otherCrops?: string;
  capacityTons: number;
  phone: string;
}

/** T-18 seam — the applicant's consent acceptance, mirroring `ConsentInputDto`. */
export interface RegistrationConsentInput {
  accepted: boolean;
  /**
   * Placeholder version literal. T-18 replaces this with the version
   * `GET /registrations/consent-policy` actually served, per design.md §4.2
   * ("not duplicated into the frontend bundle") — this component must not
   * invent or hardcode a real version string.
   */
  policyVersion: string;
}

export interface RegistrationFormProps {
  /**
   * Called once client-side validation (including the T-18-seam consent
   * checkbox and the email format check) passes. This component does not
   * call the network — the parent page advances to consent disclosure
   * (T-18) / OTP verification (T-19) from here. `email` is a THIRD, top-level
   * argument — a sibling of `payload`/`consent`, mirroring design.md §3.1's
   * request shape `{ email, code, consent, payload }` — not a property of
   * `payload` (see the file header's T-19-seam note and S-6).
   */
  onValidated: (
    payload: RegistrationPayloadInput,
    consent: RegistrationConsentInput,
    email: string,
  ) => void;
  /** T-19 seam — parent sets this while an OTP/final-submit round trip is in flight. */
  submitting?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toFormValues(): FormValues {
  return {
    traderName: '',
    traderType: '',
    contactPerson: '',
    position: '',
    district: '',
    marketLocation: '',
    sex: '',
    region: '',
    gpsLatitude: '',
    gpsLongitude: '',
    crops: [],
    otherCrops: '',
    capacityTons: '',
    phone: '',
    email: '',
    consentAccepted: false,
  };
}

/**
 * Parses an optional numeric field, returning `undefined` (never `''`) when
 * blank. Checks for the empty string explicitly rather than falsy-ness so a
 * real `0` — a legitimate latitude/longitude near the equator (Tanzania) —
 * is never dropped. This is the S-6/T-9-review fix, applied client-side:
 * `buildPayload` must never emit `''` for `gpsLatitude`/`gpsLongitude`, or a
 * both-blank GPS submission (FR-2 scenario 3, required to be ACCEPTED) gets
 * a spurious 400 from the server's `@IsNumber()`.
 */
function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : Number(trimmed);
}

function trimmedOrUndefined(raw: string): string | undefined {
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Builds the payload handed to `onValidated`. Optional fields that are blank
 * are OMITTED (the property is `undefined`) rather than sent as `''` — see
 * {@link parseOptionalNumber}. `JSON.stringify` drops `undefined`-valued
 * properties entirely, which is what "the emitted payload has no `''`
 * values" (and no such *keys*, for the GPS pair) means in practice once this
 * is threaded through `apiFetch` in a later task.
 */
function buildPayload(values: FormValues): RegistrationPayloadInput {
  return {
    traderName: values.traderName.trim(),
    traderType: values.traderType,
    contactPerson: values.contactPerson.trim(),
    position: trimmedOrUndefined(values.position),
    district: trimmedOrUndefined(values.district),
    marketLocation: trimmedOrUndefined(values.marketLocation),
    sex: values.sex || undefined,
    region: values.region,
    gpsLatitude: parseOptionalNumber(values.gpsLatitude),
    gpsLongitude: parseOptionalNumber(values.gpsLongitude),
    crops: values.crops,
    otherCrops: trimmedOrUndefined(values.otherCrops),
    capacityTons: Number(values.capacityTons),
    phone: values.phone.trim(),
  };
}

/**
 * Validates against the SAME bounds `registration-create.dto.ts` enforces
 * server-side (FR-2 scenario 1: "validated on the server regardless of any
 * client-side validation" — this is the client mirror, not the gate).
 *
 * Returns the single `errors` record the summary and every inline message
 * both read from — see the file header's Error contract note.
 */
function validate(values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!values.traderName.trim()) {
    errors.traderName = 'Organisation name is required.';
  } else if (values.traderName.trim().length > MAX_LENGTHS.traderName) {
    errors.traderName = `Must be ${MAX_LENGTHS.traderName} characters or fewer.`;
  }

  if (!values.traderType) errors.traderType = 'Select a trader type.';

  if (!values.contactPerson.trim()) {
    errors.contactPerson = 'Contact person is required.';
  } else if (values.contactPerson.trim().length > MAX_LENGTHS.contactPerson) {
    errors.contactPerson = `Must be ${MAX_LENGTHS.contactPerson} characters or fewer.`;
  }

  if (values.position.trim().length > MAX_LENGTHS.position) {
    errors.position = `Must be ${MAX_LENGTHS.position} characters or fewer.`;
  }
  if (values.district.trim().length > MAX_LENGTHS.district) {
    errors.district = `Must be ${MAX_LENGTHS.district} characters or fewer.`;
  }
  if (values.marketLocation.trim().length > MAX_LENGTHS.marketLocation) {
    errors.marketLocation = `Must be ${MAX_LENGTHS.marketLocation} characters or fewer.`;
  }

  if (!values.region) errors.region = 'Select a region.';

  // Coordinate pairing (FR-2 scenario 3): exactly one of two is rejected;
  // both blank is accepted; both present are range-checked independently.
  const latRaw = values.gpsLatitude.trim();
  const lngRaw = values.gpsLongitude.trim();
  if (latRaw && !lngRaw) {
    errors.gpsLongitude = 'Enter both coordinates, or leave both blank.';
  } else if (!latRaw && lngRaw) {
    errors.gpsLatitude = 'Enter both coordinates, or leave both blank.';
  } else if (latRaw && lngRaw) {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      errors.gpsLatitude = 'Latitude must be between -90 and 90.';
    }
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      errors.gpsLongitude = 'Longitude must be between -180 and 180.';
    }
  }

  if (values.crops.length === 0) errors.crops = 'Select at least one crop.';

  if (values.otherCrops.trim().length > MAX_LENGTHS.otherCrops) {
    errors.otherCrops = `Must be ${MAX_LENGTHS.otherCrops} characters or fewer.`;
  }

  const capacityTrimmed = values.capacityTons.trim();
  if (!capacityTrimmed) {
    errors.capacityTons = 'Capacity is required.';
  } else {
    const cap = Number(capacityTrimmed);
    if (Number.isNaN(cap) || cap < 0) {
      errors.capacityTons = 'Capacity must be 0 or greater.';
    }
  }

  if (!values.phone.trim()) {
    errors.phone = 'Phone is required.';
  } else if (values.phone.trim().length > MAX_LENGTHS.phone) {
    errors.phone = `Must be ${MAX_LENGTHS.phone} characters or fewer.`;
  }

  if (!values.email.trim()) {
    errors.email = 'Email is required.';
  } else if (!EMAIL_REGEX.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }

  if (!values.consentAccepted) {
    errors.consentAccepted = 'You must accept the policy before continuing.';
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Reusable field wrapper — mirrors ActorForm.tsx's `Field`
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
      {/* `describedBy` is threaded onto the control by the caller via aria-describedby={describedBy}; kept here for reference by both hint and error ids below. */}
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
    'placeholder:text-muted',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-50',
    error ? 'border-danger' : 'border-border',
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RegistrationForm({ onValidated, submitting = false }: RegistrationFormProps) {
  const [values, setValues] = useState<FormValues>(toFormValues);
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const validationErrors = validate(values);
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }
      const payload = buildPayload(values);
      onValidated(
        payload,
        { accepted: values.consentAccepted, policyVersion: '' },
        values.email.trim(),
      );
    },
    [values, onValidated],
  );

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
          disabled={submitting}
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
    type: 'text' | 'number' | 'email' = 'text',
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
          disabled={submitting}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={[hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined}
          className={inputClasses(!!error)}
        />
      </Field>
    );
  };

  const errorCount = Object.keys(errors).length;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {/*
        Error summary — the SAME `errors` object every inline message below
        reads from. This is what makes the two provably unable to disagree:
        there is no second `summaryErrors` state, no derived snapshot taken
        at submit time — every render re-reads this one object.
      */}
      {errorCount > 0 && (
        <div
          role="alert"
          aria-live="assertive"
          data-testid="error-summary"
          className="rounded-md border border-danger bg-danger-soft px-4 py-4 text-sm text-danger"
        >
          <p className="font-semibold">
            {errorCount} field{errorCount === 1 ? '' : 's'} need attention:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {Object.entries(errors).map(([field, message]) => (
              <li key={field}>
                <a href={`#${fieldId(field as keyof FormValues)}`} className="underline">
                  {FIELD_LABELS[field as keyof FormValues] ?? field}
                </a>
                : {message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Identity */}
      <fieldset className="rounded-md border border-border p-4 sm:p-6">
        <legend className="px-2 text-sm font-semibold text-fg">Identity</legend>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {renderInput('traderName', 'Organisation name', 'text', true)}
          {renderSelect(
            'traderType',
            'Trader type',
            Object.entries(ROLES).map(([value, meta]) => ({ value, label: meta.label })),
            true,
          )}
        </div>
      </fieldset>

      {/* Location */}
      <fieldset className="rounded-md border border-border p-4 sm:p-6">
        <legend className="px-2 text-sm font-semibold text-fg">Location</legend>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {renderSelect(
            'region',
            'Region',
            REGIONS.map((r) => ({ value: r, label: r })),
            true,
          )}
          {renderInput('district', 'District')}
          {renderInput('marketLocation', 'Market location')}
        </div>
        {/* GPS-optional copy (A25, FR-2 scenario 3) — stated, not just a placeholder hint on one field. */}
        <p className="mt-4 text-xs text-muted">
          GPS coordinates are optional. You may leave both fields blank — a reviewer will place your
          organisation on the map using the region and district above.
        </p>
        <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {renderInput('gpsLatitude', 'GPS latitude', 'number', false, 'Decimal between -90 and 90')}
          {renderInput('gpsLongitude', 'GPS longitude', 'number', false, 'Decimal between -180 and 180')}
        </div>
      </fieldset>

      {/* Crops & capacity */}
      <fieldset className="rounded-md border border-border p-4 sm:p-6">
        <legend className="px-2 text-sm font-semibold text-fg">Crops & capacity</legend>
        <div className="flex flex-col gap-1.5">
          <span id={`${baseId}-crops-label`} className="text-sm font-medium text-fg">
            Crops <span aria-hidden="true" className="ml-0.5 text-danger">*</span>
          </span>
          {/*
            A labelled group, not a bare div (Reviewer FAIL, attempt 2): the
            group carries the id the error summary's anchor already targets
            (`fieldId('crops')` === `${baseId}-crops`) so that link resolves,
            and `aria-describedby` pointing at the inline error so a
            screen-reader user gets the same association every other
            errored control gets.
          */}
          <div
            id={fieldId('crops')}
            role="group"
            aria-labelledby={`${baseId}-crops-label`}
            aria-describedby={errors.crops ? `${baseId}-crops-error` : undefined}
            className="flex flex-wrap gap-4"
          >
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
                    disabled={submitting}
                    className="h-4 w-4 rounded border-border text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  />
                  <label htmlFor={id} className="text-sm text-fg">
                    {crop.label}
                  </label>
                </div>
              );
            })}
          </div>
          {errors.crops && (
            <p id={`${baseId}-crops-error`} role="alert" className="text-xs text-danger">
              {errors.crops}
            </p>
          )}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {renderInput('otherCrops', 'Other crop(s)', 'text', false, 'Review context — not published to the public directory')}
          {renderInput('capacityTons', 'Capacity (tons)', 'number', true)}
        </div>
      </fieldset>

      {/* Contact */}
      <fieldset className="rounded-md border border-border p-4 sm:p-6">
        <legend className="px-2 text-sm font-semibold text-fg">Contact</legend>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {renderInput('contactPerson', 'Contact person', 'text', true, 'Review context — not published to the public directory')}
          {renderInput('position', 'Position')}
          {renderSelect('sex', 'Sex', SEX_OPTIONS)}
          {renderInput('phone', 'Phone', 'text', true)}
          {/*
            The one verified, top-level `email` (S-6) — collected here, not
            in `RegistrationPayloadDto`. See the file header's T-19-seam
            note. Format-validated client-side against `@IsEmail()`;
            verification of control happens later, in T-19's OTP step.
          */}
          {renderInput('email', 'Email', 'email', true)}
        </div>
      </fieldset>

      {/* Data protection & consent — T-18 seam, see file header */}
      <fieldset className="rounded-md border border-border p-4 sm:p-6">
        <legend className="px-2 text-sm font-semibold text-fg">Data protection & consent</legend>
        {/*
          T-18 replaces this paragraph and checkbox with `ConsentPolicyDisclosure`
          (design.md §5.2): a scrollable rendering of `GET
          /registrations/consent-policy`'s sections, a focusable scroll region,
          and a checkbox that stays disabled until the pure end-detection
          predicate reports the end has been reached. This placeholder keeps
          the fieldset structurally present and its acceptance state part of
          THIS component's one `errors`/`values` pair, so T-18 can swap the
          body in without relocating consent out of the shared error contract.
        */}
        <p className="text-sm text-muted">
          By submitting, you agree that the information above may be published in the public seed
          system registry once reviewed and approved by the ACCELERATE Tanzania team.
        </p>
        <div className="mt-3 flex items-start gap-2">
          <input
            id={fieldId('consentAccepted')}
            type="checkbox"
            checked={values.consentAccepted}
            onChange={(e) => setField('consentAccepted', e.target.checked)}
            disabled={submitting}
            aria-describedby={errors.consentAccepted ? `${fieldId('consentAccepted')}-error` : undefined}
            className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          />
          <label htmlFor={fieldId('consentAccepted')} className="text-sm text-fg">
            I have read and accept the Data Protection & Participant Consent Policy.
          </label>
        </div>
        {errors.consentAccepted && (
          <p id={`${fieldId('consentAccepted')}-error`} role="alert" className="mt-1.5 text-xs text-danger">
            {errors.consentAccepted}
          </p>
        )}
      </fieldset>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className={[
            'inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium leading-none',
            'rounded-md bg-primary text-primary-fg hover:bg-primary-hover',
            'transition-colors motion-reduce:transition-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
          ].join(' ')}
        >
          {submitting ? 'Please wait…' : 'Continue to verification'}
        </button>
      </div>
    </form>
  );
}
