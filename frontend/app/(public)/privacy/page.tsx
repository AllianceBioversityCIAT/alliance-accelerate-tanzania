// /privacy — privacy notice for the contact channel (T-10, FR-6, DC-11).
//
// This is FR-6's link target: `ContactForm.tsx`'s privacy-acknowledgement
// copy ("Read our privacy notice…") points to `/privacy`, and until this
// file existed that link went nowhere (design.md §5.2 — "does not exist
// today"). Scope is deliberately narrow — a notice about the contact
// channel only, per design.md §5.2: what a submission collects, who
// receives it, that messages are relayed by email and NOT stored by the
// platform, and that submitting is NOT consent to publish anything. This is
// not a site-wide privacy policy.
//
// Static server component (NFR-5): no 'use client', no useSearchParams, no
// dynamic segment, no route handler — pure static content.

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy notice — ACCELERATE Tanzania Seed Registry',
  description:
    'What the ACCELERATE Tanzania contact form collects, who receives it, and how it is handled.',
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-extrabold leading-tight text-fg lg:text-3xl">
        Privacy notice
      </h1>
      <p className="mt-2 max-w-prose text-sm text-muted">
        This notice covers the contact form only. It does not describe how the registry
        handles data collected through organisation registration or shown in the public
        directory.
      </p>

      <div className="mt-8 flex flex-col gap-8">
        <section aria-labelledby="privacy-collect-heading">
          <h2 id="privacy-collect-heading" className="text-lg font-semibold text-fg">
            What a submission collects
          </h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
            When you submit the contact form we collect the name, email address,
            organisation (if you provide one), inquiry category, subject and message you
            enter, along with your acknowledgement of this notice.
          </p>
        </section>

        <section aria-labelledby="privacy-recipients-heading">
          <h2 id="privacy-recipients-heading" className="text-lg font-semibold text-fg">
            Who receives it
          </h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
            Your message is sent by email to the ACCELERATE Tanzania programme team
            &mdash; the administrators of this platform &mdash; so they can respond to
            you directly.
          </p>
        </section>

        <section aria-labelledby="privacy-storage-heading">
          <h2 id="privacy-storage-heading" className="text-lg font-semibold text-fg">
            How it is handled
          </h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
            Your message is relayed by email and is not stored by the platform &mdash;
            the registry keeps no copy of what you submit, and no record of your
            submission is added to the seed registry database.
          </p>
        </section>

        <section aria-labelledby="privacy-consent-heading">
          <h2 id="privacy-consent-heading" className="text-lg font-semibold text-fg">
            Not consent to publish
          </h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
            Submitting this form is not consent to publish any organisation&rsquo;s
            information in the public registry. It does not change the consent status,
            contact visibility, or any other record of an actor in the directory.
          </p>
        </section>
      </div>
    </div>
  );
}
