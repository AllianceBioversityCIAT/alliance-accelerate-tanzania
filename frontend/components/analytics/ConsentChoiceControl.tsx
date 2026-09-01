'use client';

// @sdd-spec enhancement/usage-analytics (T-6)
/**
 * ConsentChoiceControl — the FR-6 / DD-5 change-choice control on
 * `/privacy` (requirements.md FR-6; design.md §5.6, §8.1, DD-4, DD-5).
 *
 * `/privacy` itself (`page.tsx`) stays a static server component; this is
 * the one `'use client'` island DD-5 introduces so the page can host a
 * real control without giving up its static-export shape (ADR-002). The
 * page composes this component directly — no dynamic import, no
 * `<Suspense>` — the same way `app/(public)/contact/page.tsx` composes
 * `ContactForm`.
 *
 * State comes from `useConsentContext()` (`ConsentProvider.tsx`, T-2) — the
 * same context `ConsentBanner` (T-4) and `GoogleAnalytics` (T-3) read.
 * Because all three share one provider (DD-4), calling `setConsent` here
 * updates every consumer immediately: a visitor who is still `undecided`
 * (banner showing) and uses this control to accept or reject sees the
 * banner disappear with no reload, because `showBanner` — derived in the
 * provider (DD-7) — flips to `false` the moment `consent` stops being
 * `'undecided'`. This control never composes that condition itself; it
 * only ever calls `setConsent`.
 *
 * Button idiom and token vocabulary are reused from `ConsentBanner.tsx`
 * (`bg-primary text-primary-fg hover:bg-primary-hover` for accept,
 * `border border-border bg-surface text-fg hover:bg-surface-alt` for
 * reject) rather than imported from it — those classes are private
 * module-level constants there. The accept button keeps `border
 * border-primary`, matching T-4's rationale: it exists for dimensional
 * parity with the reject button's own border, not for a visual effect.
 *
 * Labels read "…analytics cookies" rather than the banner's bare
 * "Accept"/"Reject" so the two controls have distinguishable accessible
 * names when both are mounted at once — the banner in the `(public)`
 * layout, this island on `/privacy`.
 *
 * No `gtag`/`dataLayer` call site here or anywhere this file reaches: the
 * only outbound effect of a click is `setConsent`, which writes to
 * `localStorage` (`consent-storage.ts`). This component never talks to
 * Google directly — that stays `GoogleAnalytics.tsx`'s concern (FR-4).
 */

import { useConsentContext } from '@/lib/analytics/ConsentProvider';
import type { ConsentState } from '@/lib/analytics/consent-storage';

// ---------------------------------------------------------------------------
// Shared control classes — mirrors ConsentBanner.tsx's accept/reject pair so
// the two controls stay visually consistent (see file header).
// ---------------------------------------------------------------------------

const CONTROL_BASE_CLASSES =
  'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';

const ACCEPT_CLASSES = `${CONTROL_BASE_CLASSES} border border-primary bg-primary text-primary-fg hover:bg-primary-hover`;

const REJECT_CLASSES = `${CONTROL_BASE_CLASSES} border border-border bg-surface text-fg hover:bg-surface-alt`;

/** Human-readable status line, gated the same way the provider's own
 *  hydration note recommends: while `loading` is true the real choice is
 *  not yet known, so this says so instead of guessing from the default
 *  `'undecided'` value. */
function statusLabel(consent: ConsentState, loading: boolean): string {
  if (loading) return 'Loading your current choice…';
  if (consent === 'granted') return 'Your current choice for this browser: analytics accepted.';
  if (consent === 'denied') return 'Your current choice for this browser: analytics rejected.';
  return 'You have not yet made a choice for this browser.';
}

export function ConsentChoiceControl() {
  const { consent, loading, setConsent } = useConsentContext();

  return (
    <div className="flex flex-col gap-3">
      <p aria-live="polite" className="text-sm text-muted">
        {statusLabel(consent, loading)}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={REJECT_CLASSES}
          aria-pressed={consent === 'denied'}
          onClick={() => setConsent('denied')}
        >
          Reject analytics cookies
        </button>
        <button
          type="button"
          className={ACCEPT_CLASSES}
          aria-pressed={consent === 'granted'}
          onClick={() => setConsent('granted')}
        >
          Accept analytics cookies
        </button>
      </div>
    </div>
  );
}
