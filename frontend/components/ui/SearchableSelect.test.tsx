// @sdd-spec enhancement/searchable-region-select (T-2)
/**
 * Unit tests for SearchableSelect.
 *
 * All keyboard interaction is driven through `@testing-library/user-event`
 * (OQ-2) rather than `fireEvent.keyDown`, so the real browser event sequence
 * (keydown/keypress/input/keyup, and the pointer sequence for clicks) is
 * replayed — this is what makes the JD-8 pointer-commit test below a
 * genuine regression check rather than a synthetic approximation. The one
 * deliberate exception is the simulated-autofill case, which uses
 * `fireEvent.change` because real autofill does not dispatch key events at
 * all — using `user.type` there would test the wrong thing.
 *
 * KZ-002 discipline: two groups of assertions below prove PRESENCE, not
 * BEHAVIOR, and say so at the point of assertion — the `jest-axe` runs
 * (structural ARIA rules only; `color-contrast` is `incomplete` under jsdom
 * and unevaluated, D5) and the `motion-reduce:` class check (proves the
 * class is present, not that any transition is actually suppressed).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

import { SearchableSelect } from './SearchableSelect';

const OPTIONS = [
  { value: 'kaskazini-pemba', label: 'Kaskazini Pemba' },
  { value: 'kusini-pemba', label: 'Kusini Pemba' },
  { value: 'kusini-unguja', label: 'Kusini Unguja' },
  { value: 'dar-es-salaam', label: 'Dar es Salaam' },
  { value: 'dodoma', label: 'Dodoma' },
];

function renderControl(props: Partial<React.ComponentProps<typeof SearchableSelect>> = {}) {
  const onChange = jest.fn();
  const utils = render(
    <SearchableSelect
      id="region"
      value=""
      onChange={onChange}
      options={OPTIONS}
      placeholder="Select…"
      {...props}
    />,
  );
  return { ...utils, onChange, input: screen.getByRole('combobox') };
}

const liveRegion = () => document.querySelector('[aria-live]') as HTMLElement;

// `SearchableSelect` is fully controlled — `renderControl`'s mock `onChange`
// never feeds a commit back into `value`, so the display never actually
// updates after a commit there. Some scenarios (the Issue-1 regression
// below) specifically need to observe what the input shows *after* a real
// parent would have re-rendered with the new `value`, so this wrapper closes
// that loop the way an actual caller (e.g. `RegistrationForm`) does.
function renderControlledControl({
  value: initialValue = '',
  onChange: onChangeProp,
  ...rest
}: Partial<React.ComponentProps<typeof SearchableSelect>> = {}) {
  const onChange = jest.fn();
  function Wrapper() {
    const [value, setValue] = React.useState(initialValue);
    return (
      <SearchableSelect
        id="region"
        value={value}
        onChange={(next) => {
          onChangeProp?.(next);
          onChange(next);
          setValue(next);
        }}
        options={OPTIONS}
        placeholder="Select…"
        {...rest}
      />
    );
  }
  const utils = render(<Wrapper />);
  return { ...utils, onChange, input: screen.getByRole('combobox') };
}

describe('SearchableSelect — closed state', () => {
  it('shows the placeholder when value is empty', () => {
    renderControl();
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it("shows the committed value's label", () => {
    renderControl({ value: 'dodoma' });
    expect(screen.getByRole('combobox')).toHaveValue('Dodoma');
  });
});

describe('SearchableSelect — FR-1 filtering', () => {
  it('narrows to substring matches, case-insensitively', async () => {
    const user = userEvent.setup();
    const { input } = renderControl();
    await user.click(input);
    await user.type(input, 'kus');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Kusini Pemba',
      'Kusini Unguja',
    ]);
  });

  it('matches mid-string, not just prefix — "Pemba" surfaces both Pemba regions', async () => {
    const user = userEvent.setup();
    const { input } = renderControl();
    await user.click(input);
    await user.type(input, 'Pemba');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Kaskazini Pemba',
      'Kusini Pemba',
    ]);
  });

  it('performs no network request while filtering', async () => {
    const fetchSpy = jest.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const user = userEvent.setup();
    const { input } = renderControl();
    await user.click(input);
    await user.type(input, 'kus');
    expect(fetchSpy).not.toHaveBeenCalled();
    globalThis.fetch = originalFetch;
  });

  it('shows a visible no-match message, leaves the committed value unchanged, and keeps the popup open with the typed text intact', async () => {
    const user = userEvent.setup();
    const { input, onChange } = renderControl({ value: 'dodoma' });
    await user.click(input);
    await user.type(input, 'zzz');
    // Visible message lives in the popup's option row; the live region
    // (asserted separately below, FR-6) carries the identical wording, so
    // both are scoped explicitly rather than a plain getByText.
    expect(screen.getByRole('option')).toHaveTextContent('No regions match');
    expect(input).toHaveValue('zzz');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('uses a custom noMatchLabel in the visible message', async () => {
    const user = userEvent.setup();
    const { input } = renderControl({ noMatchLabel: 'Hakuna eneo' });
    await user.click(input);
    await user.type(input, 'zzz');
    expect(screen.getByRole('option')).toHaveTextContent('Hakuna eneo');
  });
});

describe('SearchableSelect — FR-2 keyboard traversal', () => {
  it('ArrowDown opens the popup with the first option active', async () => {
    const user = userEvent.setup();
    const { input } = renderControl();
    await user.tab(); // focuses without opening (a click would open it)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    const options = screen.getAllByRole('option');
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id);
  });

  it('sets aria-controls to the open listbox id, and omits the attribute while closed', async () => {
    const user = userEvent.setup();
    const { input } = renderControl();
    expect(input).not.toHaveAttribute('aria-controls');
    await user.tab();
    await user.keyboard('{ArrowDown}');
    const listbox = screen.getByRole('listbox');
    expect(input).toHaveAttribute('aria-controls', listbox.id);
    await user.keyboard('{Escape}');
    expect(input).not.toHaveAttribute('aria-controls');
  });

  it('ArrowUp/ArrowDown move the active option without wrapping', async () => {
    const user = userEvent.setup();
    const { input } = renderControl();
    await user.tab();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    let options = screen.getAllByRole('option');
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id);
    await user.keyboard('{ArrowUp}{ArrowUp}'); // second ArrowUp must not wrap past the first option
    options = screen.getAllByRole('option');
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id);
  });

  it('Home/End jump to the first/last option', async () => {
    const user = userEvent.setup();
    const { input } = renderControl();
    await user.tab();
    await user.keyboard('{ArrowDown}{End}');
    let options = screen.getAllByRole('option');
    expect(input).toHaveAttribute('aria-activedescendant', options[options.length - 1].id);
    await user.keyboard('{Home}');
    options = screen.getAllByRole('option');
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id);
  });

  it('Enter commits the active option, closes the popup, and never submits a surrounding form', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());
    const onChange = jest.fn();
    render(
      <form onSubmit={onSubmit}>
        <SearchableSelect id="region" value="" onChange={onChange} options={OPTIONS} />
      </form>,
    );
    await user.tab();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('kaskazini-pemba');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Escape closes the popup without committing, reverts an abandoned partial search to the committed label, and a second Escape is not intercepted', async () => {
    const user = userEvent.setup();
    const { input, onChange } = renderControl({ value: 'dodoma' });
    await user.tab();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.type(input, 'zzz'); // uncommitted fragment — nothing the user typed was committed
    expect(input).toHaveValue('zzz');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('Dodoma'); // reverted — no uncommitted fragment left displayed
    await user.keyboard('{Escape}'); // second press — nothing to intercept, no throw
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('keeps DOM focus on the input throughout keyboard navigation (DD-4)', async () => {
    const user = userEvent.setup();
    const { input } = renderControl();
    await user.tab();
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{End}{Home}');
    expect(document.activeElement).toBe(input);
  });

  it('does not intercept Tab — the popup closes, focus moves to the next control, and an abandoned partial search reverts to the committed label', async () => {
    const user = userEvent.setup();
    render(
      <>
        <SearchableSelect id="region" value="dodoma" onChange={jest.fn()} options={OPTIONS} />
        <button>Next</button>
      </>,
    );
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'zzz'); // uncommitted fragment
    expect(input).toHaveValue('zzz');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.tab();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next' }));
    expect(input).toHaveValue('Dodoma'); // reverted — no uncommitted fragment left displayed
  });

  it('reverts the display to the committed label on blur, leaving no uncommitted fragment (abandoning a partial search)', async () => {
    const user = userEvent.setup();
    render(
      <>
        <SearchableSelect id="region" value="dodoma" onChange={jest.fn()} options={OPTIONS} />
        <button>Elsewhere</button>
      </>,
    );
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'zzz');
    expect(input).toHaveValue('zzz');
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(input).toHaveValue('Dodoma');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('SearchableSelect — typing immediately after a commit does not leak the committed label into searchText (Issue-1 regression, the KZ-007 shape on the mirror-image path)', () => {
  // DD-4/JD-8 deliberately keep DOM focus on the input after a commit, so the
  // field is left displaying the committed label with focus still in it —
  // neither `handleClick`'s reset nor a `Tab`'s browser select-all runs here.
  // A naive `handleChange` that reads `event.target.value` wholesale would
  // pick up "<label><typed char>" instead of just what the user typed.
  it('filters against only the typed character after an Enter commit, without re-clicking the input', async () => {
    const user = userEvent.setup();
    const { input, onChange } = renderControlledControl();
    await user.tab();
    await user.keyboard('{ArrowDown}{Enter}'); // commits 'kaskazini-pemba'
    expect(onChange).toHaveBeenCalledWith('kaskazini-pemba');
    expect(input).toHaveValue('Kaskazini Pemba');
    await user.keyboard('k'); // typed directly, no click to reset searchText first
    expect(input).toHaveValue('k');
    // '✓' prefixes the committed option's own row (line 385-389) — the
    // committed value here is the first match, unlike the pointer-commit
    // variant below where it is not.
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      '✓Kaskazini Pemba',
      'Kusini Pemba',
      'Kusini Unguja',
    ]);
  });

  it('filters against only the typed character after a pointer commit, without re-clicking the input', async () => {
    const user = userEvent.setup();
    const { input, onChange } = renderControlledControl();
    await user.click(input);
    await user.click(screen.getByRole('option', { name: 'Dodoma' }));
    expect(onChange).toHaveBeenCalledWith('dodoma');
    expect(input).toHaveValue('Dodoma');
    await user.keyboard('k'); // JD-8 kept focus on the input; no click, no blur
    expect(input).toHaveValue('k');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Kaskazini Pemba',
      'Kusini Pemba',
      'Kusini Unguja',
    ]);
  });
});

describe('SearchableSelect — JD-8 pointer commit survives the blur that would otherwise precede it', () => {
  it('commits on click even though the option is not itself focusable', async () => {
    // Genuine regression coverage, not a presence check (KZ-007): without
    // the popup's mousedown/pointerdown preventDefault, a click on this
    // non-focusable <li> blurs the input FIRST in a real browser (and in
    // jsdom via user-event's focus emulation) — which closes the popup and
    // unmounts the option out from under the pointer before the click
    // phase runs, so `onChange` would never fire. If that guard regresses,
    // this test fails instead of degrading silently.
    const user = userEvent.setup();
    const { input, onChange } = renderControl();
    await user.click(input);
    await user.click(screen.getByRole('option', { name: 'Kusini Pemba' }));
    expect(onChange).toHaveBeenCalledWith('kusini-pemba');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('SearchableSelect — JD-2 invalid state', () => {
  it('sets aria-invalid and the danger border, and renders no message', () => {
    const { input } = renderControl({ invalid: true });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.className).toMatch(/border-danger/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('omits aria-invalid and uses the neutral border when clean', () => {
    const { input } = renderControl({ invalid: false });
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input.className).toMatch(/border-border/);
  });
});

describe('SearchableSelect — FR-3 canonical value fidelity', () => {
  it('never emits typed text abandoned via blur', async () => {
    const user = userEvent.setup();
    const { input, onChange } = renderControl();
    await user.click(input);
    await user.type(input, 'Dar');
    await user.tab();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('never emits typed text abandoned via Escape', async () => {
    const user = userEvent.setup();
    const { input, onChange } = renderControl();
    await user.click(input);
    await user.type(input, 'Dar');
    await user.keyboard('{Escape}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('never emits text pasted into the control', async () => {
    const user = userEvent.setup();
    const { input, onChange } = renderControl();
    await user.click(input);
    await user.paste('Dar es Salaamzzz');
    await user.tab();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('never emits a value written by simulated autofill (bypasses key events entirely, so fireEvent is deliberate here)', () => {
    const { input, onChange } = renderControl();
    fireEvent.change(input, { target: { value: 'Free Text Region' } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps searchText and the committed value as separate state — typing never alters value before a commit', async () => {
    const user = userEvent.setup();
    const { input, onChange } = renderControl({ value: 'dodoma' });
    await user.click(input);
    await user.type(input, 'kus');
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('kus'); // display reads searchText while open
  });
});

describe('SearchableSelect — FR-6 live region', () => {
  it('is aria-live="polite", never assertive, and visually hidden (KZ-002 — proves the class is present, not that any pixel is hidden; jsdom has no layout engine, same disclosure as NFR-5)', () => {
    renderControl();
    expect(liveRegion()).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion().className).toMatch(/sr-only/);
  });

  it('announces the filtered count with exact singular/plural wording', async () => {
    const user = userEvent.setup();
    const { input } = renderControl();
    await user.click(input);
    await user.type(input, 'kus');
    expect(liveRegion()).toHaveTextContent('2 regions available');
    await user.type(input, 'ini unguja');
    expect(liveRegion()).toHaveTextContent('1 region available');
  });

  it('announces the no-match case explicitly, with the same wording as the visible message (JD-10), from a node distinct from the visible option row', async () => {
    const user = userEvent.setup();
    const { input } = renderControl();
    await user.click(input);
    await user.type(input, 'zzz');
    expect(liveRegion()).toHaveTextContent('No regions match');
    // The live region and the visible no-match row carry identical text but
    // must be two separate DOM nodes — collapsing them onto one would still
    // pass a plain toHaveTextContent check on either selector.
    expect(liveRegion()).not.toBe(screen.getByRole('option'));
  });

  it('is idempotent across two different queries that produce the same count — proves no spurious text change, not that any AT stays silent (KZ-002, D8)', async () => {
    const user = userEvent.setup();
    const { input } = renderControl();
    await user.click(input);
    await user.type(input, 'kaskazini pemba'); // 1 match
    expect(liveRegion()).toHaveTextContent('1 region available');
    await user.clear(input);
    await user.type(input, 'kusini unguja'); // also 1 match
    expect(liveRegion()).toHaveTextContent('1 region available');
  });
});

describe('SearchableSelect — clearOptionLabel', () => {
  it('commits "" via the same commit path as any other option', async () => {
    const user = userEvent.setup();
    const { input, onChange } = renderControl({ value: 'dodoma', clearOptionLabel: 'All regions' });
    await user.click(input);
    await user.click(screen.getByRole('option', { name: 'All regions' }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});

describe('SearchableSelect — disabled', () => {
  it('does not open or accept interaction while disabled', async () => {
    const user = userEvent.setup();
    const { input, onChange } = renderControl({ disabled: true, value: 'dodoma' });
    expect(input).toBeDisabled();
    await user.click(input);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('SearchableSelect — NFR-5 reduced motion (presence only — KZ-002, does not prove the transition is suppressed)', () => {
  it('includes motion-reduce:transition-none on the popup', async () => {
    const user = userEvent.setup();
    const { input } = renderControl();
    await user.click(input);
    const popup = screen.getByRole('listbox').parentElement as HTMLElement;
    expect(popup.className).toMatch(/motion-reduce:transition-none/);
  });
});

describe('SearchableSelect — NFR-1 axe over 6 states (structure only — color-contrast is `incomplete` under jsdom and unevaluated here, D5)', () => {
  it('closed', async () => {
    const { container } = renderControl();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('open', async () => {
    const user = userEvent.setup();
    const { container, input } = renderControl();
    await user.click(input);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('filtered', async () => {
    const user = userEvent.setup();
    const { container, input } = renderControl();
    await user.click(input);
    await user.type(input, 'kus');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('no-match', async () => {
    const user = userEvent.setup();
    const { container, input } = renderControl();
    await user.click(input);
    await user.type(input, 'zzz');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('invalid', async () => {
    const { container } = renderControl({ invalid: true });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('disabled', async () => {
    const { container } = renderControl({ disabled: true });
    expect(await axe(container)).toHaveNoViolations();
  });
});
