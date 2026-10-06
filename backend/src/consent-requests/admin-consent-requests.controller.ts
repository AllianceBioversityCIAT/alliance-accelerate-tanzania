/**
 * T-3 — Admin-only consent-requests controller (design.md §6).
 * T-4 — `dispatch` / `retry` / `queue` routes added (design.md §5.2, §6).
 *
 * Copies the established pattern (`admin-registrations.controller.ts`,
 * `admin-actors.controller.ts`): `@Controller(...)` with the class-level
 * guard stack `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('Admin')`, so
 * an anonymous caller gets `401` and an authenticated `Staff` caller gets
 * `403` on every route this controller ever registers.
 *
 * `preview` performs no writes, so it is `@HttpCode(200)` (the
 * `dismiss-duplicate` precedent for a non-creating `POST`). `enqueue`
 * creates rows, so it keeps Nest's default `201` for `POST`. `dispatch` and
 * `retry` are action verbs on an EXISTING collection, not a bare create —
 * same `@HttpCode(200)` precedent `approve`/`reject` use
 * (`admin-registrations.controller.ts`).
 *
 * The acting admin's identity is never read from the request body: `sub`
 * comes from `@CurrentUser()` (the validated JWT), same as every other
 * admin write in this codebase. `dispatch`/`retry`/`queue` take no identity
 * at all — the admin who ENQUEUED a request is already snapshotted on its
 * row (`requestedBySub`/`requestedByEmail`), and that is the identity the
 * `CONSENT_REQUESTED` audit row credits (`ActorAuditService.logConsentRequested`),
 * never whichever admin happens to be driving a later dispatch/retry step.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import {
  ConsentRequestDispatchResult,
  ConsentRequestEnqueueResult,
  ConsentRequestPreviewResult,
  ConsentRequestQueueSummary,
  ConsentRequestRetryResult,
  ConsentRequestsService,
} from './consent-requests.service';
import { ConsentEvidence, ConsentEvidenceService } from './consent-evidence.service';
import { AdminConsentEdition, getAdminConsentEdition } from './admin-consent-policy';
import { ConsentRequestSendDto } from './dto/consent-request-send.dto';
import { ConsentRequestBatchDto } from './dto/consent-request-batch.dto';

// T-6 — mounted at `admin` (not `admin/consent-requests`) so this ONE controller
// can also own `admin/actors/:id/consent-evidence` and
// `admin/consent-editions/:version` (design.md §6 "Route placement"). Every
// pre-existing route keeps its full path: each now spells the
// `consent-requests` segment itself.
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin')
export class AdminConsentRequestsController {
  constructor(
    private readonly consentRequestsService: ConsentRequestsService,
    private readonly consentEvidenceService: ConsentEvidenceService,
  ) {}

  /** `POST /api/v1/admin/consent-requests/preview` — no writes (design.md §5.1). */
  @Post('consent-requests/preview')
  @HttpCode(200)
  preview(@Body() dto: ConsentRequestSendDto): Promise<ConsentRequestPreviewResult> {
    return this.consentRequestsService.preview(dto.target, dto.scope);
  }

  /** `POST /api/v1/admin/consent-requests` — persists QUEUED rows (design.md §5.2 step 1). */
  @Post('consent-requests')
  enqueue(
    @Body() dto: ConsentRequestSendDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ConsentRequestEnqueueResult> {
    return this.consentRequestsService.enqueue(dto.target, dto.scope, user.sub);
  }

  /** `POST /api/v1/admin/consent-requests/dispatch` — the time-boxed send step (design.md §5.2 steps 2-3). */
  @Post('consent-requests/dispatch')
  @HttpCode(200)
  dispatch(@Body() dto: ConsentRequestBatchDto): Promise<ConsentRequestDispatchResult> {
    return this.consentRequestsService.dispatch({ batchId: dto.batchId });
  }

  /** `POST /api/v1/admin/consent-requests/retry` — `FAILED → QUEUED` (design.md §5.2 step 4). */
  @Post('consent-requests/retry')
  @HttpCode(200)
  retry(@Body() dto: ConsentRequestBatchDto): Promise<ConsentRequestRetryResult> {
    return this.consentRequestsService.retry({ batchId: dto.batchId });
  }

  /** `GET /api/v1/admin/consent-requests/queue` — across all batches, for the resume banner (design.md §5.2 step 5). */
  @Get('consent-requests/queue')
  queue(): Promise<ConsentRequestQueueSummary> {
    return this.consentRequestsService.queue();
  }

  /**
   * `GET /api/v1/admin/actors/:id/consent-evidence` — requests + stored
   * documents, newest first (FR-13, FR-14). No existence check on the actor:
   * the evidence outlives it (NFR-9). Same segment count as
   * `AdminActorsController`'s `:id/history`, distinct literal tail (B-11).
   */
  @Get('actors/:id/consent-evidence')
  evidence(@Param('id') id: string): Promise<ConsentEvidence> {
    return this.consentEvidenceService.forActor(id);
  }

  /** `GET /api/v1/admin/consent-editions/:version` — the exact edition text, for "read exact text" (FR-14). */
  @Get('consent-editions/:version')
  edition(@Param('version') version: string): AdminConsentEdition {
    const edition = getAdminConsentEdition(version);
    if (!edition) {
      throw new NotFoundException(`Consent edition ${version} not found`);
    }
    return edition;
  }
}
