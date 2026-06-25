# ACCELERATE Tanzania — Web Copy Brief

> **For:** Claude Code (and any agent) implementing home-page enhancements and a new
> **About the Project** section.
> **What this is:** Ready-to-use, on-brand copy derived from the project scraping, mapped to the
> real app structure (routes, components, design tokens). Paste the strings; don't invent figures.
> **Companion data:** raw facts live in [`accelerate-project-source-data.md`](./accelerate-project-source-data.md).
> **Created:** 2026-06-25.

---

## 0. How to use this document

1. **Home page** lives at `frontend/app/(public)/page.tsx`, composed of `Hero`, `MetricsBand`,
   `CropCoverage` (in `frontend/components/home/`). §2 keeps those and adds **4 new sections**.
2. **About page** is a **new static route** `frontend/app/(public)/about/page.tsx` (static export —
   no SSR/route handlers). Full long-form copy in §3.
3. **Voice & tokens:** follow §1. All colour/spacing via design tokens (`design.md §7`) — never raw
   hex. Crop accents: `crop-sorghum`, `crop-bean`, `crop-groundnut`. Brand: `primary` (maroon).
4. **Verify-before-publish:** facts tagged 🟢 are **project-level** (safe). Facts tagged 🟡 come from
   **partner case studies** (real but secondary) — keep them on the About page with attribution, and
   avoid presenting them as live registry metrics. Live numbers stay driven by `useMetrics`.
5. **Add `/about` to the header nav** (`components/shell/Header.tsx`) and the footer.

---

## 1. Voice & tone (match existing copy)

- **Authoritative, institutional, plain.** No hype, no exclamation marks. Mirrors current Hero:
  *"The connective tissue of Tanzania's seed system."*
- **Audience:** institutions, researchers, seed companies, NGOs, government, donors — not consumers.
- **Sentence shape:** one clear claim per sentence; lead with the value, then the mechanism.
- **Terminology:** "seed-system actors", "value chains", "varietal turnover", "demand-pull / demand-led",
  "open-pollinated varieties (OPVs)", "Quality Declared Seed (QDS)", "early-generation seed (EGS)".
- **Em dash** `—` and `'` curly apostrophe as in existing components (`&rsquo;`, `&mdash;`).

---

## 2. HOME PAGE

### 2.0 Section order (proposed)

```
Hero (keep, light refresh)
MetricsBand (keep — live data)
About strip  ← NEW  "What is ACCELERATE"
HowItWorks   ← NEW  demand-pull model, 3 pillars
CropCoverage (keep)
PartnersStrip ← NEW  funder + research partners
ClosingCTA    ← NEW  conversion band → /about & /map
```

---

### 2.1 Hero — keep, optional refinement
Current copy is strong. **Optional** eyebrow/subhead swap to foreground the project name:

- **Eyebrow:** `Institutional seed-system intelligence` *(keep)* — or → `ACCELERATE · Tanzania seed systems`
- **H1 (keep):** `The connective tissue of Tanzania's seed system.`
- **Sub (keep):** current paragraph.
- CTAs (keep): `Explore the Map` → `/map`, `Browse Directory` → `/directory`.

> If the eyebrow changes to name the project, add the new About CTA as a tertiary text link:
> `Learn about ACCELERATE →` → `/about`.

---

### 2.2 MetricsBand — keep (live data)
No copy change. Labels stay: `Actors mapped`, `Major crops`, `Regions covered`, `Actor types`.

---

### 2.3 NEW — About strip ("What is ACCELERATE")
**Component:** `components/home/AboutStrip.tsx` · **Surface:** `bg-surface-alt` (alternating section).

- **Eyebrow:** `About the project`
- **H2:** `Accelerating variety turnover for Tanzania's farmers`
- **Body:**
  > ACCELERATE — *Accelerated Variety Turnover for Open-Pollinated Crops in Tanzania* — is a
  > four-year initiative (2023–2026) led by the Alliance of Bioversity International & CIAT and the
  > Pan-Africa Bean Research Alliance (PABRA), funded by the Bill & Melinda Gates Foundation. It
  > builds a scalable, demand-led model that helps new, higher-yielding seed varieties reach the
  > farmers who need them — faster.
