import { BadRequestException, ValidationError } from '@nestjs/common';
import {
  createValidationPipe,
  flattenValidationErrors,
} from './validation-pipe';

/**
 * W-1 remediation (spec admin/actor-crud-audit, validation-report §10 R-2):
 * the global pipe must emit `details: [{ field, message }]` so API clients
 * (the admin actor form, FR-8) can map 400s back to fields.
 */

function error(
  property: string,
  constraints?: Record<string, string>,
  children?: ValidationError[],
): ValidationError {
  return {
    property,
    constraints,
    children: children ?? [],
  } as ValidationError;
}

describe('flattenValidationErrors', () => {
  it('maps one { field, message } entry per failing property', () => {
    const details = flattenValidationErrors([
      error('region', { isIn: 'region must be a canonical region' }),
      error('email', { isEmail: 'email must be an email' }),
    ]);
    expect(details).toEqual([
      { field: 'region', message: 'region must be a canonical region' },
      { field: 'email', message: 'email must be an email' },
    ]);
  });

  it('uses the first constraint message when several fail', () => {
    const details = flattenValidationErrors([
      error('traderId', {
        minLength: 'traderId must be longer than or equal to 1 characters',
        isString: 'traderId must be a string',
      }),
    ]);
    expect(details).toHaveLength(1);
    expect(details[0].field).toBe('traderId');
    expect(typeof details[0].message).toBe('string');
  });

  it('flattens nested children with dot paths', () => {
    const details = flattenValidationErrors([
      error('gps', undefined, [
        error('latitude', { max: 'latitude must not be greater than 90' }),
      ]),
    ]);
    expect(details).toEqual([
      { field: 'gps.latitude', message: 'latitude must not be greater than 90' },
    ]);
  });

  it('returns an empty array for no errors', () => {
    expect(flattenValidationErrors([])).toEqual([]);
  });
});

describe('createValidationPipe exceptionFactory', () => {
  it('produces a BadRequestException with the { message, details } envelope', () => {
    const pipe = createValidationPipe();
    // Access the configured factory the same way Nest does.
    const factory = (
      pipe as unknown as {
        exceptionFactory: (errors: ValidationError[]) => unknown;
      }
    ).exceptionFactory;

    const exception = factory([
      error('region', { isIn: 'region must be a canonical region' }),
    ]) as BadRequestException;

    expect(exception).toBeInstanceOf(BadRequestException);
    const body = exception.getResponse() as Record<string, unknown>;
    expect(body.statusCode).toBe(400);
    expect(body.message).toBe('Validation failed');
    expect(body.details).toEqual([
      { field: 'region', message: 'region must be a canonical region' },
    ]);
  });
});
