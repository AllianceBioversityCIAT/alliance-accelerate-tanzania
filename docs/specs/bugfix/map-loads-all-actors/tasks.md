# Tasks — Discovery Map: load all matching actors

Spec path: `docs/specs/bugfix/map-loads-all-actors/` · Depth: Lite.
Commits: `[SPEC:bugfix/map-loads-all-actors] <message>`.

- [x] T-1 Map page loads all matching actors  (deps: none)
      Scope: In `frontend/app/(public)/map/page.tsx`, replace `useActors(filters)` with `useDashboardActors(filters)` (the bounded fetch-all hook). Adapt its `{ actors, total, truncated, loading, error }` output into the `PublicActorList` shape the children expect: build `data = { data: actors, page: 1, pageSize: actors.length, total }`, pass `data={data}` to `ActorMap`, and `actors={actors}` / `total={total}` to `DiscoverRail`. Keep `loading`/`error`/selection wiring identical. No change to `ActorMap`/`DiscoverRail`/`LeafletMap`. Do NOT exceed pageSize 100 (the hook already uses 100).
      Traces: FR-1, FR-2, NFR-1..4 (requirements.md), design.md §1/§2/§3
      Files: frontend/app/(public)/map/page.tsx (+ a focused page smoke test if one is warranted; mock `@/lib/dashboard/useDashboardActors`)
      Verify: `cd frontend && npm run test -- map ActorMap DiscoverRail && npm run build`
      Done when: map page compiles; existing map/ActorMap/DiscoverRail/map-a11y tests stay green; static build green; the page now feeds the full accumulated actor set (not a 20-row page) to the map + rail.

## Dependency Graph
```
T-1  (no deps)
```

## Verification Expectations
- Frontend gates: `npm run test -- map ActorMap DiscoverRail`, `npm run build` (static export green).
- No backend change; no new PII; no raw hex; pageSize ≤ 100.
- Post-merge: deploy via `AWS_PROFILE=IBD-DEV ./infra/scripts/deploy-frontend.sh` and verify the live map shows the full consented set.
