# Execution Log — changes/home-page

Canonical audit trail for the JCSPECS Leader → Implementer → Reviewer loop on this spec.

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `changes/home-page` |
| Branch | `feature/home-page` |
| Leader | Claude (orchestrator) |
| Implementer agent | `frontend-developer` seeded with `.agents/implementer.md` |
| Reviewer agent | `code-reviewer` seeded with `.agents/reviewer.md` |
| Started | 2026-06-22 |

## 2. Task Execution History

### T-1 — Bootstrap minimal Next.js static-export frontend — ✅ PASS
- **Date:** 2026-06-22
- **Final status:** PASS (Reviewer PASS on attempt 1)
- **Requirements covered:** NFR-1 (static export)
- **Design refs:** design.md §3, §4
- **Implementer attempts:** 1

**Attempt 1**
- **Files created:** `frontend/package.json`, `frontend/package-lock.json`, `frontend/next.config.mjs`, `frontend/tsconfig.json`, `frontend/next-env.d.ts`, `frontend/postcss.config.js`, `frontend/tailwind.config.ts`, `frontend/app/globals.css`, `frontend/app/layout.tsx`, `frontend/app/page.tsx`, `frontend/.env.example`, `frontend/.gitignore`.
- **Stack pinned:** Next.js 15.5.19, React ^19.1.0, Tailwind ^3.4.4, TypeScript ^5.4.5.
- **Verification command:** `cd frontend && npm install && npm run build`
- **Verification result:** Build "Compiled successfully", "Exporting (2/2)"; `frontend/out/index.html` emitted (5556 bytes). Static export confirmed.
- **Reviewer verdict:** `STATUS: PASS` — all 8 scope items satisfied; NFR-1 static-export purity confirmed (zero SSR/ISR/server-action/route-handler patterns); no premature T-2 design tokens; no premature T-3..T-6 components.
- **Reviewer minor note (non-blocking):** `tailwind.config.ts` `content` array includes a `./pages/**` glob inherited from the CRA template; harmless (no `pages/` dir) — left as-is, may be trimmed in a later UI task.

**Decisions made:**
- This spec owns the minimal frontend bootstrap (design.md DD-1) — confirmed by executing T-1 here rather than a separate scaffolding spec.
- Tailwind kept token-free; design tokens deferred to T-2 per scope.

**Issues encountered:** none.

### T-2 — Wire design tokens into Tailwind + globals — ✅ PASS
- **Date:** 2026-06-22
- **Final status:** PASS (Reviewer PASS on attempt 1)
- **Requirements covered:** NFR-4 (design tokens — no hardcoded values)
- **Design refs:** design.md §10 (DD-5); system-design §7; §11 (dark-overridable)
- **Implementer attempts:** 1

**Attempt 1**
- **Files changed:** `frontend/app/globals.css` (all §7 tokens as `:root` CSS vars + dark-override comment + token-driven `body`), `frontend/tailwind.config.ts` (colors/crop/borderRadius/boxShadow/fontFamily/fontSize mapped to `var(--token)`; removed stale `./pages/**` glob).
- **Verification command:** `cd frontend && npm run build`
- **Verification result:** "Compiled successfully", "Exporting (2/2)", zero errors/warnings.
- **Reviewer verdict:** `STATUS: PASS` — all 29 §7 tokens present on `:root` with exact canonical values; every Tailwind utility maps via `var(--...)`; `:root` cleanly `.dark`-overridable with no dark theme authored; spacing untouched; no scope creep; no SSR introduced.

**Tracked note (non-blocking, carried from T-1):** `app/layout.tsx` applies `inter.className` to `<body>`, whose `next/font` class out-prioritizes the `font-family: var(--font-sans)` rule. No v1 regression (both are Inter), but `--font-sans` is not the live authority for body font. **Action:** address in the typography/component pass (T-3 or a later UI task) — e.g. bind the font via the `--font-sans` token or apply `inter.variable` and reference it from the token.

**Decisions made:** kept the dark theme un-authored (only `:root` + documented override path), per §11.
**Issues encountered:** none.

