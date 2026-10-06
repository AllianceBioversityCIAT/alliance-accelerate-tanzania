/**
 * T-7 — Validated body for `POST admin/actors/:id/consent-documents/upload-url`
 * (design.md §5.6, §6). Type and size are declared here and enforced AGAIN by
 * the signed POST policy and by the confirm-time `HeadObject` comparison, so a
 * client that skips this check still cannot store a wrong file (FR-15).
 */

import { IsIn, IsInt, IsString, Length, Max, Min } from 'class-validator';
import {
  CONSENT_DOCUMENT_CONTENT_TYPES,
  CONSENT_DOCUMENT_MAX_BYTES,
  ConsentDocumentContentType,
} from '../document-storage';

export class ConsentDocumentUploadUrlDto {
  @IsString()
  @Length(1, 255)
  fileName!: string;

  @IsIn(CONSENT_DOCUMENT_CONTENT_TYPES as readonly string[])
  contentType!: ConsentDocumentContentType;

  @IsInt()
  @Min(1)
  @Max(CONSENT_DOCUMENT_MAX_BYTES)
  sizeBytes!: number;
}
