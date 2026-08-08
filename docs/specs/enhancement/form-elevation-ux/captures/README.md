# Rendered evidence — `enhancement/form-elevation-ux`

Evidence for the **three requirements this spec cannot gate automatically**. `requirements.md` §8
classes FR-1, FR-2 and FR-7 as having **no automated check**: jsdom has no layout, `axe` cannot see a
broken corner radius, and a shadow's *presence* is assertable while its *visibility* is not.

These files are the evidence, not the argument. The adjudication lives in `../execution.md`.

## Files

| File | Requirement | What it shows |
|---|---|---|
| `register-form__1440__corner.png` | **FR-1** | `/register` first card, top-left corner. Continuous border, unbroken radius, no white legend tab |
| `actorform-harness__1440__corner.png` | **FR-1** | Same for `ActorForm`, via a props-only harness |
| `sweep-00-none-zoom.png` | **FR-2** | Input lower edge with **no** shadow — the reference |
| `sweep-01-current-004-zoom.png` | **FR-2** | The **shipped** `--shadow-xs` at `0.04`. Indistinguishable from the reference — this is the non-result `app-visual-refresh` T-7 reported as a pass |
| `g-0.12-zoom.png` | **FR-2** | The **adopted** `0.12`. A soft warm band appears beneath the border |
| `card-004.png` / `card-012.png` | **FR-2** | The same pair at **native scale**, in real card context |
| `{actor,registration}-form-{375,768,1440}.png` | **FR-7** | Density evaluation set, both forms, three widths |

## How to read these — three cautions

**1. The FR-2 zooms are 4× nearest-neighbour, deliberately.** `--shadow-xs` is a 1 px offset / 2 px
blur shadow; at native scale in a downsampled or recompressed view it is invisible **whether or not
it is there**, which is exactly how the predecessor spec mistook a flat token for a working one. The
decisive measurement was a raw pixel dump (peak Δ from white: **6/255 at `0.04`, 18/255 at `0.12`**),
with these no-blur crops as the visual cross-check. `card-004.png` vs `card-012.png` is the honest
native-scale pair — **if you cannot tell them apart at 100%, that is the true state of affairs**, and
`execution.md` records the Leader could not either.

**2. The FR-7 set is local, not deployed.** Captured against `PORT=3100` on the post-T-1 tree at
`27c7097`, with the backend on `:3001` **down** — hence "We couldn't load the consent policy" and the
empty selects. Neither affects spacing. `requirements.md` §7 points *deployed* verification at the Dev
CloudFront origin; these predate that deploy and **must not be cited as deployed evidence**.

**3. Two frames are not representative of their real route.** `actor-form-768.png` and
`actor-form-375.png` come from a harness outside the `(admin)` route group (`RequireRole` redirects to
`/login` before content renders, so a props-only harness cannot sit inside it). The real route adds
`p-4 sm:p-6` on `<main>` plus a 224 px `md:w-56` aside — ≈496 px of content at 768 versus ≈720 px
here. **`actor-form-1440.png` *is* faithful**, because `mx-auto max-w-4xl` (896 px) binds under both
the harness and the real 1120 px content region. A dev-mode overlay also paints over content in three
of the FR-7 frames.

## Reproducing

Playwright (global install, deliberately **not** vendored — see
`../../app-visual-refresh/captures/README.md`), `deviceScaleFactor: 2`, **no downsampling**, with
`window.innerWidth` asserted in-page on every shot. Authenticated surfaces want a Playwright
`state.json` storage state from a real admin session; the throwaway-harness shortcut used here works
only *outside* the guarded route group.
