// @sdd-spec actors/consent-intake/consent-request-email (T-10)
'use client';

/**
 * SendConsentAction — the edit page's "Send consent request" / "Resend"
 * button (FR-3, design §7.3).
 *
 * - Eligibility comes from a `single`-scope preview (FR-2): `toSend = 0`
 *   disables the button and the FR-2 reason is printed beside it. The button
 *   uses `aria-disabled` (not `disabled`) so keyboard users can still reach
 *   the control and hear the reason through `aria-describedby`.
 * - **Resend** replaces the label when the actor already has a request
 *   QUEUED / SENDING / FAILED / SENT-and-unexpired (read from the consent
 *   evidence; the preview cannot say, `single` re-asks regardless).
 * - Sending reuses `SendConsentDialog` with `scope: 'single'` and exactly one
 *   id. The page owns the single dispatch loop and passes it in.
 */

import { useCallback, useEffect, useId, useState } from 'react';

import { AuthFailureError } from '@/lib/api/client';
import {
  getActorConsentEvidence,
  previewConsentRequests,
  type ConsentRequestPreviewResult,
} from '@/lib/api/consent-requests-admin';
import {
  CONSENT_SKIP_REASONS,
  CONSENT_SKIP_REASON_LABEL,
  PENDING_REQUEST_STATUSES,
  SINGLE_SEND_COPY,
} from '@/lib/content/consent-requests';
import type { ConsentDispatch } from '@/lib/admin/useConsentDispatch';
import { SendConsentDialog } from '@/components/admin/SendConsentDialog';

export interface SendConsentActionProps {
  actorId: string;
  token: string;
  dispatch: ConsentDispatch;
  onAuthFailure: () => void;
}

interface Availability {
  preview: ConsentRequestPreviewResult;
  pending: boolean;
}

export function SendConsentAction({
  actorId,
  token,
  dispatch,
  onAuthFailure,
}: Readonly<SendConsentActionProps>) {
  const reasonId = useId();
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  // Bumped when the dialog closes so the label/eligibility reflect what was just sent.
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      previewConsentRequests({ target: { kind: 'ids', ids: [actorId] }, scope: 'single' }, token),
      // Evidence is best-effort: if it fails the label stays "Send".
      getActorConsentEvidence(actorId, token).catch((caught: unknown) => {
        if (caught instanceof AuthFailureError) throw caught;
        return null;
      }),
    ])
      .then(([preview, evidence]) => {
        if (cancelled) return;
        const pending = evidence?.requests.some((r) => PENDING_REQUEST_STATUSES.has(r.status)) ?? false;
        setFailed(false);
        setAvailability({ preview, pending });
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        if (caught instanceof AuthFailureError) {
          onAuthFailure();
          return;
        }
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [actorId, token, refresh, onAuthFailure]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setRefresh((n) => n + 1);
  }, []);

  if (failed) {
    return (
      <output className="block text-sm text-muted">
        {SINGLE_SEND_COPY.checkFailed}
      </output>
    );
  }
  if (!availability) return null;

  const { preview, pending } = availability;
  const eligible = preview.toSend > 0;
  const reason = eligible
    ? null
    : CONSENT_SKIP_REASONS.filter((r) => preview.skipped[r] > 0).map((r) => CONSENT_SKIP_REASON_LABEL[r])[0] ?? null;

  return (
    <div className="flex flex-col gap-1 sm:items-end">
      <button
        type="button"
        aria-disabled={!eligible}
        aria-describedby={reason ? reasonId : undefined}
        onClick={() => {
          if (eligible) setOpen(true);
        }}
        className={[
          'inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-2',
          'text-sm font-medium text-fg transition-colors',
          eligible ? 'hover:bg-surface-alt' : 'cursor-not-allowed opacity-50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        ].join(' ')}
      >
        {pending ? SINGLE_SEND_COPY.resend : SINGLE_SEND_COPY.send}
      </button>
      {reason && (
        <p id={reasonId} className="text-xs text-muted">
          {reason}
        </p>
      )}
      {open && (
        <SendConsentDialog
          scope="single"
          target={{ kind: 'ids', ids: [actorId] }}
          expectedCount={1}
          token={token}
          dispatch={dispatch}
          onClose={handleClose}
          onAuthFailure={onAuthFailure}
        />
      )}
    </div>
  );
}
