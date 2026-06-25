// Footer is a server component — no 'use client' needed.
// Dark surface: bg-fg (#333333) + text-bg (#FFFFFF)
// — an intentional light-on-dark inversion using the two existing semantic tokens.
// No raw hex values are used; all colors reference token utilities (NFR-4).

import Image from 'next/image';
import Link from 'next/link';
import { PARTNERS } from '@/lib/content/partners';

// Partners with logo assets that anchor the footer coalition row (FR-10).
// alliance + pabra = "An initiative of"; bmgf = "Funded by".
const COALITION_KEYS = ['alliance', 'pabra'] as const;
const FUNDER_KEYS    = ['bmgf']               as const;

const coalitionPartners = PARTNERS.filter(
  (p) => (COALITION_KEYS as readonly string[]).includes(p.key) && p.logo,
);
const funderPartners = PARTNERS.filter(
  (p) => (FUNDER_KEYS as readonly string[]).includes(p.key) && p.logo,
);

// Explicit display dimensions per partner (original asset dims → display h-9 w-auto).
const LOGO_DIMS: Record<string, { width: number; height: number }> = {
  alliance: { width: 400, height: 80  },
  pabra:    { width: 477, height: 181 },
  bmgf:     { width: 400, height: 80  },
};

export default function Footer() {
  return (
    <footer className="bg-fg text-bg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">

          {/* Brand mark + name */}
          <div className="flex items-center gap-2.5">
            {/* Circular brand mark — pure CSS, matches header */}
            <span
              aria-hidden="true"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg font-bold text-xs select-none"
            >
              A
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-sm font-bold tracking-widest uppercase text-bg">
                ACCELERATE
              </span>
              <span className="text-xs font-medium tracking-wider uppercase opacity-70">
                Tanzania
              </span>
            </span>
          </div>

          {/* Governance note + About link */}
          <div className="flex flex-col items-end gap-1.5">
            <p className="text-xs opacity-60 max-w-md text-right">
              A seed-system registry for institutional partners and agribusinesses
              &middot; Data governed under participant consent.
            </p>
            <Link
              href="/about"
              className="text-xs text-bg/80 hover:text-bg underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-fg rounded-sm"
            >
              About this project
            </Link>
          </div>

        </div>

        {/* ----------------------------------------------------------------
            Coalition attribution (FR-10):
            Lead coalition — Alliance of Bioversity & CIAT + PABRA — and
            funder — Bill & Melinda Gates Foundation.
            Coloured logos sit on a light (bg-surface) chip so their marks
            read against the dark footer (lightSafe: false for all three).
        ---------------------------------------------------------------- */}
        <div className="mt-8 border-t border-bg/15 pt-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8 sm:gap-y-4">

          {/* Initiative: Alliance + PABRA */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider opacity-60 shrink-0">
              An initiative of
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
                      alt={
                        partner.key === 'pabra'
                          ? 'PABRA — Pan-Africa Bean Research Alliance, celebrating 30 years of better beans for Africa'
                          : partner.name
                      }
                      width={dims.width}
                      height={dims.height}
                      className="h-9 w-auto"
                    />
                  </a>
                );
              })}
            </div>
          </div>

          {/* Funder: Bill & Melinda Gates Foundation */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider opacity-60 shrink-0">
              Funded by
            </span>
            <div className="flex flex-wrap items-center gap-2">
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
            </div>
          </div>

        </div>
      </div>
    </footer>
  );
}
