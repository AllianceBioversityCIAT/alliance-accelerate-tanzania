// @sdd-spec actors/public-self-registration (T-4)
/**
 * T-4 — Request-id source AND structured-log emission (design.md §4.10,
 * NFR-8, DC-14, DC-22). Rework attempt 2: emission moved here from
 * `StructuredLogInterceptor` (now deleted) — see "Why emission lives in
 * middleware" below.
 *
 * Generates one request id per inbound request, attaches it to the request
 * object, then registers a `res.on('finish', ...)` listener that emits
 * exactly one JSON line — `requestId`, `route`, `method`, `status`, `role`,
 * `latencyMs` — once the response is actually sent. Runs as Express
 * middleware, ahead of every guard, interceptor and pipe, so the listener
 * exists for the whole lifetime of the request.
 *
 * **Why emission lives in middleware, not an interceptor (attempt-2 fix).**
 * NestJS's pipeline order is middleware → guards → interceptors → pipes →
 * handler. Attempt 1 registered the `finish` listener inside
 * `StructuredLogInterceptor.intercept()`. That is too late: a guard that
 * throws — `ThrottlerException` from T-5's throttle guard on a `429`, or a
 * future `401`/`403` from `JwtAuthGuard`/`RolesGuard` on a controller in this
 * module — short-circuits the pipeline before any interceptor's
 * `intercept()` is ever called, so the listener is never registered and the
 * rejected request emits nothing. Middleware runs BEFORE guards, so
 * registering the listener here guarantees it exists regardless of which
 * later stage accepts or rejects the request — a pipe-thrown `400` and a
 * handler-thrown exception are captured exactly as before, and a
 * guard-thrown rejection now is too. `StructuredLogInterceptor` has been
 * deleted along with its `@UseInterceptors` use on `RegistrationsController`
 * — keeping both would risk two lines per request for the same response.
 *
 * `req.user` is read lazily inside the `finish` callback, not at middleware
 * entry: middleware runs before guards, so `req.user` is not populated yet
 * when `use()` runs, but IS populated by the time `finish` fires if a guard
 * (e.g. `JwtAuthGuard`) authenticated the caller before allowing or
 * rejecting the request. Falls back to `'Public'` (the project's term for an
 * anonymous caller, root `CLAUDE.md`) — this module's routes run behind no
 * guard today (`app.module.ts` registers no global guard — FR-8), so every
 * current request takes this branch. A future `@Roles()`-guarded controller
 * in this module would populate `req.user` exactly as
 * `admin-actors.controller.ts` does today, and this same listener would read
 * the real role off it unchanged.
 *
 * **`route` is `req.path`.** Express parses the pathname separately from the
 * query string (`req.query`) and from the raw URL (`req.url`/`req.originalUrl`,
 * which still carries `?...`); `.path` structurally excludes it. That is what
 * makes "log the route" and "never log an email address" compatible: this
 * module's one PII-adjacent endpoint, `POST /registrations/lookup`, takes its
 * `reference`+`email` in the request body precisely so nothing PII-shaped
 * ever reaches the URL (design.md §3.1 decision 3) — but even if a caller (or
 * a future route) put something in the query string regardless, `req.path`
 * would still never surface it, because it is a different, disjoint parse of
 * the URL. None of this module's four routes takes a path parameter either,
 * so there is no path-segment PII risk to exclude separately.
 *
 * Nothing here reads `req.body` or `req.query` — structurally nothing in
 * this class could carry an OTP code, a phone number, an email address, or a
 * mail body (design.md §4.10's never-log list).
 *
 * Deliberately minimal (design.md §4.10): no incoming `X-Request-Id` header
 * is ever trusted as the id. Accepting a caller-supplied value would let an
 * unauthenticated caller inject an arbitrary correlator into the log stream
 * — a request id is generated here, never echoed from the request.
 *
 * Registered by the consuming module (see `RegistrationsModule.configure()`)
 * scoped to that module's own controllers via `MiddlewareConsumer.forRoutes`
 * — never as global middleware (`app.use(...)` in `main.ts`/`lambda.ts`),
 * which would apply it to every route in the app.
 */
import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Response } from 'express';
import { AuthUser } from '../auth/auth.types';
import { RequestWithId } from './request-context.types';

/** The six required fields (design.md §4.10) of one emitted log line. */
export interface StructuredLogLine {
  requestId: string;
  route: string;
  method: string;
  status: number;
  role: string;
  latencyMs: number;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('registrations');

  use(req: RequestWithId & { user?: AuthUser }, res: Response, next: NextFunction): void {
    req.requestId = randomUUID();

    const requestId = req.requestId;
    const route = req.path;
    const method = req.method;
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const role = req.user?.role ?? 'Public';
      const line: StructuredLogLine = {
        requestId,
        route,
        method,
        status: res.statusCode,
        role,
        latencyMs,
      };
      this.logger.log(JSON.stringify(line));
    });

    next();
  }
}
