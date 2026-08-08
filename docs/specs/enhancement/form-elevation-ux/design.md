# Design — Form elevation close-out and ladder completion

- **Spec path:** `docs/specs/enhancement/form-elevation-ux/`
- **Status:** Draft — awaiting approval
- **Author / Date:** AKILI (Leader) on behalf of JuanCode · 2026-08-08
- **Depth:** Standard
- **Implements:** `requirements.md` FR-1…FR-7, NFR-1…NFR-6
- **Related:** `docs/ux-ui/design.md` §5.1, §5.5, §7 · `enhancement/app-visual-refresh` design.md §5.1

## 1. Executive Summary

Six changes, all presentational, across the **ten** files listed in §3 (eleven if FR-2 takes its
fallback branch, which additionally touches `tailwind.config.ts`). The load-bearing decision is **DD-1**: move
the card treatment off the `<fieldset>` and onto a wrapping `<div>`, so the `<legend>` has no
border to straddle. That resolves FR-1 without floats, without `sr-only` duplication, and without
touching a single test assertion — the three alternatives all break something, and two of them
break something already verified.

Everything else is small: one token value (FR-2), a class swap on four dialogs (FR-3), a citation
sweep (FR-4), an ARIA id (FR-5), an alignment fix (FR-6), and a density evaluation that may
correctly result in no change (FR-7).

**No backend, data, API, or contract surface is touched.** Sections 5–7 and 9 of the template are
therefore recorded as not applicable rather than padded.

## 2. Architecture Overview

No architectural change. This spec operates entirely inside the frontend presentation layer:
Tailwind token mappings (`tailwind.config.ts`), CSS custom properties (`app/globals.css`), and
component class strings. The static-export shape, routing, data flow, and API client are untouched.

## 3. Extended Directory Structure

| Path | Change |
|---|---|
| `frontend/app/globals.css` | `--shadow-xs` value (FR-2) |
| `frontend/components/register/RegistrationForm.tsx` | fieldset→card restructure ×5, GPS ARIA id (FR-1, FR-5) |
| `frontend/components/admin/ActorForm.tsx` | fieldset→card restructure ×6 (FR-1) |
| `frontend/components/admin/ActorsTable.tsx` | badge alignment (FR-6) |
| `frontend/components/admin/ConfirmDialog.tsx` | `shadow-md`→`shadow-lg` (FR-3) |
| `frontend/components/admin/AcknowledgeDialog.tsx` | `shadow-md`→`shadow-lg` (FR-3) |
| `frontend/components/admin/CreateUserDialog.tsx` | `shadow-md`→`shadow-lg` (FR-3) |
| `frontend/components/admin/EditUserDialog.tsx` | `shadow-md`→`shadow-lg` (FR-3) |
| `frontend/lib/contrast.test.ts` | `REACHABLE` citation sweep (FR-4) |
| `docs/ux-ui/design.md` | §7 `--shadow-xs` value, §5.1 ladder note (FR-2, FR-3) |

**No file outside this list may change.** `tailwind.config.ts` is *not* listed — the `xs` mapping
already exists and only the CSS variable's value changes.

## 4. Data Model

**Not applicable.** No entity, field, migration, or Prisma change.

## 5. API Design

**Not applicable.** No endpoint, DTO, serializer, or contract change. No PII surface is touched.

## 6. Backend Module Design

**Not applicable.** No backend change.

## 7. Frontend / UX Component Architecture

### 7.1 The section container, restructured

Today a single `<fieldset>` carries both roles: it is *the semantic group* and *the visual card*.
Those roles conflict, because a native `<legend>` is painted across its fieldset's top border.

The design separates them:

| Element | Role after DD-1 |
|---|---|
| wrapping `<div>` | **the card** — radius, border, `bg-surface`, `shadow-sm`, padding |
| `<fieldset>` | **the group only** — no border, no padding, no margin, no background |
| `<legend>` | a normal block heading *inside* the card, with no border to interrupt |

There is existing precedent in the tree: `DirectoryFilters.tsx:90` already runs a borderless
`<fieldset>` (`border-0 p-0 m-0`) for exactly this reason — the visual container is not the
semantic one.

### 7.2 Element hierarchy

Card `<div>` → `<fieldset>` → `<legend>` + the existing field grid. The grid `<div>` and every
`Field`/`renderInput` call are untouched; only the container nesting changes.

### 7.3 Badge alignment (FR-6)

