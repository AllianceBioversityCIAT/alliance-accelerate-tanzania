# Design — Baseline Usage Analytics (GA4) + Cookie Consent

- Spec path: `docs/specs/enhancement/usage-analytics/`
- Status: Draft
- Traces requirements: FR-1…FR-7, NFR-1…NFR-7 from this spec's `requirements.md`
- Baseline: `docs/ux-ui/design.md` §7–§8, §10 · `docs/trd/trd.md` §6, §8, §13, ADR-002/ADR-010

## 1. Approach Overview

One client-side consent provider, mounted in the `(public)` route group's layout, owns a three-state value (`undecided` / `granted` / `denied`) read from and written to the visitor's own browser storage. It renders the banner while undecided and the GA4 script **only** while granted. Nothing is added to the root layout, so `(admin)` cannot reach any of it.

No backend, API, database, or infrastructure component participates. Under ADR-002 (static export) there is no server to hold a session, which is what makes browser storage the only available home for the choice — not a preference.

```
app/layout.tsx                      ← untouched (FR-5)
└── app/(public)/layout.tsx         ← ConsentProvider mounted here (FR-5)
    ├── ConsentBanner               ← rendered while showBanner (FR-2) — see §5.2
    ├── GoogleAnalytics             ← rendered ONLY while state === 'granted' (FR-1, FR-4)
    └── <main>{children}</main>
        └── /privacy                ← ConsentChoiceControl island reads/writes the same state (FR-6)
└── app/(admin)/layout.tsx          ← structurally unreachable by the above (FR-5)
```

## 2. Data Model Changes

**None.** No Prisma model, field, or migration. No new PII field, so `PII_ALLOWLIST` (`docs/trd/trd.md` §8) is unchanged.

The only persisted state is a single record in the visitor's browser holding the policy version, the choice, and a timestamp.

## 3. API Surface & Contracts

**None.** No endpoint is added, changed, or called. The GA4 transport is the vendor script's own outbound request, which this spec does not proxy or wrap.

## 4. Backend Design

**None.** No NestJS module, guard, DTO, or serializer change.

## 5. Frontend Design

### 5.1 Modules

| Path | Kind | Responsibility |
|---|---|---|
| `frontend/lib/analytics/consent-storage.ts` | pure module | Read / write / clear the consent record. Owns the storage key, the policy-version constant, and total tolerance of unavailable or throwing storage (FR-3). |
| `frontend/lib/analytics/ConsentProvider.tsx` | `'use client'` provider | Owns consent state; exposes it plus a setter via a hook. Mirrors the existing `frontend/lib/auth/SessionProvider.tsx` placement and shape. |
| `frontend/components/analytics/ConsentBanner.tsx` | `'use client'` | The banner UI and its two controls (FR-2). |
| `frontend/components/analytics/GoogleAnalytics.tsx` | `'use client'` | The gated `next/script` mount, its `onError` path, and the missing-ID short-circuit (FR-1, FR-4, FR-7). |
| `frontend/components/analytics/ConsentChoiceControl.tsx` | `'use client'` | The island on `/privacy` that changes a prior choice (FR-6, resolves OQ-4). |

Modified: `frontend/app/(public)/layout.tsx` · `frontend/app/(public)/privacy/page.tsx` · `frontend/.env.example` · `infra/scripts/deploy-frontend.sh`.

### 5.2 Consent state and the storage contract

Three states, and **only** `granted` permits the script to exist:

| State | Reached when | Banner | GA4 script |
|---|---|---|---|
| `undecided` | no record; record unreadable; record's version < current | shown | **not injected** |
| `granted` | record at current version says granted | hidden | injected once |
| `denied` | record at current version says denied | hidden | **not injected** on load — but see the asymmetry note below |

`undecided` is the initial value on every render path, including the one where storage throws. Absence never resolves to `granted` (FR-3). The record carries the **policy version**, so raising the version constant re-prompts every visitor — the mechanism FR-6's disclosure change will need if the disclosure is ever materially revised.

