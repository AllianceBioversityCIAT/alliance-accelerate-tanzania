// @sdd-spec actors/consent-intake/consent-request-email (T-9)
'use client';

/**
 * SendConsentDialog — bulk "Send consent request" flow (FR-2, FR-4, FR-6).
 *
 *   preview → confirm → (enqueue) → progress → result
 *
 * - **preview**: `previewConsentRequests` runs on open. Nothing is written.
 * - **confirm**: states how many will be sent and how many are skipped, by
 *   FR-2 reason, BEFORE anything is sent. Send is unavailable when nothing
 *   is eligible. Counts are shown exactly as the server returned them.
 * - **progress**: `enqueueConsentRequests` records every request first
 *   (FR-6), then `useConsentDispatch` steps until `remaining = 0`.
 *   Announced via an `aria-live="polite"` region.
 * - **result**: sent / skipped / failed, with **Retry failed** (retry, then
 *   the dispatch loop) when anything failed.
 *
 * Mount it only while the dialog is open. It does NOT own the send loop: the
 * page's single `useConsentDispatch` does, so closing the dialog mid-run
 * leaves that loop going (shown in the ConsentQueueBanner) and no second loop
 * can start beside it. Unsent requests stay QUEUED and the banner offers to
 * resume them after a tab close (FR-4 "closing the tab").
 *
 * Shell mirrors `ConfirmDialog` (backdrop, panel, `useDialogFocusTrap`,
 * `DialogFooter`); tokens only.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { AuthFailureError } from '@/lib/api/client';
import {
  enqueueConsentRequests,
  previewConsentRequests,
  type ConsentRequestPreviewResult,
  type ConsentRequestTarget,
  type ConsentSkipCounts,
} from '@/lib/api/consent-requests-admin';
import {
  BULK_SEND_COPY,
  CONSENT_SKIP_REASONS,
  CONSENT_SKIP_REASON_LABEL,
} from '@/lib/content/consent-requests';
import type { ConsentDispatch } from '@/lib/admin/useConsentDispatch';
import { useDialogFocusTrap } from '@/lib/admin/useDialogFocusTrap';
import { DialogFooter } from '@/components/admin/DialogFooter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendConsentDialogProps {
  /** `{ kind: 'ids' }` for selected rows or `{ kind: 'filter' }` for "all matching". */
  target: ConsentRequestTarget;
  /** How many actors the admin believed they had targeted — drives the neutral "changed" note. */
  expectedCount: number;
  token: string;
  /**
   * The page's single dispatch owner. The dialog never creates its own loop:
   * closing it leaves a running loop going, visible in the queue banner.
   */
  dispatch: ConsentDispatch;
  /** Called on Cancel / Escape / backdrop / Close. A running loop keeps going; the banner shows it. */
  onClose: () => void;
  onAuthFailure: () => void;
}

type Stage =
  | { name: 'previewing' }
  | { name: 'confirm'; preview: ConsentRequestPreviewResult }
  | { name: 'enqueuing'; preview: ConsentRequestPreviewResult }
  | { name: 'sending'; batchId: string; queued: number; skipped: ConsentSkipCounts }
  | { name: 'preview-error'; message: string }
  | { name: 'enqueue-error'; preview: ConsentRequestPreviewResult; message: string };

