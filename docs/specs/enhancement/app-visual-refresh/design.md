# Design — Warm-Earth Surface System (app-wide visual refresh)

- **Spec path:** `docs/specs/enhancement/app-visual-refresh/`
- **Status:** Draft
- **Depth:** Standard
- **Traces requirements:** FR-1…FR-8, NFR-1…NFR-7, AR-1 from this spec's `requirements.md`
- **Stack verified:** Tailwind **3.4.19** · Next **15.5.19** · React **19.1.0**

---

## 1. Approach Overview

The entire change lives in **two files plus documentation**. `frontend/app/globals.css` holds the token values inside `:root`; `frontend/tailwind.config.ts` maps them to utility classes. Every component already consumes those utilities exclusively, so re-authoring values propagates everywhere with no component edits.

The structural move is an **inversion of the usual light-mode arrangement**. Today the page is white and cards are white — nothing can sit on anything. The design makes the **canvas warm and the card white**, so elevation reads from the card being *lighter and warmer-lifted* than its ground, reinforced by a recalibrated shadow ladder.

```
:root  (globals.css)                  tailwind.config.ts              components (UNCHANGED)
──────────────────────                ──────────────────              ──────────────────────
--color-bg      #FBF9F6   ─────────▶  colors.bg          ─────────▶   bg-bg        ( 12 uses)
--color-surface #FFFFFF   ─────────▶  colors.surface     ─────────▶   bg-surface   (137 uses)
--color-surface-alt …     ─────────▶  colors['surface-alt'] ──────▶   bg-surface-alt(82 uses)
--shadow-xs/sm/md/lg      ─────────▶  boxShadow.*        ─────────▶   shadow-md    ( 26 uses)
--gradient-hero/band      ─────────▶  backgroundImage.*  ─────────▶   bg-gradient-hero (new)
```

**Layer discipline (token hierarchy):** brand tokens (`primary`, `crop-*`, fonts) are the abstract layer and are frozen by FR-6. This change operates strictly on the **semantic** layer (`bg`, `surface`, `border`, `fg`, `muted`, `warning`, `success`) and adds two new semantic families (elevation, gradient). No component-level token is introduced.

---

## 2. Data Model Changes

**None.** No Prisma schema, migration, seed, or enum change. No backend file is touched. `PII_ALLOWLIST` untouched.

## 3. API Surface & Contracts

**None.** No endpoint added, changed, or removed. No DTO, no response envelope, no serializer change. Role-aware PII projection is unaffected because no read path is in scope.

## 4. Backend Design

**Not applicable.** `backend/` is entirely out of scope for this spec.

---

## 5. Frontend Design

### 5.1 Token table — the complete contract

Grouped by whether the value moves. **Every "new" value below is computed and verified against NFR-1**, not estimated.

#### Group A — Re-authored (FR-1)

| Token | Current | New | Role |
|---|---|---|---|
| `--color-bg` | `#FFFFFF` | `#FBF9F6` | Page canvas — sand |
| `--color-surface` | `#FFFFFF` | **`#FFFFFF`** | Card/panel — unchanged, now lifts |
| `--color-surface-alt` | `#F7F7F7` | `#F4F0EA` | Alternating band, table header |
| `--color-border` | `#E2E2E2` | `#E6DFD5` | Warm hairline |
| `--color-fg` | `#333333` | `#2A2724` | Primary ink **and the footer surface** |
| `--color-muted` | `#666666` | `#6B6459` | Secondary ink |
| `--color-restricted-bg` | `#F3F3F3` | `#F0EBE4` | PII restricted chip |

#### Group B — Derived, must follow Group A (DD-5)

| Token | Current | New | Why it must move |
|---|---|---|---|
| `--color-backdrop` | `rgba(51,51,51,.40)` | `rgba(42,39,36,.40)` | Declared in `globals.css:25` as "40% of fg". `rgb(51,51,51)` **is** `#333333`. If `--color-fg` moves and this does not, the comment becomes false (KZ-008) and the modal wash desynchronises from the ink. |

