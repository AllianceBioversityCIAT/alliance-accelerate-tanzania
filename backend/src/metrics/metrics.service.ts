import { Injectable } from '@nestjs/common';
import { ConsentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * T-6 — Public Metrics service (FR-7, NFR-6).
 *
 * Computes the home-page aggregate counters over GRANTED actors ONLY. Consent is
 * pinned in EVERY query (a `consentStatus = GRANTED` WHERE) — never relying on a
 * post-filter — exactly like the T-5 reads (NFR-1, defense in depth). All values
 * are aggregates (counts/distincts), so no PII is involved; we still source only
 * the consented set so an actor who never granted consent is invisible everywhere.
 *
 * The returned shape mirrors the frontend `Metrics` contract field-for-field
 * (archived home-page `frontend/lib/api/metrics.ts`, design.md §5).
 *
 * Design refs: spec design.md §4, §6, §7. Requirements: FR-7, NFR-6.
 */

/** Per-crop counter — exactly the frontend `CropMetric` shape (design.md §5). */
export interface CropMetric {
  slug: 'sorghum' | 'common_bean' | 'groundnut';
  mappedActors: number;
}

/** Home-page aggregate metrics — exactly the frontend `Metrics` shape (design.md §5). */
export interface Metrics {
  actorsMapped: number;
  cropsTracked: number;
  regionsCovered: number;
  actorTypes: number;
  crops: CropMetric[];
}

/**
 * The three tracked crop slugs (design.md §5). The `crops` array ALWAYS carries
 * all three in this order, even when a crop has zero GRANTED actors, so the
 * frontend can render a stable "Major crops" row.
 */
const CROP_SLUGS: ReadonlyArray<CropMetric['slug']> = [
  'sorghum',
  'common_bean',
  'groundnut',
];

/** Consent guard reused by every query — GRANTED only (FR-7). */
const GRANTED_ONLY: Prisma.ActorWhereInput = {
  consentStatus: ConsentStatus.GRANTED,
};

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aggregate the home-page counters over the GRANTED actor set (FR-7).
   *
   * Every count/groupBy is consent-filtered. `cropsTracked` is the number of the
   * three tracked slugs that have ≥1 GRANTED actor (so it is capped at 3 by
   * construction); `crops` reports the per-slug GRANTED count for all three.
   */
  async getMetrics(): Promise<Metrics> {
    const [
      actorsMapped,
      regionGroups,
      typeGroups,
      cropCounts,
    ] = await Promise.all([
      // actorsMapped — total consented actors mapped.
      this.prisma.actor.count({ where: GRANTED_ONLY }),
      // regionsCovered — distinct regions among GRANTED actors.
      this.prisma.actor.groupBy({ by: ['region'], where: GRANTED_ONLY }),
      // actorTypes — distinct traderTypes among GRANTED actors.
      this.prisma.actor.groupBy({ by: ['traderType'], where: GRANTED_ONLY }),
      // crops[] — per-slug count of GRANTED actors linked to that crop.
      Promise.all(
        CROP_SLUGS.map((slug) =>
          this.prisma.actor.count({
            where: {
              ...GRANTED_ONLY,
              crops: { some: { crop: { name: slug } } },
            },
          }),
        ),
      ),
    ]);

    const crops: CropMetric[] = CROP_SLUGS.map((slug, i) => ({
      slug,
      mappedActors: cropCounts[i],
    }));

    return {
      actorsMapped,
      // cropsTracked — tracked crops that have ≥1 GRANTED actor (capped at 3).
      cropsTracked: crops.filter((c) => c.mappedActors > 0).length,
      regionsCovered: regionGroups.length,
      actorTypes: typeGroups.length,
      crops,
    };
  }
}
