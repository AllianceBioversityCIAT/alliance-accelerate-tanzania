# Archive Summary — Discovery Map: load all matching actors

## 1. Document Control

| Field | Value |
|---|---|
| Original spec path | `docs/specs/bugfix/map-loads-all-actors/` |
| Archived as | `docs/specs/archive/2026-06-26-bugfix--map-loads-all-actors/` |
| Archive date | 2026-06-26 |
| Depth | Lite |
| Final status | **Complete — merged & deployed** |
| PR | #20 (merged → `main` `28d4c84`) |

## 2. Final Status

Single task `[x]`; merged and deployed to CloudFront; verified live (all 436 consented actors have valid GPS and now plot). No `validation-report.md` — **accepted**: lite bugfix verified by execution evidence (63 map-suite tests + green build) and live confirmation.

## 3. Requirements Delivered

- **FR-1:** `/map` loads all matching consented actors (not a single 20-row page) and plots/lists the full set.
- **FR-2:** "N actors shown" header reflects actors actually loaded (loaded == total for the live 436-row dataset).
- **NFR-1…4:** per-call `pageSize ≤ 100` (API cap respected via page accumulation); null-on-failure preserved; static-export safe; no regression to filtering/selection/popups/mobile rail.

## 4. Files Changed Summary

- **Modified:** `frontend/app/(public)/map/page.tsx` — swapped `useActors(filters)` for the bounded fetch-all hook `useDashboardActors(filters)`; adapted output into the `PublicActorList` shape consumed by `ActorMap`/`DiscoverRail`.
- **Unchanged:** `ActorMap`, `DiscoverRail`, `LeafletMap`, the hook. No backend/schema/PII change.

## 5. Test Evidence Summary

- `npm run test -- map ActorMap DiscoverRail` → **63 tests / 8 suites pass**.
- `npm run build` green (static export, 14 pages); `tsc` clean.
- Live verification: `/actors` total = 436; all 436 have valid GPS → all plot. `/map` HTTP 200.

## 6. Validation Summary

No formal `/sdd-validate` run (lite bugfix). Conformance verified by Leader diff audit + execution evidence + live deploy. **Accepted** as sufficient for a single-file, low-risk frontend fix.

## 7. Accepted Warnings / Follow-Ups

- `useDashboardActors` is a generic bounded-fetch-all despite living under `lib/dashboard/`; reused as-is. **Future non-blocking refactor:** relocate to `lib/api/useAllActors`.
- **Deferred optimization:** implement backend `GET /api/v1/actors/geo` (lightweight, no-PII points feed, currently 404) to replace ~5 paginated `/actors` calls if payload size matters as the dataset grows past the 1,000-row fetch cap.

## 8. Historical Notes

Same root cause family as the dashboard pageSize bug (PR #19): a data-loading UI fetching a single small page while the count header showed the server `total`. Lesson captured in user memory `api-pagesize-cap-and-live-verify` — respect the API `pageSize ≤ 100` cap and verify against the live API, not just mocks.
