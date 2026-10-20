// Footer is a server component — no 'use client' needed.
// Dark surface: bg-fg (#2A2724) + text-bg (#FBF9F6)
// — an intentional light-on-dark inversion using the two existing semantic tokens.
// No raw hex values are used; all colors reference token utilities (NFR-4).

import Image from 'next/image';
import Link from 'next/link';
import { PARTNERS, type Partner } from '@/lib/content/partners';

// Attribution (FR-10): PABRA + the Alliance lead the registry ("An initiative of");
// ACCELERATE is the original project, funded by Gates (a smaller line below).
const LEAD_KEYS   = ['pabra', 'alliance'] as const;
const FUNDER_KEYS = ['bmgf']              as const;

const byKeys = (keys: readonly string[]) =>
  keys
    .map((key) => PARTNERS.find((p) => p.key === key))
    .filter((p): p is Partner => Boolean(p?.logo));

const leadPartners   = byKeys(LEAD_KEYS);
const funderPartners = byKeys(FUNDER_KEYS);

// ACCELERATE is the project this registry began under (not a PARTNERS entry).
const ACCELERATE = {
  name: 'ACCELERATE — Accelerated Variety Turnover for Open-Pollinated Crops',
  url: 'https://alliancebioversityciat.org/projects/accelerate',
  logo: '/brand/accelerate-logo-color.png',
  width: 867,
  height: 194,
};

// Original asset dimensions per logo (display size comes from the class).
const LOGO_DIMS: Record<string, { width: number; height: number }> = {
  pabra:    { width: 291, height: 175 },
  alliance: { width: 400, height: 80  },
  bmgf:     { width: 1000, height: 202 },
};

const LOGO_CHIP_CLASSES =
  'inline-flex items-center rounded-md bg-surface transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-fg';

const LABEL_CLASSES = 'text-xs font-semibold uppercase tracking-wider opacity-60 shrink-0';

// Shared token-only treatment for the footer's link row (Our story / Contact /
// Cookie Notice / Privacy Policy / Terms of Use — T-10, extended to five at
// legal/legal-notices-and-consent-copy T-6). Factored out so all five links
// stay visually identical — this row is the single source for these links
// (mirrors the `NAV_LINKS` convention design.md §5 sets for the header; no
// second, divergent list exists).
const FOOTER_LINK_CLASSES =
  'text-xs text-bg/80 hover:text-bg underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-fg rounded-sm';

function PartnerLogo({ partner, size }: { partner: Partner; size: 'lg' | 'sm' }) {
  const dims = LOGO_DIMS[partner.key] ?? { width: 400, height: 80 };
  return (
    <a
      href={partner.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${partner.name} — opens in a new tab`}
      className={`${LOGO_CHIP_CLASSES} ${size === 'lg' ? 'px-3 py-2' : 'px-2 py-1.5'}`}
    >
      <Image
        src={partner.logo!}
        alt={partner.name}
        width={dims.width}
        height={dims.height}
        className={size === 'lg' ? 'h-9 w-auto' : 'h-6 w-auto'}
      />
    </a>
  );
}

export default function Footer() {
  return (
    <footer className="bg-fg text-bg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">

          {/* Lead: PABRA and the Alliance */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <span className={LABEL_CLASSES}>An initiative of</span>
            <div className="flex flex-wrap items-center gap-2">
              {leadPartners.map((partner) => (
                <PartnerLogo key={partner.key} partner={partner} size="lg" />
              ))}
            </div>
          </div>

          {/* Governance note + footer links (Our story, Contact, Cookie Notice,
              Privacy Policy, Terms of Use — T-10/FR-1/DC-11, extended at
              legal/legal-notices-and-consent-copy T-6/FR-6) */}
          <div className="flex flex-col items-start lg:items-end gap-1.5">
            <p className="text-xs opacity-60 max-w-md lg:text-right">
              A seed-system registry for institutional partners and agribusinesses
              &middot; Data governed under participant consent.
            </p>
            <nav
              aria-label="Footer"
              className="flex flex-wrap items-center lg:justify-end gap-x-4 gap-y-1"
            >
              <Link href="/about" className={FOOTER_LINK_CLASSES}>
                Our story
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

        {/* Origin: ACCELERATE, funded by Gates — secondary, smaller line */}
        <div className="mt-6 border-t border-bg/15 pt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={LABEL_CLASSES}>Originally developed under</span>
          <a
            href={ACCELERATE.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="ACCELERATE project — opens in a new tab"
            className={`${LOGO_CHIP_CLASSES} px-2 py-1.5`}
          >
            <Image
              src={ACCELERATE.logo}
              alt={ACCELERATE.name}
              width={ACCELERATE.width}
              height={ACCELERATE.height}
              className="h-6 w-auto"
            />
          </a>
          {/* kept together so "funded by" never wraps away from its logo */}
          <span className="inline-flex items-center gap-3">
            <span className={LABEL_CLASSES}>funded by</span>
            {funderPartners.map((partner) => (
              <PartnerLogo key={partner.key} partner={partner} size="sm" />
            ))}
          </span>
        </div>
      </div>
    </footer>
  );
}