**Hydration note.** The provider must not render the banner during the first paint pass on a value it has not yet read from storage, or a visitor who already chose will see the banner flash on every page load. State initialises as `undecided` with a separate "not yet read" flag; the banner renders only after the read completes. This is the standard static-export hydration constraint, not an optimisation.

**The two directions are asymmetric, and the notice must say so — corrected 2026-09-01.** This table describes a **cold load**. On a live transition inside one page session the two directions differ:

| Transition | Effect |
|---|---|
| → `granted` | **Immediate.** `GoogleAnalytics` mounts in the same provider as the control, injects the script on the current page, and `gtag('config', …)` records a page view and sets `_ga` cookies **before any navigation.** |
| → `denied` | **Deferred to the next load.** `next/script` performs no unmount cleanup, so the script node, `gtag`, `dataLayer` and any `_ga` cookies all survive for the rest of that page session. |

Neither direction is a defect — the first is the point of consent, the second is how `next/script` behaves. What *was* a defect is a notice that described only one of them. `/privacy` now states both (T-11).

**The context exposes a derived `showBanner` boolean, and consumers use it rather than composing the condition themselves (DD-7, added 2026-08-31).** `showBanner` is true only when the read has resolved *and* the state is `undecided`. Consumers MUST NOT reconstruct that condition from the raw values: `consent === 'undecided'` alone is the *natural* expression and is **wrong** — it is true during the unresolved window, which produces exactly the flash this note forbids, and the mistake is invisible in jsdom. The raw `consent` and `loading` values stay exported for T-3 (which gates on `granted`) and T-6 (which needs the current choice), but the banner's condition is the provider's to compute, not its consumer's to assemble.

### 5.3 The banner (FR-2, NFR-1, NFR-2, NFR-3)

**Semantics — a labelled landmark region, never a dialog.** A `<section>` with an accessible name yields `role="region"`. `role="dialog"`/`alertdialog"` is rejected outright: both imply a focus trap and an expectation of dismissal-before-continue, which is precisely what FR-2 forbids and what `docs/ux-ui/design.md` §1 principle 1 rules out (*"No login wall in front of public data"*). No backdrop element exists at all, so nothing can intercept pointer events.

**Symmetry.** Both controls are real `<button>` elements, adjacent, identical in dimensions and font size, each resolving the choice in **one** click. The accept button carries the primary fill and the reject button the secondary outline — a visual hierarchy, not an interaction-cost difference. No "manage preferences" indirection exists on either path, because FR-4 leaves exactly one category to consent to.

**Tokens** (`docs/ux-ui/design.md` §7 — NFR-2):

| Element | Tokens |
|---|---|
| Container | `bg-surface`, `border-t border-border`, `shadow-lg` |
| Body / heading text | `text-muted` / `text-fg` |
| Accept | `bg-primary text-primary-fg hover:bg-primary-hover` |
| Reject | `border border-border bg-surface text-fg hover:bg-surface-alt` |
| Privacy link | `text-primary`, underlined |

`border-t border-border` is load-bearing, not decoration: `frontend/CLAUDE.md` records that `--color-surface` on `--color-bg` is only **1.05:1**, so the border — not the shadow — is what makes the boundary perceivable under WCAG 1.4.11. `shadow-lg` is the ladder's dialogs/popovers rung, which is the correct rung for an overlay surface.

**Motion (NFR-3): none.** The banner appears without transition. This satisfies the reduced-motion rule structurally — there is nothing to gate — and avoids pulling GSAP into the `(public)` layout for a one-time bar. Recorded as a decision (DD-6) so a later reader does not read the absence as an omission.

### 5.4 Stacking — the `/map` collision

Measured, not assumed. Current z-index owners:

| Owner | Value | Note |
|---|---|---|
| `Header` | `sticky top-0 z-40` | public shell |
| Admin dialogs | `fixed z-50` | `(admin)` only — **structurally cannot coexist** with the banner (FR-5) |
| `MapLegend` | `absolute bottom-6 left-3 z-[1000]` | deliberately above Leaflet's own control/pane tiers |

