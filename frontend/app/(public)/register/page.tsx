'use client';

/**
 * /register — public self-registration entry point (T-17; FR-1 scenarios
 * link here; FR-2 is this page's own scope).
 *
 * Static-export safe (NFR-7): no SSR/ISR/route handlers. `useRouter` (T-19,
 * to hand off to the not-yet-built T-20 receipt screen) needs no
 * `<Suspense>` boundary — only `useSearchParams` does (unlike `/profile`,
 * `/directory`).
 *
 * `RegistrationForm` (T-17, embedding T-18's `ConsentPolicyDisclosure` in
 * its own fifth fieldset) and `OtpVerificationStep` (T-19) are two
 * MUTUALLY EXCLUSIVE steps, never both mounted at once: this page UNMOUNTS
 * one and mounts the other on transition, rather than hiding either with
 * `display:none`. That choice is deliberate, not incidental — hiding
 * `RegistrationForm` while `OtpVerificationStep` is active would leave
 * `ConsentPolicyDisclosure` mounted-but-hidden, and its scroll-geometry
 * effect (`ConsentPolicyDisclosure.tsx`) measures a `display:none` element
 * as `0/0/0`, which the pure `hasReachedScrollEnd` predicate reads as
 * "content fits" — silently re-opening the consent gate on any future
 * remount. Unmounting sidesteps that hazard entirely: there is never a
 * hidden-but-mounted `ConsentPolicyDisclosure` for the bug to reach. It
 * also means `RegistrationForm`'s `submitting` prop (present on its type
 * since T-18) has no live use here — nothing async ever happens while
 * `RegistrationForm` is the visible step, since `onValidated` fires
 * synchronously from client-side validation, and it is unmounted, not
 * merely disabled, the instant the step advances.
 *
 * The validated `payload`/`consent`/`email` are held in THIS page's state
 * (not RegistrationForm's, which is about to unmount) precisely so they
 * survive the step transition — a route change would lose them under
 * static export (design.md §5.3), which is why OTP is a step within this
 * page, not its own route.
 *
 * `onBack` (T-19's `OtpVerificationStep` prop): if the server rejects the
 * verified-candidate email at the OTP step (T17-A4 — the client's
 * intentionally-permissive regex can admit an address the server's
 * `@IsEmail()` rejects), there is nothing left to verify. This page resets
 * to the `form` step with a blank `RegistrationForm` — T-17's component has
 * no seam to restore mid-entry values, and adding one is outside T-19's
 * scope (see `OtpVerificationStep.tsx`'s file header).
 *
 * `onSubmitted`: T-20 (receipt screen, `/register/submitted?ref=...`)
 * has not landed yet. This page still performs the documented redirect
 * (this file's own prior header named that target) — `router.push` to a
 * route that does not exist yet is a normal, non-breaking forward
 * reference in this methodology's task order; T-20 supplies the page it
 * lands on.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import RegistrationForm, {
  type RegistrationConsentInput,
  type RegistrationPayloadInput,
} from '@/components/register/RegistrationForm';
import OtpVerificationStep from '@/components/register/OtpVerificationStep';

type Step = 'form' | 'otp';

interface PendingSubmission {
  payload: RegistrationPayloadInput;
  consent: RegistrationConsentInput;
  /**
   * The one verified, top-level address (S-6) — a sibling of `payload` and
   * `consent`, mirroring design.md §3.1's request shape, never a property of
   * `payload`. `RegistrationForm` collects and format-validates it; T-19's
   * `OtpVerificationStep` is the step that proves control of it.
   */
  email: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('form');
  const [pending, setPending] = useState<PendingSubmission | null>(null);

  const handleValidated = (
    payload: RegistrationPayloadInput,
    consent: RegistrationConsentInput,
    email: string,
  ) => {
    setPending({ payload, consent, email });
    setStep('otp');
  };

  const handleBackToForm = () => {
    setPending(null);
    setStep('form');
  };

  const handleSubmitted = (reference: string) => {
    router.push(`/register/submitted?ref=${encodeURIComponent(reference)}`);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-extrabold leading-tight text-fg lg:text-3xl">
        Register your organisation
      </h1>
      <p className="mt-2 max-w-prose text-sm text-muted">
        Tell us about your organisation. An ACCELERATE Tanzania team member reviews every
        submission before it is published to the public registry.
      </p>

      <div className="mt-8">
        {step === 'form' && <RegistrationForm onValidated={handleValidated} />}
        {step === 'otp' && pending && (
          <OtpVerificationStep
            email={pending.email}
            payload={pending.payload}
            consent={pending.consent}
            onSubmitted={handleSubmitted}
            onBack={handleBackToForm}
          />
        )}
      </div>
    </div>
  );
}
