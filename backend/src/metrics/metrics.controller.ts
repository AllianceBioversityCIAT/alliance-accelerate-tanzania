import { Controller, Get } from '@nestjs/common';
import { Metrics, MetricsService } from './metrics.service';

/**
 * T-6 — Public Metrics controller (FR-7).
 *
 * A single anonymous read endpoint under the global `api/v1` prefix (T-1) that
 * returns the home-page aggregate counters. No PII handling lives here — the
 * payload is GRANTED-only aggregates produced by the service (NFR-6).
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /** `GET /api/v1/metrics` — home-page aggregate metrics (FR-7). */
  @Get()
  getMetrics(): Promise<Metrics> {
    return this.metricsService.getMetrics();
  }
}
