/**
 * actors/consent-intake/consent-request-email T-5 — the two public,
 * token-bearer operations behind `POST /api/v1/consent/view` and
 * `POST /api/v1/consent/respond` (design.md §5.3, §5.4; FR-8…FR-12,
 * NFR-1…NFR-5).
 *
 * **This is an unauthenticated write to `Actor.consentStatus`** — the one
 * route to `GRANTED` that bypasses the admin acknowledgement, by design
 * (FR-10, ADR candidate DD-13). Everything below is shaped around that.
 *
 * **One miss, byte-identical (FR-11, NFR-2).** Unknown, malformed, expired,
 * already-answered, superseded and actor-deleted all throw
 * {@link buildConsentLinkNotFoundError}, on BOTH endpoints. Every miss in
 * this file goes through that one constant-body helper — there is no second
 * `NotFoundException` in the file and none may be added (the registrations
 * `buildLookupNotFoundError` discipline). The token is never shape-checked
 * here either: any non-string, any length, any alphabet hashes (or fails to)
 * into the same miss, so format is never a `400`.
 *
 * **Lookup** is `findUnique({ tokenHash })` on `sha256(token)` — constant
 * cost, no comparison loop to time (design.md §5.3). The raw token lives in
 * this call's stack frame only: it is never logged, audited, stored or
 * echoed (NFR-1). Nothing in this file passes a token, an address or any
 * respondent field to a `Logger`.
 *
 * **`view`** projects the actor through `toPublicDetail` AS IF `GRANTED`
 * (B-1, P-13, DD-11): the preview must show exactly what accepting would
 * publish, and `publicGps` nulls coordinates for a non-`GRANTED` actor, so
 * the consent status is overridden in the object handed to the serializer —
 * never in the database. The actor is loaded with the same `crops` include
 * `ActorsService.findOnePublic` uses (RB-6) so the two projections agree.
 * No `NEVER_PUBLIC_FIELDS` member can appear: the serializer never names one.
 *
 * **`respond`** is ONE transaction (NFR-5). (0) lock the actor row
 * (`SELECT … FOR UPDATE`, the transaction's FIRST statement; the
 * `tokenHash → actorId` routing read happens before it opens) before touching the request row, the same order as
 * enqueue and the admin update, so no two can deadlock; a deleted actor means
 * the uniform miss and nothing written; (1) compare-and-set the request
 * out of `SENT` — `where` names `status: SENT` and an unexpired `expiresAt`,
 * so an answered row can never match (§5.8: no write's status set contains
 * `ACCEPTED`/`DECLINED`) and two concurrent answers yield exactly one count
 * of 1; (2) take `before` from the locked row (no second read of the
 * actor); (3) update the actor — Accept sets `GRANTED / EMAIL_LINK /
 * respondedAt / request id`, Decline sets `DENIED` only; the respondent's
 * email and phone are evidence on the request row and are NEVER written to
 * the actor; (4) write the sentinel-authored audit row. Any throw rolls all
 * four back together.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConsentMethod, ConsentRequestStatus, ConsentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActorAuditService, ConsentFieldsSnapshot } from '../actors/actor-audit.service';
import { PublicActorDetail, toPublicDetail } from '../common/role-aware.serializer';
import { AdminConsentEdition, getAdminConsentEdition } from './admin-consent-policy';
import { hashConsentToken } from './consent-token.util';
import { ConsentDecision, ConsentRespondentDto } from './dto/consent-public.dto';

/** `ConsentRequest.respondentIp` / `respondentUserAgent` column widths. */
const MAX_IP_LENGTH = 45;
const MAX_USER_AGENT_LENGTH = 512;

/** The same `crops.crop` include `ActorsService.findOnePublic` uses (RB-6). */
const CROPS_INCLUDE = {
  crops: { include: { crop: true } },
} satisfies Prisma.ActorInclude;

const VIEW_REQUEST_SELECT = {
  id: true,
  actorId: true,
  traderName: true,
  editionVersion: true,
  expiresAt: true,
} satisfies Prisma.ConsentRequestSelect;

