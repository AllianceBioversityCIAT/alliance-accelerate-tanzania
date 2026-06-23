import { ConsentStatus } from '@prisma/client';
import { MetricsService } from './metrics.service';

/**
 * T-6 — MetricsService unit tests with a MOCKED PrismaService (no DB).
 *
 * These assert the home-page metrics contract (FR-7, NFR-6):
 *   - every count/groupBy is consent-filtered (`GRANTED`) — non-granted excluded;
 *   - `crops` ALWAYS carries all three slugs, per-slug counts are GRANTED-only;
 *   - `regionsCovered`/`actorTypes` are distinct counts over the GRANTED set;
 *   - the returned object matches the frontend `Metrics` interface field-for-field.
 *
 * Live HTTP e2e against a real MySQL is a tracked DEFERRED step (no reachable DB
 * in this environment).
 */

const SLUGS = ['sorghum', 'common_bean', 'groundnut'] as const;

/** Reads the crop slug out of a per-crop `actor.count` call's WHERE. */
function cropSlugOf(callArgs: { where?: { crops?: { some?: { crop?: { name?: string } } } } }) {
  return callArgs.where?.crops?.some?.crop?.name;
}

describe('MetricsService (mocked Prisma)', () => {
  let service: MetricsService;
  let prisma: {
    actor: {
      count: jest.Mock;
      groupBy: jest.Mock;
    };
  };

  /**
   * Wire the mock for a scenario: a base GRANTED actor count, distinct
   * region/type groups, and a per-slug GRANTED count map. The unfiltered
   * `count` (no `crops` in WHERE) returns `actorsMapped`; a `crops`-scoped
   * `count` returns the per-slug value.
   */
  function setup(opts: {
    actorsMapped: number;
    regions: string[];
    traderTypes: string[];
    perCrop: Record<(typeof SLUGS)[number], number>;
  }) {
    prisma = {
      actor: {
        count: jest.fn().mockImplementation((args) => {
          const slug = cropSlugOf(args ?? {});
          if (slug) return Promise.resolve(opts.perCrop[slug as keyof typeof opts.perCrop] ?? 0);
          return Promise.resolve(opts.actorsMapped);
        }),
        groupBy: jest.fn().mockImplementation((args) => {
          if (args.by?.includes('region')) {
            return Promise.resolve(opts.regions.map((region) => ({ region })));
          }
          if (args.by?.includes('traderType')) {
            return Promise.resolve(opts.traderTypes.map((traderType) => ({ traderType })));
          }
          return Promise.resolve([]);
        }),
      },
    };
    service = new MetricsService(prisma as never);
  }

  it('counts only GRANTED actors for actorsMapped (non-granted excluded — FR-7)', async () => {
    // 12 GRANTED + 5 non-granted exist; the consent-filtered count returns 12.
    setup({
      actorsMapped: 12,
      regions: ['Arusha'],
      traderTypes: ['seed_company'],
      perCrop: { sorghum: 0, common_bean: 0, groundnut: 0 },
    });

    const metrics = await service.getMetrics();

    expect(metrics.actorsMapped).toBe(12);
    // Every count/groupBy pins consentStatus = GRANTED (not a post-filter).
    for (const call of prisma.actor.count.mock.calls) {
      expect(call[0].where.consentStatus).toBe(ConsentStatus.GRANTED);
    }
    for (const call of prisma.actor.groupBy.mock.calls) {
      expect(call[0].where.consentStatus).toBe(ConsentStatus.GRANTED);
    }
  });

  it('always returns all three crop slugs with GRANTED-only per-crop counts', async () => {
    setup({
      actorsMapped: 20,
      regions: ['Arusha', 'Dodoma'],
      traderTypes: ['seed_company'],
      perCrop: { sorghum: 7, common_bean: 0, groundnut: 4 },
    });

    const metrics = await service.getMetrics();

    expect(metrics.crops).toEqual([
      { slug: 'sorghum', mappedActors: 7 },
      { slug: 'common_bean', mappedActors: 0 },
      { slug: 'groundnut', mappedActors: 4 },
    ]);
    // Each per-crop count is itself consent-filtered.
    const cropCalls = prisma.actor.count.mock.calls.filter((c) => cropSlugOf(c[0]));
    expect(cropCalls).toHaveLength(3);
    for (const call of cropCalls) {
      expect(call[0].where.consentStatus).toBe(ConsentStatus.GRANTED);
    }
  });

  it('cropsTracked counts only slugs with >=1 GRANTED actor (capped at 3)', async () => {
    setup({
      actorsMapped: 11,
      regions: ['Arusha'],
      traderTypes: ['seed_company'],
      perCrop: { sorghum: 7, common_bean: 0, groundnut: 4 }, // 2 represented
    });

    const metrics = await service.getMetrics();

    expect(metrics.cropsTracked).toBe(2);
  });

  it('regionsCovered and actorTypes are distinct counts over the GRANTED set', async () => {
    setup({
      actorsMapped: 30,
      regions: ['Arusha', 'Dodoma', 'Mbeya'],
      traderTypes: ['seed_company', 'agro_dealer'],
      perCrop: { sorghum: 1, common_bean: 1, groundnut: 1 },
    });

    const metrics = await service.getMetrics();

    expect(metrics.regionsCovered).toBe(3);
    expect(metrics.actorTypes).toBe(2);
  });

  it('returns the exact Metrics shape (field-for-field with the frontend contract)', async () => {
    setup({
      actorsMapped: 5,
      regions: ['Arusha'],
      traderTypes: ['seed_company'],
      perCrop: { sorghum: 2, common_bean: 1, groundnut: 0 },
    });

    const metrics = await service.getMetrics();

    // Top-level keys exactly the Metrics interface — no more, no less.
    expect(Object.keys(metrics).sort()).toEqual(
      ['actorTypes', 'actorsMapped', 'crops', 'cropsTracked', 'regionsCovered'].sort(),
    );
    // Each crop entry has exactly { slug, mappedActors }.
    for (const crop of metrics.crops) {
      expect(Object.keys(crop).sort()).toEqual(['mappedActors', 'slug'].sort());
      expect(SLUGS).toContain(crop.slug);
      expect(typeof crop.mappedActors).toBe('number');
    }
    expect(typeof metrics.actorsMapped).toBe('number');
    expect(typeof metrics.cropsTracked).toBe('number');
    expect(typeof metrics.regionsCovered).toBe('number');
    expect(typeof metrics.actorTypes).toBe('number');
  });

  it('returns zeros/empty distincts for an empty GRANTED set', async () => {
    setup({
      actorsMapped: 0,
      regions: [],
      traderTypes: [],
      perCrop: { sorghum: 0, common_bean: 0, groundnut: 0 },
    });

    const metrics = await service.getMetrics();

    expect(metrics).toEqual({
      actorsMapped: 0,
      cropsTracked: 0,
      regionsCovered: 0,
      actorTypes: 0,
      crops: [
        { slug: 'sorghum', mappedActors: 0 },
        { slug: 'common_bean', mappedActors: 0 },
        { slug: 'groundnut', mappedActors: 0 },
      ],
    });
  });
});
