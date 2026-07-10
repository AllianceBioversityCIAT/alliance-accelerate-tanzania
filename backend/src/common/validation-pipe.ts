import {
  ArgumentMetadata,
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';

/**
 * Shared global ValidationPipe factory (W-1 remediation,
 * spec admin/actor-crud-audit validation-report §10 R-2).
 *
 * Nest's default 400 envelope carries the constraint messages as a flat
 * `message: string[]`, which gives API clients no reliable way to map an
 * error back to the offending field. The admin actor form (FR-8) renders
 * server-side validation errors inline per field, so the API contract needs
 * an explicit `details: [{ field, message }]` array.
 *
 * Every bootstrap path (main.ts, lambda.ts) and every e2e suite MUST build
 * its pipe through this factory so the deployed envelope and the tested
 * envelope can never drift.
 */

export interface FieldErrorDetail {
  field: string;
  message: string;
}

/**
 * Flatten class-validator errors (including nested children) into
 * `{ field, message }` pairs. Nested properties use dot paths
 * (`parent.child`). One entry per field: the first constraint message —
 * enough for inline display without leaking every internal rule at once.
 */
export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): FieldErrorDetail[] {
  const details: FieldErrorDetail[] = [];
  for (const error of errors) {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    if (error.constraints) {
      details.push({ field: path, message: Object.values(error.constraints)[0] });
    }
    if (error.children && error.children.length > 0) {
      details.push(...flattenValidationErrors(error.children, path));
    }
  }
  return details;
}

/**
 * True for a body value that would crash class-validator's `whitelist` step,
 * which iterates and `delete`s keys off the value: a Buffer/typed array (delete
 * on a fixed index throws `TypeError`), an array, or a primitive. A well-formed
 * request body is always a plain JSON object; `null`/`undefined` are left to the
 * base pipe. This is the defense-in-depth counterpart to
 * {@link normalizeServerlessJsonBody}: even if an unparsed body reached the pipe,
 * it must become a clean 400 — never a 500.
 */
function isUnsafeBodyValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value !== 'object') {
    return true;
  }
  return Buffer.isBuffer(value) || ArrayBuffer.isView(value) || Array.isArray(value);
}

/**
 * ValidationPipe that rejects a non-object request body with the shared 400
 * envelope BEFORE class-validator runs, so a raw Buffer (or any non-object) can
 * never reach — and crash — the `whitelist` step. Only the `body` argument is
 * guarded; query/param/custom values pass straight through to the base pipe.
 */
class BodyShapeValidationPipe extends ValidationPipe {
  async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    if (metadata.type === 'body' && isUnsafeBodyValue(value)) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Request body must be a JSON object',
        details: [],
      });
    }
    return super.transform(value, metadata);
  }
}

export function createValidationPipe(): ValidationPipe {
  return new BodyShapeValidationPipe({
    transform: true,
    whitelist: true,
    exceptionFactory: (errors: ValidationError[]) =>
      new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        details: flattenValidationErrors(errors),
      }),
  });
}
