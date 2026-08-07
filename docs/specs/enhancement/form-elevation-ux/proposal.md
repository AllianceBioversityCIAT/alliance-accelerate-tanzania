# Proposal — Form sections don't participate in the elevation system

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `enhancement/form-elevation-ux` |
| Proposal date | 2026-08-07 |
| Author | AKILI (Leader) on behalf of JuanCode |
| **Type** | **Change** |
| **Approval Mode** | **gated** |
| Status | Draft — awaiting `/akili-specify` |
| **Depends on** | `enhancement/app-visual-refresh` — **hard prerequisite**, must land first |
| **Parallel-safe** | **no** — both touch the visual system; this one consumes the elevation ladder that spec creates |
| Suggested depth | **Standard** — component-level, but no data, API, auth or migration surface. Its risk is aesthetic (subjective) plus an accessibility boundary the token change moved |
| Origin | **VF-1**, raised by the user at `app-visual-refresh` T-6's AR-1 visual gate, looking at `/register` on Dev. Recorded with measurements in that spec's `execution.md`. |

## 2. Problem / Current Behaviour

Every form section in the app is a **transparent 1px outline**. Measured, not eyeballed:

```
0 of 12  <fieldset> elements in frontend/ carry `bg-surface`
11 of 12 use the identical class string: `rounded-md border border-border p-4 sm:p-6`
```

`RegistrationForm.tsx` ×5 · `ActorForm.tsx` ×6 · (`DirectoryFilters.tsx:90` is deliberately `border-0` and out of scope.)

Because the fieldset has no background, what renders inside it is the page canvas. The white `bg-surface` inputs float directly on the canvas, and the section container reads as an empty rectangle rather than a panel.

## 3. Why this surfaced now, and why that matters

**`app-visual-refresh` did not cause this — it removed the camouflage.**

Before that spec, `--color-bg` was `#FFFFFF`. A transparent fieldset on a white canvas *looked* like a white card **by accident**. Warming the canvas to `#FBF9F6` made the accident stop working. The flatness pre-dates the refresh; only its visibility is new.

That distinction matters for how this spec is framed: it is **not** a regression to fix, and it must not be specified as one. It is a pre-existing gap that a correct change exposed.

**It also means `app-visual-refresh`'s design.md §1 over-states its own reach.** That document declares the structural move as:

> "The design makes the **canvas warm and the card white**, so elevation reads from the card being *lighter and warmer-lifted* than its ground, reinforced by a recalibrated shadow ladder."

True for the 137 `bg-surface` consumers — directory cards, panels, table containers. **Untrue for every form page**, because fieldsets were never in that set. No requirement in that spec's FR-1…FR-8 covers them, and no token change *can*: a fieldset with no background class has nothing for a token to colour.

## 4. Why it was excluded from `app-visual-refresh`

Not an oversight — an explicit adjudication, recorded at the T-6 gate:

- **NFR-7** of that spec reads *"Exactly **two** component files change, and both changes are **comment-only**. No component's markup, classes, props or behaviour changes."* Adding classes to 11 fieldsets violates it verbatim.
- Its `design.md` §11 tripwire fires on *"any change to a component's markup, classes, props or behaviour."*
- T-6's gate **is** a diff-containment check. Breaking the scope-containment tripwire inside the final gate of the spec that authored it would invalidate the gate.

## 5. Proposed Change (constraints, not mechanism)

1. **Form sections MUST participate in the elevation system** — reading as surfaces raised off the canvas, consistent with how cards and panels already read.
2. **Tokens only, no literals.** Use the ladder and surface tokens from `docs/ux-ui/design.md` §7 (`--shadow-xs…lg`, `--color-surface`). No hardcoded colours or geometry, no arbitrary Tailwind values.
3. **Consistent across both forms.** `RegistrationForm` (public) and `ActorForm` (admin) must not diverge in section treatment — divergence is what produced 11 copies of one class string.
4. **The `<legend>` treatment must be resolved, not inherited.** A legend visually notches the border; once the section has a background, the current overlap needs an explicit decision rather than whatever falls out.
5. **Elevation must not become noise.** `ActorForm` shows **6** stacked sections; six equally-raised panels can read busier than six outlines. Section elevation SHOULD be the lightest step that reads (`shadow-xs`/`sm`), not the heaviest.
6. Scope is section *containers*. Broader form UX — field grouping, density, focus/error states, required-field affordance — is in scope for **discussion** at specify time but MUST be explicitly included or excluded there, never absorbed silently.
7. **This spec inherits FR-4's unfinished half from `app-visual-refresh` (VF-2).** That spec created `--shadow-xs` and `--shadow-lg`, mapped them to Tailwind utilities, and proved the mapping — but **both ship with zero consumers**, because wiring them would have violated its NFR-7. Its FR-4 required *"proven by rendered evidence"*, which was therefore reported **INCONCLUSIVE** for those two steps rather than passed. This spec MUST wire them to the consumers `app-visual-refresh`'s `design.md` §5.1 Group D already names:
   - **`--shadow-xs`** → *"chips, inputs at rest"* — aligns with §5.5 above (section elevation should be the lightest step that reads).
   - **`--shadow-lg`** → *"dialogs, popovers, map rail"*.
   Wiring `shadow-lg` reaches beyond forms, so specify time must decide whether it belongs here or in a separate overlay/dialog pass — but it MUST NOT be left unassigned, or two tokens stay dead code indefinitely and FR-4 never closes. **Closing FR-4's rendered-evidence clause is an acceptance criterion of this spec**, and the evidence must be a real rendered surface, not a probe file.

## 6. Accessibility — a real constraint, not boilerplate

Two of these are non-negotiable and one is easy to get wrong:

- **The 3:1 non-text contrast floor (WCAG 1.4.11)** applies to the section boundary. If a fieldset gains `bg-surface` (`#FFFFFF`) on canvas `#FBF9F6`, those two differ by only **1.05:1** — so the *border* is carrying the boundary, and weakening or removing it in favour of "just a shadow" would drop the section edge below the floor. A shadow is not a substitute for a perceivable boundary.
- **Ink-on-ground pairs change.** Fields currently sit on `--color-bg`; on `bg-surface` every ink/ground pair inside a fieldset changes. `frontend/lib/contrast.test.ts` already gates the reachable pairs, and its `REACHABLE` map carries `file:line` citations — **that map must be updated in the same change**, or the harness will be asserting a reachability claim that no longer matches the components.
- Fieldset/legend semantics must survive. Whatever happens visually, the grouping must remain programmatically intact for screen readers.

## 7. Out of scope

- `DirectoryFilters.tsx:90` — intentionally borderless, a filter rail rather than a form section.
- Any token *value* change. This spec consumes the ladder; it does not re-author it.
- Backend, validation logic, or form submission behaviour.
- The dashboard/admin table surfaces — they already consume `bg-surface`.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Six raised panels in `ActorForm` read busier than the flat version | §5.5 — lightest step that reads; the rendered gate compares both forms side by side, not one screen |
| A shadow is used *instead of* the border, dropping the boundary below 3:1 | §6 makes the border load-bearing and states the 1.05:1 surface-vs-canvas figure explicitly |
| `contrast.test.ts`'s `REACHABLE` citations silently go stale | §6 requires updating them in the same change — a stale `file:line` is the KZ-008 defect class |
| Scope creeps from "section containers" into a full form redesign | §5.6 forces an explicit include/exclude decision at specify time |
