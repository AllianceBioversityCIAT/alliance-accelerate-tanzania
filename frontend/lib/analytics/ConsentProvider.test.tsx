// @sdd-spec enhancement/usage-analytics (T-2)
/**
 * ConsentProvider.test.tsx
 *
 * Covers (requirements.md FR-1, FR-3; design.md §5.2, DD-4, DD-7; tasks.md
 * T-2 `Done when`):
 *   - state resolves from storage after mount
 *   - a stored choice never produces a banner-visible frame — including
 *     the frame BEFORE the storage read resolves
 *   - `showBanner` is exposed and true only once resolved + `undecided`
 *   - the setter writes through to storage and updates consumers
 *   - children render regardless of consent state
 *
 * Evidence disqualifier this suite exists to satisfy (tasks.md T-2): "no
 * banner on first frame" passes vacuously if the component renders nothing
 * at all, ever. Since `ConsentBanner` (T-4) does not exist yet, this suite
 * uses a test-double consumer — `ConsentProbe` below — that renders a
 * `banner-marker` element only when the context's `showBanner` is true,
 * i.e. exactly the condition a real banner must gate on (DD-7 — consumers
 * use `showBanner`, they do not compose `consent === 'undecided'`
 * themselves). Every "the marker never appears" assertion is paired with
 * at least one "the marker DOES appear" assertion elsewhere in this file
 * (the no-stored-record positive control), so a provider that renders
 * nothing at all would fail that test — a one-sided absence-only suite
 * could not tell the two apart (KZ-002).
 *
 * Per the forward pointer recorded in T-1's review (execution.md), this
 * suite seeds real `window.localStorage` via the exported storage module
 * rather than mocking it — the more faithful route, and sufficient here
 * because `readConsent`/`writeConsent` are synchronous and jsdom provides
 * a real `localStorage`.
 *
 * ---------------------------------------------------------------------
 * Per-commit frame log (added on T-2 rework, Reviewer FAIL Issue 1).
 * ---------------------------------------------------------------------
 * `readConsent()` is synchronous, so React Testing Library's `act()`-
 * wrapped `render()` flushes the provider's mount `useEffect` (a passive
 * effect) to completion before `render()` returns. A `screen.query*`
 * assertion made after `render()` therefore can only ever observe the
 * POST-resolution frame — it cannot reach the pre-resolution frame, no
 * matter how it's worded. That is a real limit of assertions placed after
 * `render()` returns, but it is not a limit of the harness overall: a
 * dependency-free `useLayoutEffect` inside `ConsentProbe` runs in the
 * layout phase of EVERY commit, including the first one — strictly before
 * the provider's passive mount effect fires on that same pass. `frameLog`
 * below is populated from that layout effect, so it captures the
 * pre-resolution commit that a post-`render()` assertion cannot reach.
 *
 * `frameLog` records, per commit, whether the banner marker was actually
 * in the DOM (`document.querySelector('[data-testid="banner-marker"]') !==
 * null`) — the rendered consequence, not just the raw context values, so
 * the log is evidence about what a visitor would actually have seen.
 *
 * Proven to discriminate (tasks.md T-2 ⚠️): applying the mutation
 * `useState<boolean>(true)` → `useState<boolean>(false)` on `loading` in
 * `ConsentProvider.tsx` was run against this suite; the frame-log
 * assertions in both stored-choice tests and the no-stored-record positive
 * control turned red (a stored-`granted`/`denied` visitor's first commit
 * shows the banner marker, and the no-record test's recorded sequence
 * stops matching `[false, true]`). Verbatim failing output captured in
 * this task's completion report; the mutation was reverted after
 * confirming.
 */

import React, { useLayoutEffect } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';

import { ConsentProvider, useConsentContext } from './ConsentProvider';
import { writeConsent, readConsent, type ConsentChoice } from './consent-storage';

// ---------------------------------------------------------------------------
// Per-commit frame log (see file header)
// ---------------------------------------------------------------------------

let frameLog: boolean[];

// ---------------------------------------------------------------------------
// Test double consumer
// ---------------------------------------------------------------------------

/**
 * Stands in for `ConsentBanner` (T-4) + a probe into the raw context value.
 * `banner-marker` renders under the exact condition a real banner must:
 * the context's derived `showBanner` (DD-7) — never a locally-composed
 * `consent === 'undecided'` check. `loading-state` / `consent-state` /
 * `show-banner-state` expose the raw and derived contract values so a
 * test can assert the hydration transition itself, not just its visible
 * consequence. The dependency-free `useLayoutEffect` pushes one entry into
 * `frameLog` on every commit (see file header).
 */
