/**
 * T-3 — Supersession hook (FR-12, D-20, design.md §5.5).
 *
 * `supersedePendingFor` sets every PENDING request for a set of actors to
 * `SUPERSEDED`, inside the CALLER's own transaction — it never opens its own.
 * "Pending" here is the exact same set `consent-eligibility.ts` blocks a new
 * send on (`QUEUED`, `SENDING`, `FAILED`, or `SENT` with `expiresAt` still in
 * the future): an already-expired `SENT` row keeps its derived *Expired*
 * status as evidence (B-16) and is NEVER touched here, and answered rows
 * (`ACCEPTED`, `DECLINED`) are terminal and never touched either.
 */

import { Injectable } from '@nestjs/common';
import { ConsentRequestStatus, Prisma } from '@prisma/client';

@Injectable()
export class ConsentSupersessionService {
  /**
   * Supersede every pending `ConsentRequest` row for the given actor ids,
   * inside `tx`. A no-op (and no query at all) when `actorIds` is empty, so
   * every call site can pass a possibly-empty array without a guard of its
   * own.
   */
  async supersedePendingFor(tx: Prisma.TransactionClient, actorIds: string[]): Promise<void> {
    if (actorIds.length === 0) {
      return;
    }

    const now = new Date();
    await tx.consentRequest.updateMany({
      where: {
        actorId: { in: actorIds },
        OR: [
          {
            status: {
              in: [
                ConsentRequestStatus.QUEUED,
                ConsentRequestStatus.SENDING,
                ConsentRequestStatus.FAILED,
              ],
            },
          },
          {
            status: ConsentRequestStatus.SENT,
            expiresAt: { gt: now },
          },
        ],
      },
      data: {
        status: ConsentRequestStatus.SUPERSEDED,
        supersededAt: now,
      },
    });
  }
}
