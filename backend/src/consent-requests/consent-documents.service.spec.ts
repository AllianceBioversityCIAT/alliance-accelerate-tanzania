/**
 * actors/consent-intake/consent-request-email T-7 — `ConsentDocumentsService`
 * (FR-13 document trail, FR-15, FR-16; design.md §5.6).
 *
 * The prisma double is a small in-memory store; the storage port is a jest
 * fake. The `actor` delegate only answers `findUnique`, and `confirm` never
 * calls it — so "works after the actor is deleted" is proven by the double
 * having NO actor row, not assumed.
 */
import { NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { ConsentDocumentsService } from './consent-documents.service';
import { DocumentStorage } from './document-storage';
import { UnconfiguredDocumentStorage } from './unconfigured-document-storage';
import { ActorAuditService } from '../actors/actor-audit.service';

type Row = Record<string, any>;

const ADMIN = { sub: 'admin-sub', username: 'admin', groups: ['admin'], role: 'Admin' as const };

function build(options: { actors?: Row[]; storage?: DocumentStorage } = {}) {
  const actors = options.actors ?? [{ id: 'actor-1', traderId: 'TZ-SEED-0001', traderName: 'Acme Seeds' }];
  const docs = new Map<string, Row>();
  const auditRows: Row[] = [];

  const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
  const consentDocument = {
    create: jest.fn(async ({ data }: { data: Row }) => {
      const row: Row = { createdAt:new Date('2026-10-06T10:00:00Z'), storedAt: null, ...data };
      docs.set(row.id, row);
      return row;
    }),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => docs.get(where.id) ?? null),
    updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const row = docs.get(where.id);
      if (!row || !matches(row, where)) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    }),
  };
  const tx = {
    consentDocument,
    actorAuditLog: {
      create: jest.fn(async ({ data }: { data: Row }) => {
        auditRows.push(data);
        return data;
      }),
    },
  };
  const prisma = {
    actor: { findUnique: jest.fn(async ({ where }: { where: { id: string } }) => actors.find((a) => a.id === where.id) ?? null) },
    consentDocument,
    $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  };

  const storage = {
    enabled: true,
    presignUpload: jest.fn(async ({ key }: { key: string }) => ({ url: 'https://bucket.example/', fields: { key } })),
    head: jest.fn(),
    copy: jest.fn(async () => undefined),
    remove: jest.fn(async () => undefined),
    presignDownload: jest.fn(async () => ({ url: 'https://bucket.example/get', expiresAt: '2026-10-06T10:05:00.000Z' })),
  };
  const resolver = { resolve: jest.fn(async () => 'admin@example.com') };
  const service = new ConsentDocumentsService(
    prisma as never,
    (options.storage ?? storage) as never,
    resolver as never,
    new ActorAuditService(),
  );
  return { service, prisma, storage, docs, auditRows, resolver };
}

const PDF_1MB = { fileName: 'consent.pdf', contentType: 'application/pdf' as const, sizeBytes: 1_048_576 };

describe('ConsentDocumentsService.status', () => {
  it('reports enabled for a configured adapter and disabled for the unconfigured one', () => {
    expect(build().service.status()).toEqual({ enabled: true });
    expect(build({ storage: new UnconfiguredDocumentStorage() }).service.status()).toEqual({ enabled: false });
  });
});

describe('ConsentDocumentsService.createUploadUrl', () => {
  it('creates a PENDING row with the actor snapshot and presigns key incoming/<id>', async () => {
    const { service, storage, docs } = build();

    const res = await service.createUploadUrl('actor-1', PDF_1MB, ADMIN);

    expect(docs.size).toBe(1);
    const row = docs.get(res.documentId)!;
    expect(row).toMatchObject({
      actorId: 'actor-1',
      traderId: 'TZ-SEED-0001',
      traderName: 'Acme Seeds',
      status: 'PENDING',
      fileName: 'consent.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1_048_576,
      storageKey: `incoming/${res.documentId}`,
      uploadedBySub: 'admin-sub',
      uploadedByEmail: 'admin@example.com',
    });
    expect(storage.presignUpload).toHaveBeenCalledWith({
      key: `incoming/${res.documentId}`,
      contentType: 'application/pdf',
    });
    expect(res).toEqual({ documentId: row.id, url: 'https://bucket.example/', fields: { key: `incoming/${row.id}` } });
  });

  it('404s for an unknown actor and creates nothing', async () => {
    const { service, docs, storage } = build();
    await expect(service.createUploadUrl('nope', PDF_1MB, ADMIN)).rejects.toBeInstanceOf(NotFoundException);
    expect(docs.size).toBe(0);
    expect(storage.presignUpload).not.toHaveBeenCalled();
  });

  it('503s when storage is unconfigured, before touching the database', async () => {
    const { service, prisma } = build({ storage: new UnconfiguredDocumentStorage() });
    await expect(service.createUploadUrl('actor-1', PDF_1MB, ADMIN)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.actor.findUnique).not.toHaveBeenCalled();
  });

  it('never writes to the actor (an upload changes no consent field)', async () => {
    const { service, prisma } = build();
    await service.createUploadUrl('actor-1', PDF_1MB, ADMIN);
    expect(Object.keys(prisma.actor)).toEqual(['findUnique']);
  });
});