The banner is `fixed bottom-0` and full-width at `z-[1100]`. Two consequences, both accepted and both requiring the NFR-5 rendered capture rather than a test:

1. **It must clear Leaflet.** Anything at or below `z-[1000]` would be painted *under* the map's controls and legend. `z-[1100]` is the lowest value that clears the highest current owner.
2. **The occlusion set — corrected twice, and the corrections are themselves the lesson.** This section originally named `MapLegend` alone. T-8's rendered capture (2026-08-31) found **two more** on `/map` at 768/1440: the last rail-list card and the Leaflet/OpenStreetMap attribution links. T-10's two-arm sweep (2026-09-01) found **seven more** — every footer control, on both routes, at all three widths. Every one was confirmed by `document.elementFromPoint()`, never by rect arithmetic.

   **Each correction was smaller than the gap it left.** The set went 1 → 3 → 10, and both times the missing members were found by *measuring*, never by re-reading this section. The count is deliberately not restated as a number here: a number would go stale the next time someone measures, and the point is not how many there are but that a set written from reasoning was wrong twice.

   - **`MapLegend`** and the **last rail-list card** are accepted as **transient**: the banner exists only until the visitor's first choice, after which it never renders again for that visitor. Relocating the legend would change a delivered component for a one-time overlap; moving the banner to a corner would weaken FR-2's prominence.
   - **The attribution links are not accepted**, and are fixed in **T-9**. They are a licensing control, not decoration — and FR-2 scenario 2 contemplates a visitor who *ignores the banner entirely*, for whom the occlusion is not transient at all but permanent. That case is what separates them from the other two.

   - **The footer, and the transit band — added 2026-09-01 after T-10.** A two-arm measurement (252 cells, `elementFromPoint`, with a manipulation check confirming the banner was the only variable) found the banner occluding footer controls in two distinct categories, which this section originally conflated:

     - **At settled reading positions: the three funder logos only** — 16 occlusions (`/` max ×9, `/map` max ×7). That was the real FR-2 scenario 2 violation.
     - **In the mid-transit band: brand, `/about`, `/contact`, `/privacy`** — these were *never* occluded at a settled position, and fall in the accepted category below.

     **Corrected 2026-09-01 after review.** This bullet first claimed all seven controls were occluded at settled positions. Its own cited figure refutes it: seven controls across six route×width cells would be 42, not 16. That overclaim inflated both the defect and the fix, and it is the same family the `PublicShellFrame` docblock was corrected twice to remove — reintroduced one file over, by the Leader, while recording those very corrections.

     **Fixed** in T-10: `PublicShellFrame` reserves the banner's live-measured height, and all 16 settled-position occlusions are eliminated (42/42 cells clean at max scroll, both routes, all three widths).
   - **What remains accepted is the transit band.** A `fixed bottom-0` bar of height *h* necessarily overlays any element for an *h*-wide band of scroll space as it travels to its resting position — `S ∈ [c − H, c − H + h]` — and on a scrolling page that band is **invariant under trailing padding**. Since this section prescribes `fixed bottom-0`, a requirement forbidding all transit occlusion would forbid the design this section mandates. Closing it would mean abandoning `fixed`, which is a different decision than this one.

   **This section's original single-item list is exactly the defect `requirements.md` §4.1 predicted:** layout occlusion is the one class in this spec with no automated gate, so the accepted-risk set was written from reasoning rather than measurement, and it under-counted. Seven tasks and 1,475 green tests could not see it; the substituted gate saw it on its first run.

`z-[1100]` is an arbitrary Tailwind value. It is **not** an NFR-2 violation: `docs/ux-ui/design.md` §7 defines no z-index scale, and `MapLegend`'s `z-[1000]` is the established in-repo precedent for exactly this. Called out here so a Reviewer greping for arbitrary values reads it as precedent rather than drift.