/** The consent columns the locking `SELECT` returns for the actor row (raw driver values). */
interface ActorConsentRow {
  id: string;
  consentStatus: string;
  consentMethod: string;
  consentObtainedAt: Date | string | null;
  consentReference: string | null;
}

/** The one fixed `404` every miss shares. The body never varies by cause. */
export function buildConsentLinkNotFoundError(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    error: 'Not Found',
    message: 'This consent link is no longer valid.',
  });
}

export interface ConsentViewResult {
  organization: string;
  record: PublicActorDetail;
  edition: Pick<AdminConsentEdition, 'version' | 'sections' | 'acceptanceStatement'>;
  expiresAt: string;
}

export interface ConsentRespondInput {
  token: unknown;
  decision: ConsentDecision;
  respondent?: ConsentRespondentDto;
}

/** Request metadata captured as evidence; both may be absent. */
export interface ConsentRespondMeta {
  ip?: string | null;
  userAgent?: string | null;
}

function clip(value: string | null | undefined, max: number): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return value.length > max ? value.slice(0, max) : value;
}

@Injectable()
export class ConsentPublicService {
  private readonly logger = new Logger(ConsentPublicService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: ActorAuditService,
  ) {}

  /** `POST /api/v1/consent/view` — design.md §5.4. */
  async view(token: unknown): Promise<ConsentViewResult> {
    if (typeof token !== 'string' || token.length === 0) {
      throw buildConsentLinkNotFoundError();
    }

    const now = new Date();
    const request = await this.prisma.consentRequest.findUnique({
      where: { tokenHash: hashConsentToken(token) },
      select: { ...VIEW_REQUEST_SELECT, status: true },
    });
    if (
      !request ||
      request.status !== ConsentRequestStatus.SENT ||
      !request.expiresAt ||
      request.expiresAt.getTime() <= now.getTime()
    ) {
      throw buildConsentLinkNotFoundError();
    }

    const actor = await this.prisma.actor.findUnique({
      where: { id: request.actorId },
      include: CROPS_INCLUDE,
    });
    if (!actor) {
      throw buildConsentLinkNotFoundError();
    }

    const edition = getAdminConsentEdition(request.editionVersion);
    if (!edition) {
      // The registry is append-only, so this cannot happen; if it ever does
      // the visitor still gets the uniform miss, and the operator gets the
      // request id (never the token) to find it by.
      this.logger.error(`consent request ${request.id} names an unregistered edition`);
      throw buildConsentLinkNotFoundError();
    }

    return {
      organization: request.traderName,
      record: toPublicDetail({ ...actor, consentStatus: ConsentStatus.GRANTED }),
      edition: {
        version: edition.version,
        sections: edition.sections,
        acceptanceStatement: edition.acceptanceStatement,
      },
      expiresAt: request.expiresAt.toISOString(),
    };
  }

