/**
 * actors/consent-intake/consent-request-email T-6 — the FR-13 / NFR-9
 * evidence-immutability gate (design.md §5.8) and the EMAIL_LINK
 * single-writer gate (requirements defect-class row "respond path is the only
 * caller writing EMAIL_LINK"; routed from the T-5 review).
 *
 * Both gates are STATIC: they parse every production `backend/src/**\/*.ts`
 * file (specs and `src/test/` excluded) with the TypeScript compiler API and
 * attribute each call site to its enclosing `Class.method`. A regex over text
 * could not do that, and a sweep that matched nothing would pass forever, so
 * every sweep first asserts it found sites (the disqualifier).
 *
 * What a sweep can and cannot see: it keys on the property chain
 * `….consentRequest.<write>(…)` (resp. an object literal assigning
 * `consentMethod: ConsentMethod.EMAIL_LINK` / `'EMAIL_LINK'`). A write through
 * an aliased delegate (`const d = tx.consentRequest; d.update(…)`) or raw SQL
 * built from a variable is outside it; the raw-SQL sweep below covers the
 * literal `UPDATE`/`DELETE` forms only.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';
import { ConsentRequestStatus } from '@prisma/client';
import { ConsentRequestsService } from '../consent-requests/consent-requests.service';
import { ConsentSupersessionService } from '../consent-requests/consent-supersession.service';
import { ConsentPublicService } from '../consent-requests/consent-public.service';
import { ActorAuditService } from '../actors/actor-audit.service';
import { createConsentRequestMock, ConsentRequestMockRow } from './support/consent-request.mock';
import { hashConsentToken } from '../consent-requests/consent-token.util';

const SRC_ROOT = join(__dirname, '..');

/** Production source files: every `.ts` under `backend/src`, minus specs, `src/test/`, and declaration files. */
function productionSourceFiles(root: string = SRC_ROOT): string[] {
  const files: string[] = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (statSync(full).isDirectory()) {
      if (full === join(SRC_ROOT, 'test')) continue;
      files.push(...productionSourceFiles(full));
    } else if (name.endsWith('.ts') && !name.endsWith('.spec.ts') && !name.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

interface Site {
  file: string; // relative to backend/src
  owner: string; // `Class.method`, or `<module>` / `<function name>` outside a class
  call: string; // the written source of the call target, e.g. `tx.consentRequest.updateMany`
  whereText: string | null; // the `where` property's source, when the first argument is an object literal
}

function enclosingOwner(node: ts.Node): string {
  let method: string | null = null;
  for (let cur: ts.Node | undefined = node.parent; cur; cur = cur.parent) {
    if (method === null && (ts.isMethodDeclaration(cur) || ts.isFunctionDeclaration(cur)) && cur.name) {
      method = cur.name.getText();
    }
    if (ts.isClassDeclaration(cur) && cur.name) {
      return `${cur.name.text}.${method ?? '<class body>'}`;
    }
  }
  return method ?? '<module>';
}

/**
 * Every `<anything>.consentRequest.<write>(...)` call in `source`, where
 * `<write>` matches `writeNames`.
 */
function consentRequestWriteSites(file: string, source: string, writeNames: RegExp): Site[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const sites: Site[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      writeNames.test(node.expression.name.text) &&
      ts.isPropertyAccessExpression(node.expression.expression) &&
      node.expression.expression.name.text === 'consentRequest'
    ) {
      let whereText: string | null = null;
      const arg = node.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg)) {
        const where = arg.properties.find(
          (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText() === 'where',
        );
        whereText = where ? where.initializer.getText() : null;
      }
      sites.push({
        file: relative(SRC_ROOT, file),
        owner: enclosingOwner(node),
        call: node.expression.getText(),
        whereText,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}

function sweepProduction(writeNames: RegExp): Site[] {
  return productionSourceFiles().flatMap((file) =>
    consentRequestWriteSites(file, readFileSync(file, 'utf8'), writeNames),
  );
}

/** design.md §5.8 (amended 2026-10-05): the ONLY methods allowed to mutate an existing `ConsentRequest` row. */
const ALLOWED_OWNERS: readonly string[] = [
  'ConsentRequestsService.dispatch',
  'ConsentRequestsService.claimAndSendOne', // dispatch's private helper
  'ConsentRequestsService.sweepStaleClaims', // dispatch's private helper
  'ConsentRequestsService.retry',
  'ConsentSupersessionService.supersedePendingFor',
  'ConsentPublicService.respond',
];

const MUTATING_WRITES = /^(update|updateMany|upsert|delete|deleteMany)$/;

describe('FR-13 evidence immutability gate (design.md §5.8)', () => {
  describe('1. write-site sweep', () => {
    it('is not vacuous: it finds at least 4 mutating call sites in production source (the disqualifier)', () => {
      const sites = sweepProduction(MUTATING_WRITES);
      expect(sites.length).toBeGreaterThanOrEqual(4);
    });

    it('every consentRequest update/updateMany/upsert/delete* call site belongs to one of the four owners', () => {
      const sites = sweepProduction(MUTATING_WRITES);
      const offenders = sites
        .filter((s) => !ALLOWED_OWNERS.includes(s.owner))
        .map((s) => `${s.file}  ${s.owner}  ${s.call}`);
      expect(offenders).toEqual([]);
    });

    it('each of the four owners still writes (an owner that stopped writing is a stale allowlist, not a pass)', () => {
      // `dispatch` itself delegates to its private helpers, so its group is
      // satisfied by any of dispatch / claimAndSendOne / sweepStaleClaims.
      const owners = new Set(sweepProduction(MUTATING_WRITES).map((s) => s.owner));
      const groups: Record<string, string[]> = {
        dispatch: [
          'ConsentRequestsService.dispatch',
          'ConsentRequestsService.claimAndSendOne',
          'ConsentRequestsService.sweepStaleClaims',
        ],
        retry: ['ConsentRequestsService.retry'],
        supersede: ['ConsentSupersessionService.supersedePendingFor'],
        respond: ['ConsentPublicService.respond'],
      };
      for (const [name, members] of Object.entries(groups)) {
        expect({ group: name, writes: members.some((m) => owners.has(m)) }).toEqual({ group: name, writes: true });
      }
      // …and the private helpers really are where dispatch's writes live.
      expect(owners.has('ConsentRequestsService.claimAndSendOne')).toBe(true);
      expect(owners.has('ConsentRequestsService.sweepStaleClaims')).toBe(true);
    });

    it('the owners live in exactly the expected files', () => {
      const files = new Set(sweepProduction(MUTATING_WRITES).map((s) => s.file));
      expect([...files].sort()).toEqual(
        [
          'consent-requests/consent-public.service.ts',
          'consent-requests/consent-requests.service.ts',
          'consent-requests/consent-supersession.service.ts',
        ].sort(),
      );
    });

    it('no mutating write is a delete or an upsert at all (rows are never removed; NFR-9)', () => {
      const bad = sweepProduction(/^(upsert|delete|deleteMany)$/);
      expect(bad).toEqual([]);
    });

    it('no production file writes ConsentRequest through literal raw SQL', () => {
      const offenders = productionSourceFiles().filter((file) =>
        /(UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+`?ConsentRequest\b/i.test(readFileSync(file, 'utf8')),
      );
      expect(offenders.map((f) => relative(SRC_ROOT, f))).toEqual([]);
    });

    // The sweep itself can silently rot (e.g. a TypeScript upgrade changing node kinds): pin it on text it must catch.
    it('the sweep sees a scratch write in an arbitrary service file (it is a live detector, not a no-op)', () => {
      const scratch = `
        class SomethingElse {
          async touch(tx: any) {
            await tx.consentRequest.update({ where: { id: 'x' }, data: { status: 'SENT' } });
          }
        }`;
      const sites = consentRequestWriteSites('scratch.service.ts', scratch, MUTATING_WRITES);
      expect(sites.map((s) => s.owner)).toEqual(['SomethingElse.touch']);
      expect(sites.every((s) => !ALLOWED_OWNERS.includes(s.owner))).toBe(true);
    });
  });

  describe('2a. every write names a status set and never ACCEPTED / DECLINED (static)', () => {
    it('each mutating site has a `where` that mentions status, and none lists ACCEPTED or DECLINED', () => {
      const sites = sweepProduction(MUTATING_WRITES);
      expect(sites.length).toBeGreaterThanOrEqual(4);
      for (const site of sites) {
        const label = `${site.file} ${site.owner}`;
        expect({ label, where: site.whereText }).not.toEqual({ label, where: null });
        expect({ label, namesStatus: /\bstatus\b/.test(site.whereText as string) }).toEqual({ label, namesStatus: true });
        expect({ label, answered: /ACCEPTED|DECLINED/.test(site.whereText as string) }).toEqual({ label, answered: false });
      }
    });
  });

  describe('2b. answered rows are terminal (behavioural): every write method gets count 0', () => {
    const ACTOR_ID = 'actor-answered';
    const ACCEPT_TOKEN = 'token-accepted';
    const NOW = Date.now();

    function answeredRow(id: string, status: ConsentRequestStatus, token: string): ConsentRequestMockRow {
      return {
        id,
        actorId: ACTOR_ID,
        traderId: 'TZ-1',
        traderName: 'Answered Ltd',
        status,
        batchId: 'b1',
        recipientEmail: 'a@example.com',
        editionVersion: 'v1.0',
        editionHash: 'a'.repeat(64),
        requestedBySub: 'admin',
        requestedByEmail: null,
        createdAt: new Date(NOW - 5 * 86_400_000),
        claimedAt: new Date(NOW - 5 * 86_400_000),
        sentAt: new Date(NOW - 5 * 86_400_000),
        // Not expired: so the ONLY thing standing between the row and a write is its status.
        expiresAt: new Date(NOW + 25 * 86_400_000),
        failureReason: null,
        attempts: 1,
        tokenHash: hashConsentToken(token),
        respondedAt: new Date(NOW - 4 * 86_400_000),
        respondentName: 'Neema',
        respondentPosition: null,
        respondentEmail: null,
        respondentPhone: null,
        respondentIp: null,
        respondentUserAgent: null,
        supersededAt: null,
      };
    }

    function arrange() {
      const rows = [
        answeredRow('req-accepted', ConsentRequestStatus.ACCEPTED, ACCEPT_TOKEN),
        answeredRow('req-declined', ConsentRequestStatus.DECLINED, 'token-declined'),
      ];
      const mock = createConsentRequestMock(rows);
      const before = JSON.stringify(mock.getRows());
      const tx = {
        consentRequest: mock.consentRequest,
        $queryRaw: jest.fn(async () => [
          { id: ACTOR_ID, consentStatus: 'UNKNOWN', consentMethod: 'NOT_RECORDED', consentObtainedAt: null, consentReference: null },
        ]),
        actor: { findUnique: jest.fn(async () => null), update: jest.fn() },
        actorAuditLog: { create: jest.fn() },
      };
      const prisma = {
        ...tx,
        $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
      };
      return { mock, before, tx, prisma };
    }

    /** Every `updateMany` the scenario issued resolved to `{ count: 0 }` — and at least one was issued. */
    async function expectAllWritesCountedZero(mock: ReturnType<typeof createConsentRequestMock>) {
      const calls = mock.consentRequest.updateMany.mock.results;
      expect(calls.length).toBeGreaterThan(0); // non-vacuous: the write method really ran its write
      for (const result of calls) {
        expect(await result.value).toEqual({ count: 0 });
      }
    }

    it('ConsentSupersessionService.supersedePendingFor leaves ACCEPTED and DECLINED rows untouched', async () => {
      const { mock, before, tx } = arrange();
      await new ConsentSupersessionService().supersedePendingFor(tx as never, [ACTOR_ID]);
      await expectAllWritesCountedZero(mock);
      expect(JSON.stringify(mock.getRows())).toBe(before);
    });

    it('ConsentRequestsService.retry leaves ACCEPTED and DECLINED rows untouched', async () => {
      const { mock, before, prisma } = arrange();
      const service = new ConsentRequestsService(
        prisma as never,
        { resolve: jest.fn() } as never,
        new ConsentSupersessionService(),
        new ActorAuditService(),
        { sendConsentRequest: jest.fn() } as never,
      );
      expect(await service.retry({})).toEqual({ queued: 0 });
      await expectAllWritesCountedZero(mock);
      expect(JSON.stringify(mock.getRows())).toBe(before);
    });

    it('ConsentRequestsService.dispatch (claim and stale-claim sweep) leaves ACCEPTED and DECLINED rows untouched', async () => {
      const { mock, before, prisma } = arrange();
      const sendConsentRequest = jest.fn();
      const service = new ConsentRequestsService(
        prisma as never,
        { resolve: jest.fn() } as never,
        new ConsentSupersessionService(),
        new ActorAuditService(),
        { sendConsentRequest } as never,
      );
      expect(await service.dispatch({})).toEqual({ sent: 0, failed: 0, remaining: 0, failures: [] });
      await expectAllWritesCountedZero(mock); // the stale-claim sweep ran, and matched nothing
      expect(sendConsentRequest).not.toHaveBeenCalled();
      expect(JSON.stringify(mock.getRows())).toBe(before);
    });

    it('ConsentPublicService.respond refuses an already-answered link and rewrites nothing (the first answer stands)', async () => {
      const { mock, before, prisma } = arrange();
      const service = new ConsentPublicService(prisma as never, new ActorAuditService());
      await expect(
        service.respond({ token: ACCEPT_TOKEN, decision: 'DECLINE' } as never),
      ).rejects.toMatchObject({ status: 404 });
      await expectAllWritesCountedZero(mock);
      expect(JSON.stringify(mock.getRows())).toBe(before);
      expect(prisma.actorAuditLog.create).not.toHaveBeenCalled();
    });
  });
});

describe('EMAIL_LINK single-writer gate (FR-10; requirements defect-class "respond path is the only caller writing EMAIL_LINK")', () => {
  interface EmailLinkSite {
    file: string;
    owner: string;
    text: string;
  }

  /**
   * Every place production code puts `EMAIL_LINK` in value position of a
   * property assignment (`consentMethod: ConsentMethod.EMAIL_LINK`,
   * `consentMethod: 'EMAIL_LINK'`) or in an assignment expression. Reads
   * (`=== ConsentMethod.EMAIL_LINK`, comparisons, `isIn` lists, comments) are
   * not writes and are not matched.
   */
  function emailLinkWriteSites(file: string, source: string): EmailLinkSite[] {
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const sites: EmailLinkSite[] = [];
    const isEmailLink = (n: ts.Node): boolean =>
      (ts.isPropertyAccessExpression(n) && n.name.text === 'EMAIL_LINK') ||
      ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && n.text === 'EMAIL_LINK');
    const record = (n: ts.Node): void => {
      sites.push({ file: relative(SRC_ROOT, file), owner: enclosingOwner(n), text: n.parent.getText() });
    };
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAssignment(node) && isEmailLink(node.initializer)) {
        record(node.initializer);
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        isEmailLink(node.right)
      ) {
        record(node.right);
      } else if (ts.isConditionalExpression(node)) {
        // `x: cond ? EMAIL_LINK : other` — a branch value flows into the property assignment.
        for (const branch of [node.whenTrue, node.whenFalse]) {
          if (isEmailLink(branch) && ts.isPropertyAssignment(node.parent)) record(branch);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return sites;
  }

  const production = (): EmailLinkSite[] =>
    productionSourceFiles().flatMap((f) => emailLinkWriteSites(f, readFileSync(f, 'utf8')));

  it('is not vacuous: the sweep finds the respond-path write (and at least one site at all)', () => {
    const sites = production();
    expect(sites.length).toBeGreaterThanOrEqual(1);
    expect(sites.map((s) => s.owner)).toContain('ConsentPublicService.respond');
  });

  it('the only production site writing EMAIL_LINK is ConsentPublicService.respond', () => {
    const offenders = production()
      .filter((s) => s.owner !== 'ConsentPublicService.respond')
      .map((s) => `${s.file}  ${s.owner}  ${s.text}`);
    expect(offenders).toEqual([]);
  });

  it('the sweep sees a scratch EMAIL_LINK write in an arbitrary service file, in every spelling', () => {
    const scratch = `
      class Sneaky {
        a(tx: any) { return tx.actor.update({ where: { id: 'x' }, data: { consentMethod: ConsentMethod.EMAIL_LINK } }); }
        b(tx: any) { return tx.actor.update({ where: { id: 'x' }, data: { consentMethod: 'EMAIL_LINK' } }); }
        c(row: any) { row.consentMethod = ConsentMethod.EMAIL_LINK; }
        d(tx: any, f: boolean) { return tx.actor.update({ data: { consentMethod: f ? ConsentMethod.EMAIL_LINK : null } }); }
        read(row: any) { return row.consentMethod === ConsentMethod.EMAIL_LINK; }
      }`;
    const sites = emailLinkWriteSites('scratch.ts', scratch);
    expect(sites.map((s) => s.owner)).toEqual(['Sneaky.a', 'Sneaky.b', 'Sneaky.c', 'Sneaky.d']); // the read is not a write
  });
});