### 5.5 GA4 mount (FR-1, FR-4, FR-7)

- Injected via `next/script` with `strategy="afterInteractive"`, rendered conditionally on `granted`, deduped by a stable `id` so navigation cannot double-inject.
- **Missing measurement ID short-circuits to rendering nothing** — the same graceful-absence posture `frontend/lib/auth/amplify-config.ts` already takes for absent `NEXT_PUBLIC_COGNITO_*`. A build without the variable is a build without analytics, never a broken build (FR-7).
- `onError` is handled and swallowed: no visitor-facing error surface, no console throw, **no retry** (FR-7 forbids a retry loop becoming its own failure mode).
- **Zero custom calls.** The component's only outbound interaction is the vendor's own config initialisation. No `event`, parameter, dimension, or user-property call site exists anywhere in the codebase after this change — which is what makes FR-4 auditable by a source-level sweep rather than by payload inspection.

### 5.6 `/privacy` (FR-6)

The page stays a static server component; only `ConsentChoiceControl` is a client island, so the static-export shape is untouched.

**The scope sentence is re-scoped, not deleted** — see the reversion challenge in §8.1. The notice moves from *"covers the contact form only"* to an explicitly enumerated two-item scope (contact submissions **and** analytics cookies) that still states what it does **not** cover: data collected through organisation registration or shown in the public directory. New content: the 4 collected signals, Google as recipient, that the cookies are set only after consent, and the control to change a prior choice.

The four existing content sections and their assertions are untouched — verified while drafting `requirements.md` FR-6: the existing test asserts those four sections and never the scope sentence.

## 6. Security & RBAC

- Roles: `Public` only. No guard, no serializer, no token, no authenticated path participates.
- **The PII posture is structural, and it is the same argument ADR-010 makes for `Registration.payload`:** protection comes from there being nothing to filter, not from filtering correctly. Zero custom events means no code path exists that could carry an actor id, a `PII_ALLOWLIST` value, or a directory search string to Google. A filter would have to be correct forever; an absent call site cannot regress silently — and FR-4's source-level sweep is what keeps it absent.
- The registry's existing PII boundary (`docs/trd/trd.md` QA-1/QA-13, `backend/src/common/role-aware.serializer.ts`) is unaffected: this spec adds no read path.
- **CSP:** `infra/` defines no Content-Security-Policy today, so nothing blocks the vendor script. Out of scope — but a future CSP must allowlist the Google analytics hosts or FR-1 silently stops working.

## 7. Infrastructure / Deployment

No AWS resource is created or changed. One build-time variable is added.

| Where | Value | Rationale |
|---|---|---|
| `infra/scripts/deploy-frontend.sh` | `GA_MEASUREMENT_ID` with a committed default, injected as `NEXT_PUBLIC_GA_MEASUREMENT_ID` on the existing `npm run build` line | Mirrors the script's established `API_BASE_URL` override pattern, except the default is a committed constant rather than a CloudFormation output — no AWS resource backs a GA4 property. |
| `frontend/.env.example` | Documented, **empty** | The committed file that teaches the contract. |
| `frontend/.env.local` | Deliberately **unset** | Setting it locally would pollute the property with development traffic. Banner and every test work without it. |

**A GA4 measurement ID is not a secret** — it is transmitted to every visitor in the page source by design, so SSM / Secrets Manager (which `docs/trd/trd.md` §8 reserves for DB credentials and Cognito config) is the wrong home. Committing the default is what removes the silent-failure mode created by FR-7: because an absent variable is non-fatal, a deploy that forgets it ships a build with no analytics and says nothing.

Deploy is unchanged: `AWS_PROFILE=IBD-DEV ./infra/scripts/deploy-frontend.sh` — that script reads `AWS_PROFILE` and parses no flags.

## 8. Decision Records

