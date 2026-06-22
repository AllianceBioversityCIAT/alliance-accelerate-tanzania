# Validation Report — Home Page (Public Registry Portal landing)

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `changes/home-page` |
| Branch | `feature/home-page` |
| Validated | 2026-06-22 |
| Validator | Claude (SDD validate) |
| Latest commit | `b397ff0` `[SPEC:changes/home-page] T-7: a11y/responsive/static-export verification + jest-axe coverage` |
| Inputs | proposal.md, requirements.md (FR-1..FR-7, NFR-1..NFR-5), design.md (§3–§12), tasks.md (T-1..T-7), execution.md |
| Constitutional refs | docs/prd.md; docs/system-design/design.md §4,§5,§7,§8,§9,§10; docs/detailed-design/detailed-design.md §4,§9 |

## 2. Summary

**Overall result: PASS — archive-ready.**

All seven tasks (T-1..T-7) are complete with reviewer PASS verdicts and recorded verification evidence. The static-export Next.js home page at `/` renders the full public composition (shell → Hero → live MetricsBand → CropCoverage → footer), is fully design-token-driven, degrades gracefully when metrics are unavailable, and proves WCAG-AA basics via an automated jest-axe suite. Build, typecheck, lint, and the full 21-test suite all pass. No FAIL findings. One cosmetic documentation nuance noted as WARN (design file tree names `next.config.js`; the implementation uses the functionally-equivalent `next.config.mjs`).

| Phase | Result |
|---|---|
| Task completion | PASS |
| File existence | PASS |
| Build integrity (tsc / test / build / lint) | PASS |
| Requirement coverage (FR-1..7, NFR-1..5) | PASS |
| Code quality / design-system | PASS |
| Design conformance | PASS (1 cosmetic WARN) |

## 3. Task Completion

| Task | Status | Reviewer | Evidence |
|---|---|---|---|
| T-1 Bootstrap Next.js static export | `[x]` | PASS (1) | execution.md — build emits `out/` |
| T-2 Design tokens → Tailwind + globals | `[x]` | PASS (1) | all §7 tokens on `:root`, Tailwind maps via `var(--…)` |
| T-3 Public shell (Header + Footer) + layout | `[x]` | PASS (1) | FR-1/5/6/7; landmarks + nav aria |
| T-4 Hero + CTAs | `[x]` | PASS (2, 1 rework) | FR-2/NFR-2; NFR-4 token-bypass fixed in rework |
| T-5 Metrics client + `useMetrics` + harness | `[x]` | PASS (1) | FR-3/NFR-5; 12 tests, non-throwing |
| T-6 MetricsBand + CropCoverage | `[x]` | PASS (1) | FR-3/FR-4/NFR-2; 7 tests |
| T-7 A11y / responsive / static-export | `[x]` | PASS (1) | NFR-1/2/3; jest-axe, 21 tests total |

All completed tasks carry execution notes and verification evidence in `execution.md`. **Result: PASS.**

## 4. File Existence

All 24 files from design.md §4 directory tree are present (verified): config (`next.config.mjs`, `tailwind.config.ts`, `postcss.config.js`, `tsconfig.json`, `package.json`, `.env.example`), `app/` (root + `(public)` layout/page, `globals.css`), `components/shell/{Header,Footer}`, `components/home/{Hero,MetricsBand,CropCoverage,CropCard}`, `components/ui/{Button,StatCard,Skeleton}`, `lib/api/{client,metrics,useMetrics}`, `lib/auth/useSession`, `lib/content/crops`, and `public/`. **Result: PASS.**

> Note: design tree labels the Next config `next.config.js`; implementation uses `next.config.mjs` (ESM, functionally equivalent, retains `output: 'export'`). See §8.

## 5. Build Integrity

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 — no type errors |
| `npm run test` | Test Suites: 5 passed / Tests: 21 passed |
| `npm run build` | ✓ Compiled successfully; ✓ Exporting (2/2); `/` = `○ (Static)`; `out/index.html` emitted |
| `npm run lint` | ✔ No ESLint warnings or errors |

**Result: PASS.** (Note: `next lint` prints a Next.js-16 deprecation notice — informational only, not a finding.)

## 6. Requirement Coverage