### T-3 — Build the public shell (Header + Footer) + route layout — ✅ PASS
- **Date:** 2026-06-22
- **Final status:** PASS (Reviewer PASS on attempt 1)
- **Requirements covered:** FR-1 (shell/structure), FR-5 (role-aware auth slot), FR-6 (primary nav), FR-7 (footer)
- **Design refs:** design.md §4, §8; system-design §4, §5, §7
- **Implementer attempts:** 1

**Attempt 1**
- **Files created:** `frontend/lib/auth/useSession.ts` (Role/Session types + Public stub, DD-4), `frontend/components/shell/Header.tsx` (`'use client'`: brand lockup, desktop nav with `usePathname` active state + `aria-current`, role-aware `AuthSlot` → Sign in `/login` for Public / avatar+name+RoleBadge when authed, sticky, mobile hamburger with full aria), `frontend/components/shell/Footer.tsx` (`bg-fg text-bg` inversion, governance note), `frontend/app/(public)/layout.tsx` (Header + `<main>` + Footer), `frontend/.eslintrc.json` (next/core-web-vitals).
- **Files changed:** `frontend/app/layout.tsx` + `frontend/app/globals.css` (font-token fix — see resolution below).
- **Files moved/deleted:** `frontend/app/page.tsx` → `frontend/app/(public)/page.tsx` (placeholder; URL stays `/`); old root page deleted.
- **Verification command:** `cd frontend && npm run build && npm run lint`
- **Verification result:** build "Compiled successfully", "Exporting (2/2)"; lint "No ESLint warnings or errors". `out/index.html` emitted; no leftover root page.
- **Reviewer verdict:** `STATUS: PASS` — FR-1/5/6/7 fully met; design-token compliance clean (only hex are in comments, exempt); static-export safe (no SSR/route handlers; `'use client'` only where needed); no T-4/T-5/T-6 scope creep; a11y landmarks/`aria-current`/hamburger aria/`motion-reduce` all present.

**Resolved note (from T-2):** font-token authority fixed — `app/layout.tsx` now uses `Inter({ variable: '--font-inter' })` on `<html>` and `--font-sans` = `var(--font-inter), "Inter", system-ui, sans-serif`, so the token is the single body-font authority while keeping next/font optimization. ✅ closed.

**Decisions made:** auth slot remains a deliberate stub (DD-4); footer uses existing `bg-fg/text-bg` inversion rather than introducing a new dark token.
**Issues encountered:** none.

### T-4 — Build the Hero section with CTAs — ✅ PASS (after 1 rework)
- **Date:** 2026-06-22
- **Final status:** PASS (Reviewer FAIL on attempt 1 → PASS on attempt 2)
- **Requirements covered:** FR-2 (hero + CTAs), NFR-2 (responsive)
- **Design refs:** design.md §8; system-design §4, §6, §7, §9
- **Implementer attempts:** 2

**Leader sequencing decision:** the spec references `npm run test` from T-5 onward but defines no dedicated test-harness task. To keep T-4 scoped to UI, T-4 is verified via `npm run build && npm run lint` + a CTA-href check; the Jest/RTL harness and the first automated component tests are established in **T-5** (first task that requires `npm run test`). Recorded here as a sequencing clarification (not a spec pivot).

**Attempt 1 — Reviewer FAIL**
- **Files created:** `frontend/components/ui/Button.tsx` (token-driven primary/secondary, Link-or-button), `frontend/components/home/Hero.tsx` (two-column hero, h1, eyebrow, copy, CTAs, VisualPanel + static "1,000+" LiveRegistryCard). **Changed:** `frontend/app/(public)/page.tsx` mounts `<Hero/>`.
- **Verification:** `npm run build && npm run lint` clean; CTAs `/map` + `/directory` present in `out/index.html`.
- **Reviewer verdict:** `STATUS: FAIL` — NFR-4 violation: the decorative diagonal-stripe overlay embedded a hardcoded `#E3E5DE` (URL-encoded `%23E3E5DE`) as an SVG `fill` inside an inline data-URI, bypassing the `--color-border` token and breaking future dark-mode theming (system-design §7, §11). Remediation: use `fill='currentColor'` + a `text-border` utility.

