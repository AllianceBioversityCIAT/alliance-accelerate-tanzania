/**
 * T-3 — `preview` / `enqueue` (design.md §5.1, §5.2 step 1, §6).
 * T-4 — `dispatch` / `retry` / `queue` (design.md §5.2 steps 2-5, §5.3, §7.1).
 *
 * Both `preview` and `enqueue` resolve the target SERVER-SIDE (`{ kind: 'ids'
 * }` or `{ kind: 'filter' }`, via `buildAdminActorWhere` for the latter — the
 * exact same predicate `ActorsAdminService.adminList` uses, so "all
 * matching" means what the table shows, P-30/P-12). `preview` performs no
 * writes at all.
 *
 * **D-25 (design.md §5.2 step 1, amended 2026-10-05).** `enqueue` opens ONE
 * transaction that FIRST locks the targeted `Actor` rows (`SELECT … FOR
 * UPDATE` through parameterized `$queryRaw` — the `ActorSequence` raw-SQL
 * precedent, `actors/trader-id.util.ts`) and only THEN evaluates eligibility
 * — inside that same transaction. A concurrent enqueue targeting the SAME
 * actor(s) blocks on the lock until this transaction commits or rolls back,
 * then re-reads the actor and this call's own just-created row, so it
 * correctly sees "pending" rather than racing to create a second QUEUED row
 * for one actor. `preview` stays lock-free — it opens no transaction at all.
 *
 * `dispatch` is the time-boxed send step (DD-1): it claims one `QUEUED` row
 * at a time with a compare-and-set, re-checks eligibility at claim (actor
 * state can have moved since enqueue), mints a token (DD-3: at dispatch, not
 * enqueue), sends through `MailService`, and writes the result with another
 * compare-and-set — so a row the admin superseded while the send was in
 * flight stays `SUPERSEDED` rather than being overwritten back to `SENT`.
 */

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConsentRequestStatus, ConsentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActingAdminResolver } from '../actors/acting-admin.resolver';
import { ActorAuditService } from '../actors/actor-audit.service';
import { MailService } from '../mail/mail.service';
import { ConsentSupersessionService } from './consent-supersession.service';
import { buildAdminActorWhere } from '../actors/admin-actor-where.util';
import {
  ConsentEligibilityRequest,
  ConsentSkipReason,
  emptyConsentSkipCounts,
  evaluateConsentEligibility,
} from './consent-eligibility';
import { ConsentRequestTargetDto } from './dto/consent-request-send.dto';
import { generateConsentToken, hashConsentToken } from './consent-token.util';
import {
  CURRENT_ADMIN_CONSENT_EDITION,
  computeAdminConsentEditionHash,
} from './admin-consent-policy';

export interface ConsentRequestPreviewResult {
  total: number;
  toSend: number;
  skipped: Record<ConsentSkipReason, number>;
}

export interface ConsentRequestEnqueueResult {
  batchId: string;
  queued: number;
  skipped: Record<ConsentSkipReason, number>;
}

export interface ConsentRequestDispatchResult {
  sent: number;
  failed: number;
  remaining: number;
}

export interface ConsentRequestRetryResult {
  queued: number;
}

export interface ConsentRequestQueueSummary {
  queued: number;
  failed: number;
}

/** The minimal projection this service reads/writes an actor against. */
interface TargetActor {
  id: string;
  traderId: string;
  traderName: string;
  email: string | null;
  consentStatus: ConsentStatus;
}

const TARGET_ACTOR_SELECT = {
  id: true,
  traderId: true,
  traderName: true,
  email: true,
  consentStatus: true,
} satisfies Prisma.ActorSelect;

/**
 * The one projection `dispatch` reads off a claimed `ConsentRequest` row —
 * everything `logConsentRequested`'s snapshot and `MailService.sendConsentRequest`
 * need, nothing the token lives in.
 */
const DISPATCH_ROW_SELECT = {
  id: true,
  actorId: true,
  traderId: true,
  traderName: true,
  recipientEmail: true,
  requestedBySub: true,
  requestedByEmail: true,
} satisfies Prisma.ConsentRequestSelect;

type DispatchRow = Prisma.ConsentRequestGetPayload<{ select: typeof DISPATCH_ROW_SELECT }>;

