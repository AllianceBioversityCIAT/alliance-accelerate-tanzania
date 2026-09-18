import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { REJECTION_REASON_CODES, RejectionReasonCode } from '../rejection-reasons';

/**
 * T-9 — `POST /admin/registrations/:id/reject` request body (FR-13,
 * `design.md` §5's contract row: `{ reason, note? }`).
 *
 * `reason` is validated against {@link REJECTION_REASON_CODES} — the SAME
 * frozen list `rejection-reasons.ts` exports, never a second, hand-copied
 * enum here. FR-13's "AND IT MUST make the reason mandatory" scenario is
 * satisfied by `@IsNotEmpty()` PLUS `@IsIn(...)`: an omitted, empty, or
 * unrecognised reason is rejected by the shared global `ValidationPipe`
 * (`common/validation-pipe.ts`) with a `400` and a `details: [{ field:
 * 'reason', message }]` entry, BEFORE `AdminRegistrationsService.reject`
 * ever runs — the same "gate is real before any service code executes"
 * shape `RegistrationApproveDto`'s shape-only validation establishes for
 * `acknowledgement`.
 *
 * `note` is the ONE optional, applicant-facing field this DTO carries
 * (`design.md` §6.4: "the one `Registration` field 3a's public lookup may
 * return"). It is free text, capped at 2000 chars — the same order of
 * magnitude `ActorCreateDto`'s free-text field caps at, and comfortably
 * inside `Registration.reviewNote`'s `@db.Text` column.
 *
 * The acting admin's identity is never accepted from the request body —
 * `sub` comes from the validated JWT (`@CurrentUser()`), matching every
 * other admin write in this module (`backend/CLAUDE.md`: "never trust
 * client-sent identity").
 */
export class RegistrationRejectDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(REJECTION_REASON_CODES)
  reason!: RejectionReasonCode;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