**Attempt 2 — Reviewer PASS**
- **Files changed:** `frontend/components/home/Hero.tsx` only — stripe `<div>` now `className="... text-border"` and the data-URI SVG uses `fill='currentColor'`; misleading comment corrected. Surgical fix, no other changes.
- **Verification:** `npm run build && npm run lint` clean; `grep %23` → none in components; `text-border` + `currentColor` confirmed present.
- **Reviewer verdict:** `STATUS: PASS` — NFR-4 issue resolved (stripe color fully token-driven); FR-2 + NFR-2 intact; static-export safe; no T-5/T-6 scope creep.

**Decisions made:** "1,000+" stays a static placeholder (live `actorsMapped` binding deferred to T-5/T-6). Decorative SVG patterns must still derive color from tokens via `currentColor` — reinforced as a project pattern.
**Issues encountered:** one NFR-4 token-bypass, fixed in one rework cycle.

### T-5 — Metrics API client + `useMetrics` hook + test harness — ✅ PASS
- **Date:** 2026-06-22
- **Final status:** PASS (Reviewer PASS on attempt 1, zero issues)
- **Requirements covered:** FR-3 (live metrics), NFR-5 (graceful, non-blocking, no crash)
- **Design refs:** design.md §5 (types), §6 (API), §8 (hook), §10 DD-3; detailed-design §9 (error envelope)
- **Implementer attempts:** 1

**Attempt 1**
- **Files created:** `frontend/lib/api/client.ts` (typed `apiGet<T>` + `ApiErrorEnvelope`), `frontend/lib/api/metrics.ts` (`Metrics`/`CropMetric` exact §5 types + `getMetrics(): Promise<Metrics|null>`, DD-3 never-throws), `frontend/lib/api/useMetrics.ts` (`'use client'` hook `{ data, loading }`, unmount guard), `frontend/lib/api/metrics.test.ts` (8 tests), `frontend/lib/api/useMetrics.test.ts` (4 tests), `frontend/jest.config.ts` (next/jest, jsdom), `frontend/jest.setup.ts`.
- **Files changed:** `frontend/package.json` (+`test` script; devDeps: jest ^30, jest-environment-jsdom ^30, @testing-library/{react,jest-dom,dom}, @types/jest, ts-node). **Test harness established here** per the T-4 sequencing decision.
- **Verification command:** `cd frontend && npm run test && npm run build` (Leader independently re-ran tests)
- **Verification result:** Test Suites 2 passed / Tests 12 passed; static export build OK, `out/index.html` emitted.
- **Reviewer verdict:** `STATUS: PASS` — types match §5 exactly; `getMetrics` provably non-throwing across all 6 failure modes (network reject, 500 envelope, 503 non-JSON, missing/empty base URL, synchronous throw), each meaningfully tested; client base-URL/Accept/non-JSON-tolerance correct; hook unmount-guard verified by a non-trivial test; next/jest harness correct; no T-6 scope creep; static-export safe.

**Decisions made:** `apiGet` returns a runtime-cast `T` (no Zod) — accepted as standard for typed fetch wrappers; spec does not require runtime schema validation. `client.ts` is the shared API client other specs will reuse (design.md §9).
**Issues encountered:** none.

### T-6 — Metrics band + Crop coverage sections (live counts) — ✅ PASS
- **Date:** 2026-06-22
- **Final status:** PASS (Reviewer PASS on attempt 1, zero issues)
- **Requirements covered:** FR-3 (live metrics band), FR-4 (crop coverage cards + per-crop counts), NFR-2 (responsive), NFR-5 (graceful fallback)
- **Design refs:** design.md §5 (Metrics/CropMetric types), §8 (component architecture), §10 DD-3; system-design §7 (crop tokens), §8 (Stat/metric card), §9 (responsive)
- **Implementer agent:** `frontend-developer` seeded with `.agents/implementer.md`
- **Reviewer agent:** `code-reviewer` seeded with `.agents/reviewer.md`
- **Implementer attempts:** 1

