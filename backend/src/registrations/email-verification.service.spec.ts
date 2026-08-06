// @sdd-spec actors/public-self-registration (T-7)
/**
 * `EmailVerificationService` unit tests (FR-4, DC-20, design.md §4.3/DD-11).
 *
 * Mocked Prisma, no DB. Two rework-attempt-2 corrections to how the fake
 * behaves, both found by the test-adequacy lens against attempt 1:
 *
 *  1. **The fake is now STRICT, not lenient.** `findMany`/`updateMany` only
 *     understand a declared set of `where` keys (`email`, `consumedAt`,
 *     `expiresAt.gt`, `attempts.lt`, `id`) and correctly apply `orderBy`/
 *     `take` when the service supplies them. Any OTHER `where` key throws
 *     loudly. Attempt 1's fake silently ignored `orderBy`/`take`/unknown
 *     `where` keys, which meant the V-3 (RA4) and V-1 (S-1) regression tests
 *     could not actually fail even when the exact defects they claim to
 *     guard against were reintroduced into the service — see the two
 *     hand-run mutations recorded in this task's execution notes, re-run
 *     against attempt 3's final code, both confirmed red.
 *     *Deliberate scope decision:* `attempts.lt` IS supported even though
 *     today's `verifyCode` never pushes that filter into the query (it
 *     checks `row.attempts < OTP_MAX_ATTEMPTS` in application code) —
 *     because a future refactor moving that check into the `where` clause
 *     is a foreseeable, benign change to the SAME data shape, and a fake
 *     that threw on it would go falsely red for a correct refactor. `codeHash`
 *     is deliberately NOT supported, because a `where` clause keyed on the
 *     submitted code's own hash is not a refactor of this mechanism — it IS
 *     the S-1 defect DD-11 exists to rule out.
 *  2. **`seedRow` returns a copy, never the live object.** Attempt 1's
 *     `seedRow` returned the SAME object it pushed into the backing store,
 *     so a later `rows.find(...)` "fresh read" was identity-equal to the
 *     reference the test already held — proving nothing beyond in-place
 *     mutation. `seedRow` now returns an independent snapshot; genuine
 *     "did this survive" checks re-read through the fake's OWN read surface
 *     (`findMany`), never by indexing `rows` directly, except where noted.
 *
 * **Attempt 3 addition: the `EmailSendBudget` fake models a per-connection
 * MySQL session variable, not a single shared one.** `issueCode`'s send-rate
 * cap now runs one `INSERT ... ON DUPLICATE KEY UPDATE` that captures its own
 * post-increment position into `@newSends`, read back on the SAME connection
 * — see `email-verification.service.ts`'s class doc for the three-round
 * empirical account of why this shape (and not the two more "obvious" ones
 * tried first) is the one that is actually correct under concurrency. The
 * fake's `$transaction` gives EACH invocation its own private `sessionNewSends`
 * closure variable (never a module-level shared one), which is what makes it
 * a faithful model of MySQL's connection-scoped session variables — a naive
 * single shared variable would let one concurrent caller's capture leak into
 * another's read, which is exactly the bug a real cross-connection session
 * variable cannot have.
 *
 * Each of V-1 … V-6 gets its own named `describe` and its own test — per
 * KZ-001, a gap here may never be discharged by pointing at a different
 * constraint's passing test.
 *
 * **What this suite assumes but cannot verify.** The tick-based interleaving
 * technique below (`tick()` before a fake operation's check-and-mutate)
 * exercises the SHAPE of a race — it proves this SERVICE issues a single
 * conditional statement per decision point (or, for the send-rate cap, one
 * atomic write plus one same-connection read), never a separate
 * read-then-write pair racing against a SEPARATE connection. Whether a real
 * MySQL `UPDATE ... WHERE` is itself atomic under true concurrent
 * connections is a property of InnoDB, not of this fake — for `verifyCode`/
 * `consumeCode` this suite ASSUMES that property; at the unit level it
 * cannot verify it (that would need a real-MySQL integration/e2e test, out
 * of this task's file list). The `EmailSendBudget` mechanism specifically
 * WAS additionally verified empirically against the real dev RDS during this
 * task (a throwaway script, not committed): 6 independent trials of 10
 * genuinely concurrent calls each, against the live database, accepted
 * exactly `OTP_MAX_SENDS_PER_HOUR` every time — recorded in this task's
 * report, not re-derivable from this file alone.
 */
