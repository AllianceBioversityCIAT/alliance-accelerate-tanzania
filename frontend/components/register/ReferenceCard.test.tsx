/**
 * Unit tests for ReferenceCard (T-20, FR-5 scenario 2, design.md §5.4).
 *
 * Covers:
 *   - the reference renders as real DOM text (selectable by construction —
 *     `getByText` only matches text nodes) and NOT as an `<img>`/`<canvas>`
 *   - the save-this instruction is present
 *   - the status-lookup link points at `/register/status`
 *   - the copy button, when `navigator.clipboard.writeText` resolves,
 *     flips to "Copied", announces it via the live region, and resets
 *   - the copy button is a graceful no-op when `navigator.clipboard` is
 *     absent (the guard in the component), and when `writeText` rejects
 *
 * ── The jsdom clipboard boundary (KZ-002) — what this file proves and what
 *    it does not ──────────────────────────────────────────────────────────
 * jsdom has NO real Clipboard API. Every "copy" assertion below stubs
 * `navigator.clipboard.writeText` with a jest mock and asserts (a) the
 * component CALLED it with the reference string, and (b) the component's
 * own state reacted correctly to that mock's resolution/rejection. That is
 * a genuine behavioural proof of ReferenceCard's calling contract — it is
 * NOT proof that a real OS clipboard receives the text in a real browser.
 * This file cannot and does not claim otherwise. The "clipboard absent"
 * test is the one case this file proves end-to-end without a stub: it
 * documents that the guard makes the button an inert no-op rather than a
 * throw, which is the actual fallback path a real unsupported browser would
 * take (the reference stays selectable text regardless).
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

import ReferenceCard from './ReferenceCard';

const REFERENCE = 'REG-2026-0184';

/** Installs a stubbed `navigator.clipboard.writeText`; restore with the returned fn. */
function stubClipboard(writeText: jest.Mock | undefined) {
  const original = (navigator as { clipboard?: Clipboard }).clipboard;
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  });
  return () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: original,
      configurable: true,
    });
  };
}

describe('ReferenceCard', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the reference as selectable text, never an image or canvas', () => {
    const { container } = render(<ReferenceCard reference={REFERENCE} />);

    // getByText only matches a real DOM TEXT NODE's content — an <img alt="REG-2026-0184">
    // or a canvas-rendered glyph would not satisfy this query at all.
    expect(screen.getByText(REFERENCE)).toBeInTheDocument();

    // Direct structural check: this component renders neither element anywhere.
    expect(container.querySelectorAll('img').length).toBe(0);
    expect(container.querySelectorAll('canvas').length).toBe(0);
  });

  it('renders the save-this instruction', () => {
    render(<ReferenceCard reference={REFERENCE} />);
    expect(screen.getByText(/save this reference code/i)).toBeInTheDocument();
  });

  it('links to /register/status', () => {
    render(<ReferenceCard reference={REFERENCE} />);
    const link = screen.getByRole('link', { name: /check status with this reference/i });
    expect(link).toHaveAttribute('href', '/register/status');
  });

  it('copies the reference and announces it, then resets after the timeout', async () => {
    jest.useFakeTimers();
    const writeText = jest.fn().mockResolvedValue(undefined);
    const restore = stubClipboard(writeText);

    render(<ReferenceCard reference={REFERENCE} />);
    const button = screen.getByRole('button', { name: /copy reference code/i });

    fireEvent.click(button);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(REFERENCE));
    await waitFor(() => expect(screen.getByRole('button', { name: /^copied$/i })).toBeInTheDocument());
    expect(screen.getByText(/reference code copied to clipboard/i)).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /copy reference code/i })).toBeInTheDocument(),
    );

    restore();
  });

  it('is a graceful no-op when navigator.clipboard is absent', async () => {
    const restore = stubClipboard(undefined);

    render(<ReferenceCard reference={REFERENCE} />);
    const button = screen.getByRole('button', { name: /copy reference code/i });

    fireEvent.click(button);

    // No throw, no "Copied" state — the reference remains selectable text as
    // the fallback (this is the real-browser-unsupported path, not a stub).
    expect(screen.getByRole('button', { name: /copy reference code/i })).toBeInTheDocument();
    expect(screen.getByText(REFERENCE)).toBeInTheDocument();

    restore();
  });

  it('does not enter the Copied state when writeText rejects', async () => {
    const writeText = jest.fn().mockRejectedValue(new Error('denied'));
    const restore = stubClipboard(writeText);

    render(<ReferenceCard reference={REFERENCE} />);
    const button = screen.getByRole('button', { name: /copy reference code/i });

    fireEvent.click(button);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(REFERENCE));
    expect(screen.getByRole('button', { name: /copy reference code/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^copied$/i })).not.toBeInTheDocument();

    restore();
  });
});
