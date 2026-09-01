// @sdd-spec enhancement/usage-analytics (T-3)
/**
 * GoogleAnalytics.test.tsx — component tests for the gated GA4 mount
 * (requirements.md FR-1, FR-4, FR-7; design.md §5.5, DD-1).
 *
 * Follows the repo's established pattern for driving a component's context
 * in a test (`frontend/app/(admin)/layout.test.tsx`): render
 * `<ConsentContext.Provider value={…}>` directly rather than mocking the
 * provider module.
 *
 * ── A real DOM node, verified, not assumed (KZ-003) ──────────────────────
 * `next/script`'s `afterInteractive` strategy performs a genuine imperative
 * `document.createElement('script')` + `document.body.appendChild(el)` in a
 * `useEffect` (`node_modules/next/dist/client/script.js`, `loadScript`) —
 * this was verified with a throwaway probe against this exact Next 15.5.19
 * install before writing this file. The element IS observable via
 * `document.querySelector`, so every "script element exists / does not
 * exist" assertion below queries the real DOM, never a mock.
 *
 * ── Why some tests below use distinct measurement IDs, and why order
 *    matters for the three "mounted" tests ───────────────────────────────
 * `next/script` (node_modules/next/dist/client/script.js) keeps two
 * **module-level** caches — `ScriptCache` (keyed by `src`) and `LoadCache`
 * (keyed by `id || src`) — that persist for the lifetime of this test
 * file's single module instantiation (this was also verified empirically:
 * neither `jest.resetModules()` nor manual `require.cache` deletion safely
 * resets them without breaking React's module identity). Two consequences
 * this suite is written around:
 *   1. `GoogleAnalytics`'s `id` is fixed (`ga4-gtag-js`, by design — it's
 *      the "stable id" FR-1/design.md §5.5 requires), so the three tests
 *      below that actually mount a live `<Script src>` use a **distinct
 *      measurement id per test** to keep their `src` values distinct and
 *      avoid `ScriptCache` collisions with each other.
 *   2. Firing a real `load` event is the ONLY thing that adds the shared
 *      `id` to `LoadCache` (`afterLoad()` in `loadScript`), and once that
 *      happens every later mount attempt for this id — regardless of
 *      `src` — is short-circuited by `next/script`'s own dedup check
 *      before a DOM node is ever created. This is real, correct
 *      production behaviour (it's what stops a second injection across a
 *      client-side navigation), not a test artifact. Firing `error` does
 *      **not** add to `LoadCache`. Consequence: the ONE test that fires
 *      `load` (the FR-4 dataLayer-shape test) must run LAST among the
 *      tests that need a freshly-mounted script. Do not reorder it above
 *      the other "mounted" tests.
 *
 * ── FR-7 gap: "no retry" is proven for same-id/src only ──────────────────
 * `GoogleAnalytics` itself never calls `loadScript` a second time — there is
 * no retry logic in the component to exercise, on error or otherwise. The
 * FR-7 error test below confirms the DOM stays at one script element after
 * an `error` event, which is everything observable through a single mount
 * with a fixed `src`. A retry attempt via a genuinely *distinct* `src`
 * (e.g. a fallback CDN URL) is not something this component, or this test
 * harness, produces or could observe — it would require code that does not
 * exist. Recorded here rather than left implied by the test's name.
 *
 * ── Two more structural gaps this harness cannot observe (FR-1, FR-7) ────
 * Full clause sweep run for T-3 attempt 3 (`execution.md`). These two
 * clauses have no assertion anywhere in this file and cannot get one from
 * jsdom — recorded rather than left implied by "Done when":
 *   - FR-1 "AND IT MUST create no analytics cookie before the grant": the
 *     only code that could ever set that cookie is inside the vendor
 *     script this component loads via `src` — and jsdom's `next/script`
 *     never fetches or executes that URL, in ANY consent state, real or
 *     fake. A `document.cookie` assertion would read empty identically
 *     whether the FR-1 gate above is correct or deleted entirely — a gate
 *     that cannot fail is not evidence, so none is written. What IS
 *     asserted (the FR-1 "undecided"/"denied" tests above) is the only
 *     thing this component actually controls: the script element — the
 *     sole vector through which the vendor's cookie-setting code could
 *     ever run — does not exist before a grant.
 *   - FR-7 "BUT it must NOT load the script in a way that delays render or
 *     blocks parsing": `GoogleAnalytics.tsx` uses `strategy="afterInteractive"`,
 *     `next/script`'s own documented non-blocking, deferred-execution
 *     strategy (as opposed to `beforeInteractive`), so the component is
 *     written to comply structurally. But jsdom has no parsing or paint
 *     timeline to measure against — there is no "render was delayed by
 *     N ms" jsdom could ever report — so no assertion here could
 *     distinguish a blocking load from a non-blocking one.
 */

