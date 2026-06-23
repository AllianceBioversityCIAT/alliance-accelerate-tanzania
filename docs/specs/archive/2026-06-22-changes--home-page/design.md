# Design — Home Page (Public Registry Portal landing)

- Spec path: docs/specs/changes/home-page/
- Status: Draft
- Depth: Standard
- Traces requirements: FR-1..FR-7, NFR-1..NFR-5 (requirements.md)

## 1. Document Control

| Field | Value |
|---|---|
| Branch | `feature/home-page` |
| Architecture source | docs/detailed-design/detailed-design.md §1,§4,§6 |
| Design system source | docs/system-design/design.md §4,§5,§7,§8,§9 |

## 2. Executive Summary

Bootstrap a minimal Next.js (App Router, TypeScript, Tailwind, **static export**) frontend and build the public landing page on top of it. Static marketing copy lives in the frontend; only numeric aggregates are fetched client-side from `GET /api/v1/metrics` through a typed API client that degrades gracefully. The page establishes the reusable **public shell** (header + footer) and presentational components (CTA button, stat card, crop card) that Directory and Map specs will reuse. Tokens from System Design §7 are wired into Tailwind so no component hardcodes colors/geometry.

## 3. Architecture Overview

Per Detailed Design §1/§6: decoupled SPA, static-exported to S3/CloudFront, talking to the NestJS API over HTTPS. This spec implements only the frontend slice.

```
app/(public)/layout.tsx   → PublicShell (Header + Footer)
app/(public)/page.tsx      → Home composition (Hero, MetricsBand, CropCoverage)
        │ client fetch
        ▼
lib/api/metrics.ts  → getMetrics()  ─HTTP─▶  GET {API_BASE}/api/v1/metrics
        │ on error → null (components render fallback)
```

- Static export: `next.config.mjs` sets `output: 'export'`. No SSR/route handlers (NFR-1).
- Metrics fetched in a client component via React Query (or a small `useMetrics` hook with `useState/useEffect` if React Query is deferred); page shell renders immediately, figures swap from skeleton → value/fallback (FR-3, NFR-5).
- API base URL from `NEXT_PUBLIC_API_BASE_URL` (build-time public env).

## 4. Extended Directory Structure

```
frontend/
├── next.config.mjs                # output: 'export'; images.unoptimized: true
├── tailwind.config.ts             # design tokens (System Design §7)
├── postcss.config.js
├── tsconfig.json
├── package.json
├── .env.example                   # NEXT_PUBLIC_API_BASE_URL
├── app/
│   ├── globals.css                # CSS variables for tokens + base styles
│   ├── layout.tsx                 # root layout (fonts, html lang)
│   └── (public)/
│       ├── layout.tsx             # PublicShell wrapper
│       └── page.tsx               # Home page composition
├── components/
│   ├── shell/
│   │   ├── Header.tsx             # nav + role-aware auth slot (FR-5, FR-6)
│   │   └── Footer.tsx            # FR-7
│   ├── home/
│   │   ├── Hero.tsx              # FR-2
│   │   ├── MetricsBand.tsx      # FR-3
│   │   ├── CropCoverage.tsx     # FR-4
│   │   └── CropCard.tsx
│   └── ui/
│       ├── Button.tsx            # primary/secondary CTA (tokens)
│       ├── StatCard.tsx
│       └── Skeleton.tsx
├── lib/
│   ├── api/
│   │   ├── client.ts             # fetch wrapper, base URL, error handling
│   │   └── metrics.ts            # getMetrics() + Metrics type
│   ├── auth/
│   │   └── useSession.ts         # client-side session stub (returns Public by default)
│   └── content/
│       └── crops.ts              # static crop copy (name, description, slug, token)
└── public/                        # placeholder imagery
```

## 5. Data Model

No persistence. Frontend-facing contract for the consumed endpoint:

```ts
// lib/api/metrics.ts
export interface CropMetric {
  slug: 'sorghum' | 'common_bean' | 'groundnut';
  mappedActors: number;
}
export interface Metrics {
  actorsMapped: number;
  cropsTracked: number;
  regionsCovered: number;
  actorTypes: number;
  crops: CropMetric[];
}
// getMetrics(): Promise<Metrics | null>  // null on any failure → components fall back
```

Static crop copy (`lib/content/crops.ts`) holds name, description, slug, and crop token; counts come from the live `crops[]`.

## 6. API Design

No new endpoints authored here. Consumes `GET /api/v1/metrics` (Detailed Design §4). Required response fields: `actorsMapped`, `cropsTracked`, `regionsCovered`, `actorTypes`, `crops[].slug`, `crops[].mappedActors`. If the deployed endpoint lacks per-crop counts, `CropCard` renders the count as a placeholder (FR-4 fallback). Client sends no auth header for this public call; CORS restricted to the CloudFront origin in production.

