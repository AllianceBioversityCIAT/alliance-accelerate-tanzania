import { IsNotEmpty, IsString } from 'class-validator';

/**
 * T-7 — `POST /admin/registrations/:id/dismiss-duplicate` request body
 * (FR-11 scenario 2, `design.md` §5's contract row: `{ candidateActorId }`).
 *
 * The candidate is identified by ACTOR ID, never an index into a detection
 * result set — `design.md` §5 decision 4: an index would be invalidated by
 * detection re-running with a different result set (e.g. a new registration
 * landing between two page loads shifts array positions), while an actor id
 * stays stable across re-detection.
 *
 * This DTO carries ONLY the candidate id. The dismissing reviewer's
 * identity is never accepted from the request body — `sub` comes from the
 * validated JWT and the email from `ActingAdminResolver`, resolved
 * server-side in `AdminRegistrationsService.dismissDuplicate` (`design.md`
 * §8's identity rule; `backend/CLAUDE.md`: "never trust client-sent
 * identity").
 */
export class RegistrationDismissDuplicateDto {
  @IsString()
  @IsNotEmpty()
  candidateActorId!: string;
}
