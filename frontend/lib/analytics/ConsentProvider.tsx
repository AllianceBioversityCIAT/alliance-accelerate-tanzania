'use client';

// @sdd-spec enhancement/usage-analytics (T-2)
/**
 * ConsentProvider — owns the FR-3 consent state and exposes it, plus a
 * setter, to every consumer that needs it (requirements.md FR-1, FR-3;
 * design.md §5.2, DD-4).
 *
 * Mirrors `frontend/lib/auth/SessionProvider.tsx`: `'use client'`, a
 * `createContext` with a module-level default, a value `useState` plus a
 * separate `loading` boolean, a `useEffect` that resolves the real value
 * post-mount, and an exported `useConsentContext()` hook.
 *
 * **Hydration note (design.md §5.2).** `readConsent()` is synchronous, but
 * it must NOT be called during the initial render — during static
 * prerender/SSR `window` does not exist, so the server-rendered markup is
 * always built from `undecided`. If the client's first render (the pass
 * React reconciles against that markup, before hydration commits) called
 * `readConsent()` eagerly via a lazy `useState` initializer, a visitor who
 * already has a stored choice would render with a *different* value than
 * the server did — a hydration mismatch, and (per the disqualifier this
 * task carries) a banner-visible frame for a visitor who already decided.
 * Initializing to the same safe default on both server and client, then
 * resolving the real value in `useEffect` (which never runs during SSR and
 * always runs after the client commits its first, matching pass) is what
 * guarantees zero banner-visible frames for a visitor with a stored choice.
 *
 * **`showBanner` (design.md §5.2, DD-7, added 2026-08-31).** The context
 * also exposes a derived `showBanner` boolean — true only once `loading` is
 * `false` **and** `consent === 'undecided'`. Consumers (T-4's banner) MUST
 * gate on this value and MUST NOT reconstruct the condition themselves: a
 * bare `consent === 'undecided'` check is true during the unresolved
 * window too, which reproduces exactly the flash this provider exists to
 * prevent, invisibly in jsdom. `consent` and `loading` stay exported raw
 * for T-3 (gates on `granted`) and T-6 (needs the current choice) — only
 * the banner's condition is the provider's to compute.
 *
 * This provider renders `{children}` unconditionally and nothing else — no
 * `ConsentBanner`, no `GoogleAnalytics`. Composing those is T-4/T-3's
 * components, wired together at T-5 in the `(public)` layout.
 *
 * Usage (wired at T-5):
 *   // app/(public)/layout.tsx
 *   import { ConsentProvider } from '@/lib/analytics/ConsentProvider';
 *   <ConsentProvider>{children}</ConsentProvider>
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { readConsent, writeConsent, type ConsentChoice, type ConsentState } from './consent-storage';

// ---------------------------------------------------------------------------
// Context value shape
// ---------------------------------------------------------------------------

export interface ConsentContextValue {
  /**
   * The visitor's resolved consent state. Always `undecided` until
   * `loading` becomes `false` (design.md §5.2 Hydration note); after that,
   * whatever `readConsent()` resolved to at mount, or whatever a later
   * `setConsent()` call recorded.
   *
   * This is the value FR-1 gates GA4 injection on (`granted` only) and the
   * value FR-2's banner gates visibility on (`undecided` only, and only
   * once `loading` is `false`).
   */
  consent: ConsentState;
  /**
   * `true` until the initial storage read has resolved. Consumers MUST
   * treat `loading === true` as "not yet safe to decide anything from
   * `consent`" — in particular, the banner must not render while
   * `loading` is `true`, even though `consent` reads `undecided` in that
   * window too (design.md §5.2 Hydration note; the "no banner-visible
   * frame for a returning visitor" disqualifier this task carries).
   */
  loading: boolean;
  /**
   * Derived (design.md §5.2, DD-7): `true` only when `loading` is `false`
   * **and** `consent === 'undecided'`. This is the condition the banner
   * (T-4) MUST render on, instead of composing `consent === 'undecided'`
   * locally — that bare check is also true during the unresolved window
   * and reproduces the FR-3 flash this provider exists to prevent.
   */
  showBanner: boolean;
  /**
   * Records the visitor's choice: writes it through to storage
   * (`writeConsent`, which never throws — consent-storage.ts's own
   * contract) and updates `consent` for every consumer immediately, with
   * no reload required (DD-4 — this is the reason a single provider owns
   * the state instead of each consumer reading storage independently).
   */
  setConsent: (choice: ConsentChoice) => void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONTEXT: ConsentContextValue = {
  consent: 'undecided',
  loading: false,
  // Hardcoded `false`, not derived: a consumer rendered outside
  // ConsentProvider has no real hydration flow to gate and must never show
  // a banner, so this stays `false` even though `loading: false` plus
  // `consent: 'undecided'` would satisfy the derived formula inside the
  // real provider below.
  showBanner: false,
  setConsent: () => {
    // No-op default: a consumer rendered outside ConsentProvider gets the
    // safe, inert value — mirrors SessionProvider's DEFAULT_CONTEXT posture.
  },
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const ConsentContext = createContext<ConsentContextValue>(DEFAULT_CONTEXT);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsentState] = useState<ConsentState>('undecided');
  const [loading, setLoading] = useState<boolean>(true);

  // On mount: resolve the stored choice (design.md §5.2 Hydration note —
  // this MUST run in an effect, never during the render pass, so the
  // client's first render matches the server's `undecided`/`loading`
  // markup exactly).
  useEffect(() => {
    setConsentState(readConsent());
    setLoading(false);
  }, []);

  const setConsent = useCallback((choice: ConsentChoice) => {
    writeConsent(choice);
    setConsentState(choice);
  }, []);

  // Derived (design.md §5.2, DD-7): true only once the storage read has
  // resolved AND the state is `undecided`. Computed here, once, so no
  // consumer has the chance to compose the (wrong) bare
  // `consent === 'undecided'` check itself.
  const showBanner = !loading && consent === 'undecided';

  // ── Render ───────────────────────────────────────────────────────────────
  // Children render unconditionally, regardless of consent state or
  // loading — this provider is state-only and renders nothing of its own.

  return (
    <ConsentContext.Provider value={{ consent, loading, showBanner, setConsent }}>
      {children}
    </ConsentContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Returns the raw ConsentContextValue. Consumed by ConsentBanner (T-4),
 *  GoogleAnalytics (T-3), ConsentChoiceControl (T-6), and PublicShellFrame
 *  (T-10). */
export function useConsentContext(): ConsentContextValue {
  return useContext(ConsentContext);
}
