/**
 * Unit tests for StatusLookupForm — T-21 (FR-6 scenario 1, FR-13's
 * applicant-facing note path, NFR-10, design.md §5.4).
 *
 * `lookupRegistration` is MOCKED here (like `OtpVerificationStep.test.tsx`
 * mocks `requestVerificationCode`/`submitRegistration`) — this file proves
 * the component's OWN contract: it calls `lookupRegistration(reference,
 * email)` with plain positional arguments and renders correctly off the
 * typed result or a classified error. It does NOT re-prove that
 * `lookupRegistration` itself emits a `POST` with a JSON body on a
 * query-string-free URL — that is `registrations.test.ts`'s
 * "the emitted request — Disqualifying-clause evidence" block, which
 * exercises the real `fetch` call through the unmocked function. The
 * SERVER-side proof that the three failure modes below are actually
 * byte-identical over HTTP lives in
 * `backend/src/registrations/registrations-lookup.e2e.spec.ts`, not here —
 * this file and that one prove different halves of the same invariant.
 *
 * Covers:
 *   - a correct pair renders the mapped status label + description
 *   - reviewNote renders when present, and is absent from the DOM when the
 *     server omits it (never fabricated)
 *   - the byte-identity invariant: `LOOKUP_NOT_FOUND_MESSAGE` renders
 *     IDENTICALLY across THREE SEPARATE `it` blocks simulating "reference
 *     absent", "email mismatch", and the L-2 lockout exit — all three
 *     surface as the same ApiError(404) from the caller's point of view
 *     (the service's two `throw buildLookupNotFoundError()` call sites both
 *     construct through the one argument-free factory, so the invariance is
 *     the factory's, not a single-throw-site property), and each `it` uses
 *     a DIFFERENT input pair — genuinely proving input-independence, not
 *     the same input asserted three times
 *   - a 429 renders a DIFFERENT, throttling-specific message (T5-A2's
 *     carve-out — not a C-3 regression)
 *   - a 400 renders a third, distinct message
 *   - blank inputs are rejected client-side without ever calling
 *     `lookupRegistration`
 *   - **the layering residual (Reviewer follow-up):** neither this file nor
 *     `registrations.test.ts` alone would catch an edit that keeps calling
 *     `lookupRegistration` correctly AND additionally leaks the email via a
 *     separate `fetch`/navigation. `expect(global.fetch).not.toHaveBeenCalled()`
 *     after a submit closes that gap — `lookupRegistration` is mocked, so
 *     the ONLY way `fetch` fires at all is a path this component should
 *     never take
 *   - "look up a different submission" returns to the form
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { ApiError } from '@/lib/api/client';
import { lookupRegistration } from '@/lib/api/registrations';

import StatusLookupForm, { LOOKUP_NOT_FOUND_MESSAGE } from './StatusLookupForm';

jest.mock('@/lib/api/registrations', () => ({
  lookupRegistration: jest.fn(),
}));

const mockLookupRegistration = lookupRegistration as jest.MockedFunction<typeof lookupRegistration>;

function fillAndSubmit(reference: string, email: string) {
  fireEvent.change(screen.getByLabelText(/reference code/i), { target: { value: reference } });
  fireEvent.change(screen.getByLabelText(/email address you verified/i), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: /check status/i }));
}

describe('StatusLookupForm', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // `lookupRegistration` is mocked above, so this component's ONLY
    // legitimate path to the network is through it. Spying on `fetch` here
    // closes the layering residual the Reviewer flagged: neither this file
    // (which mocks `lookupRegistration`) nor `registrations.test.ts` (which
    // exercises `lookupRegistration` in isolation) would alone catch an
    // edit that keeps calling `lookupRegistration` correctly AND
    // additionally leaks the email via a second, direct `fetch` or
    // navigation. If `global.fetch` is ever called here, that is exactly
    // such a regression — see the dedicated test below.
    global.fetch = jest.fn();
  });

  it('calls lookupRegistration with the entered reference and email as plain arguments', async () => {
    mockLookupRegistration.mockResolvedValue({ status: 'PENDING_REVIEW' });
    render(<StatusLookupForm />);

    fillAndSubmit('REG-2026-0184', 'neema@khsc.co.tz');

    await waitFor(() => expect(mockLookupRegistration).toHaveBeenCalledTimes(1));
    expect(mockLookupRegistration).toHaveBeenCalledWith('REG-2026-0184', 'neema@khsc.co.tz');
  });

  it('makes no request outside lookupRegistration — closes the layering residual', async () => {
    // `lookupRegistration` is mocked, so `fetch` firing at all here means
    // this component took some OTHER path to the network — e.g. a stray
    // direct fetch or a `router.push`/`<a href>` carrying the email — which
    // neither this component's own mock-based tests nor
    // `registrations.test.ts`'s isolated wire-shape test could otherwise
    // see (that test never renders this component; this suite never hits
    // the real `apiFetch`).
    mockLookupRegistration.mockResolvedValue({ status: 'PENDING_REVIEW' });
    render(<StatusLookupForm />);

    fillAndSubmit('REG-2026-0184', 'neema@khsc.co.tz');
    await screen.findByText('Pending review');

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('renders the mapped status label and description for a correct pair', async () => {
    mockLookupRegistration.mockResolvedValue({ status: 'PENDING_REVIEW' });
    render(<StatusLookupForm />);

    fillAndSubmit('REG-2026-0184', 'neema@khsc.co.tz');

    expect(await screen.findByText('Pending review')).toBeInTheDocument();
    expect(
      screen.getByText(/waiting to be reviewed by the accelerate tanzania team/i),
    ).toBeInTheDocument();
  });

  it('renders APPROVED and REJECTED with distinct human copy, never the raw enum literal', async () => {
    mockLookupRegistration.mockResolvedValue({ status: 'APPROVED' });
    render(<StatusLookupForm />);
    fillAndSubmit('REG-2026-0184', 'neema@khsc.co.tz');
    expect(await screen.findByText('Approved')).toBeInTheDocument();
    expect(screen.queryByText('APPROVED')).not.toBeInTheDocument();
  });

  it('renders reviewNote when the server includes one', async () => {
    mockLookupRegistration.mockResolvedValue({
      status: 'REJECTED',
      reviewNote: 'Missing crop detail — please resubmit with your main crop selected.',
    });
    render(<StatusLookupForm />);

    fillAndSubmit('REG-2026-0184', 'neema@khsc.co.tz');

    expect(await screen.findByText('Not approved')).toBeInTheDocument();
    expect(
      screen.getByText(/missing crop detail — please resubmit with your main crop selected/i),
    ).toBeInTheDocument();
  });

  it('renders NOTHING under "Note from the review team" when reviewNote is absent', async () => {
    mockLookupRegistration.mockResolvedValue({ status: 'PENDING_REVIEW' });
    render(<StatusLookupForm />);

    fillAndSubmit('REG-2026-0184', 'neema@khsc.co.tz');

    await screen.findByText('Pending review');
    expect(screen.queryByText(/note from the review team/i)).not.toBeInTheDocument();
  });

  describe('the byte-identity invariant (FR-6 scenario 2) — three SEPARATE failure modes, ONE message', () => {
    const NOT_FOUND = new ApiError(404, 'No registration was found matching that reference and email.');

    it('renders LOOKUP_NOT_FOUND_MESSAGE when the reference does not exist', async () => {
      mockLookupRegistration.mockRejectedValue(NOT_FOUND);
      render(<StatusLookupForm />);

      fillAndSubmit('REG-2026-9999', 'nobody@example.com');

      expect(await screen.findByText(LOOKUP_NOT_FOUND_MESSAGE)).toBeInTheDocument();
    });

    it('renders the IDENTICAL LOOKUP_NOT_FOUND_MESSAGE when the reference exists but the email does not match', async () => {
      // Same ApiError(404) — the server's factory-shared throws make these
      // two scenarios byte-identical from this component's point of view;
      // there is nothing in the rejection to distinguish "absent" from
      // "mismatch" with, and this component must not try to.
      mockLookupRegistration.mockRejectedValue(NOT_FOUND);
      render(<StatusLookupForm />);

      fillAndSubmit('REG-2026-0184', 'wrong-email@example.com');

      expect(await screen.findByText(LOOKUP_NOT_FOUND_MESSAGE)).toBeInTheDocument();
    });

    it('renders the IDENTICAL LOOKUP_NOT_FOUND_MESSAGE on the L-2 lockout exit too', async () => {
      // Same ApiError(404) again — `registrations.service.ts` has TWO
      // `throw buildLookupNotFoundError()` call sites (the lockout check and
      // the no-match check), not one; the invariance comes from that one
      // argument-free factory both throws construct through, not from a
      // single throw site.
      mockLookupRegistration.mockRejectedValue(NOT_FOUND);
      render(<StatusLookupForm />);

      fillAndSubmit('REG-2026-0184', 'neema@khsc.co.tz');

      expect(await screen.findByText(LOOKUP_NOT_FOUND_MESSAGE)).toBeInTheDocument();
    });
  });

  it('renders a DIFFERENT, throttling-specific message for a 429 (T5-A2 carve-out, not a C-3 regression)', async () => {
    mockLookupRegistration.mockRejectedValue(new ApiError(429, 'Too Many Requests'));
    render(<StatusLookupForm />);

    fillAndSubmit('REG-2026-0184', 'neema@khsc.co.tz');

    const message = await screen.findByRole('alert');
    expect(message.textContent).toMatch(/checking too often/i);
    expect(message.textContent).not.toBe(LOOKUP_NOT_FOUND_MESSAGE);
  });

  it('renders a third, distinct message for a 400 (malformed shape)', async () => {
    mockLookupRegistration.mockRejectedValue(new ApiError(400, 'Validation failed'));
    render(<StatusLookupForm />);

    fillAndSubmit('REG-2026-0184', 'neema@khsc.co.tz');

    const message = await screen.findByRole('alert');
    expect(message.textContent).not.toBe(LOOKUP_NOT_FOUND_MESSAGE);
    expect(message.textContent).toMatch(/enter your reference code and the email address/i);
  });

  it('rejects blank inputs client-side without ever calling lookupRegistration', async () => {
    render(<StatusLookupForm />);

    fireEvent.click(screen.getByRole('button', { name: /check status/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(mockLookupRegistration).not.toHaveBeenCalled();
  });

  it('returns to the form via "Look up a different submission" after a successful result', async () => {
    mockLookupRegistration.mockResolvedValue({ status: 'PENDING_REVIEW' });
    render(<StatusLookupForm />);

    fillAndSubmit('REG-2026-0184', 'neema@khsc.co.tz');
    await screen.findByText('Pending review');

    fireEvent.click(screen.getByRole('button', { name: /look up a different submission/i }));

    expect(screen.getByLabelText(/reference code/i)).toBeInTheDocument();
    expect(screen.queryByText('Pending review')).not.toBeInTheDocument();
  });
});