**Attempt 1**
- **Files created:** `frontend/lib/content/crops.ts` (typed 3-entry crop content array; `tokenClass`-driven accent, slug↔token mapping in comments), `frontend/components/ui/Skeleton.tsx` (token-driven loading placeholder, `aria-hidden`, `motion-reduce:animate-none`), `frontend/components/ui/StatCard.tsx` (background-agnostic stat/metric card; `loading`→Skeleton, finite number→`toLocaleString()`, null/undefined→`—` em-dash fallback), `frontend/components/home/MetricsBand.tsx` (`'use client'`: dark `bg-fg text-bg` band, consumes `useMetrics`, four StatCards bound to actorsMapped/cropsTracked/regionsCovered/actorTypes, `grid-cols-2 md:grid-cols-4` reflow, section landmark), `frontend/components/home/CropCard.tsx` (presentational per-crop card; name + description + count with placeholder fallback; crop-token accent via lookup map — no hex), `frontend/components/home/CropCoverage.tsx` (`'use client'`: consumes `useMetrics`, joins per-crop counts by `slug` via `data?.crops.find()`, three CropCards, `grid-cols-1 md:grid-cols-3`, "View all actors" → `/directory`), `frontend/components/home/MetricsBand.metrics-band.test.tsx` (3 cases), `frontend/components/home/CropCoverage.crop.test.tsx` (4 cases).
- **Files changed:** `frontend/app/(public)/page.tsx` (composes `<MetricsBand/>` + `<CropCoverage/>` after `<Hero/>`; placeholder comment removed).
- **Verification command:** `cd frontend && npm run test -- metrics-band crop && npm run build && npm run lint` (Leader independently re-ran all).
- **Verification result:** Test Suites 2 passed / Tests 7 passed; build "✓ Compiled successfully", "✓ Exporting (2/2)", `/` emitted as `○ (Static)` (no SSR/route handlers); lint "✔ No ESLint warnings or errors"; NFR-4 hex grep over new files → only comment-resident hex (token-mapping annotations), zero hex in executable code.
- **Reviewer verdict:** `STATUS: PASS` — MetricsBand/CropCoverage compose correctly; all four FR-3 aggregates bound to correct `Metrics` fields; FR-4 crop cards use exact token mapping (sorghum→crop-sorghum, common_bean→crop-bean, groundnut→crop-groundnut) with per-slug count join; "View all actors" → `/directory`; presentational components (StatCard, Skeleton, CropCard, crops.ts) carry no `'use client'` while hook-consuming components correctly do; no raw hex in executable code; NFR-2 responsive grids correct; static export confirmed; 7 tests pass; lint clean.

**Decisions made:** StatCard authored background-agnostic so MetricsBand supplies the dark (`bg-fg text-bg`) context and StatCard remains reusable on light surfaces; CropCard derives accent utilities from a `tokenClass`→utility lookup map (no inline hex), keeping crop colors token-driven per the T-4 `currentColor`/token discipline. Test files named `*.metrics-band.test.tsx` / `*.crop.test.tsx` so the `npm run test -- metrics-band crop` filters reliably match both suites.
**Issues encountered:** none.

### T-7 — Accessibility, responsive, and static-export verification pass — ✅ PASS
- **Date:** 2026-06-22
- **Final status:** PASS (Reviewer PASS on attempt 1, zero issues)
- **Requirements covered:** NFR-1 (static export), NFR-2 (responsive), NFR-3 (accessibility)
- **Design refs:** design.md §8 (a11y), §12 (test plan); system-design §9 (responsive), §10 (accessibility expectations)
- **Implementer agent:** `frontend-developer` seeded with `.agents/implementer.md`
- **Reviewer agent:** `code-reviewer` seeded with `.agents/reviewer.md`
- **Implementer attempts:** 1