import fs from 'fs';
import path from 'path';

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { ConsentContext } from '@/lib/analytics/ConsentProvider';
import type { ConsentContextValue } from '@/lib/analytics/ConsentProvider';
import type { ConsentState } from '@/lib/analytics/consent-storage';

import { GoogleAnalytics } from './GoogleAnalytics';

// ---------------------------------------------------------------------------
// The stable script id GoogleAnalytics.tsx uses (`GA_SCRIPT_ID`). Duplicated
// here as a literal rather than exported from the component, per scope
// discipline — this file only needs to *read* the id GA4 mounts under.
// ---------------------------------------------------------------------------

const GA_SCRIPT_ID = 'ga4-gtag-js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderWithConsent(consent: ConsentState) {
  const value: ConsentContextValue = {
    consent,
    loading: false,
    showBanner: consent === 'undecided',
    setConsent: jest.fn(),
  };
  return render(
    <ConsentContext.Provider value={value}>
      <div data-testid="host-page">host page content</div>
      <GoogleAnalytics />
    </ConsentContext.Provider>,
  );
}

function queryGaScripts(): NodeListOf<HTMLScriptElement> {
  return document.querySelectorAll<HTMLScriptElement>(`script#${GA_SCRIPT_ID}`);
}

function vendorGlobals(): { gtag: unknown; dataLayer: unknown } {
  const w = window as unknown as { gtag?: unknown; dataLayer?: unknown };
  return { gtag: w.gtag, dataLayer: w.dataLayer };
}

const ORIGINAL_GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

afterEach(() => {
  // DOM cleanup: next/script appends directly to document.body, outside
  // RTL's managed container, so RTL's auto-cleanup does not remove it.
  queryGaScripts().forEach((el) => el.remove());
  // Vendor-global cleanup: a leaked window.gtag/dataLayer from one test
  // must never make a later "no vendor global" assertion pass by accident.
  delete (window as unknown as { gtag?: unknown }).gtag;
  delete (window as unknown as { dataLayer?: unknown }).dataLayer;
  if (ORIGINAL_GA_ID === undefined) {
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  } else {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = ORIGINAL_GA_ID;
  }
});

// ---------------------------------------------------------------------------
// FR-1 — no script/global before an explicit grant
// ---------------------------------------------------------------------------

