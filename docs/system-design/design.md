# System Design — UI/UX Blueprint — ACCELERATE Tanzania Seed Registry

> The visual and interaction system. Not low-level technical implementation (see `docs/detailed-design/detailed-design.md` for that).
> Constitutional baseline. Last reviewed: 2026-06-22.

## 1. Product Experience Principles

1. **Public-first clarity.** The default experience is read-only and instantly legible to a non-technical donor, researcher, or partner. No login wall in front of public data.
2. **Data integrity over decoration.** This is a registry; correctness, legibility of tabular and geospatial data, and honest empty/error states matter more than ornament.
3. **Trust through restraint with PII.** PII is never shown speculatively. Protected fields render as an explicit, consistent "restricted" affordance for unauthorized roles — never blank, never fake.
4. **Map and list are equals.** Spatial and tabular views of the same dataset stay synchronized in language, filters, and terminology.
5. **Accessible by default.** WCAG 2.1 AA: keyboard navigable, sufficient contrast, labeled controls, respects reduced motion.

## 2. Information Architecture

```
/                         Landing / Public Registry Portal (metrics + entry points)
/directory                Searchable, paginated actor directory (list/table)
/directory/[id]           Actor profile page (public-safe by default)
/map                      Seed Maps — interactive geospatial view + filters
/admin                    Admin/Staff console (auth-gated)
  /admin/actors           Actor management table (CRUD)
  /admin/actors/new       Create actor (validated form)
  /admin/actors/[id]/edit Edit actor (validated form)
  /admin/import           CSV bulk import
  /admin/export           Filtered CSV export
  /admin/users            User & role management (Admin only)
/login                    Cognito-backed sign-in (Staff/Admin)
```

## 3. Primary User Flows

- **Explore (Public):** Landing → see metrics → Directory (search/filter/paginate) → Actor profile (PII hidden) → optionally jump to Map centered on that actor.
- **Spatial analysis (Public):** Landing → Map → apply Crop/Region/Capacity/Trader-type filters → click marker → mini-profile popup → open full profile.
- **Data entry (Staff):** Login → Admin → Actors table → New/Edit → validated form → save → confirmation toast → record visible in directory.
- **Bulk seed (Admin):** Login → Admin → Import → upload CSV → preview mapping + validation summary → confirm → per-row result report.
- **Compliant share (Admin/Staff):** Admin → Export → choose filters + scope → download CSV (PII included/excluded per role).

## 4. Screen Inventory

| Screen | Audience | Core content |
|---|---|---|
| Landing | Public | Hero, 3–4 metric stat cards, CTA into Directory & Map, crop legend. |
| Directory | Public | Search bar, filter chips, paginated table/cards of actors (public fields only). |
| Actor Profile | Public / Staff / Admin | Identity, location, crop(s), capacity, type; PII block gated by role. |
| Seed Map | Public | Full-bleed Leaflet map, filter panel, marker popups, result count. |
| Admin Actors | Staff / Admin | Dense data table with row actions (edit; delete = Admin). |
| Actor Form | Staff / Admin | Sectioned, validated create/edit form incl. GPS + PII fields. |
| Import | Admin | Dropzone, column-mapping preview, validation summary, result report. |
| Export | Staff / Admin | Filter builder, role-aware scope notice, download button. |
| Users | Admin | User list, role assignment. |
| Login | All | Cognito hosted/embedded sign-in. |

## 5. Navigation Model

- **Public top nav:** Logo · Home · Directory · Map · (Sign in). Sticky, condenses to a hamburger on mobile.
- **Admin shell:** left sidebar (Actors · Import · Export · Users) + top bar with user menu, role badge, and "View public site". Sidebar collapses on tablet/mobile.
- **Cross-links:** Directory rows link to profiles; profiles link to the map; map popups link to profiles. One consistent breadcrumb pattern in Admin.

## 6. Layout Patterns

