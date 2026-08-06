'use client';

/**
 * /register/status — public status lookup screen (T-21, FR-6 scenario 1,
 * design.md §5.4).
 *
 * Linked from `ReferenceCard` (T-20's "Check the status of your submission"
 * button — reworded during T-21 review; see that component's own comment)
 * and `NoReferenceState` (`app/(public)/register/submitted/page.tsx`'s
 * "Look up a submission" button) — both were forward references to this
 * exact route until this task, which is the page they land on. Neither
 * passes a reference via the URL: unlike `/register/submitted?ref=`, this
 * page takes BOTH its inputs (reference and the verified email) from the
 * applicant directly, on the page itself, through `StatusLookupForm`. That
 * is deliberate, not an oversight — carrying the reference in via `?ref=`
 * would cost nothing on its own (the reference is not PII), but it buys
 * nothing either, since `StatusLookupForm` still needs the email typed in,
 * and a partially-prefilled form is not simpler than an empty one.
 *
 * No `useSearchParams()` here, so — unlike `/register/submitted`'s
 * `SubmittedView` — this page needs NO `<Suspense>` boundary under static
 * export (`frontend/CLAUDE.md`: only `useSearchParams()` triggers the CSR
 * bailout `output: 'export'` requires wrapping; a plain client component
 * with no such hook does not). `'use client'` alone is enough, mirroring
 * `app/(public)/register/page.tsx`'s own reasoning for the same omission.
 *
 * This page makes NO network call of its own — `StatusLookupForm` owns the
 * one `POST /registrations/lookup` request (design.md §3.1 decision 3,
 * FR-6) — and echoes back only what that response can ever carry: a status
 * and, optionally, a reviewer note (FR-8's containment guarantee, carried
 * through to this surface).
 */

import StatusLookupForm from '@/components/register/StatusLookupForm';

export default function RegistrationStatusPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-extrabold leading-tight text-fg lg:text-3xl">
          Check your submission status
        </h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Enter your reference code and the email address you verified when you registered. We
          will show you the status of your submission and any note left by the review team.
        </p>
      </div>

      <div className="mt-8">
        <StatusLookupForm />
      </div>
    </div>
  );
}
