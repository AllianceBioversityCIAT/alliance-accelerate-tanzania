'use client';

/**
 * /consent/ — the public consent page (actors/consent-intake/
 * consent-request-email T-8; FR-9, FR-10 UI, FR-11, NFR-10, NFR-11;
 * design.md §7.3, DD-5, DD-11).
 *
 * The link is `/consent/#t=<token>`. On mount this page reads the fragment,
 * IMMEDIATELY replaces the address with `/consent/` (before any request is
 * sent, so the token never lingers in the address bar or history), keeps the
 * token in React state only, and then calls `POST /consent/view`. A refresh
 * therefore finds no fragment and shows the "open the link from your email
 * again" copy — NOT the dead-end wording, because the link is still valid.
 *
 * No `useSearchParams()` (the token is in the hash), so no `<Suspense>` is
 * needed under static export. The route group's layout carries no analytics
 * (DD-5/NFR-11).
 *
 * State machine: loading · ready (with `submitting`) · no-token · dead-end ·
 * throttled · error · done-accepted · done-declined. The uniform `404`
 * (FR-11) is the ONLY signal for dead-end, and the dead-end page shows no
 * organization or field. The page offers no way to edit the actor's data.
 */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import ConsentDeadEnd from '@/components/consent/ConsentDeadEnd';
import ConsentRecordPreview from '@/components/consent/ConsentRecordPreview';
import ConsentResponseForm, {
  type ConsentServerErrors,
} from '@/components/consent/ConsentResponseForm';
import { ApiError } from '@/lib/api/client';
import {
  respondToConsentRequest,
  viewConsentRequest,
  type ConsentRespondBody,
  type ConsentRespondent,
  type ConsentViewResponse,
} from '@/lib/api/consent-public';
import { CONSENT_PAGE_COPY, RESPONDENT_FIELDS } from '@/lib/content/consent-requests';

type Phase =
  | { kind: 'loading' }
  | { kind: 'no-token' }
  | { kind: 'dead-end' }
  | { kind: 'throttled'; token: string }
  | { kind: 'error'; token: string }
  | { kind: 'ready'; token: string; view: ConsentViewResponse }
  | { kind: 'done-accepted'; recordId: string }
  | { kind: 'done-declined' };

const NO_SERVER_ERRORS: ConsentServerErrors = { respondent: {} };

/** Reads `t` from the fragment and strips the fragment — synchronously, first. */
function takeTokenFromHash(): string | null {
  const hash = window.location.hash;
  if (hash) window.history.replaceState(null, '', '/consent/');
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('t');
  return token ? token : null;
}

/** Maps the API's `details[]` (`respondent.position`, `accepted`) to form errors. */
function mapDetails(details: unknown): ConsentServerErrors | null {
  if (!Array.isArray(details)) return null;
  const mapped: ConsentServerErrors = { respondent: {} };
  let any = false;
  for (const raw of details as Array<{ field?: unknown }>) {
    const field = typeof raw?.field === 'string' ? raw.field : '';
    if (field === 'accepted') {
      mapped.accepted = CONSENT_PAGE_COPY.checkboxRequired;
      any = true;
      continue;
    }
    const match = field.match(/^respondent\.(name|position|email|phone)$/);
    if (match) {
      const key = match[1] as 'name' | 'position' | 'email' | 'phone';
      const def = RESPONDENT_FIELDS.find((f) => f.key === key);
      mapped.respondent[key] =
        key === 'email' ? 'Enter a valid email address.' : (def?.required ?? '');
      any = true;
    }
  }
  return any ? mapped : null;
}

const HEADINGS: Record<Exclude<Phase['kind'], 'ready' | 'loading'>, string> = {
  'no-token': CONSENT_PAGE_COPY.noTokenTitle,
  'dead-end': CONSENT_PAGE_COPY.deadEndTitle,
  throttled: CONSENT_PAGE_COPY.throttledTitle,
  error: CONSENT_PAGE_COPY.errorTitle,
  'done-accepted': CONSENT_PAGE_COPY.acceptedTitle,
  'done-declined': CONSENT_PAGE_COPY.declinedTitle,
};

const panelClass = 'rounded-lg border border-border bg-surface p-6 shadow-sm';
const actionClass = [
  'mt-4 inline-flex items-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium leading-none text-primary-fg',
  'hover:bg-primary-hover transition-colors motion-reduce:transition-none',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
].join(' ');

