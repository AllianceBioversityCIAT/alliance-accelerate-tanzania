/**
 * /reset-password — the page the admin-reset email links to.
 *
 * The regression it exists for: /login redirects an already-signed-in
 * visitor into the app, so the recipient never saw the form. This page must
 * sign out FIRST and only then render it.
 */

import { render, screen, waitFor } from '@testing-library/react';

const mockSignOut = jest.fn(() => Promise.resolve());
let mockLoading = false;

jest.mock('next/navigation', () => ({
  useRouter:       jest.fn(() => ({ replace: jest.fn() })),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: jest.fn(() => ({
    signIn:  jest.fn(),
    signOut: mockSignOut,
    refresh: jest.fn(),
    loading: mockLoading,
  })),
}));

jest.mock('@/lib/auth/useSession', () => ({
  useSession: jest.fn(() => ({ role: 'Public', user: null })),
}));

jest.mock('@/lib/auth/auth-client', () => ({
  confirmNewPassword: jest.fn(),
}));

import ResetPasswordPage from './page';

beforeEach(() => {
  mockSignOut.mockClear();
  mockLoading = false;
});

it('signs the visitor out before the form is reachable', async () => {
  render(<ResetPasswordPage />);

  expect(mockSignOut).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();

  await waitFor(() => expect(screen.getByRole('heading')).toBeInTheDocument());
});

it('renders the sign-in form once the sign-out resolves', async () => {
  render(<ResetPasswordPage />);

  await waitFor(() =>
    expect(screen.getByRole('heading', { name: /staff sign-in/i })).toBeInTheDocument(),
  );
});

it('signs out even when no session resolved, so a stale token cannot survive', async () => {
  render(<ResetPasswordPage />);

  await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
});

it('waits for the session to resolve before signing out', () => {
  mockLoading = true;

  render(<ResetPasswordPage />);

  expect(mockSignOut).not.toHaveBeenCalled();
});
