// @sdd-spec actors/public-self-registration (T-10)
/**
 * `registration-reference.util.ts` unit tests — A-1, A-2, A-5 (design.md
 * §4.5). A-3 (the `@unique` backstop + bounded retry) and A-4 (the migration
 * declaring `RegistrationSequence`) are evidenced elsewhere: A-3 in
 * `registrations.service.spec.ts` (the retry loop lives in
 * `RegistrationsService.submitRegistration`, not here — this file proves
 * only that repeated ALLOCATION calls behave correctly, not the retry
 * policy around a collision), A-4 by
 * `prisma/migrations/20260806132727_add_registration_sequence/migration.sql`
 * existing and this file's own successful `npx prisma generate` against the
 * widened schema.
 *
 * The fake `prisma.$transaction` below opens a FRESH fake `tx` per call,
 * each with its OWN private `sessionNewSeq` closure — exactly mirroring how
 * `email-verification.service.spec.ts`'s `EmailSendBudget` fake models a
 * MySQL session variable's CONNECTION scoping for the sibling mechanism
 * `issueCode` uses. `allocateRegistrationReference` itself opens one
 * `$transaction` per call (see its own doc for why it must — a
 * `Prisma.TransactionClient` cannot open a nested one), so this fake's shape
 * is not an approximation of the real call pattern; it IS the real call
 * pattern.
 */
import { allocateRegistrationReference, buildRegistrationReference } from './registration-reference.util';

interface SequenceRow {
  year: number;
  seq: number;
}

/** A macrotask tick — models a real DB round trip so concurrent calls actually interleave. */
function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

interface FakeTx {
  $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Array<{ newRegSeq: number }>>;
}

/**
 * A fake `{ $transaction }` over a shared `rows` backing store — the
 * top-level object `allocateRegistrationReference` receives. Each
 * `$transaction(...)` call gets a brand-new `FakeTx` with its own
 * `sessionNewSeq`, never a shared module-level variable — the same
 * connection-scoping fidelity point `email-verification.service.spec.ts`
 * documents for the identical reason.
 */
function buildFakePrisma(rows: SequenceRow[]) {
  return {
    $transaction: async <T>(callback: (tx: FakeTx) => Promise<T>): Promise<T> => {
      let sessionNewSeq: number | null = null;
      const tx: FakeTx = {
        $executeRaw: async (strings, ...values) => {
          const sql = strings.join('?');
          if (!sql.includes('RegistrationSequence')) {
            throw new Error(`Fake tx.$executeRaw: unrecognized SQL: ${sql}`);
          }
          await tick();
          const [year] = values as [number];
          let row = rows.find((r) => r.year === year);
          if (!row) {
            row = { year, seq: 1 };
            rows.push(row);
          } else {
            row.seq += 1;
          }
          sessionNewSeq = row.seq;
          return 1;
        },
        $queryRaw: async (strings) => {
          await tick();
          const sql = strings.join('?');
          if (!sql.includes('@newRegSeq')) {
            throw new Error(`Fake tx.$queryRaw: unrecognized SQL: ${sql}`);
          }
          return [{ newRegSeq: sessionNewSeq as number }];
        },
      };
      return callback(tx);
    },
  };
}

describe('buildRegistrationReference — A-5 (format)', () => {
  it('formats REG-<year>-<4-digit zero-padded sequence>', () => {
    expect(buildRegistrationReference(2026, 1)).toBe('REG-2026-0001');
    expect(buildRegistrationReference(2026, 184)).toBe('REG-2026-0184');
    expect(buildRegistrationReference(2026, 9999)).toBe('REG-2026-9999');
  });

  it('widens rather than truncating a 5-digit sequence (never silently wraps or collides)', () => {
    expect(buildRegistrationReference(2026, 10000)).toBe('REG-2026-10000');
  });
});

describe('allocateRegistrationReference — A-1 (race-safe under concurrent submissions)', () => {
  it('of 5 concurrent allocations for the SAME year, each returned reference is unique and sequential 1..5', async () => {
    const rows: SequenceRow[] = [];
    const prisma = buildFakePrisma(rows);
    const now = new Date('2026-08-06T12:00:00Z');

    const references = await Promise.all(
      Array.from({ length: 5 }, () => allocateRegistrationReference(prisma as never, now)),
    );

    expect(new Set(references).size).toBe(5);
    expect(new Set(references)).toEqual(
      new Set([
        'REG-2026-0001',
        'REG-2026-0002',
        'REG-2026-0003',
        'REG-2026-0004',
        'REG-2026-0005',
      ]),
    );

    // The DB-visible counter really advanced by exactly 5 — not "5 callers
    // each independently computed 1", which a non-atomic bare-read
    // mechanism could produce (see email-verification.service.ts's class
    // doc for the exact shape of that failure mode in the sibling
    // mechanism this one is modelled on).
    expect(rows).toEqual([{ year: 2026, seq: 5 }]);
  });

  it('two DIFFERENT years allocate independently — a burst in one year does not affect the other', async () => {
    const rows: SequenceRow[] = [];
    const prisma = buildFakePrisma(rows);

    const ref2025 = await allocateRegistrationReference(
      prisma as never,
      new Date('2025-12-31T23:59:00Z'),
    );
    const ref2026 = await allocateRegistrationReference(
      prisma as never,
      new Date('2026-01-01T00:01:00Z'),
    );

    expect(ref2025).toBe('REG-2025-0001');
    expect(ref2026).toBe('REG-2026-0001');
  });
});

describe('allocateRegistrationReference — A-2 (a sequence value is never reused)', () => {
  it('sequential allocations strictly increase — a value once handed out is never handed out again', async () => {
    const rows: SequenceRow[] = [];
    const prisma = buildFakePrisma(rows);
    const now = new Date('2026-08-06T12:00:00Z');

    const first = await allocateRegistrationReference(prisma as never, now);
    const second = await allocateRegistrationReference(prisma as never, now);
    const third = await allocateRegistrationReference(prisma as never, now);

    expect([first, second, third]).toEqual(['REG-2026-0001', 'REG-2026-0002', 'REG-2026-0003']);

    // Nothing in this function's surface takes a year/seq pair BACK down —
    // there is no decrement, no reset-on-rejection path to call. The
    // counter only ever moves forward, which is the structural reason A-2
    // holds regardless of what later happens (in chunk 3b) to the
    // Registration row a reference is attached to, and regardless of
    // whether an earlier allocation was ever attached to a persisted row
    // at all (a genuinely abandoned attempt leaves a gap, never a reused
    // value — see this file's header on why a gap does not violate A-2).
    expect(rows).toEqual([{ year: 2026, seq: 3 }]);
  });
});
