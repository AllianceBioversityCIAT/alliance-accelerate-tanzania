// @sdd-spec enhancement/usage-analytics (T-4)
/**
 * ConsentBanner.test.tsx — component tests for the FR-2 consent banner
 * (requirements.md FR-2, NFR-1, NFR-2, NFR-3; design.md §5.3, §5.4, DD-6,
 * DD-7).
 *
 * Follows `GoogleAnalytics.test.tsx`'s established pattern: render
 * `<ConsentContext.Provider value={…}>` directly rather than mocking the
 * provider module, so each test controls `showBanner`/`setConsent`
 * explicitly instead of going through real storage or timing.
 *
 * ── Clause sweep (tasks.md T-4 brief) — every clause below is either
 *    asserted by a named test in this file, or recorded here as an
 *    unevaluated gap with the structural reason jsdom cannot see it ──
 *
 *  1. Banner present with no stored record            → 'renders as a landmark region…'
 *  2. Both controls keyboard-reachable                 → 'both controls are real, tabbable <button> elements…'
 *  3. Underlying page stays operable/keyboard-reachable → 'the underlying page stays keyboard-reachable while the banner shows…' (keyboard part).
 *     The *pointer*-operability half of this clause is NOT separately
 *     assertable here: jsdom dispatches a synthetic click straight to its
 *     target element and performs no hit-testing against paint order or
 *     CSS position, so a click on an element "behind" the banner would
 *     report success identically whether a real, pointer-intercepting
 *     backdrop existed or not — the only DOM feature that could ever
 *     cause that interception in this codebase is a backdrop element,
 *     and its *existence* is what 'contains no backdrop element…' (clause
 *     6) asserts structurally. Recorded as an unevaluated gap for the
 *     pointer sub-clause specifically, not for clause 3 as a whole.
 *  4. Not role="dialog"/"alertdialog"                  → 'is exposed as a region, never a dialog…'
 *  5. No focus trap                                    → 'tabbing forward from the last control leaves the banner…'
 *  6. No backdrop intercepting pointer events           → 'renders no backdrop element — exactly one child…'
 *  7. Rejecting no harder than accepting                → 'resolves each choice in exactly one click, with no…'
 *  8. Labelled landmark region                          → 'renders as a landmark region…' (same test as #1)
 *  9. Links to /privacy                                 → 'links to /privacy'
 * 10. Visibility derives from showBanner, not composed  → 'does NOT render merely because consent is "undecided"…'
 * 11. One-click resolution writing through setConsent   → 'resolves each choice in exactly one click, with no…' (same as #7)
 * 12. Zero jest-axe violations                          → 'has no axe violations…'
 * 13. Every class resolves to a design.md §7 token      → 'uses no hex color, rgb()/hsl(), or undocumented arbitrary…'
 * 14. No transition or animation                        → 'contains no transition, animation, or duration utility…'
 *  B. Rendered-dimension parity (design.md §5.3 "identical in dimensions
 *     and font size") → 'the accept and reject controls share one
 *     size/typography class set…' asserts the CLASS-LEVEL precondition
 *     only (accept now carries `border border-primary` alongside reject's
 *     pre-existing `border border-border`, so both apply exactly one 1px
 *     border under Tailwind preflight's `border-width: 0` reset — true by
 *     construction as of the T-4 rework). Whether that construction
 *     actually PAINTS as equal width/height in a real browser is NOT
 *     verified here: jsdom has no layout engine, so rendered box
 *     dimensions are unevaluable in this file. Deferred to T-8's rendered
 *     capture, which should confirm the border-parity fix closed the 2px
 *     reject/accept gap the Reviewer measured pre-rework.
 *
 * NOT evaluated here, by design (tasks.md T-4's own disqualifier):
 *   - NFR-4 (contrast) — jest-axe's color-contrast rule is skipped, not
 *     passed, under jsdom (docs/trd/trd.md QA-11); real coverage is
 *     `frontend/lib/contrast.test.ts`'s REACHABLE matrix, which this file
 *     does not touch or extend.
 *   - NFR-5 (layout/occlusion at 375/768/1440, the /map overlap) — jsdom
 *     evaluates no geometry at all; that evidence is T-8's rendered
 *     capture, not a unit test.
 *   - Row B's rendered-dimension parity (see row B above) — same jsdom
 *     layout limitation, folded into T-8's scope alongside NFR-5.
 */

