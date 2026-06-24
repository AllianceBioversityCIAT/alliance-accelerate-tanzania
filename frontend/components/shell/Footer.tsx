// Footer is a server component — no 'use client' needed.
// Dark surface: bg-fg (#333333) + text-bg (#FFFFFF)
// — an intentional light-on-dark inversion using the two existing semantic tokens.
// No raw hex values are used; all colors reference token utilities (NFR-4).

import Image from 'next/image';

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

          {/* Governance note */}
          <p className="text-xs opacity-60 max-w-md text-right sm:text-right">
            A seed-system registry for institutional partners and agribusinesses
            &middot; Data governed under participant consent.
          </p>

        </div>

        {/* ----------------------------------------------------------------
            Parent-organization attribution — PABRA.
            ACCELERATE Tanzania is an initiative under the Pan-Africa Bean
            Research Alliance. The colored logo sits on a light (bg-surface)
            chip so its maroon/grey/orange marks read against the dark footer.
        ---------------------------------------------------------------- */}
        <div className="mt-8 border-t border-bg/15 pt-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <span className="text-xs font-semibold uppercase tracking-wider opacity-60">
            An initiative of
          </span>
          <a
            href="https://www.pabra-africa.org/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Pan-Africa Bean Research Alliance (PABRA) — opens in a new tab"
            className="inline-flex items-center rounded-md bg-surface px-3 py-2 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-fg"
          >
            <Image
              src="/pabra-30-logo.png"
              alt="PABRA — Pan-Africa Bean Research Alliance, celebrating 30 years of better beans for Africa"
              width={477}
              height={181}
              className="h-9 w-auto"
            />
          </a>
        </div>
      </div>
    </footer>
  );
}
