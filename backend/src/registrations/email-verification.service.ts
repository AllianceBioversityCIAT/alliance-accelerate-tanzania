// @sdd-spec actors/public-self-registration (T-7)
/**
 * T-7 — `EmailVerificationService`: issue, verify, consume (FR-4, DC-20,
 * design.md §4.3/DD-11/§4.1). This module owns the `EmailVerification` table
 * end to end; it does NOT send mail (T-8 owns the endpoint that requests a
 * code and calls `MailService`) and does NOT open the submission
 * `$transaction` (T-10 owns that — see `consumeCode` below).
 *
 * Mechanism, and why it is not one of the two rejected in design.md §4.3:
 *
 *  - **Lookup key is `email`, comparison is HMAC (DD-11).** Looking the row
 *    up by the submitted code's own hash would mean a WRONG code matches no
 *    row at all, so `attempts` could never increment on a wrong guess and
 *    the 5-per-code cap — "the actual control" — would be unreachable
 *    (S-1). Looking up by email instead makes every wrong guess land on a
 *    real, incrementable row.
 *  - **No "latest row wins" selection.** `schema.prisma`'s `EmailVerification`
 *    model deliberately permits up to three simultaneously live rows per
 *    email (its own doc comment) — up to `OTP_MAX_SENDS_PER_HOUR` codes can
 *    be genuinely outstanding at once. Selecting "the newest" and
 *    invalidating the rest would reject a still-valid OLDER code the moment
 *    a newer one exists (RA4, V-3). Instead, `verifyCode` searches every
 *    currently-live row for the email and compares each one's `codeHash` by
 *    HMAC — a 6-digit CSPRNG code makes a cross-row match effectively
 *    impossible, so this is unambiguous in practice (V-2's second, adopted
 *    option) without ever invalidating a sibling code.
 *  - **HMAC-SHA-256 under an env-sourced secret, never plaintext, never a
 *    slow hash (V-6).** A 6-digit space is offline-brute-forceable under any
 *    hash; HMAC is what makes it unusable without the secret, and a slow
 *    hash (bcrypt/scrypt) buys nothing extra against that same 10^6 space
 *    while adding needless latency to every verification call.
 *
 * **V-1a — the trap that swallowed two prior revisions of this design.**
 * `verifyCode`'s mismatch path (`updateMany` incrementing `attempts`) runs
 * directly against the injected `PrismaService` — there is no `$transaction`
 * anywhere in this file for it to be rolled back by. design.md §4.1 states
 * the invariant this depends on: the submission `$transaction` is entered
 * ONLY once a code has already matched (step 6), never around the
 * verification call itself (step 5) — so there is no way for a caller
 * following that order to accidentally cause this method's write to be
 * rolled back by an abort elsewhere. Precisely: a caller CAN syntactically
 * wrap a call to `verifyCode` inside its own `prisma.$transaction(...)`
 * block — what it cannot do is **enrol this method's write in that
 * transaction**, because `verifyCode` always writes through the injected
 * `PrismaService` singleton, never through a passed-in `tx`. `PrismaService`
 * is a bare `extends PrismaClient` with no `$extends`/AsyncLocalStorage-based
 * ambient transaction propagation, and Prisma binds each interactive `tx` to
 * its own dedicated pooled connection — so a write issued against
 * `this.prisma` runs on a DIFFERENT connection than any transaction a caller
 * happens to be inside, and is not subject to that transaction's commit or
 * rollback. This is a structural guarantee, not a convention: `verifyCode`
 * takes no `tx` parameter and cannot be made to accept one (the RB1 defect).
 *
 * **V-4 — `consumeCode` is the one method built to run inside the CALLER's
 * transaction** (design.md §4.1 step 6, A23): a bare conditional
 * `updateMany({ where: { id, consumedAt: null } })` whose `count === 0` IS
 * the failure. A read-then-write (`findUnique` then `update`) would let two
 * concurrent requests both observe `consumedAt: null` and both "succeed",
 * burning a single-use code twice.
 *
 * **`issueCode`'s send-rate cap (T-7 rework, attempt 3 — final).** Attempt 1
 * read the per-email send count and then created the row as two separate
 * statements — a check-then-act race: concurrent callers could all observe
 * the same stale count and all insert, bypassing the "3 sends per email per
 * hour" cap (§4.3/§4.4's stated **only shared, cross-container** control on
 * `POST /verify`) by concurrency alone, no code defect required. Attempt 2
 * closed that with a per-email MySQL advisory lock (`GET_LOCK`/`RELEASE_LOCK`)
 * around the whole count-then-create pair — and that mechanism had its OWN
 * fatal defect, found before it shipped: **`RELEASE_LOCK` runs before
 * `COMMIT`.** Inside one Prisma interactive transaction the server-side order
 * on the success path is `GET_LOCK` → `COUNT` → `INSERT` (uncommitted) →
 * `RELEASE_LOCK` → *(callback returns)* → `COMMIT`. The insert is invisible to
 * every other session until the commit, but the lock is handed to the next
 * waiter a full round trip *earlier* — so a waiting session can acquire the
 * lock, run its own `COUNT` under a read view that predates the first
 * session's still-uncommitted insert, and undercount. Releasing after commit
 * and releasing from the acquiring session are both mandatory and mutually
 * unsatisfiable inside a single interactive transaction — this is not
 * repairable by reordering statements, only by abandoning the lock. (Three
 * further defects made it worse, not just insufficient: `OTP_SEND_LOCK_TIMEOUT_SECONDS`
 * and Prisma's default 5000 ms interactive-transaction timeout were
 * co-timed, so the framework budget expired before `GET_LOCK` could ever
 * return 0; the lock leaked on two error paths — a `GET_LOCK` statement
 * failure ran outside the `try`, and an expired transaction's `finally`
 * block threw on its own `RELEASE_LOCK` call, masking the original error
 * while leaving the connection holding the lock; and holding a blocked, idle
 * pooled connection per waiting request on this unauthenticated path
 * amplifies the exact risk `design.md`'s R-1 already accepts — connection
 * pressure with RDS Proxy deferred.)
 *
 * **The mechanism now (authorized migration): a dedicated, atomically
 * incremented counter row, `EmailSendBudget`, keyed by `(email, windowStart)`.**
 * Row-level locking on the primary key makes a single `INSERT ... ON
 * DUPLICATE KEY UPDATE` against it atomic under ANY isolation level and ANY
 * `binlog_format` — unlike the count-subquery idea rejected earlier for
 * exactly that config-dependence, and unlike `SELECT ... FOR UPDATE` over
 * the counted `EmailVerification` rows, rejected because a fresh email has
 * no existing row to lock and gap-locking is index-plan-dependent.
 *
 * **What the accept/reject signal actually is took three empirical rounds
 * against the live dev RDS to get right — record this, because the first
 * two "obvious" answers are both wrong in THIS environment, silently.**
 *
 * 1. *First tried: MySQL's documented affected-rows contract for `INSERT
 *    ... ON DUPLICATE KEY UPDATE`* (1 = inserted, 2 = changed, 0 =
 *    unchanged — cap hit). **Measured, not assumed: running this
 *    statement 5×, against a real table, this connector never returns 0.**
 *    A no-op update reports `1`, identical to a fresh insert — MySQL's own
 *    docs name the cause: *"If you specify the CLIENT_FOUND_ROWS flag …
 *    the affected-rows value is 1 (not 0) if an existing row is set to its
 *    current values."* Whatever sets that flag for this connector, `0`
 *    never appears, so a naive `affectedRows === 0` check for the cap
 *    NEVER fires — the cap would have silently gone completely
 *    unenforced. This is exactly the class of assumption this task was
 *    told to verify empirically rather than trust.
 * 2. *Second tried: drop the affected-rows check entirely, increment
 *    unconditionally (`sends = sends + 1`), and decide from a plain
 *    follow-up read of the row.* Sequential calls decide correctly. **8
 *    genuinely concurrent calls (`Promise.all` against the real network),
 *    only 1 was accepted where exactly 3 should have been** — every
 *    writer's fast INSERT commits before most readers' follow-up SELECT
 *    even runs, so nearly every reader sees the FINAL tally, not its own
 *    position, and rejects itself. Fails closed (never over-accepts) but
 *    is functionally unusable — a real burst of exactly 3 legitimate
 *    concurrent sends could see all 3 rejected.
 * 3. **What actually works, verified over 6 independent trials of true
 *    concurrent load (10 simultaneous calls each) against the real dev
 *    RDS, exactly `OTP_MAX_SENDS_PER_HOUR` accepted every time:** capture
 *    each caller's OWN post-increment value with a MySQL session variable,
 *    set as part of the SAME atomic statement — `sends = (@newSends :=
 *    sends + 1)` (and `(@newSends := 1)` in the fresh-insert `VALUES`
 *    clause) — then read `@newSends` back with one immediately-following
 *    `SELECT`. Because `@newSends` is assigned synchronously while MY row
 *    lock is held, it reflects exactly what MY OWN increment produced;
 *    no later sibling's write can retroactively change what was already
 *    assigned during my statement. Deciding `newSends <= cap` in
 *    application code, off THIS value, is what removes both prior
 *    defects at once.
 *
 * **This needs the two statements pinned to one connection** — session
 * variables are connection-scoped, so the `INSERT` and the `SELECT
 * @newSends` are wrapped in one `prisma.$transaction(async (tx) => …)`.
 * This is NOT the pattern attempt 2's `$transaction` was removed for: there
 * is no lock here with cross-session visibility, no acquire/release pair,
 * and nothing another session can race against — `@newSends` is invisible
 * and irrelevant outside this one connection. The row's actual lock is
 * ordinary InnoDB row locking on a single statement, released at `COMMIT`
 * exactly when it should be, with no separate release step to mistime.
 * Both statements are fast and non-blocking (no `GET_LOCK`-style wait), so
 * this is nowhere near Prisma's 5000 ms default interactive-transaction
 * timeout even under contention. See `issueCode` below.
 *
 * **Recorded deviation: this is a FIXED window, not the rolling one attempt
 * 1/2 used.** `windowStart` is the email's send bucketed to the start of the
 * current `OTP_SEND_WINDOW_MS`-wide interval (epoch-aligned), not "the last
 * 60 minutes from now". A burst can therefore straddle a bucket boundary —
 * up to `2 × OTP_MAX_SENDS_PER_HOUR` sends across two adjacent buckets in a
 * worst case — which is a real, deliberate deviation from §4.3's "3 sends
 * per email per hour" read as a rolling window. Making the window rolling
 * again would reintroduce a non-atomic count-then-act step (the only way to
 * "expire" older sends from a rolling window is to read and compare
 * timestamps before deciding, which cannot be folded into one conditional
 * statement the way a fixed bucket key can). This trade is deliberate and
 * recorded here, in `execution.md`, and in the Not Done/Assumptions of this
 * task's report — not silently substituted for the spec'd behaviour.
 *
 * **If the budget increments but the subsequent `EmailVerification.create`
 * then fails,** the budget is consumed with no code ever issued. This fails
 * CLOSED (an applicant loses one of their three sends to a transient error,
 * rather than the cap being bypassable) — the conservative direction, and
 * deliberate: no compensating decrement is attempted.
 */
