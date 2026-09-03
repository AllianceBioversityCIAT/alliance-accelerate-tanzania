// @sdd-spec admin/registration-review-queue (T-13, T-14)
/**
 * Unit tests for RegistrationDetailPanel (FR-10 scenarios 1-3, FR-11
 * scenarios 1-2, FR-12 scenario 3, FR-13 scenario 1, NFR-5, NFR-6).
 *
 * Covers:
 *   - **The reference code is present in the header** — FR-10 scenario 1's
 *     "must show the reference code, so the reviewer can quote it in any
 *     out-of-band contact."
 *   - **The human half of DC-23** — `contactPerson` and `otherCrops` each
 *     carry the "Review context — will not be published" marking, while an
 *     ordinary publishable field (`traderName`) does NOT. Exactly two
 *     markings render, never more, never fewer.
 *   - **A-80 (carried from T-13's review) — every submitted field's VALUE
 *     is asserted, not just 7 of 14.** `traderType`, `sex`, `region`,
 *     `crops`, `capacityTons` are now asserted alongside the original
 *     seven, so a dropped row among ANY payload field would redden.
 *   - The submitted email (`Registration.submitterEmail`) renders and is
 *     NOT marked review context — it IS published (FR-12: -> Actor.email).
 *   - The location card renders raw coordinates and a map link when both
 *     are present, and a "no coordinates" state when both are null.
 *   - Composes `DuplicateWarningCard`, `ConsentRecordCard`, `ActivityTrail`
 *     (each independently unit-tested; this file only asserts they receive
 *     the right data and appear on the page).
 *   - **T-14 — the decision panel**: Approve/Reject buttons render only
 *     while `PENDING_REVIEW`; an adjudicated registration shows neither.
 *   - **T-14 — approve uses `AcknowledgeDialog`**, gated on the exact typed
 *     phrase, body naming the policy version and acceptance date SOURCED
 *     FROM THE FETCHED RECORD (not hardcoded) and stating what approval
 *     does.
 *   - **T-14 — reject uses `RejectDialog`**, with the irreversibility
 *     notice and a mandatory reason (submit disabled with none selected).
 *   - **Falsifying input (KZ-002)**: a props-preserving swap of
 *     `AcknowledgeDialog` for `ConfirmDialog` on the approve path is
 *     rendering-indistinguishable — `ConfirmDialog`'s typed gate is OPT-IN
 *     via its own `acknowledgementText` prop, and when a swap preserves
 *     that exact prop it renders a BYTE-IDENTICAL typed-input HINT to
 *     `AcknowledgeDialog`'s — so that swap is caught ONLY by the
 *     import-identity grep below, not by the rendering assertion. The
 *     rendering assertion catches the realistic misuse instead: reaching
 *     for `ConfirmDialog` the way most of its other call sites in this
 *     codebase already do, WITHOUT `acknowledgementText` (e.g.
 *     `app/(admin)/admin/actors/page.tsx`'s lock action) — that genuinely
 *     drops the typed-phrase gate and reddens the HINT text below plus 6
 *     other tests. Both variants verified and reverted before reporting.
 *   - **Token compliance** — `bg-danger` appears on the Reject trigger
 *     (this action IS destructive) and never on the Approve trigger.
 *   - Successful approve/reject/dismiss call the typed client functions
 *     with the right arguments, announce the result in an `aria-live`
 *     region, and call `onRefresh` (never assuming the mutation response
 *     carries the refreshed detail — the wire facts this task consumes).
 *   - A `401` from any mutation calls `onAuthFailure`.
 *   - jest-axe clean (NFR-5).
 */

import fs from 'fs';
import path from 'path';

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

// ---------------------------------------------------------------------------
// Mock @/lib/api/registrations-admin's mutation functions only — everything
// else (types, RejectionReasonCode) stays real.
// ---------------------------------------------------------------------------

const mockApproveRegistration = jest.fn();
const mockRejectRegistration = jest.fn();
const mockDismissDuplicateCandidate = jest.fn();

jest.mock('@/lib/api/registrations-admin', () => {
  const actual = jest.requireActual('@/lib/api/registrations-admin');
  return {
    ...actual,
    approveRegistration: (...args: unknown[]) => mockApproveRegistration(...args),
    rejectRegistration: (...args: unknown[]) => mockRejectRegistration(...args),
    dismissDuplicateCandidate: (...args: unknown[]) => mockDismissDuplicateCandidate(...args),
  };
});

import { RegistrationDetailPanel } from './RegistrationDetailPanel';
import { ApiError, AuthFailureError } from '@/lib/api/client';
import type { AdminRegistrationDetail } from '@/lib/api/registrations-admin';