| Req | Task(s) | Code evidence | Test evidence | Result |
|---|---|---|---|---|
| FR-1 Landing structure (header/hero/metrics/crops/footer in order); no PII | T-3,T-4,T-6 | `(public)/page.tsx` composes Hero+MetricsBand+CropCoverage; layout wraps Header/main/Footer; grep confirms **no `phone`/`email`** in any component | home-a11y composition test | PASS |
| FR-2 Hero + CTAs | T-4 | `Hero.tsx` eyebrow/h1/value-chain copy/visual panel + Live Registry stat; CTAs `href="/map"`, `href="/directory"` | MetricsBand/composition render | PASS |
| FR-3 Live metrics band (4 aggregates) | T-5,T-6 | `MetricsBand.tsx` four StatCards bound to actorsMapped/cropsTracked/regionsCovered/actorTypes; `getMetrics` hits `/api/v1/metrics` | metrics-band test: values on success, `—` on null | PASS |
| FR-4 Crop coverage cards + per-crop counts + tokens | T-6 | `CropCoverage.tsx`/`CropCard.tsx`; per-slug join; crop tokens `crop-sorghum/crop-bean/crop-groundnut`; "View all actors" `href="/directory"` | crop test: 3 names/desc/counts + fallback + `/directory` | PASS |
| FR-5 Role-aware auth slot | T-3 | `Header.tsx` AuthSlot → sign-in (`/login`) for Public, avatar+RoleBadge when authed; `useSession` stub | Header default sign-in (T-3) | PASS |
| FR-6 Primary nav + active state | T-3 | `Header.tsx` nav Home/`/map`/`/directory`, `usePathname` + `aria-current` | nav active (T-3) | PASS |
| FR-7 Footer + governance note | T-3 | `Footer.tsx` "Data governed under participant consent." | composition test | PASS |
| NFR-1 Static export, no SSR | T-1,T-7 | `output: 'export'`; grep finds zero SSR/ISR/route-handler patterns | `build` emits static `out/`, `/` = Static | PASS |
| NFR-2 Responsive 360→1280 | T-4,T-6,T-7 | Hero `grid-cols-1 lg:grid-cols-2`; MetricsBand `grid-cols-2 md:grid-cols-4`; CropCoverage `grid-cols-1 md:grid-cols-3`; Header `md:hidden` hamburger | breakpoint classes confirmed | PASS |
| NFR-3 Accessibility (WCAG AA basics) | T-7 | landmarks, `nav aria-label`, `aria-current`, h1→h2→h3, focus-visible rings, `motion-reduce`, decorative `aria-hidden`, `aria-live` | **jest-axe** `toHaveNoViolations` (success + null states) | PASS |
| NFR-4 Design tokens, no hardcoded values | T-2 | tokens as `:root` vars + Tailwind `var(--…)`; hex grep → comments only | build + reviewer gates | PASS |
| NFR-5 Non-blocking, crash-safe metrics | T-5 | `getMetrics(): Promise<Metrics \| null>` returns `null` on any failure; `useMetrics` unmount-guarded | metrics tests across 6 failure modes | PASS |

**Result: PASS** — every requirement is mapped to a complete task with code and test evidence; observed behavior matches requirement intent (incl. the FR-3/NFR-5 graceful-fallback path).

## 7. Linting & Code Quality

- ESLint (`next/core-web-vitals`): clean.
- TypeScript strict: no errors.
- Component design: presentational primitives (`Button`, `StatCard`, `Skeleton`, `CropCard`, `crops.ts`) are server components (no `'use client'`); only hook-consuming components (`MetricsBand`, `CropCoverage`, `Header`, `useMetrics`) opt into client rendering — correct minimization for static export.
- Error handling: API layer centralizes fetch + error-envelope handling in `client.ts`; `getMetrics` is provably non-throwing (DD-3). No `any`-leak or unhandled-rejection patterns introduced.
- **Result: PASS.**

## 8. Design Conformance

- **Architecture (design.md §3, §4):** directory structure matches the design tree exactly; `lib/api/client.ts` + `Metrics` type established as the reusable shared contract (§9).
- **Data contract (§5):** `Metrics`/`CropMetric` types implemented verbatim; consumes `GET /api/v1/metrics` (§6) with no auth header (public call).
- **Design decisions:** DD-1 (spec owns minimal bootstrap), DD-2 (static copy + live metrics), DD-3 (graceful null fallback), DD-4 (presentational auth stub), DD-5 (tokens in config + CSS vars, dark-overridable) all honored. DD-6 (React Query optional) → minimal `useEffect` hook chosen, within the allowed decision.
- **System Design conformance:** §7 tokens are the single source of truth (no hardcoded values); §8 component inventory (Stat/metric card, Skeleton, Role badge, Button variants) used; §9 responsive breakpoints respected; §10 accessibility expectations met; §11 dark-mode-ready tokens preserved (no `.dark` authored, per v1 light-only).
- **Proposal alignment:** matches approved Option A (static copy + live metrics); no out-of-scope work (no Map/Directory/Cognito/admin) leaked in.

**WARN (cosmetic):** design.md §4 tree names the Next config `next.config.js`; implementation uses `next.config.mjs`. Functionally equivalent (ESM, `output: 'export'` + `images.unoptimized` present). *Remediation: optionally update the design tree label to `next.config.mjs`; no code change required.*

**Result: PASS (1 cosmetic WARN).**

## 9. Test Evidence Summary

| Suite | Tests | Covers |
|---|---|---|
| `lib/api/metrics.test.ts` | 8 | getMetrics success + 6 failure modes (NFR-5) |
| `lib/api/useMetrics.test.ts` | 4 | hook states + unmount guard (FR-3/NFR-5) |
| `components/home/MetricsBand.metrics-band.test.tsx` | 3 | live values / `—` fallback / skeleton (FR-3) |
| `components/home/CropCoverage.crop.test.tsx` | 4 | crop names/desc, per-slug counts, fallback, `/directory` (FR-4) |
| `components/home/home-a11y.test.tsx` | 2 | jest-axe no-violations, success + null states (NFR-3) |
| **Total** | **21 passed** | |

Manual/tooling: static-export grep (zero SSR), hex grep (tokens only), responsive breakpoint-class confirmation.

## 10. Remediation

| # | Severity | Finding | Action | Required for archive? |
|---|---|---|---|---|
| 1 | WARN (cosmetic) | design.md §4 tree says `next.config.js`; actual `next.config.mjs` | Update design tree label (doc-only) | No — accept or fix opportunistically |

No FAIL findings. No blocking remediation.

## 11. Archive Readiness Recommendation

**READY TO ARCHIVE.** All tasks `[x]` with reviewer PASS; no unresolved FAILs; the single WARN is cosmetic and doc-only; tests cover every requirement and the key scenarios (including graceful fallback and accessibility); design/proposal conformance confirmed; implementation drift is either none or recorded in execution notes.

Next command:

```text
/sdd-archive changes/home-page
```
