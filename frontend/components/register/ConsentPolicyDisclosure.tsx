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
 * T-8 (`actors/consent-intake/consent-request-email`): the rendering and the
 * scroll gate moved to `ConsentTextScrollGate.tsx` (shared with the public
 * consent page); this file keeps the fetch and delegates. Behaviour unchanged.
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
 * sections read" names six sections, but the backend today serves nine
 * (`backend/src/registrations/consent-policy.ts`, the current `v1.0`
 * edition). The count below always reads `policy.sections.length` from
 * the fetched payload — never a literal — so it cannot go stale against
 * whatever the server actually serves.
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
 * Checkbox label (T-9 rework attempt 2, Part 3): sourced from the fetched
 * `policy.acceptanceStatement` — the server's `CONSENT_ACCEPTANCE_STATEMENT`
 * — never a hardcoded copy. Hand-copying Legal's sentence into this
 * component would create two divergent copies of the words a person legally
 * accepts, which is exactly what DD-7/D-1 exist to prevent. Before the
 * fetch resolves, and if it fails or the field is somehow absent from an
 * old/misbehaving API response, `FALLBACK_ACCEPTANCE_STATEMENT` below is
 * shown instead — degrading safely to a real, legible label rather than an
 * empty or missing one. That fallback is inert as a legal record on its
 * own: `RegistrationsService.submitRegistration` still validates
 * `consent.policyVersion` against the server's known-version set
 * server-side (design.md §4.1 step 4), so a submission made against a
 * fallback label cannot silently bypass acceptance — it can only ever
 * proceed if the version the applicant was actually shown is one the
 * server recognises.
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

import { useEffect, useRef, useState } from 'react';

import { getConsentPolicy, type ConsentPolicy } from '@/lib/api/registrations';
import ConsentTextScrollGate from './ConsentTextScrollGate';

/**
 * Degrade-safe fallback for the acceptance-checkbox label (see file header)
 * — shown while `getConsentPolicy()` is still in flight, and if it fails or
 * resolves without a usable `acceptanceStatement`. Never an empty label.
 * This is NOT a second copy of Legal's text in the sense DD-7/D-1 forbid:
 * it never reaches an applicant who successfully loaded the real policy,
 * and a submission's `consent.policyVersion` is still checked against the
 * server's known-version set regardless of which label they saw (see file
 * header) — so this string carries no legal weight on its own.
 */
const FALLBACK_ACCEPTANCE_STATEMENT =
  'I have read and accept the Data Protection & Participant Consent Policy.';

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

  return (
    <ConsentTextScrollGate
      title="Data Protection & Participant Consent Policy"
      version={policy?.version}
      sections={policy?.sections ?? null}
      loadFailed={loadFailed}
      acceptanceStatement={policy?.acceptanceStatement || FALLBACK_ACCEPTANCE_STATEMENT}
      checked={checked}
      onChange={onChange}
      error={error}
    />
  );
}
