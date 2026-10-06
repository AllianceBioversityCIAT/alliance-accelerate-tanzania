import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  CONSENT_DOCUMENT_LINK_TTL_SECONDS,
  CONSENT_DOCUMENT_MAX_BYTES,
  DocumentStorage,
  PresignedDownload,
  PresignedUpload,
  StoredObjectHead,
  sanitizeDownloadFileName,
} from './document-storage';

/**
 * actors/consent-intake/consent-request-email T-7 — the S3 adapter (design.md
 * §5.6, §7.4). Presigned POST (not PUT) because only a POST policy can bound
 * the upload size (DD-8).
 */
export class S3DocumentStorage implements DocumentStorage {
  readonly enabled = true;

  constructor(
    private readonly bucket: string,
    private readonly client: S3Client,
  ) {}

  async presignUpload(input: { key: string; contentType: string }): Promise<PresignedUpload> {
    const { url, fields } = await createPresignedPost(this.client, {
      Bucket: this.bucket,
      Key: input.key,
      // The size bound lives in the signed policy, so storage refuses an
      // oversize or wrong-type upload itself (FR-15). `Fields['Content-Type']`
      // makes the SDK add the exact-match `{ "Content-Type": <type> }` condition.
      Conditions: [['content-length-range', 1, CONSENT_DOCUMENT_MAX_BYTES]],
      Fields: { 'Content-Type': input.contentType },
      Expires: CONSENT_DOCUMENT_LINK_TTL_SECONDS,
    });
    return { url, fields };
  }

  async head(key: string): Promise<StoredObjectHead | null> {
    try {
      const out = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: out.ContentLength ?? null, contentType: out.ContentType ?? null };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: toKey,
        CopySource: `${this.bucket}/${fromKey.split('/').map(encodeURIComponent).join('/')}`,
      }),
    );
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async presignDownload(input: { key: string; fileName: string }): Promise<PresignedDownload> {
    const expiresIn = CONSENT_DOCUMENT_LINK_TTL_SECONDS;
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        // Always an attachment, never rendered inline (FR-16).
        ResponseContentDisposition: `attachment; filename="${sanitizeDownloadFileName(input.fileName)}"`,
      }),
      { expiresIn },
    );
    return { url, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
  }
}

/**
 * ONLY a genuine miss counts as "not found". A 403 must stay an error: it
 * means the role lacks `s3:ListBucket` on `incoming/*` (S3 hides a missing key
 * behind 403 without it) or is otherwise misconfigured, and silently mapping
 * it to "missing" would turn an IAM defect into a misleading 422.
 */
function isNotFound(err: unknown): boolean {
  if (err instanceof S3ServiceException) {
    return err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404;
  }
  return false;
}