### DD-1: Gate by non-injection, not by consent-mode `denied`
- **Context:** FR-1 requires no collection before consent.
- **Options:** (a) withhold the script until granted; (b) inject immediately with GA4 consent mode defaulting to `analytics_storage: denied`, then update on grant.
- **Decision:** (a).
- **Consequences:** Zero requests reach Google pre-consent, where (b) still transmits cookieless pings — collection under any plain reading of FR-1. (a) is also assertable in jsdom as the absence of a DOM element, where (b) would require intercepting vendor network behaviour the harness cannot see. Cost: the page view for the page the visitor was on when they consented is recorded at grant time rather than at load, and a rejecting visitor produces no data at all. Both are correct outcomes, not losses.

### DD-2: Browser storage, not a cookie, for the consent record
- **Context:** the choice must persist client-side (FR-3).
- **Options:** cookie; `localStorage`.
- **Decision:** `localStorage`, wrapped in total failure tolerance.
- **Consequences:** Under ADR-002 no server reads this value, so a cookie would be transmitted on every API request for no consumer. Cost: unavailable in some privacy modes — which FR-3 already requires handling, resolving to `undecided` (banner shown, nothing collected), the safe direction.

### DD-3: Structural admin exclusion via layout placement
- **Context:** FR-5.
- **Options:** runtime pathname allowlist in the root layout; mount in `(public)/layout.tsx`.
- **Decision:** layout placement.
- **Consequences:** A pathname filter is a list a future route can fall through; layout placement makes the exclusion a property of the tree. This is ADR-010's containment-over-filtering argument applied to the client. Free side effect: the admin `z-50` dialogs can never contend with the banner's `z-[1100]`, because they cannot coexist.

### DD-4: A single provider owns the state, rather than each consumer reading storage
- **Context:** the banner, the script mount, and `/privacy`'s change control all need the same value.
- **Decision:** one context provider in the `(public)` layout; consumers use a hook.
- **Consequences:** Changing the choice on `/privacy` propagates through the context immediately, with no reload — three independent storage readers would have left the layout stale until navigation. Cost: one context, mirroring `SessionProvider`'s existing shape. **Note the scope of "immediately" (corrected 2026-09-01):** the *context value* and every consumer of it update at once, which is what this decision bought. Whether **collection** stops is a different question and is direction-dependent — see the asymmetry table in §5.2. This bullet previously read "takes effect immediately", which was true of accept and false of reject.

### DD-7: The banner's visibility condition is derived in the provider, not composed by consumers
- **Context:** raised by T-2's Reviewer during execution, and approved by the user at the T-2 gate. The three-value contract `tasks.md` T-2 originally assigned is spec-conformant and faithfully mirrors `SessionProvider` — but it makes the *incorrect* usage the natural one.
- **Options:** (a) leave the raw contract and instruct T-4's Reviewer to FAIL a bare `consent === 'undecided'` check; (b) expose a derived `showBanner` boolean; (c) restructure `ConsentState` so `'undecided'` is unreachable before resolution.
- **Decision:** (b).
- **Consequences:** The failure mode becomes structurally unreachable instead of depending on a review instruction holding across three later tasks. In `SessionProvider` the analogous slip is benign — public chrome flashes briefly; here it *is* the FR-3 violation, and it fails invisibly in jsdom, which is the combination that makes a convention insufficient. (c) was rejected as a larger change to a contract three tasks already depend on. Cost: one derived value, and `design.md` §5.2 / `tasks.md` T-2 and T-4 amended mid-execution.

### DD-5: The change-choice control lives on `/privacy` (resolves OQ-4)
- **Options:** a footer link; a control on `/privacy`.
- **Decision:** `/privacy`, as a client island.
- **Consequences:** FR-6 already requires `/privacy` to state the route, so co-locating the control and its explanation avoids a second surface. The Footer is untouched. Cost: `/privacy` gains its first interactive element; kept to an island so the page stays static.

