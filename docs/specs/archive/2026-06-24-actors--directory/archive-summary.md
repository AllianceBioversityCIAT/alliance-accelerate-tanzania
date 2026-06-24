# Archive Summary — Actor Directory + Profile (Phase 1)

## 1. Document Control

| Field | Value |
|---|---|
| Original spec path | `docs/specs/actors/directory/` |
| Archive path | `docs/specs/archive/2026-06-24-actors--directory/` |
| Archive date | 2026-06-24 |
| Final status | **Complete — validated PASS, deployed live** |
| Depth | Standard |
| Branch | `feature/actors-directory` |

## 2. Original Spec Path

`docs/specs/actors/directory/` — proposal, requirements, design, tasks, execution, validation-report, this summary.

## 3. Archive Date

2026-06-24.

## 4. Final Status

All 8 tasks `[x]` with independent Reviewer PASS verdicts. Validation **PASS** (no FAIL; one pre-existing, out-of-scope WARN). Phase 1 is **live** on CloudFront + API (eu-west-1, IBD-DEV).

## 5. Requirements Delivered

- **FR-1** public `/directory` paginated card grid + "N organizations found".
- **FR-2** crop/role/region filters (combine AND, URL-synced, reset page, clear).
- **FR-3** debounced (≤400ms) free-text search over name/region/district.
- **FR-4** additive backend `search` query param (case-insensitive OR, ANDed with consent+filters, bounded length → 400; no migration, no PII).
- **FR-5** public `/profile?id=` page (header/location/market/capacity).
- **FR-6** always-locked Contact & Commercial panel for Public (no PII).
- **FR-7** map "View Profile" deep-links to `/profile?id=`.
- **FR-8** loading/empty/error/not-found states.
- **NFR-1..7** PII boundary (3 layers), server-side perf, WCAG 2.1 AA (jest-axe 0 violations), tokens-only, static export, responsive, resilient null-on-failure.

## 6. Files Changed Summary (from execution.md)

- **Backend:** `actors/dto/list-query.dto.ts` (+`search`), `actors/actors.service.ts` (OR match) + specs.
- **Frontend clients:** `lib/api/actors.ts` (+`search`, `getActor`), `lib/api/useActor.ts` (new) + tests.
- **Directory:** `app/(public)/directory/page.tsx`; `components/directory/{DirectoryView,DirectorySearch,DirectoryFilters,DirectoryPagination,ActorCard,ResultCount}.tsx` + tests + `directory-a11y.test.tsx`.
- **Profile:** `app/(public)/profile/page.tsx`; `components/profile/{ProfileView,ProfileHeader,ProfileLocation,ProfileMarketActivity,ProfileCapacity,RestrictedContactPanel}.tsx` + tests + `profile-a11y.test.tsx`.
- **Map:** `components/map/ActorPopup.tsx` (href → `/profile?id=`) + test.
- **Content:** `lib/content/regions.ts` reconciled to the 31 backend `CANONICAL_REGIONS` (OQ-1).
- **A11y fixes:** `ActorCard` `<h3>`→`<h2>`; `ProfileView` skeleton `role="status"`.
- **Deploy:** no source change — backend SAM redeploy (search) + frontend S3/CloudFront via existing `infra/scripts/`.

Commits: `66d021c` (T-1) · `b60a9ee` (T-2) · `0a3f659` (T-3) · `0d0f39c` (T-5) · `7d9bfba` (T-4) · `7efe3de` (T-6) · `e793b13` (T-7) · plus audit/deploy/validation commits.

## 7. Test Evidence Summary

- Frontend: **211/211** across 22 suites (incl. 2 jest-axe suites — 0 violations; PII-omission over DOM; URL-sync; pagination bounds; region-options == canonical).
- Backend: **35/35** actors (search OR over name/region/district, AND with consent+filters, `total` accuracy, over-long → 400).
- Static export: `next build` → 5 routes `○ static` (incl. `/directory`, `/profile`).
- Live (IBD-DEV): smoke **8/8** PASS; `?search=mbeya`→73, `+crop=sorghum`→48, over-long→400; **0 PII keys over the wire**; `/directory`, `/profile`, `/profile?id=` all 200 via CloudFront.

## 8. Validation Summary

`validation-report.md` — **PASS**, archive-ready. Every FR/NFR mapped to a completed task with code, test, and live evidence. Design + proposal (Option A) conformance confirmed; profile `?id=` route deviation documented in design ADR §8.

## 9. Accepted Warnings Or Follow-Ups

- **WARN (accepted):** backend ESLint v9 has no config file (`backend/` lint exits 2) — pre-existing, repo-wide, NOT introduced by this spec. Follow-up chore: add `backend/eslint.config.mjs` (flat config). Backend quality evidenced by `nest build` + Jest.
- **Phase 2 (deferred by design):** Cognito **auth-wiring** spec (Hosted UI/JWT/role plumbing), then **admin/data-validation** console (mockup 4: edit form, validation checklist, consent verification, Trigger Consent Request, Approve & Publish) — the legal-gated, write-capable surface. Role+consent **PII unlock** on profiles lives there.

## 10. Historical Notes

- Phased per the approved proposal (Option A): public read-only Directory + Profile shipped on the already-deployed `/api/v1/actors`; auth/admin/PII-unlock isolated to Phase 2.
- **OQ-1 resolved:** provisional `regions.ts` (10 regions) replaced with all 31 backend `CANONICAL_REGIONS` so the region filter can never produce a 400.
- **OQ-2/OQ-3 honored:** public lists consented-only (locked panel for the rest); profile location is textual coords (no Leaflet on the profile bundle).
- **Static-export decision:** profile uses a `?id=` query-param client page (not `[id]` + `generateStaticParams`) to avoid build-time API coupling and 404s for actors added after a build — preserving map deep-link integrity over a live, changing dataset (design ADR §8).
- Execution ran the full Leader→Implementer→Reviewer triad; every task passed review on the first attempt (no rework loops, no HALTs). A transient ~44-file `" 2"` sync-duplicate artifact appeared mid-run and was swept before commits (never staged).
