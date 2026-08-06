/**
 * Unit tests for OtpVerificationStep (T-19, FR-4 scenarios 2-3, design.md §5.3).
 *
 * `@/lib/api/registrations` is mocked (per `frontend/CLAUDE.md`: "Page tests
 * mock the `lib/api/*` module") — this file's concern is the step's own
 * control flow, not the wire shape of `apiFetch` (that lives in
 * `client.test.ts`/`registrations`'s own module, if any).
 *
 * **Reviewer correction 2 — nothing here is verified against the live API.**
 * `POST /registrations` (T-10) and `POST /registrations/verify` have not
 * been exercised through a real backend from this file. The `details:
 * [{field, message}]` envelope T17-A4's whole `blockingIssue` branch depends
 * on is ASSUMED here (mocked directly as `new ApiError(400, ..., [{field:
 * 'email', ...}])`), not PROVEN — this is `frontend/CLAUDE.md`'s own named
 * hazard: "Verify data-loading UI against the live API, not only mocks —
 * mock-vs-live drift has shipped bugs (the `details` envelope, W-1)." **This
 * module must be re-verified against the live API once T-10 lands** (T-10 is
 * landing in parallel with this task, per the Leader — it had not landed as
 * of T-19's own verification run).
 *
 * The central obligation this file exists to prove: `INVALID_CODE_MESSAGE`
 * renders for a wrong code, an expired code, and a consumed code, AND
 * `RESEND_NOTICE` renders identically for a capped and an uncapped resend —
 * design.md §3.1 decision 2 and decision 1 respectively collapse those into
 * ONE shape apiece before this component ever sees a response. **Reviewer
 * correction 4:** the three wrong/expired/consumed tests below all mock the
 * IDENTICAL `new ApiError(400, 'Bad Request', undefined)` — because the
 * server sends the identical collapsed shape for all three causes, by
 * design. That means these three tests prove the SAME thing three times
 * (this component renders `INVALID_CODE_MESSAGE` for a `400` with no
 * `details`), not that the three causes are indistinguishable from one
 * another — that indistinguishability is a SERVER-SIDE property (proven in
 * the backend's OTP suite, design.md §4.3 V-1a/V-5), not something this
 * client-side file can observe or re-prove. What this file DOES prove is the
 * client-side half of the contract: given that collapsed shape, whichever
 * of the three produced it, the rendered copy never varies and never leaks
 * which one occurred.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import OtpVerificationStep, { INVALID_CODE_MESSAGE } from './OtpVerificationStep';
import { ApiError } from '@/lib/api/client';
import {
  requestVerificationCode,
  submitRegistration,
  type RegistrationSubmitConsent,
  type RegistrationSubmitPayload,
} from '@/lib/api/registrations';

expect.extend(toHaveNoViolations);

jest.mock('@/lib/api/registrations', () => ({
  requestVerificationCode: jest.fn(),
  submitRegistration: jest.fn(),
}));

const mockRequestVerificationCode = requestVerificationCode as jest.MockedFunction<
  typeof requestVerificationCode
>;
const mockSubmitRegistration = submitRegistration as jest.MockedFunction<typeof submitRegistration>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PAYLOAD: RegistrationSubmitPayload = {
  traderName: 'Kilimanjaro Seed Co-op',
  traderType: 'seed_company',
  contactPerson: 'Jane Doe',
  region: 'Arusha',
  crops: ['sorghum'],
  capacityTons: 10,
  phone: '+255700000000',
};

const CONSENT: RegistrationSubmitConsent = { accepted: true, policyVersion: 'v9.9-test-fixture' };
const EMAIL = 'jane@kilimanjaroseed.co.tz';

function renderStep(overrides: Partial<{ consent: RegistrationSubmitConsent }> = {}) {
  const onSubmitted = jest.fn();
  const onBack = jest.fn();
  const { container } = render(
    <OtpVerificationStep
      email={EMAIL}
      payload={PAYLOAD}
      consent={overrides.consent ?? CONSENT}
      onSubmitted={onSubmitted}
      onBack={onBack}
    />,
  );
  return { onSubmitted, onBack, container };
}

/** Waits past the initial-send effect and returns the ready code UI. */
async function readyCodeInput() {
  return screen.findByLabelText(/verification code/i);
}

