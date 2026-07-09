// @sdd-spec admin/bulk-actor-operations
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import {
  ActorsAdminService,
  AdminActorList,
  BulkResult,
} from './actors-admin.service';
import { AdminActorListQueryDto } from './dto/admin-actor-list-query.dto';
import { BulkConsentDto } from './dto/bulk-consent.dto';
import { BulkDeleteDto } from './dto/bulk-delete.dto';
import { AdminActorCreateDto } from './dto/admin-actor-create.dto';
import { AdminActorUpdateDto } from './dto/admin-actor-update.dto';
import { ActorHistoryQueryDto } from './dto/actor-history-query.dto';
import { AdminActor } from './admin-actor.serializer';
import { AuditEntry } from './audit-entry.serializer';

/**
 * T-3 — Admin-only actor bulk-operations controller (FR-1, FR-3, FR-5, FR-6).
 *
 * Mounted under the global `api/v1` prefix → `/api/v1/admin/actors`. Every
 * route is gated by the same guard stack as `users.controller.ts`:
 * `@UseGuards(JwtAuthGuard, RolesGuard)` followed by `@Roles('Admin')` so the
 * server — not the client — is the authoritative gate. The public
 * `@Controller('actors')` is left untouched; this controller is the only path
 * through which non-consented actor PII is exposed.
 *
 * Routes:
 * - `GET /api/v1/admin/actors` — paginated list of all actors (any consent
 *   status) with PII and consent filters.
 * - `PATCH /api/v1/admin/actors/bulk/consent` — lock or unlock a batch of
 *   actors by setting `consentStatus`; unlocking requires an explicit
 *   `acknowledged` flag because it publishes PII + GPS.
 * - `POST /api/v1/admin/actors/bulk/delete` — permanently delete a batch of
 *   actors (cascading their crop links).
 */
@Controller('admin/actors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin')
export class AdminActorsController {
  constructor(private readonly actorsAdminService: ActorsAdminService) {}

  /** `GET /api/v1/admin/actors` — paginated Admin actor list with PII (FR-1). */
  @Get()
  adminList(@Query() query: AdminActorListQueryDto): Promise<AdminActorList> {
    return this.actorsAdminService.adminList(query);
  }

  /**
   * `PATCH /api/v1/admin/actors/bulk/consent` — set `consentStatus` to
   * `GRANTED` (unlock) or `DENIED` (lock) for many actors (FR-3, FR-4).
   * The caller's verified `sub` and the explicit acknowledgement flag are
   * forwarded to the service.
   */
  @Patch('bulk/consent')
  bulkSetConsent(
    @Body() dto: BulkConsentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<BulkResult> {
    return this.actorsAdminService.bulkSetConsent(
      dto.ids,
      dto.consentStatus,
      user.sub,
      dto.acknowledged,
    );
  }

  /**
   * `POST /api/v1/admin/actors/bulk/delete` — permanently delete many actors
   * (FR-5). `POST` is used instead of `DELETE` with a body for reliable proxy
   * support. The caller's verified `sub` is forwarded for the action log.
   */
  @Post('bulk/delete')
  @HttpCode(200)
  bulkDelete(
    @Body() dto: BulkDeleteDto,
    @CurrentUser() user: AuthUser,
  ): Promise<BulkResult> {
    return this.actorsAdminService.bulkDelete(dto.ids, user.sub);
  }

  /** `POST /api/v1/admin/actors` — create a single actor (FR-1). */
  @Post()
  @HttpCode(201)
  create(
    @Body() dto: AdminActorCreateDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AdminActor> {
    return this.actorsAdminService.create(dto, user.sub);
  }

  /** `GET /api/v1/admin/actors/:id` — admin detail for edit (FR-2). */
  @Get(':id')
  getById(@Param('id') id: string): Promise<AdminActor> {
    return this.actorsAdminService.getById(id);
  }

  /** `PATCH /api/v1/admin/actors/:id` — partial update (FR-3). */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: AdminActorUpdateDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AdminActor> {
    return this.actorsAdminService.update(id, dto, user.sub);
  }

  /** `DELETE /api/v1/admin/actors/:id` — permanent delete (FR-4). */
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ deleted: true; id: string }> {
    return this.actorsAdminService.remove(id, user.sub);
  }

  /**
   * `GET /api/v1/admin/actors/:id/history` — audit history for one actor
   * (FR-7). Works for deleted actors because no existence check is performed.
   */
  @Get(':id/history')
  history(
    @Param('id') id: string,
    @Query() query: ActorHistoryQueryDto,
  ): Promise<{ data: AuditEntry[]; page: number; pageSize: number; total: number }> {
    return this.actorsAdminService.history(id, query);
  }
}
