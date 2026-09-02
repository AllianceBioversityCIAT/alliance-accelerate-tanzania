// @sdd-spec admin/bulk-actor-operations (T-7)
// @sdd-spec actors/registration-source-and-consent (T-10)
'use client';

/**
 * AcknowledgeDialog — typed-acknowledgement confirmation modal.
 *
 * Used by the bulk actor unlock action (FR-4): because unlocking publishes
 * PII + GPS to the public directory, the Admin must type an exact phrase
 * before the confirm button is enabled.
 *
 * Shared by three call sites (design.md §5) — bulk unlock
 * (`app/(admin)/admin/actors/page.tsx`), import commit
 * (`app/(admin)/admin/actors/import/page.tsx`), and the single-actor form
 * (`ActorForm.tsx`). Only the first needs batch consent-provenance inputs
 * (DD-4: bulk unlock has no per-row source for method/date); the other two
 * either already collect it themselves (the form's own fieldset) or
 * structurally cannot supply it (import provenance comes from per-row
 * template columns). The optional `provenance` prop below is therefore
 * opt-in — omitted at both of those call sites so they render unchanged.
 *
 * Accessibility (WCAG 2.1 AA / system-design §10):
 *   - role="dialog" + aria-modal="true" + aria-labelledby + aria-describedby
 *   - Focus trap: on open, focus moves to the acknowledgement input;
 *     Tab/Shift+Tab cycle within the dialog; Escape closes without confirming.
 *   - Backdrop click closes the dialog (cancel behaviour).
 *   - Live region for in-flight errors and for the mismatch hint.
 *   - Labelled input with aria-describedby pointing to instructions + error.
 *   - T-10: the provenance select/date, when rendered, follow the same
 *     labelled-input + aria-describedby + live-region hint pattern.
 */

import { useEffect, useRef, useCallback, useId, useState } from 'react';

import type { ConsentMethod } from '@/lib/api/actors-admin';
import { useDialogFocusTrap } from '@/lib/admin/useDialogFocusTrap';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * T-10 — batch consent-provenance inputs, opt-in via the `provenance` prop.
 * The dialog is controlled: the caller (bulk unlock, `page.tsx`) owns
 * `method`/`date` state so it can read the values at confirm time to build
 * the `bulkSetConsent` request, and resets them when the dialog opens/closes.
 */
export interface ConsentProvenanceFields {
  /**
   * Batch consent method to fill on rows missing one (FR-3, DD-4). `''`
   * means "not yet selected" — the confirm button stays disabled until a
   * real method is chosen; `NOT_RECORDED` is deliberately not offered as a
   * choice here (see `PROVENANCE_METHOD_OPTIONS`).
   */
  method: ConsentMethod | '';
  onMethodChange: (value: ConsentMethod | '') => void;
  /** Batch consent date, `YYYY-MM-DD` (the native `<input type="date">` shape). */
  date: string;
  onDateChange: (value: string) => void;
}

interface AcknowledgeDialogProps {
  /** Whether the dialog is visible. */
  open: boolean;
  /** Dialog title (maps to aria-labelledby). */
  title: string;
  /** Descriptive body text (maps to aria-describedby). */
  description: string;
  /** Exact phrase the user must type to enable the confirm button. */
  acknowledgementText: string;
  /** Label for the confirm button (default: "Confirm"). */
  confirmLabel?: string;
  /** Called when user confirms the action. */
  onConfirm: () => void;
  /** Called when user cancels or presses Escape. */
  onCancel: () => void;
  /** True while the async action is in-flight (disables controls). */
  loading?: boolean;
  /** Inline error from the failed mutation. */
  error?: string;
  /**
   * Semantic tone of the confirm button. **Defaults to `'danger'`** so every
   * pre-existing call site renders byte-identically to before this prop
   * existed.
   *
   * Pass `'primary'` when the gated action is **constructive** — publishing,
   * creating, granting. `docs/ux-ui/design.md` §7 reserves `danger` for
   * destructive semantics, and `requirements.md` NFR-6 states it "MUST NOT
   * style the publish action": a red destructive button on the registry's
   * only private-to-public path told the reviewer the opposite of what the
   * action does. That was R-13, and this prop is its remediation — the
   * typed-acknowledgement gate is orthogonal to whether the outcome is
   * destructive.
   */
  tone?: 'danger' | 'primary';
  /**
   * T-10 — opt-in batch consent-method + consent-date inputs (design.md §5).
   * Rendered ONLY when supplied; also gates the confirm button so a batch
   * unlock cannot be confirmed without both. Omitted at every call site but
   * bulk unlock.
   */
  provenance?: ConsentProvenanceFields;
}

