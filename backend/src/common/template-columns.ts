/**
 * T-2 — Single source of truth for the Excel import template (FR-1, NFR-8).
 *
 * An ordered, declarative description of every column in the import Data sheet.
 * Both the dev-time generator script (T-3, `scripts/generate-import-template.ts`)
 * and the runtime parser (T-5, `actor-import.service.ts`) consume THIS module —
 * so the workbook headers, the "allowed values" listed on the Instructions
 * sheet, and the values validation actually enforces can never drift (NFR-8,
 * design.md §4 + §8 DR-3).
 *
 * Allowed-value lists are built FROM the canonical constants the DTO/normalizer
 * already use (`CANONICAL_REGIONS`, `TRADER_TYPES` from `common/normalize.ts`,
 * the Actor `sex` shape, `ConsentStatus` from Prisma) rather than re-typed here
 * — one edit site per DD-5. Crops are three YES/NO columns (DR-3): dropdown-
 * friendly for field staff, zero spelling risk.
 *
 * This module is DB- and Nest-independent (pure data), matching `normalize.ts`.
 */

import { ConsentStatus } from '@prisma/client';
import { CANONICAL_REGIONS, TRADER_TYPES } from './normalize';

/** Bump on ANY column change (order, headers, allowed values). Stamped on the
 * Instructions sheet and used for best-effort stale-template detection. */
export const TEMPLATE_VERSION = 'v1';

/**
 * Canonical Actor `sex` values. Mirrors the private `SEX_VALUES` in
 * `actors/dto/actor-create.dto.ts` ('M' | 'F' | 'Other'); declared here so the
 * template's dropdown and the DTO's `@IsIn` stay in step.
 */
export const SEX_VALUES = ['M', 'F', 'Other'] as const;

/** YES/NO dropdown values for the three crop columns (DR-3). */
export const CROP_YES_NO = ['YES', 'NO'] as const;

/** Prisma `ConsentStatus` values (GRANTED | DENIED | UNKNOWN) as a plain array. */
export const CONSENT_VALUES = Object.values(ConsentStatus) as ConsentStatus[];

/**
 * Column field → canonical crop name (`Crop.name`), consumed by the parser to
 * turn a YES cell into a crop link and by the generator to label the columns.
 * Keys are the `field`s of the three crop columns below.
 */
export const CROP_COLUMN_CATALOG = {
  cropSorghum: 'sorghum',
  cropCommonBean: 'common_bean',
  cropGroundnut: 'groundnut',
} as const;

export type CropColumnField = keyof typeof CROP_COLUMN_CATALOG;

/** One column of the import Data sheet. */
export interface TemplateColumn {
  /** Human-readable header written to row 1 of the Data sheet. */
  readonly header: string;
  /** Internal Actor field / crop-column key the header maps to. */
  readonly field: string;
  /** Whether server validation rejects the row when this cell is blank. */
  readonly required: boolean;
  /** Constrained value set (drives the Excel dropdown + Instructions list). */
  readonly allowedValues?: readonly string[];
  /** Human-readable format hint for free/numeric columns (Instructions sheet). */
  readonly format?: string;
}

/**
 * The template columns, in field-staff data-entry order: identity first, then
 * location, classification, contact/PII, GPS, the three crop toggles, and
 * consent last. Required flags match `ActorCreateDto`'s required fields
 * (traderId, traderName, traderType, region); everything else is optional.
 */
export const TEMPLATE_COLUMNS: readonly TemplateColumn[] = [
  { header: 'Trader ID', field: 'traderId', required: true },
  { header: 'Trader Name', field: 'traderName', required: true },
  {
    header: 'Trader Type',
    field: 'traderType',
    required: true,
    allowedValues: TRADER_TYPES,
  },
  {
    header: 'Region',
    field: 'region',
    required: true,
    allowedValues: CANONICAL_REGIONS,
  },
  { header: 'District', field: 'district', required: false },
  { header: 'Market Location', field: 'marketLocation', required: false },
  {
    header: 'Sex',
    field: 'sex',
    required: false,
    allowedValues: SEX_VALUES,
  },
  { header: 'Position', field: 'position', required: false },
  {
    header: 'Capacity (tonnes)',
    field: 'capacityTons',
    required: false,
    format: 'Number ≥ 0 in tonnes, e.g. 1250.5',
  },
  { header: 'Technical Support', field: 'technicalSupport', required: false },
  {
    header: 'Phone',
    field: 'phone',
    required: false,
    format: 'International format, e.g. +255 7XX XXX XXX',
  },
  {
    header: 'Email',
    field: 'email',
    required: false,
    format: 'Valid email address, e.g. name@example.org',
  },
  {
    header: 'GPS Latitude',
    field: 'gpsLatitude',
    required: false,
    format: 'Decimal degrees between −90 and 90, e.g. −6.7924',
  },
  {
    header: 'GPS Longitude',
    field: 'gpsLongitude',
    required: false,
    format: 'Decimal degrees between −180 and 180, e.g. 39.2083',
  },
  {
    header: 'GPS Altitude',
    field: 'gpsAltitude',
    required: false,
    format: 'Metres above sea level (number), e.g. 55',
  },
  {
    header: 'GPS Accuracy',
    field: 'gpsAccuracy',
    required: false,
    format: 'Metres (number ≥ 0), e.g. 4.5',
  },
  {
    header: 'Crop: Sorghum',
    field: 'cropSorghum',
    required: false,
    allowedValues: CROP_YES_NO,
  },
  {
    header: 'Crop: Common bean',
    field: 'cropCommonBean',
    required: false,
    allowedValues: CROP_YES_NO,
  },
  {
    header: 'Crop: Groundnut',
    field: 'cropGroundnut',
    required: false,
    allowedValues: CROP_YES_NO,
  },
  {
    header: 'Consent Status',
    field: 'consentStatus',
    required: false,
    allowedValues: CONSENT_VALUES,
  },
] as const;

/** Ordered list of the Data-sheet headers (row 1), for convenience. */
export const TEMPLATE_HEADERS: readonly string[] = TEMPLATE_COLUMNS.map(
  (c) => c.header,
);