describe('ConsentDocumentsService.confirm', () => {
  async function pending(ctx: ReturnType<typeof build>) {
    const { documentId } = await ctx.service.createUploadUrl('actor-1', PDF_1MB, ADMIN);
    return documentId;
  }

  it('promotes incoming/<id> to stored/<actorId>/<id>, marks STORED and writes the audit row in one transaction', async () => {
    const ctx = build();
    const id = await pending(ctx);
    ctx.storage.head.mockResolvedValue({ sizeBytes: 1_048_576, contentType: 'application/pdf' });

    const res = await ctx.service.confirm(id, ADMIN);

    expect(ctx.storage.copy).toHaveBeenCalledWith(`incoming/${id}`, `stored/actor-1/${id}`);
    expect(ctx.storage.remove).toHaveBeenCalledWith(`incoming/${id}`);
    const row = ctx.docs.get(id)!;
    expect(row.status).toBe('STORED');
    expect(row.storageKey).toBe(`stored/actor-1/${id}`);
    expect(row.storedAt).toBeInstanceOf(Date);
    expect(ctx.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(ctx.auditRows).toHaveLength(1);
    expect(ctx.auditRows[0]).toMatchObject({
      action: 'CONSENT_DOCUMENT_UPLOADED',
      actorId: 'actor-1',
      actingSub: 'admin-sub',
      actingEmail: 'admin@example.com',
    });
    expect(res).toMatchObject({ id, actorId: 'actor-1', fileName: 'consent.pdf', contentType: 'application/pdf', sizeBytes: 1_048_576 });
    expect(res.storedAt).not.toBeNull();
    expect(res).not.toHaveProperty('storageKey');
  });

  it('size mismatch (declared PDF 1 MB, object is PNG 12 MB): deletes the object, 422, stays PENDING, no audit row', async () => {
    const ctx = build();
    const id = await pending(ctx);
    ctx.storage.head.mockResolvedValue({ sizeBytes: 12_582_912, contentType: 'image/png' });

    await expect(ctx.service.confirm(id, ADMIN)).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(ctx.storage.remove).toHaveBeenCalledWith(`incoming/${id}`);
    expect(ctx.storage.copy).not.toHaveBeenCalled();
    expect(ctx.docs.get(id)!.status).toBe('PENDING');
    expect(ctx.auditRows).toHaveLength(0);
  });

  it.each([
    ['size only differs', { sizeBytes: 1_048_577, contentType: 'application/pdf' }],
    ['type only differs', { sizeBytes: 1_048_576, contentType: 'image/png' }],
  ])('mismatch where only one dimension differs (%s) is also refused', async (_label, head) => {
    const ctx = build();
    const id = await pending(ctx);
    ctx.storage.head.mockResolvedValue(head);
    await expect(ctx.service.confirm(id, ADMIN)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(ctx.storage.remove).toHaveBeenCalledWith(`incoming/${id}`);
  });

  it('tolerates a content-type parameter and case from storage', async () => {
    const ctx = build();
    const id = await pending(ctx);
    ctx.storage.head.mockResolvedValue({ sizeBytes: 1_048_576, contentType: 'Application/PDF; charset=binary' });
    await expect(ctx.service.confirm(id, ADMIN)).resolves.toMatchObject({ id });
  });

  it('an upload that never completed (no object) is a 422 and stays PENDING', async () => {
    const ctx = build();
    const id = await pending(ctx);
    ctx.storage.head.mockResolvedValue(null);
    await expect(ctx.service.confirm(id, ADMIN)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(ctx.storage.remove).not.toHaveBeenCalled();
    expect(ctx.docs.get(id)!.status).toBe('PENDING');
  });

  it('is idempotent: a second confirm returns the STORED document and does no storage work or second audit row', async () => {
    const ctx = build();
    const id = await pending(ctx);
    ctx.storage.head.mockResolvedValue({ sizeBytes: 1_048_576, contentType: 'application/pdf' });
    const first = await ctx.service.confirm(id, ADMIN);
    ctx.storage.head.mockClear();
    ctx.storage.copy.mockClear();

    const second = await ctx.service.confirm(id, ADMIN);

    expect(second).toEqual(first);
    expect(ctx.storage.head).not.toHaveBeenCalled();
    expect(ctx.storage.copy).not.toHaveBeenCalled();
    expect(ctx.auditRows).toHaveLength(1);
  });

  it('losing a concurrent confirm race writes no second audit row and still returns the stored document', async () => {
    const ctx = build();
    const id = await pending(ctx);
    ctx.storage.head.mockResolvedValue({ sizeBytes: 1_048_576, contentType: 'application/pdf' });
    // Another confirm wins between our read and our guarded update.
    const realUpdateMany = ctx.prisma.consentDocument.updateMany.getMockImplementation()!;
    ctx.prisma.consentDocument.updateMany.mockImplementationOnce(async (args: any) => {
      await realUpdateMany(args); // the winner
      return realUpdateMany(args); // ours: the row is STORED now, so count 0
    });

    const res = await ctx.service.confirm(id, ADMIN);

    expect(res.id).toBe(id);
    expect(ctx.auditRows).toHaveLength(0); // the winner's audit is not in this double; ours must not add one
  });

  it('a concurrent loser whose head finds nothing re-reads the row and returns the STORED evidence, with one audit row in total', async () => {
    const ctx = build();
    const id = await pending(ctx);
    // The winner stores and deletes incoming/; the loser read the row as PENDING before that.
    const realFind = ctx.prisma.consentDocument.findUnique.getMockImplementation()!;
    ctx.prisma.consentDocument.findUnique.mockImplementationOnce(async (args: any) => {
      const pendingView = { ...(await realFind(args)) }; // snapshot: still PENDING
      ctx.storage.head.mockResolvedValueOnce({ sizeBytes: 1_048_576, contentType: 'application/pdf' });
      await ctx.service.confirm(id, ADMIN); // the winner, run to completion
      ctx.storage.head.mockResolvedValue(null); // incoming/ is gone now
      return pendingView;
    });

    const res = await ctx.service.confirm(id, ADMIN);

    expect(res).toMatchObject({ id, actorId: 'actor-1' });
    expect(res.storedAt).not.toBeNull();
    expect(ctx.docs.get(id)!.status).toBe('STORED');
    expect(ctx.auditRows).toHaveLength(1);
  });

  it('a 403 from storage (an IAM defect) surfaces as that error, not a 422, and leaves the row PENDING', async () => {
    const ctx = build();
    const id = await pending(ctx);
    const forbidden = Object.assign(new Error('Forbidden'), { $metadata: { httpStatusCode: 403 } });
    ctx.storage.head.mockRejectedValue(forbidden);
    await expect(ctx.service.confirm(id, ADMIN)).rejects.toBe(forbidden);
    expect(ctx.docs.get(id)!.status).toBe('PENDING');
  });

  it('works after the actor was deleted: STORED, and the audit row uses the snapshot traderId/traderName', async () => {
    const ctx = build();
    const id = await pending(ctx);
    ctx.storage.head.mockResolvedValue({ sizeBytes: 1_048_576, contentType: 'application/pdf' });
    // The actor is deleted between upload-url and confirm.
    ctx.prisma.actor.findUnique.mockImplementation(async () => {
      throw new Error('confirm must not read the Actor table');
    });

    await ctx.service.confirm(id, ADMIN);

    expect(ctx.docs.get(id)!.status).toBe('STORED');
    expect(ctx.auditRows[0]).toMatchObject({ actorId: 'actor-1', traderId: 'TZ-SEED-0001', traderName: 'Acme Seeds' });
  });

  it('404s for an unknown document', async () => {
    await expect(build().service.confirm('nope', ADMIN)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('leaves the stored copy usable when deleting the incoming object fails (lifecycle cleans it)', async () => {
    const ctx = build();
    const id = await pending(ctx);
    ctx.storage.head.mockResolvedValue({ sizeBytes: 1_048_576, contentType: 'application/pdf' });
    ctx.storage.remove.mockRejectedValueOnce(new Error('throttled'));
    await expect(ctx.service.confirm(id, ADMIN)).resolves.toMatchObject({ id });
    expect(ctx.docs.get(id)!.status).toBe('STORED');
  });

  it('503s on a PENDING document when storage is unconfigured', async () => {
    const ctx = build({ storage: new UnconfiguredDocumentStorage() });
    ctx.docs.set('d1', { id: 'd1', actorId: 'actor-1', status: 'PENDING', storageKey: 'incoming/d1' });
    await expect(ctx.service.confirm('d1', ADMIN)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('ConsentDocumentsService.downloadUrl', () => {
  it('presigns the stored key with the document file name', async () => {
    const ctx = build();
    ctx.docs.set('d1', { id: 'd1', actorId: 'actor-1', status: 'STORED', storageKey: 'stored/actor-1/d1', fileName: 'signed.pdf' });

    const res = await ctx.service.downloadUrl('d1');

    expect(ctx.storage.presignDownload).toHaveBeenCalledWith({ key: 'stored/actor-1/d1', fileName: 'signed.pdf' });
    expect(res).toEqual({ url: 'https://bucket.example/get', expiresAt: '2026-10-06T10:05:00.000Z' });
  });

  it('404s for a PENDING document (never evidence) and for an unknown id', async () => {
    const ctx = build();
    ctx.docs.set('d1', { id: 'd1', actorId: 'actor-1', status: 'PENDING', storageKey: 'incoming/d1', fileName: 'x.pdf' });
    await expect(ctx.service.downloadUrl('d1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(ctx.service.downloadUrl('nope')).rejects.toBeInstanceOf(NotFoundException);
    expect(ctx.storage.presignDownload).not.toHaveBeenCalled();
  });
});
