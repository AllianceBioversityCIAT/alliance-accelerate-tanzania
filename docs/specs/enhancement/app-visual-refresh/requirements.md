# Requirements — Warm-Earth Surface System (app-wide visual refresh)

- **Spec path:** `docs/specs/enhancement/app-visual-refresh/`
- **Status:** Draft
- **Depth:** Standard
- **Type:** Change · **Approval Mode:** `gated`
- **Author / Date:** AKILI `/akili-specify` · 2026-08-07
- **Related:** `docs/prd.md` §5 · `docs/ux-ui/design.md` §7, §10, §11, DD-4 · `docs/trd/trd.md` §6, QA-11 · `proposal.md` · `mockup/index.html`

---

## 1. Summary

Re-author the **surface, ink, border, elevation and gradient token layer** so the platform reads as a warm, layered agricultural registry instead of a flat white page — and, in the same pass, fix three WCAG 2.1 AA contrast failures that ship on `main` today.

The change advances PRD §4's *"Make actors discoverable"* and `design.md` §1.5 *"Accessible by default"*, and it is deliberately confined to token values: **no component behaviour, no layout, no brand colour, no typography, and no data or API surface changes.** Because the frontend has zero hardcoded colours (verified: the only three hex occurrences in `frontend/app` and `frontend/components` are comments), re-authoring ~14 token values re-skins all 231 surface usages at once.

---

## 2. Requirement Numbering & Writing Standards

- Functional requirements are `FR-1…`; non-functional `NFR-1…`.
- Every requirement is atomic and testable. Every contrast figure in this document is **computed from the token values**, not estimated.
- MUST / SHOULD / MAY per RFC 2119.
- **Figures reconciled against prose (KZ-005):** the counts asserted here — 231 surface usages, 3 hex comment occurrences, **4 shipped AA failing pairs**, 2 comment-only file edits — are each stated once and used consistently in `design.md` and `tasks.md`.
- **Pairs, not sites (amended 2026-08-07, T-1):** FR-2 counts failing **(ink, ground) pairs**, because a token re-authoring fixes a pair everywhere it renders. Its table cites *representative* render sites per pair, not an exhaustive site list. The exhaustive site sweep lives in the T-1 harness's `REACHABLE.citedAt` fields, which is where it can be kept honest by a test.

---

## 3. Defect Classes And Their Gates

**This section is the spec's most important control.** A gate that is blind to the defect class this work most often produces is not a gate. Listed before any requirement, because it determines which verifications the tasks must carry.

| # | Defect class this spec can produce | Automated gate | Adequate? |
|---|---|---|---|
| **D-1** | An ink/surface pair drops below its WCAG threshold | Computed-ratio assertion over token values (pure function, Jest) | ✅ Yes |
| **D-2** | A brand token (primary, crop, font) silently changes | Token-equality assertion | ✅ Yes |
| **D-3** | `--color-warning` fix also recolours sorghum map markers | Token-equality assertion on `--crop-sorghum` | ✅ Yes |
| **D-4** | A token is **defined but never applied** — declared in `globals.css` with no Tailwind mapping, so the utility class silently does nothing | `npm run build` passes either way | ❌ **No** — presence-assertion trap (KZ-002) |
| **D-5** | The result is *correct* by every number and still **reads flat or wrong** | none | ❌ **No** — no automated checker evaluates aesthetic outcome |
| **D-6** | A document or comment still quotes a superseded hex | Grep sweep per superseded value | ✅ Yes |
| **D-7** | A component file is edited beyond the two enumerated comment sites | `git diff --stat` | ✅ Yes |
| **D-8** | Dark-mode readiness broken (`design.md` §11) | Grep: no colour literal outside the `:root` block | ✅ Yes |

### Substitutes for the two unguarded classes

| Class | Substitute — mandatory, not advisory |
|---|---|
| **D-4** | **Rendered evidence.** A token is proven applied only by a screenshot of the element that consumes it. `jest-axe`, `npm run build` and a class-presence assertion all pass on a token that resolves to nothing. |
| **D-5** | **Human visual check at the HITL pause**, against `mockup/index.html` at 375 / 768 / 1440 px. Optionally routed to a **T6 Multimodal** review (registry: Antigravity / `gemini-3.1-pro-high`) for a comps-vs-render comparison. Whether the app *looks good* is not a machine-decidable property and is not claimed as one. |

### Accepted risk

**AR-1 — Subjective aesthetic outcome.** D-5 has no measurable pass criterion. If the user judges the rendered result unsatisfactory, that is a legitimate outcome of this spec, resolved by adjusting token values (OQ-2), not by a failing test. Recorded rather than pretended away.

