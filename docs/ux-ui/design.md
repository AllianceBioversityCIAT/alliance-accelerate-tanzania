# System Design — UI/UX Blueprint — ACCELERATE Tanzania Seed Registry

> The visual and interaction system. Not low-level technical implementation (see `docs/trd/trd.md` for that).
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
/profile?id=              Actor profile page (public-safe by default)
/map                      Seed Maps — interactive geospatial view + filters
/register                 Public self-registration form (Identity · Location · Crops & capacity ·
                           Contact · Data protection & consent) + in-flow OTP verification step
/register/submitted       Receipt — reference code (?ref=), save-and-lookup instructions
/register/status          Status lookup by reference + email — status and reviewer note only
/contact                  Public contact form — relays to the current Cognito `admin` group,
                           no sign-in required
/privacy                  Privacy notice — contact submissions + analytics cookies; carries one
                           interactive client island (ConsentChoiceControl) to change a prior
                           consent choice
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

- **Explore (Public):** *(first visit only)* consent banner → accept or reject analytics → Landing → see metrics → Directory (search/filter/paginate) → Actor profile (PII hidden) → optionally jump to Map centered on that actor.
  - The consent banner **overlays** the landing page, it does not gate it: every public route stays reachable while the decision is pending, and the choice persists so the banner is not shown again.
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
| Registration Form | Public | Sectioned form (Identity · Location · Crops & capacity · Contact · Data protection & consent), in-flow versioned consent disclosure, OTP verification step. Server-validated to the same DTO rules as the admin create form. |
| Registration Receipt | Public | The reference code as selectable text (never an image), a copy action, a save-this instruction, a link to status lookup — nothing else, since the submit response carries only the reference. |
| Registration Status | Public | Lookup by reference + email; renders status and the reviewer's note only. Byte-identical result for an unknown reference, a mismatched email, or a lockout. |
| Admin Actors | Staff / Admin | Dense data table with row actions (edit; delete = Admin). |
| Actor Form | Staff / Admin | Sectioned, validated create/edit form incl. GPS + PII fields. |
| Import | Admin | Dropzone, column-mapping preview, validation summary, result report. |
| Export | Staff / Admin | Filter builder, role-aware scope notice, download button. |
| Users | Admin | User list, role assignment. |
| Login | All | Cognito hosted/embedded sign-in. |
| Contact | Public | Name, email, organization, category, subject, message, consent acknowledgment; visually hidden honeypot; values preserved on failed submit; success/error announced via `aria-live`. Relays to the current Cognito `admin` group server-side — no sign-in required, nothing stored. |
| Privacy | Public | Two subjects. **Contact submissions:** what one collects, who receives it, that messages are relayed by email and not stored, and that submitting is not consent to publish anything. **Analytics cookies:** the four signals GA4 collects by default (page views, sessions, geographic origin — country, region *and city*, derived from IP — device/browser), Google as recipient, and a control to change a prior consent choice. States the withdrawal asymmetry explicitly: accepting takes effect immediately, rejecting from the next page load. |

## 5. Navigation Model

- **Public top nav:** Logo · Discovery Map · Dashboard · Directory · About · Contact · Register your organisation · (Sign in). Sticky; the full bar renders from **`lg` (1024px)** and condenses to a hamburger below it — tablet included. `NAV_LINKS` in `frontend/components/shell/Header.tsx` is the single source for both the desktop bar and the mobile drawer — no second, divergent list. "Register your organisation" is visually distinct from "Sign in" — one is a public action, the other serves `Staff`/`Admin`; `AuthSlot` (Sign in) is a sibling outside `NAV_LINKS`.
  - **No "Home" entry, and no brand descriptor**, both removed 2026-08-31. The brand lockup is itself the link to `/` and its `aria-label` names it as home, so a "Home" item duplicated an adjacent control; the "Tanzania Seed Registry" descriptor beside the logo cost ~196px of a row that has only 1216px to spend.
  - **Why `lg` and not `md`.** Measured in a real browser, not estimated: the row's min-content width was **1270px** against a container ceiling of **1216px** — `max-w-7xl` caps usable width, so it never grows with the viewport and there is no screen wide enough. The bar overflowed at **every** width ≥768 (+526px at 768, +278px at 1024, +22px at 1280), spilling into the page gutter above that. After the fix the row needs 935px at 1024 (**41px slack**) and 1015px at 1280+ (**201px slack**). Recorded in `docs/specs/contact/contact-channels/execution.md`, T-10 DC-9 closure.
  - **Adding a nav entry is not free.** The 1216px ceiling is fixed. Before adding one, measure the row's min-content width rather than assuming headroom exists — this bar was already over budget with six entries and nobody noticed.
