'use client';

/**
 * StatusLookupForm — public status lookup by reference + email (T-21, FR-6
 * scenario 1, FR-13's applicant-facing note path, NFR-10, design.md §5.4).
 *
 * POSTs `{ reference, email }` in a request BODY via
 * `lib/api/registrations.ts`'s `lookupRegistration()` — never a query
 * string (design.md §3.1 decision 3 / C-11). `lookupRegistration` builds
 * that request through `apiFetch`, whose `body` option is always
 * JSON-serialised onto the request body, never appended to the URL — see
 * that function's doc comment for why a regression to `GET` with query
 * parameters cannot originate from this component going through it
 * correctly. `lookupRegistration.test.ts`-equivalent coverage (in
 * `registrations.test.ts`) asserts the actual emitted `fetch` call: method
 * `POST`, no `?` in the URL, `reference`/`email` in a JSON body — the
 * disqualifying clause's "check the emitted request, not just the rendered
 * output" lives there, at the layer that can see it; this file's own test
 * asserts the component calls `lookupRegistration(reference, email)` with
 * plain arguments, never builds a URL of its own.
 *
 * Renders ONLY what `RegistrationLookupResponse` can ever carry: a status
 * (mapped to human copy, never the raw enum literal) and `reviewNote` when
 * present. There is no third field to render — FR-6 forbids the payload,
 * the internal `id`, and reviewer identity from ever reaching a public
 * caller, and the response TYPE (not merely this component's discipline)
 * makes anything else impossible to read.
 *
 * ── The byte-identity invariant, carried into the UI (FR-6 scenario 2) ──
 * The server returns the SAME `404` — same status, same body, same message
 * — for "reference does not exist", "reference exists but the email does
 * not match", AND the L-2 lockout exit (`registrations.service.ts`'s single
 * `buildLookupNotFoundError` throw site). `LOOKUP_NOT_FOUND_MESSAGE` is the
 * ONE fixed string rendered for all three, mirroring `OtpVerificationStep`'s
 * `INVALID_CODE_MESSAGE` pattern exactly: `classifyLookupError` below never
 * branches on WHICH failure occurred, because there is nothing in the
 * response to branch on — the server's collapse is real, not merely
 * observed.
 *
 * A `429` from the per-container throttler stays visible with its OWN
 * message (`THROTTLED_MESSAGE`): `design.md:192`'s carve-out (already relied
 * on by T-19's resend affordance) grants this because the throttler keys on
 * the caller's IP, never on the submitted reference or email — it discloses
 * nothing about any particular applicant's submission, so surfacing it
 * distinctly from the `404` is not a C-3-style oracle.
 *
 * A `400` (malformed shape — e.g. an over-length reference, rejected by
 * `RegistrationLookupDto`'s validators before any lookup runs) gets a THIRD,
 * distinct message: it is content-independent, so distinguishing it from
 * the "not found" `404` discloses nothing about any real reference or
 * address either.
 *
 * Tokens only (NFR-6) — zero hex literals. No entrance motion (A26).
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { ApiError } from '@/lib/api/client';
import {
  lookupRegistration,
  type RegistrationLookupResponse,
  type RegistrationStatus,
} from '@/lib/api/registrations';

// ---------------------------------------------------------------------------
// Fixed copy — see file header for why these are constants, not templates
// ---------------------------------------------------------------------------

/**
 * The ONE message rendered for "reference absent", "email mismatch", AND
 * the lockout exit (design.md §3.1 decision 4 / FR-6 scenario 2). Exported
 * so the test file can assert the SAME string renders across separately
 * simulated failure modes — proving invariance rather than merely checking
 * one case (the Disqualifying clause's evidence requirement, mirroring
 * `OtpVerificationStep.INVALID_CODE_MESSAGE`).
 */
export const LOOKUP_NOT_FOUND_MESSAGE =
  "We couldn't find a submission matching that reference and email. Double-check both for typos and try again.";

const THROTTLED_MESSAGE = "You're checking too often. Please wait a moment and try again.";
const INVALID_INPUT_MESSAGE =
  'Enter your reference code and the email address you verified, then try again.';
const GENERIC_LOOKUP_FAILURE = 'Something went wrong looking up your submission. Please try again.';
const NETWORK_FAILURE = "We couldn't reach the server. Check your connection and try again.";

/**
 * Human copy per `RegistrationStatus` member (never the raw enum literal —
 * design.md §5.4/§3.1). All five are handled, including the two
 * (`AWAITING_APPLICANT`, `WITHDRAWN`) chunk 3a+3b never actually produce
 * (design.md §2.1) — see `RegistrationStatus`'s own doc comment in
 * `lib/api/registrations.ts` for why this stays exhaustive rather than
 * narrowed. The `default` branch is unreachable by TypeScript's own
 * exhaustiveness check (a `never` assignment), not a runtime fallback for
 * an unrecognised value — if the enum ever grows a sixth member, this
 * function fails to COMPILE rather than silently rendering nothing.
 */
