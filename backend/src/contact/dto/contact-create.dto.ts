import { Equals, IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  CONTACT_CATEGORIES,
  CONTACT_EMAIL_MAX_LENGTH,
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_ORGANIZATION_MAX_LENGTH,
  CONTACT_SUBJECT_MAX_LENGTH,
  ContactCategory,
} from '../contact-categories';

/**
 * T-4 — Validated write DTO for the public `POST /api/v1/contact` request
 * body (design.md §4.1.1's field table, transcribed property for property —
 * not mirrored from `RegistrationCreateDto`). Wiring into a controller/route
 * is T-6's; this file is DTO + tests only.
 *
 * Traces: `requirements.md` FR-2 (both scenarios), FR-6, FR-8, NFR-2.
 */
export class ContactCreateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(CONTACT_NAME_MAX_LENGTH)
  name!: string;

  @IsEmail()
  @MaxLength(CONTACT_EMAIL_MAX_LENGTH)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(CONTACT_ORGANIZATION_MAX_LENGTH)
  organization?: string;

  /**
   * FR-2's second scenario: the option set is fixed and MUST be rejected
   * server-side when out of range, not only filtered in the browser.
   * `CONTACT_CATEGORIES` is the authoritative, in-repo literal — never a
   * database table or remote config (see `contact-categories.ts`).
   */
  @IsIn(CONTACT_CATEGORIES)
  category!: ContactCategory;

  @IsString()
  @MinLength(1)
  @MaxLength(CONTACT_SUBJECT_MAX_LENGTH)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(CONTACT_MESSAGE_MAX_LENGTH)
  message!: string;

  /**
   * FR-6: a bare `@IsBoolean()` accepts `privacyAcknowledged: false`, which
   * would let the server-side acknowledgement gate pass with the box
   * unchecked. `@Equals(true)` closes that: only the literal boolean `true`
   * satisfies both decorators together.
   */
  @IsBoolean()
  @Equals(true, { message: 'privacyAcknowledged must be true' })
  privacyAcknowledged!: boolean;

  /**
   * FR-8's honeypot. Two rules, both load-bearing:
   *
   * 1. It MUST carry decorators. The global `ValidationPipe` runs
   *    `whitelist: true` (`common/validation-pipe.ts`), which strips every
   *    property carrying NO validation metadata — a bare TypeScript field
   *    declaration is removed exactly as an undeclared property would be,
   *    which would make this control permanently inert (never reachable by
   *    the handler). `@IsOptional() @IsString()` is the minimum that
   *    survives whitelisting while still accepting "not sent" as valid.
   * 2. It MUST carry NO length cap. A cap makes the trap self-identifying:
   *    an over-long value would return a `400` whose `details[].field`
   *    names this property, handing an attacker the exact field to leave
   *    empty. The bound instead comes from the 32 KB request-body cap
   *    (`common/payload-cap.config.ts`, extended to `/api/v1/contact`),
   *    which bounds every field — including this one — at once.
   */
  @IsOptional()
  @IsString()
  website?: string;
}
