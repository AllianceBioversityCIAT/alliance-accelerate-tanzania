import { NotFoundException } from '@nestjs/common';
import { ActorsController } from './actors.controller';
import { ActorsService, PublicActorList } from './actors.service';
import { ListQueryDto } from './dto/list-query.dto';
import { PublicActor } from '../common/role-aware.serializer';

/**
 * T-5 — ActorsController unit tests with a MOCKED ActorsService.
 *
 * Asserts the controller's two responsibilities: pass the validated query to
 * findPublic and return its envelope; and map a null detail (absent OR
 * non-consented) to a 404 (FR-6). PII stripping is the service/serializer's
 * job (asserted in actors.service.spec.ts) — not re-tested here.
 */

const publicActor: PublicActor = {
  id: 'actor-1',
  traderName: 'Meru Agro-Processing & Seeds',
  region: 'Arusha',
  district: 'Arusha Urban',
  traderType: 'seed_company',
  capacityTons: 1850,
  crops: ['sorghum'],
  gps: { lat: -3.3869, long: 36.683 },
};

describe('ActorsController (mocked service)', () => {
  let controller: ActorsController;
  let service: { findPublic: jest.Mock; findOnePublic: jest.Mock };

  beforeEach(() => {
    service = { findPublic: jest.fn(), findOnePublic: jest.fn() };
    controller = new ActorsController(service as unknown as ActorsService);
  });

  describe('GET /actors', () => {
    it('passes the query through and returns the list envelope', async () => {
      const envelope: PublicActorList = {
        data: [publicActor],
        page: 1,
        pageSize: 20,
        total: 1,
      };
      service.findPublic.mockResolvedValue(envelope);
      const query = { region: 'Arusha' } as ListQueryDto;

      const res = await controller.findPublic(query);

      expect(service.findPublic).toHaveBeenCalledWith(query);
      expect(res).toBe(envelope);
    });
  });

  describe('GET /actors/:id', () => {
    it('returns the actor when the service resolves one', async () => {
      service.findOnePublic.mockResolvedValue(publicActor);

      await expect(controller.findOnePublic('actor-1')).resolves.toBe(
        publicActor,
      );
      expect(service.findOnePublic).toHaveBeenCalledWith('actor-1');
    });

    it('throws 404 NotFoundException when the service returns null', async () => {
      service.findOnePublic.mockResolvedValue(null);

      await expect(controller.findOnePublic('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