- **Admin shell:** left sidebar (Actors · Import · Export · Users) + top bar with user menu, role badge, and "View public site". Sidebar collapses on tablet/mobile.
- **Cross-links:** Directory rows link to profiles; profiles link to the map; map popups link to profiles. One consistent breadcrumb pattern in Admin.

## 6. Layout Patterns

- **Container:** max-width content (`max-w-7xl`) centered with responsive gutters; map and admin tables may go full-bleed within their region.
- **Metric cards:** responsive grid (1 → 2 → 4 columns).
- **Directory:** card grid on mobile, table on `md+`.
- **Forms:** single-column on mobile, two-column section grid on `lg+`; grouped fieldsets (Identity · Location/GPS · Commercial · Contact/PII).
- **Map page:** filter rail (left/collapsible) + map canvas; result count and active-filter chips above the map.
- **Consent overlay bar:** until the visitor has chosen, the public shell carries a persistent `fixed bottom-0 inset-x-0` bar above all page content — `z-[1100]`, which clears the map legend's `z-[1000]`. It is the only fixed bottom overlay in the system.
  - **Footer-clearance rule — measure, never estimate.** A fixed bottom overlay must have its **live** height reserved by the shell: `PublicShellFrame` reads the banner's *border-box* height via `ResizeObserver` and applies it as `padding-bottom` on the shell column. Reserving a hardcoded or reasoned-about height is what produced the occlusion defect this rule exists to prevent — the accepted-occlusion set went 1 → 3 → 10 across two corrections, and every correction came from measuring a rendered page, never from re-reading the design. Use `contentRect` and you lose the border.

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
--color-highlight-tint: #E4F5F2;  /* ~10% highlight over white — success/badge tint backgrounds */
--color-bean:           #7A3B2E; /* common bean — crop accent 3 */
--color-bg:             #FBF9F6;  /* warm sand page canvas — was pure white (DD-2, app-visual-refresh) */
--color-surface:        #FFFFFF;  /* card/panel — unchanged; lifts off the warmer canvas */
--color-surface-alt:    #F4F0EA;  /* alternating section background, warm */
--color-fg:             #2A2724;  /* primary body text, warm ink — also the footer's dark surface */
--color-backdrop:       rgba(42, 39, 36, 0.40);  /* modal/backdrop wash — 40% of --color-fg */
--color-muted:          #6B6459;  /* secondary text, warm */
--color-border:         #E6DFD5;  /* warm hairline */
--color-success:        #2A6E2D;  /* keep green — success semantics, not brand; AA on its tints */
--color-warning:        #8F5E10;  /* AA at 12px; intentionally decoupled from --crop-sorghum — see below */
--color-danger:         #B3261E;
--color-danger-soft:    #F5E3E2;  /* ~10% danger over white — error banners / badge backgrounds */
--color-restricted-bg:  #F0EBE4;  /* PII restricted chip background, warm neutral */

/* Crop legend (used by map + chips) — unaffected by --color-warning's move, see below */
--crop-sorghum:         #C9821B;
--crop-bean:            #7A3B2E;
--crop-groundnut:       #8A8D2B;
--crop-sorghum-soft:    #F9F0E4;  /* ~12% over white — CropImage panel backgrounds */
--crop-bean-soft:       #EFE7E6;
--crop-groundnut-soft:  #F1F1E6;

