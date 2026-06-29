# Tasks — Home-Page Responsive Typography Scale

- Spec path: docs/specs/enhancement/home-typography-scale/
- Status: Draft
- Author / Date: Leader (SDD) — 2026-06-29
- Related: requirements.md (FR-1..FR-4, NFR-1..4); design.md §5, §8

## Task List

- [x] T-1 Add `--text-5xl` / `--text-6xl` to the token scale  (deps: none)
      Scope: Add `--text-5xl: 48px` and `--text-6xl: 60px` to the Typography block in `:root` (globals.css); add `'5xl': 'var(--text-5xl)'` and `'6xl': 'var(--text-6xl)'` to the Tailwind `fontSize` map; append both steps to the documented scale in `design.md §7`. No component edits.
      Traces: FR-1, NFR-1 (requirements.md); design.md §5.1, §8 (ADR-1)
      Files: frontend/app/globals.css, frontend/tailwind.config.ts, docs/system-design/design.md
      Verify: `cd frontend && npx tailwindcss -i app/globals.css -o /tmp/tw-check.css --content "./app/**/*.tsx" 2>/dev/null; grep -q "48px" /tmp/tw-check.css && echo TOKEN_OK` (or `npm run build` and confirm `text-5xl` resolves to `var(--text-5xl)`)
      Done when: `text-5xl`/`text-6xl` are valid token-backed utilities and design.md §7 lists both steps; no raw px in components.

- [x] T-2 Apply responsive ramps to hero `h1` and section `h2`s  (deps: T-1)
      Scope: Hero `h1` → `text-3xl sm:text-4xl lg:text-5xl` (preserve `font-bold text-fg leading-tight tracking-tight`). Each section `h2` → `text-2xl lg:text-3xl` (preserve all other classes) in AboutStrip, HowItWorks, PartnersStrip, ClosingCTA, CropCoverage. Do NOT change copy, `id`, `aria-labelledby`, `data-hero-text`, or markup.
      Traces: FR-2, FR-3, NFR-2, NFR-4 (requirements.md); design.md §5.2
      Files: frontend/components/home/{Hero,AboutStrip,HowItWorks,PartnersStrip,ClosingCTA,CropCoverage}.tsx
      Verify: `cd frontend && npm test -- home 2>&1 | tail -20 && npm run build`
      Done when: hero `h1` carries the 3xl→5xl ramp, all five `h2`s carry the 2xl→3xl ramp, tests stay green, build succeeds; exactly one `h1` and one `h2` per respective section.

- [x] T-3 Fix eyebrow chip background (`bg-primary/10` → `bg-primary-soft`)  (deps: none)
      Scope: Replace `bg-primary/10` with `bg-primary-soft` on the eyebrow pill `<span>` in Hero, AboutStrip, CropCoverage, HowItWorks, PartnersStrip. Keep `text-primary text-xs font-semibold tracking-wide` and all geometry/copy unchanged. Do NOT touch PillarCards (icon tile / watermark — out of scope per requirements §6).
      Traces: FR-4, NFR-1, NFR-3 (requirements.md); design.md §5.3
      Files: frontend/components/home/{Hero,AboutStrip,CropCoverage,HowItWorks,PartnersStrip}.tsx
      Verify: `cd frontend && grep -rn "bg-primary/10" components/home/*.tsx | grep -v PillarCards | grep -v test` (expect: no eyebrow matches) `&& npm test -- home 2>&1 | tail -10`
      Done when: all five eyebrow pills use `bg-primary-soft`; no eyebrow `bg-primary/10` remains; PillarCards untouched; tests green.

