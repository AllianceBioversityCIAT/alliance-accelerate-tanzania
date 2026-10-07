import { ActorAuditAction, ActorAuditLog, Prisma } from '@prisma/client';
import { ActorAuditService } from './actor-audit.service';
import { toAuditEntry } from './audit-entry.serializer';

/**
 * actors/consent-intake/consent-request-email T-6 — `toAuditEntry` handles the
 * three consent actions (CONSENT_REQUESTED, CONSENT_RESPONDED,
 * CONSENT_DOCUMENT_UPLOADED).
 *
 * The serializer is a pass-through by design (`changes` is already a shaped
 * envelope). These tests keep it one: an action added later must not need a
 * serializer edit, and none of the new envelopes may be reshaped or dropped.
 * The two requests/responded rows are produced by the REAL writers in
 * `ActorAuditService` (over a fake `tx`), so the test follows the shape the
 * writers actually emit rather than a hand-copied one.
 */

const CREATED_AT = new Date('2026-10-06T08:15:30.123Z');

/** Run a real `ActorAuditService` writer and return the row it would persist, as Prisma would hand it back. */
async function persistedRow(
  write: (service: ActorAuditService, tx: Prisma.TransactionClient) => Promise<unknown>,
): Promise<ActorAuditLog> {
  const create = jest.fn(async (args: { data: Record<string, unknown> }) => ({
    id: 'audit-1',
    acknowledged: null,
    duplicateConfirmation: null,
    createdAt: CREATED_AT,
    ...args.data,
  }));
  const tx = { actorAuditLog: { create } } as unknown as Prisma.TransactionClient;
  await write(new ActorAuditService(), tx);
  return (await create.mock.results[0].value) as ActorAuditLog;
}

describe('toAuditEntry — consent actions (T-6)', () => {
  it('CONSENT_REQUESTED: snapshot envelope with requestId + recipientEmail passes through verbatim', async () => {
    const row = await persistedRow((service, tx) =>
      service.logConsentRequested(tx, {
        id: 'req-1',
        actorId: 'actor-1',
        traderId: 'TZ-0001',
        traderName: 'Acme Seeds',
        recipientEmail: 'acme@example.com',
        requestedBySub: 'admin-sub',
        requestedByEmail: 'admin@example.com',
      }),
    );

    const entry = toAuditEntry(row);

    expect(entry).toEqual({
      id: 'audit-1',
      actorId: 'actor-1',
      traderId: 'TZ-0001',
      traderName: 'Acme Seeds',
      action: 'CONSENT_REQUESTED',
      actingSub: 'admin-sub',
      actingEmail: 'admin@example.com',
      changes: { kind: 'snapshot', values: { requestId: 'req-1', recipientEmail: 'acme@example.com' } },
      acknowledged: null,
      duplicateConfirmation: null,
      createdAt: '2026-10-06T08:15:30.123Z',
    });
  });

  it('CONSENT_RESPONDED: the sentinel author, a null email, and the diff envelope with requestId survive', async () => {
    const row = await persistedRow((service, tx) =>
      service.logConsentResponded(tx, {
        request: { id: 'req-7', actorId: 'actor-1', traderId: 'TZ-0001', traderName: 'Acme Seeds' },
        before: {
          consentStatus: 'UNKNOWN',
          consentMethod: 'NOT_RECORDED',
          consentObtainedAt: null,
          consentReference: null,
        },
        after: {
          consentStatus: 'GRANTED',
          consentMethod: 'EMAIL_LINK',
          consentObtainedAt: new Date('2026-10-06T10:00:00.000Z'),
          consentReference: 'req-7',
        },
      }),
    );

    const entry = toAuditEntry(row);

    expect(entry.action).toBe(ActorAuditAction.CONSENT_RESPONDED);
    expect(entry.actingSub).toBe('consent-link');
    expect(entry.actingEmail).toBeNull();
    expect(entry.changes).toEqual({
      kind: 'diff',
      requestId: 'req-7',
      fields: {
        consentStatus: { from: 'UNKNOWN', to: 'GRANTED' },
        consentMethod: { from: 'NOT_RECORDED', to: 'EMAIL_LINK' },
        consentObtainedAt: { from: null, to: '2026-10-06T10:00:00.000Z' },
        consentReference: { from: null, to: 'req-7' },
      },
    });
    expect(entry.createdAt).toBe('2026-10-06T08:15:30.123Z');
  });

  it('CONSENT_RESPONDED: the exact `changes` object is returned, not a copy that drops requestId', async () => {
    const row = await persistedRow((service, tx) =>
      service.logConsentResponded(tx, {
        request: { id: 'req-8', actorId: 'actor-1', traderId: 'TZ-0001', traderName: 'Acme Seeds' },
        before: { consentStatus: 'DENIED', consentMethod: 'NOT_RECORDED', consentObtainedAt: null, consentReference: null },
        after: { consentStatus: 'DENIED', consentMethod: 'NOT_RECORDED', consentObtainedAt: null, consentReference: null },
      }),
    );
    // A Decline on an already-DENIED actor still writes a row with an empty diff (design §5.4 step 4).
    expect(toAuditEntry(row).changes).toEqual({ kind: 'diff', fields: {}, requestId: 'req-8' });
  });

  it('CONSENT_DOCUMENT_UPLOADED: carried through unchanged (its writer arrives with T-7; the serializer assumes no shape)', () => {
    const changes = { kind: 'snapshot', values: { documentId: 'doc-1', fileName: 'consent.pdf' } };
    const row = {
      id: 'audit-9',
      actorId: 'actor-1',
      traderId: 'TZ-0001',
      traderName: 'Acme Seeds',
      action: ActorAuditAction.CONSENT_DOCUMENT_UPLOADED,
      actingSub: 'admin-sub',
      actingEmail: 'admin@example.com',
      changes,
      acknowledged: null,
      duplicateConfirmation: null,
      createdAt: CREATED_AT,
    } as unknown as ActorAuditLog;

    const entry = toAuditEntry(row);

    expect(entry.action).toBe('CONSENT_DOCUMENT_UPLOADED');
    expect(entry.changes).toBe(changes);
    expect(entry.actingEmail).toBe('admin@example.com');
  });

  it('exposes exactly the AuditEntry key set for every consent action (no field dropped or added)', async () => {
    const expectedKeys = [
      'acknowledged', 'action', 'actingEmail', 'actingSub', 'actorId', 'changes', 'createdAt',
      'duplicateConfirmation', 'id', 'traderId', 'traderName',
    ].sort();
    for (const action of [
      ActorAuditAction.CONSENT_REQUESTED,
      ActorAuditAction.CONSENT_RESPONDED,
      ActorAuditAction.CONSENT_DOCUMENT_UPLOADED,
    ]) {
      const entry = toAuditEntry({
        id: 'a', actorId: 'x', traderId: 't', traderName: 'n', action, actingSub: 's', actingEmail: null,
        changes: {}, acknowledged: null, duplicateConfirmation: null, createdAt: CREATED_AT,
      } as unknown as ActorAuditLog);
      expect(Object.keys(entry).sort()).toEqual(expectedKeys);
    }
  });
});
