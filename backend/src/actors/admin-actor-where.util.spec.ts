import { buildAdminActorWhere } from './admin-actor-where.util';

describe('buildAdminActorWhere — traderType', () => {
  it('matches the main type OR an additional type, nested in AND so no other OR is clobbered', () => {
    const where = buildAdminActorWhere({ traderType: 'ngo', region: 'Arusha' });

    expect(where).toEqual({
      region: 'Arusha',
      AND: [
        {
          OR: [
            { traderType: 'ngo' },
            { additionalTypes: { some: { traderType: 'ngo' } } },
          ],
        },
      ],
    });
    expect(where).not.toHaveProperty('OR');
  });

  it('adds nothing when no traderType filter is given', () => {
    expect(buildAdminActorWhere({ region: 'Arusha' })).toEqual({ region: 'Arusha' });
  });
});
