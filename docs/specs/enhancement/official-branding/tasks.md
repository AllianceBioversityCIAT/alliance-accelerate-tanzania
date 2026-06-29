# Tasks — Adopt the official ACCELERATE brand

Spec path: `docs/specs/enhancement/official-branding/` · Consumed by `/sdd-execute`.
All work in `frontend/` (+ one constitutional doc). Commits: `[SPEC:enhancement/official-branding] <message>`.

- [ ] T-1 Prepare brand logo assets  (deps: none)
      Scope: From the provided official files, produce web-optimized assets in `frontend/public/brand/`: `accelerate-logo-color.png` (colour lockup, whitespace-trimmed, transparent/white bg) and `accelerate-logo-white.png` (white-reverse lockup on a **transparent** background — strip the source's black bg). Preserve aspect ratio; keep file sizes lean. Record each asset's intrinsic width/height (for `next/image`). If the lockup tagline is illegible at header height, also emit a tagline-trimmed header crop.
      Traces: FR-2, FR-3, NFR-4; design.md §5.1
      Files: frontend/public/brand/* (source files in ~/Downloads/OneDrive_1_6-29-2026/)
      Verify: `file frontend/public/brand/*.png` shows expected dimensions; `magick identify` confirms the white logo has an alpha channel (transparent bg).
      Done when: colour + transparent white logos exist, trimmed, optimized, with known dimensions.

- [ ] T-2 Swap primary token ramp to Royal Blue  (deps: none)
      Scope: In `frontend/app/globals.css`, change `--color-primary: #1F4E8C`, `--color-primary-hover: #163A66`, `--color-primary-soft: #E8EEF6` (keep `--color-primary-fg: #FFFFFF`). Update the adjacent comments (no longer "maroon"). Do NOT touch accent, crop, surface, or semantic tokens; do NOT touch `tailwind.config.ts`.
      Traces: FR-1, FR-6, NFR-1; design.md §3
      Files: frontend/app/globals.css
      Verify: `cd frontend && npm run build` green; built CSS shows `.bg-primary{background-color:var(--color-primary)}` resolving to the new value; grep finds no `#800000`/`#680000` left in globals.css.
      Done when: primary surfaces render Royal Blue site-wide; build green.

- [ ] T-3 Header — official colour logo  (deps: T-1)
      Scope: In `components/shell/Header.tsx`, replace the CSS "A" circle + two-line text wordmark with the colour logo (`next/image`, `h-8 sm:h-10 w-auto`, `priority`) as the home link, plus a small "Tanzania Seed Registry" descriptor (hidden on mobile). Single accessible name ("ACCELERATE — Accelerated Variety Turnover for Open-Pollinated Crops, home"). Update `Header.test.tsx` for the new brand structure/accessible name.
      Traces: FR-2, NFR-1, NFR-5; design.md §5.2
      Files: frontend/components/shell/Header.tsx, frontend/components/shell/Header.test.tsx
      Verify: `cd frontend && npm run test -- Header`
      Done when: header shows the logo linking to `/` with an accessible name; nav/auth unchanged; tests green.

- [ ] T-4 Footer — white-reverse logo  (deps: T-1)
      Scope: In `components/shell/Footer.tsx`, replace the text wordmark with `accelerate-logo-white.png` (transparent) sized for the dark band, with an accessible name. Keep coalition chips + partner attributions unchanged.
      Traces: FR-3, NFR-5; design.md §5.3
      Files: frontend/components/shell/Footer.tsx (+ test if one exists)
      Verify: `cd frontend && npm run test -- Footer && npm run build`
      Done when: footer shows the white logo with no opaque box on the dark band; build green.

- [ ] T-5 Favicon / app icons → Royal-Blue mark  (deps: none)
      Scope: Recolour the Tanzania silhouette in `app/icon.svg` to `#1F4E8C`; regenerate `app/icon.png` (512), `app/apple-icon.png` (180), `app/favicon.ico` (16/32/48) from it. No maroon remains in any icon asset.
      Traces: FR-4, FR-1; design.md §5.4
      Files: frontend/app/icon.svg, frontend/app/icon.png, frontend/app/apple-icon.png, frontend/app/favicon.ico
      Verify: `cd frontend && npm run build`; `grep -i 800000 app/icon.svg` returns nothing; icons present in `out/`.
      Done when: favicon/app icons are Royal-Blue, build green, wired into the document head.

- [ ] T-6 Update constitutional palette docs  (deps: T-2)
      Scope: Update `docs/system-design/design.md §7` primary token rows to the Royal Blue ramp (matching globals.css); fix any maroon colour mentions in `docs/prd.md` / `docs/detailed-design/detailed-design.md` if present. Documentation only.
      Traces: FR-5; design.md §1
      Files: docs/system-design/design.md (+ prd.md/detailed-design.md if needed)
      Verify: `grep -n 800000 docs/system-design/design.md` returns nothing; §7 shows `#1F4E8C`.
      Done when: the constitutional token table reflects the official palette.

- [ ] T-7 Brand QA + verification sweep  (deps: T-2, T-3, T-4, T-5, T-6)
      Scope: Final pass — grep the shipped frontend for `#800000`/`#680000`/`#F3E6E6` (excluding comments) → none; AA contrast spot-checks for blue-on-white / white-on-blue / soft-tint chips + focus rings; confirm charts keep primary vs accent distinguishable; fix any gaps. Run the full gate.
      Traces: FR-1, FR-6, NFR-1, NFR-2, NFR-5
      Files: frontend/** (fixes only if a gap is found)
      Verify: `cd frontend && npm run lint && npm run build && npm run test`; manual visual QA across home/map/directory/dashboard/about/login/profile.
      Done when: lint/build/test green; no hardcoded maroon; all routes render on-brand; AA checks pass.

## Dependency Graph
```
T-1 ─┬─ T-3 ─┐
     └─ T-4 ─┤
T-2 ──── T-6 ─┼─ T-7
T-5 ──────────┘
```
Phase A (no deps): T-1, T-2, T-5 can start immediately.

## Testing & Verification Expectations
- Frontend gates: `npm run test`, `npm run lint`, `npm run build` (static export must stay green).
- No new hardcoded hex; the rebrand flows through existing token names only.
- No backend/PII change. Post-merge deploy: `AWS_PROFILE=IBD-DEV ./infra/scripts/deploy-frontend.sh`; verify favicon in incognito.

## Execution Conventions
- Commits: `[SPEC:enhancement/official-branding] <message>` + `Co-Authored-By` trailer; one task per isolated commit.
- Recommended skills: `ui-ux-pro-max`, `tailwind-design-system` (T-2/T-3/T-4), `frontend-design`/`vercel-react-best-practices` (T-3/T-4).
