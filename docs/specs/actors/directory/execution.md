# Execution Log — Actor Directory + Profile (Phase 1)

- Spec path: docs/specs/actors/directory/
- Orchestration: JCSPECS Leader → Implementer → Reviewer triad (`/sdd-execute`).
- Branch: feature/actors-directory (cut off main).

## Task Execution History

### T-1 — Add `search` query parameter to the public Actors list — PASS (attempt 1)
- Date: 2026-06-24
- Implementer attempts: 1
- **Attempt 1:**
  - Files changed: `backend/src/actors/dto/list-query.dto.ts` (add bounded `search?` — `@IsOptional @IsString @MaxLength(100)`), `backend/src/actors/actors.service.ts` (`const term = query.search?.trim();` → `OR` over `traderName`/`region`/`district` as a sibling `where` key, ANDed with `consentStatus=GRANTED` + crop/role/region; `count` reuses the same `where`), `backend/src/actors/actors.service.spec.ts` (+4 cases), `backend/src/actors/dto/actor-dto.spec.ts` (+2 cases).
  - Verification: `cd backend && npm run test -- actors` → **35 passed / 35**; `nest build` clean.
  - Reviewer (rev-t1) verdict: **PASS** — "OR over the three non-PII columns is a sibling `where` key so Prisma ANDs it with the pinned `consentStatus=GRANTED` and existing filters, `count` reuses the same `where` for an accurate `total`, DTO bounds length to 100 (→400 via ValidationPipe), `toPublic` PII projection unchanged. All audit gates clear; 35/35 independently."
