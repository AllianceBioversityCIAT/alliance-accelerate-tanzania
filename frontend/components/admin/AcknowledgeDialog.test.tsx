// @sdd-spec admin/bulk-actor-operations (T-8)
// @sdd-spec actors/registration-source-and-consent (T-10)
/**
 * Unit tests for AcknowledgeDialog.
 *
 * Covers:
 *   - title and description render
 *   - confirm button is disabled until the exact acknowledgement phrase is typed
 *   - onConfirm is called when the phrase matches and confirm is clicked
 *   - onCancel is called for cancel button, Escape key, and backdrop click
 *   - T-10: the opt-in `provenance` prop — no method/date inputs when absent,
 *     rendered and gating confirm when supplied, jest-axe clean either way.
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

import { AcknowledgeDialog, type ConsentProvenanceFields } from './AcknowledgeDialog';
import type { ConsentMethod } from '@/lib/api/actors-admin';

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

// ---------------------------------------------------------------------------
// T-10 — opt-in `provenance` prop (batch consent method + date, bulk unlock only)
// ---------------------------------------------------------------------------

/**
 * The dialog is controlled: the caller owns method/date state. This harness
 * reproduces that contract with its own useState, exactly as
 * `app/(admin)/admin/actors/page.tsx` does, so fireEvent can actually drive
 * the select/date inputs rather than asserting against inert props.
 */
function renderDialogWithProvenance(
  initial: Partial<Pick<ConsentProvenanceFields, 'method' | 'date'>> = {},
  props: Partial<React.ComponentProps<typeof AcknowledgeDialog>> = {},
) {
  function Harness() {
    const [method, setMethod] = React.useState<ConsentMethod | ''>(initial.method ?? '');
    const [date, setDate] = React.useState(initial.date ?? '');
    return (
      <AcknowledgeDialog
        open
        title={TITLE}
        description={DESCRIPTION}
        acknowledgementText={ACKNOWLEDGEMENT_TEXT}
        confirmLabel={CONFIRM_LABEL}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
        {...props}
        provenance={{
          method,
          onMethodChange: setMethod,
          date,
          onDateChange: setDate,
        }}
      />
    );
  }
  return render(<Harness />);
}

describe('AcknowledgeDialog — T-10 provenance prop absent (import + single-actor call sites)', () => {
  it('renders no consent-method or consent-date inputs when `provenance` is not supplied', () => {
    renderDialog();

    expect(screen.queryByLabelText(/consent method/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/consent obtained on/i)).not.toBeInTheDocument();
  });

  it('enables confirm on the typed phrase alone — provenanceValid is trivially true', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: CONFIRM_LABEL });
    const input = within(dialog).getByLabelText(/type .* to confirm/i);

    fireEvent.change(input, { target: { value: ACKNOWLEDGEMENT_TEXT } });
    expect(confirmBtn).toBeEnabled();
  });

  // A-1 rework — the pre-T-10 hint must stay byte-identical when `provenance`
  // is omitted (the import and single-actor call sites' regression coverage
  // depends on this exact string not changing).
  it('keeps the acknowledgement hint byte-identical to the pre-T-10 text', () => {
    renderDialog();

    expect(
      screen.getByText('Confirm is disabled until the acknowledgement is entered exactly.'),
    ).toBeInTheDocument();
  });
});

