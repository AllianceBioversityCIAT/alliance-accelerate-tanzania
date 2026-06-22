# Tasks — Home Page (Public Registry Portal landing)

- Spec path: docs/specs/changes/home-page/
- Status: Draft
- Depth: Standard
- Traces: requirements.md (FR-1..FR-7, NFR-1..NFR-5), design.md (§3–§10)
- Commit standard: `[SPEC:changes/home-page] <message>`

## Dependency Graph

```
T-1 ──▶ T-2 ──▶ T-3 ──▶ T-4 ──▶ T-7
                 │        │
                 ▼        ▼
                T-5 ──▶ T-6 ──────▶ T-7
```
A task is eligible when its status is `[ ]`/`[~]` and all deps are `[x]`. Order ties broken by document order.

---

- [x] T-1 Bootstrap minimal Next.js static-export frontend  (deps: none)
      Size: M
      Requirements: NFR-1
      Design: design.md §3, §4
      Scope: Create `frontend/` Next.js app (App Router, TS, Tailwind). Configure `next.config.js` with `output: 'export'` and `images.unoptimized: true`. Add `tsconfig`, `postcss.config.js`, root `app/layout.tsx` with Inter font + `lang="en"`, and `.env.example` with `NEXT_PUBLIC_API_BASE_URL`. No page content yet beyond a placeholder.
      Tests / Verify: `cd frontend && npm install && npm run build` succeeds and emits a static `out/` directory.
      Done when: static export build passes with no SSR/route handlers present.
      Skills: vercel-react-best-practices

- [x] T-2 Wire design tokens into Tailwind + globals  (deps: T-1)
      Size: S
      Requirements: NFR-4
      Design: design.md §10 (DD-5); System Design §7
      Scope: Define every token from System Design §7 (colors incl. crop palette, typography scale, radii, shadows, spacing) in `tailwind.config.ts` and as CSS variables in `app/globals.css`, scoped so a future `.dark` override is possible. No component may later hardcode these values.
      Tests / Verify: `cd frontend && npm run build`; grep confirms tokens defined (e.g. `--color-primary`, `--crop-sorghum`).
      Done when: tokens resolve in Tailwind classes and CSS vars; build passes.
      Skills: tailwind-design-system

- [x] T-3 Build the public shell (Header + Footer) and route layout  (deps: T-2)
      Size: M
      Requirements: FR-1, FR-5, FR-6, FR-7
      Design: design.md §4, §8
      Scope: Implement `components/shell/Header.tsx` (brand lockup, nav Home/Discovery Map/Directory with active state via `usePathname`, role-aware auth slot reading `lib/auth/useSession.ts` stub defaulting to `Public` sign-in; sticky + hamburger < md), `components/shell/Footer.tsx` (brand line + governance note), and `app/(public)/layout.tsx` composing `PublicShell`. Add the `useSession` stub returning `{ role: 'Public' }`.
      Tests / Verify: `cd frontend && npm run build`; component test asserts Header shows sign-in by default and marks the active nav item; Footer shows the governance note.
      Done when: shell renders, nav links point to `/`, `/map`, `/directory`, auth slot defaults to sign-in.
      Skills: ui-ux-pro-max, shadcn-ui

- [x] T-4 Build the Hero section with CTAs  (deps: T-3)
      Size: M
      Requirements: FR-2, NFR-2
      Design: design.md §8; System Design §4, §9
      Scope: Implement `components/home/Hero.tsx` and `components/ui/Button.tsx` (primary/secondary, token-driven). Eyebrow badge, headline, value-chain copy, visual panel with "Live Registry" stat (binds to `actorsMapped`, placeholder until metrics land), CTAs "Explore the Map" → `/map` and "Browse Directory" → `/directory`. Two-column → stacked on mobile. Mount Hero in `app/(public)/page.tsx`.
      Tests / Verify: `cd frontend && npm run build`; component test asserts both CTAs link to `/map` and `/directory`; manual check responsive at 360/1280.
      Done when: hero matches mockup structure, CTAs navigate correctly, responsive.
      Skills: ui-ux-pro-max, frontend-design

- [ ] T-5 Add metrics API client + `useMetrics` hook with graceful fallback  (deps: T-3)
      Size: S
      Requirements: FR-3, NFR-5
      Design: design.md §5, §6, §10 (DD-3)
      Scope: Implement `lib/api/client.ts` (fetch wrapper, base URL from env, error-envelope handling) and `lib/api/metrics.ts` exporting the `Metrics`/`CropMetric` types and `getMetrics(): Promise<Metrics | null>` (returns `null` on any failure). Add a `useMetrics` hook exposing `{ data, loading }`.
      Tests / Verify: `cd frontend && npm run test -- metrics` (or build); unit test asserts `getMetrics` resolves `null` on fetch error and parses a valid response.
      Done when: hook returns typed data on success and `null` without throwing on failure.
      Skills: error-handling-patterns, api-design-principles

- [ ] T-6 Build Metrics band and Crop coverage sections (live counts)  (deps: T-4, T-5)
      Size: M
      Requirements: FR-3, FR-4, NFR-2
      Design: design.md §8; System Design §7 (crop tokens), §8
      Scope: Implement `components/home/MetricsBand.tsx` (four `StatCard`s: actorsMapped, cropsTracked, regionsCovered, actorTypes; skeleton → value or `—`), `components/home/CropCoverage.tsx` + `CropCard.tsx` (three crop cards colored by crop token, static copy from `lib/content/crops.ts`, live count with placeholder fallback, "View all actors" → `/directory`), `components/ui/StatCard.tsx`, `Skeleton.tsx`. Compose both in `page.tsx`.
      Tests / Verify: `cd frontend && npm run test -- metrics-band crop` ; tests assert values render on success and `—`/placeholder when `useMetrics` returns null; build passes.
      Done when: both sections render live counts with graceful fallback and crop-token styling; responsive 1→3 columns.
      Skills: ui-ux-pro-max, tailwind-design-system

- [ ] T-7 Accessibility, responsive, and static-export verification pass  (deps: T-6)
      Size: S
      Requirements: NFR-1, NFR-2, NFR-3
      Design: design.md §8 (a11y), §12
      Scope: Add landmarks (`header`/`main`/`footer`), `nav aria-label`, focus-visible styles, image `alt` text, reduced-motion guards. Verify responsive at 360/768/1280 and run an accessibility check. Confirm no SSR/route handlers exist.
      Tests / Verify: `cd frontend && npm run build` (static export emits `out/`); run `npx @axe-core/cli` or Testing Library + jest-axe on `/`; manual keyboard traversal.
      Done when: axe reports no critical violations, keyboard nav works, static export build passes.
      Skills: ui-ux-pro-max, react-doctor

## Testing & Verification Expectations
- Each task runs `npm run build` (or a targeted test) before completion.
- Metrics-dependent tasks must prove the graceful-fallback path (FR-3/NFR-5).
- No task introduces SSR/Next route handlers (NFR-1) or hardcoded colors/geometry (NFR-4).

## Coverage Check
Every requirement is covered: FR-1→T-3/T-4 · FR-2→T-4 · FR-3→T-5/T-6 · FR-4→T-6 · FR-5→T-3 · FR-6→T-3 · FR-7→T-3 · NFR-1→T-1/T-7 · NFR-2→T-4/T-6/T-7 · NFR-3→T-7 · NFR-4→T-2 · NFR-5→T-5.

Recommended first task: **T-1**.
