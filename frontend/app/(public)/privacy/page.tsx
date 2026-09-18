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
// `lib/content/legal/privacy.ts`'s module doc. The previous page's
// self-limiting scope statement (that it did not cover registration or
// directory data) was REMOVED at T-8 (FR-5) — the approved policy now
// describes registration and directory data, which makes that statement
// false.

import type { Metadata } from 'next';

import LegalDocumentView from '@/components/legal/LegalDocumentView';
import { PRIVACY_POLICY } from '@/lib/content/legal/privacy';

export const metadata: Metadata = {
  title: 'Privacy Policy — ACCELERATE Tanzania Seed Registry',
  description:
    'How the ACCELERATE Tanzania Registry collects, uses, stores, publishes and protects '
    + 'information submitted through the platform.',
};

export default function PrivacyPage() {
  return <LegalDocumentView document={PRIVACY_POLICY} />;
}
