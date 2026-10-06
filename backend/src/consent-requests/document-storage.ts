/**
 * actors/consent-intake/consent-request-email T-7 — the document storage port
 * (design.md §5.6). Two adapters: `S3DocumentStorage` (env
 * `CONSENT_DOCUMENTS_BUCKET` set) and `UnconfiguredDocumentStorage` (env
 * absent — the local stack, P-19). `ConsentDocumentsService` depends on this
 * interface only, so no test above the adapters needs the S3 SDK.
 */

/** Accepted upload types (FR-15). */
export const CONSENT_DOCUMENT_CONTENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export type ConsentDocumentContentType = (typeof CONSENT_DOCUMENT_CONTENT_TYPES)[number];

/** 10 MB, enforced by the storage-side POST policy and re-checked at confirm (FR-15, NFR-8). */
export const CONSENT_DOCUMENT_MAX_BYTES = 10_485_760;

/** Upload and download links last 5 minutes at most (FR-16, NFR-8). */
export const CONSENT_DOCUMENT_LINK_TTL_SECONDS = 300;

export const INCOMING_PREFIX = 'incoming/';
export const STORED_PREFIX = 'stored/';

export const incomingKey = (documentId: string): string => `${INCOMING_PREFIX}${documentId}`;
export const storedKey = (actorId: string, documentId: string): string =>
  `${STORED_PREFIX}${actorId}/${documentId}`;

export interface PresignedUpload {
  url: string;
  fields: Record<string, string>;
}

export interface PresignedDownload {
  url: string;
  expiresAt: string;
}

/** What `HeadObject` reports about an uploaded object, or `null` when it does not exist. */
export interface StoredObjectHead {
  sizeBytes: number | null;
  contentType: string | null;
}

export interface DocumentStorage {
  /** `false` for the unconfigured adapter: uploads and downloads are unavailable. */
  readonly enabled: boolean;
  presignUpload(input: { key: string; contentType: string }): Promise<PresignedUpload>;
  head(key: string): Promise<StoredObjectHead | null>;
  /** Copy `fromKey` to `toKey` inside the bucket. Does not delete the source. */
  copy(fromKey: string, toKey: string): Promise<void>;
  /** Delete one object. Deleting a missing key is not an error. */
  remove(key: string): Promise<void>;
  presignDownload(input: { key: string; fileName: string }): Promise<PresignedDownload>;
}

/** DI token for the port (an interface has no runtime value to inject by). */
export const DOCUMENT_STORAGE = Symbol('DOCUMENT_STORAGE');

/**
 * Build a header-safe `filename` for `Content-Disposition`. ASCII-only, no
 * path separators, quotes, backslashes or control characters, so a stored
 * `fileName` can never break out of the header value.
 */
export function sanitizeDownloadFileName(fileName: string): string {
  const cleaned = fileName
    .replace(/[^\x20-\x7E]/g, '_') // non-ASCII and control characters
    .replace(/["\\/;%]/g, '_') // quote, backslash, path separators, header/escape metacharacters
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '') // no leading dots
    .slice(0, 100);
  return cleaned.length > 0 ? cleaned : 'consent-document';
}
