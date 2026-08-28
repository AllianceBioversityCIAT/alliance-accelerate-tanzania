import 'reflect-metadata';
import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { createValidationPipe } from '../../common/validation-pipe';
import { CONTACT_CATEGORIES } from '../contact-categories';
import { ContactCreateDto } from './contact-create.dto';

/**
 * T-4 — Tests for `ContactCreateDto` (design.md §4.1.1; requirements.md FR-2
 * both scenarios, FR-6, FR-8).
 *
 * Run through the PRODUCTION `createValidationPipe()` — not a hand-built
 * `new ValidationPipe({...})` — via `pipe.transform(body, metadata)`, exactly
 * the call NestJS's router makes per controller argument. This is the same
 * factory `main.ts`/`lambda.ts` install globally, so `whitelist: true` and
 * the `details` envelope behave here exactly as they will once T-6 wires
 * this DTO into a route.
 */

const METADATA: ArgumentMetadata = {
  type: 'body',
  metatype: ContactCreateDto,
  data: undefined,
};

const pipe = createValidationPipe();

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Neema Shirima',
    email: 'neema@khsc.co.tz',
    organization: 'Mbeya Seed Traders Ltd',
    category: 'General inquiry',
    subject: 'Question about actor data',
    message: 'Could you clarify how actor records are verified?',
    privacyAcknowledged: true,
    ...overrides,
  };
}

/** Runs `body` through the production pipe and captures either outcome. */
async function run(
  body: unknown,
): Promise<{ result?: ContactCreateDto; error?: BadRequestException }> {
  try {
    const result = (await pipe.transform(body, METADATA)) as ContactCreateDto;
    return { result };
  } catch (error) {
    return { error: error as BadRequestException };
  }
}

function details(error: BadRequestException): Array<{ field: string; message: string }> {
  return (error.getResponse() as { details: Array<{ field: string; message: string }> }).details;
}

describe('ContactCreateDto — happy path', () => {
  it('accepts a fully valid submission and preserves every field through whitelist', async () => {
    const { result, error } = await run(validBody());

    expect(error).toBeUndefined();
    expect(result).toBeInstanceOf(ContactCreateDto);
    expect(result!.name).toBe('Neema Shirima');
    expect(result!.email).toBe('neema@khsc.co.tz');
    expect(result!.organization).toBe('Mbeya Seed Traders Ltd');
    expect(result!.category).toBe('General inquiry');
    expect(result!.subject).toBe('Question about actor data');
    expect(result!.message).toBe('Could you clarify how actor records are verified?');
    expect(result!.privacyAcknowledged).toBe(true);
  });

  it('accepts a submission with organization omitted (optional field)', async () => {
    const body = validBody();
    delete body.organization;
    const { result, error } = await run(body);

    expect(error).toBeUndefined();
    expect(result!.organization).toBeUndefined();
  });
});

describe('ContactCreateDto — privacyAcknowledged gate (FR-6, the DONE WHEN case)', () => {
  it('REJECTS privacyAcknowledged: false — the case a bare @IsBoolean() would let through', async () => {
    const { result, error } = await run(validBody({ privacyAcknowledged: false }));

    expect(result).toBeUndefined();
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error!.getStatus()).toBe(400);
    expect(details(error!).some((d) => d.field === 'privacyAcknowledged')).toBe(true);
  });

  it('rejects a missing privacyAcknowledged', async () => {
    const body = validBody();
    delete body.privacyAcknowledged;
    const { error } = await run(body);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(details(error!).some((d) => d.field === 'privacyAcknowledged')).toBe(true);
  });

  it('rejects a truthy non-boolean privacyAcknowledged (e.g. the string "true")', async () => {
    const { error } = await run(validBody({ privacyAcknowledged: 'true' }));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(details(error!).some((d) => d.field === 'privacyAcknowledged')).toBe(true);
  });

  it('accepts privacyAcknowledged: true', async () => {
    const { result, error } = await run(validBody({ privacyAcknowledged: true }));

    expect(error).toBeUndefined();
    expect(result!.privacyAcknowledged).toBe(true);
  });
});

describe('ContactCreateDto — category is a fixed, server-enforced set (FR-2 scenario 2)', () => {
  it.each(CONTACT_CATEGORIES)('accepts the listed category %j', async (category) => {
    const { result, error } = await run(validBody({ category }));

    expect(error).toBeUndefined();
    expect(result!.category).toBe(category);
  });

  it('REJECTS an off-list category server-side', async () => {
    const { result, error } = await run(validBody({ category: 'Not a real category' }));

    expect(result).toBeUndefined();
    expect(error).toBeInstanceOf(BadRequestException);
    expect(details(error!).some((d) => d.field === 'category')).toBe(true);
  });

  it('rejects a missing category', async () => {
    const body = validBody();
    delete body.category;
    const { error } = await run(body);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(details(error!).some((d) => d.field === 'category')).toBe(true);
  });
});

