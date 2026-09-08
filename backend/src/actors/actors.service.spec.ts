import { ConsentStatus } from '@prisma/client';
import { ActorsService } from './actors.service';
import { ListQueryDto } from './dto/list-query.dto';
import {
  CONTACT_BLOCK_FIELDS,
  NEVER_PUBLIC_FIELDS,
} from '../common/pii-consent.policy';

/**
 * T-5/T-8 — ActorsService unit tests with a MOCKED PrismaService (no DB).
 *
 * These assert the SECURITY-critical contract at the API layer (NFR-1, defense
 * in depth — independent of the T-7 serializer's own tests):
 *   - consent is enforced in the prisma WHERE (`GRANTED`), not serializer-only —
 *     this is also the standing falsifying-input check for the consent pin:
 *     removing it reddens the two tests marked below (NFR-2's spirit at this
 *     layer; the release gate itself is `pii-boundary.spec.ts`, T-11/T-12);
 *   - region/role/crop filters + pagination translate into the prisma call args;
 *   - `findPublic` returns the LIST set — no contact-block key, by key (FR-9);
 *   - `findOnePublic` returns the PUBLISHED set — the full contact block, by
 *     value (FR-1);
 *   - findOnePublic returns null for absent OR non-consented ids (→ 404).
 *
 * Live HTTP e2e against a real MySQL is a tracked DEFERRED step (no reachable DB
 * in this environment) — see test/actors.e2e-spec.ts (NFR-7).
 */

/**
 * A fully-populated Prisma-shaped Actor row WITH PII set, used to prove the API
 * layer strips it. `crops` carries the included `crop` relation the serializer
 * reads. Fields are the schema columns (Decimals as numbers — the serializer
 * coerces). `contactPerson` (T-1/FR-4) is populated so the detail-shape test
 * below has a real value to assert, not a default `null`.
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
    contactPerson: 'Grace Mushi',
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

/**
 * Non-public columns that must never appear in a public response (NFR-1) —
 * {@link NEVER_PUBLIC_FIELDS} already names `traderId`/`gpsAltitude`/
 * `gpsAccuracy` plus `technicalSupport` and the registration-source/consent
 * provenance columns, so no hand-maintained literal list is needed. This used
 * to be `[...PII_ALLOWLIST, 'traderId', 'gpsAltitude', 'gpsAccuracy']`;
 * `actors/public-profile-disclosure` T-6 emptied `PII_ALLOWLIST` (disclosure
 * moved to `PUBLICLY_DISCLOSED_FIELDS`/`CONTACT_BLOCK_FIELDS`) and moved
 * `technicalSupport` here — T-9 re-points this constant so that move is
 * actually covered again instead of silently dropped (D-1c).
 */
