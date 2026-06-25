# Proposal — About Page & Home Content Expansion

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `enhancement/about-and-home-content` |
| Status | **Draft — awaiting approval** |
| Author | Leader (SDD triad) |
| Date | 2026-06-25 |
| Depth (anticipated) | **Standard** |
| Source inputs | `docs/reference/accelerate-web-copy-brief.md`, `docs/reference/accelerate-project-source-data.md`, brand assets (Alliance, PABRA, Gates, TARI, TOSCI, CIMMYT logos; ACCELERATE field photograph) |
| Related / prior specs | `archive/2026-06-24-…-home-page`, `archive/2026-…-home imagery`, `archive/2026-06-25-enhancement--portal-animations` |

---

## 2. Intent

Turn the home page from a single-screen registry entry point into a credible institutional story, and add a dedicated **About the project** page — using the now-available, verified project copy and partner branding. Today a visitor cannot tell *what ACCELERATE is*, *who funds and runs it*, or *how the demand-led model works* without leaving the site.

---

## 3. Problem / Current Behavior

- The home page is `Hero → MetricsBand → CropCoverage`. It explains the registry tool but not the project behind it.
- There is **no `/about` route** — the project's mission, the 3% problem, the demand-pull model, crops/varieties, and the funder/partner coalition are nowhere on the site.
- The only branding on the site is the PABRA chip in the footer (`public/pabra-30-logo.png`). The lead implementer (Alliance of Bioversity & CIAT), the funder (Bill & Melinda Gates Foundation), and research partners (TARI, TOSCI, CIMMYT) are unrepresented — a credibility gap for a donor-funded public platform.
- We now have a stronger, on-brand field photograph (ACCELERATE staff in branded polos interviewing a market trader) that better tells the demand-led story than the current generic harvest photo.

---

## 4. Proposed Outcome

1. A new **`/about` static page** (`app/(public)/about/page.tsx`) carrying the full §3 copy: hero, the challenge, demand-led approach + 3 pillars, crops & value chains, partners, optional "model in action" case studies (attributed 🟡), "about this registry", and credits.
2. Four new **home sections** in the §2.0 order: `AboutStrip` → `HowItWorks` → (existing `CropCoverage`) → `PartnersStrip` → `ClosingCTA`.
3. **`/about` added to header + footer navigation.**
4. A **partner/funder logo treatment** (PartnersStrip + footer) using the supplied brand assets.
5. The new **field photograph** placed where it tells the strongest story (About hero — see Open Questions).
6. All new copy is paste-ready from the brief; **live numbers stay on `useMetrics`**; 🟡 partner case-study figures appear only on `/about` with attribution.

---

## 5. Scope

**In scope**
- New `/about` route (static export, reuses `PublicShell`, exports `metadata`).
- New home components: `AboutStrip`, `HowItWorks`, `PartnersStrip`, `ClosingCTA` in `components/home/`.
- Nav additions (header + footer) for `/about`.
- Brand assets added under `public/` (logos + field photo), optimized; informative `alt`.
- Optional typed content files: `lib/content/partners.ts`, `lib/content/pillars.ts`; optional variety sub-labels enriching `crops.ts`.
- Reuse of existing motion (`useReveal` / `useCountUp`) and §7 design tokens; reduced-motion gates preserved.
- A11y: one `<h1>` per page, `aria-labelledby` per section, AA contrast.
- Unit/a11y tests for new components consistent with the existing Jest/RTL + jest-axe harness.

**Out of scope (this change)**
- Backend / API / data-model changes.
- New actor records or a varieties reference table (data work — separate spec).
- i18n / ES/FR translations.
- Map or directory feature changes.

---

## 6. Non-Goals

- No SSR/ISR/route handlers — static export only.
- No hardcoded registry counts; no presenting 🟡 case-study figures as live metrics.
- No new design tokens or raw hex — strictly §7 tokens.
- Not a visual redesign of Hero/MetricsBand/CropCoverage beyond optional eyebrow/CTA refinement.

---

## 7. Affected Users, Systems, And Specs

| Area | Impact |
|---|---|
| Public visitors / donors / institutions | New project context + About page; stronger credibility. |
| `app/(public)/page.tsx` | Recomposed with 4 new sections. |
| `app/(public)/about/page.tsx` | **New** route. |
| `components/shell/Header.tsx`, `Footer.tsx` | New `/about` nav link; expanded partner branding in footer. |
| `components/home/*` | 4 new components. |
| `lib/content/*` | New `partners.ts`/`pillars.ts`; optional `crops.ts` enrichment. |
| `public/` | New logo + photo assets. |
| Motion layer (`lib/motion/*`) | Reused, not modified. |
| Constitutional docs | `system-design/design.md §7` tokens; copy brief is the content source of truth. |

---

## 8. Requirement Delta Preview

