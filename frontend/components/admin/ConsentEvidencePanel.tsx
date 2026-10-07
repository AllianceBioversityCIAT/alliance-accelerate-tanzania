// @sdd-spec actors/consent-intake/consent-request-email (T-11)
'use client';

/**
 * ConsentEvidencePanel — "Consent evidence" on `/admin/actors/edit?id=`
 * (FR-14, FR-16, design §7.3).
 *
 * Lists EVERY consent request and EVERY stored document, newest first, so an
 * auditor can answer from this page alone who sent a request, when, to which
 * address, under which edition, and who answered, when and with what identity.
 *
 * - **Times carry an explicit timezone.** The `ConsentRecordCard` convention:
 *   `Intl.DateTimeFormat` with `timeZone: 'UTC'` + `timeZoneName: 'short'`, and
 *   the response time keeps a qualifier saying it is the SERVER's clock, not
 *   an attested client time.
 * - **"Read exact text"** opens the edition the request was sent under, through
 *   `GET admin/consent-editions/:version`, inline in a keyboard-scrollable
 *   region. Cached per version for the life of the panel.
 * - **Download** asks for a 5-minute presigned GET and navigates to it; the
 *   response is an attachment, so the page is not left.
 * - Attaching a document from here uses `ConsentDocumentField` (immediate).
 *
 * Status badges are the total `Record`s in `lib/content/consent-requests.ts`.
 * Tokens only; no `/NN` opacity modifiers (inert on semantic tokens).
 */

import { useCallback, useEffect, useId, useState } from 'react';

import { AuthFailureError } from '@/lib/api/client';
import {
  getActorConsentEvidence,
  getConsentDocumentDownloadUrl,
  getConsentEdition,
  type AdminConsentEdition,
  type ConsentDocumentEvidence,
  type ConsentEvidence,
  type ConsentRequestEvidence,
} from '@/lib/api/consent-requests-admin';
import {
  CONSENT_REQUEST_STATUS_BADGE_CLASSES,
  CONSENT_REQUEST_STATUS_LABEL,
  EVIDENCE_PANEL_COPY,
  consentFailureReasonLabel,
} from '@/lib/content/consent-requests';
import Skeleton from '@/components/ui/Skeleton';
import { ConsentDocumentField } from '@/components/admin/ConsentDocumentField';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UTC_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short',
});

/** UTC with a literal "UTC" designator — see `ConsentRecordCard.formatAcceptedAt`. */
function formatUtc(iso: string): string {
  try {
    return UTC_FORMAT.format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

const NONE = EVIDENCE_PANEL_COPY.none;

function Time({ iso }: Readonly<{ iso: string | null }>) {
  if (!iso) return <>{NONE}</>;
  return <time dateTime={iso}>{formatUtc(iso)}</time>;
}

const LINK_BUTTON = [
  'rounded-sm text-sm font-medium text-primary hover:text-primary-hover',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Row({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-fg">{children}</dd>
    </div>
  );
}

interface EditionState {
  status: 'loading' | 'ready' | 'failed';
  edition?: AdminConsentEdition;
}

function EditionText({ state }: Readonly<{ state: EditionState | undefined }>) {
  if (!state || state.status === 'loading') {
    return (
      <output className="block text-sm text-muted">
        {EVIDENCE_PANEL_COPY.textLoading}
      </output>
    );
  }
  if (state.status === 'failed' || !state.edition) {
    return (
      <p role="alert" className="text-sm text-danger">
        {EVIDENCE_PANEL_COPY.textFailed}
      </p>
    );
  }
  const { edition } = state;
  return (
    <section
      // Keyboard-reachable scroll region; `relative` per the scroll-container rule.
      tabIndex={0}
      aria-label={`Consent text, edition ${edition.version}`}
      className="relative max-h-64 overflow-y-auto rounded-md border border-border bg-surface-alt p-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {edition.sections.map((section) => (
        <section key={section.heading} className="mb-3 last:mb-0">
          <h4 className="font-semibold">{section.heading}</h4>
          <p className="mt-1 whitespace-pre-line">{section.body}</p>
        </section>
      ))}
      <p className="mt-3 border-t border-border pt-3 font-medium">{edition.acceptanceStatement}</p>
    </section>
  );
}

