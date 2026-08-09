# Judgment Day — Findings Ledger

- Spec path: `docs/specs/enhancement/searchable-region-select/`
- Target (immutable): `design.md` @ draft, judged against `requirements.md`
- Mode: `judgment_day` · Rounds used: **2 of 2** · Status: **`JUDGMENT: APPROVED ✅`** (see the terminal receipt at the foot of this file)
- Date: 2026-08-06
- Judges: two blind, read-only, launched in parallel with identical scope. Author model was Opus 5; judges ran on **Sonnet** (Judge A) and **Fable** (Judge B) — author ≠ auditor per the project Model Routing registry.
- Judge A raised 9 findings (4 SEVERE / 4 WARNING / 1 SUGGESTION). Judge B raised 12 (3 SEVERE / 6 WARNING / 3 SUGGESTION).
- **Contradictions between judges: none.** No escalation on that axis.

## Round-1 counts

| Class | Count |
|---|---|
| Confirmed (both judges) | **5** |
| Suspect (one judge) | **11** |
| Parent-verified true despite single-judge origin | **2** (JD-9, JD-13) |
| Dismissed by parent with evidence | **1** (JD-14) |
| Contradictions | 0 |

## What both judges independently checked and could NOT falsify

Recorded because a clean result on the highest-severity criterion is evidence, not absence of work. Both judges opened the cited files:

`DiscoverRail.tsx:208` is `flex-1 overflow-y-auto p-4` on `#discover-rail-body` · `RegistrationForm.tsx:590` sets `noValidate` · `AUTOCOMPLETE_HINTS` (`:118-123`) has no `region` entry · `components/ui/` holds only `Button`, `Skeleton`, `StatCard` · no headless-UI dependency in `package.json` · `jest-axe` present, `@testing-library/user-event` absent · `regions.ts` has exactly 31 entries · 6 files import `REGIONS` · `FilterControls` fallback (`:60`), `page: 1` resets, `role="group"` (`:94`) · `DirectoryFilters` `region: undefined` on clear (`:84`), `hasActiveFilters` (`:50`) · token values `#E8EEF6`, `--dur-fast`, `--ease-out`, the reduced-motion rule, §8's shadcn preference · LOC breakdown 260+250+190 = 700 · jest-axe state count (6) and defect-class count (D1–D8) consistent across both documents.

**Zero false codebase claims found.** Every design decision's factual premise held.

---

## CONFIRMED — both judges (fix candidates)

### JD-1 · SEVERE · `design.md` §5.5 / DD-5 — close-on-scroll collides with the popup's own scrolling
*Judge A finding 3 · Judge B finding 1 — both SEVERE*

§5.5 specifies "the popup **closes** rather than repositioning" on scroll, and, four lines later, "capped with internal `overflow-y-auto`, and the active option is **scrolled into view on arrow navigation**." Element scroll events do not bubble, so catching the rail's scroll requires a capture-phase `document`/`window` listener — which also fires for the popup's own internal scroll, including the programmatic scroll-into-view mandated on every arrow press.

The implementation forks into two failures, both broken: listen in capture and the popup closes the moment arrow navigation passes the visible fold (breaks FR-2 for any filtered set taller than the cap — guaranteed with 31 options); listen non-capture and the rail's scroll is missed, so the `fixed` popup desynchronizes from its anchor inside the exact clipping container DD-5 exists to solve.

**jsdom is structurally blind to both outcomes (D6).** No automated gate catches this. This is the KZ-007 shape exactly: two individually-correct constraints, a defect living between them.

### JD-2 · SEVERE · `design.md` §5.1 / §5.6 / §12 — `aria-invalid` has no owner
*Judge A finding 4 · Judge B finding 3 — both SEVERE*

`requirements.md` FR-4 states: *"AND IT MUST preserve `aria-invalid`, `aria-describedby` → `#<id>-error`, the required-asterisk label, and the `disabled` state while `submitting`."* The native select sets it today at `RegistrationForm.tsx:541`.

The design covers `describedBy` with a prop, and §5.6's preserved-behavior column lists the asterisk, the error, the anchor, `disabled`, and the payload shape — but **not `aria-invalid`**. §12's FR-4 test row omits it too. Worse than an omission: §5.1's contract says `invalid` drives *"border styling only"*, which **actively steers an implementer away** from wiring the DOM attribute, regressing a currently-working ARIA property.

KZ-001: an AND-IT-MUST clause with no owner, sitting beside satisfied siblings that must not be allowed to discharge it.

