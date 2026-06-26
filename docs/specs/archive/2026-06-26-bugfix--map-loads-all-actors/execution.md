# Execution Log — map-loads-all-actors

Branch: `bugfix/map-loads-all-actors`. Loop: Leader → Implementer → Leader-audit.

## T-1 — Map page loads all matching actors — ✅ PASS

- **Date:** 2026-06-26
- **Requirements:** FR-1, FR-2, NFR-1..4.
- **Change:** `frontend/app/(public)/map/page.tsx` — replaced `useActors(filters)` (single 20-row page) with `useDashboardActors(filters)` (accumulates pageSize=100 × ≤10 pages = up to 1,000). Built `PublicActorList { data: actors, page:1, pageSize: actors.length, total }` for `<ActorMap>`; passed `actors`/`total` to `<DiscoverRail>`. No change to ActorMap/DiscoverRail/LeafletMap/the hook.
- **Effect:** the live dataset (436 consented actors) now fully plots; the "N actors shown" header is honest because loaded count == total (436 < 1,000 cap, not truncated).
- **Verification:** `npm run test -- map ActorMap DiscoverRail` → 63 pass (8 suites); `npm run build` green (14 static pages); `tsc` clean on map/page.
- **Review:** Leader audit (diff inspection) — minimal, conformant; no SSR/PII/token change; pageSize cap (100) respected via the hook. PASS.
- **Note:** `useDashboardActors` is a generic bounded-fetch-all despite its `lib/dashboard/` location; reused as-is. Future non-blocking refactor: relocate to `lib/api/useAllActors`. Long-term, backend `GET /api/v1/actors/geo` (currently 404) would be a lighter feed.
