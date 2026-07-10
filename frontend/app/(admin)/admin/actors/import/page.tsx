// @sdd-spec admin/actor-import (T-8)
'use client';

/**
 * /admin/actors/import — Admin bulk actor import (Excel) flow (design.md §5).
 *
 * Static-export safe: 'use client'; static path (no dynamic segments); the
 * template is a static asset of the export build; all server logic lives in the
 * NestJS import endpoint (NFR-2). The (admin) layout already wraps this in
 * <RequireRole allow={['Admin']}>; we additionally resolve a token before any
 * API call and route to /login on auth failure (FR-10).
 *
 * Flow (single page, stepper-like):
 *   1. Intro + Download template link (static asset) + brief instructions.
 *   2. Labeled .xlsx file picker (client-side guard from importActors).
 *   3. On select → importActors(file, 'preview') → totals chips + ImportPreviewTable.
 *   4. Confirm ("Import N actors"): if any previewed row publishes a GRANTED
 *      actor (its warning names the acknowledgement), the AcknowledgeDialog gates
 *      the commit and sends acknowledged:true; otherwise commit directly (FR-6).
 *   5. Result view: same table + live-region summary; "Back to actors" (the
 *      console refetches its list on mount, so returning shows the new actors).
 *
 * Tokens only; WCAG 2.1 AA (labeled input, aria-describedby errors, live regions).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { getSession } from '@/lib/auth/auth-client';
import { importActors, type ImportReport } from '@/lib/api/actors-admin';
import { ApiError, AuthFailureError } from '@/lib/api/client';

import { ImportPreviewTable } from '@/components/admin/ImportPreviewTable';
import { AcknowledgeDialog } from '@/components/admin/AcknowledgeDialog';
import Button from '@/components/ui/Button';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Static template asset shipped with the export build (FR-1, DR-7). */
const TEMPLATE_HREF = '/templates/actor-import-template.xlsx';

/** Friendly fallback when the server fails for a non-validation reason (5xx). */
const GENERIC_IMPORT_ERROR =
  'Something went wrong processing the file. Try again; if it persists, contact the administrator.';

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

/** Human-readable file size for the selected-file chip. */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** Numbered step header — a token badge + heading gives the flow a stepper cue. */
function StepHeader({ n, id, title }: { n: number; id: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-fg"
      >
        {n}
      </span>
      <h2 id={id} className="text-base font-semibold text-fg">
        {title}
      </h2>
    </div>
  );
}

/** Upload glyph for the drop zone (decorative). */
function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-8 w-8 text-muted"
    >
      <path d="M12 15V4" />
      <path d="m8 8 4-4 4 4" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

/** File glyph for the selected-file chip (decorative). */
function FileIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0 text-muted"
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
    </svg>
  );
}

/**
 * A previewed row requires the consent acknowledgement when it carries the
 * GRANTED warning the backend adds in preview (CONSENT_ACK_WARNING). The GPS
 * warning does not mention acknowledgement, so this match is specific (FR-6).
 */
function reportNeedsAcknowledgement(report: ImportReport | null): boolean {
  if (!report) return false;
  return report.rows.some((row) =>
    (row.warnings ?? []).some((w) => /acknowledgement/i.test(w)),
  );
}

// ---------------------------------------------------------------------------
// Totals chips
// ---------------------------------------------------------------------------

function Chip({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-surface px-4 py-3">
      <span className="text-2xl font-bold text-fg tabular-nums">{value}</span>
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
    </div>
  );
}

