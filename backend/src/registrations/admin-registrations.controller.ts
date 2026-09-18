import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import {
  AdminRegistrationList,
  AdminRegistrationsService,
  DismissDuplicateResult,
  RegistrationApproveResult,
  RegistrationRejectResult,
} from './admin-registrations.service';
import { AdminRegistrationListQueryDto } from './dto/admin-registration-list-query.dto';
import { RegistrationApproveDto } from './dto/registration-approve.dto';
import { RegistrationDismissDuplicateDto } from './dto/registration-dismiss-duplicate.dto';
import { RegistrationRejectDto } from './dto/registration-reject.dto';
import { AdminRegistrationDetail } from './serializers/admin-registration.serializer';

/**
 * T-4 — Admin-only registrations controller (FR-9). Copies
 * `admin-actors.controller.ts` exactly, per `design.md` §5's exemplar
 * instruction: `@Controller('admin/registrations')` with the class-level
 * guard stack `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('Admin')`, so
 * an anonymous caller gets `401` and an authenticated `Staff` caller gets
 * `403` on every route this controller ever registers — the server, never
 * the client, is the authoritative gate (FR-9 scenario 3).
 *
 * Mounted under the global `api/v1` prefix → `/api/v1/admin/registrations`.
 * Registered in `RegistrationsModule.controllers` alongside the existing
 * public `RegistrationsController` (`design.md` §6.1, DD-15) — deliberately
 * NOT a separate module, so 3a's `pii-boundary.spec.ts` release gate, which
 * derives its route set from `RegistrationsModule`'s own `controllers`
 * array, keeps seeing every route this controller adds.
 *
 * T-6 adds `GET /:id` — the full detail read (FR-10). T-7 adds `POST
 * /:id/dismiss-duplicate` (FR-11 scenario 2) below. T-8…T-9 add the
 * remaining two routes `design.md` §5's contract table names (`POST
 * /:id/approve`, `POST /:id/reject`).
 *
 * T-6's `GET /:id` — unlike `GET /` above — is `:id`-scoped, which matters
 * for `pii-boundary.spec.ts`'s `FIXTURE_MAP`: a parameterized key can never
 * equal its sender's concrete probe URL, so the usual eyeball check (key
 * string vs literal URL in the closures) does not apply to this route's
 * entry — see that file's admin-entry contract JSDoc for what to check
 * instead. `404` for an unknown id is DD-22-honest here (an authenticated
 * Admin is entitled to know a row exists); `401`/`403` is unaffected by
 * whether the id is real or invented, and never a `404` — the guard runs
 * before the service does any lookup at all (FR-9's `403`-indistinguishability
 * clause, reassigned here from T-4).
 */
@Controller('admin/registrations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin')
export class AdminRegistrationsController {
  constructor(private readonly adminRegistrationsService: AdminRegistrationsService) {}

  /**
   * `GET /api/v1/admin/registrations` — paginated, filterable, sortable
   * queue (FR-9 scenarios 1, 2, 4). The handler does nothing beyond
   * validating shape (the global pipe) and awaiting the one call — every
   * filter/sort/pagination decision lives in
   * `AdminRegistrationsService.list`.
   */
  @Get()
  list(@Query() query: AdminRegistrationListQueryDto): Promise<AdminRegistrationList> {
    return this.adminRegistrationsService.list(query);
  }

  /**
   * `GET /api/v1/admin/registrations/:id` — full detail read (FR-10
   * scenarios 1, 2, 3): full payload, consent record, duplicate candidates,
   * activity trail. `404` for an unknown id (DD-22 — honest here, unlike
   * the public lookup). The handler adds no branching of its own — every
   * decision lives in `AdminRegistrationsService.getById`.
   */
  @Get(':id')
  getById(@Param('id') id: string): Promise<AdminRegistrationDetail> {
    return this.adminRegistrationsService.getById(id);
  }

  /**
   * `POST /api/v1/admin/registrations/:id/dismiss-duplicate` — record that
   * `candidateActorId` is not a duplicate for this registration (FR-11
   * scenario 2, `design.md` §5's contract row). `404` covers either an
   * unknown registration id OR an unknown candidate id — both branches live
   * in `AdminRegistrationsService.dismissDuplicate`, so this handler adds no
   * branching of its own.
   *
   * The dismisser's identity is never read from the request body: `sub`
   * comes from `@CurrentUser()` (the validated JWT), and the email is
   * resolved server-side inside the service via `ActingAdminResolver`
   * (`design.md` §8). The request body carries only `candidateActorId`.
   * `@HttpCode(200)` matches the codebase's other admin write precedent
   * (`admin-actors.controller.ts`'s `bulk/delete`) — this is a state change
   * to an existing resource, not a creation.
   */
  @Post(':id/dismiss-duplicate')
  @HttpCode(200)
  dismissDuplicate(
    @Param('id') id: string,
    @Body() dto: RegistrationDismissDuplicateDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DismissDuplicateResult> {
    return this.adminRegistrationsService.dismissDuplicate(id, dto.candidateActorId, user.sub);
  }

  /**
   * `POST /api/v1/admin/registrations/:id/approve` — the transaction
   * (FR-12 all six scenarios, FR-14 scenario 1; `design.md` §5's contract
   * row, §6.2). The handler adds no branching of its own — the compare-
   * and-set, the projection, the acknowledgement re-validation, the
   * `traderId` derivation, the actor create, and the audit write all live
   * in `AdminRegistrationsService.approve`. `@HttpCode(200)` matches this
   * module's other action routes (`dismiss-duplicate` above): this is an
   * action verb on an existing resource (`/:id/approve`), not a bare
   * resource-creation `POST`, even though it creates an `Actor` as a side
   * effect (matching `admin-actors.controller.ts`'s `bulk/delete`/`import`
   * precedent over its bare `create()`'s `201`).
   *
   * The acting admin's identity is never read from the request body:
   * `sub` comes from `@CurrentUser()` (the validated JWT), same as every
   * other write in this controller.
   */
  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @Param('id') id: string,
    @Body() dto: RegistrationApproveDto,
    @CurrentUser() user: AuthUser,
  ): Promise<RegistrationApproveResult> {
    return this.adminRegistrationsService.approve(id, dto, user.sub);
  }

  /**
   * `POST /api/v1/admin/registrations/:id/reject` — the rejection write
   * (FR-11 scenario 3, FR-13 scenarios 1, 2, FR-14 scenarios 1, 2;
   * `design.md` §5's contract row, §6.4). The handler adds no branching of
   * its own — the compare-and-set, the audit write, and the post-commit
   * notification all live in `AdminRegistrationsService.reject`.
   *
   * The acting admin's identity is never read from the request body: `sub`
   * comes from `@CurrentUser()` (the validated JWT), same as every other
   * write in this controller. `@HttpCode(200)` matches this module's other
   * action routes (`approve`, `dismiss-duplicate` above) — an action verb
   * on an existing resource, not a bare resource-creation `POST`.
   */
  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @Param('id') id: string,
    @Body() dto: RegistrationRejectDto,
    @CurrentUser() user: AuthUser,
  ): Promise<RegistrationRejectResult> {
    return this.adminRegistrationsService.reject(id, dto, user.sub);
  }
}