interface RequestCardProps {
  request: ConsentRequestEvidence;
  editionOpen: boolean;
  editionState: EditionState | undefined;
  onToggleEdition: (requestId: string, version: string) => void;
}

function RequestCard({ request, editionOpen, editionState, onToggleEdition }: Readonly<RequestCardProps>) {
  const textId = useId();
  const answered = request.respondedAt !== null;
  const sender = request.requestedByEmail ?? request.requestedBySub ?? EVIDENCE_PANEL_COPY.unknownSender;

  return (
    <li className="rounded-md border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={[
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
            CONSENT_REQUEST_STATUS_BADGE_CLASSES[request.status],
          ].join(' ')}
        >
          {CONSENT_REQUEST_STATUS_LABEL[request.status]}
        </span>
        <span className="text-xs text-muted">
          Edition {request.editionVersion}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <Row label="Sent by">{sender}</Row>
        <Row label="Sent at">
          {request.sentAt ? <Time iso={request.sentAt} /> : EVIDENCE_PANEL_COPY.notSentYet}
        </Row>
        <Row label="Address used">{request.recipientEmail}</Row>
        <Row label="Edition">
          <span className="mr-2">{request.editionVersion}</span>
          <button
            type="button"
            aria-expanded={editionOpen}
            aria-controls={textId}
            onClick={() => onToggleEdition(request.id, request.editionVersion)}
            className={LINK_BUTTON}
          >
            {editionOpen ? EVIDENCE_PANEL_COPY.hideText : EVIDENCE_PANEL_COPY.readText}
          </button>
        </Row>
        {request.failureReason && <Row label="Failure">{consentFailureReasonLabel(request.failureReason)}</Row>}
      </dl>

      <div id={textId} className="mt-3 empty:hidden">
        {editionOpen && <EditionText state={editionState} />}
      </div>

      {answered && (
        <div className="mt-4 border-t border-border pt-3">
          <h4 className="text-sm font-semibold text-fg">{EVIDENCE_PANEL_COPY.respondedHeading}</h4>
          <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
            <Row label="Name">{request.respondentName ?? NONE}</Row>
            <Row label="Position">{request.respondentPosition ?? NONE}</Row>
            <Row label="Email">{request.respondentEmail ?? NONE}</Row>
            <Row label="Telephone">{request.respondentPhone ?? NONE}</Row>
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted">Response time</dt>
              <dd className="mt-0.5 text-sm text-fg">
                <Time iso={request.respondedAt} />
              </dd>
              <dd className="mt-1 text-xs text-muted">{EVIDENCE_PANEL_COPY.respondedTimeNote}</dd>
            </div>
            <Row label="IP address">{request.respondentIp ?? NONE}</Row>
            <Row label="Browser (user agent)">{request.respondentUserAgent ?? NONE}</Row>
          </dl>
        </div>
      )}
    </li>
  );
}

interface DocumentRowProps {
  document: ConsentDocumentEvidence;
  token: string;
  onAuthFailure: () => void;
}