describe('AcknowledgeDialog — T-10 provenance prop supplied (bulk unlock)', () => {
  it('renders a consent-method select and a consent-date input', () => {
    renderDialogWithProvenance();

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText(/consent method/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/consent obtained on/i)).toBeInTheDocument();
  });

  it('keeps confirm disabled with the phrase typed but no method or date selected', () => {
    renderDialogWithProvenance();

    const dialog = screen.getByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: CONFIRM_LABEL });
    const phraseInput = within(dialog).getByLabelText(/type .* to confirm/i);

    fireEvent.change(phraseInput, { target: { value: ACKNOWLEDGEMENT_TEXT } });

    expect(confirmBtn).toBeDisabled();
  });

  it('keeps confirm disabled with the phrase and a method but no date', () => {
    renderDialogWithProvenance();

    const dialog = screen.getByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: CONFIRM_LABEL });

    fireEvent.change(within(dialog).getByLabelText(/type .* to confirm/i), {
      target: { value: ACKNOWLEDGEMENT_TEXT },
    });
    fireEvent.change(within(dialog).getByLabelText(/consent method/i), {
      target: { value: 'SIGNED_FORM' },
    });

    expect(confirmBtn).toBeDisabled();
  });

  it('keeps confirm disabled with the phrase and a date but no method', () => {
    renderDialogWithProvenance();

    const dialog = screen.getByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: CONFIRM_LABEL });

    fireEvent.change(within(dialog).getByLabelText(/type .* to confirm/i), {
      target: { value: ACKNOWLEDGEMENT_TEXT },
    });
    fireEvent.change(within(dialog).getByLabelText(/consent obtained on/i), {
      target: { value: '2026-01-15' },
    });

    expect(confirmBtn).toBeDisabled();
  });

  it('enables confirm once the phrase, method, and date are all supplied', () => {
    renderDialogWithProvenance();

    const dialog = screen.getByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: CONFIRM_LABEL });

    fireEvent.change(within(dialog).getByLabelText(/type .* to confirm/i), {
      target: { value: ACKNOWLEDGEMENT_TEXT },
    });
    fireEvent.change(within(dialog).getByLabelText(/consent method/i), {
      target: { value: 'SIGNED_FORM' },
    });
    fireEvent.change(within(dialog).getByLabelText(/consent obtained on/i), {
      target: { value: '2026-01-15' },
    });

    expect(confirmBtn).toBeEnabled();
  });

  it('does not offer NOT_RECORDED as a batch fill method (it is the no-evidence sentinel)', () => {
    renderDialogWithProvenance();

    const dialog = screen.getByRole('dialog');
    const select = within(dialog).getByLabelText(/consent method/i) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);

    expect(values).not.toContain('NOT_RECORDED');
  });

  // A-1 rework — with `provenance` supplied, Confirm stays disabled even
  // after the phrase is typed exactly (method/date still gate it too), so
  // the hint must say so. Silently reusing the phrase-only hint here would
  // leave an Admin looking at a dead Confirm button with no explanation, on
  // the action that publishes PII + GPS.
  it('names all three gating conditions in the hint when provenance is supplied', () => {
    renderDialogWithProvenance();

    expect(
      screen.getByText(
        'Confirm is disabled until the acknowledgement is entered exactly, and a consent method and date are selected.',
      ),
    ).toBeInTheDocument();
  });

  // A-4 — this copy is what satisfies T-10's third done-criterion (the bulk
  // confirm copy states that already-evidenced actors keep their evidence,
  // DD-4). Asserted directly so a future edit can't silently drop it.
  it('states that actors already carrying their own evidence keep it unchanged', () => {
    renderDialogWithProvenance();

    expect(
      screen.getByText(/actors that already have their own consent method and date on file keep them unchanged/i),
    ).toBeInTheDocument();
  });

  it("required-marks the consent-method and consent-date labels, matching ActorForm.tsx's Field convention", () => {
    renderDialogWithProvenance();

    const dialog = screen.getByRole('dialog');
    const methodSelect = within(dialog).getByLabelText(/consent method/i);
    const dateInput = within(dialog).getByLabelText(/consent obtained on/i);
    const methodLabel = dialog.querySelector(`label[for="${methodSelect.id}"]`);
    const dateLabel = dialog.querySelector(`label[for="${dateInput.id}"]`);

    expect(methodLabel).toHaveTextContent('*');
    expect(dateLabel).toHaveTextContent('*');
  });

  it('has no jest-axe violations with the provenance inputs rendered', async () => {
    const { container } = renderDialogWithProvenance();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
