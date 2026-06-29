# Design — Adopt the official ACCELERATE brand

- Spec path: docs/specs/enhancement/official-branding/
- Status: Draft
- Traces requirements: FR-1..FR-6, NFR-1..NFR-5

## 1. Approach Overview

The rebrand is delivered at three layers, smallest-blast-radius first:

1. **Design tokens (CSS variables)** — repoint the `--color-primary*` ramp in `frontend/app/globals.css` from maroon to the official Royal Blue. Every consumer (`bg-primary`, `text-primary`, `border-primary`, `bg-primary-soft`, focus `ring-primary`, chart `var(--color-primary)`, `roles.ts seed_company → primary`) updates automatically — no per-component colour edits (FR-1).
2. **Brand assets** — add optimized logo files under `frontend/public/brand/` and render them in the Header (colour) and Footer (white-reverse); regenerate the favicon/app icons on-brand (FR-2/FR-3/FR-4).
3. **Constitutional doc** — update `system-design/design.md §7` (and stray maroon mentions in PRD/detailed-design) to the official palette (FR-5).

No layout, flow, copy, data, or API change. Reversible by restoring token values + prior assets (NFR-3).

## 2. Data Model Changes

**None.** No Prisma/API/PII changes.

## 3. Token changes (`frontend/app/globals.css`)

| Token | Before (maroon) | After (Royal Blue) | Notes |
|---|---|---|---|
| `--color-primary` | `#800000` | **`#1F4E8C`** | Official Royal Blue. ~7:1 on white (AA normal text) — NFR-1. |
| `--color-primary-hover` | `#680000` | **`#163A66`** | Darker blue for hover/active. |
| `--color-primary-soft` | `#F3E6E6` | **`#E8EEF6`** | ~8–10% blue over white; icon-chip / soft-accent backgrounds. |
| `--color-primary-fg` | `#FFFFFF` | `#FFFFFF` | Unchanged (white on blue passes AA). |

**Unchanged:** `--color-accent #008BDB` (retained for data-viz variety, FR-6/OQ-2), `--color-highlight`, all `--crop-*` and `--crop-*-soft` (FR-6), surfaces, fg/muted/border, semantic (success/warning/danger). `tailwind.config.ts` is **untouched** (token names stable).

**Cascade (auto-updated, no edits needed):** Buttons (`components/ui/Button.tsx` uses `bg-primary`/`hover:bg-primary-hover`), nav active/links, Hero CTA, dashboard KPI hero (`bg-primary`) + KPI/chart icon chips (`bg-primary-soft`), `chart-tokens.ts` `CATEGORICAL_COLORS` (includes `var(--color-primary)`), `roles.ts` `seed_company` marker, all focus rings.

## 4. Backend Design

**None.**

## 5. Frontend Design

### 5.1 Logo assets (`frontend/public/brand/`)

Produce web-optimized assets from the provided files (Logo 1–4):

- `accelerate-logo-color.(png|svg)` — **colour** lockup (royal-blue wordmark + olive/gold icon) on transparent bg, whitespace-trimmed → **Header**.
- `accelerate-logo-white.png` — **white-reverse** lockup on **transparent** bg (the source is white-on-black JPG; the black background MUST be removed) → **Footer**.
- Keep intrinsic aspect ratio; record natural width/height for `next/image`.
- **Header legibility:** the full lockup includes a small tagline that is illegible at header height. If, at the chosen header size, the tagline doesn't read, use a **tagline-trimmed crop** (icon + "ACCELERATE") for the header asset; the full lockup (with tagline) is fine for the footer where there's room. Implementer's call based on rendered legibility.

### 5.2 Header (`components/shell/Header.tsx`)

Replace the CSS "A" circle (`rounded-full bg-primary`) + two-line text wordmark with the colour logo:

```tsx
<Link href="/" aria-label="ACCELERATE — Accelerated Variety Turnover for Open-Pollinated Crops, home"
      className="flex items-center gap-3 shrink-0 focus-visible:ring-2 focus-visible:ring-primary …">
  <Image src="/brand/accelerate-logo-color.png" alt="" width={W} height={H}
         priority className="h-8 w-auto sm:h-10" />
  {/* Platform descriptor — distinguishes this site from the umbrella project */}
  <span className="hidden sm:block border-l border-border pl-3 text-xs font-medium uppercase tracking-wider text-muted">
    Tanzania Seed Registry
  </span>
</Link>
```
- `alt=""` on the image because the `<Link>` carries the accessible name (avoids double announcement); or put descriptive alt and drop the link aria-label — one source of the name.
- The "Tanzania Seed Registry" descriptor keeps platform context (the logo is the project brand). Hidden on mobile to save width.

