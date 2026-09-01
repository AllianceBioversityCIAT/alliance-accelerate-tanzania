import { AdminRegistrationsController } from './admin-registrations.controller';
import { AdminRegistrationsService } from './admin-registrations.service';

/**
 * T-4 — `AdminRegistrationsController` unit tests, mirroring
 * `RegistrationsController`'s own unit-test style (`registrations.
 * controller.spec.ts`): does the handler call the service with the right
 * argument and add no branching of its own? Guard behaviour (`401`
 * anonymous / `403` Staff) is proven at the HTTP level in
 * `pii-boundary.spec.ts`'s admin `FIXTURE_MAP` entry and in
 * `logging-scope.e2e.spec.ts`'s emission proof — neither is re-derived
 * here, matching `admin-actors.controller.ts`'s own precedent of carrying
 * no dedicated unit-level guard test.
 */
describe('AdminRegistrationsController', () => {
  let controller: AdminRegistrationsController;
  let service: {
    list: jest.Mock;
    getById: jest.Mock;
    dismissDuplicate: jest.Mock;
    approve: jest.Mock;
  };

  beforeEach(() => {
    service = {
      list: jest.fn().mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 }),
      getById: jest.fn().mockResolvedValue({ id: 'reg-1' }),
      dismissDuplicate: jest.fn().mockResolvedValue({
        registration: { id: 'reg-1', reference: 'REG-2026-0001', status: 'PENDING_REVIEW' },
      }),
      approve: jest.fn().mockResolvedValue({
        registration: {
          id: 'reg-1',
          reference: 'REG-2026-0001',
          status: 'APPROVED',
          publishedActorId: 'actor-1',
        },
        actor: { id: 'actor-1' },
      }),
    };
    controller = new AdminRegistrationsController(
      service as unknown as AdminRegistrationsService,
    );
  });

  describe('GET /admin/registrations', () => {
    it('forwards the query DTO to the service unchanged and returns its result', async () => {
      const query = { status: 'PENDING_REVIEW', page: 2, pageSize: 10 } as never;

      const result = await controller.list(query);

      expect(service.list).toHaveBeenCalledTimes(1);
      expect(service.list).toHaveBeenCalledWith(query);
      expect(result).toEqual({ data: [], page: 1, pageSize: 20, total: 0 });
    });

    it('adds no branching of its own — an empty query still reaches the service', async () => {
      await controller.list({} as never);

      expect(service.list).toHaveBeenCalledWith({});
    });
  });

  describe('GET /admin/registrations/:id (T-6)', () => {
    it('forwards the path id to the service unchanged and returns its result', async () => {
      const result = await controller.getById('reg-42');

      expect(service.getById).toHaveBeenCalledTimes(1);
      expect(service.getById).toHaveBeenCalledWith('reg-42');
      expect(result).toEqual({ id: 'reg-1' });
    });

    it('adds no branching of its own — the 404-vs-found decision is entirely the service\'s', async () => {
      service.getById.mockRejectedValueOnce(new Error('Registration reg-unknown not found'));

      await expect(controller.getById('reg-unknown')).rejects.toThrow(
        'Registration reg-unknown not found',
      );
    });
  });

  // `dismissDuplicate` (T-7) controller unit tests live in
  // `admin-registrations-dismiss-duplicate.spec.ts`, matching the task's
  // Verify command filename pattern (`npm test -- --silent dismiss-duplicate`).

  describe('POST /admin/registrations/:id/approve (T-8)', () => {
    it('forwards the path id, the DTO, and the acting sub (never anything else from the request) to the service', async () => {
      const dto = { acknowledgement: 'I confirm consent is on file' } as never;
      const user = { sub: 'admin-sub-1', username: 'a', groups: ['admin'], role: 'Admin' } as never;

      const result = await controller.approve('reg-42', dto, user);

      expect(service.approve).toHaveBeenCalledTimes(1);
      expect(service.approve).toHaveBeenCalledWith('reg-42', dto, 'admin-sub-1');
      expect(result).toEqual({
        registration: {
          id: 'reg-1',
          reference: 'REG-2026-0001',
          status: 'APPROVED',
          publishedActorId: 'actor-1',
        },
        actor: { id: 'actor-1' },
      });
    });

    it('adds no branching of its own — every error (400/404/409) is entirely the service\'s', async () => {
      service.approve.mockRejectedValueOnce(new Error('Registration reg-unknown not found'));

      await expect(
        controller.approve('reg-unknown', {} as never, { sub: 'x' } as never),
      ).rejects.toThrow('Registration reg-unknown not found');
    });
  });
});