---

## 4. Functional Requirements

### FR-1: Warm-earth surface and ink tokens

- **Description:** The system MUST re-author the neutral token layer so the page canvas, alternating band, hairline border, primary ink and secondary ink carry a warm (clay/sand) hue, while `--color-surface` remains `#FFFFFF` so cards read as lifted off the canvas.
- **Rationale / Source:** `proposal.md` §Problem — canvas and card are currently the same colour (1.00:1); the crop palette is already warm earth (DD-4) while every neutral is hue-free.
- **PII/RBAC impact:** None. No role-visible field, response, or projection changes.

#### Scenario: The canvas separates from the card

- **GIVEN** any page rendering a card, table or panel on the page background
- **WHEN** the page is rendered with the re-authored tokens
- **THEN** `--color-bg` and `--color-surface` MUST resolve to different values
- **AND** `--color-bg`, `--color-surface-alt`, `--color-border`, `--color-fg`, `--color-muted` and `--color-restricted-bg` MUST each carry a non-zero warm hue (R > B in sRGB)
- **BUT** it MUST NOT change `--color-surface`, which stays `#FFFFFF`
- **AND IT MUST** keep every ink legible on every surface it can land on, per NFR-1

#### Scenario: The footer is a surface, not only ink

- **GIVEN** `Footer.tsx` renders a dark band using `bg-fg` with `text-bg` on it (`frontend/components/shell/Footer.tsx:2`)
- **WHEN** `--color-fg` is re-authored
- **THEN** the footer's background changes with it
- **AND IT MUST** hold ≥ 4.5:1 for `--color-bg` ink on `--color-fg` ground
- **BUT** it MUST NOT be treated as a text-only token change; the footer is a rendered surface requiring visual evidence (D-4)

---

### FR-2: Remediate the four shipped WCAG AA failures

- **Description:** The system MUST correct four ink/background **pairs** that fail WCAG 2.1 AA for small text on `main` today.
- **Rationale / Source:** Measured during `/akili-propose`; the 4th pair was discovered by the T-1 two-direction sweep (KZ-004) and added on 2026-08-07. TRD **QA-11** asserts AA is enforced; these have shipped regardless — see FR-8.
- **PII/RBAC impact:** None.

| Pair | Representative site(s) | Today | Required |
|---|---|---|---|
| `text-warning` at 12px on `--color-surface` | `ImportPreviewTable.tsx:130`; also `ActorsTable.tsx:282` (tbody `bg-surface`) | **3.14:1** | ≥ 4.5:1 |
| `text-warning` on its own `bg-warning/10` chip | `ImportPreviewTable.tsx:98` | **2.83:1** | ≥ 4.5:1 |
| `text-success` on `bg-highlight/20` | `UsersTable.tsx:282`, `:377`; also `app/(admin)/admin/users/page.tsx:349` | **4.35:1** | ≥ 4.5:1 |
| `text-warning` on `--color-surface-alt` | `ActorHistoryPanel.tsx:87` (BULK_CONSENT badge); also `ActorsTable.tsx:282` under `hover:bg-surface-alt` | **2.93:1** | ≥ 4.5:1 |

> **Why this pair was missed.** The original sweep enumerated `text-warning` sites whose ground was the *default* body/table surface and stopped there; `ActorHistoryPanel.tsx:87` sets ink and ground together in one returned class string (`'bg-surface-alt text-warning'`), so it did not match that shape. The T-1 harness now gates the pair directly, which is why the miss is recoverable by test rather than by re-reading. **It requires no new token value** — the `--color-warning` → `#8F5E10` already planned for the other three pairs yields **4.90:1** here, so this is a documentation defect, not a design defect.

#### Scenario: Warning text becomes legible at 12px

- **GIVEN** the import preview renders a per-row warning as `text-xs text-warning`
- **WHEN** `--color-warning` is re-authored
- **THEN** the ratio against `--color-surface`, `--color-bg`, `--color-surface-alt` and against its own 10%-alpha chip MUST each be ≥ 4.5:1
- **AND IT MUST** be verified against the **composited** chip colour, not against the base surface — a 10% wash lowers the ratio and is where the current value fails hardest (2.83:1)
- **BUT** it MUST NOT be achieved by enlarging the text or removing the warning styling

#### Scenario: Success text on its tint

- **GIVEN** an admin status pill renders `text-success` on `bg-highlight/20` or `bg-highlight-tint`
- **WHEN** `--color-success` is re-authored
- **THEN** the ratio MUST be ≥ 4.5:1 on **both** tints and on `--color-restricted-bg`
- **BUT** it MUST NOT change `--color-highlight` or `--color-highlight-tint`, which are brand tokens

