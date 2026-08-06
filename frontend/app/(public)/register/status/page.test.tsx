/**
 * Unit tests for /register/status (T-21, FR-6 scenario 1, design.md §5.4).
 *
 * Covers:
 *   - the page renders a heading and `StatusLookupForm`'s two labelled
 *     inputs, with no `useSearchParams()`/`<Suspense>` involved (unlike
 *     `/register/submitted`) — a plain render is enough to prove that,
 *     since a missing/misconfigured Suspense boundary would surface as a
 *     build failure under static export, not a runtime symptom this test
 *     could catch; `npm run build`'s static-page count is the real guard
 *     (see the Leader's brief)
 *   - `lookupRegistration` is mocked so this file makes NO real network
 *     call; StatusLookupForm.test.tsx and registrations.test.ts own the
 *     lookup behaviour and wire-shape assertions respectively
 */

import { render, screen } from '@testing-library/react';

jest.mock('@/lib/api/registrations', () => ({
  lookupRegistration: jest.fn(),
}));

import RegistrationStatusPage from './page';

describe('/register/status', () => {
  it('renders the heading and the status lookup form', () => {
    render(<RegistrationStatusPage />);

    expect(screen.getByRole('heading', { name: /check your submission status/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/reference code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address you verified/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check status/i })).toBeInTheDocument();
  });
});
