// @sdd-spec actors/consent-intake/consent-request-email (T-9)
/**
 * The loop tests deliberately return `remaining > 0` for the early steps — a
 * mock that answers `remaining: 0` on the first call cannot tell a loop from
 * a one-shot call (task disqualifier).
 */

import { act, renderHook, waitFor } from '@testing-library/react';

const mockDispatch = jest.fn();
const mockRetry = jest.fn();

jest.mock('@/lib/api/consent-requests-admin', () => ({
  dispatchConsentRequests: (...a: unknown[]) => mockDispatch(...a),
  retryConsentRequests: (...a: unknown[]) => mockRetry(...a),
}));
jest.mock('@/lib/api/client', () => {
  class AuthFailureError extends Error {}
  return { AuthFailureError };
});

import { useConsentDispatch, MAX_STALLED_STEPS } from './useConsentDispatch';
import { AuthFailureError } from '@/lib/api/client';

const TOKEN = 't';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useConsentDispatch', () => {
  it('keeps dispatching until remaining reaches 0, accumulating sent/failed', async () => {
    mockDispatch
      .mockResolvedValueOnce({ sent: 10, failed: 1, remaining: 20 })
      .mockResolvedValueOnce({ sent: 10, failed: 0, remaining: 10 })
      .mockResolvedValueOnce({ sent: 9, failed: 1, remaining: 0 });
    const { result } = renderHook(() => useConsentDispatch({ token: TOKEN }));

    await act(async () => {
      await result.current.start({ batchId: 'b1', initialRemaining: 41 });
    });

    expect(mockDispatch).toHaveBeenCalledTimes(3);
    expect(mockDispatch).toHaveBeenCalledWith({ batchId: 'b1' }, TOKEN);
    expect(result.current.state).toEqual({ phase: 'done', sent: 29, failed: 2, remaining: 0 });
  });

  it('omits batchId when resuming across all batches', async () => {
    mockDispatch.mockResolvedValueOnce({ sent: 1, failed: 0, remaining: 0 });
    const { result } = renderHook(() => useConsentDispatch({ token: TOKEN }));
    await act(async () => {
      await result.current.start();
    });
    expect(mockDispatch).toHaveBeenCalledWith({}, TOKEN);
  });

  it('never has two dispatch calls in flight, and ignores a second start while running', async () => {
    let release: (v: unknown) => void = () => undefined;
    let inFlight = 0;
    let maxInFlight = 0;
    mockDispatch.mockImplementation(
      () =>
        new Promise((resolve) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          release = (v) => {
            inFlight -= 1;
            resolve(v);
          };
        }),
    );
    const { result } = renderHook(() => useConsentDispatch({ token: TOKEN }));

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.start({ initialRemaining: 2 });
      void result.current.start({ initialRemaining: 2 }); // ignored
    });
    expect(mockDispatch).toHaveBeenCalledTimes(1);

    await act(async () => {
      release({ sent: 1, failed: 0, remaining: 1 });
    });
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(2));
    await act(async () => {
      release({ sent: 1, failed: 0, remaining: 0 });
      await first;
    });
    expect(maxInFlight).toBe(1);
  });

  it('stops on unmount: the in-flight step finishes but no further call is made', async () => {
    let release: (v: unknown) => void = () => undefined;
    mockDispatch.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    const { result, unmount } = renderHook(() => useConsentDispatch({ token: TOKEN }));

    act(() => {
      void result.current.start({ initialRemaining: 50 });
    });
    expect(mockDispatch).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      release({ sent: 5, failed: 0, remaining: 45 });
    });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it('retryFailed calls retry, then the dispatch loop, keeping the sent total', async () => {
    mockDispatch.mockResolvedValueOnce({ sent: 47, failed: 3, remaining: 0 });
    const { result } = renderHook(() => useConsentDispatch({ token: TOKEN }));
    await act(async () => {
      await result.current.start({ batchId: 'b1', initialRemaining: 50 });
    });

    mockRetry.mockResolvedValueOnce({ queued: 3 });
    mockDispatch.mockResolvedValueOnce({ sent: 2, failed: 1, remaining: 0 });
    await act(async () => {
      await result.current.retryFailed({ batchId: 'b1' });
    });

    expect(mockRetry).toHaveBeenCalledWith({ batchId: 'b1' }, TOKEN);
    expect(mockRetry.mock.invocationCallOrder[0]).toBeLessThan(mockDispatch.mock.invocationCallOrder[1]);
    expect(result.current.state).toEqual({ phase: 'done', sent: 49, failed: 1, remaining: 0 });
  });

  it('a retry that re-queues nothing settles with no dispatch', async () => {
    mockRetry.mockResolvedValueOnce({ queued: 0 });
    const { result } = renderHook(() => useConsentDispatch({ token: TOKEN }));
    await act(async () => {
      await result.current.retryFailed();
    });
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(result.current.state.phase).toBe('done');
  });

  it('ends with an error (not a spin) after repeated steps that make no progress', async () => {
    mockDispatch.mockResolvedValue({ sent: 0, failed: 0, remaining: 9 });
    const { result } = renderHook(() => useConsentDispatch({ token: TOKEN }));
    await act(async () => {
      await result.current.start({ initialRemaining: 9 });
    });
    expect(mockDispatch).toHaveBeenCalledTimes(MAX_STALLED_STEPS);
    expect(result.current.state.phase).toBe('error');
    expect(result.current.state.remaining).toBe(9);
  });

  it('surfaces an API error, keeping the counts so far', async () => {
    mockDispatch
      .mockResolvedValueOnce({ sent: 4, failed: 0, remaining: 6 })
      .mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useConsentDispatch({ token: TOKEN }));
    await act(async () => {
      await result.current.start({ initialRemaining: 10 });
    });
    expect(result.current.state).toMatchObject({ phase: 'error', sent: 4, error: 'boom' });
  });

  it('routes a 401 to onAuthFailure instead of an error state', async () => {
    mockDispatch.mockRejectedValueOnce(new AuthFailureError());
    const onAuthFailure = jest.fn();
    const { result } = renderHook(() => useConsentDispatch({ token: TOKEN, onAuthFailure }));
    await act(async () => {
      await result.current.start({ initialRemaining: 3 });
    });
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
    expect(result.current.state.phase).toBe('running');
  });
});