import fs from 'fs';
import path from 'path';

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import { ConsentContext } from '@/lib/analytics/ConsentProvider';
import type { ConsentContextValue } from '@/lib/analytics/ConsentProvider';

import { ConsentBanner } from './ConsentBanner';

expect.extend(toHaveNoViolations);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Renders <ConsentBanner/> under an explicit context value, optionally
 *  alongside sibling "page" content so tab-order / operability tests have
 *  real DOM neighbours to move focus to. */
function renderBanner(
  overrides: Partial<ConsentContextValue> = {},
  { withPageContent = false }: { withPageContent?: boolean } = {},
) {
  const setConsent = jest.fn();
  const value: ConsentContextValue = {
    consent: 'undecided',
    loading: false,
    showBanner: true,
    setConsent,
    ...overrides,
  };

  const utils = render(
    <ConsentContext.Provider value={value}>
      {withPageContent && <button type="button">Before banner</button>}
      <ConsentBanner />
      {withPageContent && <button type="button">After banner</button>}
    </ConsentContext.Provider>,
  );

  return { ...utils, setConsent };
}

function readComponentSource(): string {
  return fs.readFileSync(path.join(__dirname, 'ConsentBanner.tsx'), 'utf8');
}

/** Strips comments so prose in the file header (which necessarily
 *  discusses forbidden patterns like "transition" or "role=dialog" by
 *  name) cannot false-positive a source sweep. Mirrors
 *  GoogleAnalytics.test.tsx's FR-4 sweep. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

// ---------------------------------------------------------------------------
// Clauses 1, 8 — present, and exposed as a labelled landmark region
// ---------------------------------------------------------------------------

describe('ConsentBanner — presence and landmark semantics (FR-2 scenario 1, AND IT MUST)', () => {
  it('renders as a landmark region with an accessible name when showBanner is true', () => {
    renderBanner({ showBanner: true });

    const region = screen.getByRole('region', { name: 'Cookie consent' });
    expect(region.tagName).toBe('SECTION');
  });

  it('renders nothing when showBanner is false', () => {
    const { container } = renderBanner({ showBanner: false, consent: 'granted' });

    expect(screen.queryByRole('region', { name: 'Cookie consent' })).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});

// ---------------------------------------------------------------------------
// Clause 10 — visibility comes from showBanner, never a local
// `consent === 'undecided'` composition (DD-7). This is the direct
// behavioural counterpart to the required source-mutation probe recorded
// in the task report: it fixes, as a permanent regression test, the exact
// case a bare `consent === 'undecided'` check gets wrong — the unresolved
// window, where `consent` already reads 'undecided' but the read has not
// resolved yet.
// ---------------------------------------------------------------------------

describe('ConsentBanner — visibility derives from showBanner only (DD-7)', () => {
  it('does NOT render merely because consent is "undecided" while showBanner is false (the unresolved-read window)', () => {
    // A component gated on `consent === 'undecided'` instead of
    // `showBanner` would render the banner here, because `consent` reads
    // 'undecided' during the unresolved window too. Correct behaviour
    // (gating on `showBanner`) renders nothing.
    renderBanner({ consent: 'undecided', loading: true, showBanner: false });

    expect(screen.queryByRole('region', { name: 'Cookie consent' })).not.toBeInTheDocument();
  });

  it('renders when showBanner is true even if consent is already resolved to a non-undecided value in the same tick', () => {
    // Converse check: showBanner is the sole signal, so a (contrived,
    // impossible-in-the-real-provider) mismatch between consent and
    // showBanner still renders purely off showBanner. Proves this
    // component reads no other field to decide visibility.
    renderBanner({ consent: 'granted', loading: false, showBanner: true });

    expect(screen.getByRole('region', { name: 'Cookie consent' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Clauses 4 — not a dialog
// ---------------------------------------------------------------------------

describe('ConsentBanner — is a region, never a dialog (FR-2 BUT / AND IT MUST)', () => {
  it('is exposed as a region, never as role="dialog" or role="alertdialog"', () => {
    renderBanner();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Cookie consent' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Clauses 2, 3 (keyboard half), 5 — keyboard reachability, tab order,
// no focus trap
// ---------------------------------------------------------------------------

describe('ConsentBanner — keyboard reachability and no focus trap (FR-2 scenario 1/2, BUT, NFR-1)', () => {
  it('both controls are real, tabbable <button> elements reachable by keyboard, in order', async () => {
    const user = userEvent.setup();
    renderBanner();

    const rejectButton = screen.getByRole('button', { name: 'Reject' });
    const acceptButton = screen.getByRole('button', { name: 'Accept' });

    // Real buttons, no explicit tabIndex=-1 removing them from the tab order.
    expect(rejectButton.tagName).toBe('BUTTON');
    expect(acceptButton.tagName).toBe('BUTTON');
    expect(rejectButton).not.toHaveAttribute('tabindex', '-1');
    expect(acceptButton).not.toHaveAttribute('tabindex', '-1');

    await user.tab();
    // The privacy link precedes the two buttons in document order.
    expect(screen.getByRole('link', { name: 'privacy notice' })).toHaveFocus();
    await user.tab();
    expect(rejectButton).toHaveFocus();
    await user.tab();
    expect(acceptButton).toHaveFocus();
  });

  it('tabbing forward from the last control leaves the banner and reaches the underlying page — no focus trap', async () => {
    const user = userEvent.setup();
    renderBanner({}, { withPageContent: true });

    const beforeButton = screen.getByRole('button', { name: 'Before banner' });
    const acceptButton = screen.getByRole('button', { name: 'Accept' });
    const afterButton = screen.getByRole('button', { name: 'After banner' });

    beforeButton.focus();
    expect(beforeButton).toHaveFocus();

    // Walk forward through: Before banner → privacy link → Reject → Accept → After banner.
    await user.tab(); // privacy link
    await user.tab(); // Reject
    await user.tab();
    expect(acceptButton).toHaveFocus();

    await user.tab();
    expect(afterButton).toHaveFocus();
  });

  it('the underlying page stays keyboard-reachable while the banner shows (FR-2 scenario 2, keyboard half)', async () => {
    const user = userEvent.setup();
    renderBanner({}, { withPageContent: true });

    const afterButton = screen.getByRole('button', { name: 'After banner' });
    afterButton.focus();
    expect(afterButton).toHaveFocus();

    // Shift+Tab back into the banner and confirm the round trip works —
    // i.e. focus is not corralled to stay inside the banner in either
    // direction.
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Accept' })).toHaveFocus();
  });
});

// ---------------------------------------------------------------------------
// Clause 6 — no backdrop element
// ---------------------------------------------------------------------------

describe('ConsentBanner — no backdrop element (FR-2 BUT)', () => {
  it('renders no backdrop element — exactly one top-level child, the <section> itself', () => {
    const { container } = renderBanner();

    // A backdrop mutation (wrapping the section in, or adding a sibling,
    // `<div className="fixed inset-0 …">`) would either change
    // container.firstElementChild away from SECTION, or grow
    // container.children past length 1 — this assertion reddens under
    // either shape.
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild?.tagName).toBe('SECTION');
  });

  it('contains no element whose class list marks it as a backdrop or full-viewport overlay', () => {
    const source = codeOnly(readComponentSource());

    // Structural sweep, independent of render: the only place a backdrop
    // could be introduced is a class combination like `fixed inset-0` or
    // a literal "backdrop" utility/name. `inset-x-0` (used deliberately by
    // the banner itself for full-width positioning) must not false-positive
    // this — the regex requires the bare `inset-0` token, not `inset-x-0`.
    expect(source).not.toMatch(/\binset-0\b/);
    expect(source).not.toMatch(/backdrop/i);
  });
});

// ---------------------------------------------------------------------------
// Clauses 7, 11 — symmetry: one click, no indirection, writes through setConsent
// ---------------------------------------------------------------------------

describe('ConsentBanner — symmetric one-click resolution (FR-2 BUT, DD-4)', () => {
  it('resolves each choice in exactly one click, with no confirmation step, writing through setConsent', async () => {
    const user = userEvent.setup();
    const { setConsent } = renderBanner();

    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(setConsent).toHaveBeenCalledTimes(1);
    expect(setConsent).toHaveBeenCalledWith('denied');

    // No second step appears after rejecting — no "confirm" or "manage
    // preferences" control is introduced by clicking.
    expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument();
  });

  it('accept resolves in exactly one click too — identical cost to reject', async () => {
    const user = userEvent.setup();
    const { setConsent } = renderBanner();

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(setConsent).toHaveBeenCalledTimes(1);
    expect(setConsent).toHaveBeenCalledWith('granted');
  });

  it('the accept and reject controls share one size/typography class set, differing only in colour utilities', () => {
    renderBanner();

    const rejectButton = screen.getByRole('button', { name: 'Reject' });
    const acceptButton = screen.getByRole('button', { name: 'Accept' });

    // Non-colour utility categories that MUST be identical between the two
    // buttons: spacing, type scale, radius, weight. Anything else
    // (bg-*, text-<colour>, border*, hover:*) is allowed to differ — that's
    // exactly the fill/outline distinction FR-2 `BUT` permits.
    const isColourUtility = (cls: string) =>
      /^(bg|hover:bg)-/.test(cls) ||
      /^text-(primary|primary-fg|fg|muted)$/.test(cls) ||
      /^border/.test(cls);
    const isNonColourUtility = (cls: string) => !isColourUtility(cls);

    const rejectClasses = new Set(rejectButton.className.split(/\s+/).filter(Boolean));
    const acceptClasses = new Set(acceptButton.className.split(/\s+/).filter(Boolean));

    // Symmetric difference: classes present on exactly one of the two
    // buttons. An additive mutation (`${CONTROL_BASE_CLASSES} px-6 …`
    // applied to one button, leaving `px-4` from the shared base intact
    // on the string) still lands `px-6` in this set, because `px-6` is
    // present on one button's class list and absent from the other's —
    // stringContaining-style substring checks miss this; set difference
    // does not.
    const symmetricDifference = [...rejectClasses, ...acceptClasses].filter(
      (cls) => rejectClasses.has(cls) !== acceptClasses.has(cls),
    );

    const nonColourDrift = symmetricDifference.filter(isNonColourUtility);

    expect(nonColourDrift).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Clause 9 — links to /privacy
// ---------------------------------------------------------------------------

describe('ConsentBanner — links to /privacy (FR-2 AND IT MUST)', () => {
  it('links to /privacy', () => {
    renderBanner();

    const link = screen.getByRole('link', { name: 'privacy notice' });
    expect(link).toHaveAttribute('href', '/privacy');
  });
});

// ---------------------------------------------------------------------------
// Clause 12 — jest-axe
// ---------------------------------------------------------------------------

describe('ConsentBanner — axe accessibility (NFR-1)', () => {
  it('has no axe violations (WCAG 2.1 AA structural compliance)', async () => {
    const { container } = renderBanner();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------
// Clause 13 — tokens only (NFR-2), source-level sweep
// ---------------------------------------------------------------------------

describe('ConsentBanner — tokens only, no hardcoded color/geometry (NFR-2)', () => {
  it('uses no hex color, rgb()/hsl(), or undocumented arbitrary Tailwind value', () => {
    const source = codeOnly(readComponentSource());

    // No raw hex colors or rgb()/hsl() functions anywhere in the file.
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\brgb\(|\brgba\(|\bhsl\(|\bhsla\(/);

    // Arbitrary Tailwind values (`bg-[...]`, `text-[...]`, etc.) are
    // disallowed EXCEPT the one documented precedent this task's own brief
    // and design.md §5.4 carve out: `z-[1100]`, justified against
    // MapLegend's existing `z-[1000]`. Any other bracketed arbitrary value
    // reddens this.
    const arbitraryValues = Array.from(source.matchAll(/[a-zA-Z-]+-\[[^\]]+\]/g)).map(
      (match) => match[0],
    );
    arbitraryValues.forEach((value) => {
      expect(value).toBe('z-[1100]');
    });
    // Sanity: the sweep actually found the documented exemption, so an
    // accidental deletion of z-[1100] itself doesn't make this test
    // vacuously pass.
    expect(arbitraryValues).toContain('z-[1100]');
  });
});

// ---------------------------------------------------------------------------
// Clause 14 — no motion (NFR-3, DD-6)
// ---------------------------------------------------------------------------

describe('ConsentBanner — no motion (NFR-3, DD-6)', () => {
  it('contains no transition, animation, or duration utility class', () => {
    const source = codeOnly(readComponentSource());

    expect(source).not.toMatch(/\btransition(-[a-z]+)?\b/);
    expect(source).not.toMatch(/\banimate-[a-z]+\b/);
    expect(source).not.toMatch(/\bduration-[a-z0-9]+\b/);
  });

  it('the rendered DOM carries no transition/animate/duration class either', () => {
    const { container } = renderBanner();

    expect(container.innerHTML).not.toMatch(/\btransition(-[a-z]+)?\b/);
    expect(container.innerHTML).not.toMatch(/\banimate-[a-z]+\b/);
    expect(container.innerHTML).not.toMatch(/\bduration-[a-z0-9]+\b/);
  });
});
