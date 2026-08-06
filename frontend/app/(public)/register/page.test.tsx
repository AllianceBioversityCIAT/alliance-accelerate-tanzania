/**
 * Unit tests for the /register page shell (T-17, T-19).
 *
 * Covers: the page renders RegistrationForm and states the
 * review-before-publication fact (echoing FR-1's landing CTA copy so a
 * visitor who lands here directly gets the same expectation); and, as of
 * T-19, the `form` → `otp` step transition itself — specifically that
 * `RegistrationForm` UNMOUNTS (its fieldsets leave the document) rather
 * than being hidden, which is what makes `ConsentPolicyDisclosure`'s
 * scroll-geometry hazard (A-4, see `OtpVerificationStep.tsx`'s file header)
 * structurally inapplicable here. Consent (T-18) itself is exercised in
 * `ConsentPolicyDisclosure.test.tsx`, not here.
 *
 * `@/lib/api/registrations` is mocked with a never-resolving `getConsentPolicy`
 * for the same reason `RegistrationForm.test.tsx` mocks it (an act()
 * warning otherwise, unrelated to what this file tests), plus mocked
 * `requestVerificationCode`/`submitRegistration` for the one test that
 * advances into the `otp` step and would otherwise hit a real, failing
 * `fetch`.
 *
 * `next/navigation` is mocked (mirrors `app/(admin)/admin/actors/edit/page.test.tsx`'s
 * pattern) because this page now calls `useRouter()` (T-19's `onSubmitted`
 * hand-off to the not-yet-built T-20 receipt screen).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const mockRouterPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('@/lib/api/registrations', () => ({
  getConsentPolicy: jest.fn(() => new Promise(() => {})),
  requestVerificationCode: jest.fn(() => new Promise(() => {})),
  submitRegistration: jest.fn(() => new Promise(() => {})),
}));

import RegisterPage from './page';

/** Fills every REQUIRED field with a valid value — mirrors RegistrationForm.test.tsx's helper. */
function fillMinimalValidForm() {
  fireEvent.change(screen.getByLabelText(/organisation name/i), {
    target: { value: 'Kilimanjaro Seed Co-op' },
  });
  fireEvent.change(screen.getByLabelText(/^trader type/i), { target: { value: 'seed_company' } });
  fireEvent.change(screen.getByLabelText(/^region/i), { target: { value: 'Arusha' } });
  fireEvent.click(screen.getByLabelText(/^sorghum/i));
  fireEvent.change(screen.getByLabelText(/capacity \(tons\)/i), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText(/contact person/i), { target: { value: 'Jane Doe' } });
  fireEvent.change(screen.getByLabelText(/^phone/i), { target: { value: '+255700000000' } });
  fireEvent.change(screen.getByLabelText(/^email/i), {
    target: { value: 'jane@kilimanjaroseed.co.tz' },
  });
  fireEvent.click(
    screen.getByLabelText('I have read and accept the Data Protection & Participant Consent Policy.'),
  );
}

describe('RegisterPage', () => {
  it('renders the heading and the review-before-publication statement', () => {
    render(<RegisterPage />);
    expect(screen.getByRole('heading', { name: /register your organisation/i })).toBeInTheDocument();
    expect(screen.getByText(/reviews every submission before it is published/i)).toBeInTheDocument();
  });

  it('renders RegistrationForm — its fieldsets are reachable from this page', () => {
    render(<RegisterPage />);
    expect(screen.getByRole('group', { name: 'Identity' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Data protection & consent' })).toBeInTheDocument();
  });

  it('advances to OtpVerificationStep on a valid submission, UNMOUNTING RegistrationForm rather than hiding it', () => {
    render(<RegisterPage />);
    fillMinimalValidForm();
    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));

    // The OTP step is now showing (its own initial "sending" state, since
    // requestVerificationCode never resolves in this test).
    expect(screen.getByText(/sending your verification code/i)).toBeInTheDocument();

    // RegistrationForm's fieldsets are gone from the document entirely —
    // not merely visually hidden. (Reviewer correction 3, fixing the
    // reasoning stated here before, which had it backwards: in a REAL
    // browser, RTL's `*ByRole` queries default to `hidden: false` and
    // correctly EXCLUDE a `display:none`d element via `isInaccessible()` —
    // so "not found" would NOT by itself distinguish hidden from unmounted
    // there. It works as a distinguishing signal HERE specifically because
    // jsdom applies no real CSS engine: a component hidden only via a
    // Tailwind class (e.g. `hidden`, i.e. `display:none` via a stylesheet
    // jsdom never loads) is NOT recognised as inaccessible in this
    // environment and WOULD still be found by `queryByRole` — so a
    // hide-based implementation would make this assertion fail, and only
    // true removal from the tree (unmount) makes it pass.)
    expect(screen.queryByRole('group', { name: 'Identity' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Data protection & consent' })).not.toBeInTheDocument();
  });

  it("passes the applicant's verified-candidate email through to OtpVerificationStep unchanged", () => {
    render(<RegisterPage />);
    fillMinimalValidForm();
    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));

    expect(screen.getByText('jane@kilimanjaroseed.co.tz', { exact: false })).toBeInTheDocument();
  });
});