### JD-3 · `design.md` §11 — Budget review-round figure contradicts its own decomposition
*Judge A finding 1 (SEVERE) · Judge B finding 6 (WARNING)*

"Review rounds | **8** (2 on the primitive; 1 each on the remaining 5)" — 2 + 5 = **7**, not 8. With 6 tasks there is no reading that reaches 8. The budget is `/akili-execute`'s escalation tripwire, so the headline and its decomposition must agree. KZ-005.

### JD-4 · `design.md` §5.6 — the OQ-1 fix is credited at one adopted site but present at two
*Judge A finding 2 (SEVERE) · Judge B finding 11 (SUGGESTION)*

The redundant `aria-label="Filter by region"` that overrides the visible label exists identically at `DirectoryFilters.tsx:141-149` **and** `FilterControls.tsx:142-151` — both adopted sites — plus `DashboardFilters.tsx:147` (deferred, so it survives there). §5.6 names the fix only in the `DirectoryFilters` row. An implementer following the table literally fixes one and leaves the other.

### JD-5 · `design.md` §11 — "the three adoptions (T-3…T-6)" is four tasks
*Judge A finding 7 (WARNING) · Judge B finding 12 (SUGGESTION)*

§9 row 5 and §12 both identify T-6 as the manual browser pass, not an adoption. The PR-2 range and its label disagree.

---

## SUSPECT — single judge (recorded, NOT auto-fixed)

| ID | Sev | Judge | Finding |
|---|---|---|---|
| **JD-6** | SEVERE | B | **Close-on-resize has no mobile-virtual-keyboard exemption.** On Android — the stated primary device — focusing the input opens the keyboard, firing a resize and usually a reveal-scroll. Under §5.5 both close the popup, so the control closes as it opens, on the exact surface §9 row 1 calls mandatory. Tightly coupled to the confirmed JD-1 |
| **JD-7** | WARNING | B | §5.3 says the listbox is a **"sibling"** of the input; DD-5 portals it to `document.body`. Two sections describe incompatible DOM structures. `aria-controls` keeps it ARIA-legal, but the browse-mode AT consequence of a DOM-distant popup is never mentioned, not even under D8 |
| **JD-8** | WARNING | B | **Blur fires before click on option mousedown.** With DD-4 keeping focus on the input and FR-2 requiring blur to close-and-revert, the naive composition destroys the popup before the click commits. The standard reconciliation (`preventDefault` on popup mousedown, or commit on mousedown) is specified nowhere — and tap is the primary commit gesture on mobile |
| **JD-9** | WARNING | B | **`DashboardFilters` is in the PUBLIC shell.** `requirements.md` §6 defers it as one of "the 3 **admin-facing** selects" with the rationale "Staff/Admin are trained repeat users on desktop" — **false**. ⚠️ **PARENT-VERIFIED TRUE:** it renders via `app/(public)/dashboard/page.tsx`, and `RequireRole` appears nowhere in the public tree. There are **4** public-facing region selects, not 3. This falsifies a scope premise in `requirements.md`, not only in `design.md` |
| **JD-10** | WARNING | B | FR-6 requires the live region to *"report the no-match case explicitly."* §5.3 specifies count-change reporting only; the zero-count wording is unspecified (the visible `noMatchLabel` is not the live region) |
| **JD-11** | WARNING | B | **`Home`/`End` deviates from the APG editable-combobox pattern**, which reserves them for caret movement in the input — so a user editing their filter string cannot use them for the cursor. The deviation originates in FR-2, so the design conforms to its requirement; the defect is that §9/§10 lean on *"strict ARIA 1.2 conformance"* as D8's principal mitigation without flagging that the control is not strictly conformant |
| **JD-12** | WARNING | A | DD-1 says *"~200 lines of interaction code"*; §11 says *"~260 primitive + helper"* for the same artifact. Unreconciled. KZ-005 |
| **JD-13** | WARNING | A | **WCAG citation is wrong.** §9 row 1 says *"≥44px touch targets (WCAG 2.5.8)."* ⚠️ **PARENT-VERIFIED TRUE:** SC 2.5.8 *Target Size (Minimum)* is **WCAG 2.2 AA at 24×24 CSS px**; 44×44 is SC 2.5.5 *Target Size (Enhanced)*, **AAA**. NFR-1 targets WCAG **2.1** AA, which contains neither at AA. The mitigation is sound; the citation names a standard that does not say it. ✅ **RESOLVED 2026-08-06** by user decision during T-2's execution, after two round-1 lens Reviewers re-raised it independently. Corrected at all four sites in one change (`design.md` §9 row 1, `SearchableSelect.tsx`'s option-row comment, `tasks.md` T-6's touch-target bullet, and this row) — 44px is now stated as a platform-HIG target (iOS HIG 44pt, Material 48dp) with **no** WCAG SC cited |
| **JD-15** | SUGGESTION | A | OQ-1 and OQ-2 are resolved by ID in the design; **OQ-3 is never cited**. Its resolution must be inferred from the absence of a clear-button prop |
| **JD-16** | SUGGESTION | B | §5.7 says `--color-highlight` is *"explicitly disallowed for text backgrounds"* by §7. The note (`docs/ux-ui/design.md:145`) disallows it for **small body text** and explicitly **permits** tint backgrounds; the ~2.0:1 figure is teal-as-text-on-white, not fg-on-teal. The chosen token is safe; the stated premise misquotes the source |

