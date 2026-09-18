import { DuplicateDetectionService, DuplicateDetectionInput } from './duplicate-detection.service';

/**
 * T-5 — `DuplicateDetectionService` unit tests with a MOCKED PrismaService
 * (no DB), mirroring `admin-registrations.service.spec.ts`'s mocked-Prisma
 * style.
 *
 * Covers FR-11 scenario 1's queue-flag limb (matching across all four §6.5
 * attributes), NFR-9/DD-20 (exactly one `actor.findMany` per batch, never
 * one per row), and DC-31 (dismissed candidates filtered from both the
 * count and the detail list).
 */

interface MockPrisma {
  actor: {
    findMany: jest.Mock;
  };
}

function fixtureActor(overrides: Partial<Record<string, unknown>> = {}) {
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

function fixtureInput(overrides: Partial<DuplicateDetectionInput> = {}): DuplicateDetectionInput {
  return {
    registrationId: 'reg-1',
    phone: null,
    email: null,
    traderName: 'Unrelated Trader',
    gpsLatitude: null,
    gpsLongitude: null,
    dismissedActorIds: [],
    ...overrides,
  };
}

describe('DuplicateDetectionService (mocked Prisma)', () => {
  let service: DuplicateDetectionService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = {
      actor: {
        findMany: jest.fn(),
      },
    };
    service = new DuplicateDetectionService(prisma as unknown as never);
  });

  describe('detectForBatch — one fetch, not N (DD-20)', () => {
    it('issues exactly ONE actor.findMany call for a multi-row page, regardless of row count', async () => {
      prisma.actor.findMany.mockResolvedValue([fixtureActor()]);

      const inputs = [
        fixtureInput({ registrationId: 'reg-1' }),
        fixtureInput({ registrationId: 'reg-2' }),
        fixtureInput({ registrationId: 'reg-3' }),
        fixtureInput({ registrationId: 'reg-4' }),
      ];

      await service.detectForBatch(inputs);

      expect(prisma.actor.findMany).toHaveBeenCalledTimes(1);
    });

    it('issues zero actor.findMany calls when the batch is empty', async () => {
      await service.detectForBatch([]);

      expect(prisma.actor.findMany).not.toHaveBeenCalled();
    });

    it('returns a map entry for every input, keyed by registrationId', async () => {
      prisma.actor.findMany.mockResolvedValue([]);

      const result = await service.detectForBatch([
        fixtureInput({ registrationId: 'reg-1' }),
        fixtureInput({ registrationId: 'reg-2' }),
      ]);

      expect(result.size).toBe(2);
      expect(result.get('reg-1')).toEqual([]);
      expect(result.get('reg-2')).toEqual([]);
    });
  });

  describe('matching — normalized phone equality', () => {
    it('matches when phones are equal after normalization (spacing difference)', async () => {
      prisma.actor.findMany.mockResolvedValue([fixtureActor({ phone: '+255712345678' })]);

      const result = await service.detectForBatch([
        // Same number, spaced/parenthesized differently — must still match.
        fixtureInput({ registrationId: 'reg-1', phone: '0712 345 678' }),
      ]);

      const candidates = result.get('reg-1')!;
      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ actorId: 'actor-1', matchedOn: ['phone'] });
    });

    it('does not match distinct phone numbers', async () => {
      prisma.actor.findMany.mockResolvedValue([fixtureActor({ phone: '+255712345678' })]);

      const result = await service.detectForBatch([
        fixtureInput({ registrationId: 'reg-1', phone: '0722222222' }),
      ]);

      expect(result.get('reg-1')).toEqual([]);
    });

    it('does not match on phone when only one side has a phone', async () => {
      prisma.actor.findMany.mockResolvedValue([fixtureActor({ phone: null })]);

      const result = await service.detectForBatch([
        fixtureInput({ registrationId: 'reg-1', phone: '0712345678' }),
      ]);

      expect(result.get('reg-1')).toEqual([]);
    });
  });

  describe('matching — lowercased email equality', () => {
    it('matches when emails are equal after case-folding', async () => {
      prisma.actor.findMany.mockResolvedValue([
        fixtureActor({ email: 'Director@Example.com' }),
      ]);

      const result = await service.detectForBatch([
        fixtureInput({ registrationId: 'reg-1', email: 'director@example.com' }),
      ]);

      const candidates = result.get('reg-1')!;
      expect(candidates).toHaveLength(1);
      expect(candidates[0].matchedOn).toEqual(['email']);
    });

    it('does not match on email when both sides are blank/absent', async () => {
      prisma.actor.findMany.mockResolvedValue([fixtureActor({ email: '' })]);

      const result = await service.detectForBatch([
        fixtureInput({ registrationId: 'reg-1', email: null }),
      ]);

      expect(result.get('reg-1')).toEqual([]);
    });
  });

  describe('matching — normalized traderName equality', () => {
    it('matches when trader names are equal after trim/case-fold/whitespace-collapse', async () => {
      prisma.actor.findMany.mockResolvedValue([
        fixtureActor({ traderName: 'Meru   Agro-Processing & Seeds' }),
      ]);

      const result = await service.detectForBatch([
        fixtureInput({ registrationId: 'reg-1', traderName: '  meru agro-processing & seeds  ' }),
      ]);

      const candidates = result.get('reg-1')!;
      expect(candidates).toHaveLength(1);
      expect(candidates[0].matchedOn).toEqual(['traderName']);
    });

    it('does not match distinct trader names', async () => {
      prisma.actor.findMany.mockResolvedValue([fixtureActor({ traderName: 'Alpha Traders' })]);

      const result = await service.detectForBatch([
        fixtureInput({ registrationId: 'reg-1', traderName: 'Beta Traders' }),
      ]);

      expect(result.get('reg-1')).toEqual([]);
    });
  });

  describe('matching — GPS bounding box (both coordinates present)', () => {
    it('matches when coordinates fall within the proximity box', async () => {
      prisma.actor.findMany.mockResolvedValue([
        fixtureActor({ gpsLatitude: -3.3869, gpsLongitude: 36.683 }),
      ]);

      const result = await service.detectForBatch([
        fixtureInput({
          registrationId: 'reg-1',
          gpsLatitude: -3.387,
          gpsLongitude: 36.6831,
        }),
      ]);

      const candidates = result.get('reg-1')!;
      expect(candidates).toHaveLength(1);
      expect(candidates[0].matchedOn).toEqual(['gps']);
    });

    it('does not match when coordinates fall outside the proximity box', async () => {
      prisma.actor.findMany.mockResolvedValue([
        fixtureActor({ gpsLatitude: -3.3869, gpsLongitude: 36.683 }),
      ]);

      const result = await service.detectForBatch([
        fixtureInput({ registrationId: 'reg-1', gpsLatitude: -6.7924, gpsLongitude: 39.2083 }),
      ]);

      expect(result.get('reg-1')).toEqual([]);
    });

    it('does not match GPS when only one side has a coordinate pair', async () => {
      prisma.actor.findMany.mockResolvedValue([
        fixtureActor({ gpsLatitude: -3.3869, gpsLongitude: 36.683 }),
      ]);

      const result = await service.detectForBatch([
        fixtureInput({ registrationId: 'reg-1', gpsLatitude: null, gpsLongitude: null }),
      ]);

      expect(result.get('reg-1')).toEqual([]);
    });

    it('coerces Prisma Decimal-shaped values to numbers before comparing', async () => {
      // Prisma serializes Decimal columns as objects with toString(), not
      // plain numbers — this proves the coercion, not just the plain-number path.
      prisma.actor.findMany.mockResolvedValue([
        fixtureActor({
          gpsLatitude: { toString: () => '-3.3869' },
          gpsLongitude: { toString: () => '36.683' },
        }),
      ]);

      const result = await service.detectForBatch([
        fixtureInput({ registrationId: 'reg-1', gpsLatitude: -3.3869, gpsLongitude: 36.683 }),
      ]);

      expect(result.get('reg-1')).toHaveLength(1);
    });
  });

  describe('capping and ordering by match strength', () => {
    it('orders stronger (more-attribute) matches before weaker ones', async () => {
      prisma.actor.findMany.mockResolvedValue([
        // Weak: matches traderName only.
        fixtureActor({ id: 'actor-weak', traderName: 'Shared Name', phone: '+255711111111' }),
        // Strong: matches traderName AND phone.
        fixtureActor({ id: 'actor-strong', traderName: 'Shared Name', phone: '+255722222222' }),
      ]);

      const result = await service.detectForBatch([
        fixtureInput({
          registrationId: 'reg-1',
          traderName: 'Shared Name',
          phone: '0722222222',
        }),
      ]);

      const candidates = result.get('reg-1')!;
      expect(candidates.map((c) => c.actorId)).toEqual(['actor-strong', 'actor-weak']);
    });

    it('caps the candidate list at the documented maximum', async () => {
      const actors = Array.from({ length: 8 }, (_, i) =>
        fixtureActor({ id: `actor-${i}`, traderName: 'Shared Name', phone: null, email: null }),
      );
      prisma.actor.findMany.mockResolvedValue(actors);

      const result = await service.detectForBatch([
        fixtureInput({ registrationId: 'reg-1', traderName: 'Shared Name' }),
      ]);

      expect(result.get('reg-1')!.length).toBeLessThanOrEqual(5);
    });
  });

  describe('dismissed candidates — filtered out (DC-31)', () => {
    it('excludes a dismissed actor from the candidate list even though it still matches', async () => {
      prisma.actor.findMany.mockResolvedValue([
        fixtureActor({ id: 'actor-1', traderName: 'Shared Name' }),
        fixtureActor({ id: 'actor-2', traderName: 'Shared Name' }),
      ]);

      const result = await service.detectForBatch([
        fixtureInput({
          registrationId: 'reg-1',
          traderName: 'Shared Name',
          dismissedActorIds: ['actor-1'],
        }),
      ]);

      const candidates = result.get('reg-1')!;
      expect(candidates.map((c) => c.actorId)).toEqual(['actor-2']);
    });

    it('dismissal is per-candidate: dismissing one leaves the others', async () => {
      prisma.actor.findMany.mockResolvedValue([
        fixtureActor({ id: 'actor-1', traderName: 'Shared Name' }),
        fixtureActor({ id: 'actor-2', traderName: 'Shared Name' }),
        fixtureActor({ id: 'actor-3', traderName: 'Shared Name' }),
      ]);

      const result = await service.detectForBatch([
        fixtureInput({
          registrationId: 'reg-1',
          traderName: 'Shared Name',
          dismissedActorIds: ['actor-2'],
        }),
      ]);

      const ids = result.get('reg-1')!.map((c) => c.actorId).sort();
      expect(ids).toEqual(['actor-1', 'actor-3']);
    });

    it('dismissal on one registration does not affect another registration on the same page', async () => {
      prisma.actor.findMany.mockResolvedValue([fixtureActor({ id: 'actor-1', traderName: 'Shared Name' })]);

      const result = await service.detectForBatch([
        fixtureInput({
          registrationId: 'reg-1',
          traderName: 'Shared Name',
          dismissedActorIds: ['actor-1'],
        }),
        fixtureInput({ registrationId: 'reg-2', traderName: 'Shared Name', dismissedActorIds: [] }),
      ]);

      expect(result.get('reg-1')).toEqual([]);
      expect(result.get('reg-2')!.map((c) => c.actorId)).toEqual(['actor-1']);
    });
  });

  describe('no false positives', () => {
    it('returns an empty array when nothing matches on any attribute', async () => {
      prisma.actor.findMany.mockResolvedValue([fixtureActor()]);

      const result = await service.detectForBatch([
        fixtureInput({
          registrationId: 'reg-1',
          phone: '0799999999',
          email: 'nobody@nowhere.example',
          traderName: 'Completely Different Co',
          gpsLatitude: 1,
          gpsLongitude: 1,
        }),
      ]);

      expect(result.get('reg-1')).toEqual([]);
    });
  });
});