function ConsentProbe() {
  const { consent, loading, showBanner, setConsent } = useConsentContext();

  useLayoutEffect(() => {
    frameLog.push(document.querySelector('[data-testid="banner-marker"]') !== null);
  });

  return (
    <div>
      <span data-testid="loading-state">{loading ? 'loading' : 'resolved'}</span>
      <span data-testid="consent-state">{consent}</span>
      <span data-testid="show-banner-state">{showBanner ? 'true' : 'false'}</span>
      {showBanner && <div data-testid="banner-marker">banner</div>}
      <button onClick={() => setConsent('granted')}>grant</button>
      <button onClick={() => setConsent('denied')}>deny</button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  frameLog = [];
});

// ---------------------------------------------------------------------------
// Shared render-and-resolve helper
// ---------------------------------------------------------------------------

/**
 * Seeds storage with `stored` when given (omit for the no-record case),
 * renders `ConsentProvider` around `ConsentProbe`, and awaits the resolved
 * frame (`loading-state` === `resolved`). Collapses the six lines of setup
 * ceremony repeated across this file's tests, which varied in exactly one
 * thing — which choice was seeded, or none — so callers keep that seeded
 * state visible at the call site (`await renderResolved('granted')`,
 * `await renderResolved()`) instead of it disappearing into a `beforeEach`.
 */
async function renderResolved(stored?: ConsentChoice) {
  if (stored) writeConsent(stored);
  render(
    <ConsentProvider>
      <ConsentProbe />
    </ConsentProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('loading-state')).toHaveTextContent('resolved'));
}

// ---------------------------------------------------------------------------
// State resolves from storage after mount (Done when #1)
// ---------------------------------------------------------------------------

describe('ConsentProvider — state resolves from storage after mount', () => {
  it('resolves to the stored `granted` choice once the read completes', async () => {
    await renderResolved('granted');
    expect(screen.getByTestId('consent-state')).toHaveTextContent('granted');
    expect(screen.getByTestId('show-banner-state')).toHaveTextContent('false');
  });

  it('resolves to the stored `denied` choice once the read completes', async () => {
    await renderResolved('denied');
    expect(screen.getByTestId('consent-state')).toHaveTextContent('denied');
    expect(screen.getByTestId('show-banner-state')).toHaveTextContent('false');
  });

  it('resolves to `undecided` when no record is stored', async () => {
    await renderResolved();
    expect(screen.getByTestId('consent-state')).toHaveTextContent('undecided');
    expect(screen.getByTestId('show-banner-state')).toHaveTextContent('true');
  });
});

// ---------------------------------------------------------------------------
// A stored choice never produces a banner-visible frame (Done when #2,
// FR-3 "banner does not reappear after a choice") — including the frame
// BEFORE the storage read resolves, per the frame log.
// ---------------------------------------------------------------------------

describe('ConsentProvider — a stored choice never produces a banner-visible frame', () => {
  it('never shows the banner marker for a stored `granted` choice, on any commit (frame log)', async () => {
    await renderResolved('granted');

    // `renderResolved` seeds storage, renders, and awaits the resolved
    // frame — by the time it returns, `act()` has already flushed the
    // synchronous mount effect (see file header), so every `screen.query*`
    // assertion here observes the same post-resolution frame; no
    // `screen.query*` placed anywhere after `render()` can reach the
    // pre-resolution frame. That frame is only reachable via `frameLog`
    // (checked below), captured from the layout phase of the first commit.
    expect(screen.queryByTestId('banner-marker')).not.toBeInTheDocument();
    expect(screen.getByTestId('consent-state')).toHaveTextContent('granted');
    expect(screen.queryByTestId('banner-marker')).not.toBeInTheDocument();

    // Pre-resolution frame, captured via the layout-phase frame log: no
    // commit — including the first, before the mount effect resolves —
    // ever rendered the banner marker.
    expect(frameLog.every((bannerWasVisible) => bannerWasVisible === false)).toBe(true);
  });

  it('never shows the banner marker for a stored `denied` choice, on any commit (frame log)', async () => {
    await renderResolved('denied');

    expect(screen.queryByTestId('banner-marker')).not.toBeInTheDocument();
    expect(screen.getByTestId('consent-state')).toHaveTextContent('denied');
    expect(screen.queryByTestId('banner-marker')).not.toBeInTheDocument();

    expect(frameLog.every((bannerWasVisible) => bannerWasVisible === false)).toBe(true);
  });

  // Positive control (KZ-002): the marker MUST appear once the read
  // resolves with no stored record, and — per the frame log — it must be
  // ABSENT on the commit before that and PRESENT on the commit after,
  // in this same test. Without this test, the "never shows the marker"
  // assertions above pass identically whether the provider gates
  // correctly or simply never renders anything — this is the assertion
  // that discriminates a working hydration gate from a broken provider.
  it('DOES show the banner marker once the read resolves with no stored record, and the frame log records absent-then-present', async () => {
    await renderResolved();

    expect(screen.getByTestId('consent-state')).toHaveTextContent('undecided');
    expect(screen.getByTestId('show-banner-state')).toHaveTextContent('true');
    expect(screen.getByTestId('banner-marker')).toBeInTheDocument();

    // The literal pre/post-resolution proof: one commit before the read
    // resolves (banner absent), one commit after (banner present).
    expect(frameLog).toEqual([false, true]);
  });
});

