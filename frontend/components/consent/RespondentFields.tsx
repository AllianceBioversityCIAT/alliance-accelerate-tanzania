'use client';

/**
 * RespondentFields — who is giving consent
 * (actors/consent-intake/consent-request-email T-8, FR-9 item 3, NFR-10).
 *
 * The organization is read-only (shown, not an input). Name, Position/Title,
 * Email and Telephone are required inputs, always EMPTY on first render —
 * never pre-filled from the actor's record, because the person who answers
 * may not be the person on file and these values are evidence, not an edit
 * (FR-10). Each error is tied to its input with `aria-describedby` and
 * `aria-invalid`; the parent maps both its own validation and the API's
 * `details[]` into `errors`, keyed by field.
 */

import { useId } from 'react';

import { RESPONDENT_FIELDS, type RespondentField } from '@/lib/content/consent-requests';

export type RespondentValues = Record<RespondentField, string>;
export type RespondentErrors = Partial<Record<RespondentField, string>>;

export interface RespondentFieldsProps {
  organization: string;
  values: RespondentValues;
  errors: RespondentErrors;
  disabled?: boolean;
  onChange: (field: RespondentField, value: string) => void;
}

const inputClass = (invalid: boolean) =>
  [
    'block w-full rounded-md border bg-surface px-3 py-2 text-sm text-fg shadow-xs',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-50',
    invalid ? 'border-danger' : 'border-border',
  ].join(' ');

export default function RespondentFields({
  organization,
  values,
  errors,
  disabled = false,
  onChange,
}: Readonly<RespondentFieldsProps>) {
  const baseId = useId();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-fg">Organization</p>
        <p className="break-words rounded-md border border-border bg-surface-alt px-3 py-2 text-sm font-semibold text-fg">
          {organization}
        </p>
      </div>

      {RESPONDENT_FIELDS.map((field) => {
        const id = `${baseId}-${field.key}`;
        const errorId = `${id}-error`;
        const error = errors[field.key];
        return (
          <div key={field.key} className="flex flex-col gap-1.5">
            <label htmlFor={id} className="text-sm font-medium text-fg">
              {field.label}
              <span aria-hidden="true" className="ml-0.5 text-danger">
                *
              </span>
            </label>
            <input
              id={id}
              name={field.key}
              type={field.type}
              autoComplete={field.autoComplete}
              required
              aria-required="true"
              value={values[field.key]}
              disabled={disabled}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(e) => onChange(field.key, e.target.value)}
              className={inputClass(Boolean(error))}
            />
            {error && (
              <p id={errorId} role="alert" className="text-xs text-danger">
                {error}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
