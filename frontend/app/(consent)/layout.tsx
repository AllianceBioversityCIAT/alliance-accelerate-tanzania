/**
 * (consent) route group layout — actors/consent-intake/consent-request-email
 * T-8, DD-5, NFR-11, design.md §7.3.
 *
 * Header + `<main>` + Footer ONLY. There is deliberately no `ConsentProvider`,
 * no `ConsentBanner` and no `GoogleAnalytics` here: the consent link's token
 * rides in the URL fragment, and analytics must never see it. Containment is
 * by placement (ADR-011 extended) — the component tree on this branch simply
 * does not contain the analytics mount, so nothing depends on how GA4 treats
 * fragments (P-27) and there is no runtime pathname check to fall through.
 * `(public)/layout.tsx` is where those three live; moving the page there
 * reddens `layout.test.tsx`.
 *
 * Header and Footer do not read `ConsentProvider` (P-22; only
 * `PublicShellFrame` does), so they render fine without it. The page is a
 * one-time token page, so it is also kept out of search indexes.
 */

import type { Metadata } from 'next';

import Header from '@/components/shell/Header';
import Footer from '@/components/shell/Footer';

export const metadata: Metadata = {
  title: 'Consent request | ACCELERATE Tanzania Seed Registry',
  robots: { index: false, follow: false },
};

export default function ConsentLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