- **Supporting line (the problem, 🟢):**
  > Today only about **3% of farmers' planting needs** are met by the formal seed sector. Most
  > farmers still plant old, low-yielding varieties that are vulnerable to climate stress. ACCELERATE
  > closes that gap by connecting seed producers with the traders, processors, and institutions that
  > actually drive demand.
- **CTA:** `Read the full story` → `/about` (secondary Button).

---

### 2.4 NEW — How it works (demand-pull model)
**Component:** `components/home/HowItWorks.tsx` · 3-card grid (`md:grid-cols-3`), reuse the
`CropCoverage`/`useReveal` stagger pattern.

- **Eyebrow:** `The model`
- **H2:** `A demand-led seed system`
- **Intro:**
  > Instead of pushing seed at farmers, ACCELERATE starts with demand. By linking formal,
  > semi-formal, and informal seed sectors to the traders and buyers who already move grain, quality
  > seed gets pulled through the value chain.

**Three pillars** (reframed from the project's three hypotheses):

| # | Card title | Body |
|---|---|---|
| 1 | **Information flow** | Better information to and from large traders, grain producers, and seed producers builds real demand for quality seed. |
| 2 | **Marketplace traders** | Engaging the traders who buy and sell grain every day turns the marketplace into an engine for adoption. |
| 3 | **Institutional buyers** | When institutional buyers know about — and can access — improved varieties, turnover speeds up and farmer incomes and nutrition rise. |

- Accent each card icon with `primary`; keep cards on `bg-surface` with `border-border`.

---

### 2.5 CropCoverage — keep
Live per-crop counts. Existing crop descriptions in `lib/content/crops.ts` are good. **Optional**
enrichment: append a representative variety line per crop (see §4.2) as a muted sub-label.

---

### 2.6 NEW — Partners strip
**Component:** `components/home/PartnersStrip.tsx` · centered, `bg-surface`.

- **Eyebrow:** `Partners`
- **H2:** `Built by a coalition of research and seed-system institutions`
- **Body:**
  > ACCELERATE is delivered by the Alliance of Bioversity International & CIAT / PABRA with the
  > Tanzania Agricultural Research Institute (TARI), the Tanzania Official Seed Certification
  > Institute (TOSCI), and CIMMYT — funded by the Bill & Melinda Gates Foundation.
- **Partner labels** (text or logos): `Alliance of Bioversity International & CIAT` · `PABRA` ·
  `TARI` · `TOSCI` · `CIMMYT` · `Bill & Melinda Gates Foundation`.

---

### 2.7 NEW — Closing CTA band
**Component:** `components/home/ClosingCTA.tsx` · dark surface `bg-fg text-bg` (mirrors `MetricsBand`/`Footer`).

- **H2:** `Find the right seed-system actors, faster.`
- **Body:** `Explore 1,000+ verified actors across sorghum, common bean, and groundnut value chains — or learn how the ACCELERATE model works.`
- **CTAs:** `Explore the Map` → `/map` (primary) · `About the project` → `/about` (secondary on dark).

---

## 3. ABOUT THE PROJECT — full page copy

**Route:** `frontend/app/(public)/about/page.tsx` (static). **Layout:** reuse `PublicShell`.
Suggested section components or inline blocks below. All copy below is paste-ready.

### 3.1 Page hero
- **Eyebrow:** `About the project`
- **H1:** `ACCELERATE: accelerating variety turnover in Tanzania`
- **Lede:**
  > *Accelerated Variety Turnover for Open-Pollinated Crops in Tanzania* (ACCELERATE) is a four-year
  > project (2023–2026) building a scalable, demand-led model that speeds the adoption of new,
  > higher-yielding crop varieties across Tanzania's sorghum, common bean, and groundnut value chains.

### 3.2 The challenge
- **H2:** `The challenge`
- **Body:**
  > Across Tanzania, most smallholder farmers still grow old, low-yielding varieties that are
  > increasingly vulnerable to drought and climate stress. Adoption of improved open-pollinated
  > varieties (OPVs) remains low — held back by a lack of product information, limited promotion,
  > poor access to early-generation seed, thin data to guide decisions, and a weak seed supply system.
  >
  > The formal seed sector meets only about **3% of farmers' planting requirements**. The rest comes
  > from informal channels, which keeps better genetics from reaching the field. (🟢)

### 3.3 Our approach
- **H2:** `A demand-led approach`
- **Body:**
  > ACCELERATE flips the usual model. Rather than pushing seed toward farmers, it starts with the
  > sources of demand — the grain traders, aggregators, processors, and institutional buyers who
  > already move crops through the market — and links them to formal, semi-formal, and informal seed
  > producers. When demand pulls quality seed through the value chain, varietal turnover accelerates
  > on its own.
- **Three pillars** (same as §2.4): Information flow · Marketplace traders · Institutional buyers.

### 3.4 Crops & value chains
- **H2:** `Crops and value chains`
- **Intro:** `ACCELERATE focuses on three priority value chains, each with newly released, higher-yielding varieties:`

  **Sorghum** — A drought-tolerant staple central to food security. New varieties include
  **TARI SOR 1** (red) and **TARI SOR 2** (white), yielding 3–4 t/ha with Striga and bird
  resistance. (🟡)

  **Common bean** — Tanzania's most widely traded legume, linking smallholders to cooperatives,
  offtakers, and institutional buyers. Improved varieties include the **TARI Bean** series,
  **Uyole 16/18**, **Selian 13**, and **Calima Uyole**. (🟡)

  **Groundnut** — A high-value oil crop connecting seed companies, processors, and exporters.
  New varieties include **Naliendele 2016**, **Narinut 2015**, **Tanzanut 2016**, and
  **TARIKA 1 & 2**. (🟡)

### 3.5 Partners
- **H2:** `Partners`
- **Body:**
  > ACCELERATE is led by the **Alliance of Bioversity International & CIAT** and the **Pan-Africa
  > Bean Research Alliance (PABRA)**, with the **Tanzania Agricultural Research Institute (TARI)**,
  > the **Tanzania Official Seed Certification Institute (TOSCI)**, and the **International Maize and
  > Wheat Improvement Center (CIMMYT)**. The project is funded by the **Bill & Melinda Gates
  > Foundation**. (🟢)

### 3.6 Impact in the field (optional, attributed)
> Use as a "Partners in action" / case-study block. All figures 🟡 — attribute to project partners.
- **H2:** `The model in action`
- **Intro:** `Across Tanzania, ACCELERATE works through real seed-system enterprises:`

  - **Ikuwo General Enterprises** (Rukwa) grew its bean trade from 1,000 tonnes (2017) to 5,000
    tonnes (2022), now reaching about **12,000 farmers** and exporting to five neighbouring countries.
  - **Kibaigwa Flour Supplies** (Dodoma) supports **7,850 farmers** with contract farming for
    sorghum and groundnut, providing seed on credit and guaranteed purchase.
  - **Ntemisambo Company** (Katavi) scaled groundnut sourcing from 15 to 113.5 tonnes in a single
    season while building dedicated seed-multiplication capacity.
  - **Bora Food Company** (Geita) trains farmers in Quality Declared Seed production and supplies
    bio-fortified varieties into school nutrition programs.

### 3.7 This platform
- **H2:** `About this registry`
- **Body:**
  > This platform is the public registry behind ACCELERATE — a single, trusted map of the seed
  > companies, cooperatives, offtakers, research institutes, and traders that make up Tanzania's
  > seed system. It helps institutions find the right actors quickly, understand who operates where,
  > and strengthen the value chains that move improved varieties from lab to field.
- **CTAs:** `Explore the Map` → `/map` · `Browse the Directory` → `/directory`.

### 3.8 Credits / sources (small print)
> `Project information adapted from the Alliance of Bioversity International & CIAT and PABRA.
> Field figures are drawn from published partner case studies. Learn more at the` [Alliance project page](https://alliancebioversityciat.org/projects/accelerate).

---

## 4. Reusable content data (optional, for `lib/content/`)

> If you want these structured rather than inline, add typed content files mirroring `crops.ts`.

### 4.1 Partners — `lib/content/partners.ts`
| key | name | role | url |
|---|---|---|---|
| alliance | Alliance of Bioversity International & CIAT | Lead implementer | https://alliancebioversityciat.org |
| pabra | Pan-Africa Bean Research Alliance (PABRA) | Co-lead, bean value chain | https://www.pabra-africa.org |
| tari | Tanzania Agricultural Research Institute (TARI) | Variety release & early-generation seed | https://www.tari.go.tz |
| tosci | Tanzania Official Seed Certification Institute (TOSCI) | Seed certification & QDS | https://www.tosci.go.tz |
| cimmyt | CIMMYT | Market intelligence, sorghum/groundnut | https://www.cimmyt.org |
| bmgf | Bill & Melinda Gates Foundation | Funder | https://www.gatesfoundation.org |

### 4.2 Representative varieties (for crop sub-labels) — extends `crops.ts`
| crop slug | varieties (display) |
|---|---|
| sorghum | TARI SOR 1, TARI SOR 2 |
| common_bean | TARI Bean 2–6, Uyole 16/18, Selian 13, Calima Uyole |
| groundnut | Naliendele 2016, Narinut 2015, Tanzanut 2016, TARIKA 1 & 2 |

### 4.3 The three pillars — `lib/content/pillars.ts`
```
[
  { title: 'Information flow',     body: 'Better information to and from large traders, grain producers, and seed producers builds real demand for quality seed.' },
  { title: 'Marketplace traders',  body: 'Engaging the traders who buy and sell grain every day turns the marketplace into an engine for adoption.' },
  { title: 'Institutional buyers', body: 'When institutional buyers know about — and can access — improved varieties, turnover speeds up and farmer incomes and nutrition rise.' },
]
```

---

## 5. Microcopy & SEO

- **About `<title>`:** `About ACCELERATE — Tanzania Seed Registry`
- **About meta description:** `ACCELERATE is a 2023–2026 initiative building a demand-led model to speed adoption of improved sorghum, common bean, and groundnut varieties across Tanzania.`
- **Home `<title>` (if not set):** `ACCELERATE Tanzania Seed Registry — map the seed system`
- **Home meta description:** `A trusted public registry mapping 1,000+ seed-system actors across Tanzania's sorghum, common bean, and groundnut value chains.`
- **Nav link label:** `About` (header + footer) → `/about`.
- **OG/social blurb:** `Mapping Tanzania's seed system — accelerating variety turnover for sorghum, common bean, and groundnut.`

---

## 6. Implementation checklist (for Claude Code)

- [ ] Add `frontend/app/(public)/about/page.tsx` (static) with §3 copy; export `metadata` (§5).
- [ ] Add nav link `About → /about` in `components/shell/Header.tsx` and the footer.
- [ ] Create home sections: `AboutStrip`, `HowItWorks`, `PartnersStrip`, `ClosingCTA` in
      `components/home/`; wire into `app/(public)/page.tsx` in the §2.0 order.
- [ ] (Optional) Add `lib/content/partners.ts` + `lib/content/pillars.ts`; enrich `crops.ts` with §4.2.
- [ ] Tokens only (`design.md §7`); reuse `useReveal`/`useCountUp` motion + reduced-motion gates.
- [ ] Keep all live numbers on `useMetrics`; never hardcode registry counts. 🟡 figures stay on
      `/about` with attribution (§3.8).
- [ ] A11y: one `<h1>` per page, section `aria-labelledby`, informative `alt`, AA contrast
      (body text uses `fg`/`muted`, not `accent`/`highlight`).

---

## 7. Source attribution
Full source list in [`accelerate-project-source-data.md` §Sources](./accelerate-project-source-data.md#sources).
Primary: <https://alliancebioversityciat.org/projects/accelerate>. Partner case studies: pabra-africa.org.
Market intelligence: cimmyt.org. Peer-reviewed: Frontiers in Sustainable Food Systems (2025).
