/**
 * Unit tests for useDashboardActors() — dashboard/discovery-dashboard
 * FR-10, FR-11, NFR-6, design.md §3/§5.2
 *
 * Covers:
 *   (a) single page (total ≤ DASH_PAGE_SIZE) → all actors, truncated=false
 *   (b) total > bound (DASH_PAGE_SIZE × DASH_MAX_PAGES) → truncated=true, actors ≤ bound
 *   (c) first-page null → error=true, empty actors, no throw
 *   (d) capacity fallback excludes out-of-range + null-capacity actors when
 *       capacityMin/capacityMax are set
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useDashboardActors, DASH_PAGE_SIZE, DASH_MAX_PAGES } from './useDashboardActors';
import type { PublicActor, PublicActorList } from '@/lib/api/actors';

// ---------------------------------------------------------------------------
// Module-level mock — hoisted before any imports are evaluated by Jest
// ---------------------------------------------------------------------------

jest.mock('@/lib/api/actors', () => ({
  getActors: jest.fn(),
}));

/* eslint-disable */
const { getActors } = require('@/lib/api/actors') as { getActors: jest.Mock };
/* eslint-enable */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActor(id: string, overrides: Partial<PublicActor> = {}): PublicActor {
  return {
    id,
    traderName: `Actor ${id}`,
    region: 'Dodoma',
    traderType: 'cooperative',
    crops: ['sorghum'],
    capacityTons: null,
    ...overrides,
  };
}

function makeList(actors: PublicActor[], total?: number, page = 1): PublicActorList {
  return {
    data: actors,
    page,
    pageSize: DASH_PAGE_SIZE,
    total: total ?? actors.length,
  };
}