function TotalsChips({ report }: { report: ImportReport }) {
  const t = report.totals;
  const isCommit = report.mode === 'commit';
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Chip label="Rows" value={t.rows} />
      <Chip label={isCommit ? 'Created' : 'To create'} value={isCommit ? t.created : t.toCreate} />
      <Chip label="To skip" value={t.skipped} />
      <Chip label="Invalid" value={t.failed} />
      <Chip label="Warnings" value={t.warnings} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

type Phase = 'idle' | 'previewing' | 'preview' | 'committing' | 'result';

export default function ActorImportPage() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [report, setReport] = useState<ImportReport | null>(null);

  /** Client-side / file-level rejection (non-.xlsx, oversize) — plain Error. */
  const [fileError, setFileError] = useState<string | undefined>();
  /** Server file-level rejection (ApiError 400: format/caps/base64). */
  const [apiError, setApiError] = useState<string | undefined>();

  const [ackOpen, setAckOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Auth failure → /login ─────────────────────────────────────────────────

  const handleAuthFailure = useCallback(() => {
    router.push('/login');
  }, [router]);

  // ── Resolve token on mount (mirrors the actors console) ───────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const session = await getSession();
      if (cancelled) return;
      if (!session) {
        handleAuthFailure();
        return;
      }
      setToken(session.accessToken);
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [handleAuthFailure]);

  // ── Shared error mapping for import calls ──────────────────────────────────

  const applyError = useCallback(
    (caught: unknown) => {
      if (caught instanceof AuthFailureError) {
        handleAuthFailure();
        return;
      }
      if (caught instanceof ApiError) {
        // 400 = file-level validation the Admin can act on (format, caps, base64) —
        // show the server's specific message. Any other status (e.g. 5xx) reads raw,
        // so present a friendly, actionable fallback instead (NFR-3).
        setApiError(caught.status === 400 ? caught.message : GENERIC_IMPORT_ERROR);
        return;
      }
      // Plain Error from the client-side guard (non-.xlsx / oversize).
      setFileError(caught instanceof Error ? caught.message : 'The file could not be imported.');
    },
    [handleAuthFailure],
  );

  // ── Reset the flow (choose a different file) ──────────────────────────────

  const resetFlow = useCallback(() => {
    setFile(null);
    setReport(null);
    setPhase('idle');
    setFileError(undefined);
    setApiError(undefined);
    setAckOpen(false);
    setDragOver(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ── Preview on file selection (shared by the picker and drag & drop) ──────

  const processFile = useCallback(
    async (picked: File | null) => {
      setFileError(undefined);
      setApiError(undefined);
      setReport(null);

      if (!picked) {
        setFile(null);
        setPhase('idle');
        return;
      }

      setFile(picked);

      if (!token) {
        handleAuthFailure();
        return;
      }

      setPhase('previewing');
      try {
        const result = await importActors(picked, 'preview', token);
        setReport(result);
        setPhase('preview');
      } catch (caught: unknown) {
        setPhase('idle');
        applyError(caught);
      }
    },
    [token, applyError, handleAuthFailure],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      void processFile(e.target.files?.[0] ?? null);
    },
    [processFile],
  );

  const openPicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ── Drag & drop (a keyboard-independent convenience; the button is the a11y path) ──

  const inFlightRef = useRef(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (inFlightRef.current) return;
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (inFlightRef.current) return;
      void processFile(e.dataTransfer.files?.[0] ?? null);
    },
    [processFile],
  );

  // ── Commit ─────────────────────────────────────────────────────────────────

  const commit = useCallback(
    async (acknowledged?: boolean) => {
      if (!file || !token) return;
      setApiError(undefined);
      setPhase('committing');
      try {
        const result = await importActors(file, 'commit', token, acknowledged);
        setReport(result);
        setPhase('result');
      } catch (caught: unknown) {
        setPhase('preview');
        applyError(caught);
      }
    },
    [file, token, applyError],
  );

  const handleConfirm = useCallback(() => {
    if (reportNeedsAcknowledgement(report)) {
      setAckOpen(true);
      return;
    }
    void commit();
  }, [report, commit]);

  const handleAckConfirm = useCallback(() => {
    setAckOpen(false);
    void commit(true);
  }, [commit]);

  // ── Derived state ──────────────────────────────────────────────────────────

  const toCreate = report?.totals.toCreate ?? 0;
  const inFlight = phase === 'previewing' || phase === 'committing';

  // Mirror inFlight into a ref so the drag handlers read the current value without
  // being re-created (and re-bound) on every phase change.
  useEffect(() => {
    inFlightRef.current = inFlight;
  }, [inFlight]);

  const resultSummary = report
    ? `${report.totals.created} created, ${report.totals.skipped} skipped, ${report.totals.failed} failed.`
    : '';

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* ── Heading ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-fg">Import actors</h1>
            <p className="mt-1 text-sm text-muted">
              Bulk-load actors from a filled Excel template. Rows are validated before anything is
              written, and existing actors are never modified.
            </p>
          </div>
          <Button variant="secondary" href="/admin/actors">
            Back to actors
          </Button>
        </div>
      </div>

      {/* ── Step 1: template + instructions ──────────────────────────────── */}
      <section
        aria-labelledby="import-step-template"
        className="flex flex-col gap-4 rounded-md border border-border bg-surface p-5"
      >
        <StepHeader n={1} id="import-step-template" title="Download and fill the template" />
        <p className="text-sm text-muted">
          Field staff fill the canonical template offline. Its Instructions sheet documents every
          column, the required fields, and the allowed values. Do not change the column headers.
        </p>
        <div>
          <a
            href={TEMPLATE_HREF}
            download
            className={[
              'inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2.5',
              'text-sm font-medium text-fg transition-colors hover:bg-surface-alt',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            ].join(' ')}
          >
            Download template (.xlsx)
          </a>
        </div>
      </section>

      {/* ── Step 2: file picker ──────────────────────────────────────────── */}
      <section
        aria-labelledby="import-step-file"
        className="flex flex-col gap-4 rounded-md border border-border bg-surface p-5"
      >
        <StepHeader n={2} id="import-step-file" title="Upload the filled file" />

        {/* Accessible file input: visually hidden, driven by the styled button and
            the drop zone below. The label keeps it named for assistive tech. */}
        <label htmlFor="import-file" className="sr-only">
          Excel file (.xlsx)
        </label>
        <input
          ref={fileInputRef}
          id="import-file"
          type="file"
          accept=".xlsx"
          onChange={handleFileChange}
          disabled={inFlight}
          aria-describedby={fileError ? 'import-file-error' : 'import-file-help'}
          aria-invalid={fileError ? 'true' : undefined}
          className="sr-only"
        />

        {/* Drop zone + button (shown until a file is chosen). The button is the
            keyboard/AT path; drag & drop is a pointer convenience. */}
        {!file && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={[
              'flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed px-6 py-10 text-center',
              'transition-colors',
              dragOver
                ? 'border-primary bg-primary-soft'
                : 'border-border bg-surface hover:bg-surface-alt',
            ].join(' ')}
          >
            <UploadIcon />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-fg">Drag & drop your filled .xlsx file here</p>
              <p id="import-file-help" className="text-xs text-muted">
                Only Excel .xlsx files up to 4 MB are accepted.
              </p>
            </div>
            <Button variant="primary" onClick={openPicker} aria-describedby="import-file-help">
              Select .xlsx file
            </Button>
          </div>
        )}

        {/* Selected-file chip: name + size + a replace control (never raw input text). */}
        {file && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-alt px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <FileIcon />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-fg">{file.name}</p>
                <p className="text-xs text-muted tabular-nums">{formatFileSize(file.size)}</p>
              </div>
            </div>
            {!inFlight && (
              <button
                type="button"
                onClick={resetFlow}
                aria-label={`Remove ${file.name} and choose another file`}
                className={[
                  'shrink-0 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg',
                  'transition-colors hover:bg-surface-alt',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                ].join(' ')}
              >
                Replace file
              </button>
            )}
          </div>
        )}

        {/* Client-guard rejection (non-.xlsx / oversize) — plain Error. */}
        {fileError && (
          <p
            id="import-file-error"
            role="alert"
            aria-live="assertive"
            className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            {fileError}
          </p>
        )}

        {/* File-level API rejection (400: bad format / over caps / base64) or a
            friendly fallback for an unexpected server failure. */}
        {apiError && (
          <div
            role="alert"
            aria-live="assertive"
            className="flex flex-col gap-1 rounded-md border border-danger-soft bg-danger-soft px-4 py-3"
          >
            <p className="text-sm font-semibold text-danger">The file could not be processed</p>
            <p className="text-sm text-muted">{apiError}</p>
          </div>
        )}

        {/* Previewing spinner / status. */}
        {phase === 'previewing' && (
          <p role="status" aria-live="polite" className="text-sm text-muted">
            Validating file…
          </p>
        )}
      </section>

      {/* ── Step 3: preview + confirm ────────────────────────────────────── */}
      {report && report.mode === 'preview' && phase !== 'result' && (
        <section aria-labelledby="import-step-preview" className="flex flex-col gap-4">
          <StepHeader n={3} id="import-step-preview" title="Review and confirm" />

          {report.totals.rows === 0 ? (
            /* Empty template: the file parsed but has no data rows. Guide the Admin
               instead of showing empty chips, an empty table, and a dead button. */
            <div
              role="status"
              className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface px-4 py-12 text-center"
            >
              <p className="text-base font-semibold text-fg">The file has no data rows</p>
              <p className="max-w-md text-sm text-muted">
                Fill the Data sheet of the template with at least one actor, then upload the file
                again.
              </p>
              <button
                type="button"
                onClick={resetFlow}
                className={[
                  'mt-1 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-fg',
                  'transition-colors hover:bg-surface-alt',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                ].join(' ')}
              >
                Upload a different file
              </button>
            </div>
          ) : (
            <>
              <TotalsChips report={report} />

              <ImportPreviewTable rows={report.rows} />

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted">
                  {toCreate === 0
                    ? 'No rows are eligible to import. Fix the file and upload again.'
                    : `${toCreate} actor${toCreate === 1 ? '' : 's'} will be created. Skipped and failed rows are not imported.`}
                </p>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={toCreate === 0 || inFlight}
                  aria-busy={phase === 'committing'}
                  className={[
                    'inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5',
                    'text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  ].join(' ')}
                >
                  {phase === 'committing'
                    ? 'Importing…'
                    : `Import ${toCreate} actor${toCreate === 1 ? '' : 's'}`}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* ── Step 4: result ───────────────────────────────────────────────── */}
      {report && phase === 'result' && (
        <section aria-labelledby="import-step-result" className="flex flex-col gap-4">
          <h2 id="import-step-result" className="text-base font-semibold text-fg">
            Import complete
          </h2>

          <div
            role="status"
            aria-live="polite"
            className="rounded-md border border-highlight-tint bg-highlight-tint px-4 py-3 text-sm font-medium text-success"
          >
            {resultSummary}
          </div>

          <TotalsChips report={report} />

          <ImportPreviewTable rows={report.rows} />

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="primary" href="/admin/actors">
              Back to actors
            </Button>
            <button
              type="button"
              onClick={resetFlow}
              className={[
                'inline-flex items-center justify-center rounded-md border border-border bg-surface px-5 py-2.5',
                'text-sm font-medium text-fg transition-colors hover:bg-surface-alt',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              ].join(' ')}
            >
              Import another file
            </button>
          </div>
        </section>
      )}

      {/* ── Consent acknowledgement gate (FR-6) ──────────────────────────── */}
      <AcknowledgeDialog
        open={ackOpen}
        title="Publish imported actors?"
        description="Some rows set consent to GRANTED, which publishes those actors' PII and GPS to the public directory on import. Only confirm if written consent is on file for every GRANTED row."
        acknowledgementText="I confirm consent is on file"
        confirmLabel="Import"
        onConfirm={handleAckConfirm}
        onCancel={() => setAckOpen(false)}
        loading={phase === 'committing'}
      />
    </div>
  );
}
