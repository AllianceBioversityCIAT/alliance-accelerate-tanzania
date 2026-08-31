'use client';

/**
 * ContactForm — public contact form (T-9, FR-2, FR-5, design.md §4.1.1, §5.1).
 *
 * Fields mirror `backend/src/contact/dto/contact-create.dto.ts` /
 * `design.md` §4.1.1 exactly: `name`, `email`, `organization` (optional),
 * `category` (the eight-value fixed set — `CONTACT_CATEGORIES`, never
 * fetched, per FR-2's "must NOT read categories from a database table or
 * remote configuration"), `subject`, `message`, `privacyAcknowledged`, and
 * the honeypot `website`.
 *
 * Structure follows `RegistrationForm.tsx`: plain `useState` for
 * `values`/`errors`, a hand-written `Field` wrapper, one card-treated
 * `<fieldset>` per section (semantic-only — `border-0 p-0 m-0`, per
 * `frontend/CLAUDE.md`'s warning against "fixing" the legend/fieldset
 * interaction with `float-left w-full`, which broke `/register`'s grid). No
 * react-hook-form, no zod, no shadcn — none are in this project's
 * `package.json`.
 *
 * ── FR-5's error rule, partitioned on `details[]`, NOT on status ──
 * This is the one part of this file a Reviewer will re-derive line by line.
 * `RegistrationForm`'s sibling exemplars (`OtpVerificationStep.classifySendError`,
 * `StatusLookupForm.classifyLookupError`) both fall back to
 * `err.message || GENERIC_..._FAILURE` for an unclassified `ApiError` —
 * `apiFetch` (`lib/api/client.ts`) sets that `message` to
 * `HTTP <status> <statusText>` whenever the error body isn't JSON, so that
 * fallback renders the literal status code FR-5 forbids exposing. THIS FORM
 * DOES NOT DO THAT. `extractFieldErrors` below never reads
 * `ApiError.message` at all — it inspects only `err.details`:
 *
 *   - a **non-empty** `details[]` (the only shape `NestJS`'s validation pipe
 *     ever produces, per NFR-7's envelope) maps each `{ field, message }`
 *     onto `fieldErrors`, rendered inline exactly like `RegistrationForm`'s
 *     per-field errors;
 *   - literally everything else — empty/absent `details` on a `400`
 *     (`BodyShapeValidationPipe`'s shape, and `apiFetch`'s own shape when a
 *     body isn't JSON), a `429`, a `502`, a `500`, or a plain network
 *     rejection that never reaches `ApiError` at all — renders the ONE fixed
 *     constant `SUBMIT_FAILURE_MESSAGE` and nothing else.
 *
 * The status code itself is never inspected for this branch: `details[]`
 * presence is the only signal, per `design.md` §5.1's own framing of why a
 * status-based partition leaves a hole (`BodyShapeValidationPipe`'s `400`
 * with `details: []`, and `apiFetch`'s `400` with `details` undefined on a
 * non-JSON body — both would render nothing under a status-only rule).
 *
 * ── Honeypot (FR-8) ──
 * `website` lives in a `sr-only` (visually hidden, per this codebase's
 * established idiom — see `SearchableSelect.tsx`, `ActorHistoryPanel.tsx`)
 * wrapper marked `aria-hidden="true"`, with the input itself carrying
 * `tabIndex={-1}` and `autoComplete="off"` — invisible to sighted users,
 * absent from the accessibility tree, and unreachable by Tab. A real
 * submission never touches it; only an automated filler that ignores
 * hidden-field signals will populate it, and a filled value is folded into
 * the identical success path (design.md §4.4) — this component sends
 * whatever the field holds and never treats it specially client-side, since
 * indistinguishability is the point.
 *
 * ── Success and error announcement (NFR-3) ──
 * A submit failure renders through a `role="alert" aria-live="assertive"`
 * region — the same idiom `RegistrationForm`'s error summary and
 * `StatusLookupForm`'s error paragraph both use. A submit success replaces
 * the form with a `role="status" aria-live="polite"` confirmation panel,
 * mirroring `StatusLookupForm`'s result panel, including moving focus onto
 * it so a screen-reader user is told the outcome even though the form
 * (and whatever had focus inside it) has just unmounted.
 *
 * ── Values preserved on failure ──
 * `values` state is never cleared, reset, or replaced on a failed submit —
 * only the submit handler's success branch clears it (`setValues(toFormValues())`
 * immediately after `setSucceeded(true)`), and only after a real `202`.
 *
 * Tokens only (NFR-4): every class here resolves through
 * `tailwind.config.ts` / `docs/ux-ui/design.md` §7 — no raw color functions,
 * no arbitrary Tailwind values.
 *
 * Analytics (NFR-6): no analytics layer exists in `frontend/`; none is
 * added here.
 */

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { ApiError } from '@/lib/api/client';
import { CONTACT_CATEGORIES, submitContact, type ContactCategory, type ContactSubmission } from '@/lib/api/contact';

