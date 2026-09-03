import { ConflictException, NotFoundException } from '@nestjs/common';
import { RegistrationStatus } from '@prisma/client';
import { AdminRegistrationsController } from './admin-registrations.controller';
import { AdminRegistrationsService } from './admin-registrations.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { ActingAdminResolver } from '../actors/acting-admin.resolver';
import { ActorAuditService } from '../actors/actor-audit.service';
import { DUPLICATE_OF_EXISTING_RECORD_REASON_CODE } from './rejection-reasons';
import {
  createCommitOrderTracker,
  createTxRegistrationFindUniqueMock,
  createTxRegistrationUpdateManyMock,
} from '../test/admin-registrations-harness';

/**
 * T-9 — `POST /admin/registrations/:id/reject` (FR-11 scenario 3, FR-13
 * scenarios 1, 2, FR-14 scenarios 1, 2; `design.md` §6.4).
 *
 * Named for the task's own Verify command (`npm test -- --silent reject`)
 * rather than collocated with `admin-registrations.service.spec.ts` —
 * `AdminRegistrationsService` is still the class under test (T-4's
 * `list`/T-6's `getById`/T-8's `approve` keep their own coverage in that
 * file, untouched); this mirrors T-7's `admin-registrations-dismiss-
 * duplicate.spec.ts` convention exactly.
 *
 * Uses the REAL `ActorAuditService` (no constructor deps), same convention
 * `admin-registrations.service.spec.ts`'s `approve` describe block already
 * uses: it lets these tests assert the actual persisted audit row's
 * `action` and `actorId` by value, not a mock's stand-in return. The full
 * `REGISTRATION_REJECT` envelope (every field `ActorAuditService.
 * logRegistrationReject` writes) is asserted by value in T-2's own
 * `actor-audit.service.spec.ts`, not re-derived here.
 */

interface MockPrisma {
  registration: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  actor: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
  };
  /**
   * `reject`'s ONLY entry point into Prisma, mirroring
   * `admin-registrations.service.spec.ts`'s `MockPrisma.$transaction` JSDoc:
   * a SEPARATE `tx` delegate set is built per test (`buildRejectTx` below),
   * never the SAME object as `registration`/`actor` above, so `reject`'s
   * "every write happens through `tx`" is structurally checkable — those
   * two delegates above carry no `updateMany` spy at all, so a hypothetical
   * bypass would throw "not a function" rather than silently passing.
   */
  $transaction: jest.Mock;
}

/**
 * The stored `Registration` row `reject`'s tx-scoped `findUnique` calls
 * resolve to. Carries `consentAcceptedAt`/`consentPolicyVersion` — the exact
 * two columns the "byte-identical before and after" clause checks — with
 * distinctive, non-default values so an accidental overwrite (even to a
 * DIFFERENT value) is unmistakable, not merely a coincidental match.
 */
function rejectionRegistrationRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'reg-reject-1',
    reference: 'REG-2026-0299',
    status: RegistrationStatus.PENDING_REVIEW,
    payload: {
      traderName: 'Kilimanjaro Seed Traders',
      traderType: 'seed_company',
      region: 'Kilimanjaro',
    },
    submitterEmail: 'reject-applicant@example.com',
    consentAcceptedAt: new Date('2026-02-01T00:10:00Z'),
    consentPolicyVersion: 'v3-reject-fixture',
    rejectionReason: null,
    reviewNote: null,
    ...overrides,
  };
}

/**
 * A fresh, ISOLATED `tx` delegate set for `reject`. `reject` writes NO
 * actor, so this mock's `actor.create` exists ONLY so an accidental call can
 * be COUNTED — `expect(tx.actor.create).not.toHaveBeenCalled()` — rather
 * than reaching for a shape that would TypeError, which would conflate
 * "never implemented" with "implemented and refused to call" (the Leader's
 * brief: "assert the call count, not the absence of an actor in a fixture").
 */
function buildRejectTx(registrationRow = rejectionRegistrationRow()) {
  let registration: Record<string, unknown> = { ...registrationRow };

  const registrationDelegate = {
    updateMany: createTxRegistrationUpdateManyMock(
      () => registration,
      (next) => {
        registration = next;
      },
    ),
    findUnique: createTxRegistrationFindUniqueMock(() => registration),
  };

  const actorDelegate = {
    create: jest.fn(),
  };

  const actorAuditLogDelegate = {
    create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
      id: 'audit-reject-1',
      createdAt: new Date(),
      ...args.data,
    })),
  };

  return {
    registration: registrationDelegate,
    actor: actorDelegate,
    actorAuditLog: actorAuditLogDelegate,
    getStoredRegistration: () => registration,
  };
}

