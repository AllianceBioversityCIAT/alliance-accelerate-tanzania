import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { S3DocumentStorage } from './s3-document-storage';

/**
 * actors/consent-intake/consent-request-email T-7 — the S3 adapter.
 *
 * The presign tests run the REAL `createPresignedPost` / `getSignedUrl` with
 * static dummy credentials (signing is local, no network) and decode what was
 * actually signed — so they pin the exact policy conditions, expiry and
 * disposition rather than "the SDK was called". Live IAM and bucket behaviour
 * are NOT evaluable here and are owned by T-14.
 */

const BUCKET = 'accelerate-tz-dev-backend-consent-docs-test';

function realSigningClient(): S3Client {
  return new S3Client({
    region: 'eu-west-1',
    credentials: { accessKeyId: 'AKIATESTTESTTESTTEST', secretAccessKey: 'test-secret-access-key' },
  });
}

function decodePolicy(fields: Record<string, string>): { expiration: string; conditions: unknown[] } {
  return JSON.parse(Buffer.from(fields.Policy, 'base64').toString('utf8'));
}

describe('S3DocumentStorage.presignUpload', () => {
  const storage = new S3DocumentStorage(BUCKET, realSigningClient());

  it('signs a POST policy with the exact key, content-length-range 1..10485760 and the exact Content-Type', async () => {
    const { url, fields } = await storage.presignUpload({ key: 'incoming/doc-1', contentType: 'application/pdf' });
    const policy = decodePolicy(fields);

    expect(url).toContain(BUCKET);
    expect(fields.key).toBe('incoming/doc-1');
    expect(fields['Content-Type']).toBe('application/pdf');
    expect(policy.conditions).toEqual(
      expect.arrayContaining([
        ['content-length-range', 1, 10485760],
        { 'Content-Type': 'application/pdf' },
        { key: 'incoming/doc-1' },
        { bucket: BUCKET },
      ]),
    );
    // No loosening: nothing that wildcards the key or the type.
    const serialized = JSON.stringify(policy.conditions);
    expect(serialized).not.toContain('starts-with');
  });

  it('expires in 300 seconds', async () => {
    const before = Date.now();
    const { fields } = await storage.presignUpload({ key: 'incoming/doc-2', contentType: 'image/png' });
    const after = Date.now();
    const expiresAt = Date.parse(decodePolicy(fields).expiration);
    // iso8601 drops milliseconds, so allow one second of truncation either side.
    expect(expiresAt).toBeGreaterThanOrEqual(before + 300_000 - 1000);
    expect(expiresAt).toBeLessThanOrEqual(after + 300_000);
  });
});

describe('S3DocumentStorage.presignDownload', () => {
  const storage = new S3DocumentStorage(BUCKET, realSigningClient());

  it('signs a GET on the stored key that expires in 300 s and forces an attachment disposition', async () => {
    const before = Date.now();
    const { url, expiresAt } = await storage.presignDownload({
      key: 'stored/actor-1/doc-1',
      fileName: 'Signed "form".pdf',
    });
    const parsed = new URL(url);

    expect(parsed.pathname).toBe('/stored/actor-1/doc-1');
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(parsed.searchParams.get('response-content-disposition')).toBe('attachment; filename="Signed _form_.pdf"');
    expect(Date.parse(expiresAt)).toBeGreaterThanOrEqual(before + 300_000);
    expect(Date.parse(expiresAt)).toBeLessThanOrEqual(Date.now() + 300_000);
  });
});

describe('S3DocumentStorage object operations', () => {
  const s3Mock = mockClient(S3Client);
  const storage = new S3DocumentStorage(BUCKET, new S3Client({ region: 'eu-west-1' }));

  beforeEach(() => s3Mock.reset());

  it('head returns size and type', async () => {
    s3Mock.on(HeadObjectCommand).resolves({ ContentLength: 1024, ContentType: 'application/pdf' });
    await expect(storage.head('incoming/x')).resolves.toEqual({ sizeBytes: 1024, contentType: 'application/pdf' });
    expect(s3Mock.commandCalls(HeadObjectCommand)[0].args[0].input).toEqual({ Bucket: BUCKET, Key: 'incoming/x' });
  });

  it('head returns null for a missing object and rethrows other failures', async () => {
    s3Mock.on(HeadObjectCommand).rejectsOnce(
      new S3ServiceException({ name: 'NotFound', $fault: 'client', $metadata: { httpStatusCode: 404 } }),
    );
    await expect(storage.head('incoming/x')).resolves.toBeNull();

    s3Mock.on(HeadObjectCommand).rejectsOnce(
      new S3ServiceException({ name: 'AccessDenied', $fault: 'client', $metadata: { httpStatusCode: 403 } }),
    );
    await expect(storage.head('incoming/x')).rejects.toThrow();
  });

  it('a 403 from HeadObject is a real error, never "missing" (the role needs s3:ListBucket on the bucket for S3 to answer 404)', async () => {
    s3Mock.on(HeadObjectCommand).rejects(
      new S3ServiceException({ name: 'Forbidden', $fault: 'client', $metadata: { httpStatusCode: 403 } }),
    );
    await expect(storage.head('incoming/x')).rejects.toMatchObject({ name: 'Forbidden' });
  });

  it('copy sends CopyObject from the incoming key to the destination in the same bucket', async () => {
    s3Mock.on(CopyObjectCommand).resolves({});
    await storage.copy('incoming/doc-1', 'stored/actor-1/doc-1');
    expect(s3Mock.commandCalls(CopyObjectCommand)[0].args[0].input).toEqual({
      Bucket: BUCKET,
      Key: 'stored/actor-1/doc-1',
      CopySource: `${BUCKET}/incoming/doc-1`,
    });
  });

  it('remove sends DeleteObject', async () => {
    s3Mock.on(DeleteObjectCommand).resolves({});
    await storage.remove('incoming/doc-1');
    expect(s3Mock.commandCalls(DeleteObjectCommand)[0].args[0].input).toEqual({ Bucket: BUCKET, Key: 'incoming/doc-1' });
  });
});
