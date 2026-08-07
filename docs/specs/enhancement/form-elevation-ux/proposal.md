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

## 5b. Design review (skill `frontend-design`, 2026-08-07)

Run at the user's request against three rendered surfaces on Dev: public `/register`, admin `/admin/actors` (table), admin `/admin/actors/new` (`ActorForm`). Findings are code-verified, not eyeballed.

**Skill-fit caveat, stated up front.** `frontend-design` is written for greenfield *distinctive* work: it forbids Inter and system fonts, demands grid-breaking and a "differentiation anchor". Applied literally here it would **violate FR-6**, which freezes `--font-sans` (Inter) and the CGIAR/Alliance identity. A registry consulted by government partners optimises trust and legibility, not 24-hour recall. Only the skill's *design-thinking phase* and *DFII* were used; its aesthetic bias was deliberately not.

### DR-1 — The dominant defect is collapsed hierarchy, not missing depth

```
<legend className="px-2 text-sm font-semibold text-fg">   ← section title
<label  className="text-sm font-medium text-fg">          ← field label
```

Same size (`text-sm`), same colour (`text-fg`), **one font-weight step apart**. A section heading and a field label are near-indistinguishable, so "Identity" reads as a slightly bolder field label rather than a heading. **No shadow change fixes this**, and it is the largest of the three findings. It must be addressed or the elevation work will decorate a hierarchy that is still flat.

### DR-2 — The card treatment already exists; forms are the only container not using it

```
ActorCard.tsx:73   rounded-md border border-border bg-surface p-4 shadow-sm  hover:shadow-md
<fieldset>         rounded-md border border-border           p-4 sm:p-6
```

The fieldset **is the card class minus `bg-surface` and minus `shadow-sm`**. Nothing new needs designing — the app already has a proven container treatment that demonstrably reads on the warm canvas (34 `shadow-sm` sites, including the directory cards nobody has reported as flat). The recommendation is **consistency, not invention**.

### DR-3 — Inputs carry no shadow, which is where `--shadow-xs` belongs

`Input`/`Select`/`FormField` have **no** `shadow-*` class. `design.md` Group D assigns `--shadow-xs` to *"chips, inputs at rest"*. Wiring it there yields a semantically correct two-step ladder: **input (`xs`, 4%) nested inside section (`sm`, 7%)** — the smaller element less raised than its container. This closes VF-2's missing `xs` consumer as a by-product of doing the right thing, rather than as a token hunt.

### DFII — the framework argues against the skill's own bias here

| Direction | Impact | Fit | Feasibility | Perf. | Consistency risk | **DFII** |
|---|---|---|---|---|---|---|
| Reuse the existing card treatment | 2 | **5** | 5 | 5 | 1 | **15** |
| Bespoke "editorial" form aesthetic | **5** | 2 | 3 | 4 | 4 | **10** |

The restrained direction wins on *Context Fit* and *Consistency Risk*. Recorded because it is a non-obvious outcome: the honest application of a distinctiveness-oriented framework selects the conservative option for this product.

### DR-4 — An open decision this spec must make, not inherit

The `<legend>` currently **notches the fieldset border** (`px-2` over the border line). That reads as intentional on a transparent outline. On a *filled* card, a notch in the border reads as a rendering bug. Choose explicitly: a header row inside the card, or a committed notch treatment. Leaving it unexamined is how the current state arose.

### DR-5 — Observations to verify at specify time (not confirmed defects)

- **Density.** The `Identity` fieldset holds two fields inside `p-4 sm:p-6` plus legend spacing; at 1440 px the forms read very loose, with substantial dead space. `ActorForm` stacks **six** such sections.
- **Help-text association.** On `/register`, *"GPS coordinates are optional…"* renders **above** the GPS fields and visually attaches to `Market location`. The association is ambiguous.
- **Consent pill width.** In `ActorsTable`, the `Published` badge appears to stretch its cell rather than hug its text. Observed in the capture; **not** code-confirmed — verify before treating as a defect.

---

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

---

## 9. Findings inherited from `app-visual-refresh` T-6/T-7

### VF-4 — the `<legend>` fill protrudes above the card edge

T-7 gave the `<legend>` `bg-surface` so its notch would stop showing the warm canvas through a filled card. It works, but a native legend **straddles** the border: the upper half now renders white against the warm canvas, reading as a small white tab on the card's top-left instead of a clean notch. Subtle (1.05:1 edge) and better than before, but the silhouette is wrong.

**No background value can fix this.** Fill it like the card → it protrudes into the canvas. Fill it like the canvas → it intrudes onto the card. The element crosses the boundary, so the fix must stop it straddling.

### The failed attempt — do not repeat it

`float-left w-full` on the legend was tried and **broke the layout**: it removes the legend from normal flow, and the fieldsets use a grid for their two-column field arrangement, which collapsed — overlapping labels, inputs crushed to the right edge. **Contrast, lint and build all passed green**, because none of them evaluates layout. It reached Dev before the failure was seen.

**Binding constraint for this spec:** any change to the legend's flow or positioning MUST be verified by rendering **before** deployment. A green build is not evidence for a layout change. Whatever approach is chosen — header row inside the card, absolute positioning, or removing the legend from the visual flow while preserving it for assistive technology — it must be rendered and inspected at **375 / 768 / 1440** before it ships, and it must preserve native `<fieldset>`/`<legend>` semantics.

### Still unverified from T-6

Responsive behaviour at **375 px and 768 px** was never captured (the tooling would not resize the viewport). In particular, a `<legend>` that **wraps to two lines at 375 px** interacts with the notch in a way no one has yet seen. Treat it as unknown, not as working.