// ---------------------------------------------------------------------------
// The setter writes through to storage and updates consumers (Done when #3,
// DD-4 — no reload required)
// ---------------------------------------------------------------------------

describe('ConsentProvider — setConsent writes through and updates consumers', () => {
  it('recording `granted` updates the context value and persists to storage, with no reload', async () => {
    render(
      <ConsentProvider>
        <ConsentProbe />
      </ConsentProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('banner-marker')).toBeInTheDocument());

    await act(async () => {
      screen.getByRole('button', { name: 'grant' }).click();
    });

    // Consumer re-renders immediately — no navigation, no remount.
    expect(screen.getByTestId('consent-state')).toHaveTextContent('granted');
    expect(screen.getByTestId('show-banner-state')).toHaveTextContent('false');
    expect(screen.queryByTestId('banner-marker')).not.toBeInTheDocument();

    // The write actually reached storage — a fresh, independent read agrees.
    expect(readConsent()).toBe('granted');
  });

  it('recording `denied` updates the context value and persists to storage', async () => {
    render(
      <ConsentProvider>
        <ConsentProbe />
      </ConsentProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('banner-marker')).toBeInTheDocument());

    await act(async () => {
      screen.getByRole('button', { name: 'deny' }).click();
    });

    expect(screen.getByTestId('consent-state')).toHaveTextContent('denied');
    expect(screen.getByTestId('show-banner-state')).toHaveTextContent('false');
    expect(screen.queryByTestId('banner-marker')).not.toBeInTheDocument();
    expect(readConsent()).toBe('denied');
  });
});

// ---------------------------------------------------------------------------
// Children render regardless of consent state (Done when #4)
// ---------------------------------------------------------------------------

describe('ConsentProvider — children render unconditionally', () => {
  it('renders children regardless of the resolved consent state, with no async settling required', () => {
    writeConsent('denied');
    render(
      <ConsentProvider>
        <div data-testid="child">child content</div>
      </ConsentProvider>,
    );

    // No await / waitFor needed: children are rendered unconditionally, so the assertion holds on the frame render() leaves behind.
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('keeps rendering children after the read resolves to `undecided`, `granted`, and `denied`', async () => {
    for (const stored of ['granted', 'denied', undefined] as const) {
      window.localStorage.clear();
      if (stored) writeConsent(stored);

      const { unmount } = render(
        <ConsentProvider>
          <div data-testid="child">child content</div>
        </ConsentProvider>,
      );

      await waitFor(() => expect(screen.getByTestId('child')).toBeInTheDocument());
      unmount();
    }
  });
});

// ---------------------------------------------------------------------------
// Default context (mirrors SessionProvider's "outside provider" precedent)
// ---------------------------------------------------------------------------

describe('ConsentProvider — useConsentContext() outside a provider', () => {
  it('returns the safe default (undecided, not loading, no banner) with no crash', () => {
    function Bare() {
      const { consent, loading, showBanner } = useConsentContext();
      return (
        <span data-testid="bare">{`${consent}:${loading}:${showBanner}`}</span>
      );
    }

    render(<Bare />);
    expect(screen.getByTestId('bare')).toHaveTextContent('undecided:false:false');
  });
});