/** Build an array of n actors with sequential ids. */
function actorArray(n: number, startId = 1): PublicActor[] {
  return Array.from({ length: n }, (_, i) => makeActor(String(startId + i)));
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// (a) Single page — total ≤ DASH_PAGE_SIZE
// ---------------------------------------------------------------------------

describe('useDashboardActors — (a) single page fetch', () => {
  it('returns all actors and truncated=false when total fits in one page', async () => {
    const actors = actorArray(3);
    getActors.mockResolvedValueOnce(makeList(actors));

    const { result } = renderHook(() => useDashboardActors({ crop: 'sorghum' }));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.actors).toHaveLength(3);
    expect(result.current.total).toBe(3);
    expect(result.current.truncated).toBe(false);
    expect(result.current.error).toBe(false);

    // Only one API call is needed when everything fits on page 1.
    expect(getActors).toHaveBeenCalledTimes(1);
    expect(getActors).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: DASH_PAGE_SIZE }),
    );
  });

  it('starts in loading=true before the promise settles', () => {
    // Never-resolving promise so we can inspect the initial state.
    getActors.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useDashboardActors());

    expect(result.current.loading).toBe(true);
    expect(result.current.actors).toEqual([]);
    expect(result.current.error).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (b) Total exceeds the bound (DASH_PAGE_SIZE × DASH_MAX_PAGES)
// ---------------------------------------------------------------------------

describe('useDashboardActors — (b) total > bound → truncated', () => {
  it('fetches up to DASH_MAX_PAGES pages and sets truncated=true', async () => {
    // Simulate a server with more actors than the cap.
    const serverTotal = DASH_PAGE_SIZE * DASH_MAX_PAGES + 50; // e.g. 1 050

    const page1Actors = actorArray(DASH_PAGE_SIZE, 1);
    const page2Actors = actorArray(DASH_PAGE_SIZE, DASH_PAGE_SIZE + 1);

    getActors
      .mockResolvedValueOnce(makeList(page1Actors, serverTotal, 1))
      .mockResolvedValueOnce(makeList(page2Actors, serverTotal, 2));

    const { result } = renderHook(() => useDashboardActors());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.actors).toHaveLength(DASH_PAGE_SIZE * DASH_MAX_PAGES);
    expect(result.current.total).toBe(serverTotal);
    expect(result.current.truncated).toBe(true);
    expect(result.current.error).toBe(false);

    // Should have fetched exactly DASH_MAX_PAGES pages.
    expect(getActors).toHaveBeenCalledTimes(DASH_MAX_PAGES);
  });

  it('does not fetch a third page even if more actors remain', async () => {
    const serverTotal = DASH_PAGE_SIZE * 3; // well beyond the cap

    const page1Actors = actorArray(DASH_PAGE_SIZE, 1);
    const page2Actors = actorArray(DASH_PAGE_SIZE, DASH_PAGE_SIZE + 1);

    getActors
      .mockResolvedValueOnce(makeList(page1Actors, serverTotal, 1))
      .mockResolvedValueOnce(makeList(page2Actors, serverTotal, 2));

    const { result } = renderHook(() => useDashboardActors());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getActors).toHaveBeenCalledTimes(DASH_MAX_PAGES);
    expect(result.current.truncated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (c) First-page null → error state
// ---------------------------------------------------------------------------

describe('useDashboardActors — (c) first-page null → error', () => {
  it('sets error=true and returns empty actors without throwing', async () => {
    getActors.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useDashboardActors());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(true);
    expect(result.current.actors).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.truncated).toBe(false);
  });

  it('does not attempt additional pages when page 1 returns null', async () => {
    getActors.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useDashboardActors());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getActors).toHaveBeenCalledTimes(1);
  });

  it('stops accumulating and sets truncated when a later page returns null', async () => {
    const serverTotal = DASH_PAGE_SIZE + 10; // triggers page 2 fetch
    const page1Actors = actorArray(DASH_PAGE_SIZE, 1);

    getActors
      .mockResolvedValueOnce(makeList(page1Actors, serverTotal, 1))
      .mockResolvedValueOnce(null); // page 2 fails

    const { result } = renderHook(() => useDashboardActors());

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Returns what was accumulated from page 1.
    expect(result.current.actors).toHaveLength(DASH_PAGE_SIZE);
    // truncated because server total > what we returned.
    expect(result.current.truncated).toBe(true);
    // error is false — only first-page null triggers error=true.
    expect(result.current.error).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (d) Capacity fallback — client-side filter (design.md §3)
// ---------------------------------------------------------------------------

describe('useDashboardActors — (d) capacity fallback filter', () => {
  const actorsForCapacity: PublicActor[] = [
    makeActor('in-range',    { capacityTons: 100 }),  // within [50, 200]
    makeActor('too-small',   { capacityTons: 10  }),  // below min
    makeActor('too-large',   { capacityTons: 500 }),  // above max
    makeActor('null-cap',    { capacityTons: null }),  // null → excluded
    makeActor('nan-cap',     { capacityTons: NaN  }),  // non-finite → excluded
    makeActor('inf-cap',     { capacityTons: Infinity }), // non-finite → excluded
    makeActor('exact-min',   { capacityTons: 50  }),  // exactly at min → included
    makeActor('exact-max',   { capacityTons: 200 }),  // exactly at max → included
  ];

  it('keeps only actors whose capacityTons is within [capacityMin, capacityMax]', async () => {
    getActors.mockResolvedValueOnce(makeList(actorsForCapacity));

    const { result } = renderHook(() =>
      useDashboardActors({ capacityMin: 50, capacityMax: 200 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const ids = result.current.actors.map((a) => a.id);
    expect(ids).toContain('in-range');
    expect(ids).toContain('exact-min');
    expect(ids).toContain('exact-max');

    expect(ids).not.toContain('too-small');
    expect(ids).not.toContain('too-large');
    expect(ids).not.toContain('null-cap');
    expect(ids).not.toContain('nan-cap');
    expect(ids).not.toContain('inf-cap');
  });

  it('excludes null/non-finite capacity actors when only capacityMin is set', async () => {
    getActors.mockResolvedValueOnce(makeList(actorsForCapacity));

    const { result } = renderHook(() => useDashboardActors({ capacityMin: 50 }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const ids = result.current.actors.map((a) => a.id);
    expect(ids).not.toContain('null-cap');
    expect(ids).not.toContain('nan-cap');
    expect(ids).not.toContain('inf-cap');
    expect(ids).not.toContain('too-small');  // 10 < 50
    expect(ids).toContain('in-range');
    expect(ids).toContain('too-large');  // 500 ≥ 50 and no max set
  });

  it('excludes null/non-finite capacity actors when only capacityMax is set', async () => {
    getActors.mockResolvedValueOnce(makeList(actorsForCapacity));

    const { result } = renderHook(() => useDashboardActors({ capacityMax: 200 }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const ids = result.current.actors.map((a) => a.id);
    expect(ids).not.toContain('null-cap');
    expect(ids).not.toContain('nan-cap');
    expect(ids).not.toContain('inf-cap');
    expect(ids).not.toContain('too-large');  // 500 > 200
    expect(ids).toContain('too-small');      // 10 ≤ 200
    expect(ids).toContain('in-range');
  });

  it('does not filter by capacity when neither capacityMin nor capacityMax is set', async () => {
    getActors.mockResolvedValueOnce(makeList(actorsForCapacity));

    const { result } = renderHook(() => useDashboardActors({ crop: 'sorghum' }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // All actors from the API are returned when no capacity bounds are given.
    expect(result.current.actors).toHaveLength(actorsForCapacity.length);
  });

  it('marks truncated=true when capacity filter reduces actors below server total', async () => {
    // Server returns 5 actors but only 3 pass the capacity filter.
    const mixedActors: PublicActor[] = [
      makeActor('a1', { capacityTons: 100 }),
      makeActor('a2', { capacityTons: null }),  // filtered out
      makeActor('a3', { capacityTons: 150 }),
      makeActor('a4', { capacityTons: null }),  // filtered out
      makeActor('a5', { capacityTons: 200 }),
    ];
    getActors.mockResolvedValueOnce(makeList(mixedActors, 5));

    const { result } = renderHook(() =>
      useDashboardActors({ capacityMin: 50, capacityMax: 300 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.actors).toHaveLength(3);
    expect(result.current.total).toBe(5);
    expect(result.current.truncated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unmount guard — no setState-after-unmount
// ---------------------------------------------------------------------------

describe('useDashboardActors — unmount guard', () => {
  it('does not update state after unmount', async () => {
    let resolveFn!: (v: PublicActorList | null) => void;
    getActors.mockReturnValue(
      new Promise<PublicActorList | null>((resolve) => { resolveFn = resolve; }),
    );

    const { result, unmount } = renderHook(() => useDashboardActors());

    expect(result.current.loading).toBe(true);

    unmount();

    // Settle after unmount — must not throw or cause React warnings.
    await Promise.resolve(resolveFn(makeList(actorArray(2))));

    // State frozen at the pre-unmount snapshot.
    expect(result.current.loading).toBe(true);
    expect(result.current.actors).toEqual([]);
  });
});