beforeEach(() => {
  jest.resetAllMocks();
  // Default: the first send succeeds immediately, so most tests reach the
  // code-entry UI without extra ceremony.
  mockRequestVerificationCode.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Initial send — automatic, on mount
// ---------------------------------------------------------------------------

describe('OtpVerificationStep — initial send', () => {
  it('requests a code for the verified-candidate email as soon as it mounts', async () => {
    renderStep();
    expect(screen.getByText(/sending your verification code/i)).toBeInTheDocument();
    await readyCodeInput();
    expect(mockRequestVerificationCode).toHaveBeenCalledWith(EMAIL);
    expect(mockRequestVerificationCode).toHaveBeenCalledTimes(1);
  });

  it('shows the code input, the target email, and the up-front cap notice once the send resolves', async () => {
    renderStep();
    await readyCodeInput();
    expect(screen.getByText(EMAIL, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/limited per email address/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T17-A4 — the server rejects the email itself (details carries `email`)
// ---------------------------------------------------------------------------

describe('OtpVerificationStep — server-side email rejection (T17-A4)', () => {
  it('on the INITIAL send: renders the server field message and an actionable Back action, not the code UI', async () => {
    mockRequestVerificationCode.mockRejectedValue(
      new ApiError(400, 'Bad Request', [{ field: 'email', message: 'email must be an email' }]),
    );
    const { onBack } = renderStep();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('email must be an email');
    expect(screen.queryByLabelText(/verification code/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /go back and re-enter your details/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('on the FINAL SUBMIT: maps details[{field:\'email\'}] to the same actionable message and Back action', async () => {
    mockSubmitRegistration.mockRejectedValue(
      new ApiError(400, 'Bad Request', [{ field: 'email', message: 'email must be an email' }]),
    );
    const { onBack } = renderStep();
    const codeInput = await readyCodeInput();

    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify and submit/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('email must be an email');
    // The applicant has something to act on: a route back, not a dead end.
    fireEvent.click(screen.getByRole('button', { name: /go back and re-enter your details/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('discloses that going back clears entered details, naming the corrected field honestly (Reviewer correction 1)', async () => {
    mockRequestVerificationCode.mockRejectedValue(
      new ApiError(400, 'Bad Request', [{ field: 'email', message: 'email must be an email' }]),
    );
    renderStep();
    await screen.findByRole('alert');
    // The button no longer claims a "back" that does not exist (page.tsx
    // clears `pending`) — the disclosure states the actual consequence.
    expect(screen.getByText(/fill in the form again/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing you've entered so far will be kept/i)).toBeInTheDocument();
    expect(screen.getByText(/corrected email address/i)).toBeInTheDocument();
  });

  it('names the ACTUAL rejected field in the heading, not a hardcoded "email" (Reviewer correction 5)', async () => {
    // A field validation failure on something other than `email` — the
    // defensive fallback branch in classifySubmitError. RegistrationForm is
    // not expected to let this happen in practice, but the server's shape
    // does not guarantee it never will.
    mockSubmitRegistration.mockRejectedValue(
      new ApiError(400, 'Bad Request', [{ field: 'phone', message: 'phone must be a valid phone number' }]),
    );
    renderStep();
    const codeInput = await readyCodeInput();
    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify and submit/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('phone must be a valid phone number');
    // The heading must NOT claim this was about email — that would misstate
    // the cause to the one applicant reading this screen to act on it.
    expect(screen.queryByText(/verify your email address/i)).not.toBeInTheDocument();
    expect(screen.getByText(/one of your submitted details/i)).toBeInTheDocument();
    // Nor should the re-entry copy tell them to correct an email that was
    // never the problem.
    expect(screen.queryByText(/corrected email address/i)).not.toBeInTheDocument();
    expect(screen.getByText(/corrected details/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// The invariant — client-side half. Wrong/expired/consumed all deliver the
// SAME collapsed 400 to this component (server-side proof that the three
// causes are indistinguishable lives in the backend's OTP suite, not here —
// see this file's header, Reviewer correction 4). What these three tests
// prove is that this component's response to that collapsed shape never
// varies. A fourth, separately-mechanised test covers the OTHER invariant —
// a capped vs. an uncapped resend render the identical RESEND_NOTICE — since
// design.md §3.1 collapses THAT pair via a different mechanism (a silent
// 202, not a collapsed 400).
// ---------------------------------------------------------------------------

describe('OtpVerificationStep — the OTP invariant (design.md §3.1 decisions 1 & 2)', () => {
  async function submitWithCollapsed400() {
    renderStep();
    const codeInput = await readyCodeInput();
    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify and submit/i }));
    return screen.findByRole('alert');
  }

  it('a WRONG code renders exactly INVALID_CODE_MESSAGE', async () => {
    mockSubmitRegistration.mockRejectedValue(new ApiError(400, 'Bad Request', undefined));
    const alert = await submitWithCollapsed400();
    expect(alert).toHaveTextContent(INVALID_CODE_MESSAGE);
  });

  it('an EXPIRED code renders exactly INVALID_CODE_MESSAGE — same text as wrong', async () => {
    // The server sends the identical collapsed shape (design.md §3.1
    // decision 2): no `details`, regardless of which of the three causes it.
    mockSubmitRegistration.mockRejectedValue(new ApiError(400, 'Bad Request', undefined));
    const alert = await submitWithCollapsed400();
    expect(alert).toHaveTextContent(INVALID_CODE_MESSAGE);
  });

  it('a CONSUMED (already-used) code renders exactly INVALID_CODE_MESSAGE — same text again', async () => {
    mockSubmitRegistration.mockRejectedValue(new ApiError(400, 'Bad Request', undefined));
    const alert = await submitWithCollapsed400();
    expect(alert).toHaveTextContent(INVALID_CODE_MESSAGE);
  });

  it('a CAPPED resend renders the SAME static notice as an uncapped resend — the server never signals which occurred', async () => {
    // The server's contract (design.md §3.1 decision 1) is: EVERY accepted
    // resend gets 202, whether or not the per-email cap silently absorbed
    // it. This component has no field to read a refusal out of, so it must
    // render identical copy either way — there is nothing here that COULD
    // distinguish "capped" from "not capped" to begin with, which is the
    // point being proven.
    mockRequestVerificationCode.mockResolvedValue(undefined); // capped OR not — identical 202
    renderStep();
    await readyCodeInput();

    fireEvent.click(screen.getByRole('button', { name: /resend code/i }));
    const cappedNotice = await screen.findByText(/a new code has been sent/i);

    // A second resend — again a bare 202, standing in for the "not capped"
    // outcome — must render the identical text, not a different one.
    fireEvent.click(screen.getByRole('button', { name: /resend code/i }));
    const secondNotice = await screen.findByText(/a new code has been sent/i);

    expect(cappedNotice.textContent).toBe(secondNotice.textContent);
    // And critically: no distinct "you've hit the limit" (or similar)
    // wording ever appears anywhere in the document.
    expect(screen.queryByText(/hit the limit/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/too many codes/i)).not.toBeInTheDocument();
  });

  it('the resend copy sets the expectation up front rather than reporting a refusal after the fact', async () => {
    renderStep();
    await readyCodeInput();
    // Present BEFORE any resend is ever clicked — the up-front framing
    // design.md §5.3 requires instead of a post-hoc refusal.
    expect(screen.getByText(/limited per email address/i)).toBeInTheDocument();
    expect(screen.getByText(/wait a few minutes/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Legitimately visible failures — the per-caller throttler (design.md §3.1
// decision 1's own carve-out: "A 429 from the throttler remains visible").
// These must NOT collapse into INVALID_CODE_MESSAGE, proving the two failure
// classes are actually distinguished by cause, not merged wholesale.
// ---------------------------------------------------------------------------

describe('OtpVerificationStep — the throttler is honestly distinct from the OTP invariant', () => {
  it('a 429 on the final submit shows a distinct message, not INVALID_CODE_MESSAGE', async () => {
    mockSubmitRegistration.mockRejectedValue(new ApiError(429, 'Too Many Requests', undefined));
    renderStep();
    const codeInput = await readyCodeInput();
    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify and submit/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/too quickly/i);
    expect(alert).not.toHaveTextContent(INVALID_CODE_MESSAGE);
  });

  it('a 429 on resend shows a distinct message, not the resend-sent notice', async () => {
    renderStep();
    await readyCodeInput();
    mockRequestVerificationCode.mockRejectedValue(new ApiError(429, 'Too Many Requests', undefined));

    fireEvent.click(screen.getByRole('button', { name: /resend code/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/too quickly/i);
    expect(screen.queryByText(/a new code has been sent/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Successful submission
// ---------------------------------------------------------------------------

describe('OtpVerificationStep — successful submission', () => {
  it('calls onSubmitted with the reference on a 201', async () => {
    mockSubmitRegistration.mockResolvedValue({ reference: 'REG-2026-0184' });
    const { onSubmitted } = renderStep();
    const codeInput = await readyCodeInput();

    fireEvent.change(codeInput, { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: /verify and submit/i }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith('REG-2026-0184'));
  });

  it('sends the email, code, consent, and payload exactly as received — including the real fetched policyVersion', async () => {
    mockSubmitRegistration.mockResolvedValue({ reference: 'REG-2026-0001' });
    renderStep({ consent: { accepted: true, policyVersion: 'v9.9-test-fixture' } });
    const codeInput = await readyCodeInput();

    fireEvent.change(codeInput, { target: { value: '111222' } });
    fireEvent.click(screen.getByRole('button', { name: /verify and submit/i }));

    await waitFor(() => expect(mockSubmitRegistration).toHaveBeenCalledTimes(1));
    const sent = mockSubmitRegistration.mock.calls[0][0];
    expect(sent.email).toBe(EMAIL);
    expect(sent.code).toBe('111222');
    expect(sent.payload).toEqual(PAYLOAD);
    // The load-bearing assertion (obligation 3): the version sent is the
    // one this step was actually handed — never '', never a placeholder.
    expect(sent.consent.policyVersion).not.toBe('');
    expect(sent.consent.policyVersion).toBe('v9.9-test-fixture');
  });

  it('blocks submission client-side, with no network call, when policyVersion is empty', async () => {
    renderStep({ consent: { accepted: true, policyVersion: '' } });
    const codeInput = await readyCodeInput();

    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify and submit/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/refresh the page/i);
    expect(mockSubmitRegistration).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Client-side code shape validation — before any network call
// ---------------------------------------------------------------------------

describe('OtpVerificationStep — code input shape', () => {
  it('strips non-digits and clamps to 6 characters', async () => {
    renderStep();
    const codeInput = (await readyCodeInput()) as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: 'ab12cd34ef56' } });
    expect(codeInput.value).toBe('123456');
  });

  it('requires 6 digits before the submit button is enabled', async () => {
    renderStep();
    const codeInput = await readyCodeInput();
    fireEvent.change(codeInput, { target: { value: '123' } });
    expect(screen.getByRole('button', { name: /verify and submit/i })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Accessibility — jsdom-provable subset (KZ-002 / DC-16, same caveat as the
// rest of this module)
// ---------------------------------------------------------------------------

describe('OtpVerificationStep — accessibility (jsdom-provable subset)', () => {
  it('has no jest-axe violations once the code UI is ready', async () => {
    const { container } = renderStep();
    await readyCodeInput();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
