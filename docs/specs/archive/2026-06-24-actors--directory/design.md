# Design — Actor Directory + Profile (Phase 1)

- Spec path: docs/specs/actors/directory/
- Status: Draft
- Traces requirements: FR-1..FR-8, NFR-1..NFR-7 from this spec's requirements.md

## 1. Approach Overview

Phase 1 is **mostly frontend** plus **one additive backend query parameter**. The Next.js static-export app gains two public surfaces — a Directory list (`/directory`) and an Actor Profile — both client-rendered against the already-deployed NestJS/Lambda API (`GET /api/v1/actors` list + detail). The role-aware serializer already guarantees the PII boundary server-side, so the frontend consumes the PII-safe `PublicActor` shape by type. The only backend work is adding an optional, validated `search` parameter to the existing list read path so free-text search runs server-side (NFR-2), keeping the client from ever fetching the full dataset.

```
Browser ──/directory──────────▶ DirectoryView (client) ──▶ getActors({search,crop,role,region,page})
        ──/profile?id=<id>────▶ ProfileView   (client) ──▶ getActor(id)
                                          │                         │
                                          ▼                         ▼
                              NEXT_PUBLIC_API_BASE_URL ── GET /api/v1/actors[?…] / /actors/:id
                                          │
                                          ▼
                              NestJS ActorsService → role-aware serializer (GRANTED-only, no PII)
```

No SSR/route handlers are introduced; all data fetching is client-side (NFR-5). The map's "View Profile" links are repointed from the `/directory?actor=` placeholder to the real Profile route (FR-7).

## 2. Data Model Changes

**None.** No Prisma model, column, migration, or seed change. No new PII fields; the PII allowlist is unchanged (requirements §5). The `search` parameter (FR-4) is a query/validation addition only.

## 3. API Surface & Contracts

### Modified — `GET /api/v1/actors` (additive `search`)

| Field | Value |
|---|---|
| Method / path | `GET /api/v1/actors` |
| Auth / role | Anonymous (`Public`) |
| New query param | `search?: string` — optional, trimmed, **max length 100**; case-insensitive partial match over `traderName`, `region`, `district` |
| Existing params | `crop`, `role`, `region`, `page`, `pageSize` (unchanged) |
| Combination | `search` is ANDed with `consentStatus = GRANTED` and all existing filters |
| Response | Unchanged envelope `{ data: PublicActor[], page, pageSize, total }` (detailed-design §4); `total` counts the filtered GRANTED set |
| Errors | 400 when `search` fails validation (length); otherwise 200 |

`PublicActor` projection is unchanged: `{ id, traderName, region, district, traderType, capacityTons, crops[], gps }` — no PII, GPS only when consented.

### Unchanged — `GET /api/v1/actors/:id`

Already deployed (archived `seed-map/actor-data-model` T-5). Returns a `PublicActor` or **404** when the id is absent or not consented. The Profile page consumes this as-is; no backend change.

## 4. Backend Design

Single-concern change in the existing actors module — **no new files**.

- **`backend/src/actors/dto/list-query.dto.ts`** — add:
  ```ts
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
  ```
  (`@MaxLength` imported from `class-validator`; the global `ValidationPipe` already rejects malformed queries → 400, NFR-4 of the prior spec.)
- **`backend/src/actors/actors.service.ts`** — in `findPublic`, when `query.search` is a non-empty trimmed string, add to the `where`:
  ```ts
  const term = query.search?.trim();
  ...(term
    ? { OR: [
        { traderName: { contains: term } },
        { region:     { contains: term } },
        { district:   { contains: term } },
      ] }
    : {}),
  ```
  MySQL's default `utf8mb4_*_ci` collation makes `contains` (LIKE `%term%`) case-insensitive — no `mode` needed (and Prisma's MySQL connector does not support `mode: 'insensitive'`). The existing `consentStatus = GRANTED` and `crop`/`role`/`region` constraints remain; Prisma ANDs the top-level keys, so `OR` (search) is correctly intersected with them. `count` reuses the same `where` so `total` stays accurate (FR-3).
- **Performance (NFR-2):** at ~1,000 rows a `LIKE '%term%'` scan is well under 1s; the result is paginated (`take`/`skip`) and ordered by `traderName`. A FULLTEXT index is a documented future optimization (Risks §9), not needed at Phase-1 scale.
- **Security:** consent stays enforced at the query (defense in depth); the serializer remains the only exit to a public shape; `search` never touches a PII column (FR-6/NFR-1).

## 5. Frontend Design