#### Group C — Contrast remediation (FR-2, FR-3)

| Token | Current | New | Worst-case ratio after |
|---|---|---|---|
| `--color-warning` | `#C9821B` | `#8F5E10` | **4.86:1** (on its own 10% chip) |
| `--color-success` | `#2F7D32` | `#2A6E2D` | **5.26:1** (on `restricted`) |
| `--crop-sorghum` | `#C9821B` | **`#C9821B`** | Unchanged — decoupled from `warning` |

#### Group D — New elevation ladder (FR-4)

| Token | Value | Consumer |
|---|---|---|
| `--shadow-xs` | warm base, 4% alpha | chips, inputs at rest |
| `--shadow-sm` | warm base, 7% alpha | cards, stat tiles *(was 6% cool)* |
| `--shadow-md` | warm base, 10% alpha | raised cards, table containers *(was 8% cool)* |
| `--shadow-lg` | warm base, 14% alpha | dialogs, popovers, map rail |
| `--shadow-sticky-edge` | **unchanged** | Admin sticky-column boundary — **excluded**, see DD-4 |

Warm shadow base is sampled from the clay canvas rather than the current cool `rgba(28,31,26,…)`.

#### Group E — New gradient tokens (FR-5)

| Token | Purpose |
|---|---|
| `--gradient-hero` | Diagonal canvas→surface wash for hero and landing bands |
| `--gradient-band` | Vertical canvas→alt wash for section transitions |

#### Group F — Frozen (FR-6)

`--color-primary`, `-hover`, `-fg`, `-soft` · `--color-accent` · `--color-highlight`, `-soft`, `-tint` · `--color-danger`, `-soft` · `--color-bean` · all `--crop-*` and `--crop-*-soft` · `--font-sans`, `--font-display` · all `--text-*` · all `--radius-*` · all `--dur-*` and `--ease-*`.

### 5.2 Tailwind mapping additions

`boxShadow` gains `xs` and `lg` (`sm`/`md` already exist and only change value). A new `backgroundImage` key exposes `bg-gradient-hero` / `bg-gradient-band`.

**This mapping is the D-4 trap.** A token declared in `:root` with no `tailwind.config.ts` entry produces no utility class; `npm run build` succeeds, the class silently does nothing, and a class-presence assertion still passes. Every new token in Groups D and E therefore requires **rendered evidence**, not a variable-exists check.

### 5.3 Component impact

**Zero behavioural changes.** Exactly two comment-only edits (NFR-7):

| File | Line | Current comment | Action |
|---|---|---|---|
| `frontend/components/shell/Footer.tsx` | 2 | `// Dark surface: bg-fg (#333333) + text-bg (#FFFFFF)` | Update both hexes |
| `frontend/components/dashboard/DashboardMapPanel.tsx` | 51 | `border border-border → --color-border (#E2E2E2), 1px` | Update hex |

`DashboardMapPanel.tsx:50` cites `#FFFFFF` for `--color-surface` and stays **correct** — it must not be edited. This asymmetry is why the sweep is per-value, not per-file.

### 5.4 Surfaces requiring rendered verification

Derived from where tokens actually land, not from a screen list:

| Surface | Why it must be seen, not asserted |
|---|---|
| Home / Hero | Only consumer of a gradient; contains the `from-fg/70` scrim (DD-6) |
| Directory cards | Highest-density `shadow` + `border` + `surface` interaction |
| Admin actors table | `surface-alt` header, row bands, sticky column, both status pill families |
| Import preview | The two FR-2 warning pairs, at 12px |
| Map + filter rail | Crop markers on `surface-alt` canvas — proves FR-3 decoupling visually |
| Footer | `--color-fg` as a **surface**, not ink (FR-1 scenario 2) |
| Any dialog | `--color-backdrop` (Group B) + `shadow-lg` |

---

## 6. Security & RBAC

