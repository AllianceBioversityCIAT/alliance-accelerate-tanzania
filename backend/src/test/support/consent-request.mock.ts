/**
 * T-3 (actors/consent-intake/consent-request-email) — a minimal in-memory
 * `consentRequest` Prisma delegate for e2e harnesses, the same way chunk 1's
 * `actor-sequence.mock.ts` extended the existing Prisma mock for a new
 * model. Supports exactly the query shapes `ConsentSupersessionService` and
 * `ConsentRequestsService` issue: `findMany` by `actorId.in`, `createMany`,
 * and `updateMany` with an `actorId.in` + `OR[{status.in}, {status, expiresAt.gt}]`
 * where clause.
 *
 * T-4 adds `findFirst` (claim selection, oldest-`createdAt`-first) and
 * `count` (the `queue` summary), and `matchesClause` gains `lt` (the
 * stale-claim sweep's `claimedAt: { lt }`).
 *
 * T-5 adds `findUnique` (by `tokenHash` or `id`, the two unique keys the
 * public view/respond path reads by) and `snapshot()`/`restore()` so a
 * harness `$transaction` can ROLL BACK this delegate's rows when its callback
 * throws — the property `respond`'s actor-deleted-mid-transaction case
 * depends on (design.md §5.4 step 2).
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
      if ('lt' in condObj) {
        if (value == null) return false;
        const valueTime = (value instanceof Date ? value : new Date(value as string)).getTime();
        const ltTime = (condObj.lt as Date).getTime();
        return valueTime < ltTime;
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
    // T-4 — the claim-loop selection: the OLDEST matching row (createdAt
    // ascending), mirroring `orderBy: { createdAt: 'asc' }`.
    findFirst: jest.fn(async (args: { where?: WhereClause } = {}) => {
      const matches = rows.filter((r) => matchesClause(r, args.where ?? {}));
      if (matches.length === 0) return null;
      return matches.reduce((oldest, r) => (r.createdAt < oldest.createdAt ? r : oldest));
    }),
    // T-5 — `findUnique` by either unique key the public path reads by.
    findUnique: jest.fn(async (args: { where: { tokenHash?: string; id?: string } }) => {
      const { tokenHash, id } = args.where;
      if (tokenHash === undefined && id === undefined) return null;
      return (
        rows.find(
          (r) =>
            (tokenHash === undefined || r.tokenHash === tokenHash) &&
            (id === undefined || r.id === id),
        ) ?? null
      );
    }),
    // T-4 — the `queue` summary (`{ queued, failed }`).
    count: jest.fn(async (args: { where?: WhereClause } = {}) =>
      rows.filter((r) => matchesClause(r, args.where ?? {})).length,
    ),
    createMany: jest.fn(async (args: { data: Array<Partial<ConsentRequestMockRow>> }) => {
      const created = args.data.map((d) => defaultRow({ id: nextId(), ...d }));
      rows.push(...created);
      return { count: created.length };
    }),
    updateMany: jest.fn(async (args: { where?: WhereClause; data: Partial<ConsentRequestMockRow> & { attempts?: { increment: number } } }) => {
      let count = 0;
      rows = rows.map((r) => {
        if (matchesClause(r, args.where ?? {})) {
          count += 1;
          const { attempts, ...rest } = args.data;
          const next: ConsentRequestMockRow = { ...r, ...(rest as Partial<ConsentRequestMockRow>) };
          if (attempts && typeof attempts.increment === 'number') {
            next.attempts = r.attempts + attempts.increment;
          }
          return next;
        }
        return r;
      });
      return { count };
    }),
  };

  return {
    consentRequest,
    getRows: (): ConsentRequestMockRow[] => rows,
    /** T-5 — a deep-enough copy for a harness `$transaction` to roll back to. */
    snapshot: (): ConsentRequestMockRow[] => rows.map((r) => ({ ...r })),
    restore: (saved: ConsentRequestMockRow[]): void => {
      rows = saved.map((r) => ({ ...r }));
    },
    reset: (): void => {
      rows = initial.map((r) => ({ ...r }));
      seq = 0;
    },
  };
}
