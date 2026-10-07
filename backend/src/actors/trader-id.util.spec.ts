// @sdd-spec actors/consent-intake/intake-required-fields (T-2)
/**
 * `trader-id.util.ts` unit tests (design.md §2, §4.2, FR-2).
 *
 * Declared gap (design.md P-17): the fake `prisma.$transaction` below runs
 * entirely in memory — it proves the range arithmetic, format and call
 * shape, not MySQL's own atomicity under real concurrent connections. That
 * atomicity has partial real-MySQL evidence (execution.md T-2, "Leader extra
 * evidence"); the retry specs in `actors-admin.service.spec.ts` are the
 * design-named substitute.
 */
import {
  allocateTraderIds,
  buildTraderId,
  isTraderIdCollisionError,
  MAX_TRADER_ID_ALLOCATION_ATTEMPTS,
  TRADER_ID_SEQUENCE_DIGITS,
} from './trader-id.util';
import { Prisma } from '@prisma/client';

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
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Array<{ newActorSeq: number }>>;
}

/** A fake `{ $transaction }` over a shared `rows` backing store — see this file's header. */
function buildFakePrisma(rows: SequenceRow[]) {
  return {
    $transaction: async <T>(callback: (tx: FakeTx) => Promise<T>): Promise<T> => {
      let sessionNewSeq: number | null = null;
      const tx: FakeTx = {
        $executeRaw: async (strings, ...values) => {
          const sql = strings.join('?');
          if (!sql.includes('ActorSequence')) {
            throw new Error(`Fake tx.$executeRaw: unrecognized SQL: ${sql}`);
          }
          await tick();
          const [year, count] = values as [number, number];
          let row = rows.find((r) => r.year === year);
          if (!row) {
            row = { year, seq: count };
            rows.push(row);
          } else {
            row.seq += count;
          }
          sessionNewSeq = row.seq;
          return 1;
        },
        $queryRaw: async (strings) => {
          await tick();
          const sql = strings.join('?');
          if (!sql.includes('@newActorSeq')) {
            throw new Error(`Fake tx.$queryRaw: unrecognized SQL: ${sql}`);
          }
          return [{ newActorSeq: sessionNewSeq as number }];
        },
      };
      return callback(tx);
    },
  };
}

describe('buildTraderId (format, FR-2)', () => {
  it('formats TM-<year>-<4-digit zero-padded sequence>', () => {
    expect(buildTraderId(2026, 1)).toBe('TM-2026-0001');
    expect(buildTraderId(2026, 184)).toBe('TM-2026-0184');
    expect(buildTraderId(2026, 9999)).toBe('TM-2026-9999');
  });

  it('widens rather than truncating a 5-digit sequence (never silently wraps or collides)', () => {
    expect(buildTraderId(2026, 10000)).toBe('TM-2026-10000');
  });

  it('pins the zero-padding width constant to 4', () => {
    expect(TRADER_ID_SEQUENCE_DIGITS).toBe(4);
  });
});