function statusCopy(status: RegistrationStatus): { label: string; description: string } {
  switch (status) {
    case 'PENDING_REVIEW':
      return {
        label: 'Pending review',
        description: 'Your submission is waiting to be reviewed by the ACCELERATE Tanzania team.',
      };
    case 'AWAITING_APPLICANT':
      return {
        label: 'Awaiting your response',
        description:
          'The review team has requested more information. Watch for an email, or check back here.',
      };
    case 'APPROVED':
      return {
        label: 'Approved',
        description: 'Your organisation has been approved and published to the registry.',
      };
    case 'REJECTED':
      return {
        label: 'Not approved',
        description: 'Your submission was not approved this time.',
      };
    case 'WITHDRAWN':
      return {
        label: 'Withdrawn',
        description: 'This submission was withdrawn and is no longer under review.',
      };
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

/**
 * Classifies a `lookupRegistration` failure into the ONE message to render.
 * The presence of a distinct `status` is the ONLY signal this function may
 * use — never any body content, since the `404` case is deliberately
 * byte-identical across its three underlying causes and there is nothing
 * else to branch on.
 */
function classifyLookupError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) return LOOKUP_NOT_FOUND_MESSAGE;
    if (err.status === 429) return THROTTLED_MESSAGE;
    if (err.status === 400) return INVALID_INPUT_MESSAGE;
    return err.message || GENERIC_LOOKUP_FAILURE;
  }
  return NETWORK_FAILURE;
}

export default function StatusLookupForm() {
  const [reference, setReference] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegistrationLookupResponse | null>(null);

  const baseId = useId();
  const referenceId = `${baseId}-reference`;
  const emailId = `${baseId}-email`;
  const errorId = `${baseId}-error`;

  // T21-A1: on a successful lookup the form unmounts and is replaced by the
  // result panel below. An error already announces via role="alert"
  // (assertive live region); a result did not announce at all and left
  // focus wherever it was — on the just-removed submit button, which drops
  // it to <body> once the form is gone. `resultRef` + the effect underneath
  // move focus onto the result panel itself, and the panel's own
  // aria-live="polite" region (see the render below) announces the status
  // to a screen-reader user the same way the error path already does.
  const resultRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const trimmedReference = reference.trim();
      const trimmedEmail = email.trim();
      if (!trimmedReference || !trimmedEmail) {
        setError(INVALID_INPUT_MESSAGE);
        setResult(null);
        return;
      }

      setSubmitting(true);
      setError(null);
      setResult(null);
      try {
        // Plain positional arguments — `lookupRegistration` (lib/api/
        // registrations.ts) is what turns these into a POST body; nothing
        // here constructs a URL or a query string.
        const response = await lookupRegistration(trimmedReference, trimmedEmail);
        setResult(response);
      } catch (err) {
        setError(classifyLookupError(err));
      } finally {
        setSubmitting(false);
      }
    },
    [reference, email],
  );

  const handleLookupAgain = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  if (result) {
    const { label, description } = statusCopy(result.status);
    return (
      <div
        ref={resultRef}
        role="status"
        aria-live="polite"
        // T21-A1: focusable-but-not-tabbable, mirroring the OTP step's
        // blocking-issue container — a valid target for the effect above's
        // `.focus()` call, not a stop in the normal Tab order.
        tabIndex={-1}
        className="flex flex-col gap-4 rounded-md border border-border bg-surface p-6"
      >
        <div>
          <p className="text-sm font-medium text-muted">Status</p>
          <p className="mt-1 text-xl font-bold text-fg">{label}</p>
        </div>
        <p className="text-sm text-fg">{description}</p>
        {/*
          `reviewNote` is the one other field the response can carry
          (design.md §5.4, FR-13's applicant-facing note path) — rendered
          only when present, never fabricated when absent.
        */}
        {result.reviewNote && (
          <div className="rounded-md border border-border bg-surface-alt p-4">
            <p className="text-sm font-medium text-fg">Note from the review team</p>
            <p className="mt-1 text-sm text-fg">{result.reviewNote}</p>
          </div>
        )}
        <button
          type="button"
          onClick={handleLookupAgain}
          className={[
            'self-start text-sm font-medium text-primary hover:underline',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          ].join(' ')}
        >
          Look up a different submission
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={referenceId} className="text-sm font-medium text-fg">
          Reference code
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
        </label>
        <input
          id={referenceId}
          type="text"
          autoComplete="off"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          disabled={submitting}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? 'true' : undefined}
          placeholder="REG-2026-0184"
          className={[
            'block w-full rounded-md border bg-surface px-3 py-2 text-sm text-fg',
            'placeholder:text-muted',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error ? 'border-danger' : 'border-border',
          ].join(' ')}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={emailId} className="text-sm font-medium text-fg">
          Email address you verified
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
        </label>
        <input
          id={emailId}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? 'true' : undefined}
          className={[
            'block w-full rounded-md border bg-surface px-3 py-2 text-sm text-fg',
            'placeholder:text-muted',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error ? 'border-danger' : 'border-border',
          ].join(' ')}
        />
      </div>

      {error && (
        <p id={errorId} role="alert" aria-live="assertive" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className={[
          'inline-flex items-center gap-2 self-start px-5 py-2.5 text-sm font-medium leading-none',
          'rounded-md bg-primary text-primary-fg hover:bg-primary-hover',
          'transition-colors motion-reduce:transition-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
        ].join(' ')}
      >
        {submitting ? 'Checking…' : 'Check status'}
      </button>
    </form>
  );
}