import { createHmac } from 'crypto';
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  EmailVerificationService,
  EmailVerificationSendLimitExceededError,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_SENDS_PER_HOUR,
} from './email-verification.service';

const OTP_SECRET = 'test-only-hmac-secret';

interface FakeRow {
  id: string;
  email: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

interface BudgetRow {
  email: string;
  windowStart: Date;
  sends: number;
}

/** Real HMAC-SHA-256 of a code under the test secret — the independent oracle for V-6. */
function realHash(code: string): string {
  return createHmac('sha256', OTP_SECRET).update(code).digest('hex');
}

/** A macrotask tick — models a real DB/network round trip so concurrent fake calls actually interleave. */
function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

const FIND_MANY_ALLOWED_WHERE_KEYS = ['email', 'consumedAt', 'expiresAt', 'attempts'];
const UPDATE_MANY_ALLOWED_WHERE_KEYS = ['id', 'consumedAt'];

/**
 * A minimal, STRICT fake of the Prisma surfaces this service touches:
 * `emailVerification.{create,findMany,updateMany}` and `$transaction` (whose
 * callback receives a `tx` exposing `$executeRaw`/`$queryRaw` against
 * `EmailSendBudget`, modelling the session-variable mechanism — see the
 * header comment on why a fake this permissive had to become this strict,
 * and on why the session variable is per-transaction-invocation, not shared).
 */
function buildFakePrisma(rows: FakeRow[]) {
  let nextId = 1;
  const budgetRows: BudgetRow[] = [];
  // A per-call tick added to `Date.now()` for `create()`'s `createdAt` —
  // two rows created in quick succession (e.g. two back-to-back
  // `issueCode` calls) can tie at millisecond resolution, which would make
  // a `desc` sort a no-op (JS's stable sort preserves original order on a
  // tie) and silently defeat any test relying on genuine createdAt
  // ordering between fake-`create()`-produced rows. Strictly monotonic
  // instead, so ordering is always meaningful.
  let createdAtTick = 0;

  function assertKnownWhereKeys(where: Record<string, unknown>, allowed: string[], caller: string): void {
    for (const key of Object.keys(where)) {
      if (!allowed.includes(key)) {
        throw new Error(
          `Fake ${caller}: unsupported where key "${key}" — this fake only implements ` +
            `${allowed.join(', ')}. If the service now filters on this field, teach the ` +
            "fake first (see this file's header on why leniency here is unsafe).",
        );
      }
    }
  }

  const emailVerification = {
    create: jest.fn(async ({ data }: { data: { email: string; codeHash: string; expiresAt: Date } }) => {
      await tick();
      const row: FakeRow = {
        id: `row-${nextId++}`,
        email: data.email,
        codeHash: data.codeHash,
        attempts: 0,
        expiresAt: data.expiresAt,
        consumedAt: null,
        createdAt: new Date(Date.now() + createdAtTick++),
      };
      rows.push(row);
      return { ...row };
    }),

    findMany: jest.fn(
      async ({
        where,
        orderBy,
        take,
      }: {
        where: Record<string, unknown>;
        orderBy?: Record<string, 'asc' | 'desc'> | Record<string, 'asc' | 'desc'>[];
        take?: number;
      }) => {
        assertKnownWhereKeys(where, FIND_MANY_ALLOWED_WHERE_KEYS, 'findMany');

        let results = rows.filter((r) => r.email === where.email);

        if ('consumedAt' in where) {
          if (where.consumedAt !== null) {
            throw new Error('Fake findMany: only consumedAt: null is implemented');
          }
          results = results.filter((r) => r.consumedAt === null);
        }

        const expiresAt = where.expiresAt as { gt?: Date } | undefined;
        if (expiresAt?.gt) {
          results = results.filter((r) => r.expiresAt.getTime() > expiresAt.gt!.getTime());
        }

        const attempts = where.attempts as { lt?: number } | undefined;
        if (attempts?.lt !== undefined) {
          results = results.filter((r) => r.attempts < attempts.lt!);
        }

        if (orderBy) {
          const entries = Array.isArray(orderBy) ? orderBy : [orderBy];
          results = [...results].sort((a, b) => {
            for (const entry of entries) {
              for (const [field, direction] of Object.entries(entry)) {
                const av = a[field as keyof FakeRow];
                const bv = b[field as keyof FakeRow];
                let cmp = 0;
                if (av instanceof Date && bv instanceof Date) cmp = av.getTime() - bv.getTime();
                else if ((av as unknown as number) < (bv as unknown as number)) cmp = -1;
                else if ((av as unknown as number) > (bv as unknown as number)) cmp = 1;
                if (cmp !== 0) return direction === 'desc' ? -cmp : cmp;
              }
            }
            return 0;
          });
        }

        if (typeof take === 'number') {
          results = results.slice(0, take);
        }

        // Fresh copies — a caller mutating the returned object must never
        // mutate the store directly, and a later read must see the store's
        // real current values, not a stale snapshot held from this call.
        return results.map((r) => ({ ...r }));
      },
    ),

    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: { attempts?: { increment: number }; consumedAt?: Date };
      }) => {
        // The atomicity boundary under test: a real network/DB round trip,
        // modelled as one macrotask tick, BEFORE the check-and-mutate — not
        // between the check and the mutate (which stays one synchronous block).
        await tick();

        assertKnownWhereKeys(where, UPDATE_MANY_ALLOWED_WHERE_KEYS, 'updateMany');

        const idClause = where.id as string | { in: string[] } | undefined;
        const matches = rows.filter((r) => {
          if (typeof idClause === 'string' && r.id !== idClause) return false;
          if (idClause && typeof idClause === 'object' && !idClause.in.includes(r.id)) return false;
          if ('consumedAt' in where && where.consumedAt === null && r.consumedAt !== null) return false;
          return true;
        });

        for (const row of matches) {
          if (data.attempts?.increment !== undefined) {
            row.attempts += data.attempts.increment;
          }
          if (data.consumedAt !== undefined) {
            row.consumedAt = data.consumedAt;
          }
        }
        return { count: matches.length };
      },
    ),
  };

  interface FakeTx {
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Array<{ newSends: number }>>;
  }

  interface FakePrisma {
    emailVerification: typeof emailVerification;
    $transaction: jest.Mock;
  }

  const fakePrisma: FakePrisma = {
    emailVerification,
    /**
     * Each invocation gets its OWN `sessionNewSends` closure variable — a
     * faithful model of a MySQL session variable's connection scoping. A
     * shared, module-level variable here would let one concurrent caller's
     * captured value leak into another's read, which a real per-connection
     * session variable cannot do; that distinction is the whole point of
     * this fake, not an incidental detail.
     */
    $transaction: jest.fn(async (callback: (tx: FakeTx) => Promise<unknown>) => {
      let sessionNewSends: number | null = null;

      const tx: FakeTx = {
        $executeRaw: async (strings, ...values) => {
          const sql = strings.join('?');
          if (!sql.includes('EmailSendBudget')) {
            throw new Error(`Fake tx.$executeRaw: unrecognized SQL: ${sql}`);
          }
          // The atomicity boundary under test: a real DB round trip, modelled
          // as one macrotask tick, BEFORE the check-and-mutate — the mutate
          // itself (read current sends, write incremented sends, capture
          // into this invocation's OWN sessionNewSends) is one synchronous
          // block with no further `await`, matching what a single InnoDB
          // row-locked statement guarantees.
          await tick();
          const [email, windowStart] = values as [string, Date];
          let row = budgetRows.find(
            (r) => r.email === email && r.windowStart.getTime() === windowStart.getTime(),
          );
          if (!row) {
            row = { email, windowStart, sends: 1 };
            budgetRows.push(row);
          } else {
            row.sends += 1;
          }
          sessionNewSends = row.sends;
          return 1;
        },
        $queryRaw: async (strings) => {
          const sql = strings.join('?');
          if (!sql.includes('@newSends')) {
            throw new Error(`Fake tx.$queryRaw: unrecognized SQL: ${sql}`);
          }
          return [{ newSends: sessionNewSends as number }];
        },
      };

      return callback(tx);
    }),
  };

  return fakePrisma;
}

