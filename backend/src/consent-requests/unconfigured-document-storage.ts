import { ServiceUnavailableException } from '@nestjs/common';
import { DocumentStorage } from './document-storage';

/**
 * Selected when `CONSENT_DOCUMENTS_BUCKET` is absent (the local stack, P-19).
 * `enabled` is `false`, so the admin form says uploads are unavailable rather
 * than failing on submit (FR-15); every operation refuses with `503`.
 */
export class UnconfiguredDocumentStorage implements DocumentStorage {
  readonly enabled = false;

  private unavailable(): never {
    throw new ServiceUnavailableException('Consent document storage is not configured');
  }

  presignUpload(): Promise<never> {
    return this.unavailable();
  }
  head(): Promise<never> {
    return this.unavailable();
  }
  copy(): Promise<never> {
    return this.unavailable();
  }
  remove(): Promise<never> {
    return this.unavailable();
  }
  presignDownload(): Promise<never> {
    return this.unavailable();
  }
}