## DISMISSED by parent

| ID | Judge | Why dismissed |
|---|---|---|
| **JD-14** | A (WARNING) | *"§9 Reversion Challenge and §11 Budget are not in the `general-setup/design.md` template."* Judge A explicitly flagged this as unverifiable within its scope. Both sections are **mandated by `/akili-specify`** — Step 2.3 (Challenge Reversions) and Step 2.4 (Size Against the Design), whose Verification Checklist requires `design.md` to record a budget and a challenge outcome. The command was not in the judge's context. Authorized, not a deviation. Judge B, reviewing the same criterion, found no defect |

---

## Decision gate

Per the Judgment Day contract: *"Both judges confirm severe finding → **Ask before round-one correction**."*

Two SEVERE findings (JD-1, JD-2) are confirmed by both judges. Three further findings (JD-3, JD-4, JD-5) are confirmed by both at mixed severity and are mechanical corrections.

**JD-6 and JD-9 warrant user attention despite single-judge origin:** JD-6 is inseparable from the confirmed JD-1 (the same listener rule governs both scroll and resize), and JD-9 is a **parent-verified falsification of a scope premise in `requirements.md`** — it is a scope decision the user owns, not an editorial fix.

---

## Round 1 — correction applied

User-approved scope: the 5 confirmed findings, plus suspects **JD-6** and **JD-8** (both break the control on the primary mobile path), plus **JD-9** in its "correct the false premise, keep the site deferred" form.

| ID | Correction |
|---|---|
| **JD-1 + JD-6** | **DD-5 reversed.** `close-on-scroll` → **reposition-on-reflow**: capture-phase `document` scroll ignoring events where `popupRef.current.contains(event.target)`; `window` resize and `visualViewport` resize/scroll (the virtual-keyboard path) reposition; the only remaining close is the anchor leaving the viewport; `scrollIntoView` forbidden in favour of direct `scrollTop`; all rAF-throttled. Recorded as an explicit amendment naming the premature optimization as the cause of both defects |
| **JD-2** | §5.1 `invalid` now MUST set `aria-invalid="true"` **and** the danger border; §12's FR-4 row asserts present-when-errored / absent-when-clean |
| **JD-3** | Budget review rounds 8 → **7** |
| **JD-4** | OQ-1's fix credited at `FilterControls` as well |
| **JD-5** | PR-2 range and label reconciled |
| **JD-8** | Popup `mousedown`/`pointerdown` MUST `preventDefault()`, so the pointer commit survives the blur it would otherwise trigger; blur-revert scoped to genuine departures |
| **JD-9** | `requirements.md` §1/§2/§6 and `design.md` §1/§5.6 corrected — **4 public-facing / 2 admin-facing**; `DashboardFilters` deferred for size with its cost and above-admin follow-up priority stated |

## Round 1 — scoped re-judgment

Both judges re-read the changed documents against the frozen ledger and the fix delta.

**Result: 8 of 8 CLOSED — unanimous.** Both traced the JD-1 event flow independently and confirmed both original failure forks are eliminated; both confirmed JD-8's `preventDefault` is the correct reconciliation and strengthens rather than conflicts with DD-4; both re-verified JD-9 against the live tree (Judge A additionally confirmed `RequireRole` appears in exactly 7 files, all under `app/(admin)/**`).

Interaction checks run clean by both: reposition-on-reflow vs NFR-4's no-debounce rule (disjoint paths), vs NFR-5 (a style write is not motion), vs the D6 analysis; `preventDefault` vs Tab/Escape revert and vs DD-4; `aria-invalid` vs DD-3's caller-owns-the-message seam; and a full KZ-005 number sweep after 8→7.

