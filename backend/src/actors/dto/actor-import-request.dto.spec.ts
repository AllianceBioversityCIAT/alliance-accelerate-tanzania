import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActorImportRequestDto } from './actor-import-request.dto';

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
});