/**
 * T-10 (DD-4) — method choices for the batch provenance fill. `NOT_RECORDED`
 * is excluded: it is the "no evidence" sentinel, so offering it as a batch
 * fill value would let an Admin "unlock with no evidence" through this
 * dialog — the exact hole FR-3 exists to close.
 */
const PROVENANCE_METHOD_OPTIONS: { value: ConsentMethod; label: string }[] = [
  { value: 'PORTAL_CHECKBOX', label: 'Portal checkbox' },
  { value: 'SIGNED_FORM', label: 'Signed form' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'VERBAL_FIELD', label: 'Verbal (field)' },
];

// ---------------------------------------------------------------------------
// Component
/**
 * A **total** `Record` rather than a ternary, matching `design.md` DD-21's
 * reasoning: a future third tone becomes a compile error here instead of
 * silently rendering an unstyled button.
 */
const CONFIRM_TONE_CLASSES: Record<NonNullable<AcknowledgeDialogProps['tone']>, string> = {
  danger: 'bg-danger focus-visible:ring-danger',
  primary: 'bg-primary hover:bg-primary-hover focus-visible:ring-primary',
};

// ---------------------------------------------------------------------------

export function AcknowledgeDialog({
  open,
  title,
  description,
  acknowledgementText,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  loading = false,
  error,
  tone = 'danger',
  provenance,
}: AcknowledgeDialogProps) {
  const uid           = useId();
  const titleId       = `${uid}-title`;
  const descId        = `${uid}-desc`;
  const inputId       = `${uid}-input`;
  const hintId        = `${uid}-hint`;
  const errorId       = `${uid}-error`;
  const methodId      = `${uid}-method`;
  const dateId        = `${uid}-date`;
  const provenanceHintId = `${uid}-provenance-hint`;

  const inputRef      = useRef<HTMLInputElement>(null);
  const [value,       setValue]       = useState('');

  const acknowledged = value === acknowledgementText;
  // T-10 — when `provenance` is supplied (bulk unlock only), both a real
  // method and a date are required before the confirm button enables. The
  // other two call sites omit the prop, so `provenanceValid` is trivially
  // true and behaviour is unchanged for them.
  const provenanceValid =
    !provenance || (provenance.method !== '' && provenance.date.trim() !== '');
  const canConfirm = acknowledged && provenanceValid;

  // Reset input when the dialog opens; focus the input.
  useEffect(() => {
    if (open) {
      setValue('');
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  // Keyboard: Escape → cancel; Tab / Shift+Tab → cycle within dialog.
  const { dialogRef, onKeyDown: handleKeyDown } = useDialogFocusTrap<HTMLDivElement>(onCancel);

  const handleConfirm = useCallback(() => {
    if (!canConfirm || loading) return;
    onConfirm();
  }, [canConfirm, loading, onConfirm]);

  if (!open) return null;

  return (
    <>
      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      <div
        className="fixed inset-0 z-50 bg-backdrop"
        aria-hidden="true"
        onClick={onCancel}
      />

      {/* ── Dialog panel ──────────────────────────────────────────────────── */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${descId} ${hintId}${provenance ? ` ${provenanceHintId}` : ''}${error ? ` ${errorId}` : ''}`}
        onKeyDown={handleKeyDown}
        className={[
          'fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2',
          'rounded-md bg-surface p-6 shadow-lg border border-border',
        ].join(' ')}
      >
        {/* Title */}
        <h2
          id={titleId}
          className="text-base font-semibold text-fg"
        >
          {title}
        </h2>

        {/* Description */}
        <p
          id={descId}
          className="mt-2 text-sm text-muted"
        >
          {description}
        </p>

        {/* T-10 — opt-in batch consent-provenance inputs (bulk unlock only) */}
        {provenance && (
          <div className="mt-4 flex flex-col gap-3 rounded-md border border-border bg-surface-alt p-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={methodId} className="text-sm font-medium text-fg">
                Consent method
                {/* Required marker — matches ActorForm.tsx's `Field` convention
                    (aria-hidden, visual only; the live-region hint below and
                    the confirm-button gate carry the actual requirement). */}
                <span aria-hidden="true" className="ml-0.5 text-danger">*</span>
              </label>
              <select
                id={methodId}
                value={provenance.method}
                onChange={(e) =>
                  provenance.onMethodChange(e.target.value as ConsentMethod | '')
                }
                disabled={loading}
                aria-describedby={provenanceHintId}
                className={[
                  'block w-full rounded-md border bg-surface px-3 py-2 text-sm text-fg',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  'border-border',
                ].join(' ')}
              >
                <option value="">Select…</option>
                {PROVENANCE_METHOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={dateId} className="text-sm font-medium text-fg">
                Consent obtained on
                <span aria-hidden="true" className="ml-0.5 text-danger">*</span>
              </label>
              <input
                id={dateId}
                type="date"
                value={provenance.date}
                onChange={(e) => provenance.onDateChange(e.target.value)}
                disabled={loading}
                aria-describedby={provenanceHintId}
                className={[
                  'block w-full rounded-md border bg-surface px-3 py-2 text-sm text-fg',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  'border-border',
                ].join(' ')}
              />
            </div>

            <p id={provenanceHintId} aria-live="polite" className="text-xs text-muted">
              Method and date fill in only what’s missing — actors that already
              have their own consent method and date on file keep them
              unchanged.
            </p>
          </div>
        )}

        {/* Acknowledgement input */}
        <div className="mt-4 flex flex-col gap-1.5">
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-fg"
          >
            Type “{acknowledgementText}” to confirm
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={loading}
            aria-describedby={`${hintId}${error ? ` ${errorId}` : ''}`}
            aria-invalid={!acknowledged && value.length > 0 ? 'true' : undefined}
            autoComplete="off"
            className={[
              'block w-full rounded-md border bg-surface px-3 py-2 text-sm text-fg',
              'placeholder:text-muted',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'border-border',
            ].join(' ')}
          />
          <p
            id={hintId}
            aria-live="polite"
            className="text-xs text-muted"
          >
            {/*
              A-1 rework — the hint must stay accurate in BOTH modes. Without
              `provenance` this string is byte-identical to the pre-T-10 text
              (the import and single-actor call sites depend on that not
              changing). With `provenance` it names all three conditions that
              actually gate confirm — omitting the method/date requirement
              here left the bulk-unlock Admin looking at a dead button with
              the phrase typed correctly and no explanation why.
            */}
            {provenance
              ? 'Confirm is disabled until the acknowledgement is entered exactly, and a consent method and date are selected.'
              : 'Confirm is disabled until the acknowledgement is entered exactly.'}
          </p>
        </div>

        {/* Inline error live region */}
        {error && (
          <p
            id={errorId}
            role="alert"
            aria-live="assertive"
            className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className={[
              'rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-fg',
              'transition-colors hover:bg-surface-alt',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
            ].join(' ')}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm || loading}
            aria-busy={loading}
            className={[
              'rounded-md px-4 py-2 text-sm font-medium text-primary-fg',
              CONFIRM_TONE_CLASSES[tone],
              'transition-colors hover:opacity-90',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
            ].join(' ')}
          >
            {loading ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