## 7. Backend Module Design

None. This is a frontend-only spec. (The metrics endpoint is owned by a future backend spec; this spec defines the contract it expects.)

## 8. Frontend / UX Component Architecture

Maps the mockup to components, all styled via tokens (System Design §7) and built on the component inventory (§8). Prefer shadcn/ui primitives for `Button`/`Skeleton` where convenient.

| Component | Requirement | Notes |
|---|---|---|
| `PublicShell` (`(public)/layout.tsx`) | FR-1 | Wraps Header + `{children}` + Footer; max-width container per System Design §6. |
| `Header` | FR-5, FR-6 | Brand lockup, nav (Home/Discovery Map/Directory) with active state via `usePathname`, auth slot from `useSession` (defaults to sign-in). Sticky; hamburger < `md`. |
| `Footer` | FR-7 | Brand line + governance note; dark surface token. |
| `Hero` | FR-2 | Eyebrow badge, headline, copy, two CTAs (`Button` primary/secondary), visual panel with "Live Registry" stat (uses `actorsMapped`). Two-column → stacked on mobile (§9). |
| `MetricsBand` | FR-3, NFR-5 | Dark band; four `StatCard`s; consumes `useMetrics`; skeleton → value/`—`. |
| `CropCoverage` + `CropCard` | FR-4 | Section header + "View all actors" link; three cards colored by crop token; description from static content, count from live metrics. |
| `Button`, `StatCard`, `Skeleton` | NFR-2/3/4 | Reusable token-driven primitives. |

**State boundaries:** server state (metrics) in a single `useMetrics` hook (React Query if added, else `useEffect`); session via `useSession` (stub returning `{ role: 'Public' }` until Cognito spec lands); no global store needed. Loading/error handled inside `MetricsBand`/`CropCoverage` so the shell never blocks (NFR-5).

**Accessibility (NFR-3):** `<header>`/`<main>`/`<footer>` landmarks; nav as `<nav aria-label>`; CTAs are real links/buttons with discernible names; focus-visible rings via token; decorative imagery `alt=""`, meaningful imagery described; reduced-motion guards on any transition.

## 9. Shared Contracts or Package Extensions

Establishes `lib/api/client.ts` (shared fetch wrapper + error envelope handling per Detailed Design §9) and the `Metrics` type as the first shared contract. `useSession` stub defines the session shape future Cognito work fills in. These are foundational and reused by later public specs.

## 10. Design Decisions

- **DD-1 (This spec owns minimal frontend bootstrap):** No frontend exists; rather than block on a separate scaffolding spec, bootstrap only what the home page needs (Next.js static export, Tailwind tokens, public shell, API client). Rejected: full project scaffolding spec first (slower; this delivers reviewable value now and the bootstrap is a strict subset).
- **DD-2 (Static copy + live metrics — proposal Option A):** Only numbers are fetched; copy is static. Rejected Option B (fully API-driven) as premature content modeling; rejected Option C (hardcoded metrics) as it violates the living-data PRD goal.
- **DD-3 (Graceful metrics fallback):** `getMetrics()` returns `null` on any failure and components render `—`/skeleton, so the page ships before the backend exists (NFR-5). Rejected: throwing/Suspense error boundary that blanks the page.
- **DD-4 (Auth slot is presentational + client-hydrated):** Default render is the `Public` sign-in state; session detection is a client stub now, swapped for Cognito later. Keeps the page static-export-safe and unblocks the header without the auth spec (FR-5).
- **DD-5 (Tokens in Tailwind config + CSS vars):** Authored so a future dark theme can override variables (System Design §11) without touching components.
- **DD-6 (React Query optional):** Use React Query if it is added during T-1; otherwise a minimal `useEffect` hook satisfies the same contract. Decision deferred to keep the bootstrap lean.

## 11. Risks & Mitigations

- **Backend not deployed:** mitigated by DD-3 graceful fallback.
- **Static-export pitfalls (next/image, dynamic routes):** set `images.unoptimized: true`, avoid server-only APIs (NFR-1).
- **Token drift:** all components reference `tailwind.config` tokens; reviewer gate enforces no hardcoded values (NFR-4).
- **Scope creep into auth:** auth slot is a stub only (DD-4).

## 12. Test Plan Outline

- Build/export: `next build` succeeds, static output emitted (NFR-1).
- Component tests (Testing Library): `MetricsBand` shows skeleton then values; shows `—` when `getMetrics` returns null (FR-3); `CropCard` renders description + count/fallback (FR-4); `Header` shows sign-in by default and nav active state (FR-5/6).
- Manual/a11y: keyboard traverse nav + CTAs, focus visible, axe check passes, responsive at 360/768/1280 (NFR-2/3).
