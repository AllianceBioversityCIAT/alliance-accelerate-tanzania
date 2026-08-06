'use client';

/**
 * ConsentPolicyDisclosure — public consent-policy scroll gate (T-18, FR-3
 * scenarios 1-2, NFR-5, DC-17, design.md §5.2).
 *
 * Fetches `GET /registrations/consent-policy` (via `lib/api/registrations.ts`
 * `getConsentPolicy()`), renders the sections in a focusable, scrollable
 * region, and keeps the acceptance checkbox `disabled` — and unticked, at
 * every initial render — until the pure `hasReachedScrollEnd` predicate
 * (`./consent-scroll-gate.ts`, DD-8) reports the applicant has scrolled the
 * region to its end. This is the UX affordance only; the server-side
 * acceptance field is the enforcement (design.md §5.2, FR-3 scenario 2).
 *
 * Controlled component — the one-error-source contract (T-17 obligation).
 * `RegistrationForm` owns a single `errors: Record<string, string>` object
 * and derives both the error summary and every inline message from it. This
 * component therefore holds NO checked/error state of its own: `checked`,
 * `onChange`, and `error` are props, mirroring every other field in
 * `RegistrationForm` (`Field`/`renderInput`). The only state owned here is
 * `policy` (the fetched content) and `reachedEnd` (the scroll-gate's own
 * derived progress) — neither is part of the form's error/value contract.
 *
 * Progress-text section count (T-18 obligation 2): the mockup's "2 of 6
 * sections read" names six sections, but the backend today serves four
 * (`backend/src/registrations/consent-policy.ts`). The count below always
 * reads `policy.sections.length` from the fetched payload — never a
 * literal — so it cannot go stale against whatever the server actually
 * serves.
 *
 * `onPolicyLoaded` (optional): fires once, with the fetched policy's exact
 * `version` string, the moment the fetch resolves successfully. FR-3
 * requires recording the version the applicant was SHOWN, not whatever
 * version the server resolves later at write time — and this component,
 * not its parent, is the one that talks to `GET
 * /registrations/consent-policy` (design.md §5.2 assigns the fetch here).
 * `RegistrationForm` uses this callback to carry the real version into the
 * `consent.policyVersion` it hands `onValidated`, without lifting the fetch
 * itself out of this component or duplicating consent state.
 *
 * Human check (DC-17 — NOT covered by any automated test in this file or
 * `consent-scroll-gate.test.ts`): jsdom performs no layout, so every
 * jsdom-reported `scrollTop`/`clientHeight`/`scrollHeight` is a fabrication
 * (see `ConsentPolicyDisclosure.test.tsx`'s header for exactly what is and
 * is not proven by the tests that inject fake DOM metrics). A person must
 * open `/register` in a real browser and confirm:
 *   1. On page load, the acceptance checkbox is unticked and disabled.
 *   2. Scrolling the policy region partway does NOT enable the checkbox.
 *   3. Scrolling to the true end of the real policy text DOES enable it.
 *   4. The region can be reached and scrolled by keyboard alone (Tab to
 *      focus it, then Arrow Down/Page Down/End to reach the bottom).
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { getConsentPolicy, type ConsentPolicy } from '@/lib/api/registrations';
import { hasReachedScrollEnd, type ScrollEndMetrics } from './consent-scroll-gate';

export interface ConsentPolicyDisclosureProps {
  /** Controlled acceptance value — owned by the parent form (T-17 obligation). */
  checked: boolean;
  /** Called with the new value when the applicant toggles the checkbox. */
  onChange: (checked: boolean) => void;
  /** Inline validation message from the parent's single `errors` object, if any. */
  error?: string;
  /** Fires once, with the fetched policy's exact version, on a successful load. See file header. */
  onPolicyLoaded?: (version: string) => void;
}

