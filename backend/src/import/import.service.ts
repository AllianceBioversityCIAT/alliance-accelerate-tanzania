/**
 * T-8 — Real source-file import (DESIGN ONLY, execution-deferred).
 *
 * Implements FR-9 as PURE, unit-testable LOGIC that maps the real source-file
 * row shape onto the Prisma `Actor` shape, reusing the T-3 normalizers
 * (`normalizeRegion`, `normalizeTraderType`, `normalizeSex`, `parseCapacityTons`,
 * GPS guards). It dedupes on `traderId`, quarantines incomplete/ambiguous rows,
 * and defaults `consentStatus = 'UNKNOWN'` so real rows are NEVER public by
 * default (FR-9 / OQ-3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SAFETY / LEGAL GATE (DD-4, FR-4/FR-5, OQ-3):
 *   - The real source file is NOT in this repo and is NEVER read,
 *     parsed, imported, or committed by this code. The file path lives nowhere
 *     in source. All tests use SYNTHETIC rows only.
 *   - Import EXECUTION against real data is DEFERRED until the legal office
 *     ratifies consent / PII / public-GPS handling. `mapRow` / `importRows` are
 *     pure transforms that touch NO database; the DB-writing `runImport` is
 *     guarded behind an explicit ops entrypoint and is NOT wired into any
 *     controller or auto-run path here.
 *   - Real rows default to `consentStatus = 'UNKNOWN'` (not public).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Design refs: design.md §7 (ImportModule — "wired but not executed", guarded
 * behind an explicit ops command), §11. Requirements: requirements.md §6 FR-9,
 * §10 OQ-3. NFR-2 (any AWS use → `--profile IBD-DEV`; this layer uses no AWS).
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  isValidLatitude,
  isValidLongitude,
  normalizeRegion,
  normalizeSex,
  normalizeTraderType,
  parseCapacityTons,
} from '../common/normalize';

/**
 * One raw row of the real source file, keyed by its ACTUAL column
 * headers. The leading unnamed/index columns of the source are intentionally
 * absent here — they are ignored on import. Everything is optional/loose
 * because the source is dirty; cleaning + validation happen in {@link
 * ImportService.mapRow}.
 */
export interface RawSourceRow {
  Trader_id?: string | null;
  Trader_name?: string | null;
  Region?: string | null;
  District?: string | null;
  /** Source header literally contains a slash. */
  'Trader/processor type'?: string | null;
  Sex?: string | null;
  Position?: string | null;
  'Market location'?: string | null;
  'Capacity (volume in t)'?: string | number | null;
  'Technical support required'?: string | null;
  phone?: string | null;
  Email?: string | null;
  gpslatitude?: string | number | null;
  gpslongitude?: string | number | null;
  gpsaltitude?: string | number | null;
  gpsaccuracy?: string | number | null;
  // Leading unnamed source columns (indices, blanks) are deliberately ignored.
  [other: string]: unknown;
}

/**
 * The cleaned, normalized shape a mapped row WOULD be persisted as — aligned to
 * the Prisma `Actor` columns (design.md §5). Decimals are kept as plain numbers
 * here so this layer stays Prisma-free and trivially testable; the persist step
 * ({@link ImportService.runImport}) converts to `Prisma.Decimal`.
 */
export interface ActorImportInput {
  traderId: string;
  traderName: string;
  region: string;
  district: string | null;
  traderType: string;
  sex: 'M' | 'F' | 'Other' | null;
  position: string | null;
  marketLocation: string | null;
  capacityTons: number | null;
  technicalSupport: string | null;
  /** PII — carried through but never public by default (consent UNKNOWN). */
  phone: string | null;
  /** PII — carried through but never public by default (consent UNKNOWN). */
  email: string | null;
  gpsLatitude: number;
  gpsLongitude: number;
  gpsAltitude: number | null;
  gpsAccuracy: number | null;
  /** FR-9 / OQ-3: real rows are NEVER public by default. */
  consentStatus: 'UNKNOWN';
}

/** A row that was rejected (not imported), with a human-readable reason. */
export interface QuarantinedRow {
  reason: string;
  raw: RawSourceRow;
}

/** Result of {@link ImportService.mapRow}: exactly one branch is populated. */
export type MapRowResult =
  | { actor: ActorImportInput; quarantined?: undefined }
  | { actor?: undefined; quarantined: QuarantinedRow };

/** Summary of a pure {@link ImportService.importRows} transform. */
export interface ImportSummary {
  /** Rows that WOULD be imported (nothing has been written to the DB). */
  imported: ActorImportInput[];
  /** Rows rejected with reasons (missing key/GPS, ambiguous region, …). */
  quarantined: QuarantinedRow[];
  /** Count of later duplicate rows (same `traderId`) dropped. */
  deduped: number;
}

/** Trim a loose source string to a non-empty value, else null. */
function cleanString(raw: unknown): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  return trimmed === '' ? null : trimmed;
}