- **Container:** max-width content (`max-w-7xl`) centered with responsive gutters; map and admin tables may go full-bleed within their region.
- **Metric cards:** responsive grid (1 → 2 → 4 columns).
- **Directory:** card grid on mobile, table on `md+`.
- **Forms:** single-column on mobile, two-column section grid on `lg+`; grouped fieldsets (Identity · Location/GPS · Commercial · Contact/PII).
- **Map page:** filter rail (left/collapsible) + map canvas; result count and active-filter chips above the map.

## 7. Design Tokens

Tailwind is the token system. Tokens below are the **single source of truth**; implementers must reference these (Tailwind config / CSS variables), never hardcode equivalents. Palette evokes Tanzanian agriculture (earth + growth) while staying neutral and accessible.

```css
/* Brand / semantic colors (define in tailwind.config + CSS vars) */
--color-primary:        #1F4E8C;  /* Royal Blue (official ACCELERATE brand) — primary actions, brand, headings */
--color-primary-hover:  #163A66;  /* darker blue hover/active state */
--color-primary-fg:     #FFFFFF;
--color-primary-soft:    #E8EEF6;  /* ~10% blue over white — icon chips / soft accents */
--color-accent:         #008BDB;  /* blue — secondary CTA / links (large text & UI only) */
--color-highlight:      #29C4A9;  /* teal-green highlight / tint backgrounds */
--color-highlight-soft: #82C0C7;  /* muted teal, soft accent */
--color-bean:           #7A3B2E; /* common bean — crop accent 3 */
--color-bg:             #FFFFFF;  /* clean white page base */
--color-surface:        #FFFFFF;
--color-surface-alt:    #F7F7F7;  /* alternating section background */
--color-fg:             #333333;  /* primary body text */
--color-muted:          #666666;  /* secondary text */
--color-border:         #E2E2E2;
--color-success:        #2F7D32;  /* keep green — success semantics, not brand */
--color-warning:        #C9821B;
--color-danger:         #B3261E;
--color-restricted-bg:  #F3F3F3;  /* PII restricted chip background (neutral) */

/* Crop legend (used by map + chips) */
--crop-sorghum:  #C9821B;
--crop-bean:     #7A3B2E;
--crop-groundnut:#8A8D2B;

/* Typography */
--font-sans: "Inter", system-ui, sans-serif;
--text-xs:12px; --text-sm:14px; --text-base:16px; --text-lg:18px;
--text-xl:20px; --text-2xl:24px; --text-3xl:30px; --text-4xl:36px;
--text-5xl:48px; --text-6xl:60px;

/* Geometry */
--radius-sm:6px; --radius-md:10px; --radius-lg:16px; --radius-full:9999px;
--shadow-sm:0 1px 2px rgba(28,31,26,.06);
--shadow-md:0 4px 12px rgba(28,31,26,.08);

/* Spacing scale: Tailwind default (4px base). */

/* Motion tokens — add to :root alongside the color/geometry tokens above.
   GSAP-side mirrors live in frontend/lib/motion/motion-tokens.ts.
   Reduced-motion preference MUST disable all animation (WCAG 2.3.3 / FR-7). */
--dur-fast:  .3s;   /* short micro-transitions, button/chip hover */
--dur-base:  .6s;   /* standard scroll-reveal and entrance duration */
--dur-slow:  .9s;   /* deliberate, slow entrance (hero headline) */
--ease-out:  cubic-bezier(.2,.7,.2,1);    /* fast-out deceleration — primary reveal ease */
--ease-soft: cubic-bezier(.25,.46,.45,.94); /* gentle deceleration — count-ups, image scale */
```

### Motion tokens

Durations and easings are **token-driven** — no scattered magic numbers in component code (NFR-4).

| Token | Value | Use |
|---|---|---|
| `--dur-fast` | `0.3s` | Micro-transitions: button/chip hover, focus ring |
| `--dur-base` | `0.6s` | Scroll-reveal entrance, section fade-in |
| `--dur-slow` | `0.9s` | Hero headline stagger, deliberate entrances |
| `--ease-out` | `cubic-bezier(.2,.7,.2,1)` | Primary reveal — fast deceleration |
| `--ease-soft` | `cubic-bezier(.25,.46,.45,.94)` | Count-ups, image scale — gentle deceleration |