export default function ConsentPolicyDisclosure({
  checked,
  onChange,
  error,
  onPolicyLoaded,
}: ConsentPolicyDisclosureProps) {
  const [policy, setPolicy] = useState<ConsentPolicy | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const checkboxId = `${baseId}-checkbox`;
  const progressId = `${baseId}-progress`;
  const errorId = `${baseId}-error`;

  // Read via a ref rather than listed as an effect dependency: the parent
  // (RegistrationForm) passes an inline arrow function that gets a new
  // identity every render, and this effect must still run exactly once
  // (mount) rather than re-fetch on every parent re-render.
  const onPolicyLoadedRef = useRef(onPolicyLoaded);
  onPolicyLoadedRef.current = onPolicyLoaded;

  useEffect(() => {
    let cancelled = false;
    getConsentPolicy().then((result) => {
      if (cancelled) return;
      if (result) {
        setPolicy(result);
        onPolicyLoadedRef.current?.(result.version);
      } else {
        setLoadFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The gate is one-way: once the predicate reports the end has been
  // reached, it stays reached even if the applicant scrolls back up to
  // re-read a section. Re-reading is allowed; re-hiding the control is not
  // the behaviour FR-3 describes.
  const evaluateScrollPosition = useCallback((metrics: ScrollEndMetrics) => {
    if (hasReachedScrollEnd(metrics)) setReachedEnd(true);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    evaluateScrollPosition({
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
    });
  }, [evaluateScrollPosition]);

  // A short policy never fires a scroll event at all — there is nothing to
  // scroll — so the gate must also check geometry proactively once the real
  // sections have rendered (DD-8's "content shorter than its container"
  // case). Gated on `policy` being loaded: checking before the sections
  // exist would measure an empty container and could falsely report "fits",
  // regardless of how long the content about to render actually is.
  useEffect(() => {
    if (!policy) return;
    const el = scrollRef.current;
    if (!el) return;
    evaluateScrollPosition({
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
    });
  }, [policy, evaluateScrollPosition]);

  const totalSections = policy?.sections.length ?? 0;
  const progressText = reachedEnd
    ? `You have reached the end of the policy (${totalSections} section${totalSections === 1 ? '' : 's'}).`
    : `Keep scrolling — ${totalSections} section${totalSections === 1 ? '' : 's'} to review before you can accept.`;

  const describedBy = [progressId, error ? errorId : ''].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-3">
      {/*
        T18-A7: this was an <h4>, but the only other heading on /register is
        RegisterPage's <h1> — an h1 -> h4 skip that only exists once this
        component is composed into the page (each component's own axe run
        passed in isolation because the h4 was first there). The fieldset
        <legend>s around this component are not headings, so this is the
        page's second real heading and belongs at <h2>.
      */}
      <h2 id={headingId} className="text-sm font-semibold text-fg">
        Data Protection &amp; Participant Consent Policy
        {policy && <span className="ml-2 font-normal text-muted">v{policy.version}</span>}
      </h2>

      {/*
        The focusable scroll region (FR-3 scenario 2's keyboard clause):
        tabIndex={0} + role="region" + aria-labelledby, so a keyboard user
        can Tab to it and reach the end with Arrow/Page/End keys without a
        pointer.
      */}
      <div
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-labelledby={headingId}
        onScroll={handleScroll}
        className={[
          'max-h-64 overflow-y-auto rounded-md border border-border bg-surface p-4',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        ].join(' ')}
      >
        {loadFailed && (
          <p role="alert" className="text-sm text-danger">
            We couldn&apos;t load the consent policy. Please refresh the page and try again.
          </p>
        )}
        {!policy && !loadFailed && <p className="text-sm text-muted">Loading policy…</p>}
        {policy?.sections.map((section) => (
          <section key={section.heading} className="mb-4 last:mb-0">
            {/* h3, one level under the h2 above (T18-A7) — was h5, which
                skipped two levels once the outer heading moved from h4 to
                h2 in the same fix. */}
            <h3 className="text-sm font-semibold text-fg">{section.heading}</h3>
            <p className="mt-1 text-sm text-muted">{section.body}</p>
          </section>
        ))}
      </div>

      <p id={progressId} aria-live="polite" className="text-xs text-muted">
        {progressText}
      </p>

      <div className="flex items-start gap-2">
        <input
          id={checkboxId}
          type="checkbox"
          checked={checked}
          disabled={!reachedEnd}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={describedBy}
          className={[
            'mt-0.5 h-4 w-4 rounded border-border text-primary',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
          ].join(' ')}
        />
        <label htmlFor={checkboxId} className="text-sm text-fg">
          I have read and accept the Data Protection &amp; Participant Consent Policy.
        </label>
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
