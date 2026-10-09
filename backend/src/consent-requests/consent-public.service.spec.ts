import { readFileSync } from 'fs';
import { join } from 'path';
import { Logger, NotFoundException } from '@nestjs/common';
import { ConsentRequestStatus, ConsentStatus } from '@prisma/client';
import { ActorAuditService } from '../actors/actor-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CONSENT_ACTOR_ID,
  buildConsentPublicHarness,
  consentActorFixture,
  consentRowFixture,
  consentTokenFor,
} from '../test/support/consent-public.fixture';
import { ConsentPublicService, buildConsentLinkNotFoundError } from './consent-public.service';
import { hashConsentToken } from './consent-token.util';

// `getAdminConsentEdition` is wrapped so one test can register a fixture
// `v1.1` the real (append-only) registry does not yet hold.
jest.mock('./admin-consent-policy', () => {
  const actual = jest.requireActual('./admin-consent-policy');
  return { ...actual, getAdminConsentEdition: jest.fn(actual.getAdminConsentEdition) };
});
import * as policy from './admin-consent-policy';

const RESPONDENT = {
  name: 'Race Respondent',
  position: 'Director',
  email: 'race@evidence.example',
  phone: '+255 700 000 000',
};

function makeService(harness: ReturnType<typeof buildConsentPublicHarness>): ConsentPublicService {
  return new ConsentPublicService(harness.prisma as unknown as PrismaService, new ActorAuditService());
}

