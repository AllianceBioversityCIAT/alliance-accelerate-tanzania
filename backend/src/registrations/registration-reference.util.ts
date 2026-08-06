// @sdd-spec actors/public-self-registration (T-10)
/**
 * T-10 — Reference allocation for `POST /registrations` (design.md §4.5,
 * A-1…A-5). `RegistrationsService.submitRegistration` is the only caller.
 *
 * **Mechanism, and why it is not one of the two rejected in design.md §4.5.**
 * `COUNT` of the year's rows fails A-2 outright (rejected/withdrawn rows
 * leave gaps, and counting reissues an already-used value). `MAX(sequence)+1`
 * parsed back out of the reference string needs a table lock and is fragile
 * against any future format drift. A dedicated per-year counter row is
 * "probably the simplest" per §4.5 — but revision 2 answered exactly that
 * and named no schema object anywhere (RA1): the allocator could not be
 * built as described. `RegistrationSequence` (`schema.prisma`) is that
 * object, declared in its own migration (A-4).
 *
 * **The atomic increment is the SAME technique `EmailSendBudget` already
 * uses and has already proven under real concurrent load against dev
 * RDS** (`email-verification.service.ts`'s `issueCode` — see its class doc
 * for the three empirical rounds that ruled out the affected-rows check and
 * the bare-read-after-increment race). One `INSERT ... ON DUPLICATE KEY
 * UPDATE` captures THIS call's own post-increment value into a MySQL
 * session variable as part of the same atomic statement; a following
 * `SELECT` on the SAME connection reads it back. Because the variable is
 * assigned synchronously while the row lock is held, no concurrent
 * sibling's write can retroactively change what was already assigned —
 * this is what makes A-1 (race-safe under concurrent submissions) hold.
 *
 * **This function opens and COMMITS its OWN `$transaction` — it does NOT
 * take an already-open `Prisma.TransactionClient` from the caller.** That is
 * a deliberate departure from `design.md` §4.1's literal listed order
 * ("mark the code consumed → allocate reference → create the row", all
 * inside "one `$transaction`"), and it is load-bearing, not stylistic:
 * `Prisma.TransactionClient` does not itself expose `$transaction` — Prisma
 * does not support nesting an interactive transaction inside another one —
 * so this function structurally CANNOT be called with a `tx` the caller is
 * already inside. More importantly, nesting it would reintroduce exactly
 * the bug this design avoids: if the allocation's own increment happened on
 * the SAME transaction as a later `tx.registration.create()` that then
 * fails with a `reference` collision, rolling that transaction back to
 * retry would ALSO roll back the counter increment — so a retry would
 * recompute the IDENTICAL `seq` value and collide again, identically,
 * every time, never making progress and eventually surfacing as an
 * unhandled error (violating A-3's "never surfaced as a `500`"). Committing
 * the allocation in its own transaction, before the caller opens the
 * consume-and-create transaction, means every retry genuinely gets a FRESH,
 * never-before-issued `seq` — see `RegistrationsService.submitRegistration`
 * for how the retry loop uses this.
 *
 * **A-2 (never reused, including after rejection or withdrawal).** `seq`
 * only ever increments — nothing in this file, or in
 * `RegistrationsService.submitRegistration`, ever decrements or resets an
 * existing year's row. A reference allocated for an attempt that is later
 * abandoned (a lost consume-race, an unrelated downstream failure) leaves a
 * GAP in the sequence, never a reused value — the same tolerance an
 * auto-increment primary key already has under a rolled-back insert, and
 * explicitly not what A-2 prohibits (A-2 is about reuse, not gaps; §4.5
 * rejects `COUNT`-of-rows specifically because it reissues an
 * already-used value, which a gap does not). Whatever an Admin later does
 * to the `Registration` row a reference IS attached to (3b's
 * approve/reject) never touches `RegistrationSequence` at all, so an
 * issued reference's number is never handed to anyone else either.
 *
 * **A-3 (the `@unique` constraint is the backstop, not the strategy).** This
 * mechanism is expected to never collide — each call gets a distinct,
 * already-committed post-increment position — but "expected to" is not
 * "proven to" for every conceivable failure mode (a hand-inserted row, a
 * future bug in this file). {@link isReferenceCollisionError} and
 * {@link MAX_REFERENCE_ALLOCATION_ATTEMPTS} exist so `RegistrationsService`
 * can catch a `Registration.reference` uniqueness violation and retry —
 * allocating a genuinely NEW reference each time, per the note above — a
 * bounded number of times, never surfacing one as a `500`.
 *
 * **A-5 (format).** `REG-<year>-<4-digit sequence>`, applicant-facing and
 * dictatable aloud (OQ-4). `year` is the UTC calendar year at allocation
 * time — Lambda's runtime clock is UTC, and pinning to UTC (rather than
 * whatever `Date.getFullYear()` resolves to under the process's local
 * timezone) keeps the reference deterministic regardless of where this code
 * runs. `seq` is zero-padded to 4 digits; a year issuing a 5-digit sequence
 * is not truncated — the format widens rather than silently wrapping or
 * colliding.
 */
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** A-5: zero-padding width for the sequence segment (design.md §4.5). */
export const REGISTRATION_REFERENCE_SEQUENCE_DIGITS = 4;

/** A-3: bounded retry count for a reference collision (never surfaced as a 500). */
export const MAX_REFERENCE_ALLOCATION_ATTEMPTS = 3;

/** A-5: `REG-<year>-<4-digit sequence>` — pure formatting, no allocation. */
export function buildRegistrationReference(year: number, seq: number): string {
  return `REG-${year}-${String(seq).padStart(REGISTRATION_REFERENCE_SEQUENCE_DIGITS, '0')}`;
}

/**
 * Allocate — and COMMIT — the next reference for `now`'s UTC year. Opens and
 * closes its OWN `prisma.$transaction`, exactly like
 * `EmailVerificationService.issueCode` does for its `EmailSendBudget`
 * counter — see this file's class doc for why that (rather than taking the
 * caller's already-open `tx`) is what makes A-1 and A-3 both hold together.
 */
export async function allocateRegistrationReference(
  prisma: Pick<PrismaService, '$transaction'>,
  now: Date,
): Promise<string> {
  const year = now.getUTCFullYear();

  const seq = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO RegistrationSequence (year, seq)
      VALUES (${year}, (@newRegSeq := 1))
      ON DUPLICATE KEY UPDATE seq = (@newRegSeq := seq + 1)
    `;
    const rows = await tx.$queryRaw<Array<{ newRegSeq: bigint | number }>>`
      SELECT @newRegSeq AS newRegSeq
    `;
    return Number(rows[0]?.newRegSeq);
  });

  return buildRegistrationReference(year, seq);
}

/**
 * True for a Prisma unique-constraint violation (`P2002`) — the shape a
 * collision on `Registration.reference` surfaces as when
 * `RegistrationsService.submitRegistration`'s consume-and-create transaction
 * runs `tx.registration.create(...)` with an already-allocated reference
 * that turns out to collide (A-3's backstop). Not narrowed to `reference`
 * specifically: that transaction writes no other unique field, so any
 * `P2002` reaching it from inside the callback is this collision.
 */
export function isReferenceCollisionError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}