**No impact.** No role, guard, serializer, PII field, CORS rule, or secret is touched. The `Public` / `Staff` / `Admin` boundary is unchanged. `--color-restricted-bg` changes value but its **purpose** — making PII restriction legible per `design.md` DD-2 — is preserved and strengthened (its contrast improves).

## 7. Infrastructure / Deployment

**No IaC change. No AWS command runs in this spec.** Deployment is the standard frontend path (`AWS_PROFILE=IBD-DEV ../infra/scripts/deploy-frontend.sh`) and is **not** part of this spec's tasks.

**Rollback:** revert the single commit touching `globals.css` + `tailwind.config.ts`. No migration, no state, no cache to unwind. This is why the spec is Standard rather than Full despite being cross-cutting.

---

## 8. Decision Records

### DD-1: Stay on Tailwind v3 config; do not migrate to v4 `@theme`
- **Context:** The `tailwind-design-system` skill targets Tailwind v4 and recommends CSS-first `@theme` blocks, OKLCH colours, and `color-mix()` alpha variants. The project runs **3.4.19**.
- **Options:** (a) migrate to v4 as part of this change; (b) stay on v3 and apply only version-agnostic guidance.
- **Decision:** **(b).** A framework migration is a different spec with a different risk profile, and folding it into a visual refresh would make every rendering difference ambiguous between "new tokens" and "new Tailwind".
- **Consequences:** Values stay hex in `:root` rather than OKLCH. The token *hierarchy* guidance (brand → semantic → component) is applied and is version-independent.

### DD-2: Warm canvas, white card — invert the default arrangement
- **Context:** Canvas and card are both `#FFFFFF` (1.00:1). Depth is impossible.
- **Options:** (a) darken cards, keep white page; (b) warm the canvas, keep cards white; (c) add borders only.
- **Decision:** **(b).** Option (a) makes 137 `bg-surface` usages heavier and hurts text contrast on the busiest surface. Option (c) adds visual noise to dense admin tables without solving flatness. Every agriculture/civic palette surveyed via `ui-ux-pro-max` uses a tinted background (`#F8FAFC`, `#F0FDF4`, `#ECFDF5`) — never pure white.
- **Consequences:** Card/canvas separation is deliberately subtle (1.05:1). Depth is carried by the shadow ladder, not by darkening the page. **OQ-2** offers `#F7F3ED` (1.11:1) if it reads too soft.

### DD-3: Decouple `--color-warning` from `--crop-sorghum`
- **Context:** Both hold `#C9821B` in `design.md` §7 and `globals.css`, under incompatible thresholds — 4.5:1 (12px ink) vs 3:1 (marker fill, locked by `design.md` DD-4).
- **Options:** (a) darken the shared value (recolours the map); (b) split into two tokens; (c) stop using `warning` as text.
- **Decision:** **(b).** Option (a) violates DD-4's crop identity. Option (c) requires component edits, breaking NFR-7.
- **Consequences:** Two tokens may look similar in the palette listing; `design.md` §7 must state they are **intentionally** distinct so a future "cleanup" does not re-merge them.

### DD-4: Exclude `--shadow-sticky-edge` from the ladder
- **Context:** The ladder re-values `sm`/`md` and adds `xs`/`lg`. `--shadow-sticky-edge` is an **inset** shadow marking the admin table's frozen-column boundary.
- **Decision:** Leave it byte-identical.
- **Consequences:** Per `frontend/CLAUDE.md`, this shadow exists specifically because a `border-r` under `border-collapse` drifts on scroll. Its geometry is load-bearing, not decorative — folding it into a decorative elevation scale would reintroduce a solved bug.

### DD-5: `--color-backdrop` follows `--color-fg`
- **Context:** `globals.css:25` documents it as "40% of fg"; the literal `rgba(51,51,51,.40)` encodes the *old* fg.
- **Decision:** Recompute it from the new `--color-fg` in the same change.
- **Consequences:** Catches a derived token a per-file sweep would miss (KZ-004). It is why the sweep is defined per **value**, not per file.