### ADDED Requirements
- The site SHALL provide a static `/about` page describing the ACCELERATE project (mission, the challenge, demand-led approach, crops/varieties, partners, registry purpose) using the approved copy.
- The home page SHALL present About, How-it-works (3 pillars), Partners, and a Closing CTA section in the defined order.
- The site SHALL display the funder and partner coalition via an accessible logo/label treatment on the home Partners strip and in the footer.
- Header and footer navigation SHALL include an `About` link to `/about`.
- New imagery SHALL carry informative `alt` text and meet AA contrast for overlaid text.

### MODIFIED Requirements
- Home page composition (currently Hero/MetricsBand/CropCoverage) is extended; existing sections are kept (with optional Hero eyebrow/CTA refinement).
- Footer is extended from a single PABRA chip to the full partner/funder coalition.

### REMOVED Requirements
- None. (Hero harvest photo may be retained or relocated depending on the field-photo placement decision — OQ-2.)

---

## 9. Approach Options

**Option A — Full brief in one spec (recommended).**
Build the `/about` page + all four home sections + nav + branding as one coherent "project story" change. Pro: ships the narrative as a complete unit; the copy brief is already paste-ready so design risk is low. Con: larger spec (~8–10 tasks).

**Option B — Split: (B1) About page + nav, then (B2) home sections + branding.**
Two smaller specs. Pro: faster first merge, smaller reviews. Con: home stays half-told between merges; duplicates shared setup (content files, assets) across two cycles.

**Option C — Home sections only, defer `/about`.**
Pro: smallest. Con: the four home sections (AboutStrip "Read the full story →", ClosingCTA "About the project →") all link to `/about`, so deferring it ships dead links — not viable without rewording.

### Logo-treatment sub-options (for PartnersStrip + footer)
- **L1 — Grayscale logo wall (recommended):** real logos (Alliance, PABRA, Gates) + clean individual marks for TARI/TOSCI/CIMMYT, uniform grayscale → color-on-hover. Most credible for a donor platform; needs clean per-logo assets (the supplied combined strip should be sliced into clean transparent PNGs, or sourced individually).
- **L2 — Logos for the three we have, text labels for the rest:** mixed treatment; lower asset effort, slightly less polished.
- **L3 — Text labels only:** simplest/most accessible; weakest visually.

---

## 10. Recommended Approach

**Option A + Logo treatment L1.** The copy is paste-ready and the work is content/presentation only (no backend, no data), so a single coherent spec is the smallest *complete* path — and it avoids the dead-link problem of Option C. For logos, a uniform grayscale logo wall reads as institutionally credible; we slice/source clean per-partner assets rather than embedding the combined strip image.

Anticipated depth: **Standard** (full requirements + scenarios + design + ~8–10 tasks). Motion and tokens are reused, not invented, which keeps risk low.

---

## 11. Risks, Dependencies, And Open Questions

- **OQ-1 (logo assets):** Confirm logo treatment L1 vs L2 vs L3. L1 needs clean transparent per-partner logos for TARI, TOSCI, CIMMYT (the supplied image #8 is a combined strip; CIMMYT mark is partially cropped). May require sourcing official marks or accepting text for those three.
- **OQ-2 (field photo placement):** Use the new ACCELERATE field photograph as the **About-page hero** (recommended — keeps the registry Hero's harvest LCP image untouched), **or** swap it into the home Hero, **or** use it in the "model in action" block.
- **OQ-3 (case-study block):** Include §3.6 "model in action" partner case studies (Ikuwo, Kibaigwa, Ntemisambo, Bora) on `/about`? Real but 🟡 secondary — include with attribution, or omit for a leaner page.
- **OQ-4 (Hero refinement):** Apply the optional eyebrow/CTA tweak (add `Learn about ACCELERATE →`) or leave Hero copy as-is.
- **Risk — logo licensing/usage:** partner/funder logos carry brand-usage rules; for a public donor platform this is normally fine but worth a nod.
- **Dependency:** `docs/reference/` is currently **untracked** in git — it should be committed (or the spec references stay external). Brand-asset files must be added to `public/`.
- **Process note:** repo is on `feature/portal-animations` with **PR #9 open/unmerged**; this spec should be specified/executed on its own branch off updated `main` after PR #9 lands.

---

## 12. Success Criteria

- `/about` renders all §3 sections; `<title>`/meta set per §5; one `<h1>`; jest-axe clean.
- Home shows the 4 new sections in §2.0 order; existing live MetricsBand/CropCoverage unchanged in behavior.
- `About` link present and working in header + footer; no dead links.
- Partner/funder branding visible on home + footer with accessible names.
- No raw hex; tokens only. No SSR. Reduced-motion respected. Full test suite + lint + static export green.
- No live registry number is hardcoded; 🟡 figures appear only on `/about` with attribution.

---

## 13. Next Step

```text
/sdd-specify enhancement/about-and-home-content
```
