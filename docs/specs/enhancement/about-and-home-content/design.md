# Design — About Page & Home Content Expansion

- Spec path: docs/specs/enhancement/about-and-home-content/
- Status: Draft
- Traces requirements: FR-1..FR-12, NFR-1..NFR-7 from this spec's requirements.md

## 1. Approach Overview

Pure frontend/content change within the mandated Next.js (App Router, TypeScript, Tailwind) **static export** → S3/CloudFront pipeline. No backend, API, Prisma, or Cognito changes; no SSR/ISR/route handlers (NFR-2). The work is presentational:

1. A new static route `app/(public)/about/page.tsx` rendered inside the existing `(public)/layout.tsx` (`PublicShell`), composed of section blocks fed by paste-ready brief copy and typed content modules.
2. Four new home section components in `components/home/` wired into `app/(public)/page.tsx` in the §2.0 order.
3. Two shell edits: an `About` nav entry (Header desktop + mobile, Footer) and a footer coalition expansion.
4. Typed content modules (`lib/content/partners.ts`, `pillars.ts`) mirroring the existing `crops.ts` convention, plus web-optimized assets under `public/`.

All motion reuses the existing GSAP layer (`useReveal`, `useCountUp`) with its `prefers-reduced-motion` gate (NFR-5); all styling uses §7 tokens (NFR-1). Components follow the established pattern: presentational sections are server components by default; only components that consume `useMetrics` or motion hooks carry `'use client'`.

```
app/(public)/page.tsx          → Hero · MetricsBand · AboutStrip · HowItWorks · CropCoverage · PartnersStrip · ClosingCTA
app/(public)/about/page.tsx    → AboutHero(photo) · Challenge · Approach(+Pillars) · Crops · Partners · CaseStudies · Registry · Credits
```

## 2. Data Model Changes

None. No Prisma model/field/migration changes; no PII fields added; PII allowlist untouched (FR §5). "Data" introduced is static TypeScript content only.

## 3. API Surface & Contracts

No new or changed endpoints. The home page continues to consume the existing Metrics read path via `useMetrics` (unchanged). No new fetches are introduced on `/about` (fully static content). No role-aware projection concerns — all content is Public.

## 4. Backend Design

No backend changes. NestJS, guards, serializers, and infra templates are untouched. Deployment uses the existing `infra/scripts/deploy-frontend.sh` (with `--profile IBD-DEV`), unmodified.

## 5. Frontend Design

### 5.1 Routes
- **New:** `frontend/app/(public)/about/page.tsx` — server component, exports `metadata` (FR-3). Static export emits `about/index.html`. Reuses `PublicShell` via the existing `(public)/layout.tsx` (FR-1).
- **Modified:** `frontend/app/(public)/page.tsx` — recomposed to the FR-8 order.

### 5.2 New home components (`components/home/`)

| Component | Client? | Surface | Motion | Maps over |
|---|---|---|---|---|
| `AboutStrip.tsx` | server | `bg-surface-alt` | header reveal (optional) | — (inline copy) |
| `HowItWorks.tsx` | `'use client'` | `bg-bg` | `useReveal` grid stagger (mirrors `CropCoverage`) | `PILLARS` |
| `PartnersStrip.tsx` | server (or client only if reveal added) | `bg-surface` | optional reveal | `PARTNERS` |
| `ClosingCTA.tsx` | server | `bg-fg text-bg` | none | — (inline copy) |

`AboutStrip` and `ClosingCTA` are static copy + `Button` CTAs and can be server components (no hooks) — matching how `Hero` only went client for motion/Image. `HowItWorks` mirrors `CropCoverage` exactly (client, `useReveal` on header + grid) for the pillar stagger (FR-5, NFR-5). `PartnersStrip` is a server component unless a reveal is added; to keep motion consistent and avoid a client boundary for a logo wall, it renders statically with CSS-only grayscale→color on hover/focus (no JS needed — satisfies NFR-5 by requiring no motion to perceive logos).

Each section: `<section aria-labelledby="…-heading">` with one `<h2>`, eyebrow pill (reusing the `CropCoverage` eyebrow style: `rounded-full bg-primary/10 text-primary`), and the standard container `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8` (NFR-3, NFR-4).

### 5.3 Logo wall pattern (FR-6, FR-10)

A presentational `PartnerLogo` sub-component renders either an image or a text fallback from each `Partner` entry:

