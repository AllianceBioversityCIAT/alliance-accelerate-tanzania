// @sdd-spec actors/public-self-registration (T-5)
/**
 * T-5 — Shapes `ThrottlerException` into the project's standard error
 * envelope: `{ statusCode, error, message }` (FR-7, DC-26, A21). This is the
 * same `statusCode`/`error`/`message` shape `createValidationPipe()` uses for
 * its `400`s (`../common/validation-pipe.ts`), minus the field-level
 * `details` array, which only ever applies to a validation failure.
 *
 * `ThrottlerException` extends `HttpException` with a plain STRING response
 * (`node_modules/@nestjs/throttler/dist/throttler.exception.js`), so Nest's
 * built-in `BaseExceptionFilter` serialises it as
 * `{ statusCode: 429, message: "ThrottlerException: Too Many Requests" }` —
 * no `error` key at all. Left unfiltered, the frontend's `ApiError` mapping
 * (`frontend/lib/api/client.ts`) reads `envelope.message` straight into
 * user-facing copy, so that raw internal-sounding string would reach an
 * applicant verbatim (A21). This filter replaces both problems: a clean
 * `error: 'Too Many Requests'` — the same convention Nest's own built-in
 * exceptions use (`Bad Request`, `Not Found`, …) — and an applicant-facing
 * `message`.
 *
 * Registered at the controller level
 * (`@UseFilters(ThrottlerExceptionFilter)` on `RegistrationsController`),
 * scoped exactly like `RegistrationsThrottleGuard`. No bootstrap
 * (`main.ts`/`lambda.ts`) change is needed: Nest runs the exception-filter
 * pipeline identically for a guard-thrown exception as for any other
 * (confirmed in this spec's `execution.md`, T-4 discussion) — unlike T-7's
 * payload cap, nothing here requires registration ahead of the shared
 * bootstrap helpers.
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { ThrottlerException } from '@nestjs/throttler';

/** The documented `429` envelope (FR-7, DC-26) — never carries `details`, this is never a validation error. */
export interface ThrottledResponseBody {
  statusCode: number;
  error: string;
  message: string;
}

@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter {
  catch(_exception: ThrottlerException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body: ThrottledResponseBody = {
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      error: 'Too Many Requests',
      message: 'Too many requests. Please wait a moment and try again.',
    };
    response.status(HttpStatus.TOO_MANY_REQUESTS).json(body);
  }
}
