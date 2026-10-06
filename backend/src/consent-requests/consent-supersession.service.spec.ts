// @sdd-spec actors/consent-intake/consent-request-email (T-3)
import { ConsentRequestStatus, Prisma } from '@prisma/client';
import { ConsentSupersessionService } from './consent-supersession.service';
import {
  ConsentRequestMockRow,
  createConsentRequestMock,
} from '../test/support/consent-request.mock';

function buildTx() {
  return {
    consentRequest: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  } as unknown as Prisma.TransactionClient;
}

function partialRow(overrides: Partial<ConsentRequestMockRow> & { id: string; actorId: string }): ConsentRequestMockRow {
  return {
    traderId: 'T1',
    traderName: 'Test Actor',
    status: 'QUEUED',
    batchId: 'batch-1',
    recipientEmail: 'test@example.com',
    editionVersion: 'v1.0',
    editionHash: 'hash',
    requestedBySub: 'admin-sub',
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

/**
 * The SHARED, production-shape `consentRequest` mock (also used by the e2e
 * harnesses) — its `updateMany` generically evaluates `where.OR`,
 * `status.in` and `expiresAt.gt` straight from the real `args.where` this
 * service constructs, so a test built on it proves BEHAVIOUR derived from
 * the actual query, not a second, independently-reasoned reimplementation
 * that could stay green after the production `where` clause regressed.
 */
function buildFunctionalTx(rows: ConsentRequestMockRow[]) {
  const mock = createConsentRequestMock(rows);
  return {
    tx: { consentRequest: mock.consentRequest } as unknown as Prisma.TransactionClient,
    getRows: mock.getRows,
  };
}

describe('ConsentSupersessionService.supersedePendingFor (FR-12, D-20, design.md §5.5)', () => {
  let service: ConsentSupersessionService;

  beforeEach(() => {
    service = new ConsentSupersessionService();
  });

  it('is a no-op — issues no query at all — for an empty actor id list', async () => {
    const tx = buildTx();
    await service.supersedePendingFor(tx, []);
    expect(tx.consentRequest.updateMany).not.toHaveBeenCalled();
  });

  it('supersedes QUEUED, SENDING and FAILED, plus an unexpired SENT, for the given actors', async () => {
    const tx = buildTx();
    await service.supersedePendingFor(tx, ['actor-1', 'actor-2']);

    expect(tx.consentRequest.updateMany).toHaveBeenCalledTimes(1);
    const call = (tx.consentRequest.updateMany as jest.Mock).mock.calls[0][0];

    expect(call.where.actorId).toEqual({ in: ['actor-1', 'actor-2'] });
    expect(call.data.status).toBe(ConsentRequestStatus.SUPERSEDED);
    expect(call.data.supersededAt).toBeInstanceOf(Date);

    // The exact pending-set shape (falsifier: dropping FAILED from this OR
    // clause is what the service-level double-enqueue fixture catches).
    expect(call.where.OR).toEqual([
      {
        status: {
          in: [
            ConsentRequestStatus.QUEUED,
            ConsentRequestStatus.SENDING,
            ConsentRequestStatus.FAILED,
          ],
        },
      },
      { status: ConsentRequestStatus.SENT, expiresAt: { gt: expect.any(Date) } },
    ]);
  });

  it('an EXPIRED SENT row is not superseded — it keeps its derived Expired status as evidence (B-16)', async () => {
    const { tx, getRows } = buildFunctionalTx([
      partialRow({
        id: 'req-expired',
        actorId: 'actor-1',
        status: 'SENT',
        expiresAt: new Date('2000-01-01T00:00:00Z'), // long past
      }),
      partialRow({
        id: 'req-open',
        actorId: 'actor-1',
        status: 'SENT',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      }),
    ]);

    await service.supersedePendingFor(tx, ['actor-1']);

    const rows = getRows();
    expect(rows.find((r) => r.id === 'req-expired')!.status).toBe('SENT');
    expect(rows.find((r) => r.id === 'req-open')!.status).toBe(
      ConsentRequestStatus.SUPERSEDED,
    );
  });

  it('answered rows (ACCEPTED/DECLINED) are never touched', async () => {
    const { tx, getRows } = buildFunctionalTx([
      partialRow({ id: 'req-accepted', actorId: 'actor-1', status: 'ACCEPTED' }),
      partialRow({ id: 'req-declined', actorId: 'actor-1', status: 'DECLINED' }),
    ]);

    await service.supersedePendingFor(tx, ['actor-1']);

    const rows = getRows();
    expect(rows.find((r) => r.id === 'req-accepted')!.status).toBe('ACCEPTED');
    expect(rows.find((r) => r.id === 'req-declined')!.status).toBe('DECLINED');
  });
});