describe('GoogleAnalytics — FR-1 gate: renders only while consent === "granted"', () => {
  it('undecided: no script element and no gtag/dataLayer global exist', () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-UNUSED-UNDECIDED';
    renderWithConsent('undecided');

    expect(queryGaScripts()).toHaveLength(0);
    expect(vendorGlobals()).toEqual({ gtag: undefined, dataLayer: undefined });
  });

  it('denied ("BUT it must NOT inject the script in a denied or pending state"): no script element exists', () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-UNUSED-DENIED';
    renderWithConsent('denied');

    expect(queryGaScripts()).toHaveLength(0);
    expect(vendorGlobals()).toEqual({ gtag: undefined, dataLayer: undefined });
  });

  it('granted but no measurement ID configured: renders nothing and throws nothing (FR-7 graceful absence)', () => {
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

    expect(() => renderWithConsent('granted')).not.toThrow();
    expect(queryGaScripts()).toHaveLength(0);
    expect(vendorGlobals()).toEqual({ gtag: undefined, dataLayer: undefined });
    // The rest of the tree still renders — an absent ID never blanks the page.
    expect(screen.getByTestId('host-page')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// "Mounted" tests — consent granted AND a measurement ID configured.
// See the file-header note: declaration order below is load-bearing.
// ---------------------------------------------------------------------------

describe('GoogleAnalytics — mounted (consent granted, measurement ID configured)', () => {
  it('injects exactly one script element for the configured measurement id, and a re-render does not add a second (FR-1)', () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-ELEMENT-TEST';

    const { rerender } = renderWithConsent('granted');

    const firstPass = queryGaScripts();
    expect(firstPass).toHaveLength(1);
    expect(firstPass[0]).toHaveAttribute(
      'src',
      'https://www.googletagmanager.com/gtag/js?id=G-ELEMENT-TEST',
    );

    // Re-render the same tree (same consent, same component instance) —
    // this is the "a re-render does not add a second" clause.
    rerender(
      <ConsentContext.Provider
        value={{ consent: 'granted', loading: false, showBanner: false, setConsent: jest.fn() }}
      >
        <div data-testid="host-page">host page content</div>
        <GoogleAnalytics />
      </ConsentContext.Provider>,
    );

    expect(queryGaScripts()).toHaveLength(1);
  });

  it('FR-7: a script error event leaves the tree rendered, is swallowed silently (no console error, no visitor-facing surface), and issues no retry', async () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-ERROR-TEST';
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = renderWithConsent('granted');
    const scripts = queryGaScripts();
    expect(scripts).toHaveLength(1);

    // Visitor-facing-surface probe (FR-7 clause 8): snapshot the RTL
    // container's rendered tree BEFORE the error fires. next/script appends
    // its own script node directly to document.body, outside this
    // container (see file header), so this snapshot is untouched by that —
    // it exists purely to catch DOM the *component itself* might render in
    // response to onError (e.g. an inline error banner), which a
    // script-count or host-page-presence assertion cannot see.
    const treeBeforeError = container.innerHTML;

    // next/script's error handling (node_modules/next/dist/client/script.js,
    // `loadScript`) rejects a Promise inside the `error` listener, then runs
    // the component's `onError` in that Promise's `.catch()` — a MICROTASK,
    // not synchronous with the event. A bare, synchronous `fireEvent` (as
    // this test used before rework) proves only that dispatching the event
    // does not throw; it returns before `onError` has had any chance to
    // run, so every assertion below would previously pass identically for
    // a silent handler, a missing `onError` prop, or one that calls
    // `console.error`. Wrapping in `act(async () => …)` and yielding one
    // microtask turn (`await Promise.resolve()`) guarantees the `.catch()`
    // handler has actually executed before any assertion is evaluated.
    await act(async () => {
      fireEvent(scripts[0], new Event('error'));
      await Promise.resolve();
    });

    // The page is still whole: the sibling content is untouched, and GA4
    // renders no visitor-facing DOM of its own to have broken.
    expect(screen.getByTestId('host-page')).toBeInTheDocument();
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    // FR-7 clause 8 ("shows no visitor-facing surface"): the component's
    // own rendered output is byte-identical to before the error. A mutant
    // onError that sets state and renders e.g. `<div role="alert">…</div>`
    // alongside <Script> would grow this string and redden here, even
    // though the host-page/console/script-count assertions above all stay
    // green for that exact mutant (verified — see T-3 execution.md attempt
    // 3, "surface probe").
    expect(container.innerHTML).toBe(treeBeforeError);

    // No retry: still exactly one script element, not two. Note this
    // proves "no retry with the same id/src" only — see the file-header
    // gap note on why a retry via a distinct src is not observable here.
    expect(queryGaScripts()).toHaveLength(1);

    consoleErrorSpy.mockRestore();
  });

  it('FR-4 / NFR-7: the only calls observed after load are the vendor init sequence — no custom event, parameter, dimension, or user-property call', () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-CONFIG-TEST';

    renderWithConsent('granted');
    const scripts = queryGaScripts();
    expect(scripts).toHaveLength(1);

    // This is the ONLY test in this file that fires `load` — see the
    // file-header note on why it must run last among the "mounted" tests.
    fireEvent(scripts[0], new Event('load'));

    const dataLayer = (window as unknown as { dataLayer?: unknown[] }).dataLayer;
    expect(dataLayer).toBeDefined();
    // Behavioral evidence, run in the loaded state (not vacuously on a
    // denied/undecided fixture): exactly two entries, and their command
    // names are only 'js' and 'config' — GA4's own init sequence. No
    // 'event' entry, no third argument carrying a custom parameter or
    // user property.
    expect(dataLayer).toHaveLength(2);

    // ── Command-shape assertion (this is the actual production bug) ──────
    // gtag.js recognises a queued entry as a real command ONLY when it is
    // the `arguments` object our `gtag()` wrapper pushes — a plain Array
    // with the identical elements is silently ignored by gtag.js and no
    // `/g/collect` hit is ever sent, even though it looks identical to
    // `toEqual(['js', expect.any(Date)])`. The previous version of this
    // test asserted only entry *contents* (`toEqual([...])`), which passes
    // equally for `dataLayer.push(args)` (a real Array — the bug) and
    // `dataLayer.push(arguments)` (the fix) because `toEqual` does
    // structural, not type, comparison. That is precisely how this bug
    // shipped to production undetected. Asserting `Array.isArray() ===
    // false` is what actually discriminates the two: see the discrimination
    // proof in this task's completion report, where reverting the
    // component's onLoad to `dataLayer.push(args)` reddens this exact
    // assertion while leaving every other assertion in this file green.
    expect(Array.isArray(dataLayer![0])).toBe(false);
    expect(Array.isArray(dataLayer![1])).toBe(false);

    // Read via Array.from(), which works on an `arguments` object (an
    // array-like, not an Array) the same way it would on a real Array —
    // so the content checks below are unaffected by the shape change above.
    expect(Array.from(dataLayer![0] as ArrayLike<unknown>)).toEqual(['js', expect.any(Date)]);
    expect(Array.from(dataLayer![1] as ArrayLike<unknown>)).toEqual([
      'config',
      'G-CONFIG-TEST',
    ]);
    expect(
      dataLayer!.map((entry) => Array.from(entry as ArrayLike<unknown>)[0]),
    ).toEqual(['js', 'config']);

    expect(typeof (window as unknown as { gtag?: unknown }).gtag).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// FR-4 — source-level sweep for custom-call sites (design.md §5.5 /
// requirements.md §4.1: "plus a source-level check for custom-event call
// sites"). Independent of any render — reads the component's own source.
// ---------------------------------------------------------------------------

describe('GoogleAnalytics — FR-4 source-level sweep', () => {
  it('contains no gtag(...) call whose command is anything other than "js" or "config"', () => {
    const rawSource = fs.readFileSync(path.join(__dirname, 'GoogleAnalytics.tsx'), 'utf8');
    // Strip comments before scanning: this file's own header documentation
    // discusses gtag('event', …) in prose (as the thing that must NOT
    // exist in code), which would otherwise false-positive this sweep.
    const codeOnly = rawSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    const calls = Array.from(codeOnly.matchAll(/\bgtag\(\s*['"]([a-zA-Z_]+)['"]/g)).map(
      (match) => match[1],
    );

    // The falsifying-input check for this test (run manually, not part of
    // the suite): inserting a direct `gtag('event', 'x')` call into
    // GoogleAnalytics.tsx's code (not a comment) adds `'event'` to `calls`
    // and turns this red. The regex only sees a literal `gtag('cmd', …)`
    // call with a string-literal first argument — it does not see
    // `gtag?.('event', …)`, a template-literal or variable command name, or
    // `window.dataLayer.push(['event', …])`. The paired dataLayer-shape
    // behavioural test above (the FR-4 "mounted" test) is what covers
    // those shapes; the two gates are complementary, not redundant.
    expect(calls.length).toBeGreaterThan(0); // sanity: the sweep actually found the real calls
    expect(calls).toEqual(expect.arrayContaining(['js', 'config']));
    calls.forEach((command) => {
      expect(['js', 'config']).toContain(command);
    });
  });
});
