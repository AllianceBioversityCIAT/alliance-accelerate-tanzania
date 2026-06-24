# Tasks — Actor Directory + Profile (Phase 1)

- Spec path: docs/specs/actors/directory/
- Depth: Standard
- Consumed by `/sdd-execute` (Leader → Implementer → Reviewer). Status: `[ ]` not started · `[~]` in progress/halted · `[x]` complete & reviewed PASS.
- Commits: `[SPEC:actors/directory] <message>`. AWS tasks use `--profile IBD-DEV`. No task may add a PII field.

## Tasks

- [x] T-1 Add `search` query parameter to the public Actors list  (deps: none)
      Scope: Add optional `search?: string` (`@IsString`, `@MaxLength(100)`) to `ListQueryDto`; in `ActorsService.findPublic`, when `search` is a non-empty trimmed term, AND an `OR` partial match over `traderName`/`region`/`district` into the existing `consentStatus = GRANTED` + filter `where` (reused by `count`). No projection/PII change; backend only.
      Traces: FR-4 (requirements.md), design.md §3, §4
      Files: backend/src/actors/dto/list-query.dto.ts, backend/src/actors/actors.service.ts, backend/src/actors/actors.service.spec.ts (+ dto spec)
      Verify: `cd backend && npm run test -- actors && npm run build`
      Done when: unit tests prove `search` matches name/region/district (case-insensitive), combines (AND) with crop/role/region, excludes non-GRANTED, yields correct `total`, and an over-long `search` is rejected (400); build passes.

- [x] T-2 Frontend data clients: `search` on list + `getActor`/`useActor` detail  (deps: none)
      Scope: Add `search?: string` to `ActorsQuery` and append it in `getActors`. Add `getActor(id): Promise<PublicActor | null>` (null on any failure incl. 404). Add `useActor(id)` hook ({data, loading, error}) mirroring `useActors`.
      Traces: FR-3, FR-5 (requirements.md), design.md §5
      Files: frontend/lib/api/actors.ts, frontend/lib/api/actors.test.ts, frontend/lib/api/useActor.ts, frontend/lib/api/useActor.test.ts
      Verify: `cd frontend && npm test -- actors useActor`
      Done when: tests show `getActor` returns data on 200 and null on 404/failure, `getActors` includes `search` in the querystring, and `useActor` transitions loading→data / loading→error.

