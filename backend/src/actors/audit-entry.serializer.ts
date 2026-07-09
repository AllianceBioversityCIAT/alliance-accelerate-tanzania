// @sdd-spec admin/actor-crud-audit (T-4)
/**
 * T-4 — Audit-entry API serializer.
 *
 * Maps a raw `ActorAuditLog` row to the Admin-only history response shape.
 * The `changes` JSON is passed through unchanged (it is already a shaped
 * diff/snapshot envelope). `createdAt` is exposed as an ISO-8601 string so the
 * response is deterministic and client-friendly (FR-7, NFR-1).
 *
 * Design refs: `docs/specs/admin/actor-crud-audit/design.md` §3.
 */

import { ActorAuditAction, ActorAuditLog } from '@prisma/client';

/** API response shape for one actor audit entry. */
export interface AuditEntry {
  id: string;
  actorId: string;
  traderId: string;
  traderName: string;
  action: ActorAuditAction;
  actingSub: string;
  actingEmail: string | null;
  changes: unknown;
  acknowledged: boolean | null;
  createdAt: string;
}

/**
 * Project a raw `ActorAuditLog` row onto the API response shape.
 *
 * `changes` is returned as-is; `createdAt` is formatted to ISO string.
 */
export function toAuditEntry(log: ActorAuditLog): AuditEntry {
  return {
    id: log.id,
    actorId: log.actorId,
    traderId: log.traderId,
    traderName: log.traderName,
    action: log.action,
    actingSub: log.actingSub,
    actingEmail: log.actingEmail,
    changes: log.changes,
    acknowledged: log.acknowledged,
    createdAt: log.createdAt.toISOString(),
  };
}