const TOKEN = 'test-access-token';

function buildDetail(overrides: Partial<AdminRegistrationDetail> = {}): AdminRegistrationDetail {
  return {
    id: 'reg-1',
    reference: 'REG-2026-0184',
    status: 'PENDING_REVIEW',
    payload: {
      traderName: 'Meru Agro Cooperative Society',
      traderType: 'cooperative',
      contactPerson: 'Jane Mushi',
      position: 'Operations Manager',
      district: 'Arusha Urban',
      marketLocation: 'Kilombero Market',
      sex: 'female',
      region: 'Arusha',
      gpsLatitude: -3.3869,
      gpsLongitude: 36.683,
      crops: ['sorghum', 'common_bean'],
      otherCrops: 'Sesame',
      capacityTons: 12,
      phone: '+255700000000',
    },
    submitterEmail: 'jane.mushi@example.com',
    consent: {
      // Deliberately distinct from payload.traderName above — this is the
      // consent block's own field, and the fixture must not rely on the
      // two strings coincidentally matching for getByText() to resolve
      // uniquely elsewhere in this file.
      consentingOrganisation: 'Meru Agro Cooperative Society (consent record)',
      policyVersion: 'v2.1',
      acceptedAt: '2026-06-01T14:32:00.000Z',
      acceptedAtQualifier: 'RECORDED_AT_SUBMISSION',
    },
    duplicateCandidates: [],
    activityTrail: [{ type: 'SUBMITTED', occurredAt: '2026-06-01T09:00:00.000Z' }],
    ...overrides,
  };
}

