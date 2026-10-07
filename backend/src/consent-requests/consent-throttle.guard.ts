/**
 * actors/consent-intake/consent-request-email T-5 — per-container rate
 * limit for the two public consent-link routes (NFR-4, design.md §5.4).
 *
 * A thin `ThrottlerGuard` subclass, exactly `RegistrationsThrottleGuard`'s
 * shape: the library's default tracker (`req.ip`) and key (class + handler +
 * tracker) are what NFR-4 asks for, and the subclass exists for a
 * project-specific name and one home for the limit constants below.
 * `ConsentPublicController` applies the same figures through `@Throttle`, so
 * the 20-per-60-s ceiling does not silently follow whatever
 * `RegistrationsModule`'s `forRoot` happens to say.
 *
 * **No `ThrottlerModule.forRoot` here (P-31).** `RegistrationsModule`
 * registers the module once, globally; a second `forRoot` would create
 * competing tokens resolved by import order — the `ContactModule` precedent.
 *
 * A guard that throws short-circuits the pipeline, so a throttled request
 * never reaches the handler or Prisma, and a `429` carries nothing about the
 * token (NFR-4). Same known limitation as the registrations guard: the
 * in-memory storage bounds one container, not the fleet. The second control
 * on this surface is the token itself (256 bits, hash lookup, NFR-1).
 */
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Requests allowed per {@link CONSENT_THROTTLE_TTL_MS} window, per caller IP and route. */
export const CONSENT_THROTTLE_LIMIT = 20;

/** Rolling window in milliseconds (the unit `@nestjs/throttler` v6 expects). */
export const CONSENT_THROTTLE_TTL_MS = 60_000;

@Injectable()
export class ConsentThrottleGuard extends ThrottlerGuard {}
