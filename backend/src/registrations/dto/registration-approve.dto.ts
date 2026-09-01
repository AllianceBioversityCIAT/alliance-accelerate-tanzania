import { IsNotEmpty, IsString } from 'class-validator';

/**
 * T-8 — `POST /admin/registrations/:id/approve` request body (FR-12,
 * `design.md` §5's contract row: `{ acknowledgement }`).
 *
 * `acknowledgement` is the typed-confirmation phrase re-validated
 * server-side against `APPROVAL_ACKNOWLEDGEMENT_TEXT`
 * (`admin-registrations.service.ts`) — FR-12 scenario 3's "must NOT be
 * client-only" requirement. This DTO validates SHAPE only (a non-empty
 * string); the exact-match check against the required phrase is the
 * service's `assertAcknowledgement`, because the expected literal is a
 * fixed application constant, not something `class-validator`'s
 * property-level decorators express cleanly as a 400 with a field-specific
 * message.
 *
 * The acting admin's identity is never accepted from the request body —
 * `sub` comes from the validated JWT (`@CurrentUser()`), matching every
 * other admin write in this module (`backend/CLAUDE.md`: "never trust
 * client-sent identity").
 */
export class RegistrationApproveDto {
  @IsString()
  @IsNotEmpty()
  acknowledgement!: string;
}
