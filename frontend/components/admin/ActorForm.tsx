// @sdd-spec admin/actor-crud-audit (T-8)
'use client';

/**
 * ActorForm — shared create/edit form for the admin actor registry (FR-8).
 *
 * Covers the full Actor field set in sections: Identity, Location/GPS,
 * Capacity & support, Contact (PII), Crops, and Consent.
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
  };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validate(values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!values.traderId.trim()) errors.traderId = 'Trader ID is required.';
  if (!values.traderName.trim()) errors.traderName = 'Trader name is required.';
  if (!values.region) errors.region = 'Region is required.';
  if (!values.traderType) errors.traderType = 'Trader type is required.';
  if (!values.consentStatus) errors.consentStatus = 'Consent status is required.';

  if (values.email.trim() && !isValidEmail(values.email)) {
    errors.email = 'Enter a valid email address.';
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

function buildDto(values: FormValues): AdminActorCreateInput {
  return {
    traderId: values.traderId.trim(),
    traderName: values.traderName.trim(),
    region: values.region,
    traderType: values.traderType,
    consentStatus: values.consentStatus as 'GRANTED' | 'DENIED' | 'UNKNOWN',
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
      const validationErrors = validate(values);
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }

      const dto = buildDto(values);

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
    type: 'text' | 'email' | 'number' = 'text',
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
        <fieldset className="rounded-md border border-border p-4 sm:p-6">
          <legend className="px-2 text-sm font-semibold text-fg">Identity</legend>
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

        {/* Location */}
        <fieldset className="rounded-md border border-border p-4 sm:p-6">
          <legend className="px-2 text-sm font-semibold text-fg">Location</legend>
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

        {/* Capacity & support */}
        <fieldset className="rounded-md border border-border p-4 sm:p-6">
          <legend className="px-2 text-sm font-semibold text-fg">Capacity & support</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {renderInput('capacityTons', 'Capacity (tons)', 'number', false, 'Must be 0 or greater')}
            {renderTextarea('technicalSupport', 'Technical support required')}
          </div>
        </fieldset>

        {/* Contact */}
        <fieldset className="rounded-md border border-border p-4 sm:p-6">
          <legend className="px-2 text-sm font-semibold text-fg">Contact</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {renderInput('phone', 'Phone')}
            {renderInput('email', 'Email', 'email')}
          </div>
        </fieldset>

        {/* Crops */}
        <fieldset className="rounded-md border border-border p-4 sm:p-6">
          <legend className="px-2 text-sm font-semibold text-fg">Crops</legend>
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

        {/* Consent */}
        <fieldset className="rounded-md border border-border p-4 sm:p-6">
          <legend className="px-2 text-sm font-semibold text-fg">Consent</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {renderSelect('consentStatus', 'Consent status', CONSENT_OPTIONS, true)}
          </div>
        </fieldset>

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
