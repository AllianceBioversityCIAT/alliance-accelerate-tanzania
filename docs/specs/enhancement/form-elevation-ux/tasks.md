# Tasks — Form elevation close-out and ladder completion

- **Spec path:** `docs/specs/enhancement/form-elevation-ux/`
- **Status:** Draft — awaiting approval
- **Author / Date:** AKILI (Leader) on behalf of JuanCode · 2026-08-08
- **Budget (`design.md` §11):** 6 tasks · ~120 LOC · 8 review rounds
- **Approval Mode:** `gated`

> **Standing constraint for every task — NFR-5.** Contrast, lint and build **do not evaluate
> layout**. All three passed green on the `float-left` attempt that shipped a broken registration
> form to Dev. Any task altering flow, positioning or spacing must be rendered and inspected at
> 375 / 768 / 1440 **before** the deploy that carries it.

## Tasks

- [x] **T-1** Move the card treatment to a wrapping `<div>`; leave the fieldset semantic-only  (deps: none)
      **Size:** M (~60 LOC) · **Skills:** `tailwind-design-system`, `frontend-design`, `react-doctor`
      **Scope:** For all **11** fieldsets (`RegistrationForm.tsx` ×5, `ActorForm.tsx` ×6): wrap each `<fieldset>` in a `<div>` that takes the card treatment (`rounded-md border border-border bg-surface p-4 sm:p-6 shadow-sm`), and reduce the `<fieldset>` to `border-0 p-0 m-0` with no background. The `<legend>` loses `bg-surface` — it no longer straddles anything and needs no fill. Field grids, `Field`/`renderInput` calls, and every other class string stay untouched.
      **In the same change (KZ-004/KZ-008):** update every `REACHABLE` citation in `frontend/lib/contrast.test.ts` that this restructure moves. **T-7 of `app-visual-refresh` skipped exactly this step and left two citations stale** — that is why FR-4 exists.
      **Traces:** FR-1 (all clauses), NFR-1, NFR-3, NFR-4 · `design.md` DD-1, §7.1, §7.2
      **Files:** `frontend/components/register/RegistrationForm.tsx`, `frontend/components/admin/ActorForm.tsx`, `frontend/lib/contrast.test.ts`
      **Verify:** `cd frontend && npm test -- RegistrationForm ActorForm contrast --silent && npm run build && npx next lint --quiet`
      **Done when:** all 11 cards render an unbroken border and corner radius; every `<fieldset>` is borderless and every wrapper carries `border border-border`; `ActorForm.test.tsx:529-531` (`select.closest('fieldset')` + `within(fieldset).getByText(...)`) still passes unmodified; `jest-axe` reports no new violation; a rendered capture at 375/768/1440 shows no white tab and no misaligned legend.
      **Evidence is disqualified if:** (a) any wrapper lacks `border border-border` — `--color-surface` vs `--color-bg` is **1.05:1**, so the border is what carries the section boundary under WCAG **1.4.11**; "it has a shadow now" is precisely the NFR-1 breach this clause exists to catch. (b) The done-condition is claimed from computed styles or class presence alone. **A `getBoundingClientRect` probe reporting `straddles:false` was already used to argue VF-4 did not exist, and it was wrong** — it compared the fieldset's border-*box*, not the painted border. Measure **and** look. (c) A test was edited to accommodate the restructure rather than the restructure preserving the test.

