// /contact — public contact page and entry point (T-10, FR-1, FR-6).
//
// Static server component (NFR-5): no 'use client', no useSearchParams, no
// dynamic segment, no route handler. `ContactForm` (T-9) is the only client
// component in this tree — this page merely mounts it, so no <Suspense>
// boundary is needed (design.md §5.2 is explicit that neither new page calls
// useSearchParams()).
//
// Reachable unauthenticated, with no role gate (FR-1's "must NOT require
// sign-in, redirect to /login, or render behind any role gate"): this route
// group's layout.tsx renders Header/Footer with no auth check, and this page
// itself performs none either.

import type { Metadata } from 'next';
import ContactForm from '@/components/contact/ContactForm';

export const metadata: Metadata = {
  title: 'Contact — ACCELERATE Tanzania Seed Registry',
  description:
    'Reach the ACCELERATE Tanzania programme team with a question, correction, or partnership inquiry about the seed registry.',
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-extrabold leading-tight text-fg lg:text-3xl">
        Contact us
      </h1>
      <p className="mt-2 max-w-prose text-sm text-muted">
        Have a question, a correction, or a partnership inquiry? Send a message to the
        ACCELERATE Tanzania programme team and we&rsquo;ll get back to you.
      </p>

      <div className="mt-8">
        <ContactForm />
      </div>
    </div>
  );
}
