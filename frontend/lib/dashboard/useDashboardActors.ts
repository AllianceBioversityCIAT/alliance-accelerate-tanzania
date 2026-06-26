'use client';

/**
 * useDashboardActors — dashboard/discovery-dashboard, FR-10, FR-11, NFR-6.
 *
 * Fetches ALL matching public actors up to a hard cap and accumulates them
 * for client-side aggregation (design.md §3/§5.2).  Never throws.
 *
 * Usage:
 *   const { actors, total, truncated, loading, error } =
 *     useDashboardActors({ crop: 'sorghum' });
 *   if (loading)   return <Skeleton />;
 *   if (error)     return <ErrorState />;
 *   return <Dashboard actors={actors} total={total} truncated={truncated} />;
 */

import { useEffect, useState } from 'react';
import { getActors, type ActorsQuery, type PublicActor } from '@/lib/api/actors';

// ── Pagination constants (design.md §3 — covers current dataset of ≈1 k actors) ─

/**
 * Number of actors requested per API call.
 * MUST NOT exceed the backend's MAX_PAGE_SIZE (100) — the list endpoint's
 * `pageSize` is validated with `@Max(100)` and returns HTTP 400 above it
 * (see backend `actors/dto/list-query.dto.ts`). The hook accumulates across
 * pages, so the per-call cap doesn't limit total coverage.
 */
export const DASH_PAGE_SIZE = 100;

/** Maximum number of pages fetched; total cap = DASH_PAGE_SIZE × DASH_MAX_PAGES = 1 000. */
export const DASH_MAX_PAGES = 10;

// ── Return shape ──────────────────────────────────────────────────────────────

export interface UseDashboardActorsResult {
  /** Accumulated actors across all fetched pages (possibly capacity-filtered). */
  actors: PublicActor[];
  /** Server-reported total matching the query (before any client-side filters). */
  total: number;
  /**
   * True when the server total exceeds the actors we returned — either because
   * we hit the page cap (DASH_MAX_PAGES) or a later page returned null and we
   * stopped accumulating early.
   */
  truncated: boolean;
  loading: boolean;
  /** True when the very first page fetch returns null (NFR-6 null-on-failure). */
  error: boolean;
}

// ── Capacity fallback predicate (design.md §3) ────────────────────────────────

/**
 * Returns true when the actor should be INCLUDED given the capacity bounds.
 * Actors with null / non-finite capacityTons are excluded whenever
 * capacityMin or capacityMax is specified (design.md §3 exclusion rule).
 */
function passesCapacityFilter(
  actor: PublicActor,
  capacityMin?: number,
  capacityMax?: number,
): boolean {
  if (capacityMin == null && capacityMax == null) return true;

  const cap = actor.capacityTons;
  if (cap == null || !isFinite(cap)) return false;

  if (capacityMin != null && cap < capacityMin) return false;
  if (capacityMax != null && cap > capacityMax) return false;
  return true;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useDashboardActors(query?: ActorsQuery): UseDashboardActorsResult {
  const [actors, setActors]       = useState<PublicActor[]>([]);
  const [total, setTotal]         = useState<number>(0);
  const [truncated, setTruncated] = useState<boolean>(false);
  const [loading, setLoading]     = useState<boolean>(true);
  const [error, setError]         = useState<boolean>(false);

  // Serialize the query so a new object reference with the same content does
  // not retrigger the effect (identical to the pattern in useActors.ts).
  const queryKey = JSON.stringify(query ?? null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(false);

    (async () => {
      // ── Page 1 ────────────────────────────────────────────────────────────
      const page1 = await getActors({
        ...query,
        page: 1,
        pageSize: DASH_PAGE_SIZE,
      });

      if (cancelled) return;

      if (page1 === null) {
        // NFR-6: first fetch failed → error state, empty result.
        setActors([]);
        setTotal(0);
        setTruncated(false);
        setLoading(false);
        setError(true);
        return;
      }

      const serverTotal = page1.total;
      let accumulated: PublicActor[] = [...page1.data];
      let hitBound = false;

      // ── Subsequent pages ──────────────────────────────────────────────────
      // How many more actors are there beyond what page 1 returned?
      const fetchedAfterPage1 = page1.data.length;
      const remaining = serverTotal - fetchedAfterPage1;

      if (remaining > 0 && DASH_MAX_PAGES > 1) {
        for (let pageNum = 2; pageNum <= DASH_MAX_PAGES; pageNum++) {
          if (cancelled) return;

          const pageResult = await getActors({
            ...query,
            page: pageNum,
            pageSize: DASH_PAGE_SIZE,
          });

          if (cancelled) return;

          if (pageResult === null) {
            // Later page failed — return what we have; gap means truncated.
            hitBound = accumulated.length < serverTotal;
            break;
          }

          accumulated = [...accumulated, ...pageResult.data];

          // Check whether we've fetched everything or hit the page cap.
          if (accumulated.length >= serverTotal) break;
          if (pageNum === DASH_MAX_PAGES) {
            hitBound = accumulated.length < serverTotal;
          }
        }
      } else if (remaining > 0) {
        // More data exists but we are already at the max-pages cap.
        hitBound = true;
      }

      // ── Capacity fallback (design.md §3) ──────────────────────────────────
      // Apply client-side capacity filter even if the API already applied it,
      // so the hook is correct regardless of server support for these params.
      const { capacityMin, capacityMax } = query ?? {};
      const filtered =
        capacityMin != null || capacityMax != null
          ? accumulated.filter((a) => passesCapacityFilter(a, capacityMin, capacityMax))
          : accumulated;

      // truncated is true when server has more actors than we actually return.
      const isTruncated = hitBound || filtered.length < serverTotal;

      if (!cancelled) {
        setActors(filtered);
        setTotal(serverTotal);
        setTruncated(isTruncated);
        setLoading(false);
        setError(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  return { actors, total, truncated, loading, error };
}