---

### FR-3: Separate semantic ink from crop identity

- **Description:** `--color-warning` and `--crop-sorghum` currently hold the **same value `#C9821B`** in both `docs/ux-ui/design.md` §7 and `frontend/app/globals.css`. They serve different purposes under different WCAG thresholds and MUST become independent tokens.
- **Rationale / Source:** `--crop-sorghum` is a marker/legend fill (non-text, WCAG 1.4.11 → 3:1) locked by `design.md` DD-4 as crop identity; `--color-warning` is semantic ink rendered at 12px (→ 4.5:1). One value cannot satisfy both.
- **PII/RBAC impact:** None.

#### Scenario: Fixing warning does not repaint the map

- **GIVEN** the seed map colours sorghum markers and legend swatches from `--crop-sorghum`
- **WHEN** `--color-warning` is darkened to satisfy FR-2
- **THEN** `--crop-sorghum` MUST remain byte-identical to `#C9821B`
- **AND** `--crop-bean` and `--crop-groundnut` MUST likewise remain unchanged
- **BUT** it MUST NOT be implemented as a single find-and-replace of `#C9821B`, which would silently recolour every sorghum marker
- **AND IT MUST** be recorded in `design.md` §7 that these two tokens are intentionally distinct despite having shared a value historically

---

### FR-4: Elevation ladder

- **Description:** The system MUST replace the current two shadow tokens — at **6%** and **8%** alpha, perceptually invisible — with a warm-tinted ladder of at least four steps that produces a legible depth hierarchy.
- **Rationale / Source:** `proposal.md` §Problem. The user reported two symptoms, "all white" (hue) and "looks simple" (depth); re-authoring hue alone leaves the second unaddressed.
- **PII/RBAC impact:** None.

#### Scenario: Depth becomes perceptible

- **GIVEN** a card, dialog, table container or map rail that consumes a shadow token
- **WHEN** it renders on the warm canvas
- **THEN** at least four shadow steps MUST exist, each mapped to a Tailwind utility
- **AND** the shadow colour MUST be warm-tinted rather than the current cool `rgba(28,31,26,…)`
- **AND IT MUST** be proven by rendered evidence, not by asserting the CSS variable exists — a shadow token with no Tailwind mapping passes every build and renders nothing (D-4)
- **BUT** it MUST NOT alter `--shadow-sticky-edge`, whose inset geometry is load-bearing for the admin table's sticky-column boundary (`frontend/CLAUDE.md`)

---

### FR-5: Atmospheric gradient tokens

- **Description:** Gradients MUST become first-class tokens rather than a single inline one-off. The entire app currently contains exactly one gradient (`frontend/components/home/Hero.tsx:117`).
- **Rationale / Source:** `design.md` §7 mandates token-driven styling with no scattered magic values; a lone inline gradient is the same class of drift the motion tokens were created to eliminate.
- **PII/RBAC impact:** None.

#### Scenario: A gradient surface is available without hardcoding

- **GIVEN** a hero band or section transition needs an atmospheric surface
- **WHEN** the implementer styles it
- **THEN** a `--gradient-*` token MUST be available and mapped to a Tailwind utility
- **BUT** it MUST NOT require an arbitrary Tailwind value (`bg-[linear-gradient(...)]`), which `frontend/CLAUDE.md` forbids under zero tolerance
- **AND IT MUST NOT** apply a gradient behind body text where it would make any ink's worst-case ratio fall below NFR-1

---

### FR-6: Brand tokens are immutable in this change

- **Description:** The change MUST NOT alter any brand-identity token.
- **Rationale / Source:** Royal Blue `#1F4E8C`, the three crop colours, Inter and Montserrat are official ACCELERATE brand assets set by the archived `enhancement/official-branding` spec and `design.md` §7. The `frontend-design` skill lists system fonts and "safe palettes" as anti-patterns; that guidance is explicitly overridden here because these are constitutional brand assets, not defaults.
- **PII/RBAC impact:** None.

#### Scenario: The brand survives the refresh

- **GIVEN** the token layer is re-authored
- **WHEN** the diff is reviewed
- **THEN** `--color-primary`, `--color-primary-hover`, `--color-primary-fg`, `--color-primary-soft`, `--color-accent`, `--color-highlight`, `--color-highlight-soft`, `--color-highlight-tint`, `--color-danger`, `--color-danger-soft`, `--color-bean`, all three `--crop-*` values, all three `--crop-*-soft` values, `--font-sans`, `--font-display`, the full `--text-*` scale, all `--radius-*` and all motion tokens MUST be byte-identical to their pre-change values
- **BUT** it MUST NOT be claimed on the basis of the diff alone; an explicit equality assertion is required so a later change cannot silently drift them