`ConsentBadge` and `SourceBadge` are correct in isolation; their parent is the defect. The fix is
applied at the **child** (a self-alignment utility on each badge) rather than the parent, so it
holds regardless of which wrapper a badge is later dropped into. Both badges get it — they share
the class string and the defect.

### 7.4 GPS description (FR-5)

The existing standalone paragraph gains an `id` and is appended to both GPS controls'
`aria-describedby`, alongside — not instead of — each field's own hint id. Visual position and
spacing are unchanged; FR-5 explicitly forbids moving it.

## 8. Shared Contracts / Package Extensions

**Not applicable.** No shared package, type, or contract change.

**Recorded, not undertaken:** there is no shared input primitive. `components/ui/` holds only
`Button`, `Skeleton`, `StatCard`, and `inputClasses()` is a byte-identical duplicate in both
forms. FR-2 therefore edits two copies. Extracting a primitive is out of scope
(`requirements.md` §6) and wants its own proposal.

## 9. Design Decisions

### DD-1 — Move the card treatment to a wrapping `<div>`; the fieldset keeps only semantics

**Implements FR-1.** Four mechanisms were considered. Three fail on evidence already in hand.

| Option | Verdict |
|---|---|
| `float-left w-full` on the legend | **Rejected — already tried and shipped broken.** Removes the legend from flow; content overlapped and inputs crushed right. Contrast, lint and build all passed green |
| `sr-only` legend + visible heading `<div>` | **Rejected — breaks a verified test.** `ActorForm.test.tsx:531` runs `within(fieldset).getByText('Consent & provenance')`; a duplicated text node returns two matches and throws. Also risks double announcement in AT |
| Keep the notch, commit to it visually | **Rejected.** The proposal establishes that no background value works: card-coloured protrudes into the canvas, canvas-coloured intrudes onto the card. The element crosses the boundary |
| **Card `<div>` wraps a borderless `<fieldset>`** | **Selected** |

**Why it wins:** the artefact exists only because a legend interrupts *its own fieldset's* border.
Remove the border from the fieldset and the interruption has nothing to interrupt. The legend
becomes an ordinary block-level heading inside a padded card.

It also preserves everything the alternatives break: **one** text node (no `getByText` ambiguity),
the native `<fieldset>`/`<legend>` pairing intact for assistive technology (`jest-axe` gates this
on `ActorForm`), `select.closest('fieldset')` still resolving (`ActorForm.test.tsx:529`), and the
field grid untouched inside the fieldset.

**Reversion challenge (Step 2.3).** DD-1 removes `border`, `bg-surface`, `shadow-sm` and padding
from 11 elements that currently carry them — a reversion, so it was challenged. *What does
removing this break?* Answer, verified rather than speculated: **nothing, provided the wrapper
adopts them in the same edit.** The two concrete risks are (a) the fieldset losing its border
without a wrapper gaining one, which would breach **NFR-1**'s 3:1 boundary floor, and (b) a
borderless `<legend>` retaining default browser padding and reading misaligned against the card's
padding box. Both are caught by the rendered gate; (a) is additionally caught by the contrast
suite. **Neither existing test asserts the fieldset's own border**, which is why the restructure is
available at all.

### DD-2 — Re-tune `--shadow-xs`, with removal as a pre-authorised fallback

**Implements FR-2.** Per the user's decision to lift proposal §7 narrowly, the primary path is a
value change: keep the 1 px offset / 2 px blur geometry and raise the alpha, so the token stays
**geometrically** lighter than `--shadow-sm` (2 px / 4 px) even at a higher opacity. Perceived
elevation is driven more by offset and blur than by alpha, so this preserves DR-3's
nested-element-less-raised-than-container relationship while making the rung visible.

**A specific starting value is deliberately not fixed here.** It is a rendered question, and this
document has no standing to assert a perceptual result — that is the exact KZ-002 error this
spec exists to correct. The implementing task picks a candidate, captures it side by side against
flat at native scale, and **reports inconclusive rather than passing if it cannot be told apart.**

**Fallback, pre-authorised so it does not cost a rework round:** if no value survives the
"visible but lighter than `sm`" window, FR-2's *remove* branch is taken instead — drop
`--shadow-xs`, its Tailwind mapping and both `inputClasses()` usages together, and state the
ladder as three rungs in `design.md` §7.

