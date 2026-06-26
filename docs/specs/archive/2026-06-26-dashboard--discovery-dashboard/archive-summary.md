# Archive Summary — Seed Discovery Dashboard

## 1. Document Control

| Field | Value |
|---|---|
| Original spec path | `docs/specs/dashboard/discovery-dashboard/` |
| Archived as | `docs/specs/archive/2026-06-26-dashboard--discovery-dashboard/` |
| Archive date | 2026-06-26 |
| Final status | **Complete — merged & deployed** |
| Feature PR | #18 (merged → `main` `8c4d456`) |
| Post-merge fix PR | #19 (pageSize cap — merged `eb80163`) |

## 2. Final Status

All 16 tasks `[x]`; validation **PASS** (0 FAIL, 4 accepted WARN). Live at `/dashboard` on CloudFront. One production bug found after merge and fixed (see §9).

## 3. Requirements Delivered

- **FR-1…FR-11:** `/dashboard` route + nav/Hero entry points; shared URL-synced filter set; capacity-range filter exposed; KPI band; 3 charts with data-table fallbacks; reused Leaflet map; PII-free shortlist; PII-free CSV export; loading/empty/error/truncation states; consent/PII parity.
- **NFR-1…NFR-7:** no PII exposure; static export; <1s-class interaction (charts lazy-loaded, 115 kB first load); WCAG 2.1 AA; design-tokens only; null-on-failure resilience; URL-shareable filters.

## 4. Files Changed Summary

- **New (frontend):** `app/(public)/dashboard/page.tsx`; `components/dashboard/*` (DashboardView, DashboardFilters, CapacityRangeControl, KpiBand, KpiCard, DashboardMapPanel, ShortlistTable, DownloadViewButton, charts/{ChartCard, CapacityByRegionChart, CropDistributionChart, ActorTypeChart}); `lib/dashboard/*` (aggregate, useDashboardActors, csv, chart-tokens, filters-url).
- **Modified:** `lib/api/actors.ts` (+`capacityMin`/`capacityMax`/`district`); `components/shell/Header.tsx` (nav link); `components/home/Hero.tsx` (primary CTA); `package.json` (+recharts).
- **No backend/schema/PII-allowlist change.**

## 5. Test Evidence Summary

- Full frontend suite **687 tests / 54 suites pass**; ~259 dashboard-specific tests.
- PII tests assert `phone`/`email` never appear in CSV/shortlist (incl. poisoned-actor cases).
- Static `npm run build` green; `/dashboard` exported as a static route (115 kB first load).

## 6. Validation Summary

`validation-report.md`: **PASS — archive-ready.** Constitutional gates (PII, static export, tokens, stack) verified; every requirement maps to a completed task with code + test evidence.

## 7. Accepted Warnings / Follow-Ups

- **WARN-1:** 5 tasks (T-8/12/14/15/16) audited by the Leader (read-only) instead of the delegated Reviewer due to a transient model-classifier outage; validation independently re-verified their gates.
- **WARN-2:** benign `act()` warning from `next/dynamic` in `DashboardView.test.tsx` (non-failing).
- **WARN-3:** iCloud `.next/types/*.d 2.ts` artifacts (never committed).
- **WARN-4:** reviewer polish suggestions (data-table keys, `aria-live` on static empty state, median decimals) — deferred.
- **Deferred specs:** contact-loop "request introduction" flow (OQ-1); backend `GET /api/v1/actors/geo` lightweight feed.

## 8. Historical Notes

Built via the full JCSPECS loop (propose → specify → execute → validate). Key decisions: Recharts over ECharts (token CSS-vars in SVG); client-side aggregation over a bounded fetch (no backend aggregate); reuse `ActorMap`; charts code-split for perf. The dashboard consciously extends the PRD's v1 "out of scope: advanced analytics dashboards" line at stakeholder request, while staying inside the PRD's data/PII boundaries.

## 9. Post-Merge Bug (fixed)

After merge, `/dashboard` showed "Couldn't load registry data" in production. Root cause: `useDashboardActors` used `DASH_PAGE_SIZE = 500`, but the backend caps `pageSize` at `@Max(100)` and returns HTTP 400 above it → `getActors` → null → error state. Unit tests mocked the getter, so they never hit the real cap. **Fixed in PR #19** (`DASH_PAGE_SIZE = 100`, `DASH_MAX_PAGES = 10`; tests made page-aware; `design.md §3` updated to document the cap). Lesson captured in user memory `api-pagesize-cap-and-live-verify`. The same root cause produced the discovery-map bug fixed under `bugfix/map-loads-all-actors`.