### DD-6: No banner motion
- **Decision:** the banner appears with no transition.
- **Consequences:** NFR-3 is satisfied by construction rather than by a `matchMedia` gate, and GSAP stays out of the `(public)` layout. Recorded so the absence reads as intentional.

### 8.1 Reversion challenge (Step 2.3)

One decision reverts delivered behaviour: **FR-6 removes `/privacy`'s contact-form-only scope statement**, shipped days earlier with its narrowness explicitly deliberate — the page's own header records *"Scope is deliberately narrow… not a site-wide privacy policy."*

**Challenge — what does removing it break?** It would turn `/privacy` into an implied site-wide policy that the page does not deliver. The notice still says nothing about how the registry handles organisation-registration data or what it publishes in the directory. Deleting the limitation over-promises to exactly the visitor the limitation was written to protect.

**Outcome — the design changed.** The scope statement is **re-scoped to an enumerated two-item set**, not deleted: this notice covers contact submissions and analytics cookies, and still explicitly does not cover registration or directory data. Had the challenge not run, FR-6 would have been implemented as written — "correct the false sentence" — and the honest limitation would have been lost as collateral.

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Banner occludes content or breaks layout; overlaps `MapLegend` on `/map` | **No automated gate exists** (jsdom evaluates no layout). Rendered capture at 375 / 768 / 1440 including `/map`, reviewed before merge (NFR-5). `frontend/CLAUDE.md` records a change that broke the `/register` grid with lint, contrast and build all green — this is that class. |
| Banner flashes for a visitor who already chose | The "not yet read" flag plus the derived `showBanner` boolean (§5.2, DD-7). **Asserted by a per-commit `useLayoutEffect` frame log**, not by a post-`render()` assertion — `act()` flushes a synchronous mount effect before `render()` returns, so an assertion made afterwards cannot reach the pre-resolution frame and passes even when the flag is deleted. Established at T-2's FAIL; a plain post-render assertion here is not evidence. |
| A future contributor adds a custom event, silently reintroducing the FR-4 exposure | Source-level sweep for custom-event call sites as a standing verification, plus the rationale recorded in FR-4 and §6 so the constraint reads as deliberate rather than unfinished. |
| A deploy forgets the measurement ID and ships analytics-free, silently | Committed default in the deploy script (§7). |
| A future CSP blocks the vendor script | Recorded in §6; out of scope by §6 of `requirements.md`. |
| The real GA4 property receives nothing despite a green suite | Unmeasurable here; accepted risk with a post-deploy manual first-load check (`requirements.md` §4.1). |

## 10. Test Plan Outline

| Coverage | Level | Maps to |
|---|---|---|
| No analytics script element and no vendor global before a choice | component | FR-1 |
| Script injected once on grant; not re-injected on navigation | component | FR-1 |
| Banner exposes two keyboard-reachable controls; page beneath stays operable | component | FR-2 |
| Not `role="dialog"`; no focus trap; no backdrop | component | FR-2 |
| Choice survives reload; stale policy version re-prompts; throwing storage resolves to `undecided` | unit + component | FR-3 |
| No custom event / parameter / dimension call site exists | component + source sweep | FR-4 |
| `(admin)` renders no script and no banner — **run against a variant with the provider moved to the root layout and shown to FAIL** | component | FR-5, KZ-002 ×3 |
| Root layout contains no analytics reference | source | FR-5 |
| `/privacy` discloses the 4 signals, Google, consent-gating, and the change route; the 4 existing sections still pass | component | FR-6 |
| Script load failure leaves the page whole, silent, and non-retrying | component | FR-7 |
| Banner axe-clean | `jest-axe` | NFR-1 |
| Static export still builds | `npm run build` | NFR-6 |

**Not covered, deliberately, and recorded rather than implied:**
- **Contrast of the accept button.** `primary-fg`→`primary` appears in neither the INKS nor the GROUNDS list of `frontend/lib/contrast.test.ts`, so **every primary button in the app is already unasserted** for contrast. This spec inherits that gap; the banner must not become the pretext for closing it app-wide. The banner's text pairs (`fg`→`surface`, `muted`→`surface`) *are* in the REACHABLE set and are covered by reusing those tokens.
- **Layout, occlusion, and the `/map` overlap** — NFR-5's rendered capture, not a test.
- **Live ingestion by the GA4 property** — post-deploy manual check.

