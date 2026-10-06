/**
 * T-3 (actors/consent-intake/consent-request-email) — a minimal in-memory
 * `consentRequest` Prisma delegate for e2e harnesses, the same way chunk 1's
 * `actor-sequence.mock.ts` extended the existing Prisma mock for a new
 * model. Supports exactly the query shapes `ConsentSupersessionService` and
 * `ConsentRequestsService` issue: `findMany` by `actorId.in`, `createMany`,
 * and `updateMany` with an `actorId.in` + `OR[{status.in}, {status, expiresAt.gt}]`
 * where clause.
 */

export interface ConsentRequestMockRow {
  id: string;
  actorId: string;
  traderId: string;
  traderName: string;
  status: string;
  batchId: string;
  recipientEmail: string;
  editionVersion: string;
  editionHash: string;
  requestedBySub: string;
  requestedByEmail: string | null;
  createdAt: Date;
  claimedAt: Date | null;
  sentAt: Date | null;
  expiresAt: Date | null;
  failureReason: string | null;
  attempts: number;
  tokenHash: string | null;
  respondedAt: Date | null;
  respondentName: string | null;
  respondentPosition: string | null;
  respondentEmail: string | null;
  respondentPhone: string | null;
  respondentIp: string | null;
  respondentUserAgent: string | null;
  supersededAt: Date | null;
}

type WhereClause = Record<string, unknown>;

function matchesClause(row: Record<string, unknown>, clause: WhereClause): boolean {
  return Object.entries(clause).every(([key, cond]) => {
    if (key === 'OR') {
      return (cond as WhereClause[]).some((sub) => matchesClause(row, sub));
    }
    const value = row[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      const condObj = cond as Record<string, unknown>;
      if ('in' in condObj) {
        return (condObj.in as unknown[]).includes(value);
      }
      if ('gt' in condObj) {
        if (value == null) return false;
        const valueTime = (value instanceof Date ? value : new Date(value as string)).getTime();
        const gtTime = (condObj.gt as Date).getTime();
        return valueTime > gtTime;
      }
      return false;
    }
    return value === cond;
  });
}

function defaultRow(overrides: Partial<ConsentRequestMockRow>): ConsentRequestMockRow {
  return {
    id: 'consent-req-default',
    actorId: '',
    traderId: '',
    traderName: '',
    status: 'QUEUED',
    batchId: '',
    recipientEmail: '',
    editionVersion: '',
    editionHash: '',
    requestedBySub: '',
    requestedByEmail: null,
    createdAt: new Date(),
    claimedAt: null,
    sentAt: null,
    expiresAt: null,
    failureReason: null,
    attempts: 0,
    tokenHash: null,
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

export function createConsentRequestMock(initial: ConsentRequestMockRow[] = []) {
  let rows = initial.map((r) => ({ ...r }));
  let seq = 0;

  function nextId(): string {
    seq += 1;
    return `consent-req-mock-${String(seq).padStart(4, '0')}`;
  }

  const consentRequest = {
    findMany: jest.fn(async (args: { where?: WhereClause } = {}) =>
      rows.filter((r) => matchesClause(r, args.where ?? {})),
    ),
    createMany: jest.fn(async (args: { data: Array<Partial<ConsentRequestMockRow>> }) => {
      const created = args.data.map((d) => defaultRow({ id: nextId(), ...d }));
      rows.push(...created);
      return { count: created.length };
    }),
    updateMany: jest.fn(async (args: { where?: WhereClause; data: Partial<ConsentRequestMockRow> }) => {
      let count = 0;
      rows = rows.map((r) => {
        if (matchesClause(r, args.where ?? {})) {
          count += 1;
          return { ...r, ...args.data };
        }
        return r;
      });
      return { count };
    }),
  };

  return {
    consentRequest,
    getRows: (): ConsentRequestMockRow[] => rows,
    reset: (): void => {
      rows = initial.map((r) => ({ ...r }));
      seq = 0;
    },
  };
}
