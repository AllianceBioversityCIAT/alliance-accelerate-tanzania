/**
 * T-7 — Consented sample dataset (DB- and Nest-INDEPENDENT).
 *
 * This is the single, pure, exported description of the v1 seed data (FR-8,
 * DD-4). It is consumed by BOTH the seed runner (`prisma/seed.ts`, which writes
 * it to MySQL) AND the dataset-shape unit test (`src/prisma/seed-data.spec.ts`,
 * which asserts its properties WITHOUT a database). Keeping the data here — as a
 * plain typed array, importing no Nest/Prisma/I/O — is what makes the seed
 * testable in an environment with no reachable MySQL.
 *
 * Safety contract (DD-4, task T-7): every public sample actor has
 * `consentStatus = GRANTED`; NO real person names, phones, or emails appear.
 * Organization names are fictional; `phone`/`email` are `null`. A small number
 * of non-public (`UNKNOWN`/`DENIED`) actors are included ONLY so downstream
 * consent-filtering (T-5/T-6) is demonstrably exercised — they must never be
 * exposed publicly.
 *
 * Design refs: design.md §4 (`prisma/seed.ts`), §10 (DD-4). Requirement: FR-8.
 */

import {
  CANONICAL_REGIONS,
  TRADER_TYPES,
  type CanonicalRegion,
  type TraderType,
} from '../src/common/normalize';

/** The three crops the platform tracks; names MUST match the frontend slugs. */
export const SEED_CROP_SLUGS = ['sorghum', 'common_bean', 'groundnut'] as const;

export type CropSlug = (typeof SEED_CROP_SLUGS)[number];

/** Consent values used in the dataset (string-typed to stay Prisma-free here). */
export type SeedConsentStatus = 'GRANTED' | 'DENIED' | 'UNKNOWN';

/**
 * Plain, serializable description of one seed actor. Decimal columns are kept as
 * `string`/`number` here (the runner converts to `Prisma.Decimal`), so this file
 * stays free of any Prisma import and remains trivially unit-testable.
 */
export interface SeedActor {
  traderId: string;
  traderName: string;
  region: CanonicalRegion;
  district: string | null;
  traderType: TraderType;
  capacityTons: number;
  gpsLatitude: number;
  gpsLongitude: number;
  /** PII — intentionally null in seed data (DD-4: no real PII). */
  phone: null;
  /** PII — intentionally null in seed data (DD-4: no real PII). */
  email: null;
  consentStatus: SeedConsentStatus;
  crops: CropSlug[];
}

/**
 * Tanzania bounding box used to author + assert valid sample GPS. Mainland +
 * islands sit roughly within lat [−11.75, −0.95] and long [29.3, 40.5]; the
 * task's guidance (lat −1..−11.5, long 29..40) is comfortably inside this.
 */
export const TANZANIA_BOUNDS = {
  latMin: -11.75,
  latMax: -0.95,
  longMin: 29.3,
  longMax: 40.5,
} as const;

/**
 * 12 consented (`GRANTED`) sample actors — matching the home-page mockup's
 * "12 actors". The set deliberately spans:
 *   - all three crops (every slug appears, several actors are multi-crop),
 *   - all six canonical `traderType`s (OQ-2 taxonomy),
 *   - eight canonical regions.
 * Names are fictional organizations; phone/email are null (DD-4).
 *
 * GPS values are hand-placed near each region's seat, deterministic (no random),
 * and inside {@link TANZANIA_BOUNDS}.
 */
