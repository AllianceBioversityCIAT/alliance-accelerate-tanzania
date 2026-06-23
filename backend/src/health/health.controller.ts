import { Controller, Get } from '@nestjs/common';

/**
 * Liveness endpoint — GET /api/v1/health (global prefix applied in bootstrap).
 * Returns no PII (FR-1).
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: string; service: string; time: string } {
    return {
      status: 'ok',
      service: 'accelerate-tanzania-api',
      time: new Date().toISOString(),
    };
  }
}