describe('ConsentPublicService', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    (policy.getAdminConsentEdition as jest.Mock).mockImplementation(
      jest.requireActual('./admin-consent-policy').getAdminConsentEdition,
    );
  });

  describe('two concurrent responds on one link (NFR-5, FR-10 "two answers race")', () => {
    it('exactly one answer is recorded and the other gets the uniform miss — with both truly in flight at the CAS', async () => {
      const token = consentTokenFor('race');
      const harness = buildConsentPublicHarness(
        [consentActorFixture()],
        [consentRowFixture(token)],
        { rollback: false },
      );
      const service = makeService(harness);

      // Deferred promises, not a synchronous mock: neither CAS is EVALUATED
      // until BOTH respond() calls have reached it, so the two are genuinely
      // interleaved rather than run back to back.
      const original = harness.consentRequest.updateMany.getMockImplementation()!;
      const events: string[] = [];
      let entered = 0;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      harness.consentRequest.updateMany.mockImplementation(async (args) => {
        events.push('enter');
        entered += 1;
        if (entered === 2) release();
        await gate;
        const result = await original(args);
        events.push(`evaluated:${result.count}`);
        return result;
      });

      const accept = service.respond({ token, decision: 'ACCEPT', respondent: RESPONDENT });
      const decline = service.respond({ token, decision: 'DECLINE' });
      const [first, second] = await Promise.allSettled([accept, decline]);

      // The test asserts it interleaved: both entered before either evaluated.
      expect(events.slice(0, 2)).toEqual(['enter', 'enter']);
      expect(events.slice(2).sort()).toEqual(['evaluated:0', 'evaluated:1']);

      expect(first.status).toBe('fulfilled');
      expect(second.status).toBe('rejected');
      const rejection = (second as PromiseRejectedResult).reason;
      expect(rejection).toBeInstanceOf(NotFoundException);
      expect(rejection.getResponse()).toEqual(buildConsentLinkNotFoundError().getResponse());

      // Exactly one set of side effects, all from the winner (the Accept).
      expect(harness.actor.update).toHaveBeenCalledTimes(1);
      expect(harness.getAuditRows()).toHaveLength(1);
      expect(harness.getActor()?.consentStatus).toBe(ConsentStatus.GRANTED);
      expect(harness.getRequests()[0].status).toBe(ConsentRequestStatus.ACCEPTED);
    });
  });

  describe('the compare-and-set (design.md §5.4 step 1, §5.8)', () => {
    it('names status SENT and an unexpired expiresAt, so an answered row can never match', async () => {
      const token = consentTokenFor('cas-shape');
      const harness = buildConsentPublicHarness([consentActorFixture()], [consentRowFixture(token)]);

      await makeService(harness).respond({ token, decision: 'DECLINE' });

      const where = harness.consentRequest.updateMany.mock.calls[0][0].where as Record<string, unknown>;
      expect(where).toEqual({
        tokenHash: hashConsentToken(token),
        status: ConsentRequestStatus.SENT,
        expiresAt: { gt: expect.any(Date) },
      });
    });

    it.each([ConsentRequestStatus.ACCEPTED, ConsentRequestStatus.DECLINED])(
      'a %s row gets count = 0 and is left byte-for-byte unchanged (answered rows are terminal)',
      async (status) => {
        const token = consentTokenFor(`terminal-${status}`);
        const harness = buildConsentPublicHarness(
          [consentActorFixture()],
          [consentRowFixture(token, { status, respondedAt: new Date(), respondentName: 'First Answer' })],
        );
        const before = JSON.stringify(harness.getRequests());

        await expect(makeService(harness).respond({ token, decision: 'ACCEPT', respondent: RESPONDENT })).rejects.toBeInstanceOf(
          NotFoundException,
        );

        expect(JSON.stringify(harness.getRequests())).toBe(before);
        expect(harness.actor.update).not.toHaveBeenCalled();
      },
    );

    it('the actor write sits inside the transaction callback (one $transaction per answer)', async () => {
      const token = consentTokenFor('one-tx');
      const harness = buildConsentPublicHarness([consentActorFixture()], [consentRowFixture(token)]);

      await makeService(harness).respond({ token, decision: 'ACCEPT', respondent: RESPONDENT });

      expect(harness.prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('lock order: the actor row first, then the request row (design.md §5.4 step 0, D-25/D-26)', () => {
    it('resolves the actorId OUTSIDE the transaction; its FIRST statement inside is the actor FOR UPDATE (InnoDB snapshot), then the CAS', async () => {
      const token = consentTokenFor('lock-order');
      const harness = buildConsentPublicHarness([consentActorFixture()], [consentRowFixture(token)]);

      await makeService(harness).respond({ token, decision: 'DECLINE' });

      expect(harness.$queryRaw).toHaveBeenCalledTimes(1);
      const lock = harness.$queryRaw.mock.calls[0][0] as unknown as { sql: string; values: unknown[] };
      expect(lock.sql).toMatch(/FOR UPDATE/);
      expect(lock.sql).toMatch(/FROM Actor/);
      expect(lock.sql).toMatch(/consentStatus.*consentMethod.*consentObtainedAt.*consentReference/); // the fields `before` is built from
      expect(lock.values).toEqual([CONSENT_ACTOR_ID]); // parameterised, never interpolated

      // Every client call, by global call order. The routing read precedes the
      // transaction; the first call after it opens must be the lock.
      const calls = ([
        ['$transaction', harness.prisma.$transaction.mock.invocationCallOrder[0]],
        ...harness.consentRequest.findUnique.mock.invocationCallOrder.map((o): [string, number] => ['consentRequest.findUnique', o]),
        ...harness.consentRequest.updateMany.mock.invocationCallOrder.map((o): [string, number] => ['consentRequest.updateMany', o]),
        ...harness.actor.findUnique.mock.invocationCallOrder.map((o): [string, number] => ['actor.findUnique', o]),
        ...harness.actor.update.mock.invocationCallOrder.map((o): [string, number] => ['actor.update', o]),
        ...harness.actorAuditLog.create.mock.invocationCallOrder.map((o): [string, number] => ['actorAuditLog.create', o]),
        ['$queryRaw', harness.$queryRaw.mock.invocationCallOrder[0]],
      ] as Array<[string, number]>).sort((x, y) => x[1] - y[1]);
      const names = calls.map(([n]) => n);
      expect(names[0]).toBe('consentRequest.findUnique'); // routing, before the transaction
      expect(names[1]).toBe('$transaction');
      expect(names[2]).toBe('$queryRaw'); // the FIRST statement inside the transaction
      expect(names.indexOf('$queryRaw')).toBeLessThan(names.indexOf('consentRequest.updateMany'));
      // No plain actor read at all: `before` comes from the locking SELECT.
      expect(harness.actor.findUnique).not.toHaveBeenCalled();
    });

    it("the audit `from` values are the LOCKED row's, not an earlier snapshot's (an admin change committed before the lock)", async () => {
      const token = consentTokenFor('fresh-before');
      const harness = buildConsentPublicHarness([consentActorFixture()], [consentRowFixture(token)]);
      // The routing read has happened; an admin now commits a consent change; then the lock runs.
      const original = harness.$queryRaw.getMockImplementation()!;
      harness.$queryRaw.mockImplementationOnce(async (sql) => {
        harness.getActor()!.consentStatus = ConsentStatus.DENIED;
        harness.getActor()!.consentReference = 'ADMIN-REF-AFTER-ROUTING';
        return original(sql);
      });

      await makeService(harness).respond({ token, decision: 'ACCEPT', respondent: RESPONDENT });

      const changes = harness.getAuditRows()[0].changes as { fields: Record<string, { from: unknown }> };
      expect(changes.fields.consentStatus.from).toBe('DENIED');
      expect(changes.fields.consentReference.from).toBe('ADMIN-REF-AFTER-ROUTING');
    });

    it('no actor to lock is the uniform miss, and the CAS never runs', async () => {
      const token = consentTokenFor('lock-no-actor');
      const harness = buildConsentPublicHarness(
        [consentActorFixture()],
        [consentRowFixture(token, { actorId: 'actor-that-was-deleted' })],
      );

      await expect(makeService(harness).respond({ token, decision: 'DECLINE' })).rejects.toBeInstanceOf(NotFoundException);

      expect(harness.$queryRaw).toHaveBeenCalledTimes(1);
      expect(harness.consentRequest.updateMany).not.toHaveBeenCalled();
    });

    it('an unknown token never reaches the lock', async () => {
      const harness = buildConsentPublicHarness([consentActorFixture()], []);

      await expect(
        makeService(harness).respond({ token: consentTokenFor('nobody'), decision: 'DECLINE' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(harness.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('every miss is one constant-body helper', () => {
    it('consent-public.service.ts has exactly ONE `new NotFoundException(` — no second, drifting miss body', () => {
      const source = readFileSync(join(__dirname, 'consent-public.service.ts'), 'utf8');
      expect(source.match(/new NotFoundException\(/g)).toHaveLength(1);
    });
  });

  describe('an old request keeps its own edition (FR-1)', () => {
    it('a v1.0 request renders v1.0 and a v1.1 request renders v1.1, while both exist in the registry', async () => {
      const realV10 = jest.requireActual('./admin-consent-policy').getAdminConsentEdition('v1.0');
      const fixtureV11 = {
        version: 'v1.1',
        sections: [{ heading: 'Fixture heading', paragraphs: ['Fixture v1.1 paragraph.'] }],
        acceptanceStatement: 'By selecting I accept (fixture v1.1).',
      };
      (policy.getAdminConsentEdition as jest.Mock).mockImplementation((version: string) =>
        version === 'v1.0' ? realV10 : version === 'v1.1' ? fixtureV11 : undefined,
      );
      const t10 = consentTokenFor('edition-v10');
      const t11 = consentTokenFor('edition-v11');
      const harness = buildConsentPublicHarness(
        [consentActorFixture()],
        [consentRowFixture(t10, { editionVersion: 'v1.0' }), consentRowFixture(t11, { editionVersion: 'v1.1' })],
      );
      const service = makeService(harness);

      const old = await service.view(t10);
      const newer = await service.view(t11);

      expect(old.edition).toEqual({
        version: 'v1.0',
        sections: realV10.sections,
        acceptanceStatement: realV10.acceptanceStatement,
      });
      expect(newer.edition).toEqual(fixtureV11);
    });
  });

  describe('the preview loads the actor like findOnePublic does (RB-6)', () => {
    it('includes the crops relation, so the projected crop names match GET /actors/:id', async () => {
      const token = consentTokenFor('include');
      const harness = buildConsentPublicHarness([consentActorFixture()], [consentRowFixture(token)]);

      const result = await makeService(harness).view(token);

      expect(harness.actor.findUnique).toHaveBeenCalledWith({
        where: { id: CONSENT_ACTOR_ID },
        include: { crops: { include: { crop: true } }, additionalTypes: true },
      });
      expect(result.record.crops).toEqual(['sorghum', 'groundnut']);
    });
  });
});
