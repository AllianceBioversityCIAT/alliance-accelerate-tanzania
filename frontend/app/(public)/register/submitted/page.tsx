'use client';

/**
 * /register/submitted — receipt screen (T-20, FR-5 scenario 2, FR-14,
 * design.md §5.4).
 *
 * Route shape: `/register/submitted?ref=<referenceCode>` (query-param
 * routing, static-export safe — `frontend/CLAUDE.md`). This is where
 * `OtpVerificationStep`'s `onSubmitted` → `page.tsx`'s `handleSubmitted`
 * (`router.push('/register/submitted?ref=...')`) lands: that hand-off was a
 * documented forward reference (T-19's file header, `RegisterPage`'s file
 * header) until this task, which supplies the page it pushes to. No change
 * to `app/(public)/register/page.tsx` was needed — the existing `router.push`
 * call already targets this exact route shape.
 *
 * Static-export compliance: `useSearchParams()` triggers a CSR bailout under
 * `output: 'export'`, so the view that calls it (`SubmittedView`, below) is
 * wrapped in `<Suspense>` — mirrors `app/(public)/profile/page.tsx` and
 * `app/(public)/directory/page.tsx`, both of which this file's header cites
 * by name (unlike the parent `/register/page.tsx`, which only calls
 * `useRouter()` and needs no such boundary — see that file's own header).
 *
 * This page makes NO network call: the reference arrives entirely via the
 * query string (T-10 already returned it to the applicant at submission
 * time), so there is nothing here to fetch. `/register/status` (FR-6, T-21)
 * does not exist yet as of this task; the link below is the same kind of
 * forward reference `page.tsx` made to this route — T-21 supplies the page
 * it lands on.
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import ReferenceCard from '@/components/register/ReferenceCard';
import Button from '@/components/ui/Button';
import Skeleton from '@/components/ui/Skeleton';

// ---------------------------------------------------------------------------
// Suspense fallback
// ---------------------------------------------------------------------------

function SubmittedFallback() {
  return (
    <div aria-label="Loading your submission receipt" aria-busy="true">
      <Skeleton className="mb-2 h-8 w-64 rounded-md" />
      <Skeleton className="mb-6 h-4 w-80 rounded-sm" />
      <Skeleton className="h-40 w-full rounded-md" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// No-reference state — reached only by navigating here directly with no
// (or an empty) `?ref=`, which the applicant flow itself never does.
// ---------------------------------------------------------------------------

function NoReferenceState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-md border border-border bg-surface px-4 py-16 text-center">
      <p className="text-base font-semibold text-fg">No reference code found</p>
      <p className="max-w-prose text-sm text-muted">
        This page expects a reference code in the link that brought you here. If you just
        submitted a registration, use the reference code shown at that time. If you already have
        one, look up your submission instead.
      </p>
      <Button href="/register/status" variant="secondary">
        Look up a submission
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Receipt view (uses useSearchParams)
// ---------------------------------------------------------------------------

function SubmittedView() {
  const searchParams = useSearchParams();
  const reference = searchParams.get('ref');

  if (!reference) {
    return <NoReferenceState />;
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-extrabold leading-tight text-fg lg:text-3xl">
          Submission received
        </h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Thank you for registering your organisation with ACCELERATE Tanzania.
        </p>
      </div>

      <ReferenceCard reference={reference} />

      {/*
        "What happens next" — FR-5 scenario 2 / design.md §5.4. This section
        describes ONLY 3a's behaviour (this submission exists and can be
        looked up) plus 3b's (a reviewer adjudicates it): a submission sits
        with the ACCELERATE team until reviewed, and the outcome is reachable
        by reference lookup at any time. It frames that lookup — NOT email —
        as the reliable channel, with email as a convenience that may not
        arrive (B32; the equal-channels framing this replaces is exactly what
        R-3 exists to avoid).

        ── The absence this section must NOT contain (FR-5 s2 Disqualifying) ──
        The mockup's "We may email you for more information… you'll get a
        link back to this form" describes chunk 4's review round-trip, which
        this chunk does not implement. Shipping that promise now would be
        false: no such round trip exists, so an applicant told to expect one
        would wait on something that never arrives. The paragraph below
        promises exactly two things — a decision will be made, and it is
        checkable by reference lookup — and nothing about a follow-up
        request for more information or a link back to `/register`.

        `page.test.tsx`'s PRIMARY guard is an exact-text pin on this WHOLE
        SECTION's rendered text (heading + paragraph), not only the
        paragraph itself — a second `<p>` (or any other node) appended here
        is caught exactly like an edit to the existing sentence would be.
        Any change, in any wording, at any position inside this `<section>`,
        fails that assertion and forces a human re-read against FR-5 s2 /
        §5.4 before it can land. A secondary set of regex tripwires
        additionally catches the mockup's own lexical family ("link back to
        ... form", "email you for ... information") without waiting for a
        human pass — but per that file's header, those regexes are NOT a
        semantic oracle and do not claim to catch every possible rewording;
        the pin is what actually closes that gap.
      */}
      <section
        aria-labelledby="what-happens-next-heading"
        className="rounded-md border border-border bg-surface-alt p-6"
      >
        <h2 id="what-happens-next-heading" className="text-base font-semibold text-fg">
          What happens next
        </h2>
        <p className="mt-2 max-w-prose text-sm text-fg">
          A member of the ACCELERATE Tanzania team reviews every submission. Once a decision is
          made, the most reliable way to find out is to look up your submission using your
          reference code and the email address you verified — you can do this at any time with
          the button above. We will also try to email you when a decision is made, but delivery
          is not guaranteed, so please do not rely on it: save your reference code and check back
          with it instead.
        </p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RegistrationSubmittedPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      {/*
        Suspense boundary is REQUIRED here: SubmittedView calls
        useSearchParams(), which triggers a static-export CSR bailout in
        Next.js. Without this boundary, `next build` fails under
        `output: 'export'` (NFR-7). Mirrors `app/(public)/profile/page.tsx`
        and `app/(public)/directory/page.tsx`.
      */}
      <Suspense fallback={<SubmittedFallback />}>
        <SubmittedView />
      </Suspense>
    </div>
  );
}
