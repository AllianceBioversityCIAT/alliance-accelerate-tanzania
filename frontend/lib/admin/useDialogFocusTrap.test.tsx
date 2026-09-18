/**
 * Unit tests for useDialogFocusTrap.
 *
 * Extracted from four hand-maintained copies (`AcknowledgeDialog.tsx`,
 * `RejectDialog.tsx`, `ConfirmDialog.tsx`, `EditUserDialog.tsx`) — see the
 * hook's own file header for the extraction story. The regression audit
 * that passed the extraction did so on textual identity only: Escape was
 * asserted at two of the four call sites, but the Tab half of the trap
 * (wrap-around, the `disabled` filter, the selector string) had zero test
 * coverage anywhere in the repo. This file closes that gap directly against
 * the hook, so it protects all four call sites — present and future — from
 * a single place, matching the hook's own reason for existing.
 *
 * A fifth call site, `CreateUserDialog.tsx`, needs Escape to do something
 * other than `onCancel()` — see the hook's file header for why. The
 * `onEscape` coverage below asserts that override path directly.
 *
 * Renders a real component that uses the hook (not a mock) — the selector
 * string only means something evaluated against real DOM.
 */

import React from 'react';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';

import { useDialogFocusTrap } from './useDialogFocusTrap';

// ---------------------------------------------------------------------------
// Minimal real dialog harness — mirrors how every call site wires the hook:
// dialogRef + onKeyDown on the role="dialog" element (see the hook's JSDoc).
// ---------------------------------------------------------------------------

function TrapHarness({
  onCancel,
  onEscape,
  children,
}: {
  onCancel: () => void;
  onEscape?: () => void;
  children?: React.ReactNode;
}) {
  const { dialogRef, onKeyDown } = useDialogFocusTrap<HTMLDivElement>(onCancel, onEscape);
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}

/** Fires a keydown on `target` and returns the event so callers can assert `defaultPrevented`. */
function keyDownOn(
  target: Element,
  init: { key: string; shiftKey?: boolean },
) {
  const event = createEvent.keyDown(target, {
    key: init.key,
    shiftKey: init.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  fireEvent(target, event);
  return event;
}

/**
 * Renders the harness with three focusable buttons (First / Middle / Last)
 * and returns the rendered dialog plus each button — the shared setup for
 * every Tab-cycling assertion below (wrap forward, wrap backward, no-op in
 * the middle), so each test only states what it does differently.
 */
function renderThreeButtons(onCancel: () => void = jest.fn()) {
  render(
    <TrapHarness onCancel={onCancel}>
      <button>First</button>
      <button>Middle</button>
      <button>Last</button>
    </TrapHarness>,
  );

  return {
    onCancel,
    dialog: screen.getByRole('dialog'),
    first: screen.getByRole('button', { name: 'First' }),
    middle: screen.getByRole('button', { name: 'Middle' }),
    last: screen.getByRole('button', { name: 'Last' }),
  };
}

describe('useDialogFocusTrap', () => {
  it('Escape calls onCancel once and calls preventDefault', () => {
    const onCancel = jest.fn();
    render(
      <TrapHarness onCancel={onCancel}>
        <button>First</button>
        <button>Second</button>
      </TrapHarness>,
    );

    const dialog = screen.getByRole('dialog');
    const event = keyDownOn(dialog, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('an onEscape override runs instead of onCancel on Escape', () => {
    const onCancel = jest.fn();
    const onEscape = jest.fn();
    render(
      <TrapHarness onCancel={onCancel} onEscape={onEscape}>
        <button>First</button>
      </TrapHarness>,
    );

    const dialog = screen.getByRole('dialog');
    const event = keyDownOn(dialog, { key: 'Escape' });

    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('Tab on the last focusable element wraps to the first', () => {
    const { dialog, first, last, onCancel } = renderThreeButtons();

    last.focus();
    expect(document.activeElement).toBe(last);

    const event = keyDownOn(dialog, { key: 'Tab' });

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Shift+Tab on the first focusable element wraps to the last', () => {
    const { dialog, first, last } = renderThreeButtons();

    first.focus();
    expect(document.activeElement).toBe(first);

    const event = keyDownOn(dialog, { key: 'Tab', shiftKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('Tab in the middle does nothing special — default is left alone', () => {
    const { dialog, middle } = renderThreeButtons();

    middle.focus();
    expect(document.activeElement).toBe(middle);

    const event = keyDownOn(dialog, { key: 'Tab' });

    expect(event.defaultPrevented).toBe(false);
    // The hook has no branch for "somewhere in the middle" — it leaves
    // focus exactly where it was and lets the browser's native Tab order
    // take over (jsdom does not implement that itself, so activeElement
    // is unchanged here, which is the correct "hook did nothing" signal).
    expect(document.activeElement).toBe(middle);
  });

  it('disabled elements are skipped — the cycle lands on the last enabled one', () => {
    const onCancel = jest.fn();
    render(
      <TrapHarness onCancel={onCancel}>
        <button>First</button>
        <button>Enabled last</button>
        <button disabled>Disabled last</button>
      </TrapHarness>,
    );

    const dialog = screen.getByRole('dialog');
    const first = screen.getByRole('button', { name: 'First' });
    const enabledLast = screen.getByRole('button', { name: 'Enabled last' });

    // The disabled button is the last element in the DOM, but the hook
    // must filter it out of the focusable set — so the "last" element for
    // wrap-around purposes is the last *enabled* one.
    enabledLast.focus();
    expect(document.activeElement).toBe(enabledLast);

    const event = keyDownOn(dialog, { key: 'Tab' });

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it('an empty dialog (no focusable children) is a no-op rather than a crash', () => {
    const onCancel = jest.fn();
    render(
      <TrapHarness onCancel={onCancel}>
        <p>No focusable content here.</p>
      </TrapHarness>,
    );

    const dialog = screen.getByRole('dialog');

    let event: ReturnType<typeof keyDownOn>;
    expect(() => {
      event = keyDownOn(dialog, { key: 'Tab' });
    }).not.toThrow();

    expect(event!.defaultPrevented).toBe(false);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('a key that is neither Escape nor Tab is ignored', () => {
    const onCancel = jest.fn();
    render(
      <TrapHarness onCancel={onCancel}>
        <button>First</button>
        <button>Last</button>
      </TrapHarness>,
    );

    const dialog = screen.getByRole('dialog');
    const event = keyDownOn(dialog, { key: 'a' });

    expect(event.defaultPrevented).toBe(false);
    expect(onCancel).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'First' }));
  });
});
