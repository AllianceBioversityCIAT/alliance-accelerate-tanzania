// /privacy — Privacy Policy, keeping its existing URL (T-5, FR-5, D-3,
// design.md §4.3, §5.2). Rewritten (T-5) to render through the shared
// `LegalDocumentView` instead of bespoke markup — see design.md §5.1 for
// why data-driven content replaced ~100 lines of interleaved markup.
//
// Cookie content and the `ConsentChoiceControl` island have LEFT this
// page as of T-5 — they now live on `/cookies` (T-4). This page is a
// pure static server component again: no 'use client', no hooks, no
// useSearchParams, and no client island of any kind (NFR-1, ADR-002).
//
// The four contact-channel facts (what a submission collects, who
// receives it, that it is relayed and not stored, that submitting is not
// consent to publish) are carried over as real, delivered content — see
// `lib/content/legal/privacy.ts`'s module doc. The page's self-limiting
// scope statement is RETAINED at this task (design.md §4.3 reversion
// challenge) and only removed once the approved policy replaces it
// (T-8) — deleting it now would over-promise to exactly the visitor it
// protects.

import type { Metadata } from 'next';

import LegalDocumentView from '@/components/legal/LegalDocumentView';
import { PRIVACY_POLICY } from '@/lib/content/legal/privacy';

export const metadata: Metadata = {
  title: 'Privacy notice — ACCELERATE Tanzania Seed Registry',
  description:
    'What the ACCELERATE Tanzania contact form collects, who receives it, and how it is handled.',
};

export default function PrivacyPage() {
  return <LegalDocumentView document={PRIVACY_POLICY} />;
}