import { Injectable } from '@nestjs/common';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getOtpHmacSecret } from './email-verification.config';

/** Code length (digits), per design.md §4.3's parameter table (DC-20). */
export const OTP_CODE_LENGTH = 6;
/** Code lifetime, per design.md §4.3. */
export const OTP_LIFETIME_MS = 15 * 60 * 1000;
/** Verify attempts allowed per code before it is permanently dead (V-1). */
export const OTP_MAX_ATTEMPTS = 5;
/** Sends allowed per email within {@link OTP_SEND_WINDOW_MS} — the shared, cross-container control (§4.3, §4.4). */
export const OTP_MAX_SENDS_PER_HOUR = 3;
/** Fixed-bucket width for the send-rate cap (recorded deviation from a rolling window — see class doc). */
export const OTP_SEND_WINDOW_MS = 60 * 60 * 1000;

/**
 * Thrown by {@link EmailVerificationService.issueCode} when the per-email
 * send cap (§4.3/§4.4) is already reached for the current window. Deliberately
 * carries no email or code content in its message — callers (T-8) decide how
 * this maps onto the byte-identical public response the requirements ask
 * for; this type only signals which internal condition fired.
 */
export class EmailVerificationSendLimitExceededError extends Error {
  constructor() {
    super('OTP send limit exceeded for this email address in the current window.');
    this.name = 'EmailVerificationSendLimitExceededError';
  }
}

