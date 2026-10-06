/**
 * DialogFooter — the inline-error live region plus the Cancel/Confirm
 * button pair shared by the gated-action admin dialogs
 * (`AcknowledgeDialog.tsx`, `RejectDialog.tsx`). Extracted from two
 * near-identical copies (jscpd-flagged duplication) — no behavioral change
 * from either original.
 *
 * The confirm button's tone is parameterised (`tone`, default `'danger'`)
 * because the two callers genuinely differ here: `AcknowledgeDialog` can
 * gate a constructive action (`tone="primary"`, `RegistrationDetailPanel.tsx`),
 * while `RejectDialog`'s action is always destructive and never exposes the
 * prop — it relies on the `'danger'` default.
 *
 * Deliberately scoped to just the error region + button pair — the
 * dialog shell (backdrop, panel, title, description, body inputs) differs
 * enough between the two callers (provenance fields vs. reason/note
 * fields) that pulling it in would force a much leakier prop surface.
 */

export type DialogConfirmTone = 'danger' | 'primary';

/**
 * A **total** `Record` rather than a ternary, matching `design.md` DD-21's
 * reasoning: a future third tone becomes a compile error here instead of
 * silently rendering an unstyled button.
 */
const CONFIRM_TONE_CLASSES: Record<DialogConfirmTone, string> = {
  danger: 'bg-danger focus-visible:ring-danger',
  primary: 'bg-primary hover:bg-primary-hover focus-visible:ring-primary',
};

interface DialogFooterBaseProps {
  /** Inline error from the failed mutation. */
  error?: string;
  /** id for the error `<p>` — the caller wires this into its own `aria-describedby`. */
  errorId: string;
  /** Called when the Cancel button is activated. */
  onCancel: () => void;
  /** True while the async action is in-flight (disables both controls). */
  loading?: boolean;
  /**
   * Semantic tone of the confirm button. **Defaults to `'danger'`** so every
   * pre-existing call site renders byte-identically to before this
   * component existed.
   */
  tone?: DialogConfirmTone;
  /** Label for the Cancel button. Defaults to `Cancel` (T-9: the send dialog's result step reads `Close`). */
  cancelLabel?: string;
}

/** The Confirm button and its three inputs — absent when `hideConfirm` (T-9: progress/result steps). */
type DialogFooterConfirmProps =
  | {
      hideConfirm?: false;
      /** Called when the Confirm button is activated. */
      onConfirm: () => void;
      /** Confirm button's `disabled` state — the caller computes it since its preconditions vary per dialog. */
      confirmDisabled: boolean;
      /** Label for the confirm button when not loading. */
      confirmLabel: string;
    }
  | { hideConfirm: true };

export type DialogFooterProps = DialogFooterBaseProps & DialogFooterConfirmProps;

export function DialogFooter(props: Readonly<DialogFooterProps>) {
  const { error, errorId, onCancel, loading = false, tone = 'danger', cancelLabel = 'Cancel' } = props;
  return (
    <>
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
          {cancelLabel}
        </button>

        {!props.hideConfirm && (
          <button
            type="button"
            onClick={props.onConfirm}
            disabled={props.confirmDisabled}
            aria-busy={loading}
            className={[
              'rounded-md px-4 py-2 text-sm font-medium text-primary-fg',
              CONFIRM_TONE_CLASSES[tone],
              'transition-colors hover:opacity-90',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
            ].join(' ')}
          >
            {loading ? 'Please wait…' : props.confirmLabel}
          </button>
        )}
      </div>
    </>
  );
}
