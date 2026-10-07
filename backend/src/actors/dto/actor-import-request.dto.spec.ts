import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActorImportRequestDto } from './actor-import-request.dto';

/** T-5 — a valid confirmation entry, reused across the new assertions below. */
const validConfirmation = { row: 5, candidates: ['actor:a1', 'row:3'] };

/**
 * T-4 — Unit tests for the actor bulk-import request DTO (FR-2, FR-3, FR-6, NFR-1).
 *
 * Like the other actor DTO specs, these exercise `class-validator` directly (no
 * controller) so a non-empty error array means the input would yield a 400 once
 * wired. The focus is the `.xlsx` filename gate, base64 payload validation, the
 * preview/commit mode enum, and the optional acknowledgement flag.
 */

/** Helper: which property names produced at least one constraint violation. */
async function invalidProps(dto: object): Promise<string[]> {
  const errors = await validate(dto);
  return errors.map((e) => e.property);
}

/** A small, valid base64 payload standing in for the workbook bytes. */
const validBase64 = Buffer.from('fake-xlsx-bytes').toString('base64');

describe('ActorImportRequestDto', () => {
  const validPreview = {
    fileName: 'actor-import.xlsx',
    fileBase64: validBase64,
    mode: 'preview',
  };

  it('passes a valid preview payload', async () => {
    const dto = plainToInstance(ActorImportRequestDto, validPreview);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('passes a valid commit payload with acknowledged', async () => {
    const dto = plainToInstance(ActorImportRequestDto, {
      ...validPreview,
      mode: 'commit',
      acknowledged: true,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a .csv filename', async () => {
    const dto = plainToInstance(ActorImportRequestDto, {
      ...validPreview,
      fileName: 'actor-import.csv',
    });
    expect(await invalidProps(dto)).toContain('fileName');
  });

  it('rejects a .xls filename', async () => {
    const dto = plainToInstance(ActorImportRequestDto, {
      ...validPreview,
      fileName: 'actor-import.xls',
    });
    expect(await invalidProps(dto)).toContain('fileName');
  });

  it('rejects non-base64 file content', async () => {
    const dto = plainToInstance(ActorImportRequestDto, {
      ...validPreview,
      fileBase64: '!!! not base64 !!!',
    });
    expect(await invalidProps(dto)).toContain('fileBase64');
  });

  it('rejects an unknown mode', async () => {
    const dto = plainToInstance(ActorImportRequestDto, {
      ...validPreview,
      mode: 'apply',
    });
    expect(await invalidProps(dto)).toContain('mode');
  });

  it('rejects a non-boolean acknowledged value', async () => {
    const dto = plainToInstance(ActorImportRequestDto, {
      ...validPreview,
      acknowledged: 'yes',
    });
    expect(await invalidProps(dto)).toContain('acknowledged');
  });

  it('rejects missing required fields', async () => {
    const dto = plainToInstance(ActorImportRequestDto, {});
    const props = await invalidProps(dto);
    expect(props).toContain('fileName');
    expect(props).toContain('fileBase64');
    expect(props).toContain('mode');
  });

  // T-5 (actors/consent-intake/intake-required-fields, design.md §3) —
  // `duplicateConfirmations`.
  describe('duplicateConfirmations (T-5)', () => {
    it('passes when omitted entirely', async () => {
      const dto = plainToInstance(ActorImportRequestDto, validPreview);
      expect(await invalidProps(dto)).not.toContain('duplicateConfirmations');
    });

    it('passes a well-formed confirmation list', async () => {
      const dto = plainToInstance(ActorImportRequestDto, {
        ...validPreview,
        duplicateConfirmations: [validConfirmation],
      });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rejects a non-integer row number', async () => {
      const dto = plainToInstance(ActorImportRequestDto, {
        ...validPreview,
        duplicateConfirmations: [{ ...validConfirmation, row: 'five' }],
      });
      expect(await invalidProps(dto)).toContain('duplicateConfirmations');
    });

    it('rejects a row number below 2 (the first data row)', async () => {
      const dto = plainToInstance(ActorImportRequestDto, {
        ...validPreview,
        duplicateConfirmations: [{ ...validConfirmation, row: 1 }],
      });
      expect(await invalidProps(dto)).toContain('duplicateConfirmations');
    });

    it('rejects a non-string candidate key', async () => {
      const dto = plainToInstance(ActorImportRequestDto, {
        ...validPreview,
        duplicateConfirmations: [{ row: 5, candidates: [42] }],
      });
      expect(await invalidProps(dto)).toContain('duplicateConfirmations');
    });

    it('rejects more than 1,000 entries', async () => {
      const dto = plainToInstance(ActorImportRequestDto, {
        ...validPreview,
        duplicateConfirmations: Array.from({ length: 1001 }, (_, i) => ({
          row: i + 2,
          candidates: ['actor:a1'],
        })),
      });
      expect(await invalidProps(dto)).toContain('duplicateConfirmations');
    });

    it('accepts exactly 1,000 entries', async () => {
      const dto = plainToInstance(ActorImportRequestDto, {
        ...validPreview,
        duplicateConfirmations: Array.from({ length: 1000 }, (_, i) => ({
          row: i + 2,
          candidates: ['actor:a1'],
        })),
      });
      expect(await validate(dto)).toHaveLength(0);
    });
  });
});
