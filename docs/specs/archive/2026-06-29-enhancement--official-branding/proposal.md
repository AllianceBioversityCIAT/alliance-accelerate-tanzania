# Proposal — Adopt the official ACCELERATE brand (Royal Blue + real logo)

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `enhancement/official-branding` |
| Status | Draft proposal — awaiting approval |
| Author / Date | AI agent (Claude) with JuanCode — 2026-06-29 |
| Type | Cross-cutting visual rebrand (token + assets) |
| Source assets | `~/Downloads/Brief branding guidelines for ACCELERATE Project.pdf`; 4 official logo files (`Accelerate Logo 1–4`); palette table (Royal Blue `#1F4E8C`, Charcoal `#4A4A4A`, Black, White) |
| Constitutional refs | `docs/system-design/design.md §7` (tokens — will change), root `CLAUDE.md` (token discipline) |

## 2. Intent

Replace the **placeholder maroon** identity used across the site with the **official ACCELERATE brand**: the real logo lockups and the **Royal Blue `#1F4E8C`** primary colour. The site should look like the funded project's actual brand, not a stand-in.

## 3. Problem / Current Behavior

- The primary brand token is **maroon `#800000`** (a placeholder chosen at constitution time). It drives every primary surface — header wordmark, buttons, links, the dashboard KPI hero tile, chart primary colour, map "seed company" markers, focus rings, the favicon.
- The header "brand" is a **CSS circle "A" + text wordmark** ("ACCELERATE" / "Tanzania Seed Registry"), not the real logo.
- The **favicon** is a maroon Tanzania silhouette.
- We now have the **official assets**: 4 logo variants (colour, white-reverse, two black-mono) and the brand palette. The official wordmark is Royal Blue with an olive/gold crop-trio icon (sorghum head · bean · groundnut) — colours that already echo our crop tokens.

## 4. Proposed Outcome

The site adopts the official brand, primarily via the **design-token layer** (so most of the UI updates automatically):

1. **Primary colour → Royal Blue.** Repoint `--color-primary` (+ `-hover`, `-soft`) from maroon to the brand blue. Every token-driven surface (buttons, links, header/active states, KPI hero, chart primary, focus rings, seed-company markers) flips to blue with no per-component edits.
2. **Real logo in the header** — the colour lockup (linked to home), replacing the CSS "A" + text wordmark, with an accessible name and a small "Seed Registry" descriptor for platform context.
3. **White-reverse logo in the footer** (on the dark band), replacing the text wordmark there.
4. **Favicon / app icons** regenerated on-brand (brand icon mark or a Royal-Blue Tanzania mark — see OQ-1).
5. **Constitutional update:** `system-design/design.md §7` token table updated to the official palette so the baseline reflects reality.

The maroon disappears site-wide (home, map, directory, dashboard, about, login, profile) because they all consume the token.

## 5. Scope

- Swap `--color-primary` / `--color-primary-hover` / `--color-primary-soft` in `frontend/app/globals.css` to the brand blue ramp; keep `--color-primary-fg: #FFFFFF`.
- Prepare web logo assets under `frontend/public/brand/` (colour + transparent white-reverse, trimmed/optimized) from the provided files.
- Header: replace the CSS mark + wordmark with the colour logo lockup.
- Footer: use the white-reverse logo.
- Regenerate `app/icon.svg` / `icon.png` / `apple-icon.png` / `favicon.ico` on-brand.
- Update `system-design/design.md §7` (and any maroon references in PRD/detailed-design) to the official palette.
- Visual QA pass across all routes + AA contrast check for blue-on-white / white-on-blue.

## 6. Non-Goals