/**
 * Structural subset of `PrismaService`/`Prisma.TransactionClient` that
 * `resolveTargetActors`/`partitionEligibility` need — lets both `preview`
 * (unlocked, `this.prisma`) and `enqueue` (inside its own `tx`, post-lock)
 * share the exact same eligibility-reading code (design.md §5.1 "the filter
 * changed under the admin" needs both paths to agree on what "eligible"
 * means).
 */
type ConsentRequestsDb = Pick<PrismaService, 'actor' | 'consentRequest'>;

/**
 * T-4 — dispatch's per-step time budget (design.md §5.2, NFR-6). Checked
 * BEFORE every claim, never after (RB-4): a row is never claimed once the
 * budget is spent, so the worst case is this budget PLUS one in-flight
 * send's own bound ({@link import('../mail/mail-timing').MAIL_SEND_TIMEOUT_MS}
 * + {@link import('../mail/mail-timing').MAIL_LOCK_WAIT_TIMEOUT_MS}, additive)
 * plus the pre-send/result DB steps — see design.md §5.2's "Timing" table
 * for the full sum (11.5 s worst case against NFR-6's 12 s ceiling). This
 * file never restates those two mail constants' values — see `mail-timing.ts`'s
 * "single home" rule.
 */
const DISPATCH_CLAIM_BUDGET_MS = 7_500;

/**
 * T-4 — a `SENDING` row older than this has an unknown outcome: the mail may
 * or may not have left (design.md §5.2 step 3). It is marked
 * `FAILED/stale_claim` and never auto-resent; Retry is the admin's explicit
 * act.
 */
const STALE_CLAIM_THRESHOLD_MS = 2 * 60 * 1000;