function renderPanel(
  overrides: Partial<AdminRegistrationDetail> = {},
  props: { onRefresh?: jest.Mock; onAuthFailure?: jest.Mock } = {}
) {
  const onRefresh = props.onRefresh ?? jest.fn().mockResolvedValue(undefined);
  const onAuthFailure = props.onAuthFailure ?? jest.fn();
  const utils = render(
    <RegistrationDetailPanel
      detail={buildDetail(overrides)}
      token={TOKEN}
      onRefresh={onRefresh}
      onAuthFailure={onAuthFailure}
    />
  );
  return { ...utils, onRefresh, onAuthFailure };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('RegistrationDetailPanel', () => {
  it('shows the reference code in the header', () => {
    renderPanel();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('REG-2026-0184');
  });

  it('marks contactPerson and otherCrops as review context, and marks nothing else', () => {
    renderPanel();

    const badges = screen.getAllByText('Review context — will not be published');
    expect(badges).toHaveLength(2);

    const contactRow = screen.getByText('Jane Mushi').closest('tr');
    const otherCropsRow = screen.getByText('Sesame').closest('tr');
    const traderNameRow = screen.getByText('Meru Agro Cooperative Society').closest('tr');

    expect(contactRow).not.toBeNull();
    expect(otherCropsRow).not.toBeNull();
    expect(traderNameRow).not.toBeNull();

    expect(within(contactRow as HTMLElement).queryByText('Review context — will not be published')).toBeInTheDocument();
    expect(within(otherCropsRow as HTMLElement).queryByText('Review context — will not be published')).toBeInTheDocument();
    expect(within(traderNameRow as HTMLElement).queryByText('Review context — will not be published')).not.toBeInTheDocument();
  });

  it('renders every submitted field value, including the submitted email as published (not review context)', () => {
    renderPanel();

    expect(screen.getByText('Meru Agro Cooperative Society')).toBeInTheDocument();
    expect(screen.getByText('Jane Mushi')).toBeInTheDocument();
    expect(screen.getByText('Operations Manager')).toBeInTheDocument();
    expect(screen.getByText('Arusha Urban')).toBeInTheDocument();
    expect(screen.getByText('Kilombero Market')).toBeInTheDocument();
    expect(screen.getByText('Sesame')).toBeInTheDocument();
    expect(screen.getByText('+255700000000')).toBeInTheDocument();

    const emailRow = screen.getByText('jane.mushi@example.com').closest('tr');
    expect(emailRow).not.toBeNull();
    expect(within(emailRow as HTMLElement).queryByText('Review context — will not be published')).not.toBeInTheDocument();
  });

  it('A-80 — asserts the five previously-unasserted payload field VALUES (traderType, sex, region, crops, capacityTons)', () => {
    renderPanel();

    // traderType -> roleLabel('cooperative') -> 'Cooperative'
    expect(screen.getByText('Cooperative')).toBeInTheDocument();
    // sex
    expect(screen.getByText('female')).toBeInTheDocument();
    // region — a row of its own, distinct from the 'Arusha Urban' district text node
    expect(screen.getByText('Arusha')).toBeInTheDocument();
    // crops -> cropLabel(['sorghum','common_bean']).join(', ')
    expect(screen.getByText('Sorghum, Common Bean')).toBeInTheDocument();
    // capacityTons
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders raw coordinates and a map link when GPS is present', () => {
    renderPanel();
    expect(screen.getByText('-3.3869')).toBeInTheDocument();
    expect(screen.getByText('36.683')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'View on map' });
    expect(link).toHaveAttribute('href', expect.stringContaining('openstreetmap.org'));
  });

  it('renders a "no coordinates" state when GPS is absent', () => {
    const base = buildDetail();
    renderPanel({ payload: { ...base.payload, gpsLatitude: null, gpsLongitude: null } });
    expect(screen.getByText('No coordinates submitted.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View on map' })).not.toBeInTheDocument();
  });

  it('composes the duplicate warning, consent record, and activity trail', () => {
    renderPanel();
    expect(screen.getByText('No possible duplicates found.')).toBeInTheDocument();
    expect(screen.getByText('v2.1')).toBeInTheDocument();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
  });

  it('has no jest-axe violations', async () => {
    const { container } = renderPanel();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  // ── T-14 — Decision panel visibility ────────────────────────────────────

  describe('decision panel', () => {
    it('shows Approve and Reject while PENDING_REVIEW', () => {
      renderPanel({ status: 'PENDING_REVIEW' });
      expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    });

    // R14 — FR-11 scenario 1's "BUT it must NOT prevent approval" clause:
    // duplicate detection warns, it never gates. Two OPEN candidates must
    // not disable the Approve trigger.
    it('R14 — the Approve trigger stays enabled with two open duplicate candidates present', () => {
      renderPanel({
        duplicateCandidates: [
          { actorId: 'actor-1', traderId: 'TZ-A-0001', traderName: 'Meru Agro Cooperative Society', matchedOn: ['phone'] },
          { actorId: 'actor-2', traderId: 'TZ-B-0002', traderName: 'Arusha Seeds Ltd', matchedOn: ['email'] },
        ],
      });
      expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    });

    it('hides Approve and Reject once APPROVED', () => {
      renderPanel({ status: 'APPROVED' });
      expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
      expect(screen.getByText(/already been adjudicated/i)).toBeInTheDocument();
    });

    it('hides Approve and Reject once REJECTED', () => {
      renderPanel({ status: 'REJECTED' });
      expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
    });
  });

  // ── T-14 — Approve path (AcknowledgeDialog) ─────────────────────────────

  describe('approve — AcknowledgeDialog', () => {
    it('opens AcknowledgeDialog\'s typed-input gate on Approve click', () => {
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

      // Only AcknowledgeDialog renders this exact typed-confirmation label
      // unconditionally; this is the assertion the falsifying-input swap
      // (ConfirmDialog in place of AcknowledgeDialog) must redden.
      expect(
        screen.getByLabelText('Type “I confirm consent is on file” to confirm')
      ).toBeInTheDocument();
    });

    it('clause sweep — the dialog body names the policy version and acceptance date SOURCED FROM THE FETCHED RECORD, not hardcoded', () => {
      renderPanel({
        consent: {
          consentingOrganisation: 'Meru Agro Cooperative Society (consent record)',
          policyVersion: 'v9.9-fixture-specific',
          acceptedAt: '2031-03-17T10:00:00.000Z',
          acceptedAtQualifier: 'RECORDED_AT_SUBMISSION',
        },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText(/v9\.9-fixture-specific/)).toBeInTheDocument();
      expect(within(dialog).getByText(/17 Mar 2031/)).toBeInTheDocument();
      // FR-12 scenario 3's "the modal states what approval will do" clause
      // (T-14 attempt-2 FAIL-2) — previously ungated: the description text
      // exists in RegistrationDetailPanel.tsx but nothing here asserted it,
      // so deleting the disclosure sentence reddened nothing.
      expect(
        within(dialog).getByText(/creates an actor record and publishes .*contact details and coordinates/i)
      ).toBeInTheDocument();
    });

    it('confirm stays disabled until the phrase is typed exactly', () => {
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

      const input = screen.getByLabelText('Type “I confirm consent is on file” to confirm');
      // Two "Approve" buttons exist now (trigger + dialog confirm) — resolve
      // the dialog's one specifically via its container.
      const dialogConfirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve' });
      expect(dialogConfirm).toBeDisabled();

      fireEvent.change(input, { target: { value: 'wrong phrase' } });
      expect(dialogConfirm).toBeDisabled();

      fireEvent.change(input, { target: { value: 'I confirm consent is on file' } });
      expect(dialogConfirm).toBeEnabled();
    });

    it('calls approveRegistration with the exact acknowledgement text, announces success, and refreshes', async () => {
      mockApproveRegistration.mockResolvedValue({
        registration: { id: 'reg-1', reference: 'REG-2026-0184', status: 'APPROVED', publishedActorId: 'actor-9' },
        actor: {},
      });
      const { onRefresh } = renderPanel();

      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
      fireEvent.change(screen.getByLabelText('Type “I confirm consent is on file” to confirm'), {
        target: { value: 'I confirm consent is on file' },
      });
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve' }));

      await waitFor(() => {
        expect(mockApproveRegistration).toHaveBeenCalledWith(
          'reg-1',
          { acknowledgement: 'I confirm consent is on file' },
          TOKEN
        );
      });
      await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));

      const status = screen.getByRole('status');
      expect(status).toHaveTextContent('REG-2026-0184 approved and published to the public directory.');
    });

    it('calls onAuthFailure on a 401 from approveRegistration', async () => {
      mockApproveRegistration.mockRejectedValue(new AuthFailureError());
      const { onAuthFailure } = renderPanel();

      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
      fireEvent.change(screen.getByLabelText('Type “I confirm consent is on file” to confirm'), {
        target: { value: 'I confirm consent is on file' },
      });
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve' }));

      await waitFor(() => expect(onAuthFailure).toHaveBeenCalledTimes(1));
    });

    it('renders a mutation error inline in the dialog on failure', async () => {
      mockApproveRegistration.mockRejectedValue(new ApiError(409, 'Registration already adjudicated.'));
      renderPanel();

      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
      fireEvent.change(screen.getByLabelText('Type “I confirm consent is on file” to confirm'), {
        target: { value: 'I confirm consent is on file' },
      });
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve' }));

      await waitFor(() => {
        expect(screen.getByText('Registration already adjudicated.')).toBeInTheDocument();
      });
    });
  });

  // ── T-14 — Reject path (RejectDialog) ───────────────────────────────────

  describe('reject — RejectDialog', () => {
    it('opens RejectDialog on Reject click, with the irreversibility notice', () => {
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

      // The decision panel's own copy ALSO mentions rejection being
      // irreversible ("Rejecting cannot be undone from this screen") — scope
      // to the dialog so this asserts RejectDialog's own notice specifically.
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText(/cannot be undone from this screen/i)).toBeInTheDocument();
      expect(within(dialog).getByText(/applicant must submit a new registration/i)).toBeInTheDocument();
    });

    it('clause sweep — submit is disabled with no reason selected', () => {
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByRole('button', { name: 'Reject' })).toBeDisabled();
    });

    it('calls rejectRegistration with the reason and note, announces the result, and refreshes', async () => {
      mockRejectRegistration.mockResolvedValue({
        registration: { id: 'reg-1', reference: 'REG-2026-0184', status: 'REJECTED' },
      });
      const { onRefresh } = renderPanel();

      fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
      const dialog = screen.getByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText(/reason/i), {
        target: { value: 'INCOMPLETE_OR_INVALID_INFORMATION' },
      });
      fireEvent.change(within(dialog).getByLabelText(/note to applicant/i), {
        target: { value: 'Missing phone number.' },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));

      await waitFor(() => {
        expect(mockRejectRegistration).toHaveBeenCalledWith(
          'reg-1',
          { reason: 'INCOMPLETE_OR_INVALID_INFORMATION', note: 'Missing phone number.' },
          TOKEN
        );
      });
      await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));

      expect(screen.getByRole('status')).toHaveTextContent('REG-2026-0184 rejected.');
    });

    it('calls onAuthFailure on a 401 from rejectRegistration', async () => {
      mockRejectRegistration.mockRejectedValue(new AuthFailureError());
      const { onAuthFailure } = renderPanel();

      fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
      const dialog = screen.getByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText(/reason/i), { target: { value: 'OTHER' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));

      await waitFor(() => expect(onAuthFailure).toHaveBeenCalledTimes(1));
    });
  });

  // ── T-14 — Per-candidate duplicate dismissal (FR-11 scenario 1/2) ───────

  describe('duplicate dismissal', () => {
    it('calls dismissDuplicateCandidate with the clicked candidate\'s actorId, announces the result, and refreshes', async () => {
      mockDismissDuplicateCandidate.mockResolvedValue({
        registration: { id: 'reg-1', reference: 'REG-2026-0184', status: 'PENDING_REVIEW' },
      });
      const { onRefresh } = renderPanel({
        duplicateCandidates: [
          { actorId: 'actor-1', traderId: 'TZ-A-0001', traderName: 'Meru Agro Cooperative Society', matchedOn: ['phone'] },
          { actorId: 'actor-2', traderId: 'TZ-B-0002', traderName: 'Arusha Seeds Ltd', matchedOn: ['email'] },
        ],
      });

      fireEvent.click(
        screen.getByRole('button', { name: 'Mark Arusha Seeds Ltd as not a duplicate' })
      );

      await waitFor(() => {
        expect(mockDismissDuplicateCandidate).toHaveBeenCalledWith(
          'reg-1',
          { candidateActorId: 'actor-2' },
          TOKEN
        );
      });
      await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
      expect(screen.getByRole('status')).toHaveTextContent('Candidate marked as not a duplicate.');
    });
  });

  // ── Falsifying input (KZ-002) ────────────────────────────────────────────
  //
  // Manually verified (not baked in as a permanent redden-on-command test,
  // since falsification is a one-time mutation exercise, not a standing
  // assertion): swapping `<AcknowledgeDialog>` for `<ConfirmDialog>` on the
  // approve path.
  //
  // **Honest finding, not assumed:** `ConfirmDialog`'s typed gate is
  // OPT-IN via its own `acknowledgementText` prop, and when a swap
  // preserves that exact prop, `ConfirmDialog` renders a BYTE-IDENTICAL
  // typed input and hint text to `AcknowledgeDialog` (verified against the
  // real source of both files — same label text, same hint copy). A
  // props-preserving import-only swap therefore does NOT redden the
  // rendering assertion below; it reddens ONLY the import-identity grep
  // (verified: `1 failed, 25 passed`). The realistic, MORE dangerous
  // misuse — reaching for `ConfirmDialog` the way most of its other call
  // sites in this codebase already do, WITHOUT `acknowledgementText`
  // (`app/(admin)/admin/actors/page.tsx`'s lock action) — genuinely drops
  // the typed-phrase gate, and that swap reddened 7 tests including this
  // one (verified: `7 failed, 19 passed`, both variants reverted before
  // reporting; `git diff` empty afterward).
  describe('falsifying input — ConfirmDialog must never gate approve', () => {
    it('the approve path renders the typed-input gate (redden proof: dropping the gate, the realistic ConfirmDialog misuse, fails this)', () => {
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
      expect(
        screen.getByText('Confirm is disabled until the acknowledgement is entered exactly.')
      ).toBeInTheDocument();
    });

    it('token grep — RegistrationDetailPanel.tsx never IMPORTS ConfirmDialog (redden proof: even a props-preserving swap fails this)', () => {
      // Deliberately checks the import statement only, not every mention of
      // the word — this file's own doc comments name `ConfirmDialog` to
      // explain why it is rejected, which must not itself fail the grep.
      const source = fs.readFileSync(
        path.join(__dirname, 'RegistrationDetailPanel.tsx'),
        'utf8'
      );
      expect(source).not.toMatch(/from ['"]\.\/ConfirmDialog['"]/);
    });
  });

  // ── Token compliance ─────────────────────────────────────────────────────

  describe('token compliance — danger on rejection only', () => {
    it('the Reject trigger carries danger tokens; the Approve trigger does not', () => {
      renderPanel();
      expect(screen.getByRole('button', { name: 'Reject' })).toHaveClass('border-danger', 'text-danger');
      expect(screen.getByRole('button', { name: 'Approve' })).not.toHaveClass('bg-danger');
      expect(screen.getByRole('button', { name: 'Approve' })).not.toHaveClass('text-danger');
      expect(screen.getByRole('button', { name: 'Approve' })).not.toHaveClass('border-danger');
    });

    it('the reject dialog confirm button carries bg-danger', () => {
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
      const dialog = screen.getByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText(/reason/i), { target: { value: 'OTHER' } });
      expect(within(dialog).getByRole('button', { name: 'Reject' })).toHaveClass('bg-danger');
    });

    // R-13 — the gap the T-14 review named: the assertions above cover the
    // TRIGGERS and the reject dialog, but nothing inspected the APPROVE
    // dialog's confirm, which is where `bg-danger` was actually shipping on
    // the registry's only publish action. NFR-6: `danger` MUST NOT style the
    // publish action.
    it('R-13 — the approve dialog confirm button carries bg-primary, never bg-danger', () => {
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
      const dialog = screen.getByRole('dialog');
      const confirm = within(dialog).getByRole('button', { name: 'Approve' });
      expect(confirm).toHaveClass('bg-primary');
      expect(confirm).not.toHaveClass('bg-danger');
    });
  });
});