### Defects introduced by the round-1 delta

| ID | Sev | Judges | Finding | Resolution |
|---|---|---|---|---|
| **N-1** | WARNING | A only — **and B asserted the opposite** | The JD-4 fix cited `FilterControls.tsx:151`; A re-read the file and found the `aria-label` at **:150**, with `:151` being the bare `>`. B's re-judgment stated `:151` was "verified accurate" | ⚠️ **Judge contradiction, resolved by parent with direct evidence rather than escalated** — a line number is settled by reading the file, not by adjudicating between judges. Verified: `aria-label="Filter by region"` is at **`FilterControls.tsx:150`**. Judge A is right; corrected in round 2. Recorded because a contradiction resolved by the parent is still a contradiction that occurred |
| **R2-1** | WARNING | B only | The JD-2 correction fixed §5.1 but left two paraphrases of the superseded "boolean for styling" contract at §1 and DD-3 — **the exact KZ-004 failure the methodology polices**, committed by the correction itself | Fixed in round 2 (both sites) |
| **N-2 / R2-2** | SUGGESTION | **Both** | The budget was not re-baselined after the DD-5 amendment materially grew the primitive | Fixed in round 2: **~700 → ~790 LOC** (+70 primitive, +20 tests), DD-1's stale "~200 lines" reconciled to ~330, and a new §10 risk row added for momentum-scroll lag on low-end Android |
| **R2-3** | SUGGESTION | B only | FR-5's title "the two public filter surfaces" became a miscount post-JD-9 — the same copied-forward shape JD-9 corrected, in miniature | Fixed in round 2: "two of the three public filter surfaces" |

## Round 2 — correction applied, and final verification

Four corrections (N-1, R2-1, N-2/R2-2, R2-3). Parent-run closure sweep per KZ-004, greping both documents for every superseded value:

- `"styling only"` / `"boolean for styling"` — **0 stale hits**; §1 and DD-3 now both state the flag drives `aria-invalid` and the border
- `FilterControls.tsx:151` — **0 hits**; `:150` verified against the live file
- `~700` / `~260` / `~200 lines` — **0 stale hits**; §11, the depth re-check, the PR-strategy threshold, and DD-1 all now read ~790 / ~330 and agree
- `"two public filter surfaces"` — **0 hits** in FR-5's title or the §9 index
- `"3 public"` / `"3 admin-facing"` — **0 hits**, confirmed independently by both judges in re-judgment

Number consistency after all rounds: 31 regions · 6 consumer sites = 4 public + 2 admin · 3 adopted + 3 deferred · 6 tasks · 7 review rounds = 2 + 5 · 330 + 270 + 190 = 790.

---

## Terminal receipt

| | |
|---|---|
| **Target** | `docs/specs/enhancement/searchable-region-select/design.md` (+ `requirements.md`, amended under JD-9) |
| **Rounds used** | 2 of 2 (both fix rounds and both scoped re-judgments consumed) |
| **Round-1 findings** | 5 confirmed · 11 suspect · 1 dismissed with evidence · 0 contradictions |
| **Round-1 corrections** | 8 work units — all **CLOSED**, unanimously, at scoped re-judgment |
| **Round-2 findings** | 1 judge contradiction (resolved by parent evidence) · 1 WARNING · 2 SUGGESTIONs |
| **Round-2 corrections** | 4 work units, closure-swept by the parent |
| **False codebase claims in the original target** | **0** — every factual premise of every design decision held under two independent audits |
| **Skill resolution** | `judgment-day`; judges ran as `akili-reviewer` (read-only: Read/Grep/Glob) |
| **Model routing** | Author Opus 5 · Judge A Sonnet · Judge B Fable — author ≠ auditor, satisfied |
| **Deliberately unfixed** | JD-7, JD-10, JD-11, JD-12, ~~JD-13~~, JD-15, JD-16 — user-scoped out of round 1; each is a single-judge WARNING or SUGGESTION and remains recorded above. **JD-10 (FR-6's no-match announcement wording) and JD-11 (Home/End vs. the APG caret convention) should be resolved during `tasks.md` decomposition**, since both are clause-ownership questions an Implementer would otherwise have to guess. ✅ **JD-10 and JD-11 were closed in `design.md` §5.3 during decomposition, as directed. JD-13 was closed 2026-08-06 during T-2 execution** (see its row above) — it left this list because the code had begun quoting the bad citation, which is the point at which a "deliberately unfixed" documentation defect stops being contained in documentation |

**JUDGMENT: APPROVED ✅**