const GRANTED_ACTORS: SeedActor[] = [
  {
    traderId: 'TZ-SEED-0001',
    traderName: 'Meru Agro-Processing & Seeds',
    region: 'Arusha',
    district: 'Arusha Urban',
    traderType: 'seed_company',
    capacityTons: 1850.0,
    gpsLatitude: -3.3869,
    gpsLongitude: 36.683,
    phone: null,
    email: null,
    consentStatus: 'GRANTED',
    crops: ['sorghum', 'common_bean'],
  },
  {
    traderId: 'TZ-SEED-0002',
    traderName: 'Tanseed International Ltd',
    region: 'Morogoro',
    district: 'Morogoro Urban',
    traderType: 'seed_company',
    capacityTons: 3200.0,
    gpsLatitude: -6.821,
    gpsLongitude: 37.6611,
    phone: null,
    email: null,
    consentStatus: 'GRANTED',
    crops: ['sorghum', 'groundnut'],
  },
  {
    traderId: 'TZ-SEED-0003',
    traderName: 'Highland Seed Growers Cooperative',
    region: 'Mbeya',
    district: 'Mbeya Rural',
    traderType: 'cooperative',
    capacityTons: 980.5,
    gpsLatitude: -8.9094,
    gpsLongitude: 33.4607,
    phone: null,
    email: null,
    consentStatus: 'GRANTED',
    crops: ['common_bean'],
  },
  {
    traderId: 'TZ-SEED-0004',
    traderName: 'Nyota Seed Company',
    region: 'Mwanza',
    district: 'Nyamagana',
    traderType: 'seed_company',
    capacityTons: 1420.0,
    gpsLatitude: -2.5164,
    gpsLongitude: 32.9175,
    phone: null,
    email: null,
    consentStatus: 'GRANTED',
    crops: ['sorghum'],
  },
  {
    traderId: 'TZ-SEED-0005',
    traderName: 'AgriConnect Tanzania',
    region: 'Dar es Salaam',
    district: 'Ilala',
    traderType: 'ngo',
    capacityTons: 450.0,
    gpsLatitude: -6.7924,
    gpsLongitude: 39.2083,
    phone: null,
    email: null,
    consentStatus: 'GRANTED',
    crops: ['common_bean', 'groundnut'],
  },
  {
    traderId: 'TZ-SEED-0006',
    traderName: 'Mtwara Groundnut Union',
    region: 'Mtwara',
    district: 'Mtwara Urban',
    traderType: 'cooperative',
    capacityTons: 1675.25,
    gpsLatitude: -10.2692,
    gpsLongitude: 40.1828,
    phone: null,
    email: null,
    consentStatus: 'GRANTED',
    crops: ['groundnut'],
  },
  {
    traderId: 'TZ-SEED-0007',
    traderName: 'Dodoma Drylands Aggregators Ltd',
    region: 'Dodoma',
    district: 'Dodoma Urban',
    traderType: 'offtaker',
    capacityTons: 2750.0,
    gpsLatitude: -6.163,
    gpsLongitude: 35.7516,
    phone: null,
    email: null,
    consentStatus: 'GRANTED',
    crops: ['sorghum', 'groundnut'],
  },
  {
    traderId: 'TZ-SEED-0008',
    traderName: 'Southern Highlands Crop Research Institute',
    region: 'Iringa',
    district: 'Iringa Urban',
    traderType: 'research_institute',
    capacityTons: 120.0,
    gpsLatitude: -7.7669,
    gpsLongitude: 35.6997,
    phone: null,
    email: null,
    consentStatus: 'GRANTED',
    crops: ['sorghum', 'common_bean', 'groundnut'],
  },
  {
    traderId: 'TZ-SEED-0009',
    traderName: 'Lake Zone Bean Traders',
    region: 'Mwanza',
    district: 'Ilemela',
    traderType: 'informal_trader',
    capacityTons: 85.5,
    gpsLatitude: -2.4669,
    gpsLongitude: 32.9,
    phone: null,
    email: null,
    consentStatus: 'GRANTED',
    crops: ['common_bean'],
  },
  {
    traderId: 'TZ-SEED-0010',
    traderName: 'Kilimo Bora Offtakers Ltd',
    region: 'Morogoro',
    district: 'Kilosa',
    traderType: 'offtaker',
    capacityTons: 1900.0,
    gpsLatitude: -6.8362,
    gpsLongitude: 36.9889,
    phone: null,
    email: null,
    consentStatus: 'GRANTED',
    crops: ['sorghum', 'common_bean', 'groundnut'],
  },
  {
    traderId: 'TZ-SEED-0011',
    traderName: 'Uhuru Farmers Cooperative Society',
    region: 'Mbeya',
    district: 'Mbeya Urban',
    traderType: 'cooperative',
    capacityTons: 740.0,
    gpsLatitude: -8.914,
    gpsLongitude: 33.45,
    phone: null,
    email: null,
    consentStatus: 'GRANTED',
    crops: ['common_bean', 'groundnut'],
  },
  {
    traderId: 'TZ-SEED-0012',
    traderName: 'Maendeleo Agribusiness Foundation',
    region: 'Arusha',
    district: 'Meru',
    traderType: 'ngo',
    capacityTons: 310.0,
    gpsLatitude: -3.35,
    gpsLongitude: 36.85,
    phone: null,
    email: null,
    consentStatus: 'GRANTED',
    crops: ['sorghum', 'groundnut'],
  },
];

/**
 * Non-public actors (1 `UNKNOWN`, 1 `DENIED`). Present ONLY so downstream
 * consent-filtering can be proven to EXCLUDE them. They carry the same DD-4
 * safety contract (fictional names, null PII) and MUST NOT surface publicly.
 */
const NON_PUBLIC_ACTORS: SeedActor[] = [
  {
    traderId: 'TZ-SEED-9001',
    traderName: 'Unverified Cross-Border Grain Buyers',
    region: 'Kigoma',
    district: 'Kigoma Urban',
    traderType: 'informal_trader',
    capacityTons: 60.0,
    gpsLatitude: -4.8769,
    gpsLongitude: 29.6267,
    phone: null,
    email: null,
    consentStatus: 'UNKNOWN',
    crops: ['common_bean'],
  },
  {
    traderId: 'TZ-SEED-9002',
    traderName: 'Opted-Out Seed Distributors Ltd',
    region: 'Tanga',
    district: 'Tanga City',
    traderType: 'seed_company',
    capacityTons: 1100.0,
    gpsLatitude: -5.0689,
    gpsLongitude: 39.0988,
    phone: null,
    email: null,
    consentStatus: 'DENIED',
    crops: ['sorghum', 'groundnut'],
  },
];

/**
 * The full seed dataset: 12 GRANTED + 2 non-public actors. Exported as one pure
 * const so the runner and the test consume the SAME source of truth.
 */
export const SEED_ACTORS: readonly SeedActor[] = [
  ...GRANTED_ACTORS,
  ...NON_PUBLIC_ACTORS,
];

/** Convenience view: only the publicly-visible (GRANTED) sample actors. */
export const PUBLIC_SEED_ACTORS: readonly SeedActor[] = GRANTED_ACTORS;

// Type-level guards: keep the literals above in sync with the T-3 canonical
// constants. These are no-ops at runtime but fail compilation on drift.
const _regionCheck: readonly CanonicalRegion[] = CANONICAL_REGIONS;
const _typeCheck: readonly TraderType[] = TRADER_TYPES;
void _regionCheck;
void _typeCheck;