describe('AdminRegistrationsService.reject (T-9, FR-11 scenario 3, FR-13 scenarios 1, 2, FR-14 scenarios 1, 2)', () => {
  let service: AdminRegistrationsService;
  let prisma: MockPrisma;
  let actingAdminResolver: { resolve: jest.Mock };
  let actorAuditService: ActorAuditService;
  let mailService: { sendRejection: jest.Mock };

  const ACTING_SUB = 'admin-sub-2';
  const ACTING_EMAIL = 'reviewer@example.com';
  const REASON = { reason: DUPLICATE_OF_EXISTING_RECORD_REASON_CODE };

  function wireRejectTransaction(tx: ReturnType<typeof buildRejectTx>) {
    prisma.$transaction = jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx));
  }

  beforeEach(() => {
    prisma = {
      registration: { findUnique: jest.fn(), update: jest.fn() },
      actor: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
      $transaction: jest.fn(() => {
        throw new Error('$transaction called before wireRejectTransaction(tx)');
      }),
    };
    actingAdminResolver = { resolve: jest.fn().mockResolvedValue(ACTING_EMAIL) };
    const duplicateDetection = new DuplicateDetectionService(prisma as unknown as never);
    actorAuditService = new ActorAuditService();
    mailService = { sendRejection: jest.fn().mockResolvedValue(undefined) };
    service = new AdminRegistrationsService(
      prisma as unknown as never,
      duplicateDetection,
      actingAdminResolver as unknown as ActingAdminResolver,
      actorAuditService,
      mailService as unknown as never,
    );
  });

  describe('Scenario: Rejection is terminal for this chunk (FR-13 scenario 1)', () => {
    it('marks the registration REJECTED, stores the reason and note, and audits — no Actor is created', async () => {
      const tx = buildRejectTx();
      wireRejectTransaction(tx);

      const result = await service.reject(
        'reg-reject-1',
        {
          reason: DUPLICATE_OF_EXISTING_RECORD_REASON_CODE,
          note: 'Please re-apply once resolved.',
        } as never,
        ACTING_SUB,
      );

      expect(result.registration).toEqual({
        id: 'reg-reject-1',
        reference: 'REG-2026-0299',
        status: RegistrationStatus.REJECTED,
      });
      expect(tx.getStoredRegistration().status).toBe(RegistrationStatus.REJECTED);
      expect(tx.getStoredRegistration().rejectionReason).toBe(
        DUPLICATE_OF_EXISTING_RECORD_REASON_CODE,
      );
      expect(tx.getStoredRegistration().reviewNote).toBe('Please re-apply once resolved.');
      expect(tx.getStoredRegistration().reviewedBySub).toBe(ACTING_SUB);
      expect(tx.getStoredRegistration().reviewedByEmail).toBe(ACTING_EMAIL);
      expect(tx.actorAuditLog.create).toHaveBeenCalledTimes(1);
      const auditData = (tx.actorAuditLog.create as jest.Mock).mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(auditData.action).toBe('REGISTRATION_REJECT');
      // FR-16 — the registration id, never a real actor id (no Actor exists on this path).
      expect(auditData.actorId).toBe('reg-reject-1');
    });

    it('an OMITTED note stores reviewNote as null, never undefined or a stale value', async () => {
      const tx = buildRejectTx();
      wireRejectTransaction(tx);

      await service.reject('reg-reject-1', REASON as never, ACTING_SUB);

      expect(tx.getStoredRegistration().reviewNote).toBeNull();
    });

    it('KZ-007 — an EMPTY-STRING note stores reviewNote as null, never as a present-but-blank string', async () => {
      const tx = buildRejectTx();
      wireRejectTransaction(tx);

      await service.reject('reg-reject-1', { ...REASON, note: '' } as never, ACTING_SUB);

      expect(tx.getStoredRegistration().reviewNote).toBeNull();
    });

    it(
      'KZ-007 — a WHITESPACE-ONLY note stores reviewNote as null too — exactly what a controlled ' +
        '<textarea> submits when cleared (T-14 must not be relied on to prevent this)',
      async () => {
        const tx = buildRejectTx();
        wireRejectTransaction(tx);

        await service.reject('reg-reject-1', { ...REASON, note: '   ' } as never, ACTING_SUB);

        expect(tx.getStoredRegistration().reviewNote).toBeNull();
      },
    );

    it(
      'clause sweep — BUT it must NOT create an Actor / publish any field / alter the consent ' +
        'record: zero actor.create calls, asserted by CALL COUNT',
      async () => {
        const tx = buildRejectTx();
        wireRejectTransaction(tx);

        await service.reject('reg-reject-1', { ...REASON, note: 'note' } as never, ACTING_SUB);

        expect(tx.actor.create).not.toHaveBeenCalled();
        expect(tx.actor.create).toHaveBeenCalledTimes(0);
      },
    );

    it(
      'clause sweep — the consent columns are BYTE-IDENTICAL before and after: ' +
        'consentAcceptedAt and consentPolicyVersion are unchanged by value, and the ' +
        'updateMany write never even NAMES either column',
      async () => {
        const before = rejectionRegistrationRow();
        const tx = buildRejectTx(before);
        wireRejectTransaction(tx);

        await service.reject('reg-reject-1', REASON as never, ACTING_SUB);

        const after = tx.getStoredRegistration();
        expect(after.consentAcceptedAt).toEqual(before.consentAcceptedAt);
        expect(after.consentPolicyVersion).toBe(before.consentPolicyVersion);

        const updateManyData = (tx.registration.updateMany as jest.Mock).mock.calls[0][0]
          .data as Record<string, unknown>;
        expect(updateManyData).not.toHaveProperty('consentAcceptedAt');
        expect(updateManyData).not.toHaveProperty('consentPolicyVersion');
      },
    );

    it('a SECOND rejection of the same registration is refused — 409, the "already adjudicated" meaning, no traderId concept on this path', async () => {
      const tx = buildRejectTx(rejectionRegistrationRow({ status: RegistrationStatus.REJECTED }));
      wireRejectTransaction(tx);

      await expect(
        service.reject('reg-reject-1', REASON as never, ACTING_SUB),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.reject('reg-reject-1', REASON as never, ACTING_SUB),
      ).rejects.toThrow('has already been adjudicated');
      expect(tx.actor.create).not.toHaveBeenCalled();
    });

    it('rejecting an already-APPROVED registration is refused the same way (single conditional update, any non-PENDING_REVIEW status)', async () => {
      const tx = buildRejectTx(rejectionRegistrationRow({ status: RegistrationStatus.APPROVED }));
      wireRejectTransaction(tx);

      await expect(
        service.reject('reg-reject-1', REASON as never, ACTING_SUB),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('404s (never 409) when the id does not exist at all (DD-22 — honest here, mirrors approve)', async () => {
      const tx = buildRejectTx();
      wireRejectTransaction(tx);

      await expect(
        service.reject('reg-does-not-exist', REASON as never, ACTING_SUB),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('every write lands on the tx delegate the $transaction callback receives — no bypass', async () => {
      const tx = buildRejectTx();
      wireRejectTransaction(tx);

      await service.reject('reg-reject-1', REASON as never, ACTING_SUB);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.registration.updateMany).toHaveBeenCalledTimes(1);
      expect(tx.actorAuditLog.create).toHaveBeenCalledTimes(1);
    });

    // R15 — mirrors `admin-registrations.service.spec.ts`'s approve-path
    // fix. Checked first, per the Leader's brief: this path was EQUALLY
    // unpinned — "every write lands on the tx delegate" above asserts only
    // call COUNT, never the predicate's shape, so `buildRejectTx`'s own
    // status re-derivation was the only thing catching a dropped `status`
    // key, same as approve's gap.
    it("R15 — the conditional update's where clause is exactly { id, status: PENDING_REVIEW }, by value", async () => {
      const tx = buildRejectTx();
      wireRejectTransaction(tx);

      await service.reject('reg-reject-1', REASON as never, ACTING_SUB);

      expect(tx.registration.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'reg-reject-1', status: RegistrationStatus.PENDING_REVIEW },
        }),
      );
    });
  });

  describe('FR-14 scenarios 1, 2 — the notification is dispatched AFTER commit, never inside it, and works with email disabled', () => {
    it('sendRejection is called with the submitter email and reference, AFTER the transaction resolves', async () => {
      const tx = buildRejectTx();
      wireRejectTransaction(tx);
      const callOrder = createCommitOrderTracker(prisma, tx);
      mailService.sendRejection.mockImplementationOnce(async () => {
        callOrder.push('notification-dispatched');
      });

      await service.reject('reg-reject-1', REASON as never, ACTING_SUB);

      expect(mailService.sendRejection).toHaveBeenCalledWith(
        'reject-applicant@example.com',
        'REG-2026-0299',
      );
      expect(callOrder).toEqual(['transaction-committed', 'notification-dispatched']);
    });

    it(
      'does not resolve until the mail dispatch settles — the send is now awaited ' +
        '(fix/otp-mail-lambda-freeze: reject() used to dispatch sendRejection fire-and-forget, ' +
        'which a Lambda freeze can silently drop mid-flight in production; this test proves the ' +
        'opposite — reject() stays unsettled for as long as the send itself is pending)',
      async () => {
        const tx = buildRejectTx();
        wireRejectTransaction(tx);
        let resolveSend!: () => void;
        mailService.sendRejection.mockReturnValueOnce(
          new Promise<void>((resolve) => {
            resolveSend = resolve;
          }),
        );

        let settled = false;
        const promise = service
          .reject('reg-reject-1', REASON as never, ACTING_SUB)
          .then(() => {
            settled = true;
          });

        // Drain every already-queued microtask (setImmediate only runs
        // after the microtask queue is empty) — a fire-and-forget dispatch
        // would have let reject() fully resolve by now, however many
        // `await`s its transaction chain has.
        await new Promise((resolve) => setImmediate(resolve));
        expect(settled).toBe(false);

        resolveSend();
        await promise;
        expect(settled).toBe(true);
      },
    );

    it('a notification failure does not reject reject() — fire-and-forget, logged by error class name only', async () => {
      const tx = buildRejectTx();
      wireRejectTransaction(tx);
      mailService.sendRejection.mockRejectedValueOnce(new Error('SES unavailable'));

      await expect(
        service.reject('reg-reject-1', REASON as never, ACTING_SUB),
      ).resolves.toBeDefined();
    });

    it('the transaction never calls sendRejection itself — only the post-await dispatch does', async () => {
      const tx = buildRejectTx();
      wireRejectTransaction(tx);
      (prisma.$transaction as jest.Mock).mockImplementationOnce(
        async (cb: (tx: unknown) => unknown) => {
          const result = await cb(tx);
          expect(mailService.sendRejection).not.toHaveBeenCalled();
          return result;
        },
      );

      await service.reject('reg-reject-1', REASON as never, ACTING_SUB);

      expect(mailService.sendRejection).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * `AdminRegistrationsController.reject` (T-9) — mirrors
 * `admin-registrations.controller.spec.ts`'s own style: does the handler
 * call the service with the right argument and add no branching of its own?
 * Guard behaviour (`401` anonymous / `403` Staff) is proven at the HTTP
 * level in `pii-boundary.spec.ts`'s admin `FIXTURE_MAP` entry and in
 * `admin-registrations-reject.e2e.spec.ts`, neither re-derived here.
 */
describe('AdminRegistrationsController.reject (T-9)', () => {
  it('forwards the path id, the DTO, and the acting sub (never anything else from the request) to the service', async () => {
    const service = {
      reject: jest.fn().mockResolvedValue({
        registration: { id: 'reg-1', reference: 'REG-2026-0001', status: 'REJECTED' },
      }),
    };
    const controller = new AdminRegistrationsController(service as unknown as never);
    const dto = { reason: DUPLICATE_OF_EXISTING_RECORD_REASON_CODE } as never;
    const user = { sub: 'admin-sub-1', username: 'a', groups: ['admin'], role: 'Admin' } as never;

    const result = await controller.reject('reg-42', dto, user);

    expect(service.reject).toHaveBeenCalledTimes(1);
    expect(service.reject).toHaveBeenCalledWith('reg-42', dto, 'admin-sub-1');
    expect(result).toEqual({
      registration: { id: 'reg-1', reference: 'REG-2026-0001', status: 'REJECTED' },
    });
  });

  it("adds no branching of its own — every error (400/404/409) is entirely the service's", async () => {
    const service = {
      reject: jest.fn().mockRejectedValueOnce(new Error('Registration reg-unknown not found')),
    };
    const controller = new AdminRegistrationsController(service as unknown as never);

    await expect(
      controller.reject('reg-unknown', {} as never, { sub: 'x' } as never),
    ).rejects.toThrow('Registration reg-unknown not found');
  });
});
