// @sdd-spec actors/consent-intake/consent-request-email (T-9)
'use client';

/**
 * useConsentDispatch — the screen-driven send loop (FR-6, design.md §5.2).
 *
 * The API sends in time-boxed steps; THIS hook is what keeps stepping until
 * the server reports `remaining = 0`. Rules:
 *   - **ONE instance per page.** `ActorsView` owns it and passes the state and
 *     actions to both the queue banner and the send dialog; the in-flight
 *     guard is local to an instance, so a second instance would permit two
 *     concurrent dispatch loops (design.md §5.2: one dispatch at a time per
 *     tab — one Lambda concurrency slot of the 5 reserved, P-10);
 *   - one dispatch call in flight at a time (a second `start` while running
 *     is ignored);
 *   - stops on unmount — an in-flight call is allowed to finish but its
 *     result is discarded and no further call is made. Whatever is still
 *     QUEUED stays recorded, which is what the resume banner picks up;
 *   - `MAX_STALLED_STEPS` consecutive steps that neither sent nor failed
 *     anything (another admin is draining the same queue) end the loop
 *     instead of spinning forever.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { AuthFailureError } from '@/lib/api/client';
import {
  dispatchConsentRequests,
  type ConsentDispatchFailure,
  retryConsentRequests,
} from '@/lib/api/consent-requests-admin';
import { BULK_SEND_COPY } from '@/lib/content/consent-requests';

export const MAX_STALLED_STEPS = 5;

export interface ConsentDispatchState {
  phase: 'idle' | 'running' | 'done' | 'error';
  /** Cumulative across a run, and across a Retry that follows it. */
  sent: number;
  /** Failures of the CURRENT run only — a retried row leaves this count. */
  failed: number;
  /** Which actors failed, and why — the current run only, deduped by actor. */
  failures: ConsentDispatchFailure[];
  remaining: number;
  error?: string;
}

const IDLE: ConsentDispatchState = { phase: 'idle', sent: 0, failed: 0, failures: [], remaining: 0 };

export interface UseConsentDispatchOptions {
  token: string;
  onAuthFailure?: () => void;
}

export function useConsentDispatch({ token, onAuthFailure }: UseConsentDispatchOptions) {
  const [state, setState] = useState<ConsentDispatchState>(IDLE);

  const mountedRef = useRef(true);
  const runningRef = useRef(false);
  const authFailureRef = useRef(onAuthFailure);
  // `retryFailed` continues the cumulative sent total without being
  // re-created on every step, so it reads it through a ref.
  const stateSentRef = useRef(0);

  // Ref writes belong in an effect, not in render.
  useEffect(() => {
    stateSentRef.current = state.sent;
    authFailureRef.current = onAuthFailure;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const drive = useCallback(
    async (batchId: string | undefined, startRemaining: number, baseSent: number) => {
      let sent = baseSent;
      let failed = 0;
      let failures: ConsentDispatchFailure[] = [];
      let stalled = 0;
      setState({ phase: 'running', sent, failed, failures, remaining: startRemaining });

      for (;;) {
        if (!mountedRef.current) return;
        const step = await dispatchConsentRequests(batchId ? { batchId } : {}, token);
        if (!mountedRef.current) return;

        sent += step.sent;
        failed += step.failed;
        const fresh = (step.failures ?? []).filter((f) => !failures.some((g) => g.actorId === f.actorId));
        if (fresh.length > 0) failures = [...failures, ...fresh];
        if (step.remaining === 0) {
          setState({ phase: 'done', sent, failed, failures, remaining: 0 });
          return;
        }

        stalled = step.sent + step.failed === 0 ? stalled + 1 : 0;
        if (stalled >= MAX_STALLED_STEPS) {
          setState({
            phase: 'error',
            sent,
            failed,
            failures,
            remaining: step.remaining,
            error: BULK_SEND_COPY.stalled,
          });
          return;
        }
        setState({ phase: 'running', sent, failed, failures, remaining: step.remaining });
      }
    },
    [token],
  );

  /** Run `fn` as THE one in-flight loop; map failures onto `state`. */
  const guarded = useCallback(async (fn: () => Promise<void>) => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      await fn();
    } catch (caught: unknown) {
      if (!mountedRef.current) return;
      if (caught instanceof AuthFailureError) {
        authFailureRef.current?.();
        return;
      }
      setState((prev) => ({
        ...prev,
        phase: 'error',
        error: caught instanceof Error && caught.message ? caught.message : BULK_SEND_COPY.sendFailed,
      }));
    } finally {
      runningRef.current = false;
    }
  }, []);

  /** Dispatch until `remaining = 0`. Omit `batchId` to drain every batch (the resume banner). */
  const start = useCallback(
    (opts: { batchId?: string; initialRemaining?: number } = {}) =>
      guarded(() => drive(opts.batchId, opts.initialRemaining ?? 0, 0)),
    [guarded, drive],
  );

  /** `retry` (FAILED → QUEUED) and then the dispatch loop; keeps the sent total. */
  const retryFailed = useCallback(
    (opts: { batchId?: string } = {}) =>
      guarded(async () => {
        const { queued } = await retryConsentRequests(opts.batchId ? { batchId: opts.batchId } : {}, token);
        if (!mountedRef.current) return;
        if (queued === 0) {
          setState((prev) => ({ ...prev, phase: 'done', failed: 0, failures: [], remaining: 0 }));
          return;
        }
        await drive(opts.batchId, queued, stateSentRef.current);
      }),
    [guarded, drive, token],
  );

  /** Back to idle between runs; a no-op while a loop is running. */
  const reset = useCallback(() => {
    if (!runningRef.current) setState(IDLE);
  }, []);

  return { state, start, retryFailed, reset };
}

export type ConsentDispatch = ReturnType<typeof useConsentDispatch>;
