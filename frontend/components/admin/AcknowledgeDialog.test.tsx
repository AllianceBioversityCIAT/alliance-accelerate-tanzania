// @sdd-spec admin/bulk-actor-operations (T-8)
/**
 * Unit tests for AcknowledgeDialog.
 *
 * Covers:
 *   - title and description render
 *   - confirm button is disabled until the exact acknowledgement phrase is typed
 *   - onConfirm is called when the phrase matches and confirm is clicked
 *   - onCancel is called for cancel button, Escape key, and backdrop click
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';

import { AcknowledgeDialog } from './AcknowledgeDialog';

const TITLE = 'Unlock 1 actor?';
const DESCRIPTION = 'This will publish actor details to the public directory.';
const ACKNOWLEDGEMENT_TEXT = 'I confirm consent is on file';
const CONFIRM_LABEL = 'Unlock';

function renderDialog(props: Partial<React.ComponentProps<typeof AcknowledgeDialog>> = {}) {
  return render(
    <AcknowledgeDialog
      open
      title={TITLE}
      description={DESCRIPTION}
      acknowledgementText={ACKNOWLEDGEMENT_TEXT}
      confirmLabel={CONFIRM_LABEL}
      onConfirm={jest.fn()}
      onCancel={jest.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AcknowledgeDialog — rendering', () => {
  it('renders the title and description', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: TITLE })).toBeInTheDocument();
    expect(screen.getByText(DESCRIPTION)).toBeInTheDocument();
  });
});

describe('AcknowledgeDialog — acknowledgement gate', () => {
  it('keeps the confirm button disabled until the exact phrase is typed', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: CONFIRM_LABEL });
    const input = within(dialog).getByLabelText(/type .* to confirm/i);

    expect(confirmBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: 'wrong phrase' } });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: ACKNOWLEDGEMENT_TEXT } });
    expect(confirmBtn).toBeEnabled();
  });

  it('calls onConfirm when the phrase matches and confirm is clicked', () => {
    const onConfirm = jest.fn();
    renderDialog({ onConfirm });

    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByLabelText(/type .* to confirm/i);
    fireEvent.change(input, { target: { value: ACKNOWLEDGEMENT_TEXT } });

    fireEvent.click(within(dialog).getByRole('button', { name: CONFIRM_LABEL }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('AcknowledgeDialog — cancel behaviours', () => {
  it('calls onCancel when the Cancel button is clicked', () => {
    const onCancel = jest.fn();
    renderDialog({ onCancel });

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the Escape key is pressed', () => {
    const onCancel = jest.fn();
    renderDialog({ onCancel });

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the backdrop is clicked', () => {
    const onCancel = jest.fn();
    renderDialog({ onCancel });

    const dialog = screen.getByRole('dialog');
    const backdrop = dialog.previousElementSibling;
    expect(backdrop).toBeTruthy();

    fireEvent.click(backdrop!);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
