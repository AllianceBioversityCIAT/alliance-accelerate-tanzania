'use client';

// @sdd-spec enhancement/usage-analytics (T-4)
/**
 * ConsentBanner — the FR-2 cookie-consent banner (requirements.md FR-2,
 * NFR-1, NFR-2, NFR-3; design.md §5.3, §5.4, DD-6, DD-7).
 *
 * Semantics — a labelled landmark region, never a dialog (FR-2 `AND IT
 * MUST`). This is a `<section>` with an accessible name (`aria-label`),
 * which the accessibility tree exposes as `role="region"`. It is
 * deliberately **not** `role="dialog"`/`"alertdialog"`: both imply a focus
 * trap and a "must resolve before continuing" expectation, which is
 * exactly what FR-2's `BUT` clauses forbid. No backdrop element exists
 * anywhere in this file, so nothing can intercept pointer events on the
 * page beneath it, and no `useEffect`/`useRef` focus-management runs here
 * — the underlying page's tab order is completely undisturbed by this
 * component's presence (FR-2 scenario 2).
 *
 * Visibility — `showBanner`, never composed locally (DD-7). The provider
 * (`ConsentProvider.tsx`) derives `showBanner` as `!loading && consent ===
 * 'undecided'` specifically so this component does not have to, and must
 * not, reconstruct that condition. A bare `consent === 'undecided'` check
 * is true during the unresolved storage-read window too, which reproduces
 * the FR-3 flash DD-7 exists to prevent — and does so invisibly in jsdom,
 * per `tasks.md` T-4's explicit warning. This component reads only
 * `showBanner` and `setConsent`; it never reads `consent` or `loading`
 * directly.
 *
 * Symmetry (FR-2 `BUT` — rejecting is no harder than accepting). Both
 * controls are real, adjacent `<button>` elements of identical size and
 * font, each resolving the choice in exactly one click via `setConsent`
 * (DD-4) — no confirmation step, no "manage preferences" indirection on
 * either path. The accept button carries the primary fill and the reject
 * button a secondary outline: a visual-hierarchy choice, not a difference
 * in interaction cost.
 *
 * Stacking (design.md §5.4). `fixed bottom-0`, full width, `z-[1100]`.
 * `z-[1100]` is an arbitrary Tailwind value; `docs/ux-ui/design.md` §7
 * defines no z-index scale, and `MapLegend`'s `absolute bottom-6 left-3
 * z-[1000]` is the established in-repo precedent for exactly this kind of
 * value — `z-[1100]` is the lowest value that still clears it, so a
 * reviewer grepping for arbitrary values should read this as precedent,
 * not drift. On `/map` this overlays `MapLegend` (bottom-left); that
 * overlap is an accepted, transient risk recorded in `design.md` §5.4 and
 * §9, verified by rendered capture at T-8 — not by this component or its
 * tests.
 *
 * Motion (NFR-3, DD-6): none. No `transition-*`, no `animate-*`, no
 * `duration-*` class appears anywhere below. The banner's final state
 * renders immediately — there is nothing to gate on
 * `prefers-reduced-motion`, so the requirement is satisfied structurally
 * rather than by a `matchMedia` check.
 *
 * Tokens only (NFR-2) — every class below resolves through
 * `tailwind.config.ts` / `docs/ux-ui/design.md` §7. Reused verbatim from
 * existing call sites rather than invented: `bg-primary text-primary-fg`
 * (accept — the repo's standard filled-button pair) and `border
 * border-border bg-surface` (reject — the repo's standard outlined-surface
 * pair).
 *
 * NOT this task's evidence (see `tasks.md` T-4's disqualifier and the
 * spec's NFR-4/NFR-5 rows): a green `jest-axe` run here is structural a11y
 * coverage only — its `color-contrast` rule is skipped, not passed, under
 * jsdom (`docs/trd/trd.md` QA-11), and jsdom evaluates no layout at all.
 * Contrast is covered separately by `frontend/lib/contrast.test.ts`
 * (reusing `fg`→`surface` / `muted`→`surface`, already in its REACHABLE
 * set); the `primary-fg`→`primary` accept-button pair is an inherited,
 * recorded gap this task does not close. Layout/occlusion at 375/768/1440,
 * including the `/map` overlap, is T-8's rendered-capture evidence, not a
 * unit-test concern.
 */

import Link from 'next/link';

import { useConsentContext } from '@/lib/analytics/ConsentProvider';

// ---------------------------------------------------------------------------
// Shared control classes — factored out so accept/reject stay visually
// symmetric by construction (FR-2 `BUT` — no interaction-cost difference).
// ---------------------------------------------------------------------------

const CONTROL_BASE_CLASSES =
  'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';

const ACCEPT_CLASSES = `${CONTROL_BASE_CLASSES} border border-primary bg-primary text-primary-fg hover:bg-primary-hover`;

const REJECT_CLASSES = `${CONTROL_BASE_CLASSES} border border-border bg-surface text-fg hover:bg-surface-alt`;

export function ConsentBanner() {
  const { showBanner, setConsent } = useConsentContext();

  // DD-7: gate on the provider's derived value only. Do NOT replace this
  // with a locally-composed `consent === 'undecided'` check — see the file
  // header and ConsentProvider.tsx's own DD-7 note for why that specific
  // substitution is a FAIL, not a style preference.
  if (!showBanner) {
    return null;
  }

  return (
    <section
      aria-label="Cookie consent"
      className="fixed bottom-0 inset-x-0 w-full z-[1100] border-t border-border bg-surface shadow-lg"
    >
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          <span className="font-semibold text-fg">We use cookies to understand site usage.</span>{' '}
          We only set analytics cookies if you agree. Read our{' '}
          <Link
            href="/privacy"
            className="text-primary underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm"
          >
            privacy notice
          </Link>{' '}
          to learn more.
        </p>

        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            className={REJECT_CLASSES}
            onClick={() => setConsent('denied')}
          >
            Reject
          </button>
          <button
            type="button"
            className={ACCEPT_CLASSES}
            onClick={() => setConsent('granted')}
          >
            Accept
          </button>
        </div>
      </div>
    </section>
  );
}
