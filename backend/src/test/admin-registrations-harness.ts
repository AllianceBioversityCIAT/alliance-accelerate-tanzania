import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RegistrationStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';

/**
 * Shared harness, originally for the two e2e suites — `admin-
 * registrations.e2e.spec.ts` (T-8, approve + list) and `admin-
 * registrations-reject.e2e.spec.ts` (T-9, reject) — and now ALSO for their
 * two unit-level counterparts, `admin-registrations.service.spec.ts` and
 * `admin-registrations-reject.spec.ts` (same T-8/T-9 pair, one layer down:
 * a mocked `tx` delegate instead of an HTTP request through a real
 * `AppModule`). Placed here rather than in a second file under
 * `src/registrations/` because `src/test/` is the one location
 * `tsconfig.build.json` excludes by DIRECTORY — a non-`*.spec.ts` helper
 * anywhere else risks silently compiling into `dist/`.
 *
 * This exists to keep each pair's fakes in lockstep, not merely to satisfy
 * a duplication metric: within a pair, both suites mutate an in-memory
 * `Registration` row the SAME way (`updateMany` / `update`, conditioned on
 * `id` + `status`). Two hand-maintained copies of that fake drift over
 * time, and a drifting fake makes the two suites silently disagree about
 * what the "same" database does — a bug that would never show up as a
 * failing assertion, only as two suites that stop meaning the same thing.
 * Anything below is shared BECAUSE it must stay identical, not because
 * copy-pasting it once was convenient.
 *
 * Each spec file still owns its own `buildPrismaMock`/`buildTx`/
 * `buildRejectTx` — the delegate shape (which models it mocks, what
 * `findUnique` needs to support, what the transaction does beyond the
 * shared claim/read, whether an unconditional `update` follows) genuinely
 * differs across all four suites and is NOT extracted here.
 */

/** Pull the token out of an `Authorization: Bearer <token>` header. */
export function extractBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

export const TOKEN_USERS: Record<string, AuthUser> = {
  'admin-token': { sub: 'admin-sub-1', username: 'admin-user', groups: ['admin'], role: 'Admin' },
  'staff-token': { sub: 'staff-sub-1', username: 'staff-user', groups: ['staff'], role: 'Staff' },
};

@Injectable()
export class TestJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const token = extractBearer(req.headers?.authorization);
    if (!token || !TOKEN_USERS[token]) {
      throw new UnauthorizedException('Invalid token');
    }
    req.user = TOKEN_USERS[token];
    return true;
  }
}

export const admin = { Authorization: 'Bearer admin-token' };

/**
 * Builds the `Registration` delegate's `updateMany` fake shared by both
 * suites' `buildPrismaMock` — the conditional (`id` + `status`) transition
 * used by both approve and reject to atomically claim a `PENDING_REVIEW`
 * row. Takes a getter/setter pair rather than owning the array itself so
 * each file's `buildPrismaMock` keeps its own closured, mutable
 * `registrations` store (shared across every delegate method there,
 * including ones NOT extracted here).
 */
export function createRegistrationUpdateManyMock(
  getRegistrations: () => Record<string, unknown>[],
  setRegistrations: (next: Record<string, unknown>[]) => void,
) {
  return jest.fn(
    async (args: {
      where: { id: string; status: RegistrationStatus };
      data: Record<string, unknown>;
    }) => {
      let count = 0;
      const next = getRegistrations().map((r) => {
        if (r.id === args.where.id && r.status === args.where.status) {
          count += 1;
          return { ...r, ...args.data };
        }
        return r;
      });
      setRegistrations(next);
      return { count };
    },
  );
}

/**
 * Builds the `Registration` delegate's unconditional-by-id `update` fake
 * shared by both suites — the final-state write (setting `status`,
 * `reviewedBySub`, `reviewedAt`, `publishedActorId`/`rejectionReason`,
 * etc.) both approve and reject issue after their conditional
 * `updateMany` claim succeeds.
 */
export function createRegistrationUpdateMock(
  getRegistrations: () => Record<string, unknown>[],
  setRegistrations: (next: Record<string, unknown>[]) => void,
) {
  return jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
    const next = getRegistrations().map((r) =>
      r.id === args.where.id ? { ...r, ...args.data } : r,
    );
    setRegistrations(next);
    return { ...next.find((r) => r.id === args.where.id) };
  });
}

/**
 * The tx-scoped `Registration` delegate's `updateMany` fake shared by
 * `admin-registrations.service.spec.ts`'s `buildTx` (approve) and
 * `admin-registrations-reject.spec.ts`'s `buildRejectTx` (reject) — the
 * SAME conditional (`id` + `status`) claim as `createRegistrationUpdateManyMock`
 * above, but over a SINGLE closured registration object rather than an
 * array-backed store: both unit suites mock `tx.registration` directly
 * (one row per test), never the array the two e2e suites mock. Kept as a
 * separate pair of factories rather than reusing the array-based ones
 * above for the same reason those exist in the first place — the shape is
 * genuinely different, and forcing a single object through a
 * one-element-array API would obscure both call sites, not simplify them.
 */
export function createTxRegistrationUpdateManyMock<T extends Record<string, unknown>>(
  getRegistration: () => T,
  setRegistration: (next: T) => void,
) {
  return jest.fn(
    async (args: {
      where: { id: string; status: RegistrationStatus };
      data: Record<string, unknown>;
    }) => {
      const registration = getRegistration();
      if (args.where.id !== registration.id || registration.status !== args.where.status) {
        return { count: 0 };
      }
      setRegistration({ ...registration, ...args.data });
      return { count: 1 };
    },
  );
}

/**
 * The matching tx-scoped `findUnique` fake — resolves the SAME closured
 * registration object by id, or `null` when the id does not match. Shared
 * by the same two call sites as the factory above, for the same reason.
 */
export function createTxRegistrationFindUniqueMock<T extends Record<string, unknown>>(
  getRegistration: () => T,
) {
  return jest.fn(async (args: { where: { id: string } }) => {
    const registration = getRegistration();
    if (args.where.id !== registration.id) return null;
    return { ...registration };
  });
}

/**
 * Wires `prisma.$transaction` to record `'transaction-committed'` into a
 * fresh `callOrder` array the instant the transaction's callback resolves —
 * shared by `admin-registrations.service.spec.ts`'s and `admin-
 * registrations-reject.spec.ts`'s "notification dispatched AFTER commit,
 * never inside it" tests (FR-14). The caller still owns wiring its own
 * mail mock to push `'notification-dispatched'` and asserting the final
 * order — that half genuinely differs (`sendApproval` vs `sendRejection`,
 * different fixture values) and is NOT extracted here.
 */
export function createCommitOrderTracker(
  prisma: { $transaction: jest.Mock },
  tx: unknown,
): string[] {
  const callOrder: string[] = [];
  prisma.$transaction.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
    const result = await cb(tx);
    callOrder.push('transaction-committed');
    return result;
  });
  return callOrder;
}