// ---------------------------------------------------------------------------
// Fixed copy — see file header for why this is a constant, never `ApiError.message`
// ---------------------------------------------------------------------------

/**
 * The ONE message rendered for every submit failure that does not carry a
 * non-empty `details[]` — a `400` with empty/absent `details`, `429`,
 * `502`, `500`, or a network rejection alike (FR-5). Exported so the test
 * file can assert the SAME string renders across every one of those
 * separately simulated failure modes, proving invariance rather than
 * checking a single case (mirrors `StatusLookupForm.LOOKUP_NOT_FOUND_MESSAGE`).
 */
export const SUBMIT_FAILURE_MESSAGE =
  "We couldn't send your message just now. Please try again shortly.";

export const SUBMIT_SUCCESS_MESSAGE =
  "Thank you, your message has been sent. We'll be in touch soon.";

/**
 * `@MaxLength` bounds, transcribed field-for-field from
 * `contact-categories.ts` / `contact-create.dto.ts` (design.md §4.1.1, §4.2).
 */
const MAX_LENGTHS = {
  name: 200,
  email: 254,
  organization: 200,
  subject: 200,
  message: 4000,
} as const;

const CATEGORY_OPTIONS = CONTACT_CATEGORIES.map((value) => ({ value, label: value }));

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormValues {
  name: string;
  email: string;
  organization: string;
  category: ContactCategory | '';
  subject: string;
  message: string;
  privacyAcknowledged: boolean;
  /** The honeypot (FR-8) — never rendered visibly, never validated client-side. */
  website: string;
}

function toFormValues(): FormValues {
  return {
    name: '',
    email: '',
    organization: '',
    category: '',
    subject: '',
    message: '',
    privacyAcknowledged: false,
    website: '',
  };
}

const FIELD_LABELS: Record<keyof Omit<FormValues, 'website'>, string> = {
  name: 'Name',
  email: 'Email',
  organization: 'Organization',
  category: 'Category',
  subject: 'Subject',
  message: 'Message',
  privacyAcknowledged: 'Privacy acknowledgement',
};

/**
 * Client-side mirror of the server's caps and required-ness
 * (`contact-create.dto.ts`) — a pragmatic pre-check, not the gate: FR-2
 * requires server-side rejection regardless of what this function accepts.
 */
