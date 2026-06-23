import { MetricsController } from './metrics.controller';
import { Metrics, MetricsService } from './metrics.service';

/**
 * T-6 — MetricsController unit tests with a MOCKED MetricsService.
 *
 * Asserts the controller's only responsibility: delegate to getMetrics and
 * return its result (FR-7). Aggregation/consent logic is the service's job
 * (asserted in metrics.service.spec.ts) — not re-tested here.
 */

const metrics: Metrics = {
  actorsMapped: 12,
  cropsTracked: 2,
  regionsCovered: 3,
  actorTypes: 2,
  crops: [
    { slug: 'sorghum', mappedActors: 7 },
    { slug: 'common_bean', mappedActors: 0 },
    { slug: 'groundnut', mappedActors: 4 },
  ],
};

describe('MetricsController (mocked service)', () => {
  let controller: MetricsController;
  let service: { getMetrics: jest.Mock };

  beforeEach(() => {
    service = { getMetrics: jest.fn() };
    controller = new MetricsController(service as unknown as MetricsService);
  });

  it('delegates to the service and returns the metrics', async () => {
    service.getMetrics.mockResolvedValue(metrics);

    await expect(controller.getMetrics()).resolves.toBe(metrics);
    expect(service.getMetrics).toHaveBeenCalledTimes(1);
  });
});
