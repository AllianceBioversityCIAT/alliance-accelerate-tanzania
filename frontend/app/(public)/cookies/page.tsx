// /cookies — the factual Cookie Notice (T-4, FR-3, design.md §5.2, §5.3).
//
// This is the consent banner's "learn more" destination (`ConsentBanner`
// targets `/cookies`, per T-6/FR-6). It states what this site's cookies
// actually do today — Google Analytics as the tool, Google as the
// third-party recipient, the four GA4 signals, no cookie before consent,
// the asymmetric withdrawal, and that this site does not itself delete
// cookies already set (requirements.md FR-3, NFR-4).
//
// Static server component: no 'use client', no hooks, no
// useSearchParams (NFR-1, ADR-002). `LegalDocumentView` renders the
// document; `ConsentChoiceControl` — the one 'use client' island this
// page composes, unmodified and unmoved from
// `components/analytics/ConsentChoiceControl.tsx` — is placed via the
// renderer's slot so it sits inside the document flow, immediately after
// the "Changing your choice" section (design.md §5.3), not bolted on
// below the whole page.

import type { Metadata } from 'next';

import LegalDocumentView from '@/components/legal/LegalDocumentView';
import { ConsentChoiceControl } from '@/components/analytics/ConsentChoiceControl';
import { COOKIE_NOTICE, CHANGING_YOUR_CHOICE_HEADING } from '@/lib/content/legal/cookies';

export const metadata: Metadata = {
  title: 'Cookie Notice — ACCELERATE Tanzania Seed Registry',
  description:
    'What cookies this site sets, who receives the data, and how to change your consent choice.',
};

export default function CookiesPage() {
  return (
    <LegalDocumentView
      document={COOKIE_NOTICE}
      slot={{
        afterHeading: CHANGING_YOUR_CHOICE_HEADING,
        content: <ConsentChoiceControl />,
      }}
    />
  );
}