```tsx
// grayscale by default, color on hover/focus — CSS only, no JS, reduced-motion-safe
<a href={p.url} target="_blank" rel="noopener noreferrer"
   aria-label={`${p.name} — opens in a new tab`}
   className="… focus-visible:ring-2 focus-visible:ring-primary …">
  {p.logo
    ? <Image src={p.logo} alt={p.name} width={…} height={…}
        className="h-10 w-auto grayscale opacity-80 transition
                   hover:grayscale-0 hover:opacity-100
                   focus-visible:grayscale-0 motion-reduce:transition-none" />
    : <span className="text-sm font-semibold text-muted">{p.name}</span>}
</a>
```

- On the **home Partners strip** (`bg-surface`): logos sit directly on the light surface.
- On the **dark footer** (`bg-fg`): logos that aren't light-safe sit on a light `bg-surface` chip (matching the existing PABRA chip pattern). Footer shows the lead coalition (Alliance, PABRA, Gates) per FR-10; the full six appear in the home strip.
- Grayscale utilities (`grayscale`, `grayscale-0`) are Tailwind built-ins — no new tokens, no hex (NFR-1).
- Hover-to-color is an enhancement: the grayscale mark is itself legible, and `alt`/`aria-label` give the accessible name regardless of color state (NFR-4).

### 5.4 Content modules (`lib/content/`) — FR-12

`partners.ts`:
```ts
export interface Partner {
  key: 'alliance' | 'pabra' | 'tari' | 'tosci' | 'cimmyt' | 'bmgf';
  name: string;            // full accessible name
  role: string;            // e.g. 'Lead implementer'
  url: string;             // official site
  logo?: string;           // /public path; absent → text-label fallback (FR-6)
  lightSafe?: boolean;     // true if usable directly on dark footer w/o chip
}
export const PARTNERS: Partner[] = [ /* §4.1, six entries */ ];
```
`pillars.ts`:
```ts
export interface Pillar { title: string; body: string; }
export const PILLARS: Pillar[] = [ /* §4.3, three entries */ ];
```
Crop sub-label enrichment (optional, FR-12): add a `varieties?: string[]` field to `CropContent` in `crops.ts`, populated from brief §4.2, rendered as a muted sub-label in `CropCard` (additive, backward-compatible).

### 5.5 About page composition (`about/page.tsx`) — FR-2

Server component. Inline section blocks (no per-section component explosion needed — the page is mostly static prose). Structure:
- `AboutHero` — eyebrow + `<h1>` + lede + the ACCELERATE field photograph via `next/image` (FR-11). Photo rendered with descriptive `alt`; if text overlays the image, a token-based scrim ensures AA contrast (NFR-4); otherwise photo sits beside/below text.
- `Challenge`, `Approach` (reuses the same `PILLARS` data + a shared `PillarCards` presentational piece with `HowItWorks` to avoid duplication), `Crops` (reuses `CROPS` + variety sub-labels), `Partners` (prose + same `PartnersStrip`/logo treatment or text list), `CaseStudies` (brief §3.6 — four enterprises, attributed 🟡), `Registry` (CTAs to `/map`, `/directory`), `Credits` (brief §3.8, Alliance link).
- Exactly one `<h1>`; every other section heading is `<h2>` under `aria-labelledby`.

To avoid duplicating the pillar card markup between `HowItWorks` (home) and the About approach section, extract a shared presentational `PillarCards.tsx` (server component, maps `PILLARS`) consumed by both. `HowItWorks` wraps it with the eyebrow/heading + `useReveal`; About renders it inline.

### 5.6 Navigation (FR-9, FR-10)
- `Header.tsx`: add `{ label: 'About', href: '/about' }` to `NAV_LINKS` (drives both desktop nav and mobile menu + active state automatically).
- `Footer.tsx`: add an `About` text link and expand the partner block from the lone PABRA chip to the coalition (Alliance + PABRA + Gates), reusing the existing chip pattern and `Partner` data.

### 5.7 Tokens & imagery
- Surfaces used: `bg-bg`, `bg-surface`, `bg-surface-alt`, `bg-fg`/`text-bg` — all existing §7 tokens (NFR-1). Eyebrows reuse `bg-primary/10 text-primary`.
- Assets under `frontend/public/`: `accelerate-field.jpg` (About hero), `partners/alliance.*`, `partners/bmgf.*`, and (if cleanable) `partners/tari.*`, `partners/tosci.*`, `partners/cimmyt.*`; PABRA reuses existing `/pabra-30-logo.png`. All via `next/image` (NFR-7). Home `Hero` `/hero-harvest.jpg` unchanged (LCP preserved).

## 6. Security & RBAC

