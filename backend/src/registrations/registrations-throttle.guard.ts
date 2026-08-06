// @sdd-spec actors/public-self-registration (T-5)
/**
 * T-5 — Per-container rate limiting for every public registration route
 * (FR-7, NFR-4, `design.md` §4.4, DD-5).
 *
 * A thin subclass of `@nestjs/throttler`'s `ThrottlerGuard` — no tracker or
 * key-generation override is needed here: the library's default `getTracker`
 * (`req.ip`) and `generateKey` (per class + handler + tracker) are exactly
 * what FR-7 asks for. The subclass exists so the guard has a project-specific
 * name (matching `../auth/roles.guard.ts` / `../auth/jwt-auth.guard.ts`'s
 * naming convention) and one place to carry this module's limit/window
 * constants and the design rationale below, rather than applying a bare
 * third-party class directly to the controller.
 *
 * Applied ONCE, at the controller class level
 * (`@UseGuards(RegistrationsThrottleGuard)` on `RegistrationsController`) —
 * never per-method — so every route this module adds (T-8's `POST /verify`,
 * T-10's `POST /registrations`, T-11's `POST /lookup`) inherits it
 * automatically, exactly as `RegistrationsModule.configure()` scopes
 * `RequestContextMiddleware` via `forRoutes()` rather than per-handler.
 *
 * **Why a rejected request never opens a database connection (FR-7's other
 * clause).** Nest's request pipeline runs middleware → guards → interceptors
 * → pipes → handler, in that order. A guard that throws short-circuits
 * everything after it — no interceptor, no pipe, and critically no route
 * handler ever runs, so nothing this module's handlers would do (including
 * any Prisma call) executes for a throttled request. That is a structural
 * property of guard placement, not something this class implements — this
 * guard's `canActivate()` is untouched library code. `registrations-throttle.e2e.spec.ts`
 * proves it by driving real over-limit traffic at a Prisma-touching handler
 * and asserting the call count never advances past the point the guard
 * starts rejecting.
 *
 * **Known limitation, stated honestly (DC-19, DD-5).** The default in-memory
 * `ThrottlerStorageService` keeps its counters in this container's own
 * process memory: it bounds a single container, resets on cold start, and
 * does not span concurrent Lambda executions — so the effective global limit
 * is `containers × limit`, not a distributed cap. `design.md` §4.4 accepts
 * this explicitly and requires a second, shared control on every public
 * path this guard also covers: the per-email send cap on `EmailVerification`
 * rows for `POST /verify`; the OTP-gated write for `POST /registrations`;
 * constraints L-1…L-4 for `POST /lookup`; nothing extra for the static
 * `GET /consent-policy`. This guard is one layer of FR-7's abuse resistance,
 * never the only one.
 */
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Requests allowed per {@link REGISTRATIONS_THROTTLE_TTL_MS} window, per
 * tracker (caller IP, the library default). `design.md` §4.4 sizes this
 * module for ~150 expected total submissions — a generous per-caller
 * allowance comfortably covers one applicant's form fill, an OTP resend, and
 * a retry after a typo, while still bounding a scripted flood from a single
 * source. Not a distributed limit (see the class doc above).
 */
export const REGISTRATIONS_THROTTLE_LIMIT = 20;

/** Rolling window, in milliseconds — the unit `@nestjs/throttler` v6 expects. */
export const REGISTRATIONS_THROTTLE_TTL_MS = 60_000;

@Injectable()
export class RegistrationsThrottleGuard extends ThrottlerGuard {}
