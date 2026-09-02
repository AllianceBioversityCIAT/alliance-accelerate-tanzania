import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RegistrationStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';

/**
 * Shared e2e harness for `admin-registrations.e2e.spec.ts` (T-8, approve +
 * list) and `admin-registrations-reject.e2e.spec.ts` (T-9, reject).
 *
 * This exists to keep the two suites' fakes in lockstep, not merely to
 * satisfy a duplication metric: both suites boot the SAME `AppModule` behind
 * the SAME bearer-token auth stub and mutate an in-memory
 * `Registration` row the SAME way (`updateMany` / `update`). Two
 * hand-maintained copies of that fake drift over time, and a drifting fake
 * makes the two suites silently disagree about what the "same" database
 * does — a bug that would never show up as a failing assertion, only as two
 * suites that stop meaning the same thing. Anything below is shared
 * BECAUSE it must stay identical, not because copy-pasting it once was
 * convenient.
 *
 * Each spec file still owns its own `buildPrismaMock` — the delegate shape
 * (which models it mocks, what `findUnique` needs to support, what
 * `$transaction` does with raw SQL) genuinely differs between the two
 * suites and is NOT extracted here.
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
