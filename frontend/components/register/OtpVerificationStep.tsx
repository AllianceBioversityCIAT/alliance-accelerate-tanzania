'use client';

/**
 * OtpVerificationStep — email verification + final submission (T-19, FR-4
 * scenarios 2-3, design.md §5.3).
 *
 * A step within `/register`, not a route (design.md §5.3): the parent page
 * (`app/(public)/register/page.tsx`) already validated and holds `payload`,
 * `consent`, and the verified-candidate `email` (T-17/T-18's
 * `onValidated`) — those are handed down as props, so "entered form values
 * survive the step" is satisfied structurally: this component never
 * re-derives them, and the parent unmounts `RegistrationForm` rather than
 * hiding it, so nothing here depends on that form staying mounted.
 *
 * Network calls (the ONLY writes in this whole flow, per the parent's file
 * header):
 *   1. On mount, `requestVerificationCode(email)` — `POST
 *      /registrations/verify` — sends the first code automatically.
 *   2. "Resend code" repeats the same call.
 *   3. "Verify and submit" calls `submitRegistration({ email, code, consent,
 *      payload })` — `POST /registrations` — the one call that can actually
 *      create a Registration.
 *
 * ── The oracle constraint (design.md §3.1 decision 1, §4.3, C-3) ──────────
 * The per-email send cap is enforced SILENTLY: a deliverable address, an
 * undeliverable one, and one already over its cap all get the identical
 * `202`, empty body, from `requestVerificationCode`. There is no field
 * anywhere in that response for this component to read a refusal out of —
 * so `handleResend` never attempts to and always renders the SAME static
 * notice on every successful call. `CAP_NOTICE` sets the expectation up
 * front instead (design.md §5.3's resolution to C-3).
 *
 * Wrong/expired/consumed codes are collapsed by the server into ONE
 * indistinguishable `400` with no `details` (design.md §3.1 decision 2, FR-4
 * "wrong, expired, or reused code"). `INVALID_CODE_MESSAGE` is the ONE fixed
 * string rendered for all three — `classifySubmitError` below treats
 * "`400` with no `details`" as that single case, on purpose, so a future
 * edit cannot accidentally start branching on which of the three occurred
 * (there is no signal to branch on regardless — the server does not send
 * one).
 *
 * ── The one real gap T-17 could not close (T17-A4) ─────────────────────────
 * `RegistrationForm`'s client-side email regex is deliberately more
 * permissive than the server's `@IsEmail()` (both on
 * `RegistrationVerifyDto.email` and `RegistrationCreateDto.email`). A `400`
 * WITH a `details` array is therefore a genuine field-validation failure,
 * not a collapsed OTP failure — safe to show per-field, exactly like FR-2's
 * own error contract, because it echoes nothing the caller does not already
 * hold. `classifySendError`/`classifySubmitError` route this to
 * `blockingIssue`, which renders a distinct, actionable message and an
 * "onBack" affordance — there is nothing to verify if the email itself was
 * rejected, so the code-entry UI is hidden rather than shown disabled.
 *
 * `onBack` is a real, if narrow, tradeoff: the parent resets to the `form`
 * step with a blank `RegistrationForm` (T-17's component has no
 * initial-values seam to restore mid-entry state, and adding one is outside
 * this task's scope) — so the applicant re-enters everything, this time
 * with a correct email. That is a bounded regression only on the path this
 * spec exists to reach in the first place (a malformed address that fooled
 * the client regex); it is not the common path.
 *
 * Tokens only (NFR-6) — zero hex literals. No entrance motion (A26).
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { ApiError } from '@/lib/api/client';
import {
  requestVerificationCode,
  submitRegistration,
  type RegistrationSubmitConsent,
  type RegistrationSubmitPayload,
} from '@/lib/api/registrations';

// ---------------------------------------------------------------------------
// Fixed copy — see file header for why these are constants, not templates
// ---------------------------------------------------------------------------

/**
 * The ONE message rendered for a wrong, expired, or already-consumed code
 * (design.md §3.1 decision 2 / FR-4). Exported so the test file can assert
 * the SAME string renders across all three server-side causes — proving
 * invariance rather than merely checking one case (the Disqualifying
 * clause).
 */
export const INVALID_CODE_MESSAGE =
  "That code didn't work. It may be incorrect, expired, or already used — request a new one and try again.";

/**
 * Shown up front, unconditionally (design.md §5.3's resolution to C-3) — the
 * resend affordance never reports a server refusal, because the server never
 * sends one to read.
 */
const CAP_NOTICE =
  'For your security, verification codes are limited per email address. If a new code does not arrive, please wait a few minutes before requesting another rather than requesting several in a row.';

