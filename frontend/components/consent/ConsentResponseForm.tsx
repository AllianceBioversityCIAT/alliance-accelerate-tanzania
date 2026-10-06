'use client';

/**
 * ConsentResponseForm — the consent text, the respondent's identity and the
 * Accept / Decline actions (actors/consent-intake/consent-request-email T-8,
 * FR-9, FR-10 UI, NFR-10).
 *
 * - **Accept** needs the acceptance checkbox (behind the scroll gate, shared
 *   with the registration form via `ConsentTextScrollGate`) AND all four
 *   respondent fields. Validation failures set field errors and make NO call;
 *   the API enforces the same rules independently, and its `details[]` come
 *   back in through `serverErrors`.
 * - **Decline** needs nothing: it opens a confirm step, and only the
 *   confirmation calls `onDecline` — with no identity at all.
 *
 * The parent owns the network call; this component owns only the draft
 * (values, checkbox, local errors, confirm step). Nothing here edits the
 * actor's record (FR-9 BUT clause).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import ConsentTextScrollGate from '@/components/register/ConsentTextScrollGate';
import ConsentRichText from './ConsentRichText';
import RespondentFields, {
  type RespondentErrors,
  type RespondentValues,
} from './RespondentFields';
import type { ConsentRespondent, ConsentViewEdition } from '@/lib/api/consent-public';
import {
  CONSENT_PAGE_COPY,
  RESPONDENT_FIELDS,
  type RespondentField,
} from '@/lib/content/consent-requests';

export interface ConsentServerErrors {
  respondent: RespondentErrors;
  accepted?: string;
}

export interface ConsentResponseFormProps {
  organization: string;
  edition: ConsentViewEdition;
  submitting: boolean;
  /** Form-level failure (network, throttle, unexpected) — not a field error. */
  submitError: string | null;
  /** Field errors mapped from the API's `details[]`. */
  serverErrors: ConsentServerErrors;
  onAccept: (respondent: ConsentRespondent) => void;
  onDecline: () => void;
}

const EMPTY_VALUES: RespondentValues = { name: '', position: '', email: '', phone: '' };
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const buttonBase = [
  'inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium leading-none',
  'transition-colors motion-reduce:transition-none',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');

export default function ConsentResponseForm({
  organization,
  edition,
  submitting,
  submitError,
  serverErrors,
  onAccept,
  onDecline,
}: ConsentResponseFormProps) {
  const [values, setValues] = useState<RespondentValues>(EMPTY_VALUES);
  const [checked, setChecked] = useState(false);
  const [errors, setErrors] = useState<RespondentErrors>({});
  const [acceptedError, setAcceptedError] = useState<string | undefined>(undefined);
  const [confirmingDecline, setConfirmingDecline] = useState(false);

  const formRef = useRef<HTMLFormElement | null>(null);
  const confirmRef = useRef<HTMLDivElement | null>(null);
  const declineButtonRef = useRef<HTMLButtonElement | null>(null);

  // Adopt the API's field errors when a response brings new ones.
  useEffect(() => {
    setErrors(serverErrors.respondent);
    setAcceptedError(serverErrors.accepted);
  }, [serverErrors]);

  useEffect(() => {
    if (confirmingDecline) confirmRef.current?.focus();
  }, [confirmingDecline]);

  const handleFieldChange = useCallback((field: RespondentField, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }, []);

  const handleCheck = useCallback((next: boolean) => {
    setChecked(next);
    if (next) setAcceptedError(undefined);
  }, []);

  const handleAccept = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed: RespondentValues = {
      name: values.name.trim(),
      position: values.position.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
    };

    const next: RespondentErrors = {};
    for (const field of RESPONDENT_FIELDS) {
      if (!trimmed[field.key]) next[field.key] = field.required;
    }
    if (trimmed.email && !EMAIL_SHAPE.test(trimmed.email)) {
      next.email = 'Enter a valid email address.';
    }
    const missingCheck = !checked;

    setErrors(next);
    setAcceptedError(missingCheck ? CONSENT_PAGE_COPY.checkboxRequired : undefined);

    const firstInvalid = RESPONDENT_FIELDS.find((f) => next[f.key]);
    if (firstInvalid) {
      formRef.current?.querySelector<HTMLInputElement>(`input[name="${firstInvalid.key}"]`)?.focus();
    }
    if (firstInvalid || missingCheck) return;

    onAccept(trimmed);
  };

  const closeConfirm = () => {
    setConfirmingDecline(false);
    declineButtonRef.current?.focus();
  };

  return (
    <form ref={formRef} onSubmit={handleAccept} noValidate className="flex flex-col gap-8">
      <ConsentTextScrollGate
        title={CONSENT_PAGE_COPY.consentTitle}
        // The registry's versions already carry the "v" ("v1.0"); the gate prefixes one.
        version={edition.version.replace(/^v/, '')}
        sections={edition.sections}
        acceptanceStatement={edition.acceptanceStatement}
        checked={checked}
        onChange={handleCheck}
        error={acceptedError}
        disabled={submitting}
        renderBody={(body) => <ConsentRichText body={body} />}
      />

      <section aria-labelledby="consent-respondent-heading">
        <h2 id="consent-respondent-heading" className="text-base font-semibold text-fg">
          {CONSENT_PAGE_COPY.respondentHeading}
        </h2>
        <p className="mb-4 mt-1 text-sm text-muted">{CONSENT_PAGE_COPY.respondentNote}</p>
        <RespondentFields
          organization={organization}
          values={values}
          errors={errors}
          disabled={submitting}
          onChange={handleFieldChange}
        />
      </section>

      {submitError && (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          {submitError}
        </p>
      )}

      {confirmingDecline ? (
        <div
          ref={confirmRef}
          tabIndex={-1}
          role="group"
          aria-labelledby="consent-decline-heading"
          className="rounded-lg border border-border bg-surface p-5 shadow-sm focus:outline-none"
        >
          <h2 id="consent-decline-heading" className="text-base font-semibold text-fg">
            {CONSENT_PAGE_COPY.declineConfirmTitle}
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            {CONSENT_PAGE_COPY.declineConfirmBody}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={onDecline}
              className={[buttonBase, 'border border-danger bg-surface text-danger hover:bg-danger-soft'].join(' ')}
            >
              {CONSENT_PAGE_COPY.declineConfirm}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={closeConfirm}
              className={[buttonBase, 'border border-border bg-surface text-fg hover:bg-surface-alt'].join(' ')}
            >
              {CONSENT_PAGE_COPY.declineBack}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={submitting}
            className={[buttonBase, 'bg-primary text-primary-fg hover:bg-primary-hover'].join(' ')}
          >
            {submitting ? CONSENT_PAGE_COPY.accepting : CONSENT_PAGE_COPY.accept}
          </button>
          <button
            ref={declineButtonRef}
            type="button"
            disabled={submitting}
            onClick={() => setConfirmingDecline(true)}
            className={[buttonBase, 'border border-border bg-surface text-fg hover:bg-surface-alt'].join(' ')}
          >
            {CONSENT_PAGE_COPY.decline}
          </button>
        </div>
      )}
    </form>
  );
}
