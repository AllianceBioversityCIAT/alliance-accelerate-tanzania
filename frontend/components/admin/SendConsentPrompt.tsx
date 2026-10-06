// @sdd-spec actors/consent-intake/consent-request-email (T-10)
'use client';

/**
 * SendConsentPrompt — the post-create dialog on /admin/actors/new (FR-3,
 * design §7.3, P-25).
 *
 * One dialog: the duplicate warnings (when any) AND the send question. The
 * question renders ONLY when the created actor is not `GRANTED` (B-13) and
 * has an email to send to; the primary action defaults to Send.
 *
 *   Not now → nothing is sent; `onDone()` (the page navigates).
 *   Send    → enqueue (`single`, one id) → the page's dispatch loop → `onDone()`.
 *
 * With no question to ask (a `GRANTED` create, or no email) it degrades to
 * the warnings-only informational dialog with a single OK.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { AuthFailureError } from '@/lib/api/client';
import type { AdminActorCreateResult } from '@/lib/api/actors-admin';
import { enqueueConsentRequests } from '@/lib/api/consent-requests-admin';
import { BULK_SEND_COPY, SINGLE_SEND_COPY } from '@/lib/content/consent-requests';
import type { ConsentDispatch } from '@/lib/admin/useConsentDispatch';
import { useDialogFocusTrap } from '@/lib/admin/useDialogFocusTrap';
import { matchedOnLabel } from '@/components/admin/DuplicateConfirmDialog';

export interface SendConsentPromptProps {
  actor: AdminActorCreateResult;
  token: string;
  /** The page's single dispatch owner. */
  dispatch: ConsentDispatch;
  /** Navigate onward; called after Not now / OK / a finished send. */
  onDone: () => void;
  onAuthFailure: () => void;
}

type Phase = 'ask' | 'sending' | 'finished-with-problem';

const BUTTON_BASE = [
  'rounded-md px-4 py-2 text-sm font-medium transition-colors',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');

export function SendConsentPrompt({
  actor,
  token,
  dispatch,
  onDone,
  onAuthFailure,
}: Readonly<SendConsentPromptProps>) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
  const primaryRef = useRef<HTMLButtonElement>(null);

  const warnings = actor.duplicateWarnings ?? [];
  const askToSend = actor.consentStatus !== 'GRANTED' && !!actor.email; // B-13 gate
  const [phase, setPhase] = useState<Phase>('ask');
  const [error, setError] = useState<string | undefined>();

  const busy = phase === 'sending';
  const { dialogRef, onKeyDown } = useDialogFocusTrap<HTMLDivElement>(busy ? () => undefined : onDone);

  useEffect(() => {
    const id = requestAnimationFrame(() => primaryRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const handleSend = useCallback(async () => {
    setPhase('sending');
    setError(undefined);
    dispatch.reset();
    try {
      const result = await enqueueConsentRequests(
        { target: { kind: 'ids', ids: [actor.id] }, scope: 'single' },
        token,
      );
      if (result.queued === 0) {
        onDone();
        return;
      }
      // The effect below navigates once the loop settles cleanly.
      await dispatch.start({ batchId: result.batchId, initialRemaining: result.queued });
    } catch (caught: unknown) {
      if (caught instanceof AuthFailureError) {
        onAuthFailure();
        return;
      }
      setError(caught instanceof Error && caught.message ? caught.message : BULK_SEND_COPY.sendFailed);
      setPhase('ask');
    }
  }, [actor.id, token, dispatch, onDone, onAuthFailure]);

  // The dispatch loop reports step failures through its own state, not by throwing.
  const dispatchProblem = dispatch.state.phase === 'error' || dispatch.state.failed > 0;
  const dispatchPhase = dispatch.state.phase;
  useEffect(() => {
    if (!busy || (dispatchPhase !== 'done' && dispatchPhase !== 'error')) return;
    if (dispatchProblem) setPhase('finished-with-problem');
    else onDone();
  }, [busy, dispatchPhase, dispatchProblem, onDone]);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-backdrop" aria-hidden="true" onClick={busy ? undefined : onDone} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onKeyDown={onKeyDown}
        className={[
          'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
          'max-h-screen overflow-y-auto rounded-md border border-border bg-surface p-6 shadow-lg',
        ].join(' ')}
      >
        <h2 id={titleId} className="text-base font-semibold text-fg">
          {SINGLE_SEND_COPY.promptTitle}
        </h2>
        <p id={descId} className="mt-2 text-sm text-muted">
          Created {actor.traderId}.{warnings.length > 0 ? ' Similar actors:' : ''}
        </p>

        {warnings.length > 0 && (
          <>
            <div aria-live="polite" aria-atomic="true" className="sr-only">
              {warnings.length} similar {warnings.length === 1 ? 'actor' : 'actors'} found.
            </div>
            <ul className="mt-3 space-y-2">
              {warnings.map((warning) => (
                <li key={warning.actorId} className="rounded-md border border-border bg-surface-alt p-3">
                  <p className="text-sm font-medium text-fg">{warning.traderName}</p>
                  <p className="text-xs text-muted">
                    {warning.traderId} — matched on {matchedOnLabel(warning.matchedOn)}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}

        {askToSend && (
          <div className={warnings.length > 0 ? 'mt-5 border-t border-border pt-4' : 'mt-4'}>
            <p className="text-sm font-semibold text-fg">{SINGLE_SEND_COPY.promptQuestion(actor.email ?? '')}</p>
            <p className="mt-1 text-xs text-muted">{SINGLE_SEND_COPY.promptHint}</p>
            <div role="status" aria-live="polite" className="mt-2 text-sm">
              {busy && <span className="text-muted">{SINGLE_SEND_COPY.sending}</span>}
              {phase === 'finished-with-problem' && (
                <span className="text-danger">{dispatch.state.error ?? SINGLE_SEND_COPY.notSent}</span>
              )}
              {error && <span className="text-danger">{error}</span>}
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {askToSend && phase !== 'finished-with-problem' ? (
            <>
              <button
                type="button"
                onClick={onDone}
                disabled={busy}
                className={`${BUTTON_BASE} border border-border bg-surface text-fg hover:bg-surface-alt`}
              >
                {SINGLE_SEND_COPY.notNow}
              </button>
              <button
                ref={primaryRef}
                type="button"
                onClick={() => void handleSend()}
                disabled={busy}
                className={`${BUTTON_BASE} bg-primary text-primary-fg hover:bg-primary-hover`}
              >
                {error ? SINGLE_SEND_COPY.tryAgain : SINGLE_SEND_COPY.sendLabel}
              </button>
            </>
          ) : (
            <button
              ref={primaryRef}
              type="button"
              onClick={onDone}
              className={`${BUTTON_BASE} bg-primary text-primary-fg hover:bg-primary-hover`}
            >
              {phase === 'finished-with-problem' ? SINGLE_SEND_COPY.continueToActors : 'OK'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
