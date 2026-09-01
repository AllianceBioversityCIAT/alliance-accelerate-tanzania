// /privacy — privacy notice for the contact channel and, as of T-6, the
// analytics cookies this site sets (T-10, T-6, FR-6, DC-11).
//
// This is FR-6's link target: `ContactForm.tsx`'s privacy-acknowledgement
// copy ("Read our privacy notice…") points to `/privacy`, and until T-10
// that link went nowhere (design.md §5.2 — "does not exist today").
//
// Scope is deliberately narrow — but as of T-6 it is an enumerated
// **two-item** scope, not the original single-item one (design.md §5.6,
// §8.1). This notice covers (1) the contact form: what a submission
// collects, who receives it, that messages are relayed by email and NOT
// stored by the platform, and that submitting is NOT consent to publish
// anything; and (2) analytics cookies: the 4 signals GA4 collects, Google
// as recipient, that cookies are set only after consent, and the control
// below to change a prior choice. It still does not describe how the
// registry handles data collected through organisation registration or
// shown in the public directory — this is not a site-wide privacy policy.
// (§8.1 records why: deleting that limitation instead of re-scoping it
// would turn this page into an implied site-wide policy it does not
// deliver, over-promising to exactly the visitor the limitation protects.)
//
// Static server component (NFR-5): no 'use client', no useSearchParams, no
// dynamic segment, no route handler on THIS file. It is no longer *pure*
// static content, though — `ConsentChoiceControl` below is a small
// 'use client' island (T-6, DD-5) that lets a visitor change their stored
// consent choice without a reload; every other line on this page is static
// markup, exactly as before.

import type { Metadata } from 'next';

import { ConsentChoiceControl } from '@/components/analytics/ConsentChoiceControl';

export const metadata: Metadata = {
  title: 'Privacy notice — ACCELERATE Tanzania Seed Registry',
  description:
    'What the ACCELERATE Tanzania contact form collects, who receives it, how it is handled, and how analytics cookies are used and can be changed.',
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-extrabold leading-tight text-fg lg:text-3xl">
        Privacy notice
      </h1>
      <p className="mt-2 max-w-prose text-sm text-muted">
        This notice covers two things: what happens when you submit the contact form, and
        the analytics cookies this site sets. It does not describe how the registry handles
        data collected through organisation registration or shown in the public directory.
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

        <section aria-labelledby="privacy-analytics-heading">
          <h2 id="privacy-analytics-heading" className="text-lg font-semibold text-fg">
            Analytics cookies
          </h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
            If you consent, this site uses Google Analytics to understand how the registry
            is used. Analytics cookies are set only after you consent &mdash; never before.
            Once consent is granted, four kinds of information are collected and sent to
            Google, which provides the analytics service: page views, sessions (how many
            separate visits occur), your approximate geographic origin at country, region,
            and city level, derived from your IP address (Google Analytics&rsquo; default
            reporting), and your device and browser category (for example, desktop or
            mobile, and browser type).
          </p>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
            You can change this choice at any time, for this browser, using the control
            below.
          </p>
          <div className="mt-4">
            <ConsentChoiceControl />
          </div>
        </section>
      </div>
    </div>
  );
}