const sumSkipped = (skipped: ConsentSkipCounts): number =>
  CONSENT_SKIP_REASONS.reduce((total, reason) => total + skipped[reason], 0);

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function SkipBreakdown({ skipped }: Readonly<{ skipped: ConsentSkipCounts }>) {
  const rows = CONSENT_SKIP_REASONS.filter((reason) => skipped[reason] > 0);
  if (rows.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-fg">{BULK_SEND_COPY.skippedHeading}</h3>
      <dl className="mt-2 divide-y divide-border rounded-md border border-border text-sm">
        {rows.map((reason) => (
          <div key={reason} className="flex items-center justify-between gap-3 px-3 py-2">
            <dt className="text-muted">{CONSENT_SKIP_REASON_LABEL[reason]}</dt>
            <dd className="font-medium text-fg">{skipped[reason]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Tally({
  label,
  value,
  tone = 'text-fg',
}: Readonly<{ label: string; value: number; tone?: string }>) {
  return (
    <div className="flex flex-col rounded-md border border-border bg-surface-alt px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`font-display text-2xl font-extrabold ${tone}`}>{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SendConsentDialog({
  target,
  expectedCount,
  token,
  dispatch,
  onClose,
  onAuthFailure,
}: Readonly<SendConsentDialogProps>) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
  const errorId = `${uid}-error`;

  const [stage, setStage] = useState<Stage>({ name: 'previewing' });
  const titleRef = useRef<HTMLHeadingElement>(null);
  const { dialogRef, onKeyDown } = useDialogFocusTrap<HTMLDivElement>(onClose);

  // Pinned on first render: the preview must describe the target the admin
  // chose, even if the page's filters move behind the modal backdrop.
  const targetRef = useRef(target);
  const authFailureRef = useRef(onAuthFailure);
  useEffect(() => {
    authFailureRef.current = onAuthFailure;
  });

  // ── Preview on open ──────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    previewConsentRequests({ target: targetRef.current, scope: 'bulk' }, token)
      .then((preview) => {
        if (!cancelled) setStage({ name: 'confirm', preview });
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        if (caught instanceof AuthFailureError) {
          authFailureRef.current();
          return;
        }
        setStage({
          name: 'preview-error',
          message: caught instanceof Error && caught.message ? caught.message : BULK_SEND_COPY.previewFailed,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // ── Move focus to the heading whenever the step changes ──────────────────

  const dispatchPhase = dispatch.state.phase;
  const stepKey = stage.name === 'sending' ? `sending-${dispatchPhase}` : stage.name;
  useEffect(() => {
    titleRef.current?.focus();
  }, [stepKey]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleConfirm = useCallback(
    async (preview: ConsentRequestPreviewResult) => {
      setStage({ name: 'enqueuing', preview });
      dispatch.reset(); // drop a previous run's counts before this one starts
      try {
        const result = await enqueueConsentRequests({ target: targetRef.current, scope: 'bulk' }, token);
        setStage({ name: 'sending', batchId: result.batchId, queued: result.queued, skipped: result.skipped });
        if (result.queued > 0) {
          await dispatch.start({ batchId: result.batchId, initialRemaining: result.queued });
        }
      } catch (caught: unknown) {
        if (caught instanceof AuthFailureError) {
          authFailureRef.current();
          return;
        }
        setStage({
          name: 'enqueue-error',
          preview,
          message: caught instanceof Error && caught.message ? caught.message : BULK_SEND_COPY.sendFailed,
        });
      }
    },
    [token, dispatch],
  );

  // ── Render ───────────────────────────────────────────────────────────────

  let title: string = BULK_SEND_COPY.dialogTitle;
  let description = '';
  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;

  if (stage.name === 'previewing') {
    description = BULK_SEND_COPY.previewing;
    body = <div role="status" aria-live="polite" className="mt-4 text-sm text-muted">{BULK_SEND_COPY.previewing}</div>;
    footer = (
      <DialogFooter errorId={errorId} onCancel={onClose} hideConfirm />
    );
  } else if (stage.name === 'preview-error') {
    description = 'The selection could not be checked.';
    footer = (
      <DialogFooter
        error={stage.message}
        errorId={errorId}
        onCancel={onClose}
        hideConfirm
        cancelLabel="Close"
      />
    );
  } else if (stage.name === 'confirm' || stage.name === 'enqueuing' || stage.name === 'enqueue-error') {
    const { preview } = stage;
    const skippedTotal = sumSkipped(preview.skipped);
    const nothing = preview.toSend === 0;
    const changed = preview.total !== expectedCount;
    const missing = expectedCount - preview.total;

    description = nothing
      ? 'No request will be sent for this selection.'
      : `Each eligible actor receives one email with a private link. Confirm to send.`;
    body = (
      <>
        <p className="mt-4 text-sm text-fg">
          <span className="font-display text-3xl font-extrabold text-fg">{preview.toSend}</span>{' '}
          to send
          <span className="text-muted">
            {' '}
            of {preview.total} {plural(preview.total, 'actor', 'actors')} targeted
          </span>
        </p>
        {nothing && (
          <p role="status" className="mt-3 rounded-md bg-surface-alt px-3 py-2 text-sm text-fg">
            {BULK_SEND_COPY.nothingEligibleTitle}
            {preview.total === 0 ? '.' : ` — all ${skippedTotal} ${plural(skippedTotal, 'is', 'are')} skipped for the reasons below.`}
          </p>
        )}
        {changed &&
          (target.kind === 'ids' && missing > 0 ? (
            <p className="mt-3 text-sm text-muted">
              {missing} selected {plural(missing, 'actor no longer exists', 'actors no longer exist')}.
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted">
              The selection changed: {expectedCount} {plural(expectedCount, 'actor', 'actors')} when you selected,{' '}
              {preview.total} now.
            </p>
          ))}
        <SkipBreakdown skipped={preview.skipped} />
      </>
    );
    const busy = stage.name === 'enqueuing';
    footer = (
      <DialogFooter
        error={stage.name === 'enqueue-error' ? stage.message : undefined}
        errorId={errorId}
        onCancel={onClose}
        loading={busy}
        onConfirm={() => void handleConfirm(preview)}
        confirmDisabled={nothing || busy}
        confirmLabel={`Send ${preview.toSend} ${plural(preview.toSend, 'request', 'requests')}`}
        tone="primary"
      />
    );
  } else {
    // stage.name === 'sending' — progress, then result, driven by the hook.
    const { sent, failed, remaining, error } = dispatch.state;
    const skippedTotal = sumSkipped(stage.skipped);
    const running = dispatchPhase === 'running' || (dispatchPhase === 'idle' && stage.queued > 0);
    const settled = sent + failed;
    const planned = settled + remaining;
    const pct = planned === 0 ? 100 : Math.round((settled / planned) * 100);

    if (running) {
      title = BULK_SEND_COPY.sendProgressTitle;
      description = BULK_SEND_COPY.closeLater;
      body = (
        <div className="mt-4">
          <div aria-hidden="true" className="h-2 w-full overflow-hidden rounded-full bg-surface-alt">
            <div className="h-2 rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p role="status" aria-live="polite" aria-atomic="true" className="mt-3 text-sm text-fg">
            Sent {sent} · Failed {failed} · Remaining {remaining}
          </p>
        </div>
      );
      footer = (
        <DialogFooter
          errorId={errorId}
          onCancel={onClose}
          hideConfirm
          cancelLabel="Close"
        />
      );
    } else {
      title = BULK_SEND_COPY.resultTitle;
      const halted = dispatchPhase === 'error';
      description = halted
        ? 'Sending stopped before every request went out.'
        : failed > 0
          ? 'Some requests could not be sent. You can retry only those.'
          : 'Every queued request was handled.';
      body = (
        <>
          <div role="status" aria-live="polite">
            <dl className="mt-4 grid grid-cols-3 gap-2">
              <Tally label="Sent" value={sent} tone="text-success" />
              <Tally label="Skipped" value={skippedTotal} />
              <Tally label="Failed" value={failed} tone={failed > 0 ? 'text-danger' : 'text-fg'} />
            </dl>
          </div>
          {halted && remaining > 0 && (
            <p className="mt-3 text-sm text-muted">
              {remaining} {plural(remaining, 'request stays', 'requests stay')} queued and can be resumed from Actors.
            </p>
          )}
          <SkipBreakdown skipped={stage.skipped} />
        </>
      );
      footer =
        failed === 0 ? (
          <DialogFooter
            error={halted ? error : undefined}
            errorId={errorId}
            onCancel={onClose}
            hideConfirm
            cancelLabel="Close"
          />
        ) : (
          <DialogFooter
            error={halted ? error : undefined}
            errorId={errorId}
            onCancel={onClose}
            onConfirm={() => void dispatch.retryFailed({ batchId: stage.batchId })}
            confirmDisabled={false}
            confirmLabel={BULK_SEND_COPY.retryFailed}
            cancelLabel="Close"
            tone="primary"
          />
        );
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onKeyDown={onKeyDown}
        className={[
          'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
          'max-h-screen overflow-y-auto',
          'rounded-md border border-border bg-surface p-6 shadow-lg',
        ].join(' ')}
      >
        <h2 id={titleId} ref={titleRef} tabIndex={-1} className="text-base font-semibold text-fg focus:outline-none">
          {title}
        </h2>
        <p id={descId} className="mt-2 text-sm text-muted">
          {description}
        </p>
        {body}
        {footer}
      </div>
    </>
  );
}
