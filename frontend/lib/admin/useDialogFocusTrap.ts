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
 *   and the user presses `Escape`. Callers pass their own cancel handler —
 *   this hook has no opinion on what "cancel" does.
 */
export function useDialogFocusTrap<T extends HTMLElement = HTMLDivElement>(
  onCancel: () => void
): DialogFocusTrap<T> {
  const dialogRef = useRef<T>(null);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<T>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
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
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onCancel]
  );

  return { dialogRef, onKeyDown };
}
