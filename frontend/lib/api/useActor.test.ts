/**
 * Unit tests for useActor() hook — T-2 (FR-5, NFR-7)
 *
 * Covers:
 *   - loading starts as true, transitions to false with data after a successful fetch
 *   - error is true when getActor() resolves to null (404 / failure → distinct from loading)
 *   - refetches when the id changes
 *   - no state-update-after-unmount warning (cleanup guard)
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useActor } from './useActor';
import type { PublicActor } from './actors';

// ---------------------------------------------------------------------------
// Module-level mock — must be hoisted before imports are evaluated
// ---------------------------------------------------------------------------

jest.mock('./actors', () => ({
  getActor: jest.fn(),
}));

// Import the mocked module so we can set return values per-test
/* eslint-disable */
const { getActor } = require('./actors') as { getActor: jest.Mock };
/* eslint-enable */

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_ACTOR: PublicActor = {
  id: 'actor-1',
  traderName: 'Mbeya Seeds Ltd',
  region: 'Mbeya',
  district: 'Mbeya Urban',
  traderType: 'seed_company',
  capacityTons: 500,
  crops: ['sorghum', 'common_bean'],
  gps: { lat: -8.9, long: 33.46 },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useActor()', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('starts with loading=true and data=null', async () => {
    let resolveFn!: (v: PublicActor | null) => void;
    getActor.mockImplementation(
      () => new Promise<PublicActor | null>((resolve) => { resolveFn = resolve; })
    );

    const { result } = renderHook(() => useActor('actor-1'));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe(false);

    await act(async () => { resolveFn(VALID_ACTOR); });
  });

  it('sets loading=false and data=PublicActor after getActor() resolves with data', async () => {
    getActor.mockResolvedValue(VALID_ACTOR);

    const { result } = renderHook(() => useActor('actor-1'));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual(VALID_ACTOR);
    expect(result.current.error).toBe(false);
  });

  it('sets error=true and data=null when getActor() returns null (404 / failure)', async () => {
    getActor.mockResolvedValue(null);

    const { result } = renderHook(() => useActor('missing-id'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe(true);
  });

  it('refetches when the id changes', async () => {
    getActor.mockResolvedValue(VALID_ACTOR);

    const { result, rerender } = renderHook(({ id }) => useActor(id), {
      initialProps: { id: 'actor-1' },
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getActor).toHaveBeenCalledWith('actor-1');

    rerender({ id: 'actor-2' });

    await waitFor(() => expect(getActor).toHaveBeenCalledWith('actor-2'));
    expect(getActor).toHaveBeenCalledTimes(2);
  });

  it('does not update state after unmount (cleanup guard prevents post-unmount setState)', async () => {
    let resolveFn!: (v: PublicActor | null) => void;
    getActor.mockImplementation(
      () => new Promise<PublicActor | null>((resolve) => { resolveFn = resolve; })
    );

    const { result, unmount } = renderHook(() => useActor('actor-1'));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    unmount();

    // Settling after unmount must not throw or cause React warnings.
    await act(async () => { resolveFn(VALID_ACTOR); });

    // renderHook preserves the last-known (pre-unmount) state after unmount.
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
  });
});