- [x] **T-2** Resolve `--shadow-xs`: re-tune to a perceptible value, or remove the rung  (deps: T-1)
      **Size:** S (~15 LOC) · **Skills:** `tailwind-design-system`, `frontend-design`
      **Scope:** **Primary path** — change the `--shadow-xs` value in `app/globals.css`, keeping 1 px offset / 2 px blur geometry so it stays geometrically lighter than `--shadow-sm` (2 px / 4 px), and raising alpha until an input at rest is distinguishable from flat. Update `docs/ux-ui/design.md` §7 to the new value in the same change. **Fallback path (pre-authorised, no escalation needed)** — if no value satisfies "visible **and** lighter than `sm`", remove `--shadow-xs`, its `tailwind.config.ts` mapping, and the `'shadow-xs'` entry from **both** `inputClasses()` copies (`RegistrationForm.tsx:452`, `ActorForm.tsx:512`), and state a three-rung ladder in `design.md` §7 and §5.1.
      **Note:** there is **no shared input primitive** — `inputClasses()` is a byte-identical duplicate in both forms. Whichever path is taken, **both copies change or neither does**, and the report must say which.
      **Traces:** FR-2 (both branches and all clauses), NFR-2 · `design.md` DD-2
      **Files:** `frontend/app/globals.css`, `docs/ux-ui/design.md`, and (fallback only) `frontend/tailwind.config.ts`, `frontend/components/register/RegistrationForm.tsx`, `frontend/components/admin/ActorForm.tsx`
      **Verify:** `cd frontend && npm test -- contrast --silent && npm run build && npx next lint --quiet`
      **Done when:** a side-by-side capture at 1440 and `deviceScaleFactor: 2` shows an input at rest distinguishable from the same input with no shadow **and** less raised than its enclosing `shadow-sm` card — **or** the fallback is taken in full, with no orphan token left defined.
      **Evidence is disqualified if:** (a) the token is re-wired or re-reported at its **current** value — `0 1px 2px rgba(61,47,32,0.04)` was already applied by T-7 and rendered flat; repeating it reproduces a known non-result. (b) The pass is claimed from `.shadow-xs` appearing in the CSS bundle. **That is a presence assertion (KZ-002) and it was already true when the rung was invisible.** (c) The comparison is inconclusive and is reported as a pass — **inconclusive is a legitimate, reportable outcome here**; take the fallback or escalate, never round up.

