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
        setApiError(caught.message);
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ── Preview on file selection ─────────────────────────────────────────────

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0] ?? null;
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
        className="flex flex-col gap-3 rounded-md border border-border bg-surface p-5"
      >
        <h2 id="import-step-template" className="text-base font-semibold text-fg">
          1. Download and fill the template
        </h2>
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
        className="flex flex-col gap-3 rounded-md border border-border bg-surface p-5"
      >
        <h2 id="import-step-file" className="text-base font-semibold text-fg">
          2. Upload the filled file
        </h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="import-file" className="text-sm font-medium text-fg">
            Excel file (.xlsx)
          </label>
          <input
            ref={fileInputRef}
            id="import-file"
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            disabled={inFlight}
            aria-describedby={fileError ? 'import-file-error' : undefined}
            aria-invalid={fileError ? 'true' : undefined}
            className={[
              'block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg',
              'file:mr-3 file:rounded-md file:border-0 file:bg-surface-alt file:px-3 file:py-1.5',
              'file:text-sm file:font-medium file:text-fg',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
            ].join(' ')}
          />
          {fileError && (
            <p
              id="import-file-error"
              role="alert"
              aria-live="assertive"
              className="mt-1 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              {fileError}
            </p>
          )}
        </div>

        {/* File-level API rejection (400: bad format / over caps / base64). */}
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

        {file && !inFlight && (
          <button
            type="button"
            onClick={resetFlow}
            className={[
              'self-start rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg',
              'transition-colors hover:bg-surface-alt',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            ].join(' ')}
          >
            Choose a different file
          </button>
        )}
      </section>

      {/* ── Step 3: preview + confirm ────────────────────────────────────── */}
      {report && report.mode === 'preview' && phase !== 'result' && (
        <section aria-labelledby="import-step-preview" className="flex flex-col gap-4">
          <h2 id="import-step-preview" className="text-base font-semibold text-fg">
            3. Review and confirm
          </h2>

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