function validate(values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!values.name.trim()) {
    errors.name = 'Name is required.';
  } else if (values.name.trim().length > MAX_LENGTHS.name) {
    errors.name = `Must be ${MAX_LENGTHS.name} characters or fewer.`;
  }

  if (!values.email.trim()) {
    errors.email = 'Email is required.';
  } else if (!EMAIL_REGEX.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.';
  } else if (values.email.trim().length > MAX_LENGTHS.email) {
    errors.email = `Must be ${MAX_LENGTHS.email} characters or fewer.`;
  }

  if (values.organization.trim().length > MAX_LENGTHS.organization) {
    errors.organization = `Must be ${MAX_LENGTHS.organization} characters or fewer.`;
  }

  if (!values.category) {
    errors.category = 'Select a category.';
  }

  if (!values.subject.trim()) {
    errors.subject = 'Subject is required.';
  } else if (values.subject.trim().length > MAX_LENGTHS.subject) {
    errors.subject = `Must be ${MAX_LENGTHS.subject} characters or fewer.`;
  }

  if (!values.message.trim()) {
    errors.message = 'Message is required.';
  } else if (values.message.trim().length > MAX_LENGTHS.message) {
    errors.message = `Must be ${MAX_LENGTHS.message} characters or fewer.`;
  }

  if (!values.privacyAcknowledged) {
    errors.privacyAcknowledged = 'You must acknowledge the privacy notice before submitting.';
  }

  return errors;
}

/**
 * The DTO's `details[]` item shape (NFR-7's envelope,
 * `{ statusCode, error, message, details: [{ field, message }] }`). Read
 * defensively — nothing here trusts the server to have sent well-formed
 * items, only that it MIGHT.
 */
interface ContactDetailItem {
  field?: unknown;
  message?: unknown;
}

/**
 * FR-5's crux: partitioned on `details[]`, never on status. Returns the
 * inline field-error map when (and only when) `err` is an `ApiError`
 * carrying a genuinely non-empty `details[]` array of well-shaped items;
 * returns `null` for literally every other outcome, which the caller then
 * renders as `SUBMIT_FAILURE_MESSAGE` — never `err.message`.
 */
function extractFieldErrors(err: unknown): Record<string, string> | null {
  if (!(err instanceof ApiError)) return null;
  if (!Array.isArray(err.details) || err.details.length === 0) return null;

  const fieldErrors: Record<string, string> = {};
  for (const raw of err.details as ContactDetailItem[]) {
    if (raw && typeof raw.field === 'string' && raw.field) {
      fieldErrors[raw.field] = typeof raw.message === 'string' && raw.message ? raw.message : SUBMIT_FAILURE_MESSAGE;
    }
  }
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : null;
}

// ---------------------------------------------------------------------------
// Reusable field wrapper — mirrors RegistrationForm.tsx's `Field`
// ---------------------------------------------------------------------------

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

function Field({ id, label, error, required, children }: FieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
        )}
      </label>
      {children}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The two error-dependent ARIA bindings every field repeats.
 *
 * Centralised 2026-08-31. The `${id}-error` convention belongs to `Field`,
 * which renders the error element with exactly that id — but each input used
 * to rebuild the string itself, seven times. That is where a mismatch hides:
 * an `aria-describedby` pointing at an id that does not exist announces
 * nothing to a screen reader, fails silently, and **no test asserted it** (the
 * suite pins `aria-invalid` once, on email, and `aria-describedby` nowhere).
 * One definition is one thing to get right instead of seven.
 *
 * `undefined` rather than `false`/`""` on the happy path is deliberate: React
 * omits the attribute entirely, and a present-but-empty `aria-describedby` is
 * itself an axe violation.
 */