export default function ConsentPage() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<ConsentServerErrors>(NO_SERVER_ERRORS);

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  // The fragment can be read exactly once (we strip it). React StrictMode runs
  // effects twice in dev; the ref keeps the first read for the second run.
  const tokenRef = useRef<string | null | undefined>(undefined);
  const loadSeq = useRef(0);

  const load = useCallback((token: string) => {
    const seq = ++loadSeq.current;
    setPhase({ kind: 'loading' });
    viewConsentRequest(token).then(
      (view) => {
        if (seq === loadSeq.current) setPhase({ kind: 'ready', token, view });
      },
      (err: unknown) => {
        if (seq !== loadSeq.current) return;
        if (err instanceof ApiError && err.status === 404) setPhase({ kind: 'dead-end' });
        else if (err instanceof ApiError && err.status === 429) setPhase({ kind: 'throttled', token });
        else setPhase({ kind: 'error', token });
      },
    );
  }, []);

  // Drops the result of any in-flight view call (unmount, or a newer load).
  const invalidateLoads = useCallback(() => {
    loadSeq.current++;
  }, []);

  useEffect(() => {
    if (tokenRef.current === undefined) tokenRef.current = takeTokenFromHash();
    const token = tokenRef.current;
    if (!token) {
      setPhase({ kind: 'no-token' });
      return;
    }
    load(token);
    return invalidateLoads;
  }, [load, invalidateLoads]);

  // Move focus to the new heading when the page changes to a terminal or
  // message state, so a screen-reader user hears what happened.
  useEffect(() => {
    if (phase.kind !== 'loading' && phase.kind !== 'ready') headingRef.current?.focus();
  }, [phase.kind]);

  const respond = useCallback(
    async (body: ConsentRespondBody) => {
      if (phase.kind !== 'ready') return;
      const { token, view } = phase;
      setSubmitting(true);
      setSubmitError(null);
      setServerErrors(NO_SERVER_ERRORS);
      try {
        const result = await respondToConsentRequest(token, body);
        setPhase(
          result.decision === 'ACCEPT'
            ? { kind: 'done-accepted', recordId: view.record.id }
            : { kind: 'done-declined' },
        );
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setPhase({ kind: 'dead-end' });
        } else if (err instanceof ApiError && err.status === 429) {
          setSubmitError(CONSENT_PAGE_COPY.submitThrottled);
        } else if (err instanceof ApiError && err.status === 400 && mapDetails(err.details)) {
          setServerErrors(mapDetails(err.details) as ConsentServerErrors);
        } else {
          setSubmitError(CONSENT_PAGE_COPY.submitFailed);
        }
      } finally {
        setSubmitting(false);
      }
    },
    [phase],
  );

  const handleAccept = useCallback(
    (respondent: ConsentRespondent) => {
      void respond({ decision: 'ACCEPT', respondent, accepted: true });
    },
    [respond],
  );
  const handleDecline = useCallback(() => {
    void respond({ decision: 'DECLINE' });
  }, [respond]);

  const heading =
    phase.kind === 'ready' || phase.kind === 'loading'
      ? CONSENT_PAGE_COPY.title
      : HEADINGS[phase.kind];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-2xl font-extrabold leading-tight text-fg focus:outline-none lg:text-3xl"
      >
        {heading}
      </h1>

      {phase.kind === 'loading' && (
        <p role="status" className="mt-6 text-sm text-muted">
          {CONSENT_PAGE_COPY.loading}
        </p>
      )}

      {phase.kind === 'no-token' && (
        <div role="status" className={`mt-6 ${panelClass}`}>
          <p className="max-w-prose text-sm text-fg">{CONSENT_PAGE_COPY.noTokenBody}</p>
        </div>
      )}

      {phase.kind === 'dead-end' && (
        <div className="mt-6">
          <ConsentDeadEnd />
        </div>
      )}

      {phase.kind === 'throttled' && (
        <div role="status" className={`mt-6 ${panelClass}`}>
          <p className="max-w-prose text-sm text-fg">{CONSENT_PAGE_COPY.throttledBody}</p>
          <button type="button" onClick={() => load(phase.token)} className={actionClass}>
            {CONSENT_PAGE_COPY.retry}
          </button>
        </div>
      )}

      {phase.kind === 'error' && (
        <div role="alert" className={`mt-6 ${panelClass}`}>
          <p className="max-w-prose text-sm text-fg">{CONSENT_PAGE_COPY.errorBody}</p>
          <button type="button" onClick={() => load(phase.token)} className={actionClass}>
            {CONSENT_PAGE_COPY.retry}
          </button>
        </div>
      )}

      {phase.kind === 'done-accepted' && (
        <div role="status" className={`mt-6 ${panelClass}`}>
          <p className="max-w-prose text-sm text-fg">{CONSENT_PAGE_COPY.acceptedBody}</p>
          <Link
            href={`/profile?id=${encodeURIComponent(phase.recordId)}`}
            className={`${actionClass} no-underline`}
          >
            {CONSENT_PAGE_COPY.acceptedLink}
          </Link>
        </div>
      )}

      {phase.kind === 'done-declined' && (
        <div role="status" className={`mt-6 ${panelClass}`}>
          <p className="max-w-prose text-sm text-fg">{CONSENT_PAGE_COPY.declinedBody}</p>
        </div>
      )}

      {phase.kind === 'ready' && (
        <div className="mt-2 flex flex-col gap-8">
          <p className="max-w-prose text-sm text-muted">{CONSENT_PAGE_COPY.intro}</p>
          <ConsentRecordPreview record={phase.view.record} />
          <ConsentResponseForm
            organization={phase.view.organization}
            edition={phase.view.edition}
            submitting={submitting}
            submitError={submitError}
            serverErrors={serverErrors}
            onAccept={handleAccept}
            onDecline={handleDecline}
          />
        </div>
      )}
    </div>
  );
}
