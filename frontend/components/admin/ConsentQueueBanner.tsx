// @sdd-spec actors/consent-intake/consent-request-email (T-9)
'use client';

/**
 * ConsentQueueBanner — the "closing the tab mid-run" safety net (FR-4, FR-6).
 *
 * Reads `GET admin/consent-requests/queue` (across ALL batches). When any
 * request is still QUEUED it offers **Resume sending** (the dispatch loop
 * with no batchId); when any FAILED it offers **Retry failed** (retry, then
 * the loop). Renders nothing when both are zero or the read fails — a
 * missing banner must never block the actors list.
 *
 * `refreshKey` lets the page re-read the queue after the send dialog closes.
 */

import { useCallback, useEffect, useState } from 'react';

import { AuthFailureError } from '@/lib/api/client';
import { getConsentQueue, type ConsentRequestQueueSummary } from '@/lib/api/consent-requests-admin';
import { BULK_SEND_COPY } from '@/lib/content/consent-requests';
import type { ConsentDispatch } from '@/lib/admin/useConsentDispatch';

export interface ConsentQueueBannerProps {
  token: string;
  /** The page's single dispatch owner — shared with the send dialog, never created here. */
  dispatch: ConsentDispatch;
  /** Bump to re-read the queue (e.g. after the send dialog closes). */
  refreshKey?: number;
  onAuthFailure: () => void;
}

const buttonClasses = [
  'rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-fg',
  'transition-colors hover:bg-surface-alt',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

export function ConsentQueueBanner({ token, dispatch, refreshKey = 0, onAuthFailure }: Readonly<ConsentQueueBannerProps>) {
  const [queue, setQueue] = useState<ConsentRequestQueueSummary | null>(null);
  const phase = dispatch.state.phase;

  const refresh = useCallback(async () => {
    try {
      setQueue(await getConsentQueue(token));
    } catch (caught: unknown) {
      if (caught instanceof AuthFailureError) {
        onAuthFailure();
        return;
      }
      setQueue(null);
    }
  }, [token, onAuthFailure]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  // Re-read once a loop settles so the counts (and the banner) reflect the server.
  useEffect(() => {
    if (phase === 'done' || phase === 'error') void refresh();
  }, [phase, refresh]);

  const running = phase === 'running';
  if (!running && (!queue || (queue.queued === 0 && queue.failed === 0))) {
    return phase === 'done' ? (
      <p role="status" aria-live="polite" className="rounded-md bg-highlight-tint px-4 py-3 text-sm font-medium text-success">
        Sent {dispatch.state.sent}
        {dispatch.state.failed > 0 ? ` · Failed ${dispatch.state.failed}` : ''}.
      </p>
    ) : null;
  }

  return (
    <section
      aria-label="Consent request queue"
      className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="text-sm text-fg">
        {running ? (
          <p role="status" aria-live="polite" aria-atomic="true">
            Sending consent requests… Sent {dispatch.state.sent} · Failed {dispatch.state.failed} · Remaining{' '}
            {dispatch.state.remaining}
          </p>
        ) : (
          <>
            {queue && queue.queued > 0 && (
              <p>
                <span className="font-medium">{queue.queued}</span> consent{' '}
                {plural(queue.queued, 'request is', 'requests are')} queued and not yet sent.
              </p>
            )}
            {queue && queue.failed > 0 && (
              <p>
                <span className="font-medium">{queue.failed}</span> consent{' '}
                {plural(queue.failed, 'request', 'requests')} failed to send.
              </p>
            )}
            {phase === 'error' && dispatch.state.error && (
              <p role="alert" className="mt-1 text-danger">
                {dispatch.state.error}
              </p>
            )}
          </>
        )}
      </div>

      {!running && queue && (
        <div className="flex flex-wrap items-center gap-2">
          {queue.queued > 0 && (
            <button
              type="button"
              className={buttonClasses}
              onClick={() => void dispatch.start({ initialRemaining: queue.queued })}
            >
              {BULK_SEND_COPY.bannerResume}
            </button>
          )}
          {queue.failed > 0 && (
            <button type="button" className={buttonClasses} onClick={() => void dispatch.retryFailed()}>
              {BULK_SEND_COPY.bannerRetry}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