/**
 * Rendered after EVERY successful (`202`) resend, whether or not the cap
 * silently absorbed it — there is no signal available to distinguish those
 * two cases, so this text never varies by outcome (the Disqualifying
 * clause's fourth case: "a capped resend").
 */
const RESEND_NOTICE =
  "If you're within the limit, a new code has been sent. Check your inbox (and spam folder) — delivery can take a few minutes.";

const GENERIC_SEND_FAILURE = 'Something went wrong sending your code. Please try again.';
const GENERIC_SUBMIT_FAILURE = 'Something went wrong submitting your registration. Please try again.';
const NETWORK_FAILURE = "We couldn't reach the server. Check your connection and try again.";
const THROTTLED_MESSAGE = "You're sending requests too quickly. Please wait a moment and try again.";
const CONFLICT_MESSAGE = 'We hit a temporary conflict completing your submission. Please try again.';
const MISSING_POLICY_VERSION_MESSAGE =
  "We couldn't confirm which consent policy version you accepted — please refresh the page and start again.";

interface FieldErrorDetail {
  field: string;
  message: string;
}

function isFieldErrorDetailArray(value: unknown): value is FieldErrorDetail[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) => typeof item === 'object' && item !== null && typeof (item as FieldErrorDetail).field === 'string',
    )
  );
}

function findFieldMessage(details: FieldErrorDetail[], field: string): string | undefined {
  return details.find((detail) => detail.field === field)?.message;
}

/**
 * A blocking issue names the field it is about (Reviewer correction 5) —
 * `classifySubmitError`'s fallback (any rejected field, not only `email`)
 * would otherwise render under a heading that always says "email", which
 * misstates the cause for a rejected `phone` or any other field. The render
 * below picks its heading and re-entry copy from `field`, never assumes it.
 */
interface BlockingIssue {
  field: string;
  message: string;
}

/**
 * Classifies a `requestVerificationCode` failure. `RegistrationVerifyDto`
 * has exactly one field (`email`), so any `400` here is necessarily about
 * the address, never about a code — there is no collapsed-OTP-failure case
 * on this call.
 */
function classifySendError(err: unknown): { blockingIssue?: BlockingIssue; transientIssue?: string } {
  if (err instanceof ApiError) {
    if (err.status === 400) {
      const details = isFieldErrorDetailArray(err.details) ? err.details : undefined;
      const message = (details && findFieldMessage(details, 'email')) || err.message || GENERIC_SEND_FAILURE;
      return { blockingIssue: { field: 'email', message } };
    }
    if (err.status === 429) {
      return { transientIssue: THROTTLED_MESSAGE };
    }
    return { transientIssue: err.message || GENERIC_SEND_FAILURE };
  }
  return { transientIssue: NETWORK_FAILURE };
}

/**
 * Classifies a `submitRegistration` failure. The presence of a `details`
 * array is the ONLY signal this function may use — its presence means a
 * genuine field-validation failure (safe to show, T17-A4's `email` case
 * included); its absence means the server's collapsed wrong/expired/consumed
 * `400` (design.md §3.1 decision 2), which renders the ONE fixed
 * `INVALID_CODE_MESSAGE` regardless of which of the three actually occurred.
 */
function classifySubmitError(err: unknown): {
  blockingIssue?: BlockingIssue;
  codeError?: string;
  transientIssue?: string;
} {
  if (err instanceof ApiError) {
    if (err.status === 400) {
      const details = isFieldErrorDetailArray(err.details) ? err.details : undefined;
      if (details) {
        const emailMessage = findFieldMessage(details, 'email');
        if (emailMessage) {
          return { blockingIssue: { field: 'email', message: emailMessage } };
        }
        // A rejected field other than `email` should not occur —
        // RegistrationForm mirrors the server's rules for every other field
        // — but is surfaced defensively, under ITS OWN field name, rather
        // than folded into an "email" heading that would misstate the cause.
        const first = details[0];
        return {
          blockingIssue: {
            field: first?.field ?? 'submission',
            message: first?.message ?? 'One of the submitted fields was rejected. Please go back and review your details.',
          },
        };
      }
      // No details at all — the collapsed wrong/expired/consumed shape.
      // This branch must never be split further; see file header.
      return { codeError: INVALID_CODE_MESSAGE };
    }
    if (err.status === 429) {
      return { transientIssue: THROTTLED_MESSAGE };
    }
    if (err.status === 409) {
      return { transientIssue: CONFLICT_MESSAGE };
    }
    return { transientIssue: err.message || GENERIC_SUBMIT_FAILURE };
  }
  return { transientIssue: NETWORK_FAILURE };
}

