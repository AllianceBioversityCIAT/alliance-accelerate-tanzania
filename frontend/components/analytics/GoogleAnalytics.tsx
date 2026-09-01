'use client';

// @sdd-spec enhancement/usage-analytics (T-3)
/**
 * GoogleAnalytics — the gated GA4 mount (requirements.md FR-1, FR-4, FR-7;
 * design.md §5.5, DD-1).
 *
 * Renders **one** `next/script` element — the vendor's own
 * `gtag/js?id=…` loader — only while `useConsentContext().consent ===
 * 'granted'` and a measurement ID is configured. Nothing is rendered, no
 * DOM node is created, and no `window.gtag` / `window.dataLayer` global is
 * defined in any other state (FR-1: "no script element … no gtag/dataLayer
 * global is created" before consent).
 *
 * Gate on `consent`, not on `showBanner` — `showBanner` is the banner's own
 * derived condition (ConsentProvider.tsx, DD-7) and is unrelated to
 * whether analytics may load. `consent` reads `'undecided'` until the
 * provider's storage read resolves, so gating on `=== 'granted'` is safe
 * during that window even though `loading` is never consulted here: the
 * script cannot appear before a real, resolved grant.
 *
 * **Why one script element, not the classic two-tag GA4 snippet.** GA4's
 * usual documented snippet is a `<script src="…gtag/js?id=…">` loader plus
 * a second inline `<script>` that defines `dataLayer`/`gtag` and calls
 * `gtag('config', …)`. Here the second script's job — define the queue and
 * push the vendor's own init calls — runs inside the loader script's own
 * `onLoad` callback instead of as separate injected markup. `next/script`
 * appends exactly one DOM node for that; `onLoad` is plain JS, not a
 * second `<script>`. This keeps "exactly one script element" true by
 * construction and, as a side effect, makes the config call directly
 * observable in tests as real `window.dataLayer` entries (see
 * GoogleAnalytics.test.tsx) rather than only as static script text.
 *
 * **Zero custom calls (FR-4).** The only calls this file makes are
 * `gtag('js', new Date())` and `gtag('config', measurementId)` — GA4's own
 * initialisation sequence. No `gtag('event', …)`, no custom parameter, no
 * custom dimension, no user-property call exists anywhere in this file.
 * Adding one is a defect this file's tests are built to catch (see the
 * source-sweep and dataLayer-shape tests).
 *
 * **Missing measurement ID (FR-7).** Absent `NEXT_PUBLIC_GA_MEASUREMENT_ID`
 * short-circuits to rendering nothing — same graceful-absence posture as
 * `frontend/lib/auth/amplify-config.ts` for absent `NEXT_PUBLIC_COGNITO_*`.
 * A build without the variable is a build without analytics, never a
 * broken build.
 *
 * **Failure handling (FR-7).** `onError` is swallowed silently: no
 * visitor-facing surface, no console throw, and — deliberately — no retry.
 * A retry loop on a blocked/failed analytics script would itself become a
 * failure mode, which is exactly what FR-7's "AND IT MUST NOT retry in a
 * loop" forbids.
 */

import Script from 'next/script';

import { useConsentContext } from '@/lib/analytics/ConsentProvider';

// ---------------------------------------------------------------------------
// Vendor global typing (scoped to this file — no other call site exists,
// per FR-4)
// ---------------------------------------------------------------------------

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    // Each queued entry is the `arguments` object gtag.js's own snippet
    // pushes (see onLoad below) — not a plain array — so the element type
    // widens to `unknown` rather than `unknown[]`.
    dataLayer?: unknown[];
    gtag?: GtagFn;
  }
}

// ---------------------------------------------------------------------------
// Stable id — dedupes across mount/navigation (design.md §5.5).
// next/script's own module-level caches (node_modules/next/dist/client/script.js)
// key differently: `ScriptCache` on `src`, `LoadCache` on `id || src` — and
// they only prevent a second injection across a *mount/navigation* (e.g. the
// same script re-appearing after an unmount). Re-render dedupe, while this
// component instance stays mounted, is delivered separately by next/script's
// own per-instance `hasLoadScriptEffectCalled` ref guard, not by either
// cache.
// ---------------------------------------------------------------------------

const GA_SCRIPT_ID = 'ga4-gtag-js';

export function GoogleAnalytics() {
  const { consent } = useConsentContext();

  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  // FR-1: gate is non-injection — while not granted, this component
  // renders nothing and creates no DOM node, no global, no cookie.
  if (consent !== 'granted') return null;

  // FR-7: absent config renders nothing and throws nothing.
  if (!measurementId) return null;

  return (
    <Script
      id={GA_SCRIPT_ID}
      src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      strategy="afterInteractive"
      onLoad={() => {
        // The vendor's own init sequence — nothing else. See file header
        // "Zero custom calls".
        //
        // Must be a real (non-arrow) function so `arguments` exists: gtag.js
        // recognises a queued command by the `arguments` object shape, not
        // by a plain Array — pushing `args` (a real Array, from a rest
        // param) is silently ignored by gtag.js and no hit is ever sent,
        // even though the entries land in `dataLayer` looking correct. This
        // matches Google's own canonical snippet
        // (`function gtag(){dataLayer.push(arguments);}`) exactly.
        window.dataLayer = window.dataLayer || [];
        function gtag(..._args: unknown[]) {
          // eslint-disable-next-line prefer-rest-params -- must push the
          // real `arguments` object, not the rest-param array, per the
          // note above.
          window.dataLayer!.push(arguments);
        }
        window.gtag = gtag;
        gtag('js', new Date());
        gtag('config', measurementId);
      }}
      onError={() => {
        // FR-7: swallowed silently — no visitor-facing surface, no
        // uncaught error, and deliberately no retry.
      }}
    />
  );
}