No RBAC surface. All content is Public; no PII referenced or rendered (FR §5). External links use `target="_blank" rel="noopener noreferrer"` (prevents reverse-tabnabbing). No secrets, no CORS, no env changes.

## 7. Infrastructure / Deployment

No IaC changes. Deploy via existing `infra/scripts/deploy-frontend.sh` with `--profile IBD-DEV`. New static route + assets ship in the normal `next build` static export → S3 sync → CloudFront invalidation. No new AWS resources.

## 8. Decision Records (ADR-style)

### Decision: Server components for static sections; client only for motion/metrics
- **Context:** New sections are mostly static copy; only pillar stagger needs motion.
- **Options:** (a) all client; (b) server by default, client only where hooks are used.
- **Decision:** (b) — `AboutStrip`/`ClosingCTA`/`PartnersStrip`/About page are server components; `HowItWorks` is client for `useReveal`. Matches the existing `Hero` (client for motion) vs `Footer` (server) split.
- **Consequences:** Smaller client bundle; logo wall needs no JS; consistent with repo conventions.

### Decision: CSS-only grayscale logo wall (no JS, hover/focus to color)
- **Context:** FR-6 wants an institutional logo wall that's reduced-motion-safe and accessible.
- **Options:** (a) JS-driven; (b) CSS `grayscale`→`grayscale-0` on hover/focus; (c) static color logos.
- **Decision:** (b). Tailwind built-in filters, no new tokens, no motion dependency; accessible name via `alt`/`aria-label` independent of color.
- **Consequences:** Works without JS and under reduced motion; mixed logo/text fallback handled by the `Partner.logo?` field.

### Decision: Shared `PillarCards` between home and About
- **Context:** Pillars appear on both home (§2.4) and About (§3.3) with identical content.
- **Decision:** Extract one presentational `PillarCards` mapping `PILLARS`; home wraps it with motion, About renders it inline.
- **Consequences:** Single source of truth; no copy drift; DRY.

### Decision: Field photo on About hero, home Hero untouched
- **Context:** New field photo vs the tuned home `Hero` LCP harvest image (FR-11, user decision).
- **Decision:** Field photo → `/about` hero; home `Hero` image unchanged.
- **Consequences:** No LCP regression on the home page; the demand-led photo strengthens the About narrative.

### Decision: Case-study figures attributed, never live metrics
- **Context:** Brief §3.6 figures are real but 🟡 secondary.
- **Decision:** Render only on `/about` with explicit attribution (brief §3.8); never in MetricsBand/home counts.
- **Consequences:** Preserves the "live numbers via `useMetrics` only" invariant (NFR-6).

## 9. Risks & Mitigations

- **Logo asset quality (TARI/TOSCI/CIMMYT):** supplied image is a combined strip; clean per-partner marks may be hard to extract. **Mitigation:** `Partner.logo?` optional → text-label fallback (FR-6/FR-10), no blocker.
- **Logo licensing/brand usage:** partner/funder marks have usage rules. **Mitigation:** grayscale, linked to official sites, attribution present — standard for a coalition site; flag to stakeholders.
- **Bundle/asset weight:** several logos + a photo. **Mitigation:** `next/image`, sized assets, grayscale logos are small; home `Hero` LCP unchanged (NFR-7).
- **Accessibility regressions on new prose-heavy page:** **Mitigation:** one `<h1>`, `aria-labelledby` sections, jest-axe tests (NFR-4).
- **Copy drift from brief:** **Mitigation:** content modules + paste-ready strings; reviewer checks against brief (NFR-6).

## 10. Test Plan Outline

- **Unit / RTL (Jest):** each new component renders its brief copy, correct heading levels, CTA hrefs (`AboutStrip`→/about, `ClosingCTA`→/map & /about), `HowItWorks` renders 3 pillars and 3-col grid classes, `PartnersStrip` renders 6 partners with accessible names + external-link rels, footer renders the coalition links, Header/mobile include the About link.
- **a11y (jest-axe):** `/about` page composition and each new home section → zero violations; one `<h1>` on `/about`; logo links have discernible names. Extend the existing `home-a11y.test.tsx` pattern; add `about-a11y.test.tsx`.
- **Motion determinism:** `HowItWorks`/`PillarCards` rely on the existing GSAP mocks (`__mocks__` + `moduleNameMapper`) so reveal runs once and content is present in tests (NFR-5).
- **Build integrity:** `cd frontend && npm run build` (static export emits `about/index.html`) + `npm run lint`. No new hex (NFR-1 grep check).
- **No PII tests required** (no PII surface).