/** FR-8 — a sent link is valid for 30 days. */
const CONSENT_LINK_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class ConsentRequestsService {
  private readonly logger = new Logger(ConsentRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly actingAdminResolver: ActingAdminResolver,
    private readonly consentSupersessionService: ConsentSupersessionService,
    private readonly actorAuditService: ActorAuditService,
    private readonly mailService: MailService,
  ) {}

  /** No writes at all — pure read + the same eligibility rule `enqueue` uses. */
  async preview(
    target: ConsentRequestTargetDto,
    scope: 'single' | 'bulk',
  ): Promise<ConsentRequestPreviewResult> {
    this.assertScopeTargetConsistency(target, scope);
    const actors = await this.resolveTargetActors(this.prisma, target);
    const { eligible, skipped } = await this.partitionEligibility(this.prisma, actors, scope);
    return { total: actors.length, toSend: eligible.length, skipped };
  }

  async enqueue(
    target: ConsentRequestTargetDto,
    scope: 'single' | 'bulk',
    actingSub: string,
  ): Promise<ConsentRequestEnqueueResult> {
    this.assertScopeTargetConsistency(target, scope);
    const batchId = randomUUID();

    // D-25 — resolved WITHOUT a lock: for `kind: 'ids'` these ARE the ids
    // (no read needed at all); for `kind: 'filter'` this is an ordinary,
    // unlocked read of whichever actors match right now. Either way, the
    // ACTUAL eligibility decision happens only after the lock below, inside
    // the same transaction.
    const candidateIds = await this.resolveTargetActorIds(this.prisma, target);

    if (candidateIds.length === 0) {
      return { batchId, queued: 0, skipped: emptyConsentSkipCounts() };
    }

    const acting = await this.resolveActing(actingSub);
    const edition = CURRENT_ADMIN_CONSENT_EDITION;
    const editionHash = computeAdminConsentEditionHash(edition);

    return this.prisma.$transaction(async (tx) => {
      // The lock runs FIRST, inside this transaction, before any eligibility
      // read (design.md §5.2 step 1, amended 2026-10-05): a concurrent
      // enqueue targeting the same actor(s) blocks here until this
      // transaction commits or rolls back, then re-reads and correctly sees
      // this call's own write as a pending request.
      await this.lockActorRows(tx, candidateIds);

      const actors = await tx.actor.findMany({
        where: { id: { in: candidateIds } },
        select: TARGET_ACTOR_SELECT,
      });

      const { eligible, skipped } = await this.partitionEligibility(tx, actors, scope);

      if (eligible.length === 0) {
        return { batchId, queued: 0, skipped };
      }

      // FR-3 "resend supersedes" — a single-scope enqueue supersedes any
      // pending request for this actor FIRST, inside this same transaction.
      if (scope === 'single') {
        await this.consentSupersessionService.supersedePendingFor(
          tx,
          eligible.map((actor) => actor.id),
        );
      }

      await tx.consentRequest.createMany({
        data: eligible.map((actor) => ({
          actorId: actor.id,
          traderId: actor.traderId,
          traderName: actor.traderName,
          batchId,
          recipientEmail: actor.email as string,
          editionVersion: edition.version,
          editionHash,
          requestedBySub: acting.sub,
          requestedByEmail: acting.email ?? null,
        })),
      });

      return { batchId, queued: eligible.length, skipped };
    });
  }

  /**
   * T-4 — the time-boxed send step (design.md §5.2 steps 2-3, DD-1, DD-2,
   * NFR-6). Runs a stale-claim sweep first, then claims and sends `QUEUED`
   * rows one at a time until the time budget is spent or nothing is left.
   */
  async dispatch({ batchId }: { batchId?: string } = {}): Promise<ConsentRequestDispatchResult> {
    const startedAt = Date.now();
    await this.sweepStaleClaims(new Date(startedAt));

    let sent = 0;
    let failed = 0;

    for (;;) {
      if (Date.now() - startedAt >= DISPATCH_CLAIM_BUDGET_MS) {
        break;
      }

      const next: DispatchRow | null = await this.prisma.consentRequest.findFirst({
        where: { status: ConsentRequestStatus.QUEUED, ...(batchId ? { batchId } : {}) },
        orderBy: { createdAt: 'asc' },
        select: DISPATCH_ROW_SELECT,
      });

      if (!next) {
        break;
      }

      const outcome = await this.claimAndSendOne(next);
      if (outcome === 'sent') sent += 1;
      if (outcome === 'failed') failed += 1;
      // 'claimed-by-other' and 'superseded' are neither — the row moved
      // under us (another dispatch call, a resend, or an admin edit) and is
      // left exactly as that other write left it.
    }

    const remaining = await this.prisma.consentRequest.count({
      where: { status: ConsentRequestStatus.QUEUED, ...(batchId ? { batchId } : {}) },
    });

    const elapsedMs = Date.now() - startedAt;
    // NFR-1 — this line is the whole of what dispatch logs (design.md §10
    // Observability): counts and timing only, never a token or an address.
    this.logger.log(
      `consent-request dispatch batchId=${batchId ?? 'all'} sent=${sent} failed=${failed} remaining=${remaining} elapsedMs=${elapsedMs}`,
    );

    return { sent, failed, remaining };
  }

  /**
   * Claim one row, re-check eligibility, send, and CAS the result. Isolated
   * into its own method so `dispatch`'s loop body stays readable — this is
   * still one call to `ConsentRequestsService.dispatch` as far as the FR-13
   * write-site sweep (design.md §5.8) is concerned, since it is private and
   * has no other caller.
   */
  private async claimAndSendOne(
    row: DispatchRow,
  ): Promise<'sent' | 'failed' | 'superseded' | 'claimed-by-other'> {
    const claimedAt = new Date();
    const token = generateConsentToken();
    const tokenHash = hashConsentToken(token);

    // Claim: compare-and-set from QUEUED, minting and storing the token in
    // the SAME write (design.md §5.2 steps 2.2/2.4 combined — harmless to
    // combine since a token that turns out unused, because the claim-time
    // eligibility recheck below fails, is simply discarded: the row's
    // status, not the presence of a hash, is what makes a link usable).
    const claim = await this.prisma.consentRequest.updateMany({
      where: { id: row.id, status: ConsentRequestStatus.QUEUED },
      data: {
        status: ConsentRequestStatus.SENDING,
        claimedAt,
        attempts: { increment: 1 },
        tokenHash,
      },
    });
    if (claim.count === 0) {
      // Another dispatch call claimed it first, or it was superseded while
      // still QUEUED (FR-6 scenario 2) — send nothing.
      return 'claimed-by-other';
    }

    // Re-check eligibility AT CLAIM TIME (design.md §5.2 step 2.3, B-3):
    // actor state can have moved since enqueue (a re-grant, a corrected
    // email, a deletion).
    const actor = await this.prisma.actor.findUnique({
      where: { id: row.actorId },
      select: { consentStatus: true, email: true },
    });
    const stillEligible =
      actor !== null &&
      actor.consentStatus !== ConsentStatus.GRANTED &&
      actor.email === row.recipientEmail;

    if (!stillEligible) {
      await this.prisma.consentRequest.updateMany({
        where: { id: row.id, status: ConsentRequestStatus.SENDING },
        data: { status: ConsentRequestStatus.SUPERSEDED, supersededAt: new Date() },
      });
      return 'superseded';
    }

    try {
      await this.mailService.sendConsentRequest(row.recipientEmail, token, row.traderName);
    } catch (err) {
      const updated = await this.prisma.consentRequest.updateMany({
        where: { id: row.id, status: ConsentRequestStatus.SENDING },
        data: { status: ConsentRequestStatus.FAILED, failureReason: classifyDispatchFailure(err) },
      });
      // count === 0 — an admin superseded this row while the send was in
      // flight. It stays SUPERSEDED; the failure is simply not recorded.
      return updated.count === 1 ? 'failed' : 'superseded';
    }

    const sentAt = new Date();
    const expiresAt = new Date(sentAt.getTime() + CONSENT_LINK_VALIDITY_MS);

    // Result write is ALSO a compare-and-set (design.md §5.2 step 2.6, B-2):
    // a count of 0 means an admin superseded this row mid-send (it was in
    // SENDING, which `supersedePendingFor`'s status set includes). The mail
    // may have already left, but the row stays SUPERSEDED — the link is
    // dead regardless (lookup requires status SENT) — and NO audit row is
    // written, in the SAME transaction as the status write so the two can
    // never disagree.
    const resultCount = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.consentRequest.updateMany({
        where: { id: row.id, status: ConsentRequestStatus.SENDING },
        data: { status: ConsentRequestStatus.SENT, sentAt, expiresAt },
      });
      if (updated.count === 1) {
        await this.actorAuditService.logConsentRequested(tx, row);
      }
      return updated.count;
    });

    return resultCount === 1 ? 'sent' : 'superseded';
  }

  /**
   * T-4 — stale-claim sweep (design.md §5.2 step 3), run at the start of
   * EVERY `dispatch` call, before the claim loop. A `SENDING` row whose
   * `claimedAt` is older than {@link STALE_CLAIM_THRESHOLD_MS} has an
   * unknown outcome and is marked `FAILED/stale_claim` — never resent
   * automatically; Retry is the admin's explicit act.
   */
  private async sweepStaleClaims(now: Date): Promise<void> {
    const staleBefore = new Date(now.getTime() - STALE_CLAIM_THRESHOLD_MS);
    await this.prisma.consentRequest.updateMany({
      where: { status: ConsentRequestStatus.SENDING, claimedAt: { lt: staleBefore } },
      data: { status: ConsentRequestStatus.FAILED, failureReason: 'stale_claim' },
    });
  }

  /**
   * `retry({ batchId? })` (design.md §5.2 step 4) — `FAILED → QUEUED` (all
   * batches when `batchId` is omitted), clearing `tokenHash` so a resent
   * email mints and stores a brand-new one (DD-3). Eligibility is re-checked
   * again at claim (the same {@link claimAndSendOne} step), never here.
   */
  async retry({ batchId }: { batchId?: string } = {}): Promise<ConsentRequestRetryResult> {
    const updated = await this.prisma.consentRequest.updateMany({
      where: { status: ConsentRequestStatus.FAILED, ...(batchId ? { batchId } : {}) },
      data: { status: ConsentRequestStatus.QUEUED, tokenHash: null },
    });
    return { queued: updated.count };
  }

  /** `GET .../queue` (design.md §5.2 step 5) — across ALL batches, for the resume banner (FR-4). */
  async queue(): Promise<ConsentRequestQueueSummary> {
    const [queued, failed] = await Promise.all([
      this.prisma.consentRequest.count({ where: { status: ConsentRequestStatus.QUEUED } }),
      this.prisma.consentRequest.count({ where: { status: ConsentRequestStatus.FAILED } }),
    ]);
    return { queued, failed };
  }

  /**
   * Resolve the target's actors, load their existing requests, and partition
   * by {@link evaluateConsentEligibility} (FR-2). Shared by `preview` and
   * `enqueue` (over either `this.prisma`, unlocked, or `tx`, post-lock) so a
   * confirm-time count and an enqueue-time count can never silently diverge.
   */
  private async partitionEligibility(
    db: ConsentRequestsDb,
    actors: readonly TargetActor[],
    scope: 'single' | 'bulk',
  ): Promise<{ eligible: TargetActor[]; skipped: Record<ConsentSkipReason, number> }> {
    const actorIds = actors.map((actor) => actor.id);

    const requests =
      actorIds.length > 0
        ? await db.consentRequest.findMany({
            where: { actorId: { in: actorIds } },
            select: { actorId: true, status: true, expiresAt: true, createdAt: true },
          })
        : [];

    const requestsByActor = new Map<string, ConsentEligibilityRequest[]>();
    for (const request of requests) {
      const list = requestsByActor.get(request.actorId) ?? [];
      list.push(request);
      requestsByActor.set(request.actorId, list);
    }

    const skipped = emptyConsentSkipCounts();
    const eligible: TargetActor[] = [];

    for (const actor of actors) {
      const outcome = evaluateConsentEligibility(
        { email: actor.email, consentStatus: actor.consentStatus },
        requestsByActor.get(actor.id) ?? [],
        scope,
      );
      if (outcome === 'eligible') {
        eligible.push(actor);
      } else {
        skipped[outcome] += 1;
      }
    }

    return { eligible, skipped };
  }

  /** Full-select resolution of a target's CURRENT matching actors (used by `preview` only). */
  private async resolveTargetActors(
    db: ConsentRequestsDb,
    target: ConsentRequestTargetDto,
  ): Promise<TargetActor[]> {
    const where: Prisma.ActorWhereInput =
      target.kind === 'ids'
        ? { id: { in: target.ids ?? [] } }
        : buildAdminActorWhere(target.filter ?? {});

    return db.actor.findMany({ where, select: TARGET_ACTOR_SELECT });
  }

  /**
   * D-25 — the ids `enqueue` will lock. For `kind: 'ids'` these are the
   * given ids directly (no read at all — the lock's own `WHERE id IN (…)`
   * harmlessly matches nothing for an id that does not exist). For `kind:
   * 'filter'` this is an UNLOCKED id-only read; which rows actually get
   * created is still decided by the eligibility read taken AFTER the lock.
   */
  private async resolveTargetActorIds(
    db: ConsentRequestsDb,
    target: ConsentRequestTargetDto,
  ): Promise<string[]> {
    if (target.kind === 'ids') {
      return target.ids ?? [];
    }
    const where = buildAdminActorWhere(target.filter ?? {});
    const rows = await db.actor.findMany({ where, select: { id: true } });
    return rows.map((row) => row.id);
  }

  /**
   * D-25 — `SELECT id FROM Actor WHERE id IN (…) FOR UPDATE`, parameterized
   * via `Prisma.sql`/`Prisma.join` (the `ActorSequence` raw-SQL precedent,
   * `actors/trader-id.util.ts`). Row locks, not a table lock: only the
   * targeted actors block a concurrent enqueue; every other actor's
   * enqueue proceeds unaffected.
   */
  private async lockActorRows(tx: Prisma.TransactionClient, actorIds: string[]): Promise<void> {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM Actor WHERE id IN (${Prisma.join(actorIds)}) FOR UPDATE`);
  }

  private async resolveActing(actingSub: string): Promise<{ sub: string; email: string | null }> {
    const email = await this.actingAdminResolver.resolve(actingSub);
    return { sub: actingSub, email };
  }

  /** `scope: 'single'` is one actor only (FR-2: the decliner/pending rules are bulk-only, API-enforced). */
  private assertScopeTargetConsistency(
    target: ConsentRequestTargetDto,
    scope: 'single' | 'bulk',
  ): void {
    if (scope !== 'single') {
      return;
    }
    const isExactlyOneId =
      target.kind === 'ids' && Array.isArray(target.ids) && target.ids.length === 1;
    if (!isExactlyOneId) {
      const message = 'scope "single" requires target.kind "ids" with exactly one id';
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message,
        details: [{ field: 'scope', message }],
      });
    }
  }
}

/**
 * T-4 — a non-PII failure code for `ConsentRequest.failureReason` (NFR-1,
 * FR-7's "no log carries the token or address" extended to the stored
 * reason too: a transport error's own `message` can carry the recipient
 * address, so it is NEVER persisted — only this coarse classification is).
 */
function classifyDispatchFailure(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  return /timeout/i.test(name) ? 'timeout' : 'transport_rejected';
}
