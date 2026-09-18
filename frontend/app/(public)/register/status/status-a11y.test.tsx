/**
 * Whole-page accessibility suite for `/register/status` (T-22, NFR-5, QA-11,
 * DC-16).
 *
 * `StatusLookupForm.test.tsx` proves the component's OWN control flow (the
 * byte-identity invariant across the three 404 causes, the body-not-query
 * request shape, etc.) but runs no `jest-axe` at all, and `status/page.
 * test.tsx` only renders the empty form. Neither reaches the RESULT state —
 * which is exactly where T21-A1 lived: "on a successful status lookup the
 * form unmounts and is replaced by the result panel with no focus move and
 * no live region: errors announce via role="alert", results do not." This
 * file is the first suite to render the composed `RegistrationStatusPage`
 * (heading + `StatusLookupForm`) through to that result state and check it.
 *
 * States covered:
 *   1. The empty lookup form.
 *   2. The error state (byte-identical 404 message).
 *   3. The successful RESULT panel — axe, focus move, and live-region
 *      announcement (T21-A1, new coverage).
 *
 * Mocks: `@/lib/api/registrations`'s `lookupRegistration`, mirroring
 * `status/page.test.tsx` and `StatusLookupForm.test.tsx` exactly.
 *
 * ── What this file does NOT and cannot prove (DC-16) ───────────────────────
 * Same jsdom ceiling as the other two screens' suites: `color-contrast`
 * reports `incomplete` and does not fail `toHaveNoViolations`; real tab
 * ORDER and focus VISIBILITY need a layout engine jsdom does not have. All
 * three route to the DC-16 human check on a real browser render of
 * `/register/status` — not deferrable on auth (KZ-003): this screen is
 * public, unauthenticated, and needs no backend to reach any of its three
 * states here (the API call is mocked).
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

const mockLookupRegistration = jest.fn();
jest.mock('@/lib/api/registrations', () => ({
  lookupRegistration: (...args: unknown[]) => mockLookupRegistration(...args),
}));

import RegistrationStatusPage from './page';
import { ApiError } from '@/lib/api/client';

beforeEach(() => {
  jest.clearAllMocks();
});

function fillAndSubmit(reference = 'REG-2026-0184', email = 'neema@khsc.co.tz') {
  fireEvent.change(screen.getByLabelText(/reference code/i), { target: { value: reference } });
  fireEvent.change(screen.getByLabelText(/email address you verified/i), {
    target: { value: email },
  });
  fireEvent.click(screen.getByRole('button', { name: /check status/i }));
}

// ---------------------------------------------------------------------------
// 1 — the empty lookup form
// ---------------------------------------------------------------------------

describe('/register/status — empty form, whole-page axe', () => {
  it('has no jest-axe violations', async () => {
    const { container } = render(<RegistrationStatusPage />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('exactly one h1, and both inputs are labelled and keyboard-focusable', () => {
    render(<RegistrationStatusPage />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

    const reference = screen.getByLabelText(/reference code/i);
    const email = screen.getByLabelText(/email address you verified/i);
    reference.focus();
    expect(reference).toHaveFocus();
    email.focus();
    expect(email).toHaveFocus();
  });
});

// ---------------------------------------------------------------------------
// 2 — the error state (byte-identical 404, per FR-6 scenario 2)
// ---------------------------------------------------------------------------

describe('/register/status — error state, whole-page axe', () => {
  it('has no jest-axe violations with the not-found message shown', async () => {
    mockLookupRegistration.mockRejectedValue(new ApiError(404, 'Not Found'));
    const { container } = render(<RegistrationStatusPage />);
    fillAndSubmit();

    await screen.findByRole('alert');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('the error announces via an assertive live region (already-proven pattern, asserted here over the composed page)', async () => {
    mockLookupRegistration.mockRejectedValue(new ApiError(404, 'Not Found'));
    render(<RegistrationStatusPage />);
    fillAndSubmit();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveTextContent(/couldn't find a submission/i);
  });
});

// ---------------------------------------------------------------------------
// 3 — the successful RESULT panel (T21-A1 — new coverage)
// ---------------------------------------------------------------------------

describe('/register/status — result state (T21-A1, new coverage)', () => {
  it('has no jest-axe violations on the result panel — UNCHECKED before this suite', async () => {
    mockLookupRegistration.mockResolvedValue({ status: 'PENDING_REVIEW' });
    const { container } = render(<RegistrationStatusPage />);
    fillAndSubmit();

    await screen.findByText(/pending review/i);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('T21-A1: focus moves onto the result panel when it replaces the form, instead of staying on the unmounted submit button', async () => {
    mockLookupRegistration.mockResolvedValue({ status: 'PENDING_REVIEW' });
    render(<RegistrationStatusPage />);

    fireEvent.change(screen.getByLabelText(/reference code/i), {
      target: { value: 'REG-2026-0184' },
    });
    fireEvent.change(screen.getByLabelText(/email address you verified/i), {
      target: { value: 'neema@khsc.co.tz' },
    });
    const submitButton = screen.getByRole('button', { name: /check status/i });
    submitButton.focus();
    expect(submitButton).toHaveFocus();
    fireEvent.click(submitButton);

    const panel = await screen.findByRole('status');
    await waitFor(() => expect(panel).toHaveFocus());
    // Never <body> — the regression T21-A1 exists to prevent (the form,
    // including the just-focused submit button, has unmounted by this point).
    expect(document.activeElement).not.toBe(document.body);
  });

  it('T21-A1: the result panel is a polite live region — a screen-reader user is told the outcome the same way an error already is', async () => {
    mockLookupRegistration.mockResolvedValue({
      status: 'REJECTED',
      reviewNote: 'Please resubmit with a valid phone number.',
    });
    render(<RegistrationStatusPage />);
    fillAndSubmit();

    const panel = await screen.findByRole('status');
    expect(panel).toHaveAttribute('aria-live', 'polite');
    expect(panel).toHaveTextContent(/not approved/i);
    expect(panel).toHaveTextContent(/please resubmit with a valid phone number/i);
  });

  it('"Look up a different submission" returns to a labelled, focusable form that RETAINS the entered values (StatusLookupForm\'s own behaviour — not this task\'s concern to change)', async () => {
    mockLookupRegistration.mockResolvedValue({ status: 'APPROVED' });
    render(<RegistrationStatusPage />);
    fillAndSubmit('REG-2026-0184', 'neema@khsc.co.tz');

    await screen.findByRole('status');
    fireEvent.click(screen.getByRole('button', { name: /look up a different submission/i }));

    // Reviewer correction 6: the title claimed retained values but the body
    // never checked them — asserted here rather than renamed, since the
    // retention is real (StatusLookupForm.handleLookupAgain clears `result`/
    // `error` only, not `reference`/`email`) and worth pinning so a future
    // change to that behaviour is a deliberate, visible edit here too.
    const reference = await screen.findByLabelText(/reference code/i);
    const email = screen.getByLabelText(/email address you verified/i);
    expect(reference).toHaveValue('REG-2026-0184');
    expect(email).toHaveValue('neema@khsc.co.tz');
    reference.focus();
    expect(reference).toHaveFocus();
  });
});
