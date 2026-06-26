# Design — Discovery Map: load all matching actors

- Spec path: docs/specs/bugfix/map-loads-all-actors/
- Status: Draft · Depth: Lite
- Traces: FR-1, FR-2, NFR-1..4

## 1. Approach

Replace the single-page `useActors(filters)` in `frontend/app/(public)/map/page.tsx` with the **bounded fetch-all** hook already built and tested for the dashboard: `useDashboardActors` (`frontend/lib/dashboard/useDashboardActors.ts`). It accumulates pages at `pageSize = 100` (the API cap, NFR-1) up to `DASH_MAX_PAGES = 10` (1,000-row cap), stopping early once all rows are fetched, and returns `{ actors, total, truncated, loading, error }` with null-on-failure resilience (NFR-2).

The map's child components (`ActorMap`, `DiscoverRail`) consume a `PublicActorList` / `actors[]` + `total`. The page adapts the hook output into that shape:

```ts
const { actors, total, truncated, loading, error } = useDashboardActors(filters);
const data: PublicActorList = { data: actors, page: 1, pageSize: actors.length, total };
// pass data={data} to ActorMap; actors={actors} total={...} to DiscoverRail
```

**Note (naming):** `useDashboardActors` is a generic bounded-fetch-all despite living under `lib/dashboard/`. It is reused as-is to avoid risk; a future non-blocking refactor could relocate it to `lib/api/useAllActors`. No behavior change is needed in the hook.

## 2. Count header (FR-2)

`DiscoverRail` currently computes `displayCount = total ?? actors.length`. Once the page loads all actors, `actors.length === total` (when not capped), so the header becomes accurate with no rail change required. To stay honest under the cap, the page passes `total` as before; if `truncated` (loaded < server total — only possible beyond 1,000 rows), the rail SHOULD show "N of M". For the current dataset (436 < 1,000) this never triggers; the minimal change is to keep `total` authoritative and let `displayCount` equal the loaded count. **Decision:** keep `DiscoverRail` as-is (it already prefers `total`); because we now load all rows, `total` and loaded count coincide. Add a `truncated`-aware "N of M" only if trivially cheap — otherwise defer (documented), since it's unreachable for the live dataset.

## 3. Files

- **Modify:** `frontend/app/(public)/map/page.tsx` — swap the hook + adapt the data shape. No change to `ActorMap`, `DiscoverRail`, `LeafletMap`.
- **Tests:** map relies on `ActorMap`/`DiscoverRail`/`map-a11y` suites; add/adjust a page-level smoke test only if needed. Mock the fetch hook so no network in tests.

## 4. Risks

- **Payload:** ~5 sequential `/actors` calls of full records (~436) per filter change. Acceptable for the dataset; the `/actors/geo` endpoint is the lighter long-term path (out of scope).
- **Marker density:** 436 Leaflet markers render fine; clustering is a separate enhancement.

## 5. Test Plan

- Existing `ActorMap`, `DiscoverRail`, `map-a11y` suites stay green.
- Manual: load `/map` → rail count and plotted markers reflect the full consented set; apply a region filter → set narrows correctly; selection/fly-to/popup still work.
- `npm run build` green (static export); verify live after deploy that the map shows the full set.
