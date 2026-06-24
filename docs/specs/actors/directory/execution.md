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

## Notes
- Environment artifact during this run: ~44 `" 2"`-suffixed byte-identical duplicate files appeared across the repo (sync-conflict copies; repo lives under `Desktop/`). Confirmed identical to originals, untracked, never staged; swept before committing. Not part of any task diff.
