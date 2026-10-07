// @sdd-spec actors/consent-intake/intake-required-fields (T-3)
/**
 * `IntakeDuplicateService` unit tests (design.md §4.3, DD-3, DD-4; FR-3,
 * NFR-3). Mocked `PrismaService` — no DB, mirroring
 * `duplicate-detection.service.spec.ts`'s own style.
 */
import { IntakeDuplicateService, IntakeDuplicateIndex, MAX_WEAK_CANDIDATES } from './intake-duplicate.service';

interface MockPrisma {
  actor: { findMany: jest.Mock };
}

function fixtureActorRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'actor-1',
    traderId: 'TZ-SEED-0001',
    traderName: 'Meru Agro-Processing & Seeds',
    phone: '+255712345678',
    email: 'director@example.com',
    gpsLatitude: -3.3869,
    gpsLongitude: 36.683,
    ...overrides,
  };
}

function fixtureCandidate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    phone: null,
    email: null,
    traderName: 'Unrelated Trader',
    gpsLatitude: null,
    gpsLongitude: null,
    ...overrides,
  } as {
    phone: string | null;
    email: string | null;
    traderName: string;
    gpsLatitude: number | null;
    gpsLongitude: number | null;
  };
}

describe('IntakeDuplicateService (mocked Prisma)', () => {
  let service: IntakeDuplicateService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = { actor: { findMany: jest.fn() } };
    service = new IntakeDuplicateService(prisma as unknown as never);
  });

  describe('check — one scan, strength-first classification', () => {
    it('issues exactly ONE actor.findMany call', async () => {
      prisma.actor.findMany.mockResolvedValue([]);

      await service.check(fixtureCandidate());

      expect(prisma.actor.findMany).toHaveBeenCalledTimes(1);
    });

    it('returns no candidates against an empty actor table', async () => {
      prisma.actor.findMany.mockResolvedValue([]);

      const result = await service.check(fixtureCandidate({ email: 'x@example.com' }));

      expect(result).toEqual({ strong: [], weak: [] });
    });

    it('classifies a phone match as strong (normalized, spacing difference)', async () => {
      prisma.actor.findMany.mockResolvedValue([fixtureActorRow({ phone: '+255712345678' })]);

      const result = await service.check(fixtureCandidate({ phone: '0712 345 678' }));

      expect(result.strong).toEqual([
        { actorId: 'actor-1', traderId: 'TZ-SEED-0001', traderName: 'Meru Agro-Processing & Seeds', matchedOn: ['phone'] },
      ]);
      expect(result.weak).toEqual([]);
    });

    it('classifies an email match as strong (case-insensitive)', async () => {
      prisma.actor.findMany.mockResolvedValue([fixtureActorRow({ email: 'Director@Example.com' })]);

      const result = await service.check(fixtureCandidate({ email: 'director@example.com' }));

      expect(result.strong[0].matchedOn).toEqual(['email']);
      expect(result.weak).toEqual([]);
    });

    // Falsifier 3 (tasks.md T-3) — traderName alone must classify as WEAK.
    it('classifies a traderName-only match as weak, never strong', async () => {
      prisma.actor.findMany.mockResolvedValue([
        fixtureActorRow({ phone: null, email: null, traderName: 'Shared Name' }),
      ]);

      const result = await service.check(fixtureCandidate({ traderName: 'Shared Name' }));

      expect(result.strong).toEqual([]);
      expect(result.weak).toEqual([
        { actorId: 'actor-1', traderId: 'TZ-SEED-0001', traderName: 'Shared Name', matchedOn: ['traderName'] },
      ]);
    });

    it('classifies a GPS-box match as weak, never strong', async () => {
      prisma.actor.findMany.mockResolvedValue([
        fixtureActorRow({ phone: null, email: null, traderName: 'Unrelated Trader 2', gpsLatitude: -3.39, gpsLongitude: 36.69 }),
      ]);

      const result = await service.check(
        fixtureCandidate({ gpsLatitude: -3.3869, gpsLongitude: 36.683 }),
      );

      expect(result.strong).toEqual([]);
      expect(result.weak[0].matchedOn).toEqual(['gps']);
    });

    it('weak candidates are capped at MAX_WEAK_CANDIDATES (5); strong is never capped', async () => {
      const weakRows = Array.from({ length: 8 }, (_, i) =>
        fixtureActorRow({
          id: `actor-weak-${i}`,
          traderId: `TZ-WEAK-${i}`,
          phone: null,
          email: null,
          traderName: 'Shared Name',
        }),
      );
      // 7 DISTINCT existing actors that all happen to share the SAME email
      // as the incoming candidate (realistic: duplicate contact data) — each
      // independently classifies strong, so this is 7 strong candidates,
      // not one.
      const strongRows = Array.from({ length: 7 }, (_, i) =>
        fixtureActorRow({
          id: `actor-strong-${i}`,
          traderId: `TZ-STRONG-${i}`,
          email: 'strong-match@example.com',
          traderName: 'Unrelated',
        }),
      );
      prisma.actor.findMany.mockResolvedValue([...weakRows, ...strongRows]);

      const result = await service.check(
        fixtureCandidate({
          traderName: 'Shared Name',
          email: 'strong-match@example.com',
        }),
      );

      expect(MAX_WEAK_CANDIDATES).toBe(5);
      expect(result.weak).toHaveLength(5);
      expect(result.strong).toHaveLength(7);
    });

    // DD-3 falsifier (tasks.md T-3, falsifier 1) — the fixture this clause
    // names: 5 actors matching on name+GPS (weak, matchedOn.length === 2)
    // plus 1 actor matching on email only (strong, matchedOn.length === 1).
    // Re-applying the registration matcher's cap — sort by matchedOn.length
    // desc, then slice(0, 5), BEFORE partitioning strong/weak — drops the
    // email-only strong match entirely (it ranks 6th), which is exactly the
    // hazard DD-3 exists to avoid for a GATE.
    it('DD-3: an email-only strong match is never capped away by 5 higher-ranked weak name+GPS matches', async () => {
      const weakRows = Array.from({ length: 5 }, (_, i) =>
        fixtureActorRow({
          id: `actor-weak-${i}`,
          traderId: `TZ-WEAK-${i}`,
          phone: null,
          email: null,
          traderName: 'Shared Name',
          gpsLatitude: -3.3869,
          gpsLongitude: 36.683,
        }),
      );
      const strongRow = fixtureActorRow({
        id: 'actor-email-only',
        traderId: 'TZ-EMAIL-ONLY',
        phone: null,
        email: 'strong-match@example.com',
        traderName: 'Totally Unrelated',
        gpsLatitude: 10,
        gpsLongitude: 10,
      });
      prisma.actor.findMany.mockResolvedValue([...weakRows, strongRow]);

      const result = await service.check(
        fixtureCandidate({
          traderName: 'Shared Name',
          gpsLatitude: -3.3869,
          gpsLongitude: 36.683,
          email: 'strong-match@example.com',
        }),
      );

      expect(result.strong.map((c) => c.actorId)).toEqual(['actor-email-only']);
      expect(result.weak).toHaveLength(5);
    });

    // NFR-3 falsifier 4 — the candidate key set never carries a matched
    // VALUE, only attribute names.
    it('NFR-3: every candidate key set is exactly {actorId, traderId, traderName, matchedOn} — no phone/email value', async () => {
      prisma.actor.findMany.mockResolvedValue([
        fixtureActorRow({ phone: '+255712345678', email: 'director@example.com' }),
      ]);

      const result = await service.check(
        fixtureCandidate({ phone: '+255712345678', email: 'director@example.com' }),
      );

      for (const candidate of [...result.strong, ...result.weak]) {
        expect(Object.keys(candidate).sort()).toEqual([
          'actorId',
          'matchedOn',
          'traderId',
          'traderName',
        ]);
      }
    });
  });

  describe('checkBatch — ONE scan serves N candidates (design.md §4.3, reused for a whole import batch)', () => {
    it('issues exactly ONE actor.findMany call for a batch of 3 candidates', async () => {
      prisma.actor.findMany.mockResolvedValue([fixtureActorRow()]);

      await service.checkBatch([
        fixtureCandidate({ email: 'a@example.com' }),
        fixtureCandidate({ email: 'b@example.com' }),
        fixtureCandidate({ email: 'c@example.com' }),
      ]);

      // Falsifier: a batch path that calls `check()` (or `findMany`) once
      // per candidate reddens this — it must stay ONE regardless of N.
      expect(prisma.actor.findMany).toHaveBeenCalledTimes(1);
    });

    it('classifies every candidate against the SAME snapshot, in input order', async () => {
      prisma.actor.findMany.mockResolvedValue([
        fixtureActorRow({ phone: '+255712345678', email: 'director@example.com' }),
      ]);

      const results = await service.checkBatch([
        fixtureCandidate({ phone: '+255712345678' }), // strong: phone
        fixtureCandidate({ traderName: 'Meru Agro-Processing & Seeds' }), // weak: traderName
        fixtureCandidate({ email: 'nobody@example.com' }), // no match
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].strong.map((c) => c.matchedOn)).toEqual([['phone']]);
      expect(results[1].strong).toEqual([]);
      expect(results[1].weak.map((c) => c.matchedOn)).toEqual([['traderName']]);
      expect(results[2]).toEqual({ strong: [], weak: [] });
    });
  });

  describe('IntakeDuplicateIndex — in-file matching (design.md §4.3, §4.5; built for T-5)', () => {
    it('returns no matches before anything has been added', () => {
      const index = new IntakeDuplicateIndex();

      const matches = index.match(fixtureCandidate({ email: 'x@example.com' }));

      expect(matches).toEqual({ strong: [], weak: [] });
    });

    it('matches a later row against an earlier-added row by phone (normalized) — strong', () => {
      const index = new IntakeDuplicateIndex();
      index.add(
        'row:5',
        fixtureCandidate({ phone: '+255712345678', traderName: 'Row Five Trader' }),
      );

      const matches = index.match(
        fixtureCandidate({ phone: '0712 345 678', traderName: 'A Different Name' }),
      );

      expect(matches.strong).toEqual([
        { key: 'row:5', traderName: 'Row Five Trader', matchedOn: ['phone'] },
      ]);
      expect(matches.weak).toEqual([]);
    });

    it('matches by email (case-insensitive) — strong', () => {
      const index = new IntakeDuplicateIndex();
      index.add(
        'row:1',
        fixtureCandidate({ email: 'Shared@Example.com', traderName: 'Row One Trader' }),
      );

      const matches = index.match(
        fixtureCandidate({ email: 'shared@example.com', traderName: 'A Different Name' }),
      );

      expect(matches.strong.map((m) => m.key)).toEqual(['row:1']);
      expect(matches.strong[0].matchedOn).toEqual(['email']);
      expect(matches.weak).toEqual([]);
    });

    it('matches by GPS box overlap (linear scan — no bucket key) — weak', () => {
      const index = new IntakeDuplicateIndex();
      index.add(
        'row:2',
        fixtureCandidate({
          gpsLatitude: -3.3869,
          gpsLongitude: 36.683,
          traderName: 'Row Two Trader',
        }),
      );

      const matches = index.match(
        fixtureCandidate({ gpsLatitude: -3.39, gpsLongitude: 36.69, traderName: 'A Different Name' }),
      );

      expect(matches.strong).toEqual([]);
      expect(matches.weak.map((m) => m.key)).toEqual(['row:2']);
      expect(matches.weak[0].matchedOn).toEqual(['gps']);
    });

    // Falsifier 3 analogue for the in-file path — proves `match()` shares
    // the SAME strong/weak rule as `check`/`checkBatch`: classifying
    // `traderName` as strong in `isStrongMatch` would redden this spec
    // AND the service's own "traderName-only match as weak" spec above.
    it('matches by traderName alone as weak, never strong — the same rule check()/checkBatch() use', () => {
      const index = new IntakeDuplicateIndex();
      index.add('row:3', fixtureCandidate({ traderName: 'Shared Name' }));

      const matches = index.match(fixtureCandidate({ traderName: 'Shared Name' }));

      expect(matches.strong).toEqual([]);
      expect(matches.weak).toEqual([
        { key: 'row:3', traderName: 'Shared Name', matchedOn: ['traderName'] },
      ]);
    });

    it('does not match an unrelated row', () => {
      const index = new IntakeDuplicateIndex();
      index.add(
        'row:1',
        fixtureCandidate({ email: 'a@example.com', traderName: 'Row One Trader' }),
      );

      const matches = index.match(
        fixtureCandidate({ email: 'b@example.com', traderName: 'A Different Name' }),
      );

      expect(matches).toEqual({ strong: [], weak: [] });
    });

    it('never matches against a row that was never added (caller-decided exclusion, e.g. a failed row)', () => {
      const index = new IntakeDuplicateIndex();
      // A row the caller chose NOT to add (T-5: a `failed` row) can never
      // surface as a match source, because this class only ever matches
      // against entries it was explicitly told to `add`.
      const matches = index.match(fixtureCandidate({ email: 'never-added@example.com' }));
      expect(matches).toEqual({ strong: [], weak: [] });
    });

    it('weak matches are capped at MAX_WEAK_CANDIDATES (5); strong is never capped', () => {
      const index = new IntakeDuplicateIndex();
      for (let i = 0; i < 8; i += 1) {
        index.add(`row:weak-${i}`, fixtureCandidate({ traderName: 'Shared Name' }));
      }
      for (let i = 0; i < 7; i += 1) {
        index.add(
          `row:strong-${i}`,
          fixtureCandidate({ email: 'strong-match@example.com', traderName: `Unrelated ${i}` }),
        );
      }

      const matches = index.match(
        fixtureCandidate({ traderName: 'Shared Name', email: 'strong-match@example.com' }),
      );

      expect(matches.weak).toHaveLength(5);
      expect(matches.strong).toHaveLength(7);
    });
  });
});
