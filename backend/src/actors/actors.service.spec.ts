import { ConsentStatus } from '@prisma/client';
import { ActorsService } from './actors.service';
import { ListQueryDto } from './dto/list-query.dto';
import { PII_ALLOWLIST } from '../common/pii-consent.policy';

/**
 * T-5 — ActorsService unit tests with a MOCKED PrismaService (no DB).
 *
 * These assert the SECURITY-critical contract at the API layer (NFR-1, defense
 * in depth — independent of the T-4 serializer's own tests):
 *   - consent is enforced in the prisma WHERE (`GRANTED`), not serializer-only;
 *   - region/role/crop filters + pagination translate into the prisma call args;
 *   - every returned item is PII-stripped even when the source row carries PII;
 *   - findOnePublic returns null for absent OR non-consented ids (→ 404).
 *
 * Live HTTP e2e against a real MySQL is a tracked DEFERRED step (no reachable DB
 * in this environment) — see test/actors.e2e-spec.ts (NFR-7).
 */

/**
 * A fully-populated Prisma-shaped Actor row WITH PII set, used to prove the API
 * layer strips it. `crops` carries the included `crop` relation the serializer
 * reads. Fields are the schema columns (Decimals as numbers — toPublic coerces).
 */
function fixtureActor(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'actor-1',
    traderId: 'TZ-SEED-0001',
    traderName: 'Meru Agro-Processing & Seeds',
    region: 'Arusha',
    district: 'Arusha Urban',
    traderType: 'seed_company',
    // PII — populated on purpose; MUST NOT appear in any public output.
    sex: 'M',
    position: 'Director',
    marketLocation: 'Arusha Central Market',
    phone: '+255700000000',
    email: 'director@example.com',
    technicalSupport: 'Needs cold storage',
    capacityTons: 1850,
    gpsLatitude: -3.3869,
    gpsLongitude: 36.683,
    gpsAltitude: 1400,
    gpsAccuracy: 5,
    consentStatus: ConsentStatus.GRANTED,
    crops: [{ crop: { name: 'sorghum' } }, { crop: { name: 'common_bean' } }],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Non-public columns that must never appear in a public response (NFR-1). */
const FORBIDDEN_KEYS = [
  ...PII_ALLOWLIST,
  'traderId',
  'gpsAltitude',
  'gpsAccuracy',
];

describe('ActorsService (mocked Prisma)', () => {
  let service: ActorsService;
  let prisma: {
    actor: {
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      actor: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    service = new ActorsService(prisma as never);
  });

  describe('findPublic', () => {
    it('enforces consent = GRANTED in the prisma WHERE (not serializer-only)', async () => {
      prisma.actor.findMany.mockResolvedValue([]);
      prisma.actor.count.mockResolvedValue(0);

      await service.findPublic({} as ListQueryDto);

      const findArgs = prisma.actor.findMany.mock.calls[0][0];
      const countArgs = prisma.actor.count.mock.calls[0][0];
      expect(findArgs.where.consentStatus).toBe(ConsentStatus.GRANTED);
      // total counts the SAME filtered GRANTED set.
      expect(countArgs.where.consentStatus).toBe(ConsentStatus.GRANTED);
    });

    it('translates region/role/crop filters into the prisma WHERE', async () => {
      prisma.actor.findMany.mockResolvedValue([]);
      prisma.actor.count.mockResolvedValue(0);

      await service.findPublic({
        region: 'Arusha',
        role: 'seed_company',
        crop: 'sorghum',
      } as ListQueryDto);

      const where = prisma.actor.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        consentStatus: ConsentStatus.GRANTED,
        region: 'Arusha',
        traderType: 'seed_company', // role → traderType
        crops: { some: { crop: { name: 'sorghum' } } },
      });
    });

    it('omits absent filters from the WHERE (only consent pinned)', async () => {
      prisma.actor.findMany.mockResolvedValue([]);
      prisma.actor.count.mockResolvedValue(0);

      await service.findPublic({} as ListQueryDto);

      const where = prisma.actor.findMany.mock.calls[0][0].where;
      expect(where).toEqual({ consentStatus: ConsentStatus.GRANTED });
    });

    it('includes the crops.crop relation so names resolve', async () => {
      prisma.actor.findMany.mockResolvedValue([]);
      prisma.actor.count.mockResolvedValue(0);

      await service.findPublic({} as ListQueryDto);

      const include = prisma.actor.findMany.mock.calls[0][0].include;
      expect(include).toEqual({ crops: { include: { crop: true } } });
    });

    it('maps page/pageSize to skip/take and echoes them with total', async () => {
      prisma.actor.findMany.mockResolvedValue([]);
      prisma.actor.count.mockResolvedValue(42);

      const res = await service.findPublic({
        page: 3,
        pageSize: 10,
      } as ListQueryDto);

      const args = prisma.actor.findMany.mock.calls[0][0];
      expect(args.skip).toBe(20); // (3 - 1) * 10
      expect(args.take).toBe(10);
      expect(res).toMatchObject({ page: 3, pageSize: 10, total: 42 });
    });

    it('applies default page/pageSize when omitted', async () => {
      prisma.actor.findMany.mockResolvedValue([]);
      prisma.actor.count.mockResolvedValue(0);

      const res = await service.findPublic({} as ListQueryDto);

      const args = prisma.actor.findMany.mock.calls[0][0];
      expect(args.skip).toBe(0); // page 1
      expect(args.take).toBe(20); // default pageSize
      expect(res).toMatchObject({ page: 1, pageSize: 20 });
    });

    it('caps pageSize at the max', async () => {
      prisma.actor.findMany.mockResolvedValue([]);
      prisma.actor.count.mockResolvedValue(0);

      const res = await service.findPublic({ pageSize: 9999 } as ListQueryDto);

      expect(prisma.actor.findMany.mock.calls[0][0].take).toBe(100);
      expect(res.pageSize).toBe(100);
    });

    it('PII-strips every returned item even when source rows carry PII (NFR-1)', async () => {
      prisma.actor.findMany.mockResolvedValue([fixtureActor()]);
      prisma.actor.count.mockResolvedValue(1);

      const res = await service.findPublic({} as ListQueryDto);

      expect(res.data).toHaveLength(1);
      const item = res.data[0];
      for (const key of FORBIDDEN_KEYS) {
        expect(item).not.toHaveProperty(key);
      }
      // Public projection is intact: crops mapped to names, GRANTED gps present.
      expect(item).toMatchObject({
        id: 'actor-1',
        traderName: 'Meru Agro-Processing & Seeds',
        region: 'Arusha',
        traderType: 'seed_company',
        crops: ['sorghum', 'common_bean'],
        gps: { lat: -3.3869, long: 36.683 },
      });
    });
  });

  describe('findOnePublic', () => {
    it('returns a PII-stripped actor for a GRANTED id', async () => {
      prisma.actor.findUnique.mockResolvedValue(fixtureActor());

      const actor = await service.findOnePublic('actor-1');

      expect(actor).not.toBeNull();
      for (const key of FORBIDDEN_KEYS) {
        expect(actor).not.toHaveProperty(key);
      }
      expect(actor).toMatchObject({ id: 'actor-1', gps: { lat: -3.3869, long: 36.683 } });
    });

    it('returns null when the id is absent (→ 404)', async () => {
      prisma.actor.findUnique.mockResolvedValue(null);

      expect(await service.findOnePublic('missing')).toBeNull();
    });

    it('returns null for a non-consented (non-public) id (→ 404)', async () => {
      prisma.actor.findUnique.mockResolvedValue(
        fixtureActor({ consentStatus: ConsentStatus.DENIED }),
      );

      expect(await service.findOnePublic('actor-1')).toBeNull();
    });

    it('treats UNKNOWN consent as non-public (→ 404)', async () => {
      prisma.actor.findUnique.mockResolvedValue(
        fixtureActor({ consentStatus: ConsentStatus.UNKNOWN }),
      );

      expect(await service.findOnePublic('actor-1')).toBeNull();
    });
  });
});
