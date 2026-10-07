/**
 * Shared in-memory `ActorSequence` allocator mock (design.md §4.2) for
 * Prisma's `$executeRaw`/`$queryRaw` pair, used by every suite that exercises
 * `allocateTraderIds` through a mocked/in-memory Prisma client:
 * `actors-admin.service.spec.ts`, `actor-import.service.spec.ts`,
 * `admin-actor-import.e2e.spec.ts`, `admin-actors-crud.e2e.spec.ts`, and
 * `partner-profile-onboarding-import.e2e.spec.ts`.
 *
 * Each call returns a FRESH pair over its own private `sequenceRows` /
 * `sessionNewSeq` closure, so callers never share allocator state with each
 * other (mirrors each call site's own prior per-file closure exactly). The
 * returned `reset()` re-zeroes that same closure in place — for the e2e
 * suites that build their Prisma mock once in `beforeAll` and re-seed it
 * per test, rather than calling this factory itself per test.
 */
export function createActorSequenceMock() {
  let sequenceRows: Array<{ year: number; seq: number }> = [];
  let sessionNewSeq: number | null = null;

  const $executeRaw = jest.fn(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      if (!sql.includes('ActorSequence')) {
        throw new Error(`Fake $executeRaw: unrecognized SQL: ${sql}`);
      }
      const [year, count] = values as [number, number];
      let row = sequenceRows.find((r) => r.year === year);
      if (!row) {
        row = { year, seq: count };
        sequenceRows.push(row);
      } else {
        row.seq += count;
      }
      sessionNewSeq = row.seq;
      return 1;
    },
  );

  const $queryRaw = jest.fn(async (strings: TemplateStringsArray | { sql: string }) => {
    // Tagged-template call (`$queryRaw\`…\``) or a `Prisma.sql` object (D-26's lock).
    const sql = Array.isArray(strings) ? strings.join('?') : (strings as { sql: string }).sql;
    // D-26 — `ActorsAdminService.update`'s first transaction statement is the
    // locking `SELECT … FOR UPDATE`; its result is unused by the service.
    if (sql.includes('FROM Actor') && sql.includes('FOR UPDATE')) {
      return [];
    }
    if (!sql.includes('@newActorSeq')) {
      throw new Error(`Fake $queryRaw: unrecognized SQL: ${sql}`);
    }
    return [{ newActorSeq: sessionNewSeq as number }];
  });

  function reset(): void {
    sequenceRows = [];
    sessionNewSeq = null;
  }

  return { $executeRaw, $queryRaw, reset };
}