/** Returned by {@link EmailVerificationService.issueCode}. `code` is plaintext — send it, never persist or log it (V-6). */
export interface IssuedCode {
  code: string;
  expiresAt: Date;
}

/** V-5: every failure mode below (wrong / expired / consumed / attempts-exceeded) collapses to this ONE shape. */
export interface VerificationRejected {
  outcome: 'REJECTED';
}

/** The row a submitted code matched, identified so the caller can consume it inside its own transaction. */
export interface VerificationMatched {
  outcome: 'MATCHED';
  id: string;
}

export type VerificationResult = VerificationMatched | VerificationRejected;

@Injectable()
export class EmailVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Issue a new code for `email`. Refuses once {@link OTP_MAX_SENDS_PER_HOUR}
   * sends have already landed for this email in the current fixed window
   * (§4.3/§4.4's shared, cross-container control — see the class doc's
   * "recorded deviation" note on why the window is fixed, not rolling).
   * Does NOT invalidate any prior live `EmailVerification` code — up to
   * three may coexist by design (schema.prisma).
   *
   * The critical section is the `$transaction` below: ONE atomic
   * `INSERT ... ON DUPLICATE KEY UPDATE` against `EmailSendBudget`,
   * capturing this call's own post-increment position into a MySQL session
   * variable, followed by ONE `SELECT` reading it back on the same
   * connection. The accept/reject decision (`newSends <= cap`) happens in
   * plain application code, off a value that is immune to what any
   * concurrent sibling call does — see the class doc's three-round
   * empirical account of why this is the shape that actually works, not
   * the more "obvious" affected-rows or bare-read alternatives.
   */
  async issueCode(rawEmail: string): Promise<IssuedCode> {
    const email = normalizeEmail(rawEmail);
    const now = new Date();
    const windowStart = sendBudgetWindowStart(now);

    const newSends = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO EmailSendBudget (email, windowStart, sends)
        VALUES (${email}, ${windowStart}, (@newSends := 1))
        ON DUPLICATE KEY UPDATE sends = (@newSends := sends + 1)
      `;
      const rows = await tx.$queryRaw<Array<{ newSends: bigint | number }>>`
        SELECT @newSends AS newSends
      `;
      return Number(rows[0]?.newSends);
    });

    if (newSends > OTP_MAX_SENDS_PER_HOUR) {
      throw new EmailVerificationSendLimitExceededError();
    }

    const code = generateCode();
    const expiresAt = new Date(now.getTime() + OTP_LIFETIME_MS);

    await this.prisma.emailVerification.create({
      data: { email, codeHash: hashCode(code), expiresAt },
    });

    return { code, expiresAt };
  }

  /**
   * Verify `submittedCode` against every currently-live row for `email`
   * (not consumed, not expired, still under the attempt cap). On a match,
   * returns the row's id for the caller to consume (inside its own
   * transaction, once ready — §4.1 step 6). On no match — wrong code,
   * expired, consumed, or capped — increments EVERY live row for the email
   * in one statement and returns the identical `REJECTED` shape regardless
   * of which condition actually applied (V-5).
   *
   * Runs entirely against `this.prisma` — no transaction is opened here, by
   * design (see the class doc's V-1a note).
   */
  async verifyCode(rawEmail: string, submittedCode: string): Promise<VerificationResult> {
    const email = normalizeEmail(rawEmail);
    const now = new Date();

    const liveRows = await this.prisma.emailVerification.findMany({
      where: { email, consumedAt: null, expiresAt: { gt: now } },
    });

    const submittedHash = hashCode(submittedCode);
    const match = liveRows.find(
      (row) => row.attempts < OTP_MAX_ATTEMPTS && safeEqualHex(row.codeHash, submittedHash),
    );

    if (match) {
      return { outcome: 'MATCHED', id: match.id };
    }

    if (liveRows.length > 0) {
      await this.prisma.emailVerification.updateMany({
        where: { id: { in: liveRows.map((row) => row.id) } },
        data: { attempts: { increment: 1 } },
      });
    }

    return { outcome: 'REJECTED' };
  }

  /**
   * Single-use consumption (V-4). A conditional `updateMany` whose
   * `count === 0` result IS the failure — never a read followed by a
   * separate write. Takes the CALLER's `Prisma.TransactionClient` because
   * design.md §4.1 step 6 requires the consume to happen inside the same
   * `$transaction` as reference allocation and row creation (A23): a
   * reference-collision retry or a DB blip downstream must not burn a
   * single-use code against the 3-per-hour cap by rolling back everything
   * except this write.
   */
  async consumeCode(tx: Prisma.TransactionClient, id: string): Promise<boolean> {
    const result = await tx.emailVerification.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return result.count === 1;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * The fixed bucket `EmailSendBudget` keys on: `now` truncated down to the
 * start of its {@link OTP_SEND_WINDOW_MS}-wide, epoch-aligned interval. Two
 * calls within the same interval always compute the identical `windowStart`,
 * which is what makes `(email, windowStart)` a stable key for the atomic
 * `INSERT ... ON DUPLICATE KEY UPDATE` in `issueCode` (class doc's recorded
 * fixed-vs-rolling deviation).
 */
function sendBudgetWindowStart(now: Date): Date {
  return new Date(Math.floor(now.getTime() / OTP_SEND_WINDOW_MS) * OTP_SEND_WINDOW_MS);
}

/** CSPRNG 6-digit code (`crypto.randomInt`, rejection-sampled — not `Math.random`). Zero-padded. */
function generateCode(): string {
  return randomInt(0, 10 ** OTP_CODE_LENGTH).toString().padStart(OTP_CODE_LENGTH, '0');
}

/** HMAC-SHA-256 of `code` under the configured secret (V-6) — hex digest. */
function hashCode(code: string): string {
  return createHmac('sha256', getOtpHmacSecret()).update(code).digest('hex');
}

/** Timing-safe hex-digest comparison — both inputs are fixed-length SHA-256 hex digests. */
function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
