# Tasks — Adopt the PABRA brand color palette

- Spec path: docs/specs/changes/brand-palette-pabra/
- Status: Draft
- Depth: Standard
- Traces: requirements.md (FR-1..FR-4, NFR-1..NFR-5), design.md (§4–§12)
- Commit standard: `[SPEC:changes/brand-palette-pabra] <message>`

## Dependency Graph

```
T-1 ──▶ T-2 ──▶ T-3 ──▶ T-4
```
A task is eligible when its status is `[ ]`/`[~]` and all deps are `[x]`. Order ties broken by document order.

---

- [x] T-1 Update System Design §7 token baseline to the PABRA palette  (deps: none)
      Size: S
      Requirements: FR-1, FR-4, NFR-2
      Design: design.md §5, §8, §10 (DD-1..DD-5); System Design §7
      Scope: In `docs/system-design/design.md §7`, replace the brand/neutral/semantic token values with the PABRA set — `primary #800000`, `primary-hover #680000` (new), `primary-fg #FFFFFF`, `accent #008BDB`, `highlight #29C4A9` (new), `highlight-soft #82C0C7` (new), `bg/surface #FFFFFF`, `surface-alt #F7F7F7` (new), `fg #333333`, `muted #666666`, `border #E2E2E2`, `success #2F7D32`, `warning #C9821B`, `danger #B3261E`, `restricted-bg #F3F3F3`. Keep `crop-sorghum/bean/groundnut` unchanged. Add a short "Accent usage rules" note: blue/teal for large text/UI/buttons/borders/tints only — never small body text (cite the §8 contrast ratios). Keep the dark-mode override note intact.
      Tests / Verify: grep §7 shows all new values + the accent-usage note; crop tokens unchanged; doc reads cleanly.
      Done when: §7 is the canonical PABRA table with documented accent rules.
      Skills: tailwind-design-system, ui-ux-pro-max

- [x] T-2 Apply tokens in globals.css + wire new tokens in Tailwind  (deps: T-1)
      Size: S
      Requirements: FR-2, NFR-3, NFR-4
      Design: design.md §5, §8, §10 (DD-2..DD-4); §11
      Scope: In `frontend/app/globals.css`, set every `:root` token to its §7 value and add `--color-primary-hover`, `--color-highlight`, `--color-highlight-soft`, `--color-surface-alt`. In `frontend/tailwind.config.ts`, map the new tokens to utilities: `primary.hover` → `var(--color-primary-hover)`, `highlight` → `var(--color-highlight)`, `highlight-soft`/`highlightSoft` → `var(--color-highlight-soft)`, `surface-alt`/`surfaceAlt` → `var(--color-surface-alt)`. Keep all values as `var(--…)` (no raw hex in config). Leave `--color-bean`, crop tokens, typography, radii, shadows untouched. Preserve the `.dark` override comment.
      Tests / Verify: `cd frontend && npm run build` compiles + static-exports; grep confirms new vars present and Tailwind maps via `var(--…)`; no raw hex added to tailwind.config.ts.
      Done when: utilities `bg-primary` (maroon), `hover:bg-primary-hover`, `text-accent`, `bg-highlight`, `bg-surface-alt` resolve to PABRA values; build passes.
      Skills: tailwind-design-system

- [x] T-3 Re-point component token wiring + verify no hardcoded color  (deps: T-2)
      Size: S
      Requirements: FR-3, NFR-1, NFR-4, NFR-5
      Design: design.md §8 (component table), §4
      Scope: Edit `frontend/components/ui/Button.tsx`: primary variant `hover:bg-primary/90` → `hover:bg-primary-hover` (correct the related comment). Scan all components for any other opacity-derived primary hover/tint or improvised color and route through tokens; do NOT change layout, copy, structure, or component APIs. (Adopting `bg-surface-alt`/`bg-highlight` on a section is optional and only if visibly warranted — keep the diff minimal.) Confirm no SSR/route handlers introduced.
      Tests / Verify: `cd frontend && npm run test && npm run build && npm run lint`; hex-grep `grep -rIn "#[0-9A-Fa-f]\{3,6\}" components` shows matches only in comments; static export still emits `/` as Static.
      Done when: full suite + build + lint pass; primary hover uses `primary-hover`; no hardcoded color in executable component code; behavior/layout unchanged.
      Skills: ui-ux-pro-max, react-doctor

- [ ] T-4 Accessibility (AA contrast) + visual verification pass  (deps: T-3)
      Size: S
      Requirements: FR-4, NFR-1, NFR-2, NFR-5
      Design: design.md §8 (contrast table), §11, §12
      Scope: Verify WCAG 2.1 AA contrast for every text usage of the new palette (maroon, fg `#333`, muted `#666`, and any `text-accent`/`text-highlight`), using the computed ratios in design.md §8; correct or restrict any failing usage per FR-4. Re-run jest-axe; run `npm run dev` and confirm at 360/768/1280 that primary/CTAs are maroon, hover is `#680000`, accents are blue/teal, base is white/gray, and no layout/copy changed. Confirm static export build still passes.
      Tests / Verify: `cd frontend && npm run test` (incl. jest-axe) green; `npm run build` static export OK; documented contrast check (per-usage pass/fail) with no AA failures remaining; manual responsive/visual confirmation noted.
      Done when: jest-axe green, AA contrast verified for all text usages (no failures), home page visibly on-brand, static export passes, zero behavioral/layout regression.
      Skills: ui-ux-pro-max, react-doctor

## Testing & Verification Expectations
- Each task runs its build/grep/test before completion.
- T-2 onward: no task introduces SSR/route handlers (NFR-1) or hardcoded color values bypassing tokens (NFR-4).
- The blue/teal accent contrast limitation (FR-4) must be explicitly verified in T-4 (jsdom axe will not catch it).

## Coverage Check
Every requirement is covered: FR-1→T-1 · FR-2→T-2 · FR-3→T-3 · FR-4→T-1/T-4 · NFR-1→T-3/T-4 · NFR-2→T-1/T-4 · NFR-3→T-2 · NFR-4→T-2/T-3 · NFR-5→T-3/T-4.

Recommended first task: **T-1**.
