import { PartialType } from '@nestjs/mapped-types';
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

export class AdminActorUpdateDto extends PartialType(AdminActorCreateDto) {}