  /** `POST /api/v1/consent/respond` — design.md §5.4. Returns `{ decision }` only. */
  async respond(
    input: ConsentRespondInput,
    meta: ConsentRespondMeta = {},
  ): Promise<{ decision: ConsentDecision }> {
    const { token, decision } = input;
    if (typeof token !== 'string' || token.length === 0) {
      throw buildConsentLinkNotFoundError();
    }
    const tokenHash = hashConsentToken(token);
    const accepted = decision === 'ACCEPT';
    const respondent = accepted ? input.respondent : undefined;
    if (accepted && !respondent) {
      // Unreachable through the controller (the DTO requires it); a direct
      // caller still cannot record an Accept without an identity (FR-9).
      throw buildConsentLinkNotFoundError();
    }

    // Routing only, OUTSIDE the transaction: which actor row does this token
    // point at? The CAS below still re-validates tokenHash + SENT + expiry,
    // so a stale answer here can only cost a miss, never a wrong write. It
    // MUST NOT be a read inside the transaction: under InnoDB REPEATABLE
    // READ the first non-locking read fixes the snapshot every later plain
    // read sees, so the FIRST statement inside has to be the locking one.
    const located = await this.prisma.consentRequest.findUnique({
      where: { tokenHash },
      select: { actorId: true },
    });
    if (!located) {
      throw buildConsentLinkNotFoundError();
    }

    const requestId = await this.prisma.$transaction(async (tx) => {
      const respondedAt = new Date();

      // (0) Lock the ACTOR row, as the transaction's FIRST statement
      // (design.md §5.4 step 0, amended 2026-10-06). Enqueue (D-25) and the
      // admin update (D-26) lock the actor before anything else; taking the
      // request row first here would be the opposite order, and two such
      // transactions deadlock into an unmapped 500 that breaks the
      // uniform-miss contract. The locking SELECT also returns the consent
      // fields, so `before` is the row as it is NOW, after any concurrent
      // admin commit — a locking read sees the latest committed row.
      const locked = await tx.$queryRaw<ActorConsentRow[]>(
        Prisma.sql`SELECT id, consentStatus, consentMethod, consentObtainedAt, consentReference FROM Actor WHERE id = ${located.actorId} FOR UPDATE`,
      );
      if (!Array.isArray(locked) || locked.length === 0) {
        throw buildConsentLinkNotFoundError();
      }
      const before: ConsentFieldsSnapshot = {
        consentStatus: locked[0].consentStatus,
        consentMethod: locked[0].consentMethod,
        consentObtainedAt: locked[0].consentObtainedAt,
        consentReference: locked[0].consentReference,
      };

      // (1) CAS. `status: SENT` + an unexpired `expiresAt` is the ONLY way
      // in; an answered, superseded, expired or unknown row matches nothing.
      const cas = await tx.consentRequest.updateMany({
        where: {
          tokenHash,
          status: ConsentRequestStatus.SENT,
          expiresAt: { gt: respondedAt },
        },
        data: {
          status: accepted ? ConsentRequestStatus.ACCEPTED : ConsentRequestStatus.DECLINED,
          respondedAt,
          respondentName: respondent?.name ?? null,
          respondentPosition: respondent?.position ?? null,
          respondentEmail: respondent?.email ?? null,
          respondentPhone: respondent?.phone ?? null,
          respondentIp: clip(meta.ip, MAX_IP_LENGTH),
          respondentUserAgent: clip(meta.userAgent, MAX_USER_AGENT_LENGTH),
        },
      });
      if (cas.count === 0) {
        throw buildConsentLinkNotFoundError();
      }

      // We own the row now (the CAS holds its lock until commit).
      const request = await tx.consentRequest.findUnique({
        where: { tokenHash },
        select: { id: true, actorId: true, traderId: true, traderName: true },
      });
      if (!request) {
        throw buildConsentLinkNotFoundError();
      }

      // (2) The actor check is the locking read above: no row means the
      // actor is gone, which is the uniform miss and a full rollback.

      // (3) Actor update. Respondent email/phone are NEVER written here.
      const acceptData = {
        consentStatus: ConsentStatus.GRANTED,
        consentMethod: ConsentMethod.EMAIL_LINK,
        consentObtainedAt: respondedAt,
        consentReference: request.id,
      } satisfies Prisma.ActorUpdateInput;
      const declineData = { consentStatus: ConsentStatus.DENIED } satisfies Prisma.ActorUpdateInput;
      const after: ConsentFieldsSnapshot = accepted ? acceptData : { ...before, ...declineData };

      await tx.actor.update({
        where: { id: request.actorId },
        data: accepted ? acceptData : declineData,
      });

      // (4) Sentinel-authored audit row, in the same transaction.
      await this.audit.logConsentResponded(tx, { request, before, after });

      return request.id;
    });

    // Request id and decision only — never a token, address or respondent field.
    this.logger.log(`consent response recorded request=${requestId} decision=${decision}`);
    return { decision };
  }
}