describe('EmailVerificationService (mocked Prisma) — FR-4, DC-20, design.md §4.3', () => {
  let rows: FakeRow[];
  let prisma: ReturnType<typeof buildFakePrisma>;
  let service: EmailVerificationService;

  beforeEach(() => {
    process.env.OTP_HMAC_SECRET = OTP_SECRET;
    rows = [];
    prisma = buildFakePrisma(rows);
    service = new EmailVerificationService(prisma as never);
  });

  afterEach(() => {
    // A leaked env var would otherwise carry across other spec files sharing
    // this Jest worker.
    delete process.env.OTP_HMAC_SECRET;
  });

  /** Directly seed a live row, bypassing `issueCode`, for tests that need exact control over attempts/expiry/age. Returns an independent COPY — see this file's header on why identity matters. */
  function seedRow(overrides: Partial<FakeRow> & { code: string }): FakeRow {
    const now = Date.now();
    const row: FakeRow = {
      id: overrides.id ?? `seed-${rows.length + 1}`,
      email: overrides.email ?? 'applicant@example.org',
      codeHash: realHash(overrides.code),
      attempts: overrides.attempts ?? 0,
      expiresAt: overrides.expiresAt ?? new Date(now + 15 * 60 * 1000),
      consumedAt: overrides.consumedAt ?? null,
      createdAt: overrides.createdAt ?? new Date(now),
    };
    rows.push(row);
    return { ...row };
  }

  describe('DC-20 parameters are pinned to their literal values (not merely self-consistent)', () => {
    it('OTP_MAX_ATTEMPTS is exactly 5 and OTP_MAX_SENDS_PER_HOUR is exactly 3', () => {
      // Deliberately literal, not e.g. `expect(OTP_MAX_ATTEMPTS).toBe(OTP_MAX_ATTEMPTS)` —
      // tests below import these constants, so a test deriving its own
      // expectation from the same constant it is testing proves nothing
      // (e.g. OTP_MAX_ATTEMPTS = 0 would still pass every OTHER test's
      // self-referential loops). These two literal pins are what actually
      // hold the spec'd parameters in place.
      expect(OTP_MAX_ATTEMPTS).toBe(5);
      expect(OTP_MAX_SENDS_PER_HOUR).toBe(3);
    });
  });

  describe('V-1 / V-1a — a wrong code increments an attempt counter the cap can observe, and the increment survives the rejection', () => {
    it('V-1 (the S-1 regression test): 5 separate wrong requests kill the code at the cap — a 6th correct guess still fails', async () => {
      const row = seedRow({ code: '111111', email: 'applicant@example.org' });

      // Five SEPARATE requests, not five guesses inside one call (trap (c)).
      for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) {
        const result = await service.verifyCode('applicant@example.org', '000000');
        expect(result).toEqual({ outcome: 'REJECTED' });
      }

      // Fresh read after all five rejections: the counter really moved.
      const freshRows: FakeRow[] = await prisma.emailVerification.findMany({
        where: { email: 'applicant@example.org', consumedAt: null, expiresAt: { gt: new Date() } },
      });
      const fresh = freshRows.find((r) => r.id === row.id)!;
      expect(fresh.attempts).toBe(OTP_MAX_ATTEMPTS);

      // The cap kills the code: even the CORRECT code is now rejected.
      const finalAttempt = await service.verifyCode('applicant@example.org', '111111');
      expect(finalAttempt).toEqual({ outcome: 'REJECTED' });
    });

    it('V-1a: the increment from a single rejected request is visible on a FRESH READ (through findMany, never a held reference) taken AFTER the request completes', async () => {
      const row = seedRow({ code: '222222' });

      const result = await service.verifyCode('applicant@example.org', '999999');
      expect(result).toEqual({ outcome: 'REJECTED' });

      // Re-read through the fake's own read surface — NOT `rows.find`, and
      // NOT the `row` variable above, which `seedRow` now returns as an
      // independent copy precisely so this assertion cannot be satisfied by
      // identity alone.
      const freshRows: FakeRow[] = await prisma.emailVerification.findMany({
        where: { email: 'applicant@example.org', consumedAt: null, expiresAt: { gt: new Date() } },
      });
      const freshRead = freshRows.find((r) => r.id === row.id)!;
      expect(freshRead).not.toBe(row);
      expect(freshRead.attempts).toBe(1);

      // What this actually establishes, precisely: the mismatch path issues
      // its `updateMany` directly against the injected `prisma` — never
      // through a `$transaction` callback (`verifyCode` takes no `tx` and
      // opens none) — so there is no transaction boundary here for a
      // caller's LATER `400` to roll back. This fake has no rollback
      // machinery at all (no `$transaction` abort path), so it cannot itself
      // demonstrate "survives a caller-side rollback" as an executed
      // scenario; what IS demonstrated, and what the structural guarantee
      // rests on, is that the write is not transactional in the first place.
      // (`$transaction` DOES exist on this fake now, for `issueCode`'s
      // send-rate cap — this test calls only `verifyCode`, so asserting it
      // was never invoked here still correctly shows `verifyCode` itself
      // never opens one.)
      expect(prisma.emailVerification.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('V-2 — exactly one live code per email is verifiable, even with several live rows outstanding', () => {
    it('two live codes for the same email each verify ONLY against their own value, never against each other', async () => {
      const rowA = seedRow({ code: '111111', email: 'applicant@example.org' });
      const rowB = seedRow({ code: '222222', email: 'applicant@example.org' });

      const matchA = await service.verifyCode('applicant@example.org', '111111');
      expect(matchA).toEqual({ outcome: 'MATCHED', id: rowA.id });

      // rowB's code was never touched by the matchA request above — its own code still verifies unambiguously.
      const matchB = await service.verifyCode('applicant@example.org', '222222');
      expect(matchB).toEqual({ outcome: 'MATCHED', id: rowB.id });

      // The wrong code, cross-checked, matches neither.
      const matchNeither = await service.verifyCode('applicant@example.org', '333333');
      expect(matchNeither).toEqual({ outcome: 'REJECTED' });
    });
  });

  describe('V-3 — a valid OLDER code is never rejected because a newer one exists (RA4 regression)', () => {
    it("two live rows exist; submitting the OLDER row's code still matches it", async () => {
      const older = seedRow({
        code: '444444',
        email: 'applicant@example.org',
        createdAt: new Date(Date.now() - 60_000),
      });
      seedRow({
        code: '555555',
        email: 'applicant@example.org',
        createdAt: new Date(),
      });
      // Sanity: this fixture really does have two live rows, not one — a
      // single-row fixture cannot exercise this constraint at all (trap (a)).
      // Necessary but not sufficient on its own: the fake must also actually
      // honour `orderBy`/`take` rather than silently discarding the second
      // row, which the strict `findMany` above now guarantees.
      expect(rows.filter((r) => r.email === 'applicant@example.org')).toHaveLength(2);

      const result = await service.verifyCode('applicant@example.org', '444444');
      expect(result).toEqual({ outcome: 'MATCHED', id: older.id });
    });
  });

  describe('V-4 — consumption is single-use under concurrency', () => {
    it('two concurrent consumeCode calls for the same row: exactly one succeeds, the store shows exactly one consumption', async () => {
      const row = seedRow({ code: '666666' });
      const tx = prisma as unknown as Prisma.TransactionClient;

      const [first, second] = await Promise.all([
        service.consumeCode(tx, row.id),
        service.consumeCode(tx, row.id),
      ]);

      // Exactly one of the two concurrent calls is the one whose
      // conditional write actually matched a row (count === 1); the other's
      // zero-row result IS its failure — never a thrown error, never a
      // silent double-success. (This suite ASSUMES, but at the unit level
      // cannot verify, that a real MySQL `UPDATE ... WHERE` is itself
      // atomic under true concurrent connections — see this file's header.)
      expect([first, second].filter(Boolean)).toHaveLength(1);
      expect([first, second].filter((v) => v === false)).toHaveLength(1);

      // A direct backing-store read here (not `findMany`, whose strict
      // `consumedAt: null`-only filter cannot express "was consumed"):
      // acceptable because V-4 claims single-use-ness, not
      // rollback-survival, so there is no identity-illusion risk to guard
      // against the way there was for V-1a.
      const fresh = rows.find((r) => r.id === row.id)!;
      expect(fresh.consumedAt).not.toBeNull();
    });

    it('consuming an already-consumed row returns false (not a second success)', async () => {
      const row = seedRow({ code: '777777', consumedAt: new Date() });
      const tx = prisma as unknown as Prisma.TransactionClient;

      const result = await service.consumeCode(tx, row.id);
      expect(result).toBe(false);
    });
  });

  describe('V-5 — wrong, expired, consumed, and attempts-exceeded are byte-identical', () => {
    it('a wrong code is REJECTED with no further detail', async () => {
      seedRow({ code: '111111' });
      const result = await service.verifyCode('applicant@example.org', '000000');
      expect(result).toEqual({ outcome: 'REJECTED' });
    });

    it('an expired code is REJECTED with the identical shape', async () => {
      seedRow({ code: '222222', expiresAt: new Date(Date.now() - 1000) });
      const result = await service.verifyCode('applicant@example.org', '222222');
      expect(result).toEqual({ outcome: 'REJECTED' });
    });

    it('an already-consumed code is REJECTED with the identical shape', async () => {
      seedRow({ code: '333333', consumedAt: new Date() });
      const result = await service.verifyCode('applicant@example.org', '333333');
      expect(result).toEqual({ outcome: 'REJECTED' });
    });

    it('a code that already hit the attempt cap is REJECTED with the identical shape, even when correct', async () => {
      seedRow({ code: '444444', attempts: OTP_MAX_ATTEMPTS });
      const result = await service.verifyCode('applicant@example.org', '444444');
      expect(result).toEqual({ outcome: 'REJECTED' });
    });
  });

  describe('V-6 — the plaintext code is never stored and never logged', () => {
    it('the stored codeHash is the HMAC-SHA-256 digest under the configured secret, never the plaintext code', async () => {
      const issued = await service.issueCode('applicant@example.org');

      expect(prisma.emailVerification.create).toHaveBeenCalledTimes(1);
      const createCall = (prisma.emailVerification.create as jest.Mock).mock.calls[0][0];

      expect(createCall.data.codeHash).toBe(realHash(issued.code));
      expect(createCall.data.codeHash).not.toBe(issued.code);
      // No field of the persisted row carries the plaintext code anywhere.
      expect(JSON.stringify(createCall.data)).not.toContain(issued.code);
    });

    it('no Logger or console call, across issue/verify/consume, ever occurs at all — and, were one to occur, it would not carry the code or the email', async () => {
      // Every surface Nest's Logger and the global console expose — attempt
      // 2's version spied only log/error/warn on both, which a single
      // `this.logger.debug(...)` (arguably the single likeliest place an OTP
      // ever reaches a log) would have slipped straight past.
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
      const verboseSpy = jest.spyOn(Logger.prototype, 'verbose').mockImplementation(() => undefined);
      const fatalSpy = jest.spyOn(Logger.prototype, 'fatal').mockImplementation(() => undefined);
      const staticLogSpy = jest.spyOn(Logger, 'log').mockImplementation(() => undefined);
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
      const consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined);

      try {
        const email = 'secret-applicant@example.org';
        const issued = await service.issueCode(email);
        await service.verifyCode(email, '000000');
        const tx = prisma as unknown as Prisma.TransactionClient;
        const matched = await service.verifyCode(email, issued.code);
        if (matched.outcome === 'MATCHED') {
          await service.consumeCode(tx, matched.id);
        }

        const allCalls = [
          ...logSpy.mock.calls,
          ...errorSpy.mock.calls,
          ...warnSpy.mock.calls,
          ...debugSpy.mock.calls,
          ...verboseSpy.mock.calls,
          ...fatalSpy.mock.calls,
          ...staticLogSpy.mock.calls,
          ...consoleLogSpy.mock.calls,
          ...consoleErrorSpy.mock.calls,
          ...consoleWarnSpy.mock.calls,
          ...consoleInfoSpy.mock.calls,
          ...consoleDebugSpy.mock.calls,
        ];

        // The LOAD-BEARING assertion: this service emits NO log output at
        // all today (NFR-8's per-request logging is the request-context
        // middleware's job, T-4 — see this service's class doc). This is
        // falsifiable across the FULL Logger/console surface: it fails the
        // moment ANY future line is added here, PII-bearing or not, forcing
        // a deliberate look at what it contains.
        expect(allCalls).toHaveLength(0);

        // These two checks are, right now, VACUOUS — `allCalls` is empty, so
        // "does not contain X" holds trivially regardless of X. Kept only as
        // a recorded intent for the day a log line IS added here; on their
        // own they prove nothing today, and this file cannot speak for
        // whether some OTHER layer (a future interceptor, a crash handler)
        // ever logs these values (KZ-002).
        const emittedText = allCalls
          .map((args) => args.map((a: unknown) => String(a)).join(' '))
          .join('\n');
        expect(emittedText).not.toContain(issued.code);
        expect(emittedText).not.toContain(email);
      } finally {
        logSpy.mockRestore();
        errorSpy.mockRestore();
        warnSpy.mockRestore();
        debugSpy.mockRestore();
        verboseSpy.mockRestore();
        fatalSpy.mockRestore();
        staticLogSpy.mockRestore();
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        consoleInfoSpy.mockRestore();
        consoleDebugSpy.mockRestore();
      }
    });
  });

  describe('issueCode — parameters (6-digit CSPRNG, 15 min lifetime, 3 sends/email/hour)', () => {
    it('issues a 6-digit numeric code with a 15-minute expiry', async () => {
      const before = Date.now();
      const issued = await service.issueCode('applicant@example.org');
      expect(issued.code).toMatch(/^\d{6}$/);
      const deltaMs = issued.expiresAt.getTime() - before;
      expect(deltaMs).toBeGreaterThan(14 * 60 * 1000);
      expect(deltaMs).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);
    });

    it('refuses a 4th send within the hour for the same email (the shared, cross-container control)', async () => {
      for (let i = 0; i < OTP_MAX_SENDS_PER_HOUR; i += 1) {
        await expect(service.issueCode('applicant@example.org')).resolves.toBeDefined();
      }
      await expect(service.issueCode('applicant@example.org')).rejects.toThrow(
        EmailVerificationSendLimitExceededError,
      );
    });

    it('does not invalidate a prior live code on issuing a new one (up to three live codes are permitted by design — schema.prisma)', async () => {
      const first = await service.issueCode('applicant@example.org');
      await service.issueCode('applicant@example.org');

      // The first code is still independently verifiable.
      const result = await service.verifyCode('applicant@example.org', first.code);
      expect(result.outcome).toBe('MATCHED');
    });
  });

  describe('issueCode send-rate cap under concurrency (the EmailSendBudget atomic counter, T-7 rework attempt 3)', () => {
    it('of 5 concurrent issueCode calls for the SAME fresh email, exactly OTP_MAX_SENDS_PER_HOUR succeed and exactly that many EmailVerification rows persist', async () => {
      const email = 'burst@example.org';
      const attemptsCount = 5;

      const results = await Promise.allSettled(
        Array.from({ length: attemptsCount }, () => service.issueCode(email)),
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );

      expect(succeeded).toHaveLength(OTP_MAX_SENDS_PER_HOUR);
      expect(rejected).toHaveLength(attemptsCount - OTP_MAX_SENDS_PER_HOUR);
      for (const r of rejected) {
        expect(r.reason).toBeInstanceOf(EmailVerificationSendLimitExceededError);
      }

      // The DB-visible outcome matches the accept/reject split exactly —
      // never more than the cap, regardless of how much concurrent demand
      // there was. This is the property attempt 1's check-then-act race
      // could not guarantee, and attempt 2's advisory lock also could not
      // (see the service's class doc on the pre-commit-visibility defect).
      const finalRows = rows.filter((row) => row.email === email);
      expect(finalRows).toHaveLength(OTP_MAX_SENDS_PER_HOUR);
    });

    it('a globally-scoped (not per-email) budget would fail this: OTP_MAX_SENDS_PER_HOUR + 1 DIFFERENT emails all succeed independently', async () => {
      // Deliberately one MORE email than the cap: with only `cap` distinct
      // emails, a single shared/global counter could still happen to let
      // all of them through and this test would not discriminate. With
      // `cap + 1`, a globally-scoped (rather than per-email) budget would
      // reject at least one of these — this fixture only passes if the
      // budget is genuinely keyed per email.
      const emailCount = OTP_MAX_SENDS_PER_HOUR + 1;
      const emails = Array.from({ length: emailCount }, (_, i) => `sibling-${i}@example.org`);
      const results = await Promise.all(emails.map((e) => service.issueCode(e)));
      expect(results).toHaveLength(emailCount);
      for (const e of emails) {
        expect(rows.filter((r) => r.email === e)).toHaveLength(1);
      }
    });
  });
});
