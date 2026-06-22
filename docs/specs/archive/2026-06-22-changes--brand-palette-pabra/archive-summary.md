# Archive Summary — Adopt the PABRA brand color palette

## 1. Document Control

| Field | Value |
|---|---|
| Spec name | Adopt the PABRA brand color palette |
| Original spec path | `docs/specs/changes/brand-palette-pabra/` |
| Archive path | `docs/specs/archive/2026-06-22-changes--brand-palette-pabra/` |
| Branch | `feature/brand-palette-pabra` |
| Archive date | 2026-06-22 |
| Final commit at archive | `54d45ad` `[SPEC:changes/brand-palette-pabra] validation report — PASS, archive-ready` |
| Methodology | JCSPECS SDD (Leader → Implementer → Reviewer loop) |

## 2. Original Spec Path

`docs/specs/changes/brand-palette-pabra/` — contained `proposal.md`, `requirements.md`, `design.md`, `tasks.md`, `execution.md`, `validation-report.md`, and this `archive-summary.md`.

## 3. Archive Date

2026-06-22.

## 4. Final Status

**COMPLETE — validated, archive-ready.** All 4 tasks (T-1..T-4) PASS with reviewer sign-off (zero rework); validation `PASS` with no FAIL findings and two accepted WARNs. The PABRA brand palette is now the canonical System Design §7 token baseline and is live across the app.

## 5. Requirements Delivered

| Req | Title | Delivered by | Status |
|---|---|---|---|
| FR-1 | PABRA token baseline in System Design §7 | T-1 | ✅ |
| FR-2 | Tokens applied (CSS vars + Tailwind) | T-2 | ✅ |
| FR-3 | UI re-skins with no hardcoded color | T-3 | ✅ |
| FR-4 | Accent usage rules (contrast-safe) | T-1, T-4 | ✅ |
| NFR-1 | Static export preserved | T-3, T-4 | ✅ |
| NFR-2 | AA contrast | T-1, T-4 | ✅ |
| NFR-3 | Dark-mode override path preserved | T-2 | ✅ |
| NFR-4 | Tokens only (no hardcoded color) | T-2, T-3 | ✅ |
| NFR-5 | No behavioral/visual-structure regression | T-3, T-4 | ✅ |

## 6. Files Changed Summary

Derived from `execution.md`:

- **T-1 — token baseline:** `docs/system-design/design.md §7` — brand/neutral/semantic values → PABRA (maroon `#800000`, `primary-hover #680000`, `accent #008BDB`, `highlight #29C4A9`, `highlight-soft #82C0C7`, `surface-alt #F7F7F7`, `fg #333333`, `muted #666666`, `border #E2E2E2`, `restricted-bg #F3F3F3`; success/warning/danger kept; crop legend unchanged) + accent-usage contrast note.
- **T-2 — apply tokens:** `frontend/app/globals.css` (`:root` values + 4 new vars; `.dark` override comment preserved), `frontend/tailwind.config.ts` (4 new `var(--…)` utility maps: `primary.hover`, `highlight`, `highlight-soft`, `surface-alt`; no raw hex).
- **T-3 — component wiring:** `frontend/components/ui/Button.tsx` (primary `hover:bg-primary/90` → `hover:bg-primary-hover`).
- **T-4 — a11y/contrast + cleanup:** `frontend/components/shell/Footer.tsx` (brand `text-primary` → `text-bg` AA fix + comment refresh), `frontend/components/shell/Header.tsx` (Admin `RoleBadge` `bg-accent` → `bg-primary` AA fix), `frontend/components/home/Hero.tsx` (comment refresh).

Commit trail (spec-prefixed): proposal `dc68f4f` · spec `5370924` · T-1 `506bdb9` · T-2 `1e7084c` · T-3 `de59818` · T-4 `09a612c` · validation `54d45ad`.

## 7. Test Evidence Summary

No standalone `test-report.md` — evidence lives in the codebase and is summarized in `validation-report.md §9`. **Full Jest suite: 5 suites / 21 tests pass**, including `home-a11y.test.tsx` (jest-axe `toHaveNoViolations`) exercising the full composition under the new palette. No test changes were needed (tests assert structure/behavior, not hex), itself confirming NFR-5. Build integrity at validation: `tsc --noEmit` clean · `npm run build` static export (`out/`, `/` = `○ Static`) · `npm run lint` clean. **Accepted:** absence of a separate `test-report.md` (coverage is automated, in-repo, validated).

**Contrast (NFR-2):** T-4 produced a documented per-usage AA contrast table (in `execution.md`); 2 real failures were found and fixed; jsdom-axe's contrast blind spot was covered by the manual/computed audit.

## 8. Validation Summary

`validation-report.md` — overall **PASS, archive-ready**. All phases PASS (task completion, file existence, build integrity, requirement coverage, code quality, design conformance). Every FR/NFR mapped to a complete task with code + verification evidence; token-only rebrand with no hardcoded color; crop legend and dark-mode path preserved. No FAIL findings.

## 9. Accepted Warnings Or Follow-Ups

- **WARN-1 (doc-only, accepted):** design.md §4 "files changed" listed only `Button.tsx` among components; T-4 also edited `Footer.tsx`/`Header.tsx`/`Hero.tsx` for AA fixes + comment refresh — within T-4's documented scope (design §8/§12) and recorded in `execution.md`. No action required.
- **WARN-2 (deferred follow-up):** the Admin `RoleBadge` AA fix made it share `bg-primary` with the Staff badge (distinction lost). Accepted for v1 because the auth slot is a presentational stub defaulting to `Public` (Admin branch never renders in production). **Follow-up:** before Cognito auth is wired in, set Admin `RoleBadge` to `bg-primary-hover` (#680000, ~13.2:1) to restore Staff/Admin distinction AA-safely.

## 10. Historical Notes

- Origin: the platform was bootstrapped with a provisional agriculture-green palette; the correct identity (extracted from pabra-africa.org) is maroon-led. This spec corrected it at the constitutional §7 baseline (Option A — swap values, keep names), so the entire app — including the already-archived `changes/home-page` spec — re-skinned automatically with only a one-line component change (Button hover).
- The dedicated T-4 contrast pass proved its worth: it caught **2 genuine AA failures the rebrand introduced** — the Footer brand name rendered maroon-on-dark at ~1.15:1 (effectively invisible), and the Admin badge used blue at 3.67:1. Both fixed with tokens.
- Crop legend colors were intentionally left unchanged (functional map/chip identifiers, not brand colors). Success stayed green; dark-mode override path preserved.
- Five proposal open questions were resolved to confirmed defaults before specifying; zero rework occurred across all four tasks.
