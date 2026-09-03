// @sdd-spec admin/registration-review-queue (T-14)
/**
 * Unit tests for RejectDialog (FR-13 scenario 1, FR-11 scenario 3, NFR-5,
 * NFR-6).
 *
 * Covers:
 *   - Nothing renders when `open` is false.
 *   - The reason `<select>` offers all five `RejectionReasonCode` members,
 *     including "Duplicate of an existing registry record" (FR-11
 *     scenario 3 — a first-class, structured reason).
 *   - **Clause sweep — the reason is mandatory**: Reject stays disabled
 *     with no reason selected, and enables once one is chosen.
 *   - **Clause sweep — the irreversibility notice**: the exact "cannot be
 *     undone from this screen" / "must submit a new registration" text is
 *     present.
 *   - Confirming calls `onConfirm` with the selected `reason` and the
 *     literal note text — including an untouched, still-empty note sent as
 *     `''`, never trimmed to `undefined` client-side (the carried T-9
 *     empty-string-note obligation).
 *   - Cancel and Escape both call `onCancel` without calling `onConfirm`.
 *   - Inline error renders in a `role="alert"` live region.
 *   - **Token compliance**: the confirm button carries `bg-danger` (this
 *     dialog's action IS destructive/terminal — the reverse of the approve
 *     path, where `danger` must NOT appear).
 *   - jest-axe clean (NFR-5).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

import { RejectDialog } from './RejectDialog';

const REFERENCE = 'REG-2026-0184';

function noop() {
  /* no-op */
}

describe('RejectDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <RejectDialog open={false} reference={REFERENCE} onConfirm={noop} onCancel={noop} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('offers all five rejection reasons, including the duplicate reason (FR-11 scenario 3)', () => {
    render(<RejectDialog open reference={REFERENCE} onConfirm={noop} onCancel={noop} />);
    const select = screen.getByLabelText(/reason/i);
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);

    expect(options).toEqual([
      'Select a reason…',
      'Duplicate of an existing registry record',
      'Incomplete or invalid information',
      'Not a seed-system actor',
      'Unable to verify contact details',
      'Other',
    ]);
  });

  it('clause sweep — makes the reason mandatory: Reject is disabled with no reason selected', () => {
    render(<RejectDialog open reference={REFERENCE} onConfirm={noop} onCancel={noop} />);
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
  });

  it('enables Reject once a reason is selected', () => {
    render(<RejectDialog open reference={REFERENCE} onConfirm={noop} onCancel={noop} />);
    fireEvent.change(screen.getByLabelText(/reason/i), {
      target: { value: 'INCOMPLETE_OR_INVALID_INFORMATION' },
    });
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });

  it('clause sweep — states that rejection cannot be undone and the applicant must submit again', () => {
    render(<RejectDialog open reference={REFERENCE} onConfirm={noop} onCancel={noop} />);
    expect(
      screen.getByText(/cannot be undone from this screen/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/applicant must submit a new registration/i)
    ).toBeInTheDocument();
  });

  it('confirms with the selected reason and a still-empty note sent as \'\', never omitted', () => {
    const onConfirm = jest.fn();
    render(<RejectDialog open reference={REFERENCE} onConfirm={onConfirm} onCancel={noop} />);

    fireEvent.change(screen.getByLabelText(/reason/i), {
      target: { value: 'DUPLICATE_OF_EXISTING_RECORD' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(onConfirm).toHaveBeenCalledWith({ reason: 'DUPLICATE_OF_EXISTING_RECORD', note: '' });
  });

  it('confirms with the literal typed note text, untrimmed', () => {
    const onConfirm = jest.fn();
    render(<RejectDialog open reference={REFERENCE} onConfirm={onConfirm} onCancel={noop} />);

    fireEvent.change(screen.getByLabelText(/reason/i), {
      target: { value: 'OTHER' },
    });
    fireEvent.change(screen.getByLabelText(/note to applicant/i), {
      target: { value: '  please resubmit with a valid phone number  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(onConfirm).toHaveBeenCalledWith({
      reason: 'OTHER',
      note: '  please resubmit with a valid phone number  ',
    });
  });

  it('does not confirm on a click while no reason is selected', () => {
    const onConfirm = jest.fn();
    render(<RejectDialog open reference={REFERENCE} onConfirm={onConfirm} onCancel={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('resets the reason and note each time the dialog re-opens', () => {
    const { rerender } = render(
      <RejectDialog open reference={REFERENCE} onConfirm={noop} onCancel={noop} />
    );
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'OTHER' } });
    fireEvent.change(screen.getByLabelText(/note to applicant/i), { target: { value: 'draft note' } });

    rerender(<RejectDialog open={false} reference={REFERENCE} onConfirm={noop} onCancel={noop} />);
    rerender(<RejectDialog open reference={REFERENCE} onConfirm={noop} onCancel={noop} />);

    expect(screen.getByLabelText(/reason/i)).toHaveValue('');
    expect(screen.getByLabelText(/note to applicant/i)).toHaveValue('');
  });

  it('calls onCancel, not onConfirm, when Cancel is clicked', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(<RejectDialog open reference={REFERENCE} onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onCancel on Escape', () => {
    const onCancel = jest.fn();
    render(<RejectDialog open reference={REFERENCE} onConfirm={noop} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders an inline error in a role="alert" live region', () => {
    render(
      <RejectDialog
        open
        reference={REFERENCE}
        onConfirm={noop}
        onCancel={noop}
        error="Failed to reject this registration."
      />
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Failed to reject this registration.');
  });

  it('disables the reason select, note, and both buttons while loading', () => {
    render(<RejectDialog open reference={REFERENCE} onConfirm={noop} onCancel={noop} loading />);
    expect(screen.getByLabelText(/reason/i)).toBeDisabled();
    expect(screen.getByLabelText(/note to applicant/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Please wait…' })).toBeDisabled();
  });

  it('token compliance — the confirm button carries bg-danger (this action IS destructive)', () => {
    render(<RejectDialog open reference={REFERENCE} onConfirm={noop} onCancel={noop} />);
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'OTHER' } });
    expect(screen.getByRole('button', { name: 'Reject' })).toHaveClass('bg-danger');
  });

  it('has no jest-axe violations', async () => {
    const { container } = render(
      <RejectDialog open reference={REFERENCE} onConfirm={noop} onCancel={noop} />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
