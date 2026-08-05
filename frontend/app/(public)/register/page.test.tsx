/**
 * Unit tests for the /register page shell (T-17).
 *
 * Covers only what this task owns: the page renders RegistrationForm and
 * states the review-before-publication fact (echoing FR-1's landing CTA
 * copy so a visitor who lands here directly gets the same expectation).
 * The OTP step this page seams for (T-19) is not exercised here — it
 * doesn't exist yet. Consent (T-18) is exercised only indirectly: it now
 * renders as part of `RegistrationForm`'s own fifth fieldset (see
 * `RegistrationForm.tsx`'s file header) — its own behaviour is covered in
 * `ConsentPolicyDisclosure.test.tsx`, not here.
 *
 * `@/lib/api/registrations` is mocked with a never-resolving fetch for the
 * same reason `RegistrationForm.test.tsx` mocks it: this page renders
 * `ConsentPolicyDisclosure` transitively, and a real (failing, since no
 * `NEXT_PUBLIC_API_BASE_URL` is configured in tests) fetch resolving after
 * `render()` returns triggers an act() warning unrelated to what this file
 * tests.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('@/lib/api/registrations', () => ({
  getConsentPolicy: jest.fn(() => new Promise(() => {})),
}));

import RegisterPage from './page';

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
});