## 11. Budget (Step 2.4)

Estimated from the design above, and a **tripwire for `/akili-execute`**, not a quality cap. Exceeding it is information: the Leader stops and escalates rather than continuing.

| Metric | Estimate |
|---|---|
| Tasks | **9** — was 8; T-9 added 2026-08-31 from T-8's finding, user-approved |
| LOC (implementation + tests) | **~1,600** — roughly 600 implementation, 1,000 tests |
| Review rounds | **~13** — one per task plus ~5 rework rounds |

**Re-baselined during Phase 3 (from 7 tasks / 8 rounds).** The rendered-layout verification was split out of the env-wiring task into its own T-8: it is the substituted gate for NFR-5, the one defect class with no automated coverage, and folding it into another task's *done when* would have made it quietly skippable. Recorded rather than silently adjusted — a budget edited without a reason is not a tripwire.

The estimate matches the declared **Standard** depth: nine tasks with one substantive component is not a Lite change, and the absence of any data, API, auth, or migration surface keeps it below Full. It crosses the ~400-LOC line where `/akili-specify` asks about splitting delivery — addressed in `tasks.md`.

**Re-baselined 2026-08-31 at the T-2 gate, from ~580 LOC / 9 rounds, with the user's approval.** The tripwire fired correctly and the diagnosis is recorded in `execution.md` under T-2: **implementation LOC is tracking *under* budget (269 of 330 after two tasks); the entire overrun is tests.** The original figure assumed a test-to-implementation ratio of ~0.76:1; the observed ratio is **1.72:1**.

The cause is this spec's own defining feature. Every task carries an evidence-disqualifier clause, and satisfying one costs real test engineering rather than an extra `expect` — T-2's needs a per-commit `useLayoutEffect` probe to observe a pre-resolution React frame. That discipline is not overhead here: it is what caught T-2's suite passing 11/11 while blind to the exact flash the task is named for. The re-baseline pays for the mechanism rather than removing it.

Re-derived task by task at the observed ratio rather than adjusted by a round factor: T-3 ~240 · T-4 ~330 · T-5 ~105 · T-6 ~200 · T-7 ~20 · T-8 ~0 (evidence only), plus the 732 already landed. **The tripwire stays armed at the new figure** — a second breach is a signal about the spec, not about the estimate.

## 12. Baseline documents this spec will make stale

Not edited by this spec — recorded for the `/akili-archive` sync, since a baseline doc that silently disagrees with the code is drift:

| Document | What changes |
|---|---|
| `docs/ux-ui/design.md` §4 (Screen Inventory) | The `Privacy` row describes contact-submission content only. |
| `docs/ux-ui/design.md` §2 (IA) | `/privacy` is annotated *"Privacy notice — static content"*; it gains one interactive island. |
| `docs/ux-ui/design.md` §8 (Component Inventory) | Has no consent-banner entry. |
| `docs/trd/trd.md` §7 (Integration Points) | Google Analytics becomes the first third-party client-side integration and the first client-side data transfer to a third party. |
| `docs/trd/trd.md` §12.5 (ADR Index) | Proposed **ADR-011** — consent-gated client-side analytics, contained by layout placement (DD-1 + DD-3). New entry; supersedes nothing. |
| `docs/ux-ui/design.md` §7 / this document §5.3 | **Added 2026-08-31 at the T-4 gate.** §5.3's token table under-enumerates the accept button: it lists `bg-primary text-primary-fg hover:bg-primary-hover` with no border, but the delivered control carries `border border-primary` for dimensional parity with reject (Leader ruling, T-4 attempt 2 — see `execution.md`). Without this row the design document silently disagrees with the code. |
