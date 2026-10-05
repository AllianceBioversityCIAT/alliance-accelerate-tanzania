import { IsIn, IsOptional } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { ConsentMethod } from '@prisma/client';
import { AdminActorCreateDto } from './admin-actor-create.dto';

/**
 * T-2 — Admin-only partial update DTO (FR-3, NFR-1).
 *
 * Every field from `AdminActorCreateDto` is optional; the service applies only
 * the fields present in the payload and computes the audit diff from the
 * before/after projection (T-5).
 *
 * Design refs: `docs/specs/admin/actor-crud-audit/design.md` §3.
 */

export class AdminActorUpdateDto extends PartialType(AdminActorCreateDto) {
  /**
   * T-1 (consent-request-email, design.md §5.7) — `consentMethod` on UPDATE
   * validates against the FULL `ConsentMethod` enum (incl. `EMAIL_LINK`),
   * unlike create/bulk/import, which use the admin-assertable subset
   * (`ActorCreateDto`, inherited by `AdminActorCreateDto`).
   *
   * Why: `ActorForm.buildDto` (frontend) always resends `consentMethod` on
   * every save, edit included (P-16) — narrowing this DTO would therefore
   * 400 every save of an actor already at `EMAIL_LINK`. The real
   * admin-assertable rule is enforced service-side instead
   * (`ActorsAdminService.update`'s rules 1-3, below), which can see the
   * STORED value and reject only an actual attempt to assert/move into
   * `EMAIL_LINK` or edit its frozen evidence.
   *
   * Redeclaring the property here, with its own decorators, overrides the
   * narrower metadata `AdminActorCreateDto` inherits from `ActorCreateDto`:
   * `class-validator` resolves validation metadata per property+target, and
   * a decorator declared directly on THIS class wins over one inherited from
   * an ancestor for the same property (verified empirically, judgment-day;
   * pinned in `admin-actor-dto.spec.ts`).
   */
  @IsOptional()
  @IsIn(Object.values(ConsentMethod))
  consentMethod?: ConsentMethod;
}
