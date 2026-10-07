// @sdd-spec actors/consent-intake/consent-request-email (T-9)
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

const mockQueue = jest.fn();
const mockDispatch = jest.fn();
const mockRetry = jest.fn();

jest.mock('@/lib/api/consent-requests-admin', () => ({
  getConsentQueue: (...a: unknown[]) => mockQueue(...a),
  dispatchConsentRequests: (...a: unknown[]) => mockDispatch(...a),
  retryConsentRequests: (...a: unknown[]) => mockRetry(...a),
}));
jest.mock('@/lib/api/client', () => {
  class AuthFailureError extends Error {}
  return { AuthFailureError };
});

import { ConsentQueueBanner } from './ConsentQueueBanner';
import { useConsentDispatch } from '@/lib/admin/useConsentDispatch';
import { AuthFailureError } from '@/lib/api/client';

const TOKEN = 't';
/** Stands in for the page: ONE dispatch owner handed to the banner. */
function Harness({ onAuthFailure }: { onAuthFailure: () => void }) {
  const dispatch = useConsentDispatch({ token: TOKEN, onAuthFailure });
  return <ConsentQueueBanner token={TOKEN} dispatch={dispatch} onAuthFailure={onAuthFailure} />;
}
const renderBanner = (onAuthFailure = jest.fn()) => render(<Harness onAuthFailure={onAuthFailure} />);

beforeEach(() => jest.clearAllMocks());

describe('ConsentQueueBanner', () => {
  it('renders nothing when the queue is empty', async () => {
    mockQueue.mockResolvedValue({ queued: 0, failed: 0 });
    const { container } = renderBanner();
    await waitFor(() => expect(mockQueue).toHaveBeenCalledWith(TOKEN));
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing (and does not throw) when the read fails', async () => {
    mockQueue.mockRejectedValue(new Error('down'));
    const { container } = renderBanner();
    await waitFor(() => expect(mockQueue).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('routes a 401 to onAuthFailure', async () => {
    mockQueue.mockRejectedValue(new AuthFailureError());
    const onAuthFailure = jest.fn();
    renderBanner(onAuthFailure);
    await waitFor(() => expect(onAuthFailure).toHaveBeenCalledTimes(1));
  });

  it('shows queued requests with Resume, which loops dispatch (no batchId) until remaining 0', async () => {
    mockQueue.mockResolvedValueOnce({ queued: 80, failed: 0 }).mockResolvedValue({ queued: 0, failed: 0 });
    mockDispatch
      .mockResolvedValueOnce({ sent: 40, failed: 0, remaining: 40 })
      .mockResolvedValueOnce({ sent: 40, failed: 0, remaining: 0 });
    renderBanner();

    expect(await screen.findByText(/queued and not yet sent/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /resume sending/i }));

    await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(2));
    expect(mockDispatch).toHaveBeenNthCalledWith(1, {}, TOKEN);
    expect(await screen.findByText(/sent 80/i)).toBeInTheDocument();
  });

  it('shows failed requests with Retry failed, which retries then dispatches', async () => {
    mockQueue.mockResolvedValueOnce({ queued: 0, failed: 3 }).mockResolvedValue({ queued: 0, failed: 0 });
    mockRetry.mockResolvedValue({ queued: 3 });
    mockDispatch.mockResolvedValue({ sent: 3, failed: 0, remaining: 0 });
    renderBanner();

    fireEvent.click(await screen.findByRole('button', { name: /retry failed/i }));
    await waitFor(() => expect(mockRetry).toHaveBeenCalledWith({}, TOKEN));
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(1));
  });

  it('has no axe violations when shown', async () => {
    mockQueue.mockResolvedValue({ queued: 2, failed: 1 });
    const { container } = renderBanner();
    await screen.findByRole('button', { name: /resume sending/i });
    expect(await axe(container)).toHaveNoViolations();
  });
});