### Routes (App Router, `(public)` group)

| Route | File | Rendering | Notes |
|---|---|---|---|
| `/directory` | `frontend/app/(public)/directory/page.tsx` | client (`'use client'` view; filters/search read URL) | List + filters + search + pagination |
| `/profile?id=<id>` | `frontend/app/(public)/profile/page.tsx` | client; reads `id` from `useSearchParams()` | Single Actor Profile |

**Static-export decision (NFR-5 / OQ-4):** the Profile is a **single static page that reads the actor id from a `?id=` query parameter**, not a `[id]` dynamic segment. Under `output: 'export'`, a dynamic `[id]` segment requires build-time `generateStaticParams`, which (a) couples the frontend build to a live API call and (b) 404s for any actor added after the build — unacceptable for a live, changing directory whose map deep-links must always resolve (FR-7). The query-param page handles any id at runtime and stays fresh. Because `useSearchParams()` triggers a client-side bailout under static export, the page body MUST be wrapped in a `<Suspense>` boundary.

### Data clients (`frontend/lib/api/`)

- **`actors.ts`** — extend `ActorsQuery` with `search?: string` and append it to the querystring in `getActors`. Add `getActor(id: string): Promise<PublicActor | null>` calling `GET /api/v1/actors/:id`, returning `null` on any failure **including 404** (null-on-failure, NFR-7).
- **`useActor.ts`** (new) — mirrors `useActors`: `{ data, loading, error }` for a single id; `error` true only on a real failure/404 (distinct from loading).

### Components

```
frontend/components/directory/
  DirectoryView.tsx        # client: owns URL-synced search/filter/page state; renders the grid + controls + states (FR-1,2,3,8)
  DirectorySearch.tsx      # debounced text input (FR-3); labeled; aria
  DirectoryFilters.tsx     # crop / role / region selects + clear (FR-2); reuse select pattern from components/map/FilterControls.tsx
  DirectoryPagination.tsx  # prev/next + page indicator; resets correctly (FR-1,2,3)
  ActorCard.tsx            # one grid card → links to /profile?id= (FR-1, FR-7); reuses RoleBadge + crop chips
  ResultCount.tsx          # "N organizations found" in an aria-live region (NFR-3)
frontend/components/profile/
  ProfileView.tsx          # client: useActor(id); orchestrates sections + loading/notfound/error (FR-5,8)
  ProfileHeader.tsx        # name, RoleBadge, region · district (FR-5)
  ProfileLocation.tsx      # region, district, coordinates (textual — OQ-3) (FR-5)
  ProfileMarketActivity.tsx# crop chips / activity (FR-5)
  ProfileCapacity.tsx      # operational capacity (tons) (FR-5)
  RestrictedContactPanel.tsx # always-locked Contact & Commercial panel for Public (FR-6)
```

- **State & URL sync (FR-2/FR-3):** `DirectoryView` reads `search`, `crop`, `role`, `region`, `page` from `useSearchParams()` and writes via `router.replace()` (shallow, static-safe) so filter/search state is shareable and back-button safe. Any change to search/filters resets `page=1`. Search is debounced ≤ 400 ms before the URL/request updates. Data flows through the existing `useActors(query)` hook.
- **Reuse:** `RoleBadge`, the crop-chip token classes (from `ActorPopup`/`crops.ts`), the `(public)` shell (Header/Footer), `Skeleton` for loading, and §7 tokens. No new colors/geometry (NFR-4).
- **Region options (OQ-1):** `DirectoryFilters` sources region options from the backend-accepted canonical set; `regions.ts` is reconciled if it diverges, so no filter value can produce a 400.

### Map deep-link (FR-7)

- `frontend/components/map/ActorPopup.tsx` — change the "View Profile" `href` from `/directory?actor=${actor.id}` to `/profile?id=${actor.id}`.
- `frontend/components/map/ActorList.tsx` / `ActorListItem.tsx` — if a "View Profile" affordance exists there, point it to the same route; otherwise leave list→map selection behavior unchanged.
- Update the affected component tests to assert the new href.

## 6. Security & RBAC

- `Public` role only. The PII boundary is enforced server-side by the role-aware serializer (unchanged) and the consent-at-query guard; the client consumes `PublicActor`, which has no PII fields by type (NFR-1/FR-6).
- `search` is validated (bounded length) and only matches non-PII columns; it cannot widen the projection or bypass consent.
- No secrets, no CORS change (same API origin already allow-listed for the CloudFront URL). No Cognito wiring (Phase 2).

## 7. Infrastructure / Deployment