**Attempt 1**
- **Nature of task:** primarily a verification + automated-coverage pass. The a11y structure was found already conformant from T-3..T-6, so **no component source files were modified** — the only code change is a new jest-axe test plus the dev dependency.
- **A11y audit (already-present, confirmed in source — no change needed):** `<header>`/`<main>`/`<footer>` landmarks; `<nav aria-label="Primary">` (+ mobile) with `aria-current="page"` on active links; hamburger `aria-label`+`aria-controls`+`aria-expanded`; Hero single `<h1 id="hero-heading">` via `aria-labelledby`; MetricsBand/CropCoverage `<section>` with accessible names; CropCard `<h3>` (logical h1→h2→h3); decorative SVGs/visual panel `aria-hidden`; Skeleton `aria-hidden`+`role="presentation"`; StatCard `aria-live="polite"` value slot; token-driven `focus-visible:ring-*` on Button/NavLink/brand/mobile links; `motion-reduce:animate-none` (Skeleton) and `motion-reduce:transition-none` (Button, hamburger).
- **Files created:** `frontend/components/home/home-a11y.test.tsx` — jest-axe test rendering the full home composition (Header + Hero + MetricsBand + CropCoverage + Footer); mocks `@/lib/api/useMetrics`, `next/navigation`, `@/lib/auth/useSession`; two cases (success state + null/fallback state) each asserting `expect(results).toHaveNoViolations()`.
- **Files changed:** `frontend/package.json` + `frontend/package-lock.json` (devDeps: `jest-axe`, `@types/jest-axe`).
- **Responsive confirmation (NFR-2):** Hero `grid-cols-1 lg:grid-cols-2`; MetricsBand `grid-cols-2 md:grid-cols-4`; CropCoverage `grid-cols-1 md:grid-cols-3`; Header hamburger `md:hidden`. All match spec.
- **Verification command:** `cd frontend && npm install -D jest-axe @types/jest-axe && npm run test && npm run build && npm run lint` + static-export grep (Leader independently re-ran).
- **Verification result:** Test Suites 5 passed / Tests 21 passed (incl. both axe no-violation cases); build "✓ Compiled successfully", static pages 4/4, "✓ Exporting (2/2)", `/` = `○ (Static)`, `out/index.html` emitted; lint "✔ No ESLint warnings or errors"; static-export grep (`generateStaticParams`/`dynamic`/`revalidate`/`getServerSideProps`/`use server`/`route.ts(x)`) → empty; `next.config.mjs` retains `output: 'export'`.
- **Reviewer verdict:** `STATUS: PASS` — axe test is substantive (full composition rendered, both states assert `toHaveNoViolations`); every a11y claim independently confirmed in source (landmarks, aria, heading hierarchy, focus-visible, motion-reduce); static-export purity intact (zero SSR/route-handler patterns); responsive breakpoints match spec; no regressions or scope creep.

**Decisions made:** since the a11y structure was already correct, T-7 added durable automated coverage (jest-axe over the full composition, success + fallback states) rather than redundant manual edits — locking NFR-3 against future regressions.
**Issues encountered:** none.

## 3. Summary (all tasks complete) — ✅ SPEC COMPLETE
- T-1 ✅ · T-2 ✅ · T-3 ✅ · T-4 ✅ (1 rework) · T-5 ✅ · T-6 ✅ · T-7 ✅. **All 7 tasks PASS.**
- **Requirement coverage:** FR-1→T-3/T-4 ✅ · FR-2→T-4 ✅ · FR-3→T-5/T-6 ✅ · FR-4→T-6 ✅ · FR-5→T-3 ✅ · FR-6→T-3 ✅ · FR-7→T-3 ✅ · NFR-1→T-1/T-7 ✅ · NFR-2→T-4/T-6/T-7 ✅ · NFR-3→T-7 ✅ · NFR-4→T-2 ✅ · NFR-5→T-5 ✅.
- **Final state:** static-export Next.js home page at `/` (public shell + Hero + live MetricsBand + CropCoverage), token-driven, graceful metrics fallback, WCAG-AA basics proven via jest-axe. Full suite 21 tests pass; `npm run build` emits static `out/`.
- **Loop economics:** 7 tasks, 8 Implementer attempts total (one T-4 rework on an NFR-4 token bypass); all other tasks PASS on attempt 1.
- **Next:** ready for `/sdd-validate` and/or `/sdd-archive` on `changes/home-page`.