### DD-6: The Hero scrim is not replaced by `--gradient-hero`
- **Context:** `Hero.tsx:117` renders `bg-gradient-to-t from-fg/70 to-transparent` — the single existing gradient. FR-5 introduces gradient tokens, which invites replacing it.
- **Decision:** **Leave it.** See the reversion challenge in §8.1.
- **Consequences:** The app will contain both a token gradient (atmosphere) and an inline scrim (legibility). `design.md` §7 must record that these are different mechanisms so the inline one does not read as drift.

### DD-7: Contrast is proven by a computed-ratio test, never by `jest-axe`
- **Context:** TRD QA-11 claims `jest-axe` enforces AA. jsdom has no layout or paint engine, so axe's `color-contrast` rule cannot execute; it is skipped without failing (KZ-002). Three failures shipped through that gap.
- **Options:** (a) add a real-browser axe run (Playwright); (b) a pure WCAG-ratio function over the token palette, run in Jest; (c) both.
- **Decision:** **(b)** for this spec, with (a) recorded as a future enhancement. The defect class here is *token values*, which are fully determined without a browser — a pure function evaluates every pair deterministically and with no flake. `playwright-cli` is not vendored in this repo (root `CLAUDE.md`), so (a) would not be runnable by every teammate.
- **Consequences:** The test covers pairs **enumerated** in it. It cannot discover a pair a component invents. That limitation is stated in the test file and mitigated by the rendered-evidence task.

### DD-8: Keep the explicit `-soft` / `-tint` token pattern
- **Context:** Six tokens (`primary-soft`, `highlight-tint`, `danger-soft`, three `crop-*-soft`) exist only because hex CSS variables do not support Tailwind's `/opacity` modifier. Tailwind v4's `color-mix()` would remove the need.
- **Decision:** Keep them. Blocked by DD-1, and changing them would require component edits (NFR-7).
- **Consequences:** Recorded as a follow-up candidate for whenever the v4 migration happens.

### 8.1 Reversion challenge (Step 2.3)

Two decisions touch already-delivered behaviour. Each was challenged with *"what does removing/changing this break?"*

| Decision | Challenge | Outcome |
|---|---|---|
| **DD-6** — replace the Hero scrim with `--gradient-hero`? | The scrim is `from-fg/70` over a **photograph**. It is not decoration: it is what makes hero text legible over arbitrary image content. A canvas→surface atmospheric gradient is *light*; substituting it would drop hero text contrast over the photo's bright regions, and no token-level contrast test would catch it because the other operand is a JPEG. | **Design changed — scrim explicitly out of scope.** It also inherits the fg change automatically (`fg/70`), and since `#2A2724` is darker than `#333333`, the scrim gets marginally darker — contrast moves in the safe direction. |
| **DD-4/Group D** — re-value the existing `--shadow-sm` / `--shadow-md`? | Every current `shadow-sm`/`shadow-md` consumer (36 + 26 uses) gets a heavier shadow with no component edit. Could it make dense admin tables look cluttered? | **Accepted with a guard.** The increase is small (6%→7%, 8%→10%) and the ladder is calibrated against the warm canvas. Risk is aesthetic, not functional — it lands squarely in **D-5/AR-1** and is caught by the rendered-evidence gate on the admin table, which is named explicitly in §5.4. |

---

## 9. Risks & Mitigations

| # | Risk | Mitigation |
|---|---|---|
| R-1 | A token is defined but never applied (D-4) | Rendered evidence per §5.4. No presence-assertion counts. |
| R-2 | Result is numerically correct but reads flat (D-5 / AR-1) | HITL visual gate vs `mockup/index.html`; OQ-2 fallback pre-computed. |
| R-3 | `#C9821B` find-and-replace recolours the map (DD-3) | Explicit equality assertion on all three `--crop-*` values. |
| R-4 | A derived token is missed (DD-5) | Sweep is per-value across the repo, not per-cited-file (KZ-004). |
| R-5 | Contrast test enumerates pairs and misses one a component invents (DD-7) | Limitation stated in the test file; rendered evidence covers the gap. |
| R-6 | `globals.css` conflicts with `enhancement/searchable-region-select`, active in this same tree | `Parallel-safe: no`. Land alone; rebase the other spec on top. |
| R-7 | **Cannot commit — branch base unresolved (OQ-3)** | `/akili-execute` must resolve the base before its first commit. Implementation is unblocked; only committing is blocked. |