- **No layout/structure changes** — this is colour + logo only; no redesign of components, flows, or copy.
- **No change to crop colours** (`--crop-sorghum/bean/groundnut`) — they represent the three crops and match the logo icon; they stay.
- **No new partner/funder logos** — Alliance, PABRA, Gates, TARI, TOSCI are already in the footer/partners; CIMMYT remains a text fallback. (The PDF's "equal weighting" guidance is already met; minor footer tidy only if needed.)
- **No typography swap** — the PDF defers fonts to the lead org and gives no web font; we keep the current font stack unless a specific brand font is supplied later.
- **No dark-mode work** beyond keeping the existing tokens coherent.

## 7. Affected Users, Systems, And Specs

- **Users:** all visitors — purely visual; behaviour unchanged.
- **Frontend:** `app/globals.css` (token swap), `components/shell/Header.tsx` + `Footer.tsx` (logo), `app/icon.*`/`favicon.ico`, new `public/brand/*`. Indirectly every page (token cascade).
- **Tokens-via-name only:** `tailwind.config.ts` unchanged (token names stable); `--color-primary-soft`, chart `chart-tokens.ts` (uses `var(--color-primary)` → auto-blue), `roles.ts` (`seed_company → primary`), motion unaffected.
- **Constitutional:** `system-design/design.md §7` token table; possibly `prd.md`/`detailed-design.md` colour mentions.
- **Specs:** no functional spec conflicts; archived dashboard/map specs unaffected (they're token-driven).

## 8. Requirement Delta Preview

### ADDED
- Official ACCELERATE logo lockups rendered in the header (colour) and footer (white-reverse), with accessible names.
- On-brand favicon / app icons.

### MODIFIED
- Primary brand colour: maroon `#800000` → Royal Blue `#1F4E8C` (+ matching hover/soft), applied via the existing tokens.
- `design.md §7` token table reflects the official palette.

### REMOVED
- The placeholder CSS "A" circle + text wordmark in the header.
- Maroon as the brand colour anywhere in the product.

## 9. Approach Options

### Option A — Token swap + real logo assets *(recommended)*
Repoint the primary token ramp to Royal Blue and drop in the official logo lockups + favicon; update `design.md §7`.
- **Pros:** the token-driven architecture means ~all of the UI rebrands automatically; smallest, safest diff; high brand fidelity; fully reversible (revert tokens/assets).
- **Cons:** must regenerate raster favicon/app icons; must prep a transparent white logo for the footer; visual QA across routes.

### Option B — Logo only, keep maroon
Add the logo but leave the maroon UI.
- **Rejected:** a Royal-Blue logo on a maroon UI is visually incoherent — defeats the point.

### Option C — Full visual redesign around the new palette
Re-tune accent/highlight/surfaces, typography, spacing for a bespoke blue system.
- **Rejected (for now):** out of scope; the brief defers type/secondary palette to the lead org. Revisit only if they supply a fuller kit.

## 10. Recommended Approach

**Option A.** The codebase was built tokens-only precisely so a brand change is a token swap plus asset drop-in — not a component rewrite. We change `--color-primary*`, add the logo lockups + favicon, update the constitutional token table, and QA. Accent (`#008BDB`) is retained as a *secondary/data-viz* hue (charts need distinct categoricals); only the **primary brand** moves to Royal Blue. Crop colours stay.

Proposed blue ramp (to confirm in design): `--color-primary: #1F4E8C`, `--color-primary-hover: #163A66` (darker), `--color-primary-soft: #E8EEF6` (~10% over white), `--color-primary-fg: #FFFFFF`.

## 11. Risks, Dependencies, And Open Questions

- **OQ-1 (favicon):** use the **brand crop-trio icon** as the app icon, or a **Royal-Blue Tanzania** silhouette? The crop-trio is on-brand but detailed at 16px; the Tanzania mark is crisper small. *Recommend: Royal-Blue brand icon mark if a clean square crop fits; else recoloured Tanzania.*
- **OQ-2 (accent reconciliation):** keep `#008BDB` accent (two blues) or retire/retune it? *Recommend keep for charts; ensure it's visually distinct from primary in data viz.*
- **Asset prep:** provided logos are raster (JPG/PNG); the white-reverse is on a black background — needs a **transparent** white PNG for the footer. SVG would be ideal but isn't supplied (acceptable to ship optimized PNGs; request SVG later).
- **Contrast (AA):** Royal Blue `#1F4E8C` on white ≈ 7:1 (passes AA for text); white on Royal Blue passes — verify focus rings + hover.
- **Charcoal `#4A4A4A`:** brand's grayscale-icon colour; our body text is `#333333` / muted `#666666` — no change needed unless we want to align `fg` to charcoal (minor; out of scope).
- **CloudFront caching:** favicon/logo swaps need cache invalidation (deploy script already invalidates `/*`); browsers cache favicons aggressively (verify in incognito).
- **Constitutional edit:** changing `design.md §7` is a baseline change — intentional and stakeholder-driven.

## 12. Success Criteria

- No maroon anywhere in the product; primary surfaces render Royal Blue `#1F4E8C` across all routes.
- The official ACCELERATE logo appears in the header (colour) and footer (white-reverse) with correct accessible names; favicon is on-brand.
- All blue-on-white / white-on-blue text and controls pass WCAG 2.1 AA contrast.
- `design.md §7` documents the official palette; build green; full test suite green; no hardcoded hex introduced.
- Visual QA confirms home, map, directory, dashboard, about, login, profile all read on-brand.

## 13. Next Step

```text
/sdd-specify enhancement/official-branding
```
