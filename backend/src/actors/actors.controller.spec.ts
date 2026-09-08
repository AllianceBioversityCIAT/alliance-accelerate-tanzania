import { NotFoundException } from '@nestjs/common';
import { ActorsController } from './actors.controller';
import { ActorsService, PublicActorList } from './actors.service';
import { ListQueryDto } from './dto/list-query.dto';
import {
  PublicActorDetail,
  PublicActorListItem,
} from '../common/role-aware.serializer';

/**
 * T-5/T-7 — ActorsController unit tests with a MOCKED ActorsService.
 *
 * Asserts the controller's two responsibilities: pass the validated query to
 * findPublic and return its list envelope; and map a null detail (absent OR
 * non-consented) to a 404 (FR-6). PII stripping is the service/serializer's
 * job (asserted in actors.service.spec.ts / role-aware.serializer.spec.ts) —
 * not re-tested here.
 *
 * T-7 (`actors/public-profile-disclosure`) split the single public actor
 * shape in two: the list route's envelope carries {@link PublicActorListItem}
 * items (no contact block, FR-9); the detail route returns
 * {@link PublicActorDetail} (list set plus the contact block, FR-1). This
 * file's fixtures and the detail route's assertions were corrected
 * accordingly — R2-3 had flagged that the detail route previously used a
 * list-shaped fixture and return-type annotation.
 */

const publicActorListItem: PublicActorListItem = {
  id: 'actor-1',
  traderName: 'Meru Agro-Processing & Seeds',
  region: 'Arusha',
  district: 'Arusha Urban',
  traderType: 'seed_company',
  capacityTons: 1850,
  crops: ['sorghum'],
  gps: { lat: -3.3869, long: 36.683 },
  sex: 'F',
  otherCrops: null,
};

/** T-7 — the published set: list set plus the contact block (FR-1). */
const publicActorDetail: PublicActorDetail = {
  id: 'actor-1',
  traderName: 'Meru Agro-Processing & Seeds',
  region: 'Arusha',
  district: 'Arusha Urban',
  traderType: 'seed_company',
  capacityTons: 1850,
  crops: ['sorghum'],
  gps: { lat: -3.3869, long: 36.683 },
  sex: 'F',
  otherCrops: null,
  contactPerson: 'Halima Mrema',
  position: 'Operations Manager',
  phone: '+255700000000',
  email: 'info@meruagro.co.tz',
  marketLocation: 'Arusha Central Market',
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
        data: [publicActorListItem],
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
    it('returns the published-set actor when the service resolves one', async () => {
      service.findOnePublic.mockResolvedValue(publicActorDetail);

      await expect(controller.findOnePublic('actor-1')).resolves.toBe(
        publicActorDetail,
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