- Requirements covered: FR-4 (and enables FR-3); NFR-1 (no PII added), NFR-2 (server-side filter/paginate).
- Decisions: no `mode: 'insensitive'` — MySQL default `_ci` collation makes `contains` case-insensitive (Prisma MySQL doesn't support the mode flag).
- Final verification: PASS.

### T-2 — Frontend data clients: `search` on list + `getActor`/`useActor` detail — PASS (attempt 1)
- Date: 2026-06-24
- Implementer attempts: 1
- **Attempt 1:**
  - Files changed: `frontend/lib/api/actors.ts` (`ActorsQuery.search?`; `getActors` appends `search` via the existing `!= null` omit pattern; new `getActor(id): Promise<PublicActor | null>` — `apiGet` then try/catch → null incl. 404), `frontend/lib/api/actors.test.ts` (+search append/omit, +getActor 200/404/network), `frontend/lib/api/useActor.ts` (new `'use client'` hook mirroring `useActors`: cancelled-guard, `setError(result === null)`, effect dep `[id]`), `frontend/lib/api/useActor.test.ts` (new — loading→data, error-on-null, refetch-on-id-change, no post-unmount setState).
  - Verification: `cd frontend && npm test -- actors useActor` → **21 passed / 21** (Leader independently re-ran, green).
  - Reviewer (rev-t2) verdict: **PASS** — "getActor swallows all failures (incl. 404) to null via apiGet's throw-on-non-OK; useActor faithfully mirrors useActors with cancelled-guard and error-true-on-null; search appended/omitted like crop/role/region; no PII introduced; all clients stay `'use client'` with no SSR/route-handler/stack substitution; existing behavior preserved. 21/21 independently."
- Requirements covered: FR-3 (search client), FR-5 (detail client/hook), NFR-7 (null-on-failure).
- Decisions: `useActor` keys its effect on the scalar `id` directly (no `JSON.stringify` needed, unlike `useActors` which keys on a query object).
- Final verification: PASS.

### T-3 — Directory list page + ActorCard grid + result count + states — PASS (attempt 1)
- Date: 2026-06-24
- Implementer attempts: 1 (impl-t3, frontend-developer)
- **Attempt 1:**
  - Files: `frontend/app/(public)/directory/page.tsx` (server page → `<DirectoryView/>`), `frontend/components/directory/DirectoryView.tsx` (`'use client'`; `useActors()`; ResultCount + responsive 1→2→3-col ActorCard grid; distinct loading[Skeleton,role=status]/error[role=alert]/empty/loaded states), `ActorCard.tsx` (RoleBadge + crop chips + capacity `—`; Next `<Link>` → `/profile?id=<id>` with aria-label), `ResultCount.tsx` (server; `aria-live="polite"` "N organizations found"), `DirectoryView.test.tsx` (20), `ActorCard.test.tsx` (10).
  - Verification: `cd frontend && npm test -- directory` → **30/30**; `npm run build` → `/directory` static (○). Leader re-ran combined suite → 54/54 + build clean.
  - Reviewer (rev-t3) verdict: **PASS** — FR-1 fields + `/profile?id=` forward-link (FR-7), tokens-only crop-chip pattern mirrors ActorPopup, `aria-live` count, four distinct states, `useActors` server-paginated (no client full-set filter), PII boundary holds, scope correctly defers search/filter/pagination to T-4 (documented forward-compat `query` prop).
- Requirements covered: FR-1, FR-8, NFR-3, NFR-4, NFR-6, NFR-7 (forward FR-7 link).
- Final verification: PASS.

### T-5 — Actor Profile page + locked Contact panel + states — PASS (attempt 1)
- Date: 2026-06-24
- Implementer attempts: 1 (impl-t5, frontend-developer)
- **Attempt 1:**
  - Files: `frontend/app/(public)/profile/page.tsx` (`/profile` route; `<Suspense>`→`ProfileView` + fallback skeleton), `ProfileView.tsx` (`'use client'`; `useSearchParams().get('id')`; `useActor(id)`; loading/not-found[id missing OR data null OR error]/success), `ProfileHeader/ProfileLocation[textual coords, no Leaflet]/ProfileMarketActivity[crop chips]/ProfileCapacity[`—` fallback]/RestrictedContactPanel[always-locked, no PII fields]`, `ProfileView.test.tsx` (24, incl. PII-omission + locked-panel + not-found).
  - Verification: `cd frontend && npm test -- profile` → **24/24** (PII-omission + locked-panel pass); `npm run build` → `/profile` static (○).
  - Reviewer (rev-t5) verdict: **PASS** — PII gate clean (panel unconditionally locked, no contact fields, no phone/email in DOM; sections consume only PublicActor); `useSearchParams` inside `<Suspense>` keeps `/profile` static (NFR-5); tokens-only (`--color-restricted-bg`/`surface-alt` real §7 tokens, no raw hex); textual coords honor OQ-3 (no Leaflet); RoleBadge + crop-chip reuse; FR-8 states covered.
- Requirements covered: FR-5, FR-6, FR-8, NFR-1, NFR-3, NFR-4, NFR-5, NFR-6.
- Decisions: `--color-restricted-bg` was a pre-existing §7 token (no globals/tailwind change).
- Final verification: PASS.

### T-4 — Directory search + filters + pagination, URL-synced — PASS (attempt 1)
- Date: 2026-06-24
- Implementer attempts: 1 (impl-t4, frontend-developer)
- **Attempt 1:**
  - Files: `frontend/components/directory/DirectorySearch.tsx` (debounced ≤400ms input), `DirectoryFilters.tsx` (crop/role/region selects + clear; region from reconciled REGIONS), `DirectoryPagination.tsx` (prev/next + "Page X of Y"; disabled at bounds; null when total ≤ pageSize), `DirectoryView.tsx` (reads search/crop/role/region/page from `useSearchParams()`, writes `router.replace()` shallow, resets page=1 on search/filter change, feeds combined query to `useActors`), `app/(public)/directory/page.tsx` (`<Suspense>` boundary), `frontend/lib/content/regions.ts` (OQ-1 reconcile), + 4 test files.
  - Verification: `cd frontend && npm test -- directory` → **69/69**; `npm run build` → `/directory` static (○).
  - Reviewer (rev-t4) verdict: **PASS** — URL-sync + page-reset + 400ms debounce; combined query drives server-side filter/paginate (NFR-2, no client full-set fetch); `<Suspense>` keeps `/directory` static (NFR-5); region options === the 31 CANONICAL_REGIONS (regions.ts byte-matches normalize.ts; DTO `@IsIn(CANONICAL_REGIONS)` → no 400, **OQ-1 resolved**); role===ROLES===TRADER_TYPES; crop===crops.ts slugs===schema; pagination bounds + clear-all; ResultCount keeps aria-live; tokens-only; no PII.
- Requirements covered: FR-2, FR-3, NFR-2, NFR-3.
- Decisions/Open-questions: **OQ-1 RESOLVED** — provisional `regions.ts` (10 mainland) replaced with all 31 backend `CANONICAL_REGIONS` (26 mainland + 5 Zanzibar) so the region filter can never produce a backend 400.
- Final verification: PASS.

### T-6 — Resolve map "View Profile" deep-link to the Profile route — PASS (attempt 1)
- Date: 2026-06-24
- Implementer attempts: 1 (impl-t6)
- **Attempt 1:**
  - Files: `frontend/components/map/ActorPopup.tsx` (href `/directory?actor=${id}` → `/profile?id=${id}`; comments updated; kept a plain `<a>` for the Leaflet `renderToString` popup), `ActorPopup.test.tsx` (asserts exact `/profile?id=<id>` href). ActorList/ActorListItem unchanged (selection-only; no profile affordance).
  - Verification: `cd frontend && npm test -- ActorPopup map` → **52/52**; `npm run build` clean. Leader re-ran → 52/52.
  - Reviewer (rev-t6) verdict: **PASS** — href repointed, plain `<a>` preserved (no next/link), classes/aria/tokens unchanged, exact test assertion, no `/directory?actor=` placeholder remains anywhere under components/map, list→map selection untouched, PII-free.
- Requirements covered: FR-7.
- Final verification: PASS.

## Notes
- Environment artifact during this run: ~44 `" 2"`-suffixed byte-identical duplicate files appeared across the repo (sync-conflict copies; repo lives under `Desktop/`). Confirmed identical to originals, untracked, never staged; swept before committing. Not part of any task diff.
