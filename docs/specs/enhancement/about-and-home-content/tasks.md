# Tasks — About Page & Home Content Expansion

- Spec path: docs/specs/enhancement/about-and-home-content/
- Depth: Standard · Execution: Leader → Implementer → Reviewer (`/sdd-execute`)
- Traces: requirements.md FR-1..FR-12 / NFR-1..NFR-7 · design.md §1..§10

## Conventions
- Commits: `[SPEC:enhancement/about-and-home-content] <message>`.
- Tokens only (NFR-1, no raw hex) · static export (NFR-2) · jest-axe clean (NFR-4) · reduced-motion via existing GSAP layer (NFR-5).
- All work under `frontend/`. No backend/IaC/PII changes.

---

## Tasks

- [x] T-1 Add brand/photo assets + typed content modules  (deps: none)
      Scope: Add web-optimized assets under `frontend/public/` — `accelerate-field.jpg` (About hero) and partner logos `partners/alliance.*`, `partners/bmgf.*`, and (if cleanly extractable) `partners/tari.*`, `partners/tosci.*`, `partners/cimmyt.*` (PABRA reuses existing `/pabra-30-logo.png`). Create `lib/content/partners.ts` (`Partner` interface + `PARTNERS` six entries per brief §4.1, `logo?` omitted where no clean asset → text fallback, `lightSafe?` flags) and `lib/content/pillars.ts` (`Pillar` + `PILLARS` three entries per §4.3). Optionally add `varieties?: string[]` to `CropContent` in `crops.ts` populated from brief §4.2 (additive, backward-compatible).
      Traces: FR-11, FR-12 (requirements.md); design.md §5.4, §5.7
      Files: frontend/public/accelerate-field.jpg, frontend/public/partners/*, frontend/lib/content/partners.ts, frontend/lib/content/pillars.ts, frontend/lib/content/crops.ts
      Verify: `cd frontend && npx tsc --noEmit && npm run lint`
      Done when: content modules type-check, export the six partners + three pillars with brief-exact strings, assets exist in public/, no raw hex introduced.

- [x] T-2 Shared `PillarCards` presentational component  (deps: T-1)
      Scope: Create `components/home/PillarCards.tsx` (server component) mapping `PILLARS` to a responsive 3-card grid (`grid-cols-1 md:grid-cols-3 gap-6`), cards on `bg-surface border-border`, primary-accented icon/marker, token-only styling. No motion inside (wrappers add it). Used by both `HowItWorks` (home) and the About approach section.
      Traces: FR-5, FR-12 (requirements.md); design.md §5.5, Decision "Shared PillarCards"
      Files: frontend/components/home/PillarCards.tsx, frontend/components/home/PillarCards.test.tsx
      Verify: `cd frontend && npm run test -- PillarCards`
      Done when: renders three cards with brief titles/bodies; 3-col grid classes present; RTL test passes.

- [x] T-3 Home `AboutStrip` + `ClosingCTA` sections  (deps: T-1)
      Scope: `components/home/AboutStrip.tsx` (server) on `bg-surface-alt` with brief §2.3 eyebrow/H2/body/supporting line + secondary `Button` "Read the full story" → `/about`. `components/home/ClosingCTA.tsx` (server) on `bg-fg text-bg` with brief §2.7 H2/body + CTAs "Explore the Map" → `/map` (primary) and "About the project" → `/about` (secondary-on-dark). Both: `aria-labelledby`, one `<h2>`, standard `max-w-7xl` container.
      Traces: FR-4, FR-7 (requirements.md); design.md §5.2
      Files: frontend/components/home/AboutStrip.tsx, frontend/components/home/ClosingCTA.tsx, frontend/components/home/AboutStrip.test.tsx, frontend/components/home/ClosingCTA.test.tsx
      Verify: `cd frontend && npm run test -- AboutStrip ClosingCTA`
      Done when: both render brief copy with correct CTA hrefs; aria-labelledby wired; tests pass.

- [x] T-4 Home `HowItWorks` section  (deps: T-2)
      Scope: `components/home/HowItWorks.tsx` (`'use client'`) mirroring `CropCoverage`: eyebrow "The model" + H2 "A demand-led seed system" + intro, then `<PillarCards/>`. Header `useReveal({stagger:0})`; grid reveal via `useReveal` on the PillarCards wrapper (stagger across the three children). Progressive enhancement — cards visible without GSAP / under reduced motion.
      Traces: FR-5, NFR-5 (requirements.md); design.md §5.2, §5.5
      Files: frontend/components/home/HowItWorks.tsx, frontend/components/home/HowItWorks.test.tsx
      Verify: `cd frontend && npm run test -- HowItWorks`
      Done when: renders eyebrow/H2/intro + 3 pillars via PillarCards; uses existing GSAP mocks (content present in test); reduced-motion-safe; test passes.

- [ ] T-5 Home `PartnersStrip` logo wall  (deps: T-1)
      Scope: `components/home/PartnersStrip.tsx` (server) on `bg-surface`, brief §2.6 eyebrow/H2/body, then a `PartnerLogo` sub-component mapping `PARTNERS`: `next/image` grayscale→color on hover/focus (Tailwind `grayscale`/`grayscale-0`, `motion-reduce:transition-none`) OR text-label fallback when `logo` absent; each wrapped in an external link (`target="_blank" rel="noopener noreferrer"`, `aria-label` "<name> — opens in a new tab"). Token-only; AA-legible in grayscale.
      Traces: FR-6, NFR-1, NFR-4 (requirements.md); design.md §5.3, Decision "CSS-only grayscale logo wall"
      Files: frontend/components/home/PartnersStrip.tsx, frontend/components/home/PartnersStrip.test.tsx
      Verify: `cd frontend && npm run test -- PartnersStrip`
      Done when: six partners render with accessible names + external-link rels; logo/text fallback works; test passes.

- [ ] T-6 Recompose home page + home a11y  (deps: T-3, T-4, T-5)
      Scope: Update `app/(public)/page.tsx` to `Hero · MetricsBand · AboutStrip · HowItWorks · CropCoverage · PartnersStrip · ClosingCTA` (FR-8 order). Extend `components/home/home-a11y.test.tsx` to cover the new sections (jest-axe zero violations; still exactly one `<h1>` from Hero). Confirm existing Hero/MetricsBand/CropCoverage behavior unchanged.
      Traces: FR-8, NFR-3, NFR-4 (requirements.md); design.md §1, §5.1
      Files: frontend/app/(public)/page.tsx, frontend/components/home/home-a11y.test.tsx
      Verify: `cd frontend && npm run test -- home-a11y`
      Done when: home renders sections in order; a11y suite passes with zero violations; one `<h1>`.

- [ ] T-7 About page route + content + metadata  (deps: T-1, T-2, T-5)
      Scope: Create `app/(public)/about/page.tsx` (server component) with brief §3 sections in order: AboutHero (eyebrow + single `<h1>` + lede + `accelerate-field.jpg` via `next/image`, descriptive alt, token scrim if text overlays), Challenge, Approach (`<PillarCards/>`), Crops (CROPS + variety sub-labels), Partners (logo treatment/text list), CaseStudies (§3.6 four enterprises, attributed 🟡), Registry (CTAs → /map, /directory), Credits (§3.8, Alliance link). Export `metadata` (title + description per brief §5). One `<h1>`; sections `aria-labelledby` `<h2>`.
      Traces: FR-1, FR-2, FR-3, FR-11 (requirements.md); design.md §5.1, §5.5
      Files: frontend/app/(public)/about/page.tsx
      Verify: `cd frontend && npm run build` (static export emits `out/about/index.html`)
      Done when: `/about` builds statically; renders all §3 sections with brief copy; metadata set; one `<h1>`; case-study figures attributed.

- [ ] T-8 Navigation: header + footer About link + footer coalition  (deps: T-1)
      Scope: `Header.tsx` — add `{ label: 'About', href: '/about' }` to `NAV_LINKS` (drives desktop + mobile + active state). `Footer.tsx` — add an `About` text link and expand the partner block from the lone PABRA chip to the coalition (Alliance + PABRA + Gates from `PARTNERS`), reusing the light-chip pattern; external links `rel="noopener noreferrer"`. Update `Header.test.tsx` for the new nav item.
      Traces: FR-9, FR-10 (requirements.md); design.md §5.6
      Files: frontend/components/shell/Header.tsx, frontend/components/shell/Footer.tsx, frontend/components/shell/Header.test.tsx
      Verify: `cd frontend && npm run test -- Header`
      Done when: About link present in desktop nav, mobile menu, and footer with active state; footer shows coalition with accessible names; Header test passes.

- [ ] T-9 About a11y + full build/lint/no-hex verification  (deps: T-6, T-7, T-8)
      Scope: Add `app/(public)/about/about-a11y.test.tsx` (jest-axe zero violations; one `<h1>`; logo/link discernible names). Run the full frontend suite, lint, static export, and a no-new-hex check across changed files.
      Traces: NFR-1, NFR-2, NFR-4, NFR-6 (requirements.md); design.md §10
      Files: frontend/app/(public)/about/about-a11y.test.tsx
      Verify: `cd frontend && npm run test && npm run lint && npm run build`
      Done when: full suite green, lint clean, static export emits `about/index.html`, no raw hex in changed files, jest-axe zero violations on /about.

---

## Dependency Graph
```
T-1 → T-2 → T-4 ─┐
T-1 → T-3 ───────┤
T-1 → T-5 ───────┼→ T-6 ─┐
                 │        ├→ T-9
T-1,T-2,T-5 → T-7 ───────┤
T-1 → T-8 ───────────────┘
```
Eligible-task order (deps satisfied, document order ties): **T-1 → T-2 → T-3 → T-5 → T-4 → T-8 → T-6 → T-7 → T-9**. T-3/T-5/T-8 can parallelize after T-1; T-7 needs T-2/T-5.

## Testing & Verification Expectations
- Each task runs the smallest verifying command above before the Implementer reports completion; T-9 runs the full gate.
- New/changed components must pass jest-axe where a11y is in scope (T-6, T-9).
- GSAP-driven `HowItWorks` relies on the existing `__mocks__` + `moduleNameMapper` so reveals run once and content is present in tests.

## Execution Conventions
- No new PII fields (none in this spec). No AWS/IaC changes — deploy later via existing `infra/scripts/deploy-frontend.sh --profile IBD-DEV`.
- Leader maintains `execution.md` audit trail (one entry per loop iteration).
- Recommended skills: `ui-ux-pro-max` / `frontend-design` (sections, logo wall), `vercel-react-best-practices` / `react-doctor` (component structure, server/client split), `tailwind-design-system` (token compliance), `frontend-design` (a11y/contrast).
