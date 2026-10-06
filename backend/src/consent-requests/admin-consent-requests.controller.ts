/**
 * T-3 — Admin-only consent-requests controller (design.md §6).
 *
 * Copies the established pattern (`admin-registrations.controller.ts`,
 * `admin-actors.controller.ts`): `@Controller(...)` with the class-level
 * guard stack `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('Admin')`, so
 * an anonymous caller gets `401` and an authenticated `Staff` caller gets
 * `403` on every route this controller ever registers.
 *
 * `preview` performs no writes, so it is `@HttpCode(200)` (the
 * `dismiss-duplicate` precedent for a non-creating `POST`). `enqueue`
 * creates rows, so it keeps Nest's default `201` for `POST`.
 *
 * The acting admin's identity is never read from the request body: `sub`
 * comes from `@CurrentUser()` (the validated JWT), same as every other
 * admin write in this codebase.
 */

import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import {
  ConsentRequestEnqueueResult,
  ConsentRequestPreviewResult,
  ConsentRequestsService,
} from './consent-requests.service';
import { ConsentRequestSendDto } from './dto/consent-request-send.dto';

@Controller('admin/consent-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin')
export class AdminConsentRequestsController {
  constructor(private readonly consentRequestsService: ConsentRequestsService) {}

  /** `POST /api/v1/admin/consent-requests/preview` — no writes (design.md §5.1). */
  @Post('preview')
  @HttpCode(200)
  preview(@Body() dto: ConsentRequestSendDto): Promise<ConsentRequestPreviewResult> {
    return this.consentRequestsService.preview(dto.target, dto.scope);
  }

  /** `POST /api/v1/admin/consent-requests` — persists QUEUED rows (design.md §5.2 step 1). */
  @Post()
  enqueue(
    @Body() dto: ConsentRequestSendDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ConsentRequestEnqueueResult> {
    return this.consentRequestsService.enqueue(dto.target, dto.scope, user.sub);
  }
}