---

## 10. Test Plan Outline

| Requirement | Verification | Kind |
|---|---|---|
| FR-1, FR-2, NFR-1 | Computed WCAG ratio over every enumerated ink/surface pair | Automated, deterministic |
| FR-3, FR-6 | Token-equality assertion on frozen values | Automated |
| FR-4, FR-5 | Utility class resolves to a non-empty computed value **+ screenshot** | Automated + rendered |
| FR-7 | Grep sweep per superseded value | Automated |
| FR-8 | TRD QA-11 text amended | Diff review |
| NFR-2, NFR-4 | Grep: no colour literal outside `:root` | Automated |
| NFR-3, NFR-5 | `npm run build` — static export, no bundle delta | Automated |
| NFR-7 | `git diff --stat` — 2 comment-only component edits | Diff review |
| D-5 / AR-1 | Human visual review at the HITL gate | **Manual — explicitly not automated** |

### The known-failure ledger

The contrast test ships **before** the token fix and stays green in both states, so the red→green transition is auditable without ever leaving the suite red.

At T-1 the test carries a `KNOWN_FAILURES` ledger with **5** entries — the **4** FR-2 shipped failing pairs, plus `warning`/`bg`, gated defensively because T-3's scope line names `bg` as a ground `warning` must clear even though no component renders that pair today — and asserts **two** things: every pair *outside* the ledger meets its threshold, **and** every pair *inside* it still fails. The second assertion is what stops the ledger from rotting — a pair that gets fixed by accident breaks the test until it is removed from the ledger. At T-3 the ledger empties and both assertions collapse into one.

*Why this shape:* a plain "assert everything passes" test cannot be committed before the fix without a red suite, and a test written after the fix never proves it could have caught the defect.

---

## 11. Budget (Step 2.4 — tripwire for `/akili-execute`)

| Metric | Expected |
|---|---|
| **Tasks** | **6** |
| **LOC** | **~760** — *re-baselined 2026-08-07 after T-1; originally ~200* (≈676 test harness **actual** · ~40 `globals.css` · ~20 `tailwind.config.ts` · 3 comment lines · ~30 docs) |
| **Review rounds** | **7** (1 per task, +1 expected on T-1 — a contrast matrix is the likeliest place for an off-by-one in threshold selection) |

**Sizing check against depth:** 6 tasks / cross-cutting visual surface sits correctly in **Standard**. It is above `Lite` (which would be a single task and no test harness) and below `Full` (no API, data, auth, migration, or rollout — and rollback is a single-commit revert). **Depth confirmed after the design, not assumed before it.**

If execution exceeds **~8 tasks**, or **any task edits a component file**, the Leader **stops and escalates** rather than continuing — that overrun would mean the change stopped being token-only and started touching components, which is NFR-7 failing.

> **Re-baseline note (2026-08-07, approved by the user at the T-1 budget gate).** T-1 landed at **676 LOC** against ~120 budgeted, tripping the original ~300 LOC spec-wide tripwire. It was accepted, and the tripwire re-authored, because the LOC threshold was firing for a reason **orthogonal to what it was defending**: it exists to detect the change becoming component-level, and all 676 lines are in **two new files** with **zero component edits** — the very condition the tripwire was built to catch is measurably absent. A test harness that enumerates a 63-pair matrix with per-pair `file:line` reachability citations is simply larger than a line estimate made before the reachability question was adjudicated. The trigger is therefore now **component edits**, which measures NFR-7 directly, instead of **LOC**, which only proxied for it. Contributing causes, recorded for honesty: the Leader's ADJ-1 reachability ruling expanded the evidence each pair must carry, and the `UNREACHABLE` inventory + promotion rule is net-new scope the original estimate did not contemplate.
