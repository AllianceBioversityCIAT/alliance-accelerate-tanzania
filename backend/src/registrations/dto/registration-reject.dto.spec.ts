import 'reflect-metadata';
import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { createValidationPipe } from '../../common/validation-pipe';
import { DUPLICATE_OF_EXISTING_RECORD_REASON_CODE } from '../rejection-reasons';
import { RegistrationRejectDto } from './registration-reject.dto';

/**
 * T-9 — `RegistrationRejectDto` (FR-13 scenario 1's "AND IT MUST make the
 * reason mandatory" clause). Run through the PRODUCTION
 * `createValidationPipe()` — the same factory `main.ts`/`lambda.ts` install
 * globally and `admin-registrations.controller.ts`'s `reject()` handler runs
 * behind — so a passing test here is evidence about the real `400`, not a
 * hand-built pipe's approximation of it.
 */

const METADATA: ArgumentMetadata = {
  type: 'body',
  metatype: RegistrationRejectDto,
  data: undefined,
};

const pipe = createValidationPipe();

async function run(
  body: unknown,
): Promise<{ result?: RegistrationRejectDto; error?: BadRequestException }> {
  try {
    const result = (await pipe.transform(body, METADATA)) as RegistrationRejectDto;
    return { result };
  } catch (error) {
    return { error: error as BadRequestException };
  }
}

function details(error: BadRequestException): Array<{ field: string; message: string }> {
  return (error.getResponse() as { details: Array<{ field: string; message: string }> }).details;
}

describe('RegistrationRejectDto', () => {
  it('accepts a valid { reason } with no note', async () => {
    const { result, error } = await run({ reason: DUPLICATE_OF_EXISTING_RECORD_REASON_CODE });

    expect(error).toBeUndefined();
    expect(result).toBeInstanceOf(RegistrationRejectDto);
    expect(result!.reason).toBe(DUPLICATE_OF_EXISTING_RECORD_REASON_CODE);
    expect(result!.note).toBeUndefined();
  });

  it('accepts a valid { reason, note } and preserves the note verbatim', async () => {
    const { result, error } = await run({
      reason: DUPLICATE_OF_EXISTING_RECORD_REASON_CODE,
      note: 'Please contact us again once you have your own registration number.',
    });

    expect(error).toBeUndefined();
    expect(result!.note).toBe(
      'Please contact us again once you have your own registration number.',
    );
  });

  it(
    'FR-13 scenario 1 — a MISSING reason 400s with a field-specific detail — falsifying input: ' +
      'omit `reason` entirely',
    async () => {
      const { result, error } = await run({});

      expect(result).toBeUndefined();
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error!.getStatus()).toBe(400);
      expect(details(error!).some((d) => d.field === 'reason')).toBe(true);
    },
  );

  it('an EMPTY-STRING reason 400s the same way as a missing one', async () => {
    const { error } = await run({ reason: '' });

    expect(error).toBeInstanceOf(BadRequestException);
    expect(details(error!).some((d) => d.field === 'reason')).toBe(true);
  });

  it('an UNKNOWN reason code 400s — never silently accepted as free text', async () => {
    const { error } = await run({ reason: 'THIS_IS_NOT_A_KNOWN_REASON_CODE' });

    expect(error).toBeInstanceOf(BadRequestException);
    expect(details(error!).some((d) => d.field === 'reason')).toBe(true);
  });

  it('a note beyond the 2000-char cap 400s', async () => {
    const { error } = await run({
      reason: DUPLICATE_OF_EXISTING_RECORD_REASON_CODE,
      note: 'x'.repeat(2001),
    });

    expect(error).toBeInstanceOf(BadRequestException);
    expect(details(error!).some((d) => d.field === 'note')).toBe(true);
  });

  it('whitelist strips an unexpected extra field rather than rejecting or persisting it', async () => {
    const { result, error } = await run({
      reason: DUPLICATE_OF_EXISTING_RECORD_REASON_CODE,
      rejectedBySub: 'attempted-client-supplied-identity',
    });

    expect(error).toBeUndefined();
    expect((result as unknown as Record<string, unknown>).rejectedBySub).toBeUndefined();
  });
});
