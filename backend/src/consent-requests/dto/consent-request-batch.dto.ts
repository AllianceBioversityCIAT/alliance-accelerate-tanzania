/**
 * T-4 — Validated body for `POST .../consent-requests/dispatch` and
 * `POST .../consent-requests/retry` (design.md §5.2 steps 2, 4, §6). Both
 * accept an optional `batchId`; omitted, they act across ALL batches.
 */
import { IsOptional, IsString } from 'class-validator';

export class ConsentRequestBatchDto {
  @IsOptional()
  @IsString()
  batchId?: string;
}