describe('allocateTraderIds — range arithmetic (design.md §4.2)', () => {
  it('a single-id request returns [value, value] — just the captured value', async () => {
    const rows: SequenceRow[] = [];
    const prisma = buildFakePrisma(rows);

    const ids = await allocateTraderIds(prisma as never, 1, new Date('2026-08-06T12:00:00Z'));

    expect(ids).toEqual(['TM-2026-0001']);
    expect(rows).toEqual([{ year: 2026, seq: 1 }]);
  });

  it('a range request of count=5 returns 5 consecutive ids [value-count+1, value]', async () => {
    const rows: SequenceRow[] = [];
    const prisma = buildFakePrisma(rows);

    const ids = await allocateTraderIds(prisma as never, 5, new Date('2026-08-06T12:00:00Z'));

    expect(ids).toEqual([
      'TM-2026-0001',
      'TM-2026-0002',
      'TM-2026-0003',
      'TM-2026-0004',
      'TM-2026-0005',
    ]);
    // The DB-visible counter advanced by exactly 5, not 5 independent reads of 1.
    expect(rows).toEqual([{ year: 2026, seq: 5 }]);
  });

  it('a second call continues from where the first left off — never re-issuing a value', async () => {
    const rows: SequenceRow[] = [];
    const prisma = buildFakePrisma(rows);
    const now = new Date('2026-08-06T12:00:00Z');

    const first = await allocateTraderIds(prisma as never, 3, now);
    const second = await allocateTraderIds(prisma as never, 2, now);

    expect(first).toEqual(['TM-2026-0001', 'TM-2026-0002', 'TM-2026-0003']);
    expect(second).toEqual(['TM-2026-0004', 'TM-2026-0005']);
    expect(rows).toEqual([{ year: 2026, seq: 5 }]);
  });

  it('of 5 concurrent single-id allocations for the SAME year, every returned id is unique and sequential 1..5', async () => {
    const rows: SequenceRow[] = [];
    const prisma = buildFakePrisma(rows);
    const now = new Date('2026-08-06T12:00:00Z');

    const results = await Promise.all(
      Array.from({ length: 5 }, () => allocateTraderIds(prisma as never, 1, now)),
    );
    const ids = results.map((r) => r[0]);

    expect(new Set(ids).size).toBe(5);
    expect(new Set(ids)).toEqual(
      new Set(['TM-2026-0001', 'TM-2026-0002', 'TM-2026-0003', 'TM-2026-0004', 'TM-2026-0005']),
    );
    expect(rows).toEqual([{ year: 2026, seq: 5 }]);
  });

  it('two DIFFERENT years allocate independently — a burst in one year does not affect the other', async () => {
    const rows: SequenceRow[] = [];
    const prisma = buildFakePrisma(rows);

    const ids2025 = await allocateTraderIds(prisma as never, 1, new Date('2025-12-31T23:59:00Z'));
    const ids2026 = await allocateTraderIds(prisma as never, 1, new Date('2026-01-01T00:01:00Z'));

    expect(ids2025).toEqual(['TM-2025-0001']);
    expect(ids2026).toEqual(['TM-2026-0001']);
  });

  // Falsifier 1 (tasks.md T-2) — proves the arithmetic is [value-count+1, value],
  // not an off-by-one [value-count, value-1]. Mutating the range start in
  // `trader-id.util.ts` to `value - count` must redden this exact assertion.
  it('falsifier 1: the range starts at value-count+1, not value-count (off-by-one check)', async () => {
    const rows: SequenceRow[] = [{ year: 2026, seq: 10 }];
    const prisma = buildFakePrisma(rows);

    const ids = await allocateTraderIds(prisma as never, 3, new Date('2026-08-06T12:00:00Z'));

    // seq goes 10 -> 13; the correct range is [11, 12, 13], never [10, 11, 12].
    expect(ids).toEqual(['TM-2026-0011', 'TM-2026-0012', 'TM-2026-0013']);
  });
});

describe('isTraderIdCollisionError', () => {
  // The observed real shape (design.md §4.4, measured against the local
  // MySQL container, execution.md T-2 attempt 2): `meta.target` is the
  // index-name STRING, not an array.
  it('is true for the real MySQL P2002 shape — meta.target is the index-name string', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '0.0.0',
      meta: { modelName: 'Actor', target: 'Actor_traderId_key' },
    });
    expect(isTraderIdCollisionError(err)).toBe(true);
  });

  it('is true for the Postgres-style array shape too (portability)', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '0.0.0',
      meta: { target: ['traderId'] },
    });
    expect(isTraderIdCollisionError(err)).toBe(true);
  });

  it('is false for a different Prisma error code', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '0.0.0',
    });
    expect(isTraderIdCollisionError(err)).toBe(false);
  });

  it('is false for a non-Prisma error', () => {
    expect(isTraderIdCollisionError(new Error('boom'))).toBe(false);
  });

  // Un-narrowing falsifier (rework) — reverting the `meta.target` check back
  // to "any P2002" is what must redden this.
  it('is false for a P2002 on a different unique target (array shape)', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '0.0.0',
      meta: { target: ['id'] },
    });
    expect(isTraderIdCollisionError(err)).toBe(false);
  });

  // Falsifier 6 (rework, attempt 3) — an array-only check
  // (`Array.isArray(target) ? target : []`) still returns `false` HERE too
  // (this target is a string), so it does NOT redden this assertion. What it
  // actually reddens is "is true for the real MySQL P2002 shape" above: a
  // real collision (`Actor_traderId_key`, a string) would stop being
  // recognized at all, and that positive-case test would fail.
  it('falsifier 6: is false for a P2002 on a different unique target (real MySQL string shape)', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '0.0.0',
      meta: { modelName: 'Actor', target: 'Actor_otherField_key' },
    });
    expect(isTraderIdCollisionError(err)).toBe(false);
  });

  it('pins the bounded retry count to 3', () => {
    expect(MAX_TRADER_ID_ALLOCATION_ATTEMPTS).toBe(3);
  });
});
