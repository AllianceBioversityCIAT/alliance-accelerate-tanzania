'use client';

// @sdd-spec enhancement/usage-analytics (T-10)
/**
 * PublicShellFrame — the (public) route group's flex-column shell (header /
 * main / footer), plus the FR-2 scenario 2 fix: while the consent banner
 * (`ConsentBanner.tsx`, `fixed bottom-0` over the viewport) is visible, this
 * reserves matching space at the bottom of the document so the banner
 * overlays no footer control **at its settled reading position** (scroll
 * offset 0 or max, where the reservation and the banner's own `fixed
 * bottom-0` coincide).
 *
 * Residual, by design, not oversight: mid-transit scroll positions can still
 * show the banner over a footer control. For a control at document-space
 * centre `c`, a `fixed bottom-0` bar of height `h` in a viewport of height
 * `H` occludes it exactly when the scroll offset `S ∈ [c − H, c − H + h]` —
 * an `h`-wide band that trailing padding cannot move or shrink, because the
 * bar's positioning is independent of document length. That band is
 * necessarily traversed while scrolling past the control, on any page long
 * enough to scroll. Measured against the pre-fix baseline: all 16
 * settled-position occlusions (`/` max ×9, `/map` max ×7) are eliminated.
 * The residual is the mid-transit band on `/map` — 11 cells before the fix
 * and 11 after, with different members, because `mid` is derived from
 * `scrollHeight` and the reservation inflates it. The exact count is
 * sample- and environment-dependent (a session with `/map` 42px shorter
 * measured 10), which is why it is not a gate. Closing the residual would
 * require changing
 * `ConsentBanner.tsx`'s positioning (e.g. off `fixed`), which is out of this
 * task's scope.
 *
 * Why a live measurement, not a table of breakpoint heights: the banner's
 * rendered height is responsive (measured 147px/375 — it wraps to two rows
 * — 75px/768, 72px/1440). A hand-kept table here would be a second place
 * that height has to stay in sync with `ConsentBanner.tsx` — the exact
 * shape of this spec's T-4 border-parity defect (a value duplicated across
 * two files, one edited, the other silently stale). Measuring the banner's
 * own `getBoundingClientRect().height` via `ResizeObserver` instead means
 * there is no second number to maintain: whatever the banner actually
 * renders is exactly what gets reserved, at every width and every wrap.
 *
 * `showBanner` comes from `ConsentProvider`'s derived context value (DD-7),
 * never a local `consent === 'undecided'` check — same reason
 * `ConsentBanner.tsx` gates on it: a bare check is also true during the
 * unresolved hydration window. Reserved space appears and disappears in
 * lockstep with the banner's real visibility.
 *
 * Sticky footer (unchanged from the prior inline shell, moved here
 * verbatim): `flex-1` on `<main>`, not a min-height on the footer, is what
 * keeps the footer pinned to the bottom of the viewport on SHORT
 * pages — the registration flow's OTP and receipt steps are deliberately
 * short, which is where it showed. `paddingBottom` below sits on this same
 * flex container; because Tailwind's preflight sets `box-sizing:
 * border-box`, that padding is consumed *inside* the `min-h-screen` box
 * (not added on top of it), so on most short pages `<main>`'s `flex-1`
 * simply cedes the reserved pixels back to the padding with no visible
 * effect on document height. On pages already taller than the viewport,
 * the padding extends the existing scrollable length so the fixed banner's
 * footprint is included in "the bottom of the page", not layered over the
 * footer.
 *
 * This does NOT guarantee zero new scrollbars on every short page: if a
 * page's own content is already within the reserved amount of exactly
 * filling the viewport, `<main>` hits its intrinsic min-content height
 * before it can cede all of the requested padding, and the container grows
 * past `100vh` — measured on `/register/submitted` at 375px (mobile's
 * banner is the tallest, at 147px). That is the correct trade-off, not a
 * regression: the alternative (clamping the reservation so the box never
 * grows) would silently let the banner cover the footer again on exactly
 * that page, which is the defect this component exists to prevent.
 */

import { useEffect, useState } from 'react';

import Header from '@/components/shell/Header';
import Footer from '@/components/shell/Footer';
import { useConsentContext } from '@/lib/analytics/ConsentProvider';

const BANNER_SELECTOR = 'section[aria-label="Cookie consent"]';

export function PublicShellFrame({ children }: { children: React.ReactNode }) {
  const { showBanner } = useConsentContext();
  const [reservedHeight, setReservedHeight] = useState(0);

  useEffect(() => {
    if (!showBanner) {
      setReservedHeight(0);
      return;
    }

    const bannerEl = document.querySelector(BANNER_SELECTOR);
    if (!bannerEl) {
      // Banner hasn't mounted its DOM node yet on this pass — nothing to
      // measure. showBanner flipping again (it won't, without a consent
      // change) would re-run this effect; in practice ConsentBanner mounts
      // in the same commit as this component.
      return;
    }

    setReservedHeight(bannerEl.getBoundingClientRect().height);

    // jsdom (the Jest environment every test in this repo runs under) has
    // no ResizeObserver global — layout tracking is a real-browser-only
    // concern, so degrade to the one-time measurement above rather than
    // throwing. Every modern evergreen browser this app targets has
    // ResizeObserver.
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      // Re-measure via getBoundingClientRect(), not entry.contentRect — the
      // banner has a top border (`border-t`) and no padding of its own, so
      // contentRect (content box) undercounts the border box by exactly the
      // border width. Using the same border-box measurement here as the
      // initial read above keeps the two paths in agreement instead of the
      // ResizeObserver's first callback silently overwriting a correct
      // initial value with one that is permanently short.
      setReservedHeight(bannerEl.getBoundingClientRect().height);
    });
    observer.observe(bannerEl);

    return () => observer.disconnect();
  }, [showBanner]);

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ paddingBottom: reservedHeight }}
    >
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
