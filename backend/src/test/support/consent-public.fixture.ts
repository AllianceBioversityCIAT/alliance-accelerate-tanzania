/**
 * actors/consent-intake/consent-request-email T-5 — shared fixtures for the
 * public consent-link tests (`consent-public.e2e.spec.ts`, the derived gate in
 * `pii-boundary.spec.ts`): a fully PII-populated `UNKNOWN` actor, deterministic
 * tokens, `ConsentRequest` row builders, and an in-memory Prisma harness whose
 * `$transaction` ROLLS BACK on a throw (so `respond`'s actor-deleted case is
 * proven to leave the request row untouched, not merely to return a 404).
 *
 * The harness is the only fake; everything above Prisma is the real wiring.
 * **Declared gap (NFR-5):** real-MySQL row contention is not exercised here,
 * the same gap chunk 1 declared.
 */

import { createHash } from 'crypto';
import { ConsentMethod, ConsentRequestStatus, ConsentStatus, RegistrationSource } from '@prisma/client';
import { NEVER_PUBLIC_FIELDS } from '../../common/pii-consent.policy';
import { hashConsentToken } from '../../consent-requests/consent-token.util';
import { ConsentRequestMockRow, createConsentRequestMock } from './consent-request.mock';

export const CONSENT_ACTOR_ID = 'consent-actor-1';
/** A second actor, so an Accept in one test can never change the actor another test previews. */
export const CONSENT_ACTOR_2_ID = 'consent-actor-2';
export const CONSENT_TRADER_NAME = 'Consent Fixture Agro Ltd';

/** A 43-character base64url token, deterministic per label (same shape the real minter emits). */
export function consentTokenFor(label: string): string {
  return createHash('sha256').update(`consent-fixture:${label}`).digest('base64url');
}

/**
 * An `UNKNOWN` actor with every `NEVER_PUBLIC_FIELDS` member populated at a
 * distinctive, NON-NULL value (a null value cannot be swept for — searching a
 * body for `null` proves nothing), so a leaked value is caught by value and
 * not only by key. {@link neverPublicValues} enforces this at load time.
 */
export function consentActorFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CONSENT_ACTOR_ID,
    traderId: 'TZ-CONSENT-0042',
    traderName: CONSENT_TRADER_NAME,
    region: 'Morogoro',
    district: 'Kilosa',
    traderType: 'seed_company',
    sex: 'F',
    otherCrops: 'Pigeon pea',
    contactPerson: 'Neema Mushi',
    position: 'Operations Manager',
    marketLocation: 'Morogoro Central Market',
    technicalSupport: 'Needs a threshing machine (consent-fixture)',
    phone: '+255755000111',
    email: 'actor-record@consent-fixture.example',
    capacityTons: 640,
    gpsLatitude: -6.8211,
    gpsLongitude: 37.6616,
    gpsAltitude: 1526.4,
    gpsAccuracy: 13.37,
    consentStatus: ConsentStatus.UNKNOWN,
    registrationSource: RegistrationSource.TEAM_MANAGED,
    consentMethod: ConsentMethod.NOT_RECORDED,
    consentObtainedAt: new Date('2025-11-03T09:15:00.000Z'),
    consentReference: 'FIXTURE-CONSENT-REF-7781',
    crops: [{ crop: { name: 'sorghum' } }, { crop: { name: 'groundnut' } }],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * The string form of every `NEVER_PUBLIC_FIELDS` member's value on `actor`
 * (a `Date` as its ISO string, the form JSON would emit it in), DERIVED from
 * the constant rather than hand-listed, so a field added to it is swept with
 * no second edit. Throws when any value is null/undefined: a sweep for an
 * absent value passes vacuously (KZ-002), so the fixture must populate it.
 */
export function neverPublicValues(actor: Record<string, unknown>): string[] {
  return NEVER_PUBLIC_FIELDS.map((field) => {
    const value = actor[field];
    if (value === null || value === undefined) {
      throw new Error(`fixture actor has no value for never-public field "${field}" — its value sweep would be vacuous`);
    }
    return sweepString(value);
  });
}

function sweepString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value as string | number | boolean | bigint);
}

/** Values that must never reach a public response, by value — one per `NEVER_PUBLIC_FIELDS` member. */
export const CONSENT_NEVER_PUBLIC_VALUES: readonly string[] = neverPublicValues(consentActorFixture());

