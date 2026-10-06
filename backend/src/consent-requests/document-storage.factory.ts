import { S3Client } from '@aws-sdk/client-s3';
import { DocumentStorage } from './document-storage';
import { S3DocumentStorage } from './s3-document-storage';
import { UnconfiguredDocumentStorage } from './unconfigured-document-storage';

/**
 * Adapter selection (design.md §5.6): `CONSENT_DOCUMENTS_BUCKET` set selects
 * S3, absent or blank selects the unconfigured adapter (the local stack,
 * P-19). The S3 client takes its region and credentials from the Lambda
 * runtime environment, like the Cognito client.
 */
export function createDocumentStorage(env: NodeJS.ProcessEnv = process.env): DocumentStorage {
  const bucket = env.CONSENT_DOCUMENTS_BUCKET?.trim();
  return bucket ? new S3DocumentStorage(bucket, new S3Client({})) : new UnconfiguredDocumentStorage();
}
