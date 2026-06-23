import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ActorsService, PublicActorList } from './actors.service';
import { ListQueryDto } from './dto/list-query.dto';
import { PublicActor } from '../common/role-aware.serializer';

/**
 * T-5 — Public Actors controller (FR-6).
 *
 * Two anonymous read endpoints under the global `api/v1` prefix (T-1). The list
 * query is validated/coerced via the T-3 {@link ListQueryDto} (the global
 * ValidationPipe rejects a malformed query → 400, NFR-4). Detail returns 404
 * when the service yields `null` (absent OR non-consented) so a non-public
 * actor is indistinguishable from a missing one. No PII handling lives here —
 * the service already projects through the role-aware serializer (DD-2).
 */
@Controller('actors')
export class ActorsController {
  constructor(private readonly actorsService: ActorsService) {}

  /** `GET /api/v1/actors` — paginated/filtered public directory (FR-6). */
  @Get()
  findPublic(@Query() query: ListQueryDto): Promise<PublicActorList> {
    return this.actorsService.findPublic(query);
  }

  /** `GET /api/v1/actors/:id` — single public actor or 404 (FR-6). */
  @Get(':id')
  async findOnePublic(@Param('id') id: string): Promise<PublicActor> {
    const actor = await this.actorsService.findOnePublic(id);
    if (!actor) {
      throw new NotFoundException(`Actor ${id} not found`);
    }
    return actor;
  }
}