- **Backend:** redeploy `accelerate-tz-dev-backend` (SAM build + deploy of the **built** template) to ship the `search` param — `--profile IBD-DEV`, eu-west-1, via `infra/scripts/deploy.sh` (backend portion) or a scoped `sam build && sam deploy`.
- **Frontend:** rebuild static export (`next build`) and deploy to S3 + CloudFront invalidation via `infra/scripts/deploy-frontend.sh` — `--profile IBD-DEV`.
- **Smoke:** `infra/scripts/smoke.sh` (extended) confirms `?search=` returns filtered results and the PII boundary holds over the wire.
- No new AWS resources, secrets, or IaC topology changes.

## 8. Decision Records (ADR-style)

### Decision: Profile uses a `?id=` query-param client page, not a `[id]` static-param route
- **Context:** `output: 'export'` forbids runtime dynamic routes; `[id]` needs build-time `generateStaticParams`.
- **Options:** (a) `[id]` + `generateStaticParams` enumerating ids from the API at build — clean URLs but couples build to the API and **404s for actors added after the build**, breaking map deep-links; (b) single static `/profile` page reading `?id=` — handles any id at runtime, always fresh, zero build coupling.
- **Decision:** (b). Map deep-link integrity (FR-7) over a live, changing dataset outweighs prettier URLs.
- **Consequences:** URLs are `/profile?id=<id>`; the map link is updated accordingly; the page wraps its body in `<Suspense>` for the `useSearchParams` bailout. Pretty per-actor URLs/SEO can be revisited if the dataset becomes build-stable.

### Decision: Search is a server-side `search` param, not client-side refine
- **Context:** PRD AC-2 (p95 < 1s) over 1,000+ records; the list is paginated 20/page.
- **Options:** (a) client-side filter within the current page — broken (only refines 20 rows); (b) fetch the whole dataset and filter client-side — violates NFR-2/pagination; (c) additive backend `search` param.
- **Decision:** (c). Correct counts across all pages, scales, minimal additive change.
- **Consequences:** one DTO field + one `where` clause + a backend redeploy; `LIKE` scan is fine at Phase-1 scale (FULLTEXT later).

### Decision: Public profile shows an always-locked Contact & Commercial panel
- **Context:** mockups show unlocked contact/commercial data for authenticated staff; public must never see PII (FR-6, detailed-design §8).
- **Decision:** render the locked state unconditionally for `Public`; the unlocked variant + the verified/pending states are Phase 2 (auth).
- **Consequences:** no PII reaches the client; the panel doubles as a clear signpost to the future authenticated experience.

## 9. Risks & Mitigations

- **`search` LIKE scan at scale:** fine at ~1,000 rows; if the dataset grows large, add a MySQL FULLTEXT index on `traderName`/`region`/`district` (future, not Phase 1).
- **Region filter / 400s (OQ-1):** if a region option isn't in the backend's accepted set, the request 400s. Mitigate by sourcing options from the canonical accepted set and reconciling `regions.ts`.
- **Static-export `useSearchParams` bailout:** missing `<Suspense>` breaks the export build — covered by the static-export verification task (T-7) running `next build`.
- **Map deep-link regression:** changing the popup href can break existing map tests — update them in the same task (T-6).
- **API unavailable:** both clients are null-on-failure; components render error/not-found states (FR-8) — no crash.

## 10. Test Plan Outline

- **Backend (FR-4):** unit tests on `findPublic` — `search` matches name/region/district (case-insensitive), combines with `crop`/`role`/`region` (AND), excludes non-GRANTED, accurate `total`; DTO rejects over-long `search` (400). `cd backend && npm run test -- actors`.
- **Frontend clients (FR-5, NFR-7):** `getActor` returns data on 200, `null` on 404/failure; `getActors` appends `search`. `useActor` loading/error transitions.
- **Directory (FR-1,2,3,8, NFR-3,6):** renders grid + count; filters/search update query and reset page; empty vs error states; `jest-axe` clean; responsive.
- **Profile (FR-5,6,8, NFR-1):** renders sections from a mocked `PublicActor`; **PII-omission assertion** — no `phone`/`email` substring in the rendered DOM; locked panel always present; not-found on null.
- **Map (FR-7):** popup/list "View Profile" href = `/profile?id=<id>`.
- **Static export (NFR-5):** `cd frontend && npm run build` (output: export) succeeds with the new routes.
- **E2E smoke (deploy):** `?search=` over the wire returns filtered, PII-free results (`infra/scripts/smoke.sh`, IBD-DEV).
