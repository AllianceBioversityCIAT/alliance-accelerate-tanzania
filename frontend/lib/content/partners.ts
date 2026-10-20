/**
 * partners.ts — static partner/funder content for the PABRA Seed Actors Registry.
 * T-1 (FR-11, FR-12, System Design §7 tokens).
 *
 * Provides the six-partner coalition backing the ACCELERATE project.
 * Components map over PARTNERS to render the logo wall (PartnersStrip, Footer)
 * without hardcoding any markup per partner.
 *
 * Logo paths reference files under `frontend/public/`; partners without a
 * clean logo asset omit the `logo` field and fall back to a styled text label.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PartnerKey =
  | 'alliance'
  | 'pabra'
  | 'tari'
  | 'tosci'
  | 'cimmyt'
  | 'bmgf';

export interface Partner {
  key: PartnerKey;
  /** Full accessible name used in alt text and aria-labels. */
  name: string;
  /** Short functional role in the ACCELERATE project. */
  role: string;
  /** Official organisation URL — opened in a new tab. */
  url: string;
  /**
   * Path under `frontend/public/` (leading slash).
   * Omit when no clean logo asset is available → components render a
   * styled text-label fallback instead (FR-6, OQ-2).
   */
  logo?: string;
  /**
   * Organisational tier within the ACCELERATE coalition.
   * Used by PartnersStrip to group and label partners by role.
   *   'funder'  — primary financial backer (Gates)
   *   'lead'    — lead / co-lead implementers (Alliance, PABRA)
   *   'partner' — national/technical partners (TARI, TOSCI, CIMMYT)
   */
  tier: 'funder' | 'lead' | 'partner';
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

/**
 * Full six-partner coalition for the ACCELERATE Tanzania project.
 * Order: lead implementer first, then co-lead, national partners, then funder.
 * Matches the copy brief §4.1 ordering.
 */
export const PARTNERS: Partner[] = [
  {
    key: 'alliance',
    name: 'Alliance of Bioversity International & CIAT',
    role: 'Lead implementer',
    url: 'https://alliancebioversityciat.org',
    logo: '/partners/alliance.png',
    tier: 'lead',
  },
  {
    key: 'pabra',
    name: 'Pan-Africa Bean Research Alliance (PABRA)',
    role: 'Co-lead, bean value chain',
    url: 'https://www.pabra-africa.org',
    logo: '/brand/pabra-logo.png',
    tier: 'lead',
  },
  {
    key: 'tari',
    name: 'Tanzania Agricultural Research Institute (TARI)',
    role: 'Variety release & early-generation seed',
    url: 'https://www.tari.go.tz',
    logo: '/partners/tari.png',
    tier: 'partner',
  },
  {
    key: 'tosci',
    name: 'Tanzania Official Seed Certification Institute (TOSCI)',
    role: 'Seed certification & QDS',
    url: 'https://www.tosci.go.tz',
    logo: '/partners/tosci.png',
    tier: 'partner',
  },
  {
    key: 'cimmyt',
    name: 'CIMMYT',
    role: 'Market intelligence, sorghum/groundnut',
    url: 'https://www.cimmyt.org',
    logo: '/partners/cimmyt.jpg',
    tier: 'partner',
  },
  {
    key: 'bmgf',
    name: 'Bill & Melinda Gates Foundation',
    role: 'Funder',
    url: 'https://www.gatesfoundation.org',
    logo: '/partners/bmgf.png',
    tier: 'funder',
  },
];

/** ACCELERATE, the project this registry began under (not a coalition member). */
export const ACCELERATE_PROJECT = {
  name: 'ACCELERATE — Accelerated Variety Turnover for Open-Pollinated Crops',
  url: 'https://alliancebioversityciat.org/projects/accelerate',
  logo: '/brand/accelerate-logo-color.png',
  width: 867,
  height: 194,
} as const;
