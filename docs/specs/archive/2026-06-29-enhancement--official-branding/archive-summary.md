# Archive Summary — Adopt the official ACCELERATE brand

## 1. Document Control

| Field | Value |
|---|---|
| Original spec path | `docs/specs/enhancement/official-branding/` |
| Archived as | `docs/specs/archive/2026-06-29-enhancement--official-branding/` |
| Archive date | 2026-06-29 |
| Final status | **Complete — merged & deployed** |
| PR | #29 (merged → `main` `ce607d6`) |

## 2. Final Status

All 7 tasks `[x]`; merged and deployed to CloudFront; live on all routes. No `/sdd-validate` run — **accepted**: the change is visual/token-only, fully covered by the green gate (687 tests, lint, tsc, build) + a hardcoded-maroon sweep + manual visual QA, and the favicon was explicitly reviewed (below).

## 3. Requirements Delivered

- **FR-1** Royal Blue `#1F4E8C` is the product-wide primary (no maroon anywhere — hex or comments).
- **FR-2** Official **colour** logo in the header (home link + "Tanzania Seed Registry" descriptor).
- **FR-3** Official **white-reverse** logo (transparent) in the footer.
- **FR-4** On-brand favicon / app icons (Royal-Blue Tanzania mark — see §7).
- **FR-5** `system-design/design.md §7` token table updated to the official palette.
- **FR-6** Crop colours preserved; accent retained for chart variety.
- **NFR-1..5** WCAG AA (Royal Blue ≈ 7:1 on white) · tokens-only/build green · reversible · optimized assets · no layout/behaviour regressions.

## 4. Files Changed Summary

- **New:** `frontend/public/brand/accelerate-logo-color.png` (867×194, header), `accelerate-logo-white.png` (816×144, transparent, footer).
- **Modified:** `frontend/app/globals.css` (primary token ramp → Royal Blue), `components/shell/Header.tsx` + `Footer.tsx` (logo lockups), `app/icon.svg` + `icon.png` + `apple-icon.png` + `favicon.ico` (recoloured), `docs/system-design/design.md §7` (palette), plus stale-"maroon"-comment cleanup in `Button.tsx`, `chart-tokens.ts`, `ClosingCTA.tsx`, `KpiCard.tsx`, `roles.ts`.
- **No backend / Prisma / API / PII change.** `tailwind.config.ts` untouched (token names stable).

## 5. Test Evidence Summary

- **687 tests / 54 suites pass**; `npm run lint` clean; `tsc` clean; `npm run build` green (all routes static).
- Hardcoded-maroon sweep: zero `#800000`/`#680000`/`#F3E6E6` (and zero "maroon" word) in shipped source/assets.
- Logo assets visually verified (composited over real header/footer surfaces) — transparent white logo reads cleanly on the dark band.

## 6. Validation Summary

No formal `/sdd-validate`. Conformance established by the green gate + maroon sweep + Leader visual audits of the assets + live deploy verification (all routes + logo asset → HTTP 200). **Accepted** for a visual, token-driven, reversible change.

## 7. Favicon Decision (reviewed before archive)

The favicon was explicitly evaluated post-merge. The official logo's **crop-trio icon** (sorghum + bean + groundnut) is fine line-art that becomes **muddy at 32px and an illegible blob at 16px** (verified by rendering). The **Royal-Blue Tanzania silhouette** is crisp at 16px, on-brand in colour, and geographically apt for a *Tanzania* Seed Registry. **Decision: keep the Royal-Blue Tanzania favicon**; the detailed logo lives in the header/footer where it has room. (Alternatives considered: white "A" monogram; forcing the crop-trio — rejected for legibility.)

## 8. Accepted Warnings / Follow-Ups

- **Asset format:** logos shipped as optimized **PNG** (no SVG supplied). Follow-up: request vector logos from the lead org for crisper scaling / a potential tagline-legible header treatment.
- **Header tagline:** the full colour lockup's tagline is decorative at header height (a clean no-tagline crop isn't feasible from the raster). Revisit with a vector asset.
- **Typography:** brand brief defers fonts to the lead org; current font stack retained until a brand web-font is supplied.

## 9. Historical Notes

Built via the full JCSPECS loop (propose → specify → execute). Key decision: rebrand via the **design-token layer** rather than per-component edits — the tokens-only architecture meant changing `--color-primary*` flipped the entire UI (header/footer logos, buttons, links, dashboard KPI hero, chart primary, seed-company markers, focus rings) with no component colour changes. Asset prep (T-1) and favicon (T-5) were Leader-executed with visual verification (a subagent can't see transparency/legibility); Header/Footer (T-3/T-4) went through implement→audit; token swap + docs + QA (T-2/T-6/T-7) were Leader-executed. Source: official logo files + brand brief PDF + palette (Royal Blue `#1F4E8C`, Charcoal `#4A4A4A`, Black, White).