function errorBindings(id: string, error?: string) {
  return {
    'aria-invalid': error ? ('true' as const) : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  };
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

export default function ContactForm() {
  const [values, setValues] = useState<FormValues>(toFormValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const baseId = useId();
  const fieldId = useCallback((field: keyof FormValues) => `${baseId}-${field}`, [baseId]);

  // T9-A1: on success the form unmounts and is replaced by the confirmation
  // panel below (mirrors `StatusLookupForm`'s result panel). Focus moves
  // onto the panel so a screen-reader user is told the outcome even though
  // whatever had focus inside the form is now gone.
  const successRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (succeeded) successRef.current?.focus();
  }, [succeeded]);

  const setField = useCallback(<K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const validationErrors = validate(values);
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        setSubmitError(null);
        return;
      }

      const payload: ContactSubmission = {
        name: values.name.trim(),
        email: values.email.trim(),
        organization: values.organization.trim() || undefined,
        category: values.category as ContactCategory,
        subject: values.subject.trim(),
        message: values.message,
        privacyAcknowledged: values.privacyAcknowledged,
        // The honeypot travels verbatim — never trimmed, never validated,
        // never treated specially on this side (design.md §4.4).
        website: values.website || undefined,
      };

      setSubmitting(true);
      setSubmitError(null);
      try {
        await submitContact(payload);
        setSucceeded(true);
        setValues(toFormValues());
        setErrors({});
      } catch (err) {
        // FR-5's partition — see `extractFieldErrors`'s doc and this file's
        // header. `values` is deliberately left untouched here: a failed
        // submit preserves every value the visitor entered.
        const fieldErrors = extractFieldErrors(err);
        if (fieldErrors) {
          setErrors(fieldErrors);
          setSubmitError(null);
        } else {
          setErrors({});
          setSubmitError(SUBMIT_FAILURE_MESSAGE);
        }
      } finally {
        setSubmitting(false);
      }
    },
    [values],
  );

  if (succeeded) {
    return (
      <div
        ref={successRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className="flex flex-col gap-3 rounded-md border border-border bg-surface p-6 shadow-sm"
      >
        <p className="text-lg font-semibold text-fg">Message sent</p>
        <p className="text-sm text-fg">{SUBMIT_SUCCESS_MESSAGE}</p>
        <button
          type="button"
          onClick={() => setSucceeded(false)}
          className={[
            'self-start text-sm font-medium text-primary hover:underline',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          ].join(' ')}
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {submitError && (
        <div
          role="alert"
          aria-live="assertive"
          data-testid="submit-error"
          className="rounded-md border border-danger bg-danger-soft px-4 py-4 text-sm text-danger"
        >
          {submitError}
        </div>
      )}

      <div className="rounded-md border border-border bg-surface p-4 sm:p-6 shadow-sm">
        <fieldset className="border-0 p-0 m-0" disabled={submitting}>
          <legend className="mb-4 text-base font-semibold text-fg">Your details</legend>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Field id={fieldId('name')} label={FIELD_LABELS.name} error={errors.name} required>
              <input
                id={fieldId('name')}
                type="text"
                autoComplete="name"
                value={values.name}
                onChange={(e) => setField('name', e.target.value)}
                {...errorBindings(fieldId('name'), errors.name)}
                className={inputClasses(!!errors.name)}
              />
            </Field>

            <Field id={fieldId('email')} label={FIELD_LABELS.email} error={errors.email} required>
              <input
                id={fieldId('email')}
                type="email"
                autoComplete="email"
                value={values.email}
                onChange={(e) => setField('email', e.target.value)}
                {...errorBindings(fieldId('email'), errors.email)}
                className={inputClasses(!!errors.email)}
              />
            </Field>

            <Field id={fieldId('organization')} label={FIELD_LABELS.organization} error={errors.organization}>
              <input
                id={fieldId('organization')}
                type="text"
                autoComplete="organization"
                value={values.organization}
                onChange={(e) => setField('organization', e.target.value)}
                {...errorBindings(fieldId('organization'), errors.organization)}
                className={inputClasses(!!errors.organization)}
              />
            </Field>

            <Field id={fieldId('category')} label={FIELD_LABELS.category} error={errors.category} required>
              <select
                id={fieldId('category')}
                value={values.category}
                onChange={(e) => setField('category', e.target.value as FormValues['category'])}
                {...errorBindings(fieldId('category'), errors.category)}
                className={inputClasses(!!errors.category)}
              >
                <option value="">Select…</option>
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </fieldset>
      </div>

      <div className="rounded-md border border-border bg-surface p-4 sm:p-6 shadow-sm">
        <fieldset className="border-0 p-0 m-0" disabled={submitting}>
          <legend className="mb-4 text-base font-semibold text-fg">Your message</legend>
          <div className="flex flex-col gap-4">
            <Field id={fieldId('subject')} label={FIELD_LABELS.subject} error={errors.subject} required>
              <input
                id={fieldId('subject')}
                type="text"
                value={values.subject}
                onChange={(e) => setField('subject', e.target.value)}
                {...errorBindings(fieldId('subject'), errors.subject)}
                className={inputClasses(!!errors.subject)}
              />
            </Field>

            <Field id={fieldId('message')} label={FIELD_LABELS.message} error={errors.message} required>
              <textarea
                id={fieldId('message')}
                rows={6}
                value={values.message}
                onChange={(e) => setField('message', e.target.value)}
                {...errorBindings(fieldId('message'), errors.message)}
                className={inputClasses(!!errors.message)}
              />
            </Field>

            {/*
              FR-8 honeypot — `sr-only` (this codebase's established
              visually-hidden idiom; see file header) plus `aria-hidden`
              removes it from the accessibility tree entirely, and
              `tabIndex={-1}` on the input removes it from the Tab sequence.
              A real visitor can neither see nor tab to this control; only an
              automated filler that ignores hidden-field signals populates
              it, and the value travels through unmodified (design.md §4.4).
            */}
            <div aria-hidden="true" className="sr-only">
              <label htmlFor={fieldId('website')}>Leave this field blank</label>
              <input
                id={fieldId('website')}
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={values.website}
                onChange={(e) => setField('website', e.target.value)}
              />
            </div>
          </div>
        </fieldset>
      </div>

      <div className="rounded-md border border-border bg-surface p-4 sm:p-6 shadow-sm">
        <fieldset className="border-0 p-0 m-0" disabled={submitting}>
          <legend className="mb-4 text-base font-semibold text-fg">Privacy</legend>
          <div className="flex items-start gap-2">
            <input
              id={fieldId('privacyAcknowledged')}
              type="checkbox"
              checked={values.privacyAcknowledged}
              onChange={(e) => setField('privacyAcknowledged', e.target.checked)}
              {...errorBindings(fieldId('privacyAcknowledged'), errors.privacyAcknowledged)}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            />
            <label htmlFor={fieldId('privacyAcknowledged')} className="text-sm text-fg">
              {/* Braces, not bare text: JSX collapses the newline to nothing, so the
                  asterisk renders flush against the full stop and `ml-0.5` supplies
                  the gap. Written explicitly so a reader cannot mistake the absence
                  of a space for an oversight. The `*` is aria-hidden, so the
                  accessible name stays "I acknowledge the privacy notice." either
                  way — pinned by the tests that find this control by its label. */}
              {'I acknowledge the privacy notice.'}
              <span aria-hidden="true" className="ml-0.5 text-danger">*</span>
            </label>
          </div>
          {errors.privacyAcknowledged && (
            <p id={`${fieldId('privacyAcknowledged')}-error`} role="alert" className="mt-1 text-xs text-danger">
              {errors.privacyAcknowledged}
            </p>
          )}
          {/*
            The link FR-6 requires ("MUST link to a page that actually
            resolves") lives OUTSIDE the <label>, as a sibling paragraph —
            not nested inside it. A link nested inside a <label for="…">
            double-fires on click (the label's own toggle action plus the
            link's navigation), a known accessibility anti-pattern
            (`nested-interactive`) that `ConsentPolicyDisclosure`'s own
            plain-text label avoids the same way.
          */}
          <p className="mt-2 text-xs text-muted">
            Read our{' '}
            <Link href="/privacy" className="font-medium text-primary hover:underline">
              privacy notice
            </Link>{' '}
            to see what a submission collects and how it is used.
          </p>
        </fieldset>
      </div>

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
          {submitting ? 'Sending…' : 'Send message'}
        </button>
      </div>
    </form>
  );
}