- [x] T-3 Directory list page + ActorCard grid + result count + states  (deps: T-2)
      Scope: `/directory` route under `(public)`; `DirectoryView` renders a responsive `ActorCard` grid from `useActors`, a `ResultCount` ("N organizations found") in an `aria-live` region, and loading/empty/error states (FR-8). `ActorCard` shows name, RoleBadge, region·district, crop chips, capacity, and links to `/profile?id=<id>`. Tokens only; no PII.
      Traces: FR-1, FR-8, NFR-3, NFR-4, NFR-6, NFR-7 (requirements.md), design.md §5
      Files: frontend/app/(public)/directory/page.tsx, frontend/components/directory/{DirectoryView,ActorCard,ResultCount}.tsx, frontend/components/directory/*.test.tsx
      Verify: `cd frontend && npm test -- directory && npm run build`
      Done when: grid + accurate count render from mocked data; loading/empty/error states render distinctly; cards link to `/profile?id=`; static export build passes.

- [x] T-4 Directory search + filters + pagination, URL-synced  (deps: T-3)
      Scope: `DirectorySearch` (debounced ≤400ms), `DirectoryFilters` (crop/role/region selects + clear; region options from the backend-accepted canonical set — OQ-1), `DirectoryPagination` (prev/next + indicator). Wire into `DirectoryView`: read state from `useSearchParams()`, write via `router.replace()`, reset `page=1` on search/filter change; combine all into the `useActors` query.
      Traces: FR-2, FR-3, NFR-2, NFR-3 (requirements.md), design.md §4 (region source), §5
      Files: frontend/components/directory/{DirectorySearch,DirectoryFilters,DirectoryPagination}.tsx (+ tests), frontend/components/directory/DirectoryView.tsx, frontend/lib/content/regions.ts (reconcile if needed)
      Verify: `cd frontend && npm test -- directory`
      Done when: selecting filters / typing search updates the URL and the query, resets to page 1, combines (AND), and "clear" resets; region options match accepted values; tests pass.

- [x] T-5 Actor Profile page + locked Contact panel + states  (deps: T-2)
      Scope: `/profile` route reading `?id=` via `useSearchParams()` wrapped in `<Suspense>` (static-export safe); `ProfileView` uses `useActor(id)` and renders `ProfileHeader`, `ProfileLocation` (textual coords — OQ-3), `ProfileMarketActivity`, `ProfileCapacity`, and an always-locked `RestrictedContactPanel` (FR-6). Loading/error/not-found (404) states. Tokens only.
      Traces: FR-5, FR-6, FR-8, NFR-1, NFR-3, NFR-4, NFR-5, NFR-6 (requirements.md), design.md §5, §8
      Files: frontend/app/(public)/profile/page.tsx, frontend/components/profile/{ProfileView,ProfileHeader,ProfileLocation,ProfileMarketActivity,ProfileCapacity,RestrictedContactPanel}.tsx, frontend/components/profile/*.test.tsx
      Verify: `cd frontend && npm test -- profile && npm run build`
      Done when: sections render from a mocked PublicActor; the locked panel is always present; **no `phone`/`email` substring appears in the rendered DOM** (asserted); null → not-found state; static export build passes.

- [x] T-6 Resolve map "View Profile" deep-links to the Profile route  (deps: T-5)
      Scope: Change the map "View Profile" href from `/directory?actor=${id}` to `/profile?id=${id}` in `ActorPopup` (and any equivalent affordance in the actor list); update the affected component tests.
      Traces: FR-7 (requirements.md), design.md §5
      Files: frontend/components/map/ActorPopup.tsx, frontend/components/map/ActorPopup.test.tsx (+ ActorList* if applicable)
      Verify: `cd frontend && npm test -- ActorPopup map`
      Done when: tests assert the "View Profile" href is `/profile?id=<id>`; map tests pass.

- [x] T-7 A11y / responsive / static-export / PII verification pass  (deps: T-4, T-5, T-6)
      Scope: `jest-axe` on Directory and Profile (no violations); keyboard + visible-focus + `aria-live` count checks; explicit PII-omission test over the rendered Profile DOM; confirm `next build` (output: export) succeeds with all new routes; spot-check responsive at 360px.
      Traces: NFR-1, NFR-3, NFR-5, NFR-6 (requirements.md), design.md §10
      Files: frontend/components/directory/*a11y*.test.tsx, frontend/components/profile/*a11y*.test.tsx (or extend existing a11y test pattern)
      Verify: `cd frontend && npm run build && npm test`
      Done when: axe passes on both surfaces; PII-omission test passes; static export build succeeds; full frontend test suite green.

- [x] T-8 Deploy backend (`search`) + frontend (new routes) and smoke  (deps: T-1, T-7)
      Scope: Redeploy `accelerate-tz-dev-backend` (SAM built-template deploy) to ship `search`; rebuild + deploy the static frontend to S3 + CloudFront invalidation; run the smoke check that `?search=` returns filtered, PII-free results and the new routes load. All `--profile IBD-DEV`, eu-west-1.
      Traces: FR-4, FR-7, NFR-2 (requirements.md), design.md §7
      Files: (no source change) infra/scripts/deploy.sh, infra/scripts/deploy-frontend.sh, infra/scripts/smoke.sh
      Verify: `AWS_PROFILE=IBD-DEV bash infra/scripts/smoke.sh` (and manual load of `/directory`, `/profile?id=<id>` on the CloudFront URL)
      Done when: backend stack updated with `search`; `GET /api/v1/actors?search=…` returns filtered PII-free results over the wire; `/directory` and `/profile?id=<id>` load on CloudFront; smoke passes.

## Dependency Graph

```
T-1 ───────────────┐
T-2 ─┬── T-3 ── T-4 ┤
     └── T-5 ── T-6 ┴── T-7 ── T-8
```

A task is eligible when its status is `[ ]`/`[~]` and every dependency is `[x]`. Ties break by document order (T-1 first; T-1 and T-2 are both immediately eligible and independent).

## Testing & Verification Expectations

- Every task runs its `Verify` command before the Implementer reports completion (smallest targeted command preferred).
- Backend: `npm run test` / `npm run build`. Frontend: `npm test` (Jest/RTL) / `npm run build` (static export).
- Infra/deploy (T-8): scripts only, always `--profile IBD-DEV`, eu-west-1.

## Execution Conventions

- Commits: `[SPEC:actors/directory] <message>`. Audit trail in `execution.md` (one entry per loop iteration).
- No new PII field is introduced anywhere; the PII-omission test (T-5/T-7) is a release gate.
- AWS tasks keep `--profile IBD-DEV`.
