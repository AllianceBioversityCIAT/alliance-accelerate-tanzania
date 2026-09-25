// @sdd-spec auth/account-access-emails (T-7)
/**
 * Unit tests for CredentialHandoff — the send-status line and the retired
 * "not by email" copy (auth/account-access-emails FR-2, FR-3).
 *
 * Covers:
 *   - FR-2 "AND IT MUST": the temporary password renders whether or not the
 *     email was sent (both `emailSent` branches).
 *   - FR-3 "Sent" scenario: the view states the invitation was emailed.
 *   - FR-3 "Not sent" scenario + its "BUT it must NOT" clause: the view
 *     states the email could not be sent and that the password must be
 *     shared directly, WITHOUT reading as a failure to create/reset the user.
 *   - The retired string ("... Share it securely (not by email) ...") no
 *     longer appears in either branch.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import { CredentialHandoff } from './CredentialHandoff';

const BASE_PROPS = {
  email: 'new-user@example.com',
  temporaryPassword: 'Tmp!CH-Fixture-1',
  title: 'User created — share these credentials',
  onDone: jest.fn(),
};

describe('CredentialHandoff — FR-2: password shown regardless of send status', () => {
  it('shows the temporary password when the email WAS sent', () => {
    render(<CredentialHandoff {...BASE_PROPS} emailSent />);
    expect(screen.getByText('Tmp!CH-Fixture-1')).toBeInTheDocument();
  });

  it('shows the temporary password when the email was NOT sent', () => {
    render(<CredentialHandoff {...BASE_PROPS} emailSent={false} />);
    expect(screen.getByText('Tmp!CH-Fixture-1')).toBeInTheDocument();
  });
});

describe('CredentialHandoff — FR-3: sent scenario', () => {
  it('states that the invitation was emailed when emailSent is true', () => {
    render(<CredentialHandoff {...BASE_PROPS} emailSent />);
    expect(screen.getByText(/was sent to the user/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not be sent/i)).not.toBeInTheDocument();
  });
});

describe('CredentialHandoff — FR-3: not-sent scenario (and its negative clause)', () => {
  it('states the email could not be sent and that the password must be shared directly', () => {
    render(<CredentialHandoff {...BASE_PROPS} emailSent={false} />);
    expect(screen.getByText(/could not be sent/i)).toBeInTheDocument();
    expect(screen.getByText(/share this password with the user directly/i)).toBeInTheDocument();
  });

  it('does NOT present the failure as a failure to create/reset the user', () => {
    render(<CredentialHandoff {...BASE_PROPS} emailSent={false} />);
    // The password itself is still visible (this did not fail).
    expect(screen.getByText('Tmp!CH-Fixture-1')).toBeInTheDocument();

    // Strong form: assert over the FULL rendered text content of the status
    // `role="note"` region (the first of the two note regions in this
    // branch — the second is the persistent "shown only once" note),
    // rather than an enumerated phrase blacklist. An enumerated blacklist
    // (`/failed to create/i`, `/failed to reset/i`, ...) only reddens for
    // phrasing it anticipated — e.g. it would PASS a rewrite reading
    // "Account setup incomplete", which is exactly as much a creation/reset
    // framing as the phrases the blacklist enumerates. Asserting the exact,
    // known-good sentence instead reddens for ANY divergence, anticipated
    // or not — mirroring T-5's `not.toContain('@')` guard, which catches
    // any email address rather than an enumerated list of examples.
    const [statusNote] = screen.getAllByRole('note');
    expect(statusNote.textContent).toBe(
      'The email could not be sent — this did not affect the account. Share this password with the user directly.',
    );

    // Belt-and-braces: keep the enumerated checks too, but they no longer
    // carry the clause alone.
    expect(screen.queryByText(/failed to create/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/failed to reset/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/user was not created/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/account.* not.*created/i)).not.toBeInTheDocument();
  });
});

describe('CredentialHandoff — retired copy', () => {
  it('never renders the retired "(not by email)" instruction, in either branch', () => {
    const { unmount } = render(<CredentialHandoff {...BASE_PROPS} emailSent />);
    expect(screen.queryByText(/not by email/i)).not.toBeInTheDocument();
    unmount();

    render(<CredentialHandoff {...BASE_PROPS} emailSent={false} />);
    expect(screen.queryByText(/not by email/i)).not.toBeInTheDocument();
  });

  it('still shows the persistent "shown only once" note in both branches', () => {
    const { unmount } = render(<CredentialHandoff {...BASE_PROPS} emailSent />);
    expect(screen.getByText(/shown only once/i)).toBeInTheDocument();
    unmount();

    render(<CredentialHandoff {...BASE_PROPS} emailSent={false} />);
    expect(screen.getByText(/shown only once/i)).toBeInTheDocument();
  });
});
