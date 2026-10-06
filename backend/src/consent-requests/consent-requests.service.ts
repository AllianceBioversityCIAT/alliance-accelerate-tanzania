/**
 * T-3 — `preview` / `enqueue` (design.md §5.1, §5.2 step 1, §6).
 *
 * Both resolve the target SERVER-SIDE (`{ kind: 'ids' }` or
 * `{ kind: 'filter' }`, via `buildAdminActorWhere` for the latter — the exact
 * same predicate `ActorsAdminService.adminList` uses, so "all matching" means
 * what the table shows, P-30/P-12). `preview` performs no writes at all.
 * `enqueue` opens ONE transaction: for `scope: 'single'` it first supersedes
 * any pending request for the (single) eligible actor, then `createMany`s the
 * `QUEUED` rows, snapshotting the recipient email, trader id/name, and the
 * CURRENT admin consent edition + its hash.
 *
 * Dispatch (sending the mail, minting the token) is T-4's job — this task
 * only persists durable, auditable intent (design.md §5.2 step 1).
 */

import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConsentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActingAdminResolver } from '../actors/acting-admin.resolver';
import { ConsentSupersessionService } from './consent-supersession.service';
import { buildAdminActorWhere } from '../actors/admin-actor-where.util';
import {
  ConsentEligibilityRequest,
  ConsentSkipReason,
  emptyConsentSkipCounts,
  evaluateConsentEligibility,
} from './consent-eligibility';
import { ConsentRequestTargetDto } from './dto/consent-request-send.dto';
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

@Injectable()
export class ConsentRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actingAdminResolver: ActingAdminResolver,
    private readonly consentSupersessionService: ConsentSupersessionService,
  ) {}

  /** No writes at all — pure read + the same eligibility rule `enqueue` uses. */
  async preview(
    target: ConsentRequestTargetDto,
    scope: 'single' | 'bulk',
  ): Promise<ConsentRequestPreviewResult> {
    this.assertScopeTargetConsistency(target, scope);
    const { eligible, skipped, total } = await this.evaluateTarget(target, scope);
    return { total, toSend: eligible.length, skipped };
  }

  async enqueue(
    target: ConsentRequestTargetDto,
    scope: 'single' | 'bulk',
    actingSub: string,
  ): Promise<ConsentRequestEnqueueResult> {
    this.assertScopeTargetConsistency(target, scope);
    const { eligible, skipped } = await this.evaluateTarget(target, scope);
    const batchId = randomUUID();

    if (eligible.length === 0) {
      return { batchId, queued: 0, skipped };
    }

    const acting = await this.resolveActing(actingSub);
    const edition = CURRENT_ADMIN_CONSENT_EDITION;
    const editionHash = computeAdminConsentEditionHash(edition);

    await this.prisma.$transaction(async (tx) => {
      // FR-3 "resend supersedes" — a single-scope enqueue supersedes any
      // pending request for this actor FIRST, inside this same transaction
      // (design.md §5.2 step 1).
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
    });

    return { batchId, queued: eligible.length, skipped };
  }

  /**
   * Resolve the target's actors, load their existing requests, and partition
   * by {@link evaluateConsentEligibility} (FR-2). Shared by `preview` and
   * `enqueue` so a confirm-time count and an enqueue-time count can never
   * silently diverge (design.md §5.1 "the filter changed under the admin").
   */
  private async evaluateTarget(
    target: ConsentRequestTargetDto,
    scope: 'single' | 'bulk',
  ): Promise<{ eligible: TargetActor[]; skipped: Record<ConsentSkipReason, number>; total: number }> {
    const actors = await this.resolveTargetActors(target);
    const actorIds = actors.map((actor) => actor.id);

    const requests =
      actorIds.length > 0
        ? await this.prisma.consentRequest.findMany({
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

    return { eligible, skipped, total: actors.length };
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

  private async resolveTargetActors(target: ConsentRequestTargetDto): Promise<TargetActor[]> {
    const where: Prisma.ActorWhereInput =
      target.kind === 'ids'
        ? { id: { in: target.ids ?? [] } }
        : buildAdminActorWhere(target.filter ?? {});

    return this.prisma.actor.findMany({ where, select: TARGET_ACTOR_SELECT });
  }

  private async resolveActing(actingSub: string): Promise<{ sub: string; email: string | null }> {
    const email = await this.actingAdminResolver.resolve(actingSub);
    return { sub: actingSub, email };
  }
}
