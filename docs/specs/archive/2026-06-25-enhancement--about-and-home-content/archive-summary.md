# Archive Summary — About Page & Home Content Expansion

## 1. Document Control

| Field | Value |
|---|---|
| Original spec path | `docs/specs/enhancement/about-and-home-content/` |
| Archived to | `docs/specs/archive/2026-06-25-enhancement--about-and-home-content/` |
| Archive date | 2026-06-25 |
| Final status | **Complete — validated PASS, archive-ready** |
| Depth | Standard |
| Branch | `feature/about-and-home-content` |

## 2. Final Status

All 10 tasks `[x]`, each closed on a Reviewer **PASS**. Validation PASS (0 FAIL, 2 accepted WARN). Full gate green: 39 Jest suites / 396 tests, ESLint clean, static export 9 pages (incl. `/about`), no raw hex in changed code. No backend/PII/data/IaC surface touched.

## 3. Requirements Delivered

- **FR-1/2/3** — static `/about` route with all copy-brief §3 sections (hero+field photo, challenge, demand-led approach + 3 pillars, crops & varieties, partners, 4 attributed case studies, registry CTAs, credits) + SEO metadata.
- **FR-4/5/7/8** — home expanded to `Hero → MetricsBand → AboutStrip → HowItWorks → CropCoverage → PartnersStrip → ClosingCTA`; existing live sections unchanged.
- **FR-6** — grayscale partner logo wall, color on hover **and** keyboard focus, text fallback for logo-less partners.
- **FR-9/10** — `About` in header (desktop+mobile) + footer; footer coalition (Alliance + PABRA + Gates).
- **FR-11/12** — field photo + partner logo assets; typed `partners.ts`/`pillars.ts`; crop varieties.
- **FR-13** *(added mid-spec at user request)* — ClosingCTA ambient background video: muted/looping, reduced-motion→poster, token scrim for AA, MP4-only @0.66 MB, below-the-fold (no Hero LCP impact).
- **NFR-1…7** — tokens-only, static export, responsive, WCAG 2.1 AA (jest-axe clean), reduced-motion via existing GSAP + matchMedia gate, content fidelity (live numbers on `useMetrics`), performance.

## 4. Files Changed Summary

**New:** `lib/content/partners.ts`, `lib/content/pillars.ts`; `components/home/{PillarCards,AboutStrip,ClosingCTA,HowItWorks,PartnersStrip}.tsx` (+ tests); `app/(public)/about/page.tsx` + `about-a11y.test.tsx`; assets `public/accelerate-field.jpg`, `public/partners/{alliance.png,bmgf.webp}`, `public/closing-cta-loop.mp4`, `public/closing-cta-poster.jpg`.
**Modified:** `app/(public)/page.tsx`, `components/home/home-a11y.test.tsx`, `components/shell/{Header,Footer}.tsx` (+ `Header.test.tsx`), `lib/content/crops.ts`.
**Reference (committed with spec):** `docs/reference/accelerate-web-copy-brief.md`, `docs/reference/accelerate-project-source-data.md`.

## 5. Test Evidence Summary

396 tests / 39 suites. jest-axe zero violations on home and `/about`; one `<h1>` per page asserted. ClosingCTA poster/static branch deterministic via the `matchMedia` polyfill (video branch off in jsdom — intended). Header nav, partner links (rel/aria), and CTA hrefs covered.

## 6. Validation Summary

See `validation-report.md`. PASS / archive-ready; full requirement coverage table; 0 FAIL.

## 7. Accepted Warnings / Follow-Ups

- **W-1:** `LOGO_DIMS` fallback in `Footer.tsx` is a latent trap for future partners added without explicit dims — no functional impact today; tighten when the coalition grows.
- **W-2:** ClosingCTA video weight (MP4 0.66 MB) accepted — below-the-fold, `preload="none"`, reduced-motion gated.
- Optional Hero eyebrow/CTA refinement (OQ-1) left as future polish — Hero deliberately untouched.

## 8. Historical Notes

- **Scope delta:** FR-13 + T-10 (tractor background video) were added mid-execution at explicit user request (2026-06-25); requirements/design/tasks updated before implementation.
- **In-flight design correction:** the planned WebM video source was dropped after it re-encoded *larger* than h264 for this clip → MP4-only (universal + smaller); §5.8/T-10 updated.
- **Reviewer-driven refinements (all pre-commit, no HALTs):** FR-6 keyboard-focus color reveal (group pattern); About `bg-restricted`→`bg-surface-alt`, magic-height fix, and a non-brief `<strong>` removed (copy fidelity); a dead-code branch removed from the home a11y test; video assets re-encoded to hit size targets.
- Spec stayed aligned with the approved proposal throughout; the only addition was the user-requested video.
