import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RegistrationStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { createValidationPipe } from '../common/validation-pipe';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActingAdminResolver } from '../actors/acting-admin.resolver';
import { resetMailTransport } from '../mail/mail-transport.factory';
import { NoOpMailTransport } from '../mail/no-op-mail.transport';
import { DUPLICATE_OF_EXISTING_RECORD_REASON_CODE } from '../registrations/rejection-reasons';
import {
  admin,
  createRegistrationUpdateManyMock,
  createRegistrationUpdateMock,
  TestJwtAuthGuard,
} from './admin-registrations-harness';

/**
 * T-9 — End-to-end test for `POST /api/v1/admin/registrations/:id/reject`
 * (FR-11 scenario 3, FR-13 scenarios 1, 2, FR-14 scenarios 1, 2; `design.md`
 * §5, §6.4).
 *
 * **This is the file that closes the Leader's Disqualifying clause: "a green
 * reject test that never exercises 3a's public lookup has not shown the note
 * reaches the applicant."** FR-13 scenario 2 spans TWO modules — the write
 * (`AdminRegistrationsController`) and 3a's public read
 * (`RegistrationsController`'s `POST /registrations/lookup`) — so this suite
 * drives BOTH, on the SAME app instance, over the SAME in-memory row, through
 * the REAL HTTP pipeline.
 *
 * **The no-op mail transport is GENUINELY selected, not mocked out.** Unlike
 * `admin-registrations.e2e.spec.ts` (T-8), this suite does NOT
 * `.overrideProvider(MailService)` — it sets `MAIL_TRANSPORT=no-op` and lets
 * the REAL `MailService` resolve the REAL `NoOpMailTransport`
 * (`mail-transport.factory.ts`). A DI-mocked `MailService` would prove
 * nothing about NFR-10: it bypasses the transport-selection mechanism
 * entirely rather than exercising the "email disabled" configuration this
 * requirement is actually about.
 *
 * **DC-32 — the reason code stays admin-only; only the note is
 * applicant-facing.** The public lookup response is asserted to be EXACTLY
 * `{ status, reviewNote }` — never `rejectionReason` — and the raw response
 * text is swept for the reason CODE value as an extra, value-level backstop.
 *
 * Mirrors `admin-registrations.e2e.spec.ts`'s (T-8) harness pattern: a REAL
 * Nest app (`AppModule`), an in-memory Prisma delegate, `TestJwtAuthGuard`.
 * The Prisma mock here additionally supports `RegistrationLookupAttempt`'s
 * raw-SQL counter (`registrations-lookup.e2e.spec.ts`'s established
 * technique), since the SAME `PrismaService.$transaction` mock must serve
 * BOTH the admin write's interactive callback AND the public lookup's
 * `$executeRaw`/`$queryRaw` session-variable mechanism.
 */

interface AttemptRow {
  ip: string;
  reference: string;
  windowStartIso: string;
  attempts: number;
}