### 5.3 Footer (`components/shell/Footer.tsx`)

Replace the text wordmark ("ACCELERATE / TANZANIA") with `accelerate-logo-white.png` (transparent) sized for the dark band; keep the existing coalition chips (Alliance/PABRA/Gates) and partner attributions unchanged.

### 5.4 Favicon / app icons (`frontend/app/`)

Regenerate on-brand (FR-4, OQ-1): recolour the existing **Tanzania silhouette** mark to **Royal Blue `#1F4E8C`** in `app/icon.svg` (crisp at 16 px), then regenerate `icon.png` (512), `apple-icon.png` (180), `favicon.ico` (16/32/48) from it (rsvg-convert/magick, as before). Rationale: the brand's crop-trio icon is detailed and muddy at favicon sizes; the Royal-Blue Tanzania mark is crisp and still on-brand for the *Tanzania* registry. (Alternative: a simplified blue crop mark — only if it renders cleanly at 16 px.)

### 5.5 No structural change

Tailwind config, component structure, routes, and copy are unchanged. The only `.tsx` edits are Header and Footer brand blocks.

## 6. Security & RBAC

None — visual only; no PII, no auth, no endpoints.

## 7. Infrastructure / Deployment

Frontend-only. Deploy via `AWS_PROFILE=IBD-DEV ./infra/scripts/deploy-frontend.sh` (S3 sync + CloudFront `/*` invalidation — covers logo + favicon). Verify favicon in incognito (aggressive browser cache).

## 8. Decision Records (ADR-style)

### Decision: Royal Blue ramp values
- **Context:** Need hover + soft variants; hex CSS-vars can't use Tailwind `/opacity`.
- **Decision:** `primary #1F4E8C`, `hover #163A66`, `soft #E8EEF6`, `fg #FFFFFF`.
- **Consequences:** AA-compliant on white and as a reversed surface; `soft` gives the icon-chip wash the dashboard/KPI already rely on.

### Decision: Rebrand via token swap, not component edits
- **Context:** Maroon is consumed only through `--color-primary*` tokens.
- **Decision:** Change token values; leave component classes untouched.
- **Consequences:** Whole-site rebrand in one CSS change; minimal diff; trivially reversible. Only hardcoded maroon (favicon `icon.svg`) is regenerated.

### Decision: Keep accent + crop colours
- **Context:** Charts/maps use multiple categorical hues; crop colours mirror the logo icon.
- **Decision:** Retain `--color-accent` and all `--crop-*`.
- **Consequences:** Data-viz keeps variety; crop identity stays consistent with the logo.

### Decision: Favicon = Royal-Blue Tanzania mark
- **Context:** OQ-1 — brand crop-trio vs. Tanzania silhouette at 16 px.
- **Decision:** Recolour the existing Tanzania mark to Royal Blue.
- **Consequences:** Crisp at small sizes, on-brand; revisit if stakeholders want the crop-trio mark.

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| White-reverse logo ships with a black box (JPG bg) | Asset task MUST output transparent PNG; verify on the dark footer. |
| Tagline illegible in header | Use a tagline-trimmed header crop if needed (§5.1). |
| A blue-on-white control fails AA | Contrast-check primary/hover/soft against fg/bg; adjust ramp if any check fails (NFR-1). |
| Stray hardcoded maroon missed | Grep `#800000`/`#680000`/`#F3E6E6` across `frontend/` (excluding comments) before done (FR-1 AC). |
| Favicon cached | CloudFront `/*` invalidation + incognito verify. |
| Two blues (primary vs accent) clash in charts | Verify chart categoricals remain distinguishable (FR-6). |

## 10. Test Plan Outline

- **Build/lint/types:** `npm run build` (static export green), `npm run lint`, `tsc` clean (NFR-2).
- **Full suite:** `npm run test` stays green (token/asset change shouldn't break tests; update any test asserting the old header "A"/wordmark structure or maroon).
- **Header/Footer component tests:** assert the brand link renders the logo image with an accessible name and links to `/`; footer shows the white logo.
- **Hardcoded-maroon grep:** no `#800000`/`#680000`/`#F3E6E6` in shipped source/assets (FR-1).
- **Manual visual QA:** home, map, directory, dashboard, about, login, profile render Royal Blue (no maroon); favicon on-brand; AA contrast spot-checks; logos crisp at mobile + desktop.
