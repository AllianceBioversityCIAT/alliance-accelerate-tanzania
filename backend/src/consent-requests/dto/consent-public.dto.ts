/**
 * actors/consent-intake/consent-request-email T-5 — request bodies for the
 * two public consent-link routes (design.md §5.4, §6).
 *
 * **The token is declared with `@Allow()` and nothing else (B-5).** A shape
 * validator on it (`@IsString`, `@Length`, a base64url pattern) would turn a
 * malformed token into a `400` — a distinguishable answer that tells a
 * prober the token was the wrong SHAPE, which the uniform `404` (FR-11,
 * NFR-2) exists to hide. `@Allow()` only keeps the property through the
 * global pipe's `whitelist`; `ConsentPublicService` maps a missing,
 * non-string, any-length, any-alphabet token to the same miss.
 *
 * Every `400` this file can produce therefore names `decision`,
 * `respondent.*` or `accepted` — never `token` — so it reveals nothing about
 * the token. Accept requires a complete respondent identity and an explicit
 * `accepted === true` server-side, not only in the page (FR-9); Decline
 * ignores both. Bounds mirror the `ConsentRequest` evidence columns.
 */
import { Transform, Type } from 'class-transformer';
import {
  Allow,
  Equals,
  IsDefined,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const CONSENT_DECISIONS = ['ACCEPT', 'DECLINE'] as const;
export type ConsentDecision = (typeof CONSENT_DECISIONS)[number];

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ConsentViewDto {
  /** `@Allow()` ONLY — see the file header. */
  @Allow()
  token?: unknown;
}

export class ConsentRespondentDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  position!: string;

  @Transform(trim)
  @IsEmail()
  @MaxLength(191)
  email!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  phone!: string;
}

const isAccept = (o: ConsentRespondDto): boolean => o.decision === 'ACCEPT';

export class ConsentRespondDto {
  /** `@Allow()` ONLY — see the file header. */
  @Allow()
  token?: unknown;

  @IsIn(CONSENT_DECISIONS)
  decision!: ConsentDecision;

  @ValidateIf(isAccept)
  @IsDefined()
  @ValidateNested()
  @Type(() => ConsentRespondentDto)
  respondent?: ConsentRespondentDto;

  @ValidateIf(isAccept)
  @Equals(true)
  accepted?: boolean;
}
