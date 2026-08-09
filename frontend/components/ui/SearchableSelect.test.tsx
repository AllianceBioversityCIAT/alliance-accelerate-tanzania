// @sdd-spec enhancement/searchable-region-select (T-2)
// @sdd-spec enhancement/searchable-region-select (T-3)
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
 * KZ-002 discipline: three groups of assertions below prove PRESENCE, not
 * BEHAVIOR, and say so at the point of assertion — the `jest-axe` runs
 * (structural ARIA rules only; `color-contrast` is `incomplete` under jsdom
 * and unevaluated, D5), the `motion-reduce:` class check (proves the class
 * is present, not that any transition is actually suppressed), and the
 * `aria-live` presence/visually-hidden check in the FR-6 block below.
 *
 * T-3 (design.md §5.5, DD-5): the popup now portals to `document.body`, so
 * the `open`/`filtered`/`no-match` axe runs below assert against `baseElement`
 * (RTL's alias for `document.body`) rather than `container` — `container`
 * no longer contains the popup once it portals out, and an axe run scoped to
 * it would stay green while silently no longer covering the listbox at all.
 * Auditing `document.body` directly (rather than a `container` div inside
 * it, which is every other axe call's precedent in this repo) trips axe's
 * `region` rule — "all page content should be contained by landmarks" — for
 * reasons that have nothing to do with this component: a unit test's
 * `document.body` is not a page, and landmark structure is the responsibility
 * of whatever page eventually renders this control (the three adoption
 * sites), not the control itself. `region` is disabled on those three runs
 * for exactly that reason — see the comment at each call site.
 * The reflow-positioning tests in the dedicated T-3 describe block below are
 * explicit that they cannot prove geometry — jsdom's `getBoundingClientRect`
 * always returns the zero rect (D6) — only that the listener wiring and the
 * popup-origin scroll exclusion (JD-1) behave as designed.
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
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

describe('SearchableSelect — Issue-2 z-index regression: z-50 survives the portal (KZ-002 presence-only — does not prove visual stacking under jsdom, which has no layout engine)', () => {
  it('includes z-50, not the inline-era z-10, on the portaled popup', async () => {
    const user = userEvent.setup();
    const { input } = renderControl();
    await user.click(input);
    const popup = screen.getByRole('listbox').parentElement as HTMLElement;
    expect(popup.className).toMatch(/\bz-50\b/);
    expect(popup.className).not.toMatch(/\bz-10\b/);
  });
});

describe('SearchableSelect — NFR-1 axe over 6 states (structure only — color-contrast is `incomplete` under jsdom and unevaluated here, D5)', () => {
  it('closed', async () => {
    const { container } = renderControl();
    expect(await axe(container)).toHaveNoViolations();
  });

  // `region` is disabled on the three `baseElement` runs below (harness
  // artifact, not a component defect): axe's `region` rule wants all page
  // content inside a landmark, but a unit test's `document.body` is not a
  // page — it is a `<body>` with this control's un-landmarked output nailed
  // straight into it. Landmark structure belongs to whatever page renders
  // this control (the three adoption sites in T-4/T-5), not to the control
  // itself, so `region` says nothing about this component either way. Every
  // other axe call in this repo audits a `container` div, never
  // `document.body` directly, so there is no existing precedent either
  // confirming or muddying this — disabling it here is a first, not a
  // reversal. Each `it` also asserts the audited HTML actually contains the
  // portalled `listbox`, so a silently-uncovered popup would fail loudly
  // rather than pass green.
  const AXE_OPTIONS = { rules: { region: { enabled: false } } };

  it('open', async () => {
    // T-3: the popup now portals to document.body, outside `container` — axe
    // must run against `baseElement` (= document.body) or it stays green
    // while no longer auditing the listbox at all.
    const user = userEvent.setup();
    const { baseElement, input } = renderControl();
    await user.click(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument(); // proves this run still covers the popup
    expect(await axe(baseElement, AXE_OPTIONS)).toHaveNoViolations();
  });

  it('filtered', async () => {
    const user = userEvent.setup();
    const { baseElement, input } = renderControl();
    await user.click(input);
    await user.type(input, 'kus');
    expect(screen.getByRole('listbox')).toBeInTheDocument(); // proves this run still covers the popup
    expect(await axe(baseElement, AXE_OPTIONS)).toHaveNoViolations();
  });

  it('no-match', async () => {
    const user = userEvent.setup();
    const { baseElement, input } = renderControl();
    await user.click(input);
    await user.type(input, 'zzz');
    // The `<ul role="listbox">` itself still renders in the no-match state —
    // only its child changes to the static KZ-008 row (see the component's
    // ARIA-contract doc block) — so `listbox` is still the right coverage proof.
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(await axe(baseElement, AXE_OPTIONS)).toHaveNoViolations();
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

describe('SearchableSelect — T-3 portal (design.md §5.5, DD-5)', () => {
  it('renders the popup under document.body, not inside the local render tree', async () => {
    const user = userEvent.setup();
    const { input, container } = renderControl();
    await user.click(input);
    const listbox = screen.getByRole('listbox');
    expect(document.body.contains(listbox)).toBe(true);
    expect(container.contains(listbox)).toBe(false);
  });

  it('never calls scrollIntoView while navigating the list — the popup adjusts its own scrollTop directly instead (scrollIntoView is forbidden by §5.5)', async () => {
    const scrollIntoViewSpy = jest.fn();
    const original = window.HTMLElement.prototype.scrollIntoView;
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy;
    try {
      const user = userEvent.setup();
      const { input } = renderControl();
      await user.click(input);
      await user.keyboard('{ArrowDown}{ArrowDown}{End}{Home}{ArrowUp}');
      expect(scrollIntoViewSpy).not.toHaveBeenCalled();
    } finally {
      window.HTMLElement.prototype.scrollIntoView = original;
    }
  });
});

describe('SearchableSelect — T-3 reflow: reposition, never close, except the one remaining case (design.md §5.5, DD-5\'s Judgment Day amendment, JD-1, JD-6)', () => {
  // These tests prove the LISTENER WIRING and the popup-origin scroll
  // EXCLUSION — that a reflow event reaches (or is correctly excluded from)
  // the recompute path, and that the recompute path writes whatever rect it
  // is given onto the popup's style. None of them prove the popup is
  // CORRECTLY POSITIONED in a real browser: jsdom's `getBoundingClientRect`
  // always returns the zero rect (D6, no layout engine), so real geometry is
  // structurally unverifiable here. That is T-6's manual browser pass.
  let rafSpy: jest.SpiedFunction<typeof window.requestAnimationFrame>;
  let cafSpy: jest.SpiedFunction<typeof window.cancelAnimationFrame>;

  beforeEach(() => {
    // Runs the rAF-throttled recompute synchronously so assertions don't
    // depend on real frame timing — this exercises the throttle/dispatch
    // wiring, not the browser's frame scheduler.
    rafSpy = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });
    cafSpy = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    rafSpy.mockRestore();
    cafSpy.mockRestore();
  });

  it('attaches the capture-phase document scroll listener only while open, and removes it on close', async () => {
    const addSpy = jest.spyOn(document, 'addEventListener');
    const removeSpy = jest.spyOn(document, 'removeEventListener');
    const user = userEvent.setup();
    const { input } = renderControl();

    expect(addSpy).not.toHaveBeenCalledWith('scroll', expect.any(Function), true);
    await user.click(input);
    expect(addSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true);
    await user.keyboard('{Escape}');
    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('recomputes on a document-level scroll whose target is outside the popup, writing the anchor rect it is given onto the popup style', async () => {
    const user = userEvent.setup();
    const { input } = renderControl();
    await user.click(input);
    const popup = screen.getByRole('listbox').parentElement as HTMLElement;

    const rectSpy = jest.spyOn(input, 'getBoundingClientRect').mockReturnValue({
      top: 40,
      bottom: 76,
      left: 8,
      right: 208,
      width: 200,
      height: 36,
      x: 8,
      y: 40,
      toJSON() {},
    } as DOMRect);

    act(() => {
      document.dispatchEvent(new Event('scroll'));
    });

    expect(rectSpy).toHaveBeenCalled();
    expect(popup.style.left).toBe('8px');
    expect(popup.style.width).toBe('200px');
    expect(popup.style.top).toBe('80px'); // rect.bottom (76) + the 4px gap — the wiring, not real geometry (D6)
    rectSpy.mockRestore();
  });

  it('ignores a scroll event whose target is inside the popup (JD-1) — no reposition read, and the popup neither moves nor closes', async () => {
    const user = userEvent.setup();
    const { input } = renderControl();
    await user.click(input);
    const listbox = screen.getByRole('listbox');

    const rectSpy = jest.spyOn(input, 'getBoundingClientRect');
    const callsBeforeScroll = rectSpy.mock.calls.length;

    act(() => {
      // Not bubbling — same as a real `scroll` event — but the capturing
      // phase (which the document listener is registered for) still runs on
      // the way down to this target regardless of the bubbles flag, which is
      // exactly why the popup's own internal scroll needs the explicit
      // `contains(event.target)` exclusion rather than relying on `stopPropagation`.
      listbox.dispatchEvent(new Event('scroll'));
    });

    // What this proves: the `popupRef.current.contains(event.target)`
    // exclusion suppresses the reposition read triggered by the popup's own
    // internal list scroll — not that the list is visually stationary in a
    // real browser, which jsdom cannot show (D6).
    expect(rectSpy).toHaveBeenCalledTimes(callsBeforeScroll);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    rectSpy.mockRestore();
  });

  it('recomputes on window resize', async () => {
    const user = userEvent.setup();
    const { input } = renderControl();
    await user.click(input);

    const rectSpy = jest.spyOn(input, 'getBoundingClientRect');
    const callsBefore = rectSpy.mock.calls.length;

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(rectSpy.mock.calls.length).toBeGreaterThan(callsBefore);
    rectSpy.mockRestore();
  });

  it('recomputes on visualViewport resize and scroll (JD-6 — the mobile virtual-keyboard path). jsdom has no visualViewport, so this test supplies one', async () => {
    class FakeVisualViewport extends EventTarget {
      width = 1024;
      height = 768;
      offsetTop = 0;
      offsetLeft = 0;
    }
    const fakeViewport = new FakeVisualViewport();
    Object.defineProperty(window, 'visualViewport', { value: fakeViewport, configurable: true });

    try {
      const user = userEvent.setup();
      const { input } = renderControl();
      await user.click(input);

      const rectSpy = jest.spyOn(input, 'getBoundingClientRect');

      const callsBeforeResize = rectSpy.mock.calls.length;
      act(() => {
        fakeViewport.dispatchEvent(new Event('resize'));
      });
      expect(rectSpy.mock.calls.length).toBeGreaterThan(callsBeforeResize);

      const callsBeforeScroll = rectSpy.mock.calls.length;
      act(() => {
        fakeViewport.dispatchEvent(new Event('scroll'));
      });
      expect(rectSpy.mock.calls.length).toBeGreaterThan(callsBeforeScroll);

      rectSpy.mockRestore();
    } finally {
      // @ts-expect-error -- jsdom does not type this global; test-only cleanup
      delete window.visualViewport;
    }
  });

  it('writes the flip-above `bottom` offset in the layout-viewport frame, not the visual-viewport frame (Issue-1 coordinate-frame fix)', async () => {
    // Wiring, not geometry (D6): proves the arithmetic reads
    // `document.documentElement.clientHeight` (the layout viewport, which is
    // the frame a `position: fixed` element's `bottom` actually resolves
    // against) rather than `visualViewport.height` (the frame the flip
    // *decision* correctly uses, and which this test deliberately sets to a
    // different value to make the two frames distinguishable — on a real
    // desktop browser they coincide and this bug is invisible). If the fix
    // regresses back to the visual-viewport frame, `bottom` comes out 104px
    // (the Issue-1 worked example) instead of 404px, and this test fails.
    class FakeVisualViewport extends EventTarget {
      width = 1024;
      height = 500; // shrunk relative to the layout viewport — e.g. a mobile keyboard
      offsetTop = 0;
      offsetLeft = 0;
    }
    const fakeViewport = new FakeVisualViewport();
    Object.defineProperty(window, 'visualViewport', { value: fakeViewport, configurable: true });
    Object.defineProperty(document.documentElement, 'clientHeight', {
      value: 800, // the un-shrunk layout viewport
      configurable: true,
    });

    try {
      const user = userEvent.setup();
      const { input } = renderControl();
      await user.click(input);
      const popup = screen.getByRole('listbox').parentElement as HTMLElement;

      jest.spyOn(input, 'getBoundingClientRect').mockReturnValue({
        top: 400,
        bottom: 436,
        left: 8,
        right: 208,
        width: 200,
        height: 36,
        x: 8,
        y: 400,
        toJSON() {},
      } as DOMRect);

      act(() => {
        document.dispatchEvent(new Event('scroll'));
      });

      // spaceBelow (500 - 436 = 64) < POPUP_MAX_HEIGHT_PX (240) and
      // spaceAbove (400) > spaceBelow (64) — the flip decision correctly
      // uses the visual viewport and picks "above".
      expect(popup.style.top).toBe('auto');
      // 800 (layout clientHeight) - 400 (rect.top) + 4 (gap) = 404 — NOT 104
      // (0 + 500 (visual viewport height) - 400 + 4), which is what the
      // pre-fix code would have written here.
      expect(popup.style.bottom).toBe('404px');
    } finally {
      // @ts-expect-error -- jsdom does not type this global; test-only cleanup
      delete document.documentElement.clientHeight;
      // @ts-expect-error -- jsdom does not type this global; test-only cleanup
      delete window.visualViewport;
    }
  });

  it('closes when the (mocked) anchor rect is entirely outside the viewport — the one remaining close-on-reflow case', async () => {
    const user = userEvent.setup();
    const { input } = renderControl();
    await user.click(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    // This proves the close branch fires for a rect this test supplies — not
    // that jsdom itself ever produces an out-of-viewport rect. jsdom's real
    // getBoundingClientRect is always the zero rect (D6), which the next
    // test confirms this component does NOT read as "off-screen".
    jest.spyOn(input, 'getBoundingClientRect').mockReturnValue({
      top: -500,
      bottom: -460,
      left: 8,
      right: 208,
      width: 200,
      height: 40,
      x: 8,
      y: -500,
      toJSON() {},
    } as DOMRect);

    act(() => {
      document.dispatchEvent(new Event('scroll'));
    });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it("does not spuriously close on jsdom's own (zero) rect — an unmeasured rect is read as \"assume visible\", never \"off-screen\" (D6 guard)", async () => {
    const user = userEvent.setup();
    const { input } = renderControl();
    await user.click(input);

    // No mock here: this drives jsdom's actual getBoundingClientRect, which
    // always returns the zero rect. If that were read as "out of viewport",
    // every open/filter test in this whole file would close the popup on its
    // first reflow tick.
    act(() => {
      document.dispatchEvent(new Event('scroll'));
    });

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });
});
