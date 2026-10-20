// Footer is a server component — no 'use client' needed.
// Dark surface: bg-fg (#2A2724) + text-bg (#FBF9F6)
// — an intentional light-on-dark inversion using the two existing semantic tokens.
// No raw hex values are used; all colors reference token utilities (NFR-4).

import Image from 'next/image';
import Link from 'next/link';
import { PARTNERS } from '@/lib/content/partners';

// Partners with logo assets that anchor the footer coalition row (FR-10).
// alliance = "An initiative of PABRA and" (PABRA is the brand mark above);
// ACCELERATE (the origin project, not a PARTNERS entry) = "Originally developed under",
// followed by "funded by" bmgf (Gates funded ACCELERATE, not the current registry).
const COALITION_KEYS = ['alliance'] as const;
const FUNDER_KEYS    = ['bmgf']               as const;

const coalitionPartners = PARTNERS.filter(
  (p) => (COALITION_KEYS as readonly string[]).includes(p.key) && p.logo,
);
// ACCELERATE is the project this registry began under; shown as a logo-row entry.
const ACCELERATE = {
  name: 'ACCELERATE — Accelerated Variety Turnover for Open-Pollinated Crops',
  url: 'https://alliancebioversityciat.org/projects/accelerate',
  logo: '/brand/accelerate-logo-color.png',
  width: 867,
  height: 194,
};

const funderPartners = PARTNERS.filter(
  (p) => (FUNDER_KEYS as readonly string[]).includes(p.key) && p.logo,
);

// Explicit display dimensions per partner (original asset dims → display h-9 w-auto).
const LOGO_DIMS: Record<string, { width: number; height: number }> = {
  alliance: { width: 400, height: 80  },
  bmgf:     { width: 1000, height: 202 },
};

// Shared token-only treatment for the footer's link row (About / Contact /
// Cookie Notice / Privacy Policy / Terms of Use — T-10, extended to five at
// legal/legal-notices-and-consent-copy T-6). Factored out so all five links
// stay visually identical — this row is the single source for these links
// (mirrors the `NAV_LINKS` convention design.md §5 sets for the header; no
// second, divergent list exists).
const FOOTER_LINK_CLASSES =
  'text-xs text-bg/80 hover:text-bg underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-fg rounded-sm';

export default function Footer() {
  return (
    <footer className="bg-fg text-bg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">

          {/* PABRA brand mark — the logo has no white variant, so it sits on a light plate */}
          <Link
            href="/"
            aria-label="PABRA Seed Actors Registry — home"
            className="inline-flex items-center rounded-md bg-surface px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-fg"
          >
            <Image
              src="/brand/pabra-logo.png"
              width={291}
              height={175}
              alt="PABRA Seed Actors Registry"
              className="h-9 w-auto sm:h-10"
            />
          </Link>

          {/* Governance note + footer links (About, Contact, Cookie Notice,
              Privacy Policy, Terms of Use — T-10/FR-1/DC-11, extended at
              legal/legal-notices-and-consent-copy T-6/FR-6) */}
          <div className="flex flex-col items-end gap-1.5">
            <p className="text-xs opacity-60 max-w-md text-right">
              A seed-system registry for institutional partners and agribusinesses
              &middot; Data governed under participant consent.
            </p>
            <nav
              aria-label="Footer"
              className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1"
            >
              <Link href="/about" className={FOOTER_LINK_CLASSES}>
                About this project
              </Link>
              <Link href="/contact" className={FOOTER_LINK_CLASSES}>
                Contact
              </Link>
              <Link href="/cookies" className={FOOTER_LINK_CLASSES}>
                Cookie Notice
              </Link>
              <Link href="/privacy" className={FOOTER_LINK_CLASSES}>
                Privacy Policy
              </Link>
              <Link href="/terms" className={FOOTER_LINK_CLASSES}>
                Terms of Use
              </Link>
            </nav>
          </div>

        </div>

        {/* ----------------------------------------------------------------
            Coalition attribution (FR-10):
            PABRA (brand mark) + the Alliance lead the registry; ACCELERATE is the
            original project, funded by the Bill & Melinda Gates Foundation.
            Coloured logos sit on a light (bg-surface) chip so their marks
            read against the dark footer (lightSafe: false for all).
        ---------------------------------------------------------------- */}
        <div className="mt-8 border-t border-bg/15 pt-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8 sm:gap-y-4">

          {/* Lead: PABRA (brand mark) and the Alliance */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider opacity-60 shrink-0">
              An initiative of PABRA and
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {coalitionPartners.map((partner) => {
                const dims = LOGO_DIMS[partner.key] ?? { width: 400, height: 80 };
                return (
                  <a
                    key={partner.key}
                    href={partner.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${partner.name} — opens in a new tab`}
                    className="inline-flex items-center rounded-md bg-surface px-3 py-2 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-fg"
                  >
                    <Image
                      src={partner.logo!}
                      alt={partner.name}
                      width={dims.width}
                      height={dims.height}
                      className="h-9 w-auto"
                    />
                  </a>
                );
              })}
            </div>
          </div>

          {/* Origin: ACCELERATE, funded by Gates */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider opacity-60 shrink-0">
              Originally developed under
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={ACCELERATE.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="ACCELERATE project — opens in a new tab"
                className="inline-flex items-center rounded-md bg-surface px-3 py-2 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-fg"
              >
                <Image
                  src={ACCELERATE.logo}
                  alt={ACCELERATE.name}
                  width={ACCELERATE.width}
                  height={ACCELERATE.height}
                  className="h-9 w-auto"
                />
              </a>
              {/* kept together so "funded by" never wraps away from its logo */}
              <span className="inline-flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider opacity-60 shrink-0">
                  funded by
                </span>
                {funderPartners.map((partner) => {
                  const dims = LOGO_DIMS[partner.key] ?? { width: 400, height: 80 };
                  return (
                    <a
                      key={partner.key}
                      href={partner.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${partner.name} — opens in a new tab`}
                      className="inline-flex items-center rounded-md bg-surface px-3 py-2 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-fg"
                    >
                      <Image
                        src={partner.logo!}
                        alt={partner.name}
                        width={dims.width}
                        height={dims.height}
                        className="h-9 w-auto"
                      />
                    </a>
                  );
                })}
              </span>
            </div>
          </div>

        </div>
      </div>
    </footer>
  );
}