function registrationFixture(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'reg-reject-e2e-1',
    reference: 'REG-2026-0299',
    status: RegistrationStatus.PENDING_REVIEW,
    payload: {
      traderName: 'Njombe Seed Cooperative',
      traderType: 'cooperative',
      contactPerson: 'Asha Mwakalinga — DO NOT LEAK',
      region: 'Njombe',
    },
    submitterEmail: 'coop-secretary@example.com',
    consentAcceptedAt: new Date('2026-02-01T00:10:00Z'),
    consentPolicyVersion: 'v3',
    publishedActorId: null,
    reviewedBySub: null,
    reviewedByEmail: null,
    reviewedAt: null,
    rejectionReason: null,
    reviewNote: null,
    duplicateDismissals: null,
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Combines `admin-registrations.e2e.spec.ts`'s (T-8) registration-delegate
 * shape with `registrations-lookup.e2e.spec.ts`'s (T-11) raw-SQL
 * `RegistrationLookupAttempt` shape — the SAME `$transaction` mock must
 * serve both call shapes, over shared, mutable in-memory state.
 */
function buildPrismaMock(initialRegistrations: Record<string, unknown>[]) {
  let registrations = initialRegistrations.map((r) => ({ ...r }));
  const attemptRows: AttemptRow[] = [];
  const auditLog: Record<string, unknown>[] = [];
  let auditSeq = 0;

  const registrationDelegate = {
    updateMany: createRegistrationUpdateManyMock(
      () => registrations,
      (next) => {
        registrations = next;
      },
    ),
    findUnique: jest.fn(
      async (args: { where: { id?: string; reference?: string }; select?: unknown }) => {
        const found = args.where.id
          ? registrations.find((r) => r.id === args.where.id)
          : registrations.find((r) => r.reference === args.where.reference);
        return found ? { ...found } : null;
      },
    ),
    update: createRegistrationUpdateMock(
      () => registrations,
      (next) => {
        registrations = next;
      },
    ),
  };

  const actorAuditLogDelegate = {
    create: jest.fn(async (args: { data: Record<string, unknown> }) => {
      auditSeq += 1;
      const created = { id: `audit-reject-e2e-${auditSeq}`, createdAt: new Date(), ...args.data };
      auditLog.push(created);
      return created;
    }),
  };

  // Present ONLY so an accidental `tx.actor.create` call can be counted
  // (`not.toHaveBeenCalled()`) rather than TypeErroring.
  const actorDelegate = { create: jest.fn(), findMany: jest.fn(async () => []) };

  const $transaction = jest.fn(async (cb: (tx: unknown) => unknown) => {
    // A FRESH session-variable closure per call — mirrors a real MySQL
    // connection's session scope (`registrations-lookup.e2e.spec.ts`'s
    // established technique), while `registrationDelegate`/`attemptRows`
    // carry the shared, persisted "database" state across calls.
    let sessionNewAttempts: number | null = null;
    const tx = {
      registration: registrationDelegate,
      actorAuditLog: actorAuditLogDelegate,
      actor: actorDelegate,
      $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join('?');
        if (!sql.includes('RegistrationLookupAttempt')) {
          throw new Error(`Fake tx.$executeRaw: unrecognized SQL: ${sql}`);
        }
        const [ip, reference, windowStart] = values as [string, string, Date];
        const windowStartIso = windowStart.toISOString();
        let row = attemptRows.find(
          (r) => r.ip === ip && r.reference === reference && r.windowStartIso === windowStartIso,
        );
        if (!row) {
          row = { ip, reference, windowStartIso, attempts: 1 };
          attemptRows.push(row);
        } else {
          row.attempts += 1;
        }
        sessionNewAttempts = row.attempts;
        return 1;
      },
      $queryRaw: async (strings: TemplateStringsArray) => {
        const sql = strings.join('?');
        if (!sql.includes('@newLookupAttempts')) {
          throw new Error(`Fake tx.$queryRaw: unrecognized SQL: ${sql}`);
        }
        return [{ newLookupAttempts: sessionNewAttempts as number }];
      },
    };
    return cb(tx);
  });

  const registrationLookupAttemptDelegate = {
    update: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { ip_reference_windowStart: { ip: string; reference: string; windowStart: Date } };
        data: { attempts: number };
      }) => {
        const key = where.ip_reference_windowStart;
        const windowStartIso = key.windowStart.toISOString();
        const row = attemptRows.find(
          (r) =>
            r.ip === key.ip && r.reference === key.reference && r.windowStartIso === windowStartIso,
        );
        if (!row) throw new Error('Fake registrationLookupAttempt.update: no row for this key');
        row.attempts = data.attempts;
        return row;
      },
    ),
  };

  return {
    registration: registrationDelegate,
    actor: actorDelegate,
    actorAuditLog: actorAuditLogDelegate,
    registrationLookupAttempt: registrationLookupAttemptDelegate,
    $transaction,
    _getAuditLog: () => auditLog,
    _getRegistrations: () => registrations,
  };
}

