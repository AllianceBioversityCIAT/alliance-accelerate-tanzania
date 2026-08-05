/**
 * Unit tests for the /register page shell (T-17).
 *
 * Covers only what this task owns: the page renders RegistrationForm and
 * states the review-before-publication fact (echoing FR-1's landing CTA
 * copy so a visitor who lands here directly gets the same expectation).
 * The consent/OTP steps this page seams for (T-18/T-19) are not exercised
 * here — they don't exist yet.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

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
