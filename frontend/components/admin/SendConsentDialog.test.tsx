// @sdd-spec actors/consent-intake/consent-request-email (T-9)
import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

const mockPreview = jest.fn();
const mockEnqueue = jest.fn();
const mockDispatch = jest.fn();
const mockRetry = jest.fn();

jest.mock('@/lib/api/consent-requests-admin', () => ({
  previewConsentRequests: (...a: unknown[]) => mockPreview(...a),
  enqueueConsentRequests: (...a: unknown[]) => mockEnqueue(...a),
  dispatchConsentRequests: (...a: unknown[]) => mockDispatch(...a),
  retryConsentRequests: (...a: unknown[]) => mockRetry(...a),
}));
jest.mock('@/lib/api/client', () => {
  class AuthFailureError extends Error {}
  return { AuthFailureError };
});

import { SendConsentDialog } from './SendConsentDialog';
import { useConsentDispatch } from '@/lib/admin/useConsentDispatch';
import { AuthFailureError } from '@/lib/api/client';
import type { ConsentRequestTarget } from '@/lib/api/consent-requests-admin';

const TOKEN = 't';
const NONE = { no_email: 0, granted: 0, pending_request: 0, declined: 0 };
const IDS: ConsentRequestTarget = { kind: 'ids', ids: ['a', 'b', 'c', 'd', 'e'] };

/** Stands in for the page: ONE dispatch owner handed to the dialog. */
function Harness(props: Omit<React.ComponentProps<typeof SendConsentDialog>, 'dispatch'>) {
  const dispatch = useConsentDispatch({ token: props.token, onAuthFailure: props.onAuthFailure });
  return <SendConsentDialog {...props} dispatch={dispatch} />;
}

function renderDialog(
  props: Partial<React.ComponentProps<typeof SendConsentDialog>> = {},
) {
  const onClose = jest.fn();
  const onAuthFailure = jest.fn();
  const utils = render(
    <Harness
      target={IDS}
      expectedCount={5}
      token={TOKEN}
      onClose={onClose}
      onAuthFailure={onAuthFailure}
      {...props}
    />,
  );
  return { ...utils, onClose, onAuthFailure };
}

const confirmed = async () => screen.findByRole('button', { name: /^Send \d+ requests?$/ });

beforeEach(() => jest.clearAllMocks());