function DocumentRow({ document: doc, token, onAuthFailure }: Readonly<DocumentRowProps>) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleDownload = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const { url } = await getConsentDocumentDownloadUrl(doc.id, token);
      // The presigned response is an attachment: a click on a transient anchor
      // downloads without leaving the page.
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.rel = 'noopener';
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (caught: unknown) {
      if (caught instanceof AuthFailureError) {
        onAuthFailure();
        return;
      }
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-md border border-border bg-surface p-4 shadow-sm">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <Row label="File">{doc.fileName}</Row>
        <Row label="Size">{formatSize(doc.sizeBytes)}</Row>
        <Row label="Uploaded by">{doc.uploadedByEmail ?? doc.uploadedBySub}</Row>
        <Row label="Uploaded at">
          <Time iso={doc.storedAt ?? doc.createdAt} />
        </Row>
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleDownload()}
          aria-label={`${EVIDENCE_PANEL_COPY.download} ${doc.fileName}`}
          className={[
            'rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg',
            'transition-colors hover:bg-surface-alt',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
          ].join(' ')}
        >
          {busy ? EVIDENCE_PANEL_COPY.downloading : EVIDENCE_PANEL_COPY.download}
        </button>
        {failed && (
          <p role="alert" className="text-xs text-danger">
            {EVIDENCE_PANEL_COPY.downloadFailed}
          </p>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export interface ConsentEvidencePanelProps {
  actorId: string;
  token: string;
  onAuthFailure: () => void;
}

export function ConsentEvidencePanel({ actorId, token, onAuthFailure }: Readonly<ConsentEvidencePanelProps>) {
  const headingId = useId();
  const [evidence, setEvidence] = useState<ConsentEvidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [openEdition, setOpenEdition] = useState<string | null>(null);
  const [editions, setEditions] = useState<Record<string, EditionState>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    getActorConsentEvidence(actorId, token)
      .then((result) => {
        if (!cancelled) setEvidence(result);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        if (caught instanceof AuthFailureError) {
          onAuthFailure();
          return;
        }
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [actorId, token, attempt, onAuthFailure]);

  const toggleEdition = useCallback(
    (requestId: string, version: string) => {
      // One open text at a time keeps the panel short on a phone.
      setOpenEdition((current) => (current === requestId ? null : requestId));
      if (editions[version]?.status === 'ready' || editions[version]?.status === 'loading') return;
      setEditions((prev) => ({ ...prev, [version]: { status: 'loading' } }));
      getConsentEdition(version, token)
        .then((edition) => setEditions((prev) => ({ ...prev, [version]: { status: 'ready', edition } })))
        .catch((caught: unknown) => {
          if (caught instanceof AuthFailureError) {
            onAuthFailure();
            return;
          }
          setEditions((prev) => ({ ...prev, [version]: { status: 'failed' } }));
        });
    },
    [editions, token, onAuthFailure],
  );

  const handleUploaded = useCallback((document: ConsentDocumentEvidence) => {
    setEvidence((prev) => ({
      requests: prev?.requests ?? [],
      documents: [document, ...(prev?.documents ?? []).filter((d) => d.id !== document.id)],
    }));
  }, []);

  const hasAny = !!evidence && (evidence.requests.length > 0 || evidence.documents.length > 0);

  return (
    <section
      aria-labelledby={headingId}
      className="mt-8 rounded-md border border-border bg-surface-alt p-4 sm:p-6"
    >
      <h2 id={headingId} className="font-display text-lg font-bold text-fg">
        {EVIDENCE_PANEL_COPY.heading}
      </h2>
      <p className="mt-1 text-sm text-muted">{EVIDENCE_PANEL_COPY.intro}</p>

      <div aria-live="polite" className="mt-4">
        {loading && (
          <div aria-hidden="true" className="space-y-3">
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-16 w-full rounded-md" />
          </div>
        )}
        {loading && <p className="sr-only">{EVIDENCE_PANEL_COPY.loading}</p>}

        {!loading && failed && (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-danger">
            <span>{EVIDENCE_PANEL_COPY.loadFailed}</span>
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className={LINK_BUTTON}>
              {EVIDENCE_PANEL_COPY.retry}
            </button>
          </div>
        )}

        {!loading && !failed && evidence && !hasAny && (
          <p className="text-sm text-muted">{EVIDENCE_PANEL_COPY.empty}</p>
        )}
      </div>

      {!loading && !failed && evidence && (
        <div className="mt-2 space-y-6">
          {evidence.requests.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-fg">{EVIDENCE_PANEL_COPY.requestsHeading}</h3>
              <ul className="space-y-3">
                {evidence.requests.map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    editionOpen={openEdition === request.id}
                    editionState={editions[request.editionVersion]}
                    onToggleEdition={toggleEdition}
                  />
                ))}
              </ul>
            </div>
          )}

          {evidence.documents.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-fg">{EVIDENCE_PANEL_COPY.documentsHeading}</h3>
              <ul className="space-y-3">
                {evidence.documents.map((doc) => (
                  <DocumentRow key={doc.id} document={doc} token={token} onAuthFailure={onAuthFailure} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!failed && (
        <div className="mt-6 border-t border-border pt-4">
          <ConsentDocumentField
            mode="immediate"
            actorId={actorId}
            token={token}
            onAuthFailure={onAuthFailure}
            onUploaded={handleUploaded}
          />
        </div>
      )}
    </section>
  );
}
