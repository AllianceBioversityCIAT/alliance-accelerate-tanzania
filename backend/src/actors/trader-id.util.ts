// @sdd-spec actors/consent-intake/intake-required-fields (T-2)
/**
 * Trader ID range allocation for team-managed actors (design.md §2, §4.2,
 * FR-2). Mirrors `allocateRegistrationReference`'s atomic session-variable
 * `INSERT … ON DUPLICATE KEY UPDATE`, widened from a single increment to a
 * range — the range variant itself is new; its arithmetic is pinned by this
 * file's unit tests, and real-MySQL atomicity is a declared gap (design.md
 * P-17; partial evidence in execution.md T-2).
 *
 * `ActorSequence` is a sibling of `RegistrationSequence` (DD-2), not a
 * generalization of it. This opens and commits its OWN transaction, never
 * nested inside the caller's create transaction (same constraint as
 * `allocateRegistrationReference`). Gaps are accepted: the id is a key, not
 * a count. Format: `TM-<UTC year>-<seq, 4-digit zero-padded, widening past
 * 9999>`.
 */
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** FR-2: zero-padding width for the sequence segment, before widening. */
export const TRADER_ID_SEQUENCE_DIGITS = 4;

/** design.md §4.2: bounded retry count for a Trader ID collision (never surfaced as a 500 before this many attempts). */
export const MAX_TRADER_ID_ALLOCATION_ATTEMPTS = 3;

/** FR-2 format: `TM-<year>-<4-digit zero-padded sequence>` — pure formatting, no allocation. */
export function buildTraderId(year: number, seq: number): string {
  return `TM-${year}-${String(seq).padStart(TRADER_ID_SEQUENCE_DIGITS, '0')}`;
}

/**
 * Allocate — and COMMIT — `count` consecutive Trader IDs for `now`'s UTC
 * year, oldest-claimed first. Opens and closes its OWN `prisma.$transaction`
 * (see this file's header for why it must).
 */
export async function allocateTraderIds(
  prisma: Pick<PrismaService, '$transaction'>,
  count: number,
  now: Date,
): Promise<string[]> {
  const year = now.getUTCFullYear();

  const value = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO ActorSequence (year, seq)
      VALUES (${year}, (@newActorSeq := ${count}))
      ON DUPLICATE KEY UPDATE seq = (@newActorSeq := seq + ${count})
    `;
    const rows = await tx.$queryRaw<Array<{ newActorSeq: bigint | number }>>`
      SELECT @newActorSeq AS newActorSeq
    `;
    const seq = Number(rows[0]?.newActorSeq);
    if (!Number.isFinite(seq)) {
      throw new Error('allocateTraderIds: ActorSequence session variable returned a non-finite value');
    }
    return seq;
  });

  const ids: string[] = [];
  for (let seq = value - count + 1; seq <= value; seq += 1) {
    ids.push(buildTraderId(year, seq));
  }
  return ids;
}

/**
 * True for a Prisma `P2002` whose `meta.target` names `traderId` (design.md
 * §4.4). On MySQL `target` is the index-name string `Actor_traderId_key`
 * (measured against the local container); Postgres reports an array of
 * field names instead, accepted here too for portability.
 */
export function isTraderIdCollisionError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
    return false;
  }
  const target = err.meta?.target;
  if (typeof target === 'string') {
    return target.includes('traderId');
  }
  return Array.isArray(target) && target.includes('traderId');
}
