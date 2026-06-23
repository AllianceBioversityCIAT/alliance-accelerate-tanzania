/**
 * Unit tests for useMetrics() hook — T-5
 *
 * Covers:
 *   - loading starts as true, transitions to false after fetch resolves (design.md §8)
 *   - data is populated when getMetrics() returns a valid Metrics object
 *   - data remains null when getMetrics() returns null (DD-3 graceful fallback)
 *   - no state-update-after-unmount warning (cleanup guard)
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useMetrics } from './useMetrics';
import type { Metrics } from './metrics';

// ---------------------------------------------------------------------------
// Module-level mock — must be hoisted before imports are evaluated
// ---------------------------------------------------------------------------

jest.mock('./metrics', () => ({
  getMetrics: jest.fn(),
}));

// Import the mocked module so we can set return values per-test
/* eslint-disable */
const { getMetrics } = require('./metrics') as { getMetrics: jest.Mock };
/* eslint-enable */

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_METRICS: Metrics = {
  actorsMapped: 342,
  cropsTracked: 3,
  regionsCovered: 7,
  actorTypes: 4,
  crops: [
    { slug: 'sorghum', mappedActors: 120 },
    { slug: 'common_bean', mappedActors: 145 },
    { slug: 'groundnut', mappedActors: 77 },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useMetrics()', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('starts with loading=true and data=null', async () => {
    // Hold the promise unresolved so we can inspect initial synchronous state
    let resolveFn!: (v: Metrics | null) => void;
    getMetrics.mockImplementation(
      () => new Promise<Metrics | null>((resolve) => { resolveFn = resolve; })
    );

    const { result } = renderHook(() => useMetrics());

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    // Resolve inside act() to flush all state updates before the test exits
    await act(async () => { resolveFn(null); });
  });

  it('sets loading=false and data=Metrics after getMetrics() resolves with data', async () => {
    getMetrics.mockResolvedValue(VALID_METRICS);

    const { result } = renderHook(() => useMetrics());

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual(VALID_METRICS);
  });

  it('sets loading=false and data=null when getMetrics() returns null (graceful fallback)', async () => {
    getMetrics.mockResolvedValue(null);

    const { result } = renderHook(() => useMetrics());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBeNull();
  });

  it('does not update state after unmount (cleanup guard prevents post-unmount setState)', async () => {
    // Capture resolve so we can settle the promise AFTER unmount
    let resolveFn!: (v: Metrics | null) => void;
    getMetrics.mockImplementation(
      () => new Promise<Metrics | null>((resolve) => { resolveFn = resolve; })
    );

    const { result, unmount } = renderHook(() => useMetrics());

    // Snapshot state before unmount: loading=true, data=null
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    // Unmount before the promise resolves
    unmount();

    // Settling after unmount must not throw or cause React warnings.
    // The cancelled flag in useEffect cleanup prevents setState from running.
    await act(async () => { resolveFn(VALID_METRICS); });

    // renderHook preserves the last-known state after unmount;
    // it should still reflect the pre-unmount snapshot.
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
  });
});