The GSAP-side mirror (`DURATION`, `EASE`, `REVEAL`, `COUNT_UP` in `frontend/lib/motion/motion-tokens.ts`) uses `power2.out` / `power1.out` as the nearest built-in equivalents; CSS-based micro-transitions use the `--ease-*` custom properties directly (also exposed as Tailwind `transition-timing-out` / `transition-timing-soft`).

**Reduced-motion rule:** All motion gated on `prefers-reduced-motion: no-preference` via `gsap.matchMedia()`. Users with the OS reduced-motion preference receive the final, static state immediately — no animation, no fades, no count-ups (WCAG 2.1 AA §2.3.3, §2.2.2).

> **Accent usage (contrast):** `--color-primary` (Royal Blue `#1F4E8C`) passes WCAG AA on white for normal text/UI (~7:1; AAA for large text). `--color-accent` (blue, ~3.6:1 on white) and `--color-highlight` (teal, ~2.0:1) do **not** meet AA for small body text — use them only for large text, UI accents, buttons, borders, and tint backgrounds. Body text uses `--color-fg`/`--color-muted`.

## 8. Component Inventory

Buttons (primary/secondary/ghost/danger) · Input/Select/Textarea with label + error slot · Search bar · Filter chip + filter panel · Pagination control · Stat/metric card · Actor card · Data table (sortable, row actions) · Profile header · **PII block** (gated reveal / restricted chip) · Map canvas + marker + popup · Crop legend · CSV dropzone · Import result table · Toast/notification · Role badge · Auth form · Empty state · Loading skeleton.

> Prefer **shadcn/ui** primitives styled with the tokens above; build domain components (Actor card, PII block, Map popup, Import result) on top.

## 9. Responsive Behavior

- Breakpoints: Tailwind defaults (`sm 640 · md 768 · lg 1024 · xl 1280`).
- Mobile-first. Directory → cards on mobile, table ≥ `md`. Admin sidebar → off-canvas drawer < `lg`. Map filter rail → bottom sheet / collapsible on mobile. Tables scroll horizontally with sticky first column rather than truncating data.

## 10. Accessibility Expectations

- WCAG 2.1 AA contrast for text and UI controls.
- All interactive elements keyboard reachable with visible focus rings; logical tab order.
- Form fields have associated `<label>`s and `aria-describedby` error messaging; errors announced via live region.
- Map provides a non-map fallback (the directory list is the equivalent accessible view); markers have accessible names.
- Respect `prefers-reduced-motion` for transitions and map fly-to animations.

## 11. Dark Mode Behavior

- v1 ships **light mode only** as default. Tokens are authored so a dark theme can be added later by overriding CSS variables under a `.dark` scope — do not hardcode colors that would block this. (Tracked as a future enhancement, not a v1 requirement.)

## 12. Design Decisions

- **DD-1:** Leaflet (not Mapbox/Google) — zero per-load billing for a public donor-funded platform. Crop colors drive marker styling.
- **DD-2:** PII shows as an explicit "Restricted — sign in to view" chip for unauthorized roles, never as blank space, to make protection legible and intentional.
- **DD-3:** Directory uses cards-on-mobile / table-on-desktop rather than a horizontally scrolling table on small screens.
- **DD-4:** Earth + growth palette tied to the three crops, used consistently across chips, legend, and map markers so crop is recognizable everywhere.
- **DD-5:** Admin uses a persistent left-sidebar shell distinct from the public top-nav, signaling a different mode.

## 13. Open Gaps / Open Questions

- Marker clustering strategy at country zoom for 1,000+ points (Leaflet.markercluster vs. server-side aggregation) — decide before scale testing.
- Whether public map should jitter GPS (ties to PRD OQ-3).
- Final logo/brand assets pending from the program team; current palette is provisional but token-driven.
- Localization (English-only v1; Swahili a likely future need) — keep copy externalizable.