---

### FR-7: Baseline documentation stays truthful

- **Description:** The constitutional baseline MUST be updated in the same change, and every site quoting a superseded value MUST be swept.
- **Rationale / Source:** **KZ-004** — a correction is applied only when the superseded value is gone from everywhere it lived, not when the cited site is fixed. **KZ-008** — a comment asserting a property the code lacks is a defect of the same class as a missing test.
- **PII/RBAC impact:** None.

#### Scenario: No document outlives its values

- **GIVEN** `docs/ux-ui/design.md` §7 is the declared single source of truth for tokens
- **WHEN** token values change in `frontend/app/globals.css`
- **THEN** §7's token block MUST match `globals.css` exactly
- **AND** §7's accent-usage contrast note — which today warns only about `accent` and `highlight` — MUST be extended to state the marker-vs-ink threshold split introduced by FR-3
- **AND** the two stale comment sites MUST be corrected: `frontend/components/shell/Footer.tsx:2` and `frontend/components/dashboard/DashboardMapPanel.tsx:51`
- **BUT** it MUST NOT rewrite anything under `docs/specs/archive/**`, which root `CLAUDE.md` declares frozen historical records
- **AND IT MUST** close by grep: every superseded value returns zero hits outside `docs/specs/archive/**` and this spec's own folder

---

### FR-8: Correct the QA-11 verification method

- **Description:** TRD **QA-11** claims WCAG 2.1 AA is "enforced in frontend tests via `jest-axe`". For contrast this is structurally false and MUST be corrected.
- **Rationale / Source:** `jest-axe` runs under jsdom, which has no layout or paint engine, so axe's `color-contrast` rule cannot execute and is skipped without failing. QA-11 has reported green for a property its harness cannot evaluate — precisely **KZ-002**. All four FR-2 failing pairs shipped through that gap.
- **PII/RBAC impact:** None.

#### Scenario: The gate names what it can actually see

- **GIVEN** QA-11's response measure asserts `jest-axe` enforces WCAG 2.1 AA
- **WHEN** this spec lands
- **THEN** QA-11 MUST record that `color-contrast` is **not** evaluable under jsdom
- **AND** it MUST name the mechanism that does evaluate it — a computed-ratio assertion over the token palette
- **BUT** it MUST NOT weaken or remove the QA-11 accessibility scenario itself; only its response measure is corrected
- **AND IT MUST NOT** claim contrast coverage from `jest-axe` anywhere else in the baseline

---

## 5. Non-Functional Requirements

| ID | Requirement | Measurable criterion |
|---|---|---|
| **NFR-1** | **WCAG 2.1 AA on every reachable ink/surface pair** | Every semantic ink (`fg`, `muted`, `primary`, `primary-hover`, `success`, `warning`, `danger`) against every surface it can land on (`bg`, `surface`, `surface-alt`, `restricted`, `highlight-tint`, `highlight/20`, `warning/10`, `danger-soft`, `primary-soft`) is **≥ 4.5:1**. Large-text/UI-only tokens (`accent`, `highlight`, `crop-*`) are **≥ 3.0:1** and MUST be documented as such in `design.md` §7. |
| **NFR-2** | **Token-only styling preserved** | `frontend/app` + `frontend/components` contain zero colour literals: no `#rrggbb`, no `rgb()`/`rgba()`, no `bg-[…]`/`text-[…]`/`border-[…]`. Currently 3 hex occurrences exist, all comments; after this change they are corrected but still comments. |
| **NFR-3** | **No performance or bundle cost** | CSS custom properties only. Zero new runtime dependencies, zero new image or font assets. `npm run build` first-load JS for `/`, `/directory`, `/map` unchanged (±0 kB). |
| **NFR-4** | **Dark-mode readiness preserved** | `design.md` §11 requires tokens authored so a `.dark` scope can override them later. All new tokens MUST be declared as CSS variables inside `:root`; no colour literal may appear outside that block. |
| **NFR-5** | **Static-export safe** | `next build` static export succeeds; no SSR, route handler, or dynamic segment introduced. |
| **NFR-6** | **Motion and reduced-motion untouched** | All `--dur-*` / `--ease-*` tokens and the `prefers-reduced-motion` gating are byte-identical. |
| **NFR-7** | **Scope containment** | Exactly **two** component files change, and both changes are **comment-only**: `Footer.tsx`, `DashboardMapPanel.tsx`. No component's markup, classes, props or behaviour changes. Verified by `git diff`. |

