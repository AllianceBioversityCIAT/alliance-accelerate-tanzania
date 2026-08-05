'use client';

/**
 * /register — public self-registration entry point (T-17; FR-1 scenarios
 * link here; FR-2 is this page's own scope).
 *
 * Static-export safe (NFR-7): no SSR/ISR/route handlers, no `useSearchParams`
 * so no `<Suspense>` boundary is required here (unlike `/profile`,
 * `/directory`).
 *
 * This page currently renders ONLY `RegistrationForm` (T-17's scope), which
 * as of T-18 embeds the real, scroll-gated `ConsentPolicyDisclosure` in its
 * own fifth fieldset — consent is part of the FORM step, not a separate
 * page-level step, per `RegistrationForm`'s own seam design (its file
 * header). The full applicant flow design.md §5 describes two more steps
 * this task deliberately does not build:
 *   1. OTP verification (T-19) — `OtpVerificationStep`; the ONLY place in
 *      this flow that calls the network for a WRITE (`POST /verify`, `POST
 *      /registrations`) — `ConsentPolicyDisclosure`'s own read-only `GET
 *      /registrations/consent-policy` fetch is not this restriction's
 *      concern. T-17/T-18 must not call a write endpoint directly, since
 *      doing so would require the OTP exchange T-19 owns.
 *   2. Receipt (T-20) — redirects to `/register/submitted?ref=...`.
 *
 * `Step` is a seam, not an implementation: `'form'` is the only reachable
 * value today. T-19 extends the union and the render switch below without
 * restructuring this page. The validated payload/consent are held in this
 * page's state (not RegistrationForm's) because they must survive the OTP
 * step that comes after RegistrationForm unmounts — a route change would
 * lose them under static export (design.md §5.3), which is exactly why OTP
 * is a step within this page, not its own route.
 */

import { useState } from 'react';

import RegistrationForm, {
  type RegistrationConsentInput,
  type RegistrationPayloadInput,
} from '@/components/register/RegistrationForm';

type Step = 'form'; // T-19 adds 'otp'.

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
  const [step] = useState<Step>('form');
  // T-19 seam — see file header. Not yet read anywhere; that is next
  // task's wiring, not this one's.
  const [, setPending] = useState<PendingSubmission | null>(null);

  const handleValidated = (
    payload: RegistrationPayloadInput,
    consent: RegistrationConsentInput,
    email: string,
  ) => {
    setPending({ payload, consent, email });
    // T-19 seam: once OtpVerificationStep exists, advance `step` here.
    // There is nowhere else to go yet — the write network call belongs to
    // T-19, not this task.
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
      </div>
    </div>
  );
}