const FORBIDDEN_KEYS = [...NEVER_PUBLIC_FIELDS];

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
    // T-8 falsifying input (NFR-1) — deleting the `consentStatus: GRANTED`
    // line from `findPublic`'s WHERE reddens BOTH assertions below: the
    // literal `.toBe(ConsentStatus.GRANTED)` checks have nothing else that
    // could make them pass.
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

    it('translates the district filter into a `contains` WHERE clause, not equality', async () => {
      prisma.actor.findMany.mockResolvedValue([]);
      prisma.actor.count.mockResolvedValue(0);

      await service.findPublic({ district: 'Moshi' } as ListQueryDto);

      const where = prisma.actor.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        consentStatus: ConsentStatus.GRANTED,
        district: { contains: 'Moshi' },
      });
      // `contains`, so a partial district ("Moshi") reaches "Moshi Urban" —
      // there is no canonical district list for a user to pick from.
      expect(where.district).not.toBe('Moshi');
    });

    it('district is a filter in its own right, not folded into the search OR', async () => {
      prisma.actor.findMany.mockResolvedValue([]);
      prisma.actor.count.mockResolvedValue(0);

      await service.findPublic({ district: 'Moshi' } as ListQueryDto);

      const where = prisma.actor.findMany.mock.calls[0][0].where;
      // Regression guard: the dashboard shipped a District input while
      // `district` was absent from ListQueryDto, so the pipe's
      // `whitelist: true` stripped it and the control silently did nothing.
      // A sibling key ANDs with consent; an OR member would not.
      expect(where.OR).toBeUndefined();
    });

    it('adds an OR partial match over name/region/district for a search term (FR-4)', async () => {
      prisma.actor.findMany.mockResolvedValue([]);
      prisma.actor.count.mockResolvedValue(0);

      await service.findPublic({ search: 'meru' } as ListQueryDto);

      const where = prisma.actor.findMany.mock.calls[0][0].where;
      // case-insensitivity is the MySQL `_ci` collation's job — the query just
      // passes the raw trimmed term (no `mode: 'insensitive'`).
      expect(where.OR).toEqual([
        { traderName: { contains: 'meru' } },
        { region: { contains: 'meru' } },
        { district: { contains: 'meru' } },
      ]);
    });

    it('trims the search term and ignores a whitespace-only one', async () => {
      prisma.actor.findMany.mockResolvedValue([]);
      prisma.actor.count.mockResolvedValue(0);

      await service.findPublic({ search: '  arusha  ' } as ListQueryDto);
      expect(prisma.actor.findMany.mock.calls[0][0].where.OR).toEqual([
        { traderName: { contains: 'arusha' } },
        { region: { contains: 'arusha' } },
        { district: { contains: 'arusha' } },
      ]);

      await service.findPublic({ search: '   ' } as ListQueryDto);
      expect(prisma.actor.findMany.mock.calls[1][0].where.OR).toBeUndefined();
    });

    it('ANDs search with consent and crop/role/region filters (siblings)', async () => {
      prisma.actor.findMany.mockResolvedValue([]);
      prisma.actor.count.mockResolvedValue(0);

      await service.findPublic({
        search: 'seed',
        region: 'Arusha',
        role: 'seed_company',
        crop: 'sorghum',
      } as ListQueryDto);

      const where = prisma.actor.findMany.mock.calls[0][0].where;
      // consent + filters survive alongside OR; all sibling keys → Prisma ANDs.
      expect(where).toMatchObject({
        consentStatus: ConsentStatus.GRANTED,
        region: 'Arusha',
        traderType: 'seed_company',
        crops: { some: { crop: { name: 'sorghum' } } },
        OR: [
          { traderName: { contains: 'seed' } },
          { region: { contains: 'seed' } },
          { district: { contains: 'seed' } },
        ],
      });
    });

    it('counts the SAME searched + GRANTED set so total stays accurate', async () => {
      prisma.actor.findMany.mockResolvedValue([fixtureActor()]);
      prisma.actor.count.mockResolvedValue(1);

      const res = await service.findPublic({ search: 'meru' } as ListQueryDto);

      const findWhere = prisma.actor.findMany.mock.calls[0][0].where;
      const countWhere = prisma.actor.count.mock.calls[0][0].where;
      // non-GRANTED rows are excluded by the shared consent pin in both calls.
      expect(countWhere.consentStatus).toBe(ConsentStatus.GRANTED);
      expect(countWhere).toEqual(findWhere);
      expect(res.total).toBe(1);
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

    it('carries NO contact-block key — the list set is the published set minus the contact block (FR-9)', async () => {
      prisma.actor.findMany.mockResolvedValue([fixtureActor()]);
      prisma.actor.count.mockResolvedValue(1);

      const res = await service.findPublic({} as ListQueryDto);

      const item = res.data[0] as unknown as Record<string, unknown>;
      for (const key of CONTACT_BLOCK_FIELDS) {
        expect(item).not.toHaveProperty(key);
      }
    });
  });

  describe('findOnePublic', () => {
    // Retitled T-9 (D-1c carry-over from T-8's review): this used to be
    // titled "returns a PII-stripped actor for a GRANTED id", which FR-1
    // made false — a GRANTED detail response deliberately carries phone/
    // email/contactPerson/position/marketLocation (proved by the very next
    // test below). What this test actually still proves is narrower: the
    // never-public admin metadata (traderId/gpsAltitude/gpsAccuracy/
    // technicalSupport/registration-source & consent-provenance columns)
    // stays stripped even on the published detail path.
    it('strips admin-only never-public metadata from a GRANTED id, even though it carries PII by design (FR-1/FR-3)', async () => {
      prisma.actor.findUnique.mockResolvedValue(fixtureActor());

      const actor = await service.findOnePublic('actor-1');

      expect(actor).not.toBeNull();
      for (const key of FORBIDDEN_KEYS) {
        expect(actor).not.toHaveProperty(key);
      }
      expect(actor).toMatchObject({ id: 'actor-1', gps: { lat: -3.3869, long: 36.683 } });
    });

    it('carries the FULL contact block by value for a GRANTED id (FR-1)', async () => {
      prisma.actor.findUnique.mockResolvedValue(fixtureActor());

      const actor = await service.findOnePublic('actor-1');

      // By value, not only by key — the same discipline `pii-boundary.spec.ts`
      // uses, so a projection that carries the KEYS with wrong/blank values
      // would still fail this.
      expect(actor).toMatchObject({
        contactPerson: 'Grace Mushi',
        position: 'Director',
        phone: '+255700000000',
        email: 'director@example.com',
        marketLocation: 'Arusha Central Market',
      });
    });

    it('returns null when the id is absent (→ 404)', async () => {
      prisma.actor.findUnique.mockResolvedValue(null);

      expect(await service.findOnePublic('missing')).toBeNull();
    });

    // T-8 falsifying input (NFR-1) — removing the `isPublic` re-check from
    // `findOnePublic` reddens this and the UNKNOWN test below: with no
    // consent gate, `fixtureActor({ consentStatus: DENIED })` would project
    // and return non-null instead of `null`.
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