export interface OtpVerificationStepProps {
  /** The one verified-candidate address (S-6) — a code was just requested for it. */
  email: string;
  /** `RegistrationForm`'s validated payload — structurally `RegistrationSubmitPayload`. */
  payload: RegistrationSubmitPayload;
  /** `RegistrationForm`'s validated consent — structurally `RegistrationSubmitConsent`. */
  consent: RegistrationSubmitConsent;
  /** Called with the reference on a successful `201` — the parent owns what happens next (T-20). */
  onSubmitted: (reference: string) => void;
  /**
   * Called when the server rejected a submitted DETAIL (not the code) and
   * there is nothing left to verify here. The parent resets to the `form`
   * step — see the file header's "onBack is a real, if narrow, tradeoff".
   */
  onBack: () => void;
}

export default function OtpVerificationStep({
  email,
  payload,
  consent,
  onSubmitted,
  onBack,
}: OtpVerificationStepProps) {
  const [initializing, setInitializing] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [blockingIssue, setBlockingIssue] = useState<BlockingIssue | null>(null);
  const [transientIssue, setTransientIssue] = useState<string | null>(null);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  const baseId = useId();
  const codeId = `${baseId}-code`;
  const codeErrorId = `${baseId}-code-error`;

  // T19-A4: when a blockingIssue arrives, this component swaps its entire
  // returned subtree for the blocking-issue screen below — the previously
  // focused control (the code input, the resend/submit buttons) unmounts
  // with it, and a browser drops focus to <body> with no announcement. The
  // blocking screen's own container is the thing that should receive focus
  // instead, since it already carries role="alert"/aria-live="assertive" —
  // moving focus there means an AT user's next Tab starts from the message
  // they need to read, not from the top of the document.
  const blockingIssueRef = useRef<HTMLDivElement | null>(null);

  // Sends the first code automatically on mount (design.md §5.3 — the
  // applicant enters this step already having supplied and format-validated
  // the address in RegistrationForm; there is nothing further for them to
  // do before a code exists to enter). `email` is a prop that does not
  // change across this component's mounted lifetime (see file header), so
  // this runs exactly once in practice while remaining a correct dependency.
  useEffect(() => {
    let cancelled = false;
    setInitializing(true);
    requestVerificationCode(email)
      .then(() => {
        if (cancelled) return;
        setInitializing(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const { blockingIssue: bi, transientIssue: ti } = classifySendError(err);
        if (bi) setBlockingIssue(bi);
        if (ti) setTransientIssue(ti);
        setInitializing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [email]);

  // Fires whenever a blockingIssue newly appears — moves focus onto the
  // alert container the ref above targets. jsdom's rendered `<div>` DOES
  // support `.focus()` once it carries `tabIndex`, so this is a real,
  // testable behaviour. Reviewer correction 5: the proof lives in
  // `app/(public)/register/register-a11y.test.tsx` ("T19-A4: focus moves
  // onto the blocking-issue alert…"), NOT in `OtpVerificationStep.test.tsx`
  // — this is a whole-page composition behaviour (the OTP step unmounting
  // its own subtree in favour of the blocking screen, inside `RegisterPage`),
  // and `OtpVerificationStep.test.tsx` never asserts focus. Unlike the
  // scroll-geometry properties DC-17 routes to a human check, this one IS
  // jsdom-provable — it just isn't proven in this component's own file.
  useEffect(() => {
    if (blockingIssue) blockingIssueRef.current?.focus();
  }, [blockingIssue]);

  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
    setCodeError(null);
  }, []);

  const handleResend = useCallback(async () => {
    setResending(true);
    setTransientIssue(null);
    setResendNotice(null);
    try {
      await requestVerificationCode(email);
      // ALWAYS the same notice on a 202 — see RESEND_NOTICE's doc comment.
      setResendNotice(RESEND_NOTICE);
    } catch (err) {
      const { blockingIssue: bi, transientIssue: ti } = classifySendError(err);
      if (bi) setBlockingIssue(bi);
      if (ti) setTransientIssue(ti);
    } finally {
      setResending(false);
    }
  }, [email]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (code.length !== 6) {
        setCodeError('Enter the 6-digit code we sent you.');
        return;
      }
      // Defensive, client-only guard (obligation 3): a dropped
      // `policyVersion` fails closed server-side too (`@MinLength(1)`), but
      // catching it here avoids a wasted round trip and a confusing generic
      // 400. This never fires from RegistrationForm's own flow (T-18 always
      // sets it from the fetched policy) — it is a guard against a future
      // caller that skips that wiring.
      if (!consent.policyVersion) {
        setTransientIssue(MISSING_POLICY_VERSION_MESSAGE);
        return;
      }

      setSubmitting(true);
      setCodeError(null);
      setTransientIssue(null);
      try {
        const { reference } = await submitRegistration({ email, code, consent, payload });
        onSubmitted(reference);
      } catch (err) {
        const { blockingIssue: bi, codeError: ce, transientIssue: ti } = classifySubmitError(err);
        if (bi) setBlockingIssue(bi);
        if (ce) setCodeError(ce);
        if (ti) setTransientIssue(ti);
      } finally {
        setSubmitting(false);
      }
    },
    [code, consent, email, onSubmitted, payload],
  );

  if (blockingIssue) {
    // Heading and re-entry copy are keyed on WHICH field the server
    // rejected (Reviewer correction 5) — the common case is `email`
    // (T17-A4), but `classifySubmitError`'s defensive fallback can name any
    // field, and a heading hardcoded to "email" would misstate the cause.
    const heading =
      blockingIssue.field === 'email'
        ? "We couldn't verify your email address"
        : "We couldn't accept one of your submitted details";
    const correction = blockingIssue.field === 'email' ? 'a corrected email address' : 'corrected details';
    return (
      <div
        ref={blockingIssueRef}
        role="alert"
        aria-live="assertive"
        // T19-A4: tabIndex={-1} makes this container itself focusable so the
        // effect below can move focus onto it when it replaces the code-entry
        // subtree, without adding it to the normal Tab sequence.
        tabIndex={-1}
        className="rounded-md border border-danger bg-danger-soft px-4 py-4 text-sm text-danger"
      >
        <p className="font-semibold">{heading}</p>
        <p className="mt-1">{blockingIssue.message}</p>
        {/*
          Reviewer correction 1: the button previously read "Back to your
          details", but `page.tsx`'s onBack clears `pending` — there is no
          "back" to return to. This discloses the actual consequence so
          re-entry is an informed choice, not a surprise.
        */}
        <p className="mt-2 text-xs text-danger">
          You&apos;ll need to fill in the form again with {correction} — nothing you&apos;ve entered
          so far will be kept.
        </p>
        <button
          type="button"
          onClick={onBack}
          className={[
            'mt-3 inline-flex items-center gap-2 rounded-md border border-danger px-3 py-1.5 text-sm font-medium text-danger',
            'hover:bg-danger-soft transition-colors motion-reduce:transition-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          ].join(' ')}
        >
          Go back and re-enter your details
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-md border border-border bg-surface-alt p-4 text-sm text-fg">
        <p>
          We sent a 6-digit verification code to <span className="font-semibold">{email}</span>.
        </p>
        <p className="mt-2 text-xs text-muted">{CAP_NOTICE}</p>
      </div>

      {initializing ? (
        <p role="status" aria-live="polite" className="text-sm text-muted">
          Sending your verification code…
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={codeId} className="text-sm font-medium text-fg">
              Verification code
              <span aria-hidden="true" className="ml-0.5 text-danger">
                *
              </span>
            </label>
            <input
              id={codeId}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={handleCodeChange}
              disabled={submitting}
              aria-invalid={codeError ? 'true' : undefined}
              aria-describedby={codeError ? codeErrorId : undefined}
              className={[
                'block w-full max-w-[12rem] rounded-md border bg-surface px-3 py-2 text-sm text-fg tracking-widest',
                'placeholder:text-muted',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
                codeError ? 'border-danger' : 'border-border',
              ].join(' ')}
            />
            {codeError && (
              <p id={codeErrorId} role="alert" aria-live="assertive" className="text-xs text-danger">
                {codeError}
              </p>
            )}
          </div>

          {transientIssue && (
            <p role="alert" aria-live="assertive" className="text-xs text-danger">
              {transientIssue}
            </p>
          )}
          {resendNotice && (
            <p role="status" aria-live="polite" className="text-xs text-muted">
              {resendNotice}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={handleResend}
              disabled={resending || submitting}
              className={[
                'text-sm font-medium text-primary hover:underline',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline',
              ].join(' ')}
            >
              {resending ? 'Resending…' : 'Resend code'}
            </button>
            <button
              type="submit"
              disabled={submitting || code.length !== 6}
              className={[
                'inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium leading-none',
                'rounded-md bg-primary text-primary-fg hover:bg-primary-hover',
                'transition-colors motion-reduce:transition-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
              ].join(' ')}
            >
              {submitting ? 'Verifying…' : 'Verify and submit'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