**A design tension worth recording.** An input on a white card is arguably a *well*, not a raised
chip; `border-border` already defines it, and the honest answer may be that inputs need no shadow
at all. That reasoning favours the *remove* branch on aesthetic grounds. It is recorded rather
than acted on, because the user chose to keep the four-rung ladder — and because the rendered
comparison, not this paragraph, is what should decide it.

### DD-3 — `shadow-lg` goes to all four dialogs, and nothing else changes about them

**Implements FR-3.** A class swap from `shadow-md` to `shadow-lg` on the four dialog panels. This
gives the rung its `design.md` §7-designated consumer and makes `.shadow-lg` appear in the built
bundle, which is the machine-checkable half of FR-3.

**Observed and deliberately not fixed:** the four dialogs disagree on backdrop —
`ConfirmDialog` and `AcknowledgeDialog` use `bg-backdrop`, while `CreateUserDialog` and
`EditUserDialog` use `bg-fg/40`. That is a real inconsistency and **FR-3 explicitly forbids
touching it here**. Recorded for a future overlay pass; absorbing it would be the
advisory-becomes-scope failure this methodology names.

### DD-4 — The `REACHABLE` sweep is per-citation, not per-reported-site

**Implements FR-4.** Two stale citations are known (`ActorForm.tsx:783`→`784`,
`RegistrationForm.tsx:602`→`603`). **KZ-004** is explicit that fixing only the reported sites is
how a correction fails: the sweep walks *every* `file:line` in the map and re-resolves it against
the current tree. DD-1 moves markup in both forms, so the sweep must run **after** DD-1 lands, not
before — sequencing captured in `tasks.md`.

Newly reachable pairs are additive only. **No existing ledger entry may be weakened or removed to
make the suite green** (FR-4's negative clause).

### DD-5 — Density is evaluated, and "no change" is a valid result

**Implements FR-7.** The weakest-evidenced requirement, and the only `SHOULD`. DD-1 already
changes where padding lives, so density is re-judged against the *post*-DD-1 render, not today's.
The task's success condition is a *decision backed by a comparison*, not a spacing edit — a task
that reports "evaluated at three widths, no change warranted" has satisfied FR-7 completely.

## 10. Risks

| Risk | Mitigation |
|---|---|
| DD-1's wrapper is added but the fieldset's border is dropped without it → NFR-1 breach | Contrast suite plus the rendered gate; FR-1's negative clause names it explicitly |
| Borderless `<legend>` inherits default UA padding and misaligns | Rendered check at all three widths; it is a visible defect, not a silent one |
| DD-2 lands a value that is *still* invisible and is reported as passing | FR-2's negative clause forbids re-reporting at an unchanged value; inconclusive is a reportable outcome |
| DD-4 runs before DD-1 and re-staleness is introduced immediately | Task dependency ordering |
| Scope creeps into a form redesign via FR-7 | FR-7 is `SHOULD`, bounded to spacing, and forbidden from changing the grid or hit areas |
| Eleven restructured containers is a large mechanical diff | The 11 are byte-identical today; the change is uniform and reviewable as one pattern |

## 11. Budget (Step 2.4 sizing — the tripwire for `/akili-execute`)

| Metric | Estimate |
|---|---|
| **Expected tasks** | **6** |
| **Expected LOC** | **~120** (11 container restructures ≈ 60, dialogs 4, badges 2, ARIA 6, token 1, citations ~10, docs ~15, tests ~25) |
| **Expected review rounds** | **8** — above a normal 6 for this size, because three requirements have no automated gate and will need rendered adjudication |

**Tripwire — stop and escalate if any holds:**
- more than **8** tasks, or **200** LOC
- **any** change to validation, submission, payload construction, or an API client (NFR-4)
- any file outside §3's list
- FR-7 producing a spacing change larger than one step on the Tailwind scale

**Depth re-check.** `Standard` was the Phase 0 guess and it holds: six tasks and ~120 LOC is
comfortably above `Lite`, and there is no data, API, auth or migration surface that would justify
`Full`. The estimate is honest about the review rounds being the expensive part, not the code.

## 12. Deployment

Class, token and ARIA changes only — no build-shape or infrastructure change. Deploys remain
**operator-run** (`infra/scripts/deploy-frontend.sh`, `--profile IBD-DEV`); the agent runs gates,
never the deploy. **NFR-5 binds:** DD-1 alters layout, so its rendered capture set must exist and
be inspected *before* the deploy that carries it, not after.