describe(
  'Admin registrations reject e2e (HTTP + in-memory Prisma), end-to-end through 3a\'s public ' +
    'lookup, no-op mail transport GENUINELY selected — T-9, FR-11 scenario 3, FR-13, FR-14',
  () => {
    let app: INestApplication;
    let prismaMock: ReturnType<typeof buildPrismaMock>;

    beforeAll(async () => {
      // T11-A1 — required by `RegistrationsService.lookupRegistration`'s IP
      // pseudonymisation, which this suite reaches by driving the REAL
      // public lookup route.
      process.env.OTP_HMAC_SECRET = 'test-only-hmac-secret-not-a-real-key-0123456789';

      // NFR-10, DC-32's "works with email delivery disabled" clause: the
      // no-op transport is selected by ENVIRONMENT, exactly as it would be
      // on a real Lambda with mail disabled — never by DI-mocking
      // MailService (that would bypass the very mechanism NFR-10 is about).
      process.env.MAIL_TRANSPORT = 'no-op';
      resetMailTransport();

      prismaMock = buildPrismaMock([registrationFixture()]);

      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(PrismaService)
        .useValue(prismaMock as unknown as PrismaService)
        .overrideGuard(JwtAuthGuard)
        .useValue(new TestJwtAuthGuard())
        .overrideProvider(ActingAdminResolver)
        .useValue({ resolve: jest.fn().mockResolvedValue('reviewer@example.org') })
        .compile();

      app = moduleRef.createNestApplication();
      app.setGlobalPrefix('api/v1');
      app.useGlobalPipes(createValidationPipe());
      await app.init();
    });

    afterAll(async () => {
      await app.close();
      delete process.env.OTP_HMAC_SECRET;
      delete process.env.MAIL_TRANSPORT;
      resetMailTransport();
    });

    it(
      'end-to-end: an Admin rejects with a reason and a note, under the no-op transport, and the ' +
        'applicant then reads the note (never the reason code) back through 3a\'s public lookup — ' +
        'FR-13 scenario 2, NFR-10, DC-32',
      async () => {
        // Prove the no-op transport is genuinely reachable and records the
        // attempt (NFR-10) — without this spy, a silently-thrown, swallowed
        // mail failure inside dispatchRejectionEmail's fire-and-forget catch
        // would be indistinguishable from a real send from this test's
        // point of view.
        const sendSpy = jest.spyOn(NoOpMailTransport.prototype, 'send');

        const rejectRes = await request(app.getHttpServer())
          .post('/api/v1/admin/registrations/reg-reject-e2e-1/reject')
          .set(admin)
          .send({
            reason: DUPLICATE_OF_EXISTING_RECORD_REASON_CODE,
            note: 'We already list an active registrant at this location — please contact support if this is in error.',
          })
          .expect(200);

        expect(rejectRes.body.registration).toEqual({
          id: 'reg-reject-e2e-1',
          reference: 'REG-2026-0299',
          status: 'REJECTED',
        });

        // NFR-10 — the notification attempt reached the REAL no-op
        // transport (email disabled), and the write above did not depend on
        // it in any way: the 200 above already proves the write succeeded
        // BEFORE this dispatch is even awaited (DD-9, post-commit).
        expect(sendSpy).toHaveBeenCalled();
        sendSpy.mockRestore();

        // FR-13 scenario 2 — the SAME app instance, the REAL public lookup
        // route, over the row this suite's admin request just rejected.
        const lookupRes = await request(app.getHttpServer())
          .post('/api/v1/registrations/lookup')
          .send({ reference: 'REG-2026-0299', email: 'coop-secretary@example.com' })
          .expect(200);

        // The applicant-facing note reaches the applicant — DC-32's
        // "reason code is admin-only; only the note is applicant-facing".
        expect(lookupRes.body).toEqual({
          status: 'REJECTED',
          reviewNote:
            'We already list an active registrant at this location — please contact support if this is in error.',
        });
        // Value-level backstop, over the raw response text: the reason
        // CODE never appears anywhere in this response, even inside an
        // unrelated string.
        expect(lookupRes.text).not.toContain(DUPLICATE_OF_EXISTING_RECORD_REASON_CODE);
        expect(lookupRes.text).not.toContain('rejectionReason');
        // Nor does the internal id, the reviewer's identity, or the payload
        // (the pre-existing containment this route already guarantees —
        // reasserted here because this is the one place this suite proves
        // it against a row THIS test itself rejected).
        expect(lookupRes.text).not.toContain('reg-reject-e2e-1');
        expect(lookupRes.text).not.toContain('reviewer@example.org');
        expect(lookupRes.text).not.toContain('Asha Mwakalinga');
      },
    );

    it('403s a Staff caller on the reject route (guard runs before the service)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/registrations/reg-reject-e2e-1/reject')
        .set('Authorization', 'Bearer staff-token')
        .send({ reason: DUPLICATE_OF_EXISTING_RECORD_REASON_CODE })
        .expect(403);
    });

    it('401s an anonymous caller on the reject route', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/registrations/reg-reject-e2e-1/reject')
        .send({ reason: DUPLICATE_OF_EXISTING_RECORD_REASON_CODE })
        .expect(401);
    });

    it('400s a MISSING reason, server-side', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/registrations/reg-reject-e2e-1/reject')
        .set(admin)
        .send({})
        .expect(400);
    });

    it(
      '400s an UNKNOWN reason code, server-side — the @IsIn gate, not merely @IsNotEmpty. ' +
        'Discriminates by construction: validation runs before the controller, so with @IsIn ' +
        'present the row\'s already-REJECTED state (from the happy-path test above) is ' +
        'irrelevant and this 400s; remove @IsIn from RegistrationRejectDto and the identical ' +
        'request instead reaches the service and 409s "already adjudicated" — run that mutation ' +
        'to see this test redden',
      async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/admin/registrations/reg-reject-e2e-1/reject')
          .set(admin)
          .send({ reason: 'NOT_A_REAL_REASON_CODE' })
          .expect(400);

        expect(res.body.details).toEqual([expect.objectContaining({ field: 'reason' })]);
      },
    );

    it('409s a SECOND rejection of the same registration — "already adjudicated"', async () => {
      // The happy-path test above already rejected reg-reject-e2e-1 against
      // the SHARED `prismaMock` (this suite's `app` — and its store —
      // persist across `it`s, matching `admin-registrations.e2e.spec.ts`'s
      // convention).
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/registrations/reg-reject-e2e-1/reject')
        .set(admin)
        .send({ reason: DUPLICATE_OF_EXISTING_RECORD_REASON_CODE })
        .expect(409);

      expect(res.body.message).toContain('already been adjudicated');
    });

    it('404s an unknown registration id', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/registrations/reg-does-not-exist/reject')
        .set(admin)
        .send({ reason: DUPLICATE_OF_EXISTING_RECORD_REASON_CODE })
        .expect(404);
    });

    it('clause sweep — zero actor.create calls across this entire suite (no Actor is EVER created by reject)', () => {
      expect(prismaMock.actor.create).not.toHaveBeenCalled();
    });
  },
);
