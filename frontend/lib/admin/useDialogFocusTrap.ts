'use client';

/**
 * useDialogFocusTrap — shared Escape/Tab keyboard shell for admin modal dialogs.
 *
 * Extracted from four hand-maintained copies (`AcknowledgeDialog.tsx`,
 * `RejectDialog.tsx`, `ConfirmDialog.tsx`, `EditUserDialog.tsx`) that had
 * drifted into byte-identical duplication — flagged by jscpd as the bulk of
 * this branch's SonarQube duplication overage. Four copies of a focus trap
 * is four places for an accessibility bug to hide: a fix applied to one and
 * missed in the others is invisible in review (the diffs look identical)
 * and only surfaces as inconsistent keyboard behaviour between dialogs. One
 * implementation means fixing it once fixes every dialog that uses it.
 *
 * Usage — attach both the ref and the handler to the dialog panel's outer
 * `role="dialog"` element:
 *
 *   const { dialogRef, onKeyDown } = useDialogFocusTrap(onCancel);
 *   <div ref={dialogRef} onKeyDown={onKeyDown} role="dialog" ...>
 *
 * Behaviour (byte-identical across all four call sites at extraction time —
 * verified before extracting, not assumed):
 *   - `Escape` calls `onCancel()` (after `preventDefault`).
 *   - `Tab` / `Shift+Tab` cycle focus among the dialog's focusable elements
 *     — `button, [href], input, select, textarea,
 *     [tabindex]:not([tabindex="-1"])` — filtered to exclude anything
 *     carrying the `disabled` attribute.
 *   - No-op when the dialog currently has zero focusable elements.
 *
 * A fifth call site, `CreateUserDialog.tsx`, needs Escape to do something
 * other than call `onCancel()` directly: once a user has just been created
 * it is showing a one-time temporary-password handoff, and Escape there
 * must dismiss the handoff *and* refresh the caller's list (`onSuccess()`),
 * not treat the dialog as cancelled. The optional second parameter,
 * `onEscape`, exists for exactly that — it defaults to `onCancel` so the
 * other four call sites (whose Escape behaviour is genuinely just
 * `onCancel()`) do not need to pass it or change at all:
 *
 *   const { dialogRef, onKeyDown } = useDialogFocusTrap(onCancel, () => {
 *     if (created) { setCreated(null); onSuccess(); } else { onCancel(); }
 *   });
 *
 * Deliberately NOT included: focus-restore-on-close (returning focus to the
 * element that opened the dialog once it closes). All four call sites lack
 * this today and it is a recorded, real defect — but adding it here would
 * change observable behaviour on three dialogs that are already shipped and
 * were certified regression-free immediately before this extraction. That
 * fix is out of scope for this refactor; this hook is what makes it cheap
 * (one change here instead of four) whenever it is taken on.
 */

import { useCallback, useRef, type KeyboardEvent, type RefObject } from 'react';

export interface DialogFocusTrap<T extends HTMLElement = HTMLDivElement> {
  /** Attach to the dialog panel's outer `role="dialog"` element. */
  dialogRef: RefObject<T | null>;
  /** Attach to the same element's `onKeyDown`. */
  onKeyDown: (e: KeyboardEvent<T>) => void;
}

/**
 * @param onCancel Called (after `preventDefault`) when the dialog is open
 *   and the user presses `Escape` — unless `onEscape` is supplied. Callers
 *   pass their own cancel handler — this hook has no opinion on what
 *   "cancel" does.
 * @param onEscape Optional override for what `Escape` does. Defaults to
 *   `onCancel`, which is the behaviour every call site except
 *   `CreateUserDialog` wants — pass this only when Escape must do something
 *   other than a plain cancel (see the file header for that case).
 */
export function useDialogFocusTrap<T extends HTMLElement = HTMLDivElement>(
  onCancel: () => void,
  onEscape: () => void = onCancel
): DialogFocusTrap<T> {
  const dialogRef = useRef<T>(null);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<T>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onEscape();
        return;
      }

      if (e.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('disabled'));

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last  = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onEscape]
  );

  return { dialogRef, onKeyDown };
}
