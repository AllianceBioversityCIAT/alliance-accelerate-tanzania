import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import {
  AdminRegistrationList,
  AdminRegistrationsService,
} from './admin-registrations.service';
import { AdminRegistrationListQueryDto } from './dto/admin-registration-list-query.dto';

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
 * Only `GET /api/v1/admin/registrations` exists as of this task; T-6…T-9
 * add the remaining four routes `design.md` §5's contract table names
 * (`GET /:id`, `POST /:id/approve`, `POST /:id/reject`,
 * `POST /:id/dismiss-duplicate`).
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
}