/* Typography */
--font-sans: "Inter", system-ui, sans-serif;
--font-display: "Montserrat", system-ui, sans-serif; /* brand display font — Montserrat ExtraBold titles / SemiBold tagline; Inter stays body/UI */
--text-xs:12px; --text-sm:14px; --text-base:16px; --text-lg:18px;
--text-xl:20px; --text-2xl:24px; --text-3xl:30px; --text-4xl:36px;
--text-5xl:48px; --text-6xl:60px;

/* Geometry */
--radius-sm:6px; --radius-md:10px; --radius-lg:16px; --radius-full:9999px;
--shadow-xs: 0 1px 2px   rgba(61,47,32,.12);  /* warm elevation ladder — chips, inputs at rest */
--shadow-sm: 0 2px 4px   rgba(61,47,32,.07);  /* cards, stat tiles */
--shadow-md: 0 6px 16px  rgba(61,47,32,.10);  /* raised cards, table containers */
--shadow-lg: 0 16px 40px rgba(61,47,32,.14);  /* dialogs, popovers, map rail */

/* Atmospheric gradients — canvas-rooted, token-driven so a future .dark scope
   inherits them automatically. */
--gradient-hero: linear-gradient(168deg, var(--color-surface-alt) 0%, var(--color-bg) 58%, var(--color-surface) 100%);
--gradient-band: linear-gradient(180deg, var(--color-bg) 0%, var(--color-surface-alt) 100%);

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

> **Accent usage (contrast):** `--color-primary` (Royal Blue `#1F4E8C`) passes WCAG AA on white for normal text/UI (~7:1; AAA for large text). `--color-accent` (blue, ~3.6:1 on white) and `--color-highlight` (teal, ~2.0:1) do **not** meet AA for small body text — use them only for large text, UI accents, buttons, borders, and tint backgrounds. Body text uses `--color-fg`/`--color-muted`. `--color-warning` (`#8F5E10`) **is** small-text-safe — it clears 4.5:1 on `surface`, `bg`, `surface-alt` and its own 10%-alpha chip.
>
> **Marker-vs-ink threshold split (`app-visual-refresh`):** `--color-warning` and `--crop-sorghum` used to share `#C9821B`, under two incompatible thresholds — small-text ink needs WCAG 1.4.3's 4.5:1, while a map marker/legend swatch is a non-text fill under WCAG 1.4.11's 3:1 floor. They are now **two independent tokens**, intentionally distinct despite the shared history — do not re-merge them in a future cleanup.
>
> **Hero scrim vs. `--gradient-hero` are different mechanisms.** `Hero.tsx`'s `from-fg/70` scrim sits over a photograph and exists purely for text legibility; `--gradient-hero`/`--gradient-band` are atmospheric canvas washes with no text over them. The app intentionally carries both — one is not a replacement for the other.
>
> **Dark-scope shadow alphas (open, OQ-4):** the elevation ladder's alpha steps (`.12`/`.07`/`.10`/`.14`) are calibrated against the current light, warm canvas. A future `.dark` scope will likely need higher alphas and/or a lighter shadow base — a translucent dark shadow barely registers against an already-dark background — so the ladder as authored here is not expected to carry over unchanged.
>
> **Ladder order is geometric, not by alpha:** the four rungs are ordered by offset/blur (`xs` 1px/2px → `sm` 2px/4px → `md` 6px/16px → `lg` 16px/40px); `--shadow-xs` deliberately carries a higher alpha (`.12`) than `--shadow-sm` (`.07`) because it must register across a much smaller 2px footprint, and it remains the geometrically lightest rung.

## 8. Component Inventory

Buttons (primary/secondary/ghost/danger) · Input/Select/Textarea with label + error slot · Search bar · Filter chip + filter panel · Pagination control · Stat/metric card · Actor card · Data table (sortable, row actions) · Profile header · **PII block** (gated reveal / restricted chip) · Map canvas + marker + popup · Crop legend · CSV dropzone · Import result table · Toast/notification · Role badge · Auth form · Empty state · Loading skeleton · **Consent banner** (the fixed bottom overlay bar of §6).

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