/** An open (`SENT`, unexpired) request row for `token`; override any column. */
export function consentRowFixture(
  token: string,
  overrides: Partial<ConsentRequestMockRow> = {},
): ConsentRequestMockRow {
  const sentAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return {
    id: `req-${hashConsentToken(token).slice(0, 8)}`,
    actorId: CONSENT_ACTOR_ID,
    traderId: 'TZ-CONSENT-0042',
    traderName: CONSENT_TRADER_NAME,
    status: ConsentRequestStatus.SENT,
    batchId: 'batch-1',
    recipientEmail: 'actor-record@consent-fixture.example',
    editionVersion: 'v1.0',
    editionHash: 'a'.repeat(64),
    requestedBySub: 'admin-sub',
    requestedByEmail: 'admin@example.org',
    createdAt: sentAt,
    claimedAt: sentAt,
    sentAt,
    expiresAt: new Date(sentAt.getTime() + 30 * 24 * 60 * 60 * 1000),
    failureReason: null,
    attempts: 1,
    tokenHash: hashConsentToken(token),
    respondedAt: null,
    respondentName: null,
    respondentPosition: null,
    respondentEmail: null,
    respondentPhone: null,
    respondentIp: null,
    respondentUserAgent: null,
    supersededAt: null,
    ...overrides,
  };
}

type ActorRow = Record<string, unknown>;

/**
 * In-memory Prisma for the public consent routes: `actor` (find/list/count/update),
 * `consentRequest`, `actorAuditLog.create`, and a `$transaction` that restores
 * both tables when its callback throws.
 */
export function buildConsentPublicHarness(
  initialActors: ActorRow[] = [consentActorFixture()],
  initialRequests: ConsentRequestMockRow[] = [],
  opts: { rollback?: boolean } = {},
) {
  // The restore-on-throw rollback below is a SNAPSHOT of the whole table taken
  // at transaction start, so it is only valid for SEQUENTIAL transactions: a
  // concurrent loser would restore over the winner's commit. The race test
  // passes `rollback: false` — its loser writes nothing before it throws.
  const rollback = opts.rollback ?? true;
  let actors: ActorRow[] = initialActors.map((a) => ({ ...a }));
  const requestMock = createConsentRequestMock(initialRequests);
  const auditRows: Array<Record<string, unknown>> = [];

  const actor = {
    findUnique: jest.fn(async (args: { where: { id: string } }) => {
      const found = actors.find((a) => a.id === args.where.id);
      return found ? { ...found } : null;
    }),
    findMany: jest.fn(async (args: { where?: { consentStatus?: string } } = {}) =>
      actors
        .filter((a) => !args.where?.consentStatus || a.consentStatus === args.where.consentStatus)
        .map((a) => ({ ...a })),
    ),
    count: jest.fn(async (args: { where?: { consentStatus?: string } } = {}) =>
      actors.filter((a) => !args.where?.consentStatus || a.consentStatus === args.where.consentStatus).length,
    ),
    update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      const index = actors.findIndex((a) => a.id === args.where.id);
      if (index === -1) throw new Error('record not found');
      actors[index] = { ...actors[index], ...args.data };
      return { ...actors[index] };
    }),
  };

  const actorAuditLog = {
    create: jest.fn(async (args: { data: Record<string, unknown> }) => {
      const row = { id: `audit-${auditRows.length + 1}`, ...args.data };
      auditRows.push(row);
      return row;
    }),
  };

  // The actor-row lock `respond` takes as its first statement
  // (`SELECT id, <consent fields> FROM Actor WHERE id = ? FOR UPDATE`). Returns the
  // locked row's consent columns, or none when the actor is gone — the shape the real driver gives.
  const $queryRaw = jest.fn(async (sql: { values?: unknown[] }) =>
    actors
      .filter((a) => a.id === sql.values?.[0])
      .map((a) => ({
        id: a.id,
        consentStatus: a.consentStatus,
        consentMethod: a.consentMethod,
        consentObtainedAt: a.consentObtainedAt,
        consentReference: a.consentReference,
      })),
  );

  const tx = { actor, consentRequest: requestMock.consentRequest, actorAuditLog, $queryRaw };
  const prisma = {
    actor,
    consentRequest: requestMock.consentRequest,
    actorAuditLog,
    $queryRaw,
    $transaction: jest.fn(async (cb: (client: typeof tx) => Promise<unknown>) => {
      const savedActors = actors.map((a) => ({ ...a }));
      const savedRequests = requestMock.snapshot();
      const savedAudit = auditRows.length;
      try {
        return await cb(tx);
      } catch (error) {
        if (!rollback) throw error;
        actors = savedActors;
        requestMock.restore(savedRequests);
        auditRows.length = savedAudit;
        throw error;
      }
    }),
  };

  return {
    prisma,
    actor,
    actorAuditLog,
    $queryRaw,
    consentRequest: requestMock.consentRequest,
    getActors: (): ActorRow[] => actors,
    getActor: (id: string = CONSENT_ACTOR_ID): ActorRow | undefined => actors.find((a) => a.id === id),
    removeActor: (id: string = CONSENT_ACTOR_ID): void => {
      actors = actors.filter((a) => a.id !== id);
    },
    getRequests: requestMock.getRows,
    addRequest: (row: ConsentRequestMockRow): void => {
      requestMock.getRows().push(row);
    },
    getAuditRows: (): Array<Record<string, unknown>> => auditRows,
    reset: (): void => {
      actors = initialActors.map((a) => ({ ...a }));
      requestMock.reset();
      auditRows.length = 0;
      jest.clearAllMocks();
    },
  };
}
