# Tasks — Portal Motion Layer (GSAP animations)

- Spec path: docs/specs/enhancement/portal-animations/
- Depth: Standard
- Consumed by `/sdd-execute` (Leader → Implementer → Reviewer). Status: `[ ]` not started · `[~]` in progress/halted · `[x]` complete & reviewed PASS.
- Commits: `[SPEC:enhancement/portal-animations] <message>`. Frontend-only. Implementation uses the GSAP skills (`gsap-react`, `gsap-scrolltrigger`, `gsap-core`, `gsap-performance`). Reduced-motion is a hard gate; content must stay visible without GSAP (progressive enhancement). AWS uses `--profile IBD-DEV`.

## Tasks

- [ ] T-1 Motion foundation: deps + tokens + GSAP setup + test harness  (deps: none)
      Scope: `npm i gsap @gsap/react` (frontend). Add `lib/motion/motion-tokens.ts` (DURATION/EASE/REVEAL/COUNT_UP) and `lib/motion/gsap-setup.ts` (idempotent `registerGsap()` → registerPlugin(useGSAP, ScrollTrigger)). Add motion CSS tokens (`--dur-*`, `--ease-*`) to `app/globals.css` `:root` + extend `tailwind.config.ts` transitionDuration/timingFunction + document in System Design §7. Add Jest manual mock for `gsap`/`gsap/ScrollTrigger`/`@gsap/react` (no-op, useGSAP runs callback once) and a `window.matchMedia` polyfill in `jest.setup.ts`.
      Traces: FR-1, FR-8, NFR-3, NFR-4, NFR-5 (requirements.md), design.md §5.1, §5.4, §5.6
      Files: frontend/package.json, frontend/lib/motion/{motion-tokens,gsap-setup}.ts, frontend/app/globals.css, frontend/tailwind.config.ts, frontend/jest.setup.ts, frontend/__mocks__/* (or jest.mock), docs/system-design/design.md (§7 motion tokens)
      Verify: `cd frontend && npm test && npm run build`
      Done when: deps installed; tokens present; GSAP mock + matchMedia polyfill in place; the existing 281 tests still pass; static export build green.

- [ ] T-2 `useReveal` scroll-reveal primitive  (deps: T-1)
      Scope: `lib/motion/useReveal.ts` (+ optional `<Reveal>`): `useGSAP({scope})` + `gsap.matchMedia('(prefers-reduced-motion: no-preference)')` → `gsap.from(targets, { autoAlpha:0, y:REVEAL.y, duration, ease, stagger, scrollTrigger:{start:'top 85%', once:true} })`. Single + children/stagger variants (grid variant may use `ScrollTrigger.batch`). Resting DOM stays visible (from-based); reduced-motion = no-op.
      Traces: FR-2, FR-7, FR-8, NFR-1, NFR-2, NFR-6 (requirements.md), design.md §5.2
      Files: frontend/lib/motion/useReveal.tsx (+ test)
      Verify: `cd frontend && npm test -- useReveal`
      Done when: with GSAP mocked, content renders visible (final state); tests cover the reduced-motion/no-op path; transform+opacity only.

- [ ] T-3 `useCountUp` number count-up primitive  (deps: T-1)
      Scope: `lib/motion/useCountUp.ts`: returns a ref + accepts `(target, { enabled })`; animates a proxy and writes `node.textContent` via `onUpdate` (no per-frame React render); gated by `matchMedia` → reduced-motion / `enabled===false` shows final formatted value immediately; in-view trigger (ScrollTrigger once). Formatting matches existing display (e.g. `1,000+`, integers).
      Traces: FR-3, FR-4, FR-7, NFR-2 (requirements.md), design.md §5.3
      Files: frontend/lib/motion/useCountUp.ts (+ test)
      Verify: `cd frontend && npm test -- useCountUp`
      Done when: with GSAP mocked, the final value is rendered; reduced-motion path shows final value with no animation; tests pass.

- [ ] T-4 Hero entrance + LiveRegistry count-up  (deps: T-2, T-3)
      Scope: `Hero.tsx` → `'use client'`; `useGSAP` timeline staggering eyebrow→h1→copy→CTAs (from y+autoAlpha); LiveRegistryCard "1,000+" via `useCountUp`; photo panel **subtle `scale 1.04→1` only — never opacity:0** (LCP-safe). No markup/content/layout/token change beyond refs + motion. Reduced-motion → static hero, final number.
      Traces: FR-3, FR-7, FR-8, NFR-1, NFR-2, NFR-3 (requirements.md), design.md §5.5, §8
      Files: frontend/components/home/Hero.tsx (+ update/add test)
      Verify: `cd frontend && npm test -- Hero home && npm run build`
      Done when: hero tests + home a11y pass with GSAP mocked (final content/number visible); `/` static; hero image not opacity-animated (code-reviewed).

- [ ] T-5 MetricsBand count-up  (deps: T-3)
      Scope: wire `useCountUp` into the four MetricsBand figures (via StatCard or a small wrapper), `enabled = !loading && !!data`, in-view trigger; loading/fallback states unchanged.
      Traces: FR-4, FR-7 (requirements.md), design.md §5.5
      Files: frontend/components/home/MetricsBand.tsx, frontend/components/ui/StatCard.tsx (if needed) (+ tests)
      Verify: `cd frontend && npm test -- MetricsBand StatCard`
      Done when: figures show final values with GSAP mocked; reduced-motion = no count; existing MetricsBand tests pass.

- [ ] T-6 CropCoverage card stagger  (deps: T-2)
      Scope: apply `useReveal` (stagger / `ScrollTrigger.batch`) to the CropCoverage crop-card grid; section header may reveal too. No content change.
      Traces: FR-5, FR-7, FR-8 (requirements.md), design.md §5.5
      Files: frontend/components/home/CropCoverage.tsx (+ test if needed)
      Verify: `cd frontend && npm test -- CropCoverage && npm run build`
      Done when: cards render visible with GSAP mocked; reduced-motion = static; tests + build pass.

- [ ] T-7 Directory grid stagger  (deps: T-2)
      Scope: apply `useReveal` stagger to the `ActorCard` grid in `DirectoryView` on load; optional brief, overwrite-safe re-reveal keyed on the query (`useGSAP dependencies:[queryKey], revertOnUpdate`). Filtering/search/pagination behavior unchanged.
      Traces: FR-6, FR-7, FR-8 (requirements.md), design.md §5.5
      Files: frontend/components/directory/DirectoryView.tsx (+ test update)
      Verify: `cd frontend && npm test -- directory && npm run build`
      Done when: directory tests (incl. a11y) pass with GSAP mocked (cards visible); reduced-motion = static; `/directory` static.

- [ ] T-8 A11y / performance / static-export verification pass  (deps: T-4, T-5, T-6, T-7)
      Scope: confirm `jest-axe` 0 violations on Home + Directory with the motion layer; reduced-motion final-state asserted; full `npm test` green; `next build` static; document a manual CWV check (no CLS; hero LCP unaffected; entrances smooth, once). Smallest fix only if axe/regression surfaces.
      Traces: NFR-1, NFR-2, NFR-3, NFR-5, NFR-6 (requirements.md), design.md §10
      Files: frontend/components/**/*a11y*.test.tsx (extend if gaps), frontend/lib/motion/*.test.*
      Verify: `cd frontend && npm run build && npm test`
      Done when: axe clean on animated surfaces; full suite green; static export green; manual CWV note recorded in execution.md.

- [ ] T-9 Deploy frontend + visual verification  (deps: T-8)
      Scope: rebuild + deploy the static frontend (S3 + CloudFront invalidation) via `infra/scripts/deploy-frontend.sh` (`--profile IBD-DEV`); confirm `/` and `/directory` 200 over CloudFront and the animations play (and respect reduced-motion).
      Traces: FR-3..FR-7, NFR-2 (requirements.md), design.md §7, §10
      Files: (no source change) infra/scripts/deploy-frontend.sh
      Verify: `AWS_PROFILE=IBD-DEV bash infra/scripts/deploy-frontend.sh` + curl `/` `/directory` 200
      Done when: deployed; `/` and `/directory` load on CloudFront with motion live; reduced-motion verified (manual).

## Dependency Graph

```
T-1 ─┬─ T-2 ─┬─ T-4 ─┐
     │       ├─ T-6 ─┤
     │       └─ T-7 ─┤
     └─ T-3 ─┬─ T-4  ┤
             └─ T-5 ─┴─ T-8 ─ T-9
```

Eligible when status is `[ ]`/`[~]` and every dep is `[x]`. T-1 first; then T-2 + T-3 (parallel); then T-4/T-5/T-6/T-7 (parallel) ; then T-8 → T-9.

## Testing & Verification Expectations

- Frontend only: `npm test` (Jest/RTL + jest-axe) / `npm run build` (static export). GSAP mocked in jsdom; `window.matchMedia` polyfilled.
- Hard gates before deploy: reduced-motion = final static state; content visible without GSAP; jest-axe 0 on Home + Directory; no CLS / LCP regression.

## Execution Conventions

- Commits: `[SPEC:enhancement/portal-animations] <message>`; audit trail in `execution.md`.
- Motion only — no content/color/layout/data change. Reduced-motion + progressive enhancement are release gates.
- Deploy (T-9) uses `--profile IBD-DEV`.