describe('ContactCreateDto — every free-text field is bound (design.md §4.2)', () => {
  const cases: Array<{ field: string; maxLength: number }> = [
    { field: 'name', maxLength: 200 },
    { field: 'organization', maxLength: 200 },
    { field: 'subject', maxLength: 200 },
    { field: 'message', maxLength: 4000 },
  ];

  it.each(cases)('rejects $field over its $maxLength-char bound', async ({ field, maxLength }) => {
    const { error } = await run(validBody({ [field]: 'x'.repeat(maxLength + 1) }));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(details(error!).some((d) => d.field === field)).toBe(true);
  });

  it('accepts every free-text field exactly at its bound', async () => {
    const atBound = Object.fromEntries(cases.map(({ field, maxLength }) => [field, 'x'.repeat(maxLength)]));
    const { error } = await run(validBody(atBound));

    expect(error).toBeUndefined();
  });

  it('rejects an email over 254 characters', async () => {
    const overLong = `${'x'.repeat(246)}@example.com`; // > 254 chars total
    expect(overLong.length).toBeGreaterThan(254);
    const { error } = await run(validBody({ email: overLong }));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(details(error!).some((d) => d.field === 'email')).toBe(true);
  });

  it('rejects a malformed email', async () => {
    const { error } = await run(validBody({ email: 'not-an-email' }));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(details(error!).some((d) => d.field === 'email')).toBe(true);
  });

  it('rejects a missing required field with a details entry naming it', async () => {
    const body = validBody();
    delete body.name;
    const { error } = await run(body);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(details(error!).some((d) => d.field === 'name')).toBe(true);
  });
});

describe('ContactCreateDto — required strings reject the empty string (design.md §4.1.1 amendment, 2026-08-28)', () => {
  const requiredStringFields = ['name', 'subject', 'message'];

  it.each(requiredStringFields)(
    'rejects %s: "" with a details entry naming it — a bare @IsString()/@MaxLength() would accept it',
    async (field) => {
      const { result, error } = await run(validBody({ [field]: '' }));

      expect(result).toBeUndefined();
      expect(error).toBeInstanceOf(BadRequestException);
      expect(details(error!).some((d) => d.field === field)).toBe(true);
    },
  );

  it('accepts organization: "" — optional strings treat "" as "not provided", never MinLength(1)', async () => {
    const { result, error } = await run(validBody({ organization: '' }));

    expect(error).toBeUndefined();
    expect(result!.organization).toBe('');
  });

  it('accepts website: "" — the honeypot stays uncapped and without MinLength(1)', async () => {
    const { result, error } = await run(validBody({ website: '' }));

    expect(error).toBeUndefined();
    expect(result!.website).toBe('');
  });
});

describe('ContactCreateDto — the honeypot (FR-8)', () => {
  it(
    'SURVIVES whitelist: true — a submitted honeypot value ARRIVES on the validated output, not ' +
      'merely asserted-declared (KZ-002: a presence check on the decorator is not a behavioral proof)',
    async () => {
      const { result, error } = await run(validBody({ website: 'https://spam.example/offer' }));

      expect(error).toBeUndefined();
      expect(result).toBeInstanceOf(ContactCreateDto);
      expect(result!.website).toBe('https://spam.example/offer');
    },
  );

  it('accepts a submission with the honeypot omitted (the legitimate case)', async () => {
    const { result, error } = await run(validBody());

    expect(error).toBeUndefined();
    expect(result!.website).toBeUndefined();
  });

  it(
    'does NOT reject an extremely long honeypot value — no length cap, so it never returns a ' +
      '400 naming the field and handing an attacker the trap to avoid',
    async () => {
      const veryLong = 'x'.repeat(20_000);
      const { result, error } = await run(validBody({ website: veryLong }));

      expect(error).toBeUndefined();
      expect(result!.website).toBe(veryLong);
    },
  );

  it('rejects a non-string honeypot value (still validated, just uncapped in length)', async () => {
    const { error } = await run(validBody({ website: 12345 }));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(details(error!).some((d) => d.field === 'website')).toBe(true);
  });
});

describe('ContactCreateDto — field-level 400 shape (multiple simultaneous violations)', () => {
  it('rejects a submission with a malformed email, off-list category and unchecked privacy box, one details entry per field', async () => {
    const { error } = await run({
      name: 'Neema Shirima',
      email: 'not-an-email',
      category: 'Not a real category',
      subject: 'Subject',
      message: 'Message body',
      privacyAcknowledged: false,
    });

    expect(error).toBeInstanceOf(BadRequestException);
    const body = error!.getResponse() as { statusCode: number; details: unknown[] };
    expect(body.statusCode).toBe(400);
    const fields = details(error!).map((d) => d.field);
    expect(fields).toContain('email');
    expect(fields).toContain('category');
    expect(fields).toContain('privacyAcknowledged');
  });
});
