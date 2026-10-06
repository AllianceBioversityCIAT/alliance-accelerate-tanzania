// @sdd-spec actors/consent-intake/consent-request-email (validation R-A: C-17, C-150)
/**
 * SendConsentPrompt — the post-create send prompt, state by state.
 *   C-17 / FR-3: a clean send CONFIRMS before navigating; queued 0 says why.
 *   C-150 / NFR-10: axe-clean in every state, and focus never drops to <body>.
 */

import React from 'react';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { AdminActorCreateResult } from '@/lib/api/actors-admin';
import { useConsentDispatch } from '@/lib/admin/useConsentDispatch';
import { SendConsentPrompt } from './SendConsentPrompt';

expect.extend(toHaveNoViolations);

const mockEnqueue = jest.fn();
const mockDispatch = jest.fn();
jest.mock('@/lib/api/consent-requests-admin', () => ({
  enqueueConsentRequests: (...args: unknown[]) => mockEnqueue(...args),
  dispatchConsentRequests: (...args: unknown[]) => mockDispatch(...args),
  retryConsentRequests: jest.fn(),
}));

const ACTOR = {
  id: 'actor-1',
  traderId: 'TM-2026-0001',
  email: 'kilimo@example.com',
  consentStatus: 'UNKNOWN',
  duplicateWarnings: [],
} as unknown as AdminActorCreateResult;

const NO_SKIPS = { no_email: 0, granted: 0, pending_request: 0, declined: 0 };

const onDone = jest.fn();
const onAuthFailure = jest.fn();

function Harness() {
  const dispatch = useConsentDispatch({ token: 't' });
  return (
    <SendConsentPrompt
      actor={ACTOR}
      token="t"
      dispatch={dispatch}
      onDone={onDone}
      onAuthFailure={onAuthFailure}
    />
  );
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnqueue.mockResolvedValue({ batchId: 'b1', queued: 1, skipped: NO_SKIPS });
  mockDispatch.mockResolvedValue({ sent: 1, failed: 0, remaining: 0 });
});

const sendButton = () => screen.getByRole('button', { name: /^send$/i });

describe('SendConsentPrompt — confirmation (C-17, FR-3)', () => {
  it('a clean send confirms with the email in a status region and does NOT navigate until Continue', async () => {
    render(<Harness />);
    fireEvent.click(sendButton());

    const status = await screen.findByText('Consent request sent to kilimo@example.com.');
    expect(screen.getByRole('status')).toContainElement(status);
    expect(onDone).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /continue to actors/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('queued 0 (server skipped the actor) says why instead of navigating silently', async () => {
    mockEnqueue.mockResolvedValue({
      batchId: 'b1',
      queued: 0,
      skipped: { ...NO_SKIPS, pending_request: 1 },
    });
    render(<Harness />);
    fireEvent.click(sendButton());

    expect(await screen.findByText(/no consent request was sent/i)).toHaveTextContent(
      'A request is already pending',
    );
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /continue to actors/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('a failed send says Retry (the row is FAILED), not resume, and offers Continue', async () => {
    mockDispatch.mockResolvedValue({ sent: 0, failed: 1, remaining: 0 });
    render(<Harness />);
    fireEvent.click(sendButton());

    const message = await screen.findByText(/could not be sent/i);
    expect(message).toHaveTextContent(/retry/i);
    expect(message).not.toHaveTextContent(/resume/i);
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /continue to actors/i })).toBeInTheDocument();
  });

  it('a dispatch that errors keeps the resume guidance AND shows the error as detail', async () => {
    mockDispatch.mockRejectedValue(new Error('Mail service unreachable'));
    render(<Harness />);
    fireEvent.click(sendButton());

    const status = screen.getByRole('status');
    await waitFor(() => expect(status).toHaveTextContent(/resume it from actors/i));
    expect(status).toHaveTextContent('Mail service unreachable');
  });

  it('Not now sends nothing and navigates', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /not now/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

describe('SendConsentPrompt — focus and accessibility (C-150, NFR-10)', () => {
  it('keeps focus inside the dialog while sending, and a second activation sends nothing more', async () => {
    const gate = deferred<{ sent: number; failed: number; remaining: number }>();
    mockDispatch.mockReturnValue(gate.promise);
    render(<Harness />);
    await waitFor(() => expect(sendButton()).toHaveFocus());

    fireEvent.click(sendButton());
    await screen.findByText(/sending the consent request/i);

    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).not.toBe(document.body);
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    // A natively disabled button drops focus to <body> in real browsers (jsdom keeps it).
    expect(document.activeElement).not.toBeDisabled();
    fireEvent.click(sendButton());
    expect(mockEnqueue).toHaveBeenCalledTimes(1);

    await act(async () => gate.resolve({ sent: 1, failed: 0, remaining: 0 }));
  });

  it('moves focus to Continue when the send completes', async () => {
    render(<Harness />);
    fireEvent.click(sendButton());
    const cont = await screen.findByRole('button', { name: /continue to actors/i });
    await waitFor(() => expect(cont).toHaveFocus());
  });

  it('moves focus to Continue on a failed send', async () => {
    mockDispatch.mockResolvedValue({ sent: 0, failed: 1, remaining: 0 });
    render(<Harness />);
    fireEvent.click(sendButton());
    const cont = await screen.findByRole('button', { name: /continue to actors/i });
    await waitFor(() => expect(cont).toHaveFocus());
  });

  it('has no axe violations in the question state', async () => {
    const { container } = render(<Harness />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations while sending', async () => {
    mockDispatch.mockReturnValue(new Promise(() => undefined));
    const { container } = render(<Harness />);
    fireEvent.click(sendButton());
    await screen.findByText(/sending the consent request/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations in the confirmation state', async () => {
    const { container } = render(<Harness />);
    fireEvent.click(sendButton());
    await screen.findByText(/consent request sent to/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations in the failure state', async () => {
    mockDispatch.mockResolvedValue({ sent: 0, failed: 1, remaining: 0 });
    const { container } = render(<Harness />);
    fireEvent.click(sendButton());
    await screen.findByText(/could not be sent/i);
    expect(await axe(container)).toHaveNoViolations();
  });
});