- [x] **T-3** Give `--shadow-lg` its consumers: the four dialogs  (deps: none)
      **Size:** XS (~4 LOC) · **Skills:** `tailwind-design-system`
      **Scope:** Swap `shadow-md` → `shadow-lg` on the panel element of `ConfirmDialog.tsx:154`, `AcknowledgeDialog.tsx:216`, `CreateUserDialog.tsx:216`, `EditUserDialog.tsx:184`. Nothing else in these files changes.
      **Do NOT touch:** the backdrops. `ConfirmDialog`/`AcknowledgeDialog` use `bg-backdrop` while `CreateUserDialog`/`EditUserDialog` use `bg-fg/40` — a **real** inconsistency, deliberately out of scope (FR-3's negative clause, `design.md` DD-3). Also do not touch focus trap, escape handling, or `role="dialog"`.
      **Traces:** FR-3 (all clauses), NFR-4 · `design.md` DD-3
      **Files:** `frontend/components/admin/{ConfirmDialog,AcknowledgeDialog,CreateUserDialog,EditUserDialog}.tsx`
      **Verify:** `cd frontend && npm test -- Dialog --silent && npm run build && grep -c 'shadow-lg' .next/static/css/*.css`
      **Done when:** all four panels carry `shadow-lg`; `.shadow-lg` is present in the built CSS bundle (it is currently **absent** — 0 consumers); a rendered dialog capture shows the panel more raised than a `shadow-sm` fieldset; all four dialog test suites pass unmodified.
      **Evidence is disqualified if:** only some dialogs are changed — FR-3 requires all four so no two diverge; or if a backdrop class changed in the diff.

- [x] **T-4** Associate the GPS copy, and stop the badges stretching  (deps: none)
      **Size:** S (~8 LOC) · **Skills:** `react-doctor`, `vercel-react-best-practices`
      **Scope:** Two small, independent correctness fixes, grouped because each is a few lines and neither shares a file with the other.
      1. **FR-5** — give the GPS-optional `<p>` (`RegistrationForm.tsx:649-652`) an `id`, and append that id to the `aria-describedby` of **both** GPS inputs, *alongside* each field's existing hint id (`Decimal between -90 and 90` / `-180 and 180`), never replacing it.
      2. **FR-6** — make `ConsentBadge` **and** `SourceBadge` (`ActorsTable.tsx:302-326`) hug their content. The badges are already `inline-flex`; the defect is the `flex flex-col` parent's default `align-items: stretch`. Apply the fix at the **badge** so it holds under any wrapper.
      **Traces:** FR-5 (all clauses), FR-6 (all clauses), NFR-3 · `design.md` §7.3, §7.4
      **Files:** `frontend/components/register/RegistrationForm.tsx`, `frontend/components/admin/ActorsTable.tsx`
      **Verify:** `cd frontend && npm test -- RegistrationForm ActorsTable --silent && npm run build && npx next lint --quiet`
      **Done when:** both GPS inputs' `aria-describedby` resolves to the hint **and** the GPS copy (assert in RTL, not by reading the source); a `Published` badge and a longer-status badge measure at **different** widths, each equal to text + horizontal padding.
      **Evidence is disqualified if:** (a) FR-6 is claimed from the badge class string — the classes were **already correct**; the defect lives in the parent, so only a **measured width** proves the fix (RTL/jsdom cannot measure layout, so this needs a real-browser `getBoundingClientRect` or an equivalent rendered check, and the task must say which it used). (b) `SourceBadge` was left unfixed — it shares the identical class string and wrapper, so fixing one column leaves the same defect one column over. (c) The GPS copy was moved or its `mt-4`/`mt-2` spacing changed — the visual grouping is **already correct** (16 px above vs 8 px below) and FR-5 forbids touching it.

- [x] **T-5** Evaluate form density against a rendered baseline  (deps: T-1, T-2)
      **Size:** S (0–20 LOC — **may correctly be 0**) · **Skills:** `ui-ux-pro-max`, `frontend-design`
      **Scope:** Capture both forms before/after at 375 / 768 / 1440 **against the post-T-1 render** (T-1 relocates padding, so today's spacing is not the baseline). Judge whether the six-section `ActorForm` reads calmer with tighter section spacing. Adopt a change only if the comparison supports it.
      **Traces:** FR-7 (all clauses, including the no-change outcome) · `design.md` DD-5
      **Files:** `frontend/components/register/RegistrationForm.tsx`, `frontend/components/admin/ActorForm.tsx` — **or none**
      **Verify:** `cd frontend && npm test -- RegistrationForm ActorForm --silent && npm run build` (skip if no code changed; the rendered comparison is the real gate)
      **Done when:** a before/after comparison exists at all three widths **and** a decision is recorded. **"Evaluated at three widths, no change warranted" fully satisfies FR-7** — this task is not required to produce a diff.
      **Evidence is disqualified if:** (a) spacing changed without a before/after comparison to justify it — FR-7 is a `SHOULD` gated on evidence, not a licence to tune. (b) Any interactive control's hit area drops below **44×44 CSS px**, or the `lg:grid-cols-2` field arrangement changed. (c) The change exceeds one step on the Tailwind spacing scale — that trips the `design.md` §11 tripwire and must escalate rather than land.

- [ ] **T-6** Close FR-4's sweep, capture the full rendered set, and run the human gate  (deps: T-1, T-2, T-3, T-4, T-5)
      **Size:** M · **Skills:** `ui-ux-pro-max`, `frontend-design`
      **Scope:** Three closing acts.
      1. **FR-4 closure** — re-resolve **every** `file:line` citation in `contrast.test.ts`'s `REACHABLE` map against the final tree, not only the two known-stale ones and not only what T-1 moved. Add any ink/ground pair inside a fieldset newly reachable on `--color-surface`.
      2. **Rendered evidence** — capture `/register`, `/admin/actors/new`, the admin table, and one open dialog at 375 / 768 / 1440, asserting `window.innerWidth` in-page on every shot. The harness and method are in `../app-visual-refresh/captures/`.
      3. **Human gate** — present the set for explicit approval of FR-1, FR-2 and FR-7, the three requirements with **no automated gate** (`requirements.md` §8).
      **Traces:** FR-4 (all clauses), FR-1/FR-2/FR-7 rendered closure, NFR-1, NFR-5, NFR-6 · `requirements.md` §8, §10
      **Files:** `frontend/lib/contrast.test.ts`, `docs/specs/enhancement/form-elevation-ux/execution.md` (+ captures)
      **Verify:** `cd frontend && npm test -- --silent && npm run build && npx next lint --quiet && git diff --stat`
      > **Suite gate.** The full frontend suite is **nondeterministic** — four runs on an unchanged tree gave 1, 0, 3, 3 failures in *different* suites, all passing in isolation (recorded in `../app-visual-refresh/tasks.md` T-6). **A bare pass/fail count is not evidence either way.** The gate is: every suite failing under full-suite load MUST pass in isolation, and no failure may reference anything this spec changed. This flakiness is pre-existing repo health and **must not be absorbed into this spec**.
      **Done when:** every `REACHABLE` citation resolves; `git diff --stat` shows **only** the 10 files in `design.md` §3; captures exist for all four surfaces at all three widths; **and the user has explicitly approved the visual result.**
      **Evidence is disqualified if:** (a) captures were taken against stale CSS — fetch the served bundle and assert the token set before trusting any frame. (b) A T6 vision verdict is treated as the gate. **It is advisory input.** In `app-visual-refresh` T-6 two T6 rounds described the same defect **incompatibly** and a Leader probe agreed with neither; the adjudication is the Leader's, on the pixels. (c) **Direction to proceed is recorded as approval.** "Continue", "do as you see fit", or silence are **not** aesthetic sign-off — this exact conflation had to be corrected once already in the predecessor spec.

## Dependency Graph

```
T-1 ─┬─▶ T-2 ─┬─▶ T-5 ─▶ T-6
     │        │
     └────────┴─────────▶ T-6
T-3 ────────────────────▶ T-6
T-4 ────────────────────▶ T-6
```

T-1 is the only root with dependents. **T-3 and T-4 are independent of everything** and may run in
parallel with T-1 (different files; the Leader's width cap of 2 concurrent applies).

## Coverage closure (KZ-001)

Every scenario and every `BUT it MUST NOT` / `AND IT MUST` clause is owned by a named task.

| Requirement | Clause | Owner |
|---|---|---|
| FR-1 | unbroken border/radius; title dominant | T-1 |
| FR-1 | BUT NOT by removing/weakening the border | T-1 disqualifier (a) |
| FR-1 | BUT NOT removing fieldset/legend from the a11y tree | T-1 done-when (`jest-axe`, `closest('fieldset')`) |
| FR-1 | AND MUST be proven by rendered capture before deploy | T-1 done-when + T-6 §2 |
| FR-2 | re-tune branch: distinguishable from flat | T-2 |
| FR-2 | AND MUST stay lighter than `shadow-sm` | T-2 done-when |
| FR-2 | BUT NOT re-wired at the current value | T-2 disqualifier (a) |
| FR-2 | remove branch: token + mapping + both usages together | T-2 fallback |
| FR-2 | AND NOT leave a token defined with zero consumers | T-2 done-when |
| FR-3 | panel carries `shadow-lg`; in the bundle | T-3 |
| FR-3 | AND MUST apply to all four dialogs | T-3 disqualifier |
| FR-3 | BUT NOT alter backdrop / focus / role | T-3 "Do NOT touch" |
| FR-4 | cited lines contain what they claim | T-1 (same-change) + T-6 §1 |
| FR-4 | AND MUST sweep every citation, not only the named | T-6 §1 |
| FR-4 | AND MUST add newly reachable pairs | T-6 §1 |
| FR-4 | BUT NOT weaken a ledger entry to pass | T-6 §1 (and FR-4's own clause) |
| FR-5 | accessible description includes the copy | T-4.1 |
| FR-5 | AND MUST preserve per-field hints | T-4.1 |
| FR-5 | BUT NOT move it or change its spacing | T-4 disqualifier (c) |
| FR-6 | badges measure at content width, and differ | T-4.2 |
| FR-6 | AND MUST apply to `SourceBadge` too | T-4 disqualifier (b) |
| FR-6 | BUT NOT change colour/radius/padding/arrangement | T-4.2 scope |
| FR-7 | adopt only if comparison supports it | T-5 |
| FR-7 | AND MUST report "no change" when inconclusive | T-5 done-when |
| FR-7 | BUT NOT drop hit areas below 44×44 or change the grid | T-5 disqualifier (b) |
| NFR-1 | 3:1 boundary floor | T-1 disqualifier (a), contrast suite |
| NFR-2 | tokens only; only `xs` may change | T-2 scope, T-6 diff check |
| NFR-3 | a11y preserved or improved | T-1, T-4 |
| NFR-4 | no behavioural change | T-3 scope, T-6 diff check |
| NFR-5 | rendered evidence before deploy | standing constraint + T-6 §2 |
| NFR-6 | no bundle-size regression | T-6 verify |

## Testing & Verification Expectations

- **A presence assertion is not behaviour (KZ-002).** This spec has three requirements — FR-1,
  FR-2, FR-6 — whose *classes were already correct while the defect existed*. For each, the class
  check is explicitly **not** the gate; a rendered measurement is.
- **jsdom cannot evaluate layout, contrast, or whether a style visibly applies.** Those properties
  are routed to a real-browser measurement or the human/T6 gate at T-6, never counted as covered
  by RTL.
- Prefer the smallest verifying command; the full suite runs only at T-6, under the flakiness gate
  recorded there.

## Execution Conventions

- Commits: `[SPEC:enhancement/form-elevation-ux] <message>`.
- Evidence before checkbox: append the Reviewer PASS to `execution.md` **first**, then flip
  `tasks.md`, then commit.
- No new PII field is introduced; `phone`/`email` handling is untouched.
- Deploys are operator-run with `--profile IBD-DEV`; the agent runs gates only.