---

## 6. Data & Schema Impact

**None.** No Prisma model, field, migration, enum, or seed change. No new or changed PII field; the `PII_ALLOWLIST` in `backend/src/common/pii-consent.policy.ts` is untouched. No backend file is in scope.

---

## 7. Out of Scope

| Not doing | Why |
|---|---|
| Dark mode implementation | `design.md` §11 defers it post-v1. NFR-4 keeps it cheap to add later. |
| Any screen, layout or IA redesign | Separate spec, after the token system settles. |
| Font or brand-colour changes | FR-6. |
| Leaflet map tile restyling | Third-party imagery, outside the token layer. |
| Multi-country / per-country theming | PRD §5 puts multi-country out of scope for v1. See **OQ-1**. |
| Rewriting archived specs quoting old hexes | Frozen records per root `CLAUDE.md`. |
| Backend, infra, API, or IaC changes | None required; no AWS command runs in this spec. |

---

## 8. Dependencies & Assumptions

- **No upstream spec dependency.** No AWS resource, no `--profile IBD-DEV` command.
- **Branch placement is unresolved.** This spec sits on `enhancement/app-visual-refresh`, which was branched from `actor-register` @ `95bb89d` and therefore carries **5 unmerged commits** plus ~816 lines of unrelated uncommitted work in the tree. `origin/staging` is 69 commits behind `origin/main`. **`/akili-execute` MUST NOT commit until the base is settled** — see OQ-3.
- **Conflict surface:** `Parallel-safe: no`. Any concurrent frontend spec (e.g. `enhancement/searchable-region-select`, active in this tree) will conflict on `globals.css` / `tailwind.config.ts`.
- **Assumption:** the mockup's token values are the approved target. If the user rejects them at the visual gate, values change but no requirement changes.

---

## 9. Open Questions

| ID | Question | Status |
|---|---|---|
| **OQ-1** | Does "scales to other African countries" constrain only **visual identity** (no national motifs — the reading this spec is written against), or does it mean **per-country theming** (a token scope per country)? The latter is a materially larger, different spec. | **Unanswered.** Specified under the first reading; PRD §5 supports it. |
| **OQ-2** | Canvas depth: `#FBF9F6` (card separation 1.05:1, approved at proposal) vs `#F7F3ED` (1.11:1). Both hold AA for every ink. | **Unanswered.** Resolve at the visual gate on a real screen — not from the numbers. |
| **OQ-3** | Branch base: recreate `enhancement/app-visual-refresh` from `origin/main` (`456f1ce`), or intentionally keep it stacked on `actor-register`? Blocks commit, not implementation. | **Unanswered.** |
| **OQ-4** | Should the elevation ladder's dark-scope alphas be documented now (cheap) or deferred with the rest of dark mode (retrofit cost later)? | Recommend documenting now in `design.md` §7. |

---

## 10. Requirement ID Index

| ID | Requirement | Primary artifact |
|---|---|---|
| FR-1 | Warm-earth surface and ink tokens | `globals.css`, `tailwind.config.ts` |
| FR-2 | Remediate four shipped WCAG AA failing pairs | `globals.css` |
| FR-3 | Separate semantic ink from crop identity | `globals.css`, `design.md` §7 |
| FR-4 | Elevation ladder | `globals.css`, `tailwind.config.ts` |
| FR-5 | Atmospheric gradient tokens | `globals.css`, `tailwind.config.ts` |
| FR-6 | Brand tokens immutable | contrast/token test |
| FR-7 | Baseline documentation stays truthful | `docs/ux-ui/design.md` §7, `Footer.tsx`, `DashboardMapPanel.tsx` |
| FR-8 | Correct the QA-11 verification method | `docs/trd/trd.md` §13 |
| NFR-1 | WCAG 2.1 AA on every pair | contrast test |
| NFR-2 | Token-only styling preserved | grep sweep |
| NFR-3 | No performance or bundle cost | `npm run build` |
| NFR-4 | Dark-mode readiness preserved | `globals.css`, grep |
| NFR-5 | Static-export safe | `npm run build` |
| NFR-6 | Motion tokens untouched | token test |
| NFR-7 | Scope containment (2 comment-only edits) | `git diff --stat` |
| AR-1 | Accepted risk: subjective aesthetic outcome | HITL visual gate |

---

**Conventions reminder:** RBAC roles are `Public` / `Staff` / `Admin`; PII = `phone`, `email` (+ the extended allowlist in TRD §8). This spec touches none of them. No AWS command runs in this spec.