- [x] T-5 Load Montserrat brand font + `--font-display` token + heading base rule  (deps: none)
      Scope: Load Montserrat via `next/font/google` (weights 600/700/800, `variable: '--font-montserrat'`, `display: 'swap'`) in `app/layout.tsx` and add `montserrat.variable` to the `<html>` className. Add `--font-display: var(--font-montserrat), "Montserrat", system-ui, sans-serif;` to `globals.css` and a `@layer base { h1,h2,h3 { font-family: var(--font-display); } }` rule (family only — no font-weight). Add `display: ['var(--font-display)']` to the Tailwind `fontFamily` map. Document `--font-display` + the brand-font rule in `design.md §7`. Keep Inter/`--font-sans` as the body font.
      Traces: FR-5, NFR-1, NFR-3 (requirements.md); design.md §5.5, §8 (ADR-2)
      Files: frontend/app/layout.tsx, frontend/app/globals.css, frontend/tailwind.config.ts, docs/system-design/design.md
      Verify: `cd frontend && npm run build && grep -rn "font-display\|--font-display\|Montserrat\|font-montserrat" .next/static/css/*.css app/layout.tsx | head`
      Done when: build exits 0; Montserrat is loaded via next/font; `--font-display` token + `font-display` utility exist; `h1/h2/h3` resolve to the display family in built CSS; body stays Inter.

- [ ] T-6 Apply Montserrat ExtraBold to display titles + SemiBold to hero tagline  (deps: T-5)
      Scope: Swap `font-bold` → `font-extrabold` on the home hero `h1`, the five home section `h2`s (AboutStrip, HowItWorks, PartnersStrip, ClosingCTA, CropCoverage), and the top-level page `<h1>` title on each major route (dashboard, directory, map, admin shell). Add `font-display font-semibold` to the hero supporting `<p>` tagline. Do NOT change body paragraphs, table/form/data text, eyebrow pills, or copy.
      Traces: FR-5, NFR-1, NFR-3 (requirements.md); design.md §5.5
      Files: frontend/components/home/{Hero,AboutStrip,HowItWorks,PartnersStrip,ClosingCTA,CropCoverage}.tsx + the page-title `<h1>` of `app/(public)/dashboard`, `directory`, `map`, and the admin shell heading (locate via grep)
      Verify: `cd frontend && npm test 2>&1 | tail -15 && npm run build`
      Done when: marquee titles render ExtraBold (800) in Montserrat; hero tagline renders Montserrat SemiBold; body/data text unchanged; tests green; build succeeds.

- [ ] T-4 Visual verification across breakpoints + brand font  (deps: T-2, T-3, T-6)
      Scope: Build and manually verify home + one data-dense route (dashboard) at 375px, 768px, 1024px, 1440px. Confirm: hero `h1` grows to 48px at `lg`; section `h2`s to 36px at `lg`; eyebrow chips show the soft-blue background; headings render in Montserrat ExtraBold; hero tagline in Montserrat SemiBold; body/table text still Inter; no horizontal scroll at 375px; heading order/semantics intact.
      Traces: FR-2, FR-3, FR-4, FR-5, NFR-2, NFR-3 (requirements.md); design.md §10
      Files: (none — verification only)
      Verify: `cd frontend && npm run build` then inspect the built page / dev server at the four widths (manual check, record evidence in execution.md)
      Done when: all four breakpoints + brand font confirmed visually with no overflow and correct sizes/weights; evidence noted in execution.md.

## Dependency Graph
```
T-1 → T-2 ─┐
T-3 ───────┤
T-5 → T-6 ─┴→ T-4
```
- T-1, T-3, T-5 are independent roots; they may run in parallel.
- T-2 depends on T-1 (needs `text-5xl`); T-6 depends on T-5 (needs `--font-display`/`font-display`).
- T-4 is the final visual gate over the responsive scale + brand font (deps: T-2, T-3, T-6).

## Testing & Verification Expectations
- Frontend only: `npm test` (home suites), `npm run build`. No backend/infra/AWS commands in this spec.
- No new PII fields; no token introduces raw hex/px beyond the two documented scale steps (NFR-1).

## Execution Conventions
- Commits: `[SPEC:enhancement/home-typography-scale] <message>`, ending `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Leader records each Implementer/Reviewer loop in `execution.md`.
- Direct pushes to `main` are blocked — branch + PR; deploy only on explicit user authorization with `--profile IBD-DEV`.