/** Coerce a loose GPS cell to a finite number, or null. */
function toNumberOrNull(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const trimmed = String(raw).trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Map ONE raw source row to the cleaned Prisma `Actor` shape, or quarantine it.
   *
   * Quarantine rules (FR-9): a row is rejected (never imported) when —
   *   1. `Trader_id` is missing/blank (no business key to dedupe on, FR-2),
   *   2. GPS latitude/longitude is missing or invalid (out of range / NaN),
   *   3. its `Region` is ambiguous/unknown and the T-3 normalizer quarantines it.
   * A missing `traderName` is also rejected (the column is NOT NULL).
   *
   * Mapped rows set `consentStatus = 'UNKNOWN'` (OQ-3) — real rows are never
   * public by default. `traderType`/`sex` are normalized; an unknown traderType
   * does NOT quarantine the row (the value is dirty-but-present) — it is left to
   * the legal-gated execution / DTO validation to resolve, so it falls back to
   * the raw trimmed value rather than being guessed.
   */
  mapRow(raw: RawSourceRow): MapRowResult {
    const traderId = cleanString(raw.Trader_id);
    if (traderId === null) {
      return { quarantined: { reason: 'missing Trader_id', raw } };
    }

    const traderName = cleanString(raw.Trader_name);
    if (traderName === null) {
      return { quarantined: { reason: 'missing Trader_name', raw } };
    }

    const lat = toNumberOrNull(raw.gpslatitude);
    const long = toNumberOrNull(raw.gpslongitude);
    if (!isValidLatitude(lat) || !isValidLongitude(long)) {
      return { quarantined: { reason: 'missing or invalid GPS', raw } };
    }

    const regionResult = normalizeRegion(raw.Region);
    if (regionResult.quarantined || regionResult.region === null) {
      return {
        quarantined: {
          reason: `ambiguous or unknown region: "${cleanString(raw.Region) ?? ''}"`,
          raw,
        },
      };
    }

    const rawTraderType = cleanString(raw['Trader/processor type']);
    // Normalize when resolvable; otherwise carry the trimmed source value through
    // (the legal-gated execution / write DTO is the gate that rejects it).
    const traderType =
      normalizeTraderType(rawTraderType) ?? rawTraderType ?? '';

    const actor: ActorImportInput = {
      traderId,
      traderName,
      region: regionResult.region,
      district: cleanString(raw.District),
      traderType,
      sex: normalizeSex(raw.Sex),
      position: cleanString(raw.Position),
      marketLocation: cleanString(raw['Market location']),
      capacityTons: parseCapacityTons(
        raw['Capacity (volume in t)'] as string | number | null | undefined,
      ),
      technicalSupport: cleanString(raw['Technical support required']),
      phone: cleanString(raw.phone),
      email: cleanString(raw.Email),
      // Both guarded above; the non-null assertion is sound here.
      gpsLatitude: lat as number,
      gpsLongitude: long as number,
      gpsAltitude: toNumberOrNull(raw.gpsaltitude),
      gpsAccuracy: toNumberOrNull(raw.gpsaccuracy),
      consentStatus: 'UNKNOWN',
    };

    return { actor };
  }

  /**
   * PURE transform over an array of raw rows — touches NO database. Returns what
   * WOULD be imported, the quarantined rows with reasons, and a dedupe count.
   *
   * Dedupe (FR-2): keyed on the mapped `traderId`; the FIRST occurrence wins and
   * each later duplicate is dropped and counted in `deduped`.
   */
  importRows(rows: RawSourceRow[]): ImportSummary {
    const imported: ActorImportInput[] = [];
    const quarantined: QuarantinedRow[] = [];
    const seenTraderIds = new Set<string>();
    let deduped = 0;

    for (const raw of rows) {
      const result = this.mapRow(raw);
      if (result.quarantined) {
        quarantined.push(result.quarantined);
        continue;
      }

      const { actor } = result;
      if (seenTraderIds.has(actor.traderId)) {
        deduped += 1; // later duplicate dropped (first occurrence kept)
        continue;
      }
      seenTraderIds.add(actor.traderId);
      imported.push(actor);
    }

    return { imported, quarantined, deduped };
  }

  /**
   * DB-WRITING persist step — EXECUTION-GATED, do NOT call.
   *
   * ╔══════════════════════════════════════════════════════════════════════╗
   * ║ LEGAL GATE (DD-4 / FR-4 / FR-5 / OQ-3):                                 ║
   * ║ Running this against the real source data is DEFERRED until            ║
   * ║ the legal office ratifies consent, PII handling, and public-GPS policy. ║
   * ║ It is intentionally NOT wired to any controller/route and is NEVER      ║
   * ║ auto-run. It may only ever be invoked from an explicit, deliberate ops  ║
   * ║ entrypoint AFTER that ratification — and is not invoked anywhere today. ║
   * ╚══════════════════════════════════════════════════════════════════════╝
   *
   * When (and only when) ratified, an ops runner would call `importRows` first,
   * review the quarantine/dedupe summary, then call this to upsert each row on
   * its unique `traderId`. Rows persist with `consentStatus = 'UNKNOWN'`, so
   * none become public until consent is separately set.
   */
  async runImport(rows: RawSourceRow[]): Promise<ImportSummary> {
    // Defensive runtime guard: refuse to execute unless an operator has set an
    // explicit, deliberate env flag — so an accidental call cannot write data.
    if (process.env.IMPORT_LEGAL_GATE_RATIFIED !== 'true') {
      throw new Error(
        'Real-data import is execution-deferred behind the legal gate ' +
          '(DD-4 / FR-4 / FR-5). Refusing to run: set IMPORT_LEGAL_GATE_RATIFIED ' +
          'only after legal ratification, via an explicit ops entrypoint.',
      );
    }

    const summary = this.importRows(rows);
    for (const actor of summary.imported) {
      await this.prisma.actor.upsert({
        where: { traderId: actor.traderId },
        update: {},
        create: actor as never, // shape aligns to Prisma Actor; cast avoids importing Prisma types here
      });
    }
    return summary;
  }
}
