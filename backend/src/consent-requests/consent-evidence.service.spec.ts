/**
 * T-6 — `ConsentEvidenceService` (FR-13, FR-14, NFR-9; design.md §6).
 * The prisma double has NO `actor` delegate: a read that touched the Actor
 * table (an existence check) would throw, which is how "works for a deleted
 * actor" is proven rather than assumed.
 */
import { ConsentEvidenceService } from './consent-evidence.service';

const DAY = 86_400_000;

function requestRow(overrides: Record<string, unknown> = {}) {
  const base = new Date();
  return {
    id: 'req-1',
    actorId: 'actor-gone',
    status: 'SENT',
    recipientEmail: 'a@example.com',
    editionVersion: 'v1.0',
    editionHash: 'a'.repeat(64),
    requestedBySub: 'admin-sub',
    requestedByEmail: 'admin@example.com',
    createdAt: base,
    sentAt: base,
    expiresAt: new Date(base.getTime() + 30 * DAY),
    failureReason: null,
    respondedAt: null,
    respondentName: null,
    respondentPosition: null,
    respondentEmail: null,
    respondentPhone: null,
    respondentIp: null,
    respondentUserAgent: null,
    supersededAt: null,
    // What a raw row would carry if a select ever widened:
    tokenHash: 't'.repeat(64),
    ...overrides,
  };
}

function build(requests: unknown[], documents: unknown[] = []) {
  const prisma = {
    consentRequest: { findMany: jest.fn(async () => requests) },
    consentDocument: { findMany: jest.fn(async () => documents) },
  };
  return { prisma, service: new ConsentEvidenceService(prisma as never) };
}

describe('ConsentEvidenceService.forActor', () => {
  it('never selects tokenHash (or a document storageKey) and never returns them', async () => {
    const { prisma, service } = build([requestRow()], [
      {
        id: 'doc-1', actorId: 'actor-gone', fileName: 'c.pdf', contentType: 'application/pdf', sizeBytes: 5,
        uploadedBySub: 's', uploadedByEmail: null, createdAt: new Date(), storedAt: new Date(), storageKey: 'stored/k',
      },
    ]);

    const res = await service.forActor('actor-gone');

    const requestSelect = (prisma.consentRequest.findMany.mock.calls[0] as unknown as [{ select: Record<string, boolean> }])[0].select;
    const documentSelect = (prisma.consentDocument.findMany.mock.calls[0] as unknown as [{ select: Record<string, boolean> }])[0].select;
    expect(Object.keys(requestSelect)).not.toContain('tokenHash');
    expect(Object.keys(documentSelect)).not.toContain('storageKey');
    expect(JSON.stringify(res)).not.toContain('tokenHash');
    expect(JSON.stringify(res)).not.toContain('t'.repeat(64));
    expect(JSON.stringify(res)).not.toContain('stored/k');
    expect(Object.keys(res.requests[0])).not.toContain('tokenHash');
  });

  it('reads only STORED documents, newest first, for the given actor — and never touches the Actor table', async () => {
    const { prisma, service } = build([]);
    await service.forActor('actor-gone');

    expect(prisma.consentDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { actorId: 'actor-gone', status: 'STORED' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(prisma.consentRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { actorId: 'actor-gone' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    );
    expect('actor' in prisma).toBe(false);
  });

  it('derives EXPIRED for a SENT row at or past expiresAt, and only for SENT', async () => {
    const now = Date.now();
    const { service } = build([
      requestRow({ id: 'sent-31d', createdAt: new Date(now - 31 * DAY), sentAt: new Date(now - 31 * DAY), expiresAt: new Date(now - DAY) }),
      requestRow({ id: 'sent-fresh', expiresAt: new Date(now + 29 * DAY) }),
      requestRow({ id: 'accepted-old', status: 'ACCEPTED', expiresAt: new Date(now - 10 * DAY) }),
      requestRow({ id: 'failed', status: 'FAILED', expiresAt: null }),
    ]);

    const res = await service.forActor('actor-gone');

    expect(Object.fromEntries(res.requests.map((r) => [r.id, r.status]))).toEqual({
      'sent-31d': 'EXPIRED',
      'sent-fresh': 'SENT',
      'accepted-old': 'ACCEPTED', // an answered row never reads Expired
      failed: 'FAILED',
    });
  });

  it('serializes dates as ISO strings and an empty actor as two empty lists', async () => {
    const answeredAt = new Date('2026-10-06T10:00:00.000Z');
    const { service } = build([requestRow({ status: 'ACCEPTED', respondedAt: answeredAt, respondentName: 'Neema' })]);
    const res = await service.forActor('actor-gone');
    expect(res.requests[0].respondedAt).toBe('2026-10-06T10:00:00.000Z');
    expect(res.requests[0].respondentName).toBe('Neema');

    expect(await build([]).service.forActor('nobody')).toEqual({ requests: [], documents: [] });
  });
});
