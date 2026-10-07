/**
 * T-3 — Validated request body for `POST .../consent-requests/preview` and
 * `POST .../consent-requests` (design.md §5.1, §6).
 *
 * The target is a discriminated union: `{ kind: 'ids', ids }` (≤ 1000,
 * matching the import row cap) or `{ kind: 'filter', filter }`, where
 * `filter` takes the SAME five fields `AdminActorListQueryDto` accepts
 * (region, traderType, consentStatus, registrationSource, consentMethod) —
 * never the pagination fields, and never a sixth field. `@ValidateIf` picks
 * which branch's shape is enforced, mirroring `actor-import-request.dto.ts`'s
 * nested-DTO pattern.
 */

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ConsentMethod, RegistrationSource } from '@prisma/client';

const CONSENT_STATUSES = ['GRANTED', 'DENIED', 'UNKNOWN'] as const;
const MAX_IDS = 1000;

/** The five filter fields a consent-request "all matching" target accepts — identical to `AdminActorListQueryDto`'s, minus pagination. */
export class ConsentRequestFilterDto {
  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  traderType?: string;

  @IsOptional()
  @IsIn(CONSENT_STATUSES)
  consentStatus?: string;

  @IsOptional()
  @IsIn(Object.values(RegistrationSource))
  registrationSource?: RegistrationSource;

  @IsOptional()
  @IsIn(Object.values(ConsentMethod))
  consentMethod?: ConsentMethod;
}

export class ConsentRequestTargetDto {
  @IsIn(['ids', 'filter'])
  kind!: 'ids' | 'filter';

  @ValidateIf((o: ConsentRequestTargetDto) => o.kind === 'ids')
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_IDS)
  @IsString({ each: true })
  ids?: string[];

  @ValidateIf((o: ConsentRequestTargetDto) => o.kind === 'filter')
  @ValidateNested()
  @Type(() => ConsentRequestFilterDto)
  filter?: ConsentRequestFilterDto;
}

export class ConsentRequestSendDto {
  @ValidateNested()
  @Type(() => ConsentRequestTargetDto)
  target!: ConsentRequestTargetDto;

  @IsIn(['single', 'bulk'])
  scope!: 'single' | 'bulk';
}
