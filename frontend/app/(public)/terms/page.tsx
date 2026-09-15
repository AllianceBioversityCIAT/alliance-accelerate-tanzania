// /terms — Terms of Use (T-5, FR-4, design.md §4.3, §5.2).
//
// New route. Static server component: no 'use client', no hooks, no
// useSearchParams (NFR-1, ADR-002). Renders `TERMS_OF_USE` — currently
// placeholder prose, pending delivery from Legal (T-8) — through the
// shared `LegalDocumentView`, with no slot: nobody accepts this document
// (D-6), so this page composes no acceptance control, checkbox, or
// "I agree" affordance of any kind.

import type { Metadata } from 'next';

import LegalDocumentView from '@/components/legal/LegalDocumentView';
import { TERMS_OF_USE } from '@/lib/content/legal/terms';

export const metadata: Metadata = {
  title: 'Terms of Use — ACCELERATE Tanzania Seed Registry',
  description: 'The terms that govern use of the ACCELERATE Tanzania seed registry.',
};

export default function TermsPage() {
  return <LegalDocumentView document={TERMS_OF_USE} />;
}