describe('SendConsentDialog — preview and confirm', () => {
  it('previews on open with scope bulk and shows N to send plus skips by reason', async () => {
    mockPreview.mockResolvedValue({
      total: 5,
      toSend: 1,
      skipped: { no_email: 1, granted: 1, pending_request: 1, declined: 1 },
    });
    renderDialog();

    await confirmed();
    expect(mockPreview).toHaveBeenCalledWith({ target: IDS, scope: 'bulk' }, TOKEN);
    expect(screen.getByText('No email address on file')).toBeInTheDocument();
    expect(screen.getByText('Consent already granted')).toBeInTheDocument();
    expect(screen.getByText('A request is already pending')).toBeInTheDocument();
    expect(screen.getByText('Declined their last request')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send 1 request' })).toBeEnabled();
    expect(mockEnqueue).not.toHaveBeenCalled(); // nothing sent before confirm
  });

  it('nothing eligible: send is disabled and the breakdown is shown', async () => {
    mockPreview.mockResolvedValue({ total: 5, toSend: 0, skipped: { ...NONE, granted: 3, no_email: 2 } });
    renderDialog();

    await confirmed();
    expect(screen.getByRole('button', { name: /send 0 requests/i })).toBeDisabled();
    expect(screen.getByText(/nobody in this selection can be sent a request/i)).toBeInTheDocument();
    expect(screen.getByText('Consent already granted')).toBeInTheDocument();
    expect(screen.getByText('No email address on file')).toBeInTheDocument();
  });

  it('shows a neutral note when selected actors no longer exist', async () => {
    mockPreview.mockResolvedValue({ total: 3, toSend: 3, skipped: NONE });
    renderDialog({ expectedCount: 5 });
    expect(await screen.findByText(/2 selected actors no longer exist/i)).toBeInTheDocument();
  });

  it('shows a neutral note when a filter target matches a different count than selected', async () => {
    mockPreview.mockResolvedValue({ total: 138, toSend: 100, skipped: NONE });
    renderDialog({ target: { kind: 'filter', filter: { region: 'Arusha' } }, expectedCount: 140 });
    expect(await screen.findByText(/140 actors when you selected, 138 now/i)).toBeInTheDocument();
  });

  it('shows no note when counts agree', async () => {
    mockPreview.mockResolvedValue({ total: 5, toSend: 5, skipped: NONE });
    renderDialog();
    await confirmed();
    expect(screen.queryByText(/no longer exist|when you selected/i)).not.toBeInTheDocument();
  });

  it('a failed preview shows the error and sends nothing', async () => {
    mockPreview.mockRejectedValue(new Error('preview exploded'));
    renderDialog();
    expect(await screen.findByRole('alert')).toHaveTextContent('preview exploded');
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('routes a 401 from preview to onAuthFailure', async () => {
    mockPreview.mockRejectedValue(new AuthFailureError());
    const { onAuthFailure } = renderDialog();
    await waitFor(() => expect(onAuthFailure).toHaveBeenCalledTimes(1));
  });

  it('Escape and Cancel close the dialog', async () => {
    mockPreview.mockResolvedValue({ total: 5, toSend: 5, skipped: NONE });
    const { onClose } = renderDialog();
    await confirmed();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('SendConsentDialog — progress and result', () => {
  beforeEach(() => {
    mockPreview.mockResolvedValue({ total: 50, toSend: 50, skipped: { ...NONE, granted: 2 } });
    mockEnqueue.mockResolvedValue({ batchId: 'batch-1', queued: 50, skipped: { ...NONE, granted: 2 } });
  });

  it('enqueues with scope bulk, loops until remaining 0, then reports sent / skipped / failed', async () => {
    mockDispatch
      .mockResolvedValueOnce({ sent: 30, failed: 2, remaining: 18 })
      .mockResolvedValueOnce({ sent: 17, failed: 1, remaining: 0 });
    renderDialog();
    await confirmed();
    fireEvent.click(screen.getByRole('button', { name: 'Send 50 requests' }));

    expect(await screen.findByRole('heading', { name: /consent requests sent/i })).toBeInTheDocument();
    expect(mockEnqueue).toHaveBeenCalledWith({ target: IDS, scope: 'bulk' }, TOKEN);
    expect(mockDispatch).toHaveBeenCalledTimes(2);
    expect(mockDispatch).toHaveBeenCalledWith({ batchId: 'batch-1' }, TOKEN);
    expect(screen.getByText('Sent').nextSibling).toHaveTextContent('47');
    expect(screen.getByText('Failed').nextSibling).toHaveTextContent('3');
    expect(screen.getByText('Skipped').nextSibling).toHaveTextContent('2');
  });

  it('announces progress in an aria-live polite region', async () => {
    let release: (v: unknown) => void = () => undefined;
    mockDispatch.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    renderDialog();
    await confirmed();
    fireEvent.click(screen.getByRole('button', { name: 'Send 50 requests' }));

    const live = await screen.findByText(/sent 0 · failed 0 · remaining 50/i);
    expect(live).toHaveAttribute('aria-live', 'polite');
    await act(async () => {
      release({ sent: 50, failed: 0, remaining: 0 });
    });
  });

  it('result 47 sent / 3 failed offers Retry failed, which calls retry then dispatch', async () => {
    mockDispatch.mockResolvedValueOnce({ sent: 47, failed: 3, remaining: 0 });
    renderDialog();
    await confirmed();
    fireEvent.click(screen.getByRole('button', { name: 'Send 50 requests' }));
    const retryButton = await screen.findByRole('button', { name: 'Retry failed' });

    mockRetry.mockResolvedValueOnce({ queued: 3 });
    mockDispatch.mockResolvedValueOnce({ sent: 3, failed: 0, remaining: 0 });
    fireEvent.click(retryButton);

    await waitFor(() => expect(mockRetry).toHaveBeenCalledWith({ batchId: 'batch-1' }, TOKEN));
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(2));
    expect(mockRetry.mock.invocationCallOrder[0]).toBeLessThan(mockDispatch.mock.invocationCallOrder[1]);
    await waitFor(() => expect(screen.getByText('Sent').nextSibling).toHaveTextContent('50'));
    expect(screen.queryByRole('button', { name: 'Retry failed' })).not.toBeInTheDocument();
  });

  it('offers no Retry failed when nothing failed', async () => {
    mockDispatch.mockResolvedValueOnce({ sent: 50, failed: 0, remaining: 0 });
    renderDialog();
    await confirmed();
    fireEvent.click(screen.getByRole('button', { name: 'Send 50 requests' }));
    await screen.findByRole('heading', { name: /consent requests sent/i });
    expect(screen.queryByRole('button', { name: 'Retry failed' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('skips straight to the result when the server queued nothing', async () => {
    mockEnqueue.mockResolvedValue({ batchId: 'b0', queued: 0, skipped: { ...NONE, granted: 50 } });
    renderDialog();
    await confirmed();
    fireEvent.click(screen.getByRole('button', { name: 'Send 50 requests' }));
    await screen.findByRole('heading', { name: /consent requests sent/i });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('an enqueue failure shows the error and keeps the confirm step', async () => {
    mockEnqueue.mockRejectedValue(new Error('enqueue exploded'));
    renderDialog();
    await confirmed();
    fireEvent.click(screen.getByRole('button', { name: 'Send 50 requests' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('enqueue exploded');
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe('SendConsentDialog — accessibility (jest-axe, NFR-10)', () => {
  it('has no violations at preview, confirm, nothing-eligible, progress and result', async () => {
    mockPreview.mockResolvedValueOnce({ total: 5, toSend: 3, skipped: { ...NONE, granted: 2 } });
    const first = renderDialog();
    expect(await axe(first.container)).toHaveNoViolations(); // previewing
    await confirmed();
    expect(await axe(first.container)).toHaveNoViolations(); // confirm
    first.unmount();

    mockPreview.mockResolvedValueOnce({ total: 5, toSend: 0, skipped: { ...NONE, granted: 5 } });
    const none = renderDialog();
    await confirmed();
    expect(await axe(none.container)).toHaveNoViolations(); // nothing eligible
    none.unmount();

    mockPreview.mockResolvedValueOnce({ total: 5, toSend: 5, skipped: NONE });
    mockEnqueue.mockResolvedValueOnce({ batchId: 'b', queued: 5, skipped: NONE });
    let release: (v: unknown) => void = () => undefined;
    mockDispatch.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    const run = renderDialog();
    await confirmed();
    fireEvent.click(screen.getByRole('button', { name: 'Send 5 requests' }));
    await screen.findByText(/remaining 5/i);
    expect(await axe(run.container)).toHaveNoViolations(); // progress
    await act(async () => {
      release({ sent: 3, failed: 2, remaining: 0 });
    });
    await screen.findByRole('button', { name: 'Retry failed' });
    expect(await axe(run.container)).toHaveNoViolations(); // result with retry
  });
});
