# Validation Report — Actor Directory + Profile (Phase 1)

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/actors/directory/` |
| Validated | 2026-06-24 |
| Validator | Leader (JCSPECS `/sdd-validate`) |
| Branch | `feature/actors-directory` |
| Depth | Standard |
| Overall result | **PASS** (1 pre-existing WARN, not introduced by this spec) |
| Archive readiness | **Ready** — `/sdd-archive actors/directory` |

## 2. Summary

All 8 tasks are `[x]` with execution-audit entries and independent Reviewer PASS verdicts. The public Directory (`/directory`) and Profile (`/profile?id=`) are implemented, tested (211/211 frontend, 35/35 backend actors), reviewed, and **deployed live** (CloudFront + API, eu-west-1, IBD-DEV) with the additive backend `search` param. The PII boundary holds in three independent layers (server serializer, client `PublicActor` type, and verified over the wire). Static-export, design-token, and WCAG-2.1-AA (jest-axe, zero violations) gates pass. One **WARN** is a pre-existing tooling gap (backend ESLint v9 has no config file) unrelated to this spec. No FAIL findings.

## 3. Task Completion

| Task | Status | Evidence | Result |
|---|---|---|---|
| T-1 backend `search` param | [x] | rev-t1 PASS; 35/35 + nest build | PASS |
| T-2 `getActor`/`useActor` + `search` client | [x] | rev-t2 PASS; 21/21 | PASS |
| T-3 Directory list + ActorCard + states | [x] | rev-t3 PASS; 30/30; `/directory` static | PASS |
| T-4 search + filters + pagination, URL-sync | [x] | rev-t4 PASS; 69/69; OQ-1 resolved | PASS |
| T-5 Profile + locked Contact panel | [x] | rev-t5 PASS; 24/24 incl. PII-omission | PASS |
| T-6 map deep-link → `/profile?id=` | [x] | rev-t6 PASS; 52/52 | PASS |
| T-7 a11y/static-export/PII verification | [x] | rev-t7 PASS; 211/211; axe 0 violations | PASS |
| T-8 deploy + smoke (IBD-DEV) | [x] | live: search 73/48/400; smoke 8/8; routes 200 | PASS |

All completed tasks carry execution notes + verification evidence in `execution.md`. **Result: PASS.**

## 4. File Existence

All design §5 files present: `app/(public)/directory/page.tsx`, `app/(public)/profile/page.tsx`; `components/directory/{DirectoryView,DirectorySearch,DirectoryFilters,DirectoryPagination,ActorCard,ResultCount}.tsx`; `components/profile/{ProfileView,ProfileHeader,ProfileLocation,ProfileMarketActivity,ProfileCapacity,RestrictedContactPanel}.tsx`; `lib/api/useActor.ts`; backend `dto/list-query.dto.ts` + `actors.service.ts` modified; `lib/content/regions.ts` reconciled. 8 directory/profile test files + 2 a11y suites. **Result: PASS.**

## 5. Build Integrity

| Check | Command | Result |
|---|---|---|
| Backend build | `cd backend && npm run build` | **PASS** (nest build clean) |
| Backend tests (actors) | `npm run test -- actors` | **PASS** 35/35 |
| Backend lint | `npm run lint` | **WARN** — exit 2: ESLint v9 finds no `eslint.config.*`/`.eslintrc*` in `backend/`. Pre-existing tooling gap; this spec added no lint config and its code compiles + passes tests. |
| Frontend build (static export) | `npm run build` | **PASS** — all 5 routes `○ (Static)`, incl. `/directory`, `/profile` |
| Frontend tests | `npm test` | **PASS** 211/211 across 22 suites |
| Frontend lint | `npm run lint` | **PASS** — no ESLint warnings or errors |

**Result: PASS** (backend lint WARN is pre-existing infrastructure, not a regression — see Remediation).

## 6. Requirement Coverage

| Req | Covered by | Evidence | Result |
|---|---|---|---|
| FR-1 Directory list/cards/count | T-3 | ActorCard + DirectoryView + ResultCount; 30 tests; live `/directory` 200 | PASS |
| FR-2 filters (crop/role/region) combine + URL + reset + clear | T-4 | DirectoryFilters; URL-sync tests | PASS |
| FR-3 debounced search | T-4 (+T-2) | DirectorySearch ≤400ms; live `?search=mbeya`→73 | PASS |
| FR-4 backend `search` param | T-1, T-8 | service OR + DTO @MaxLength(100); live 73/48/400; `count` accurate | PASS |
| FR-5 Profile page | T-5 (+T-2) | ProfileView + sections; `/profile?id=` 200 | PASS |
| FR-6 locked Contact panel, no PII | T-5 | RestrictedContactPanel always locked; PII-omission test; 0 phone/email over wire | PASS |
| FR-7 map deep-link | T-6 | ActorPopup `/profile?id=`; 52 map tests; live | PASS |
| FR-8 loading/empty/error/not-found | T-3, T-5 | distinct states + tests | PASS |
| NFR-1 PII boundary | T-1/T-5/T-7 | serializer + client type + jest DOM + live wire (0 PII keys) | PASS |
| NFR-2 p95<1s server-side | T-1/T-4 | server filter/paginate; no client full-set fetch | PASS |
| NFR-3 WCAG 2.1 AA | T-7 | jest-axe 0 violations; aria-live; labeled controls | PASS |
| NFR-4 tokens | T-3/T-4/T-5 | reviewers confirmed no raw hex | PASS |
| NFR-5 static export | T-4/T-5/T-7 | `next build` `○` for `/directory`, `/profile` (Suspense) | PASS |
| NFR-6 responsive | T-3/T-7 | grid-cols-1/sm:2/lg:3 asserted | PASS |
| NFR-7 resilient fetch | T-2 | null-on-failure incl. 404; states render | PASS |

**Result: PASS** — every requirement maps to ≥1 completed task with code + test (and live) evidence.

## 7. Linting & Code Quality

- Frontend: lint clean; reviewers confirmed tokens-only, no PII, correct `'use client'` boundaries, null-on-failure resilience, minimal axe fixes.
- Backend: build + tests clean; the additive `search` keeps consent at the query (defense in depth) and the unchanged role-aware serializer as the sole public exit. Backend lint tooling is non-functional repo-wide (WARN, §5).

## 8. Design Conformance

Implementation matches design.md §1–§10. Tracked decisions/deviations, all documented:
- **Profile route `?id=` query-param** (design ADR §8) instead of the proposal's `[id]` segment — intentional, for static-export robustness (no build-time API coupling, no 404 for post-build actors). Aligned and documented.
- **OQ-1 RESOLVED:** `regions.ts` reconciled to the backend's 31 `CANONICAL_REGIONS` (no region option can 400).
- **OQ-2 honored:** public lists consented-only; the "pending/unlocked" states are Phase 2.
- **OQ-3 honored:** Profile location is textual coords (no Leaflet on the profile bundle).
- Proposal Option A intent/scope/non-goals upheld: public read-only Directory + Profile shipped; auth/admin console/PII-unlock correctly deferred to Phase 2.

**Result: PASS.**

## 9. Test Evidence Summary

- Frontend: **211 passed / 211** across 22 suites (incl. 2 jest-axe a11y suites, PII-omission over DOM on Directory + Profile, URL-sync, pagination bounds, region-options==canonical).
- Backend: **35 passed / 35** actors (search OR over name/region/district, AND with consent+filters, `total` accuracy, over-long→400).
- Static export: `next build` → 5 routes `○ static`.
- Live (IBD-DEV): smoke 8/8 PASS; `?search=mbeya`→73, `+crop=sorghum`→48, over-long→400; 0 PII keys over the wire; `/directory`, `/profile`, `/profile?id=` all 200 via CloudFront.

## 10. Remediation

| # | Finding | Severity | Action |
|---|---|---|---|
| 1 | Backend ESLint v9 has no config file (`backend/` lint exits 2) | WARN (pre-existing, repo-wide; not introduced here) | Follow-up: add `backend/eslint.config.mjs` (flat config) — own small chore/infra task, out of this spec's scope. Backend quality is currently evidenced by `nest build` + Jest. |

No FAIL findings. No remediation required for archive.

## 11. Archive Readiness Recommendation

**READY TO ARCHIVE.** All 8 tasks `[x]` with Reviewer PASS + execution evidence; every FR/NFR covered with code, test, and live evidence; build/tests/static-export/a11y/PII gates pass; design + proposal conformance confirmed; the single WARN is a pre-existing, out-of-scope backend lint-config gap with a follow-up note. 

```text
/sdd-archive actors/directory
```
