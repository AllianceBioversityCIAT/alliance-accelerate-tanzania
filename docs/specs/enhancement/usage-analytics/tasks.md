# Tasks — Baseline Usage Analytics (GA4) + Cookie Consent

- Spec path: `docs/specs/enhancement/usage-analytics/`
- Traces: `requirements.md` FR-1…FR-7, NFR-1…NFR-7 · `design.md` §5–§10
- Depth: **Standard** · Budget (`design.md` §11, re-baselined 2026-08-31): **8** tasks · **~1,600** LOC · **~13** review rounds
- Commits: `[SPEC:enhancement/usage-analytics] <message>`

All verification runs from `frontend/` unless stated. Per the root guide's asymmetry rule, the **failure-only** form is canonical: a green run costs one summary line, and a **failure must be pasted complete and verbatim** — that output is the evidence the Reviewer audits. Use `npx eslint … --quiet` for lint, never `npm run lint` in `backend/` (it runs `--fix` and mutates files).

---

- [x] **T-1 Consent storage contract** (deps: none)
      Size: S · Effort: `medium` · Skills: `tdd`
      Scope: `frontend/lib/analytics/consent-storage.ts` — read / write / clear the consent record; own the storage key and the policy-version constant; tolerate storage that is absent or throws. No React, no DOM, no component.
      Traces: FR-3 (all 3 scenarios + both clauses), `design.md` §5.2, DD-2
      Files: `frontend/lib/analytics/consent-storage.ts`, `frontend/lib/analytics/consent-storage.test.ts`
      Verify: `cd frontend && npm test -- consent-storage --silent`
      Done when: a record round-trips; a record at a **lower** policy version reads as `undecided`; an absent record reads as `undecided`; a `denied` record reads as `denied` (not as absence); and a storage object whose accessor **throws** yields `undecided` without propagating.
      ⚠️ **Disqualifies the evidence:** a test that substitutes a plain object for storage never exercises the throwing path. The throwing case MUST be driven by an accessor that actually throws — if every storage test uses a benign mock, the failure-tolerance claim is unproven regardless of a green run. `tdd` is assigned here because this is consent gating, which the root guide names as where it earns its cost.

- [x] **T-2 Consent provider and hydration gate** (deps: T-1)
      Size: M · Effort: `medium` · Skills: `vercel-react-best-practices`, `react-doctor`
      Scope: `frontend/lib/analytics/ConsentProvider.tsx` — own the three-state value, expose it, a setter, and a **derived `showBanner` boolean** through a hook (DD-7). Mirror the placement and shape of the existing `SessionProvider`. Render children unconditionally; never render the banner before the storage read resolves.
      Traces: FR-3 (banner does not reappear after a choice), FR-1 (the state that gates injection), `design.md` §5.2 *Hydration note*, DD-4, **DD-7**
      Files: `frontend/lib/analytics/ConsentProvider.tsx`, `frontend/lib/analytics/ConsentProvider.test.tsx`
      Verify: `cd frontend && npm test -- ConsentProvider --silent`
      Done when: state resolves from storage after mount; a stored choice never produces a banner-visible frame — **asserted per-commit via a dependency-free `useLayoutEffect` frame log, not by a post-`render()` assertion** (see the disqualifier); `showBanner` is exposed and is true only when the read has resolved and the state is `undecided`; the setter writes through to storage and updates consumers; children render regardless of consent state.
      ⚠️ **Proven to discriminate:** the frame-log assertions MUST be shown to turn red under the mutation `useState<boolean>(true)` → `useState<boolean>(false)` (deleting the hydration flag), and the failing output recorded. That exact mutation left an earlier 11/11-green suite entirely green while genuinely producing the FR-3 flash — see the T-2 FAIL in `execution.md`.
      ⚠️ **Disqualifies the evidence:** "no banner on first frame" passes vacuously if the component renders nothing at all, ever. The same test MUST also assert the banner **does** appear once the read resolves with no stored record — a one-sided assertion here cannot distinguish a working hydration gate from a broken provider.

- [x] **T-3 Gated GA4 mount, with zero custom calls** (deps: T-2)
      Size: M · Effort: `xhigh` · Skills: `vercel-react-best-practices`, `react-doctor`
      Scope: `frontend/components/analytics/GoogleAnalytics.tsx` — `next/script`, `strategy="afterInteractive"`, rendered only while `granted`, deduped by a stable `id`. Missing measurement ID renders nothing. `onError` handled silently with **no** retry. No custom event, parameter, dimension, or user-property call site.
      Traces: FR-1 (all 3 scenarios + both clauses), FR-4 (scenario + both clauses), FR-7 (both scenarios + both clauses), NFR-7, `design.md` §5.5, DD-1
      Files: `frontend/components/analytics/GoogleAnalytics.tsx`, `frontend/components/analytics/GoogleAnalytics.test.tsx`
      Verify: `cd frontend && npm test -- GoogleAnalytics --silent`
      Done when: no script element and no vendor global exist while `undecided` or `denied`; exactly one script element exists after `granted`, and a re-render does not add a second; an absent measurement ID renders nothing and throws nothing; a script `error` event leaves the tree rendered, logs no uncaught error, shows no visitor-facing surface, and issues no retry.
      ⚠️ **Disqualifies the evidence:** FR-4's "no custom event was sent" is **vacuously true whenever no script loaded at all** — which is most of this file's test cases. The custom-call assertion MUST run in a state where the script *did* load and MUST assert that the calls observed are config/consent only. A green FR-4 assertion taken from a `denied` fixture proves nothing.
      ⚠️ **Falsifying input:** moving a single `gtag('event', …)`-shaped call into this component must turn the suite red. If it does not, the FR-4 gate does not discriminate and is not evidence.

- [x] **T-4 Consent banner** (deps: T-2)
      Size: M · Effort: `medium` · Skills: `ui-ux-pro-max`, `tailwind-design-system`, `react-doctor`
      Scope: `frontend/components/analytics/ConsentBanner.tsx` — a labelled landmark region (**not** a dialog), two symmetric one-click controls, a link to `/privacy`. `fixed bottom-0`, full width, `z-[1100]`. Tokens only. **No motion.**
      Traces: FR-2 (both scenarios + both `BUT` + both `AND IT MUST`), NFR-1, NFR-2, NFR-3, `design.md` §5.3, §5.4, DD-6, **DD-7**
      Files: `frontend/components/analytics/ConsentBanner.tsx`, `frontend/components/analytics/ConsentBanner.test.tsx`
      Verify: `cd frontend && npm test -- ConsentBanner --silent`
      Done when: `jest-axe` reports zero violations; both controls are `<button>`, keyboard-reachable, identical in size and font, each resolving in one click; the region has an accessible name and is **not** `role="dialog"`/`alertdialog`; no backdrop element exists in the tree; a `/privacy` link is present; every class resolves to a `docs/ux-ui/design.md` §7 token; no transition or animation class is present.
      ⚠️ **Disqualifies the evidence:** a green `jest-axe` run is **not** contrast coverage and **not** layout coverage. `jest-axe`'s `color-contrast` rule is skipped without failing in jsdom (`docs/trd/trd.md` QA-11), and jsdom evaluates no geometry — so "axe passed" MUST NOT be reported as satisfying NFR-4 or NFR-5. NFR-4's inherited `primary-fg`→`primary` gap is recorded in `design.md` §10 and is explicitly **not** this task's to close. NFR-5 belongs to T-8.
      ⚠️ **Falsifying input:** changing the region to `role="dialog"`, or adding a second required click to the reject path, must turn the suite red.
      ⚠️ **Visibility comes from `showBanner` (DD-7) — never composed locally.** A bare `consent === 'undecided'` check is a **FAIL**, not a style note: it is true during the unresolved window and produces the exact FR-3 flash, and it fails invisibly in jsdom. Carried forward from T-2's review.

- [x] **T-5 Mount in the `(public)` layout, with the admin-exclusion gate** (deps: T-3, T-4)
      Size: S · Effort: `xhigh` · Skills: `vercel-react-best-practices`
      Scope: mount `ConsentProvider` (rendering `ConsentBanner` and `GoogleAnalytics`) in `frontend/app/(public)/layout.tsx`. **Do not touch `frontend/app/layout.tsx`.** Add the exclusion test.
      Traces: FR-5 (both scenarios + `BUT` + `AND IT MUST`), `design.md` §5.1, DD-3
      Files: `frontend/app/(public)/layout.tsx`, `frontend/app/(admin)/analytics-exclusion.test.tsx`
      Verify: `cd frontend && npm test -- analytics-exclusion --silent`
      Done when: an `(admin)` route renders no script element and no banner **even with a `granted` record present in storage**; the root layout contains no analytics reference; the exclusion is achieved by layout placement, with no pathname allowlist as the mechanism.
      ⚠️ **This is the KZ-002 ×3 task — the gate must be proven to discriminate.** Before reporting completion, temporarily move the provider into `frontend/app/layout.tsx`, re-run the command, and **paste the failing output** into `execution.md`. Then revert. A gate that cannot fail is not a gate: an absence assertion over a component that was never going to render there passes identically whether the exclusion works or not, and this one absence assertion is the whole of FR-5's coverage.
      ⚠️ **Disqualifies the evidence:** a completion report for this task without the deliberate-failure output is not reviewable and must be treated as incomplete, not as a pass.
      ⚠️ **AMENDED 2026-08-31 after execution — the clause above was incomplete.** Moving the provider to the root layout proves only that the *source-sweep* assertion discriminates: this task's test renders `AdminLayout` in isolation, so `app/layout.tsx` is never in its render path and **no probe of that file can redden the runtime admin assertions.** FR-5's behavioural guarantee requires a *second* mutation — wiring the stack into `frontend/app/(admin)/layout.tsx` — which is what actually reddens the no-script and no-banner assertions. Both probes and their verbatim unfiltered output are in `execution.md`. A mandated falsifying-input clause is itself a claim about the harness and needs the same scrutiny as a claim about behaviour.

- [x] **T-6 `/privacy` disclosure and the change-choice control** (deps: T-2)
      Size: M · Effort: `medium` · Skills: `frontend-design`, `tailwind-design-system`
      Scope: add the analytics disclosure to `frontend/app/(public)/privacy/page.tsx` and **re-scope** its opening scope sentence to an enumerated two-item set (contact submissions **and** analytics cookies) that still names what it does not cover. Add `ConsentChoiceControl.tsx` as a client island; the page itself stays a static server component.
      Traces: FR-6 (both scenarios + `BUT` + `AND IT MUST` + the verified precondition), `design.md` §5.6, §8.1, DD-5
      Files: `frontend/app/(public)/privacy/page.tsx`, `frontend/components/analytics/ConsentChoiceControl.tsx`, `frontend/app/(public)/privacy/privacy-a11y.test.tsx` (additions only)
      Verify: `cd frontend && npm test -- privacy --silent`
      Done when: the page names the **4** collected signals, Google as recipient, that cookies are set only after consent, and the route to change a prior choice; the control changes the stored choice and the banner state reacts without a reload; the scope sentence is **re-scoped, not deleted**, and still states that registration and directory data are out of its scope; the "not consent to publish" section is semantically unchanged; `jest-axe` stays clean.
      ⚠️ **Disqualifies the evidence:** this task is **purely additive** to `privacy-a11y.test.tsx` — the four existing content assertions (*what a submission collects*, *who receives it*, *relayed by email and not stored*, *not consent to publish*) were verified during specification to not assert the scope sentence, so none of them needs relaxing. **If any pre-existing assertion was edited, weakened, or removed to make this task pass, the evidence is void** and the change must be re-done. Per `design.md` §8.1, deleting the scope limitation rather than re-scoping it is a regression, not a simplification.

- [x] **T-7 Measurement-ID wiring** (deps: T-3)
      Size: S · Effort: `low` · Skills: none
      Scope: add `NEXT_PUBLIC_GA_MEASUREMENT_ID` to `frontend/.env.example` (documented, **empty**, noting that it is deliberately left unset for local dev so development traffic does not pollute the property). In `infra/scripts/deploy-frontend.sh`, add `GA_MEASUREMENT_ID` with a committed default and inject it on the existing `npm run build` line, following the script's established `API_BASE_URL` override shape.
      Traces: `requirements.md` §7, `design.md` §7, NFR-6
      Files: `frontend/.env.example`, `infra/scripts/deploy-frontend.sh`
      Verify: `bash -n infra/scripts/deploy-frontend.sh && cd frontend && npm run build`
      Done when: the script parses; the build succeeds with the variable both set and unset; `.env.example` documents the variable and the deliberate local omission; **the resolved measurement ID is echoed in the script's existing pre-build config summary block** (beside `ApiBaseUrl`), printing an explicit "not set — building without analytics" when it resolves empty.
      **Decision (2026-08-31): the committed-default form, not env-only.** A GA4 measurement ID is not a secret, and FR-7 makes an absent variable non-fatal — so env-only fails by shipping a successful, analytics-free deploy in silence. The committed default plus the `GA_MEASUREMENT_ID` override is a superset of env-only's flexibility without that failure mode, and matches how this script already bakes in the non-secret Cognito wiring values. The echoed summary line above is what makes either form auditable from a deploy log.
      ⚠️ **Do not** move this value into SSM or Secrets Manager — a GA4 measurement ID ships in the page source of every page and is not a secret (`design.md` §7). ⚠️ **Do not** add `--profile` to `deploy-frontend.sh`: it reads `AWS_PROFILE` and parses no flags, so a passed flag is silently ignored and an ambient profile wins.
      ⚠️ **Disqualifies the evidence:** `npm run build` succeeding with the variable **set** proves nothing about the absent case, which is the one FR-7 rests on. Both runs are required.

- [x] **T-8 Rendered layout verification — the substituted NFR-5 gate** (deps: T-5, T-6, T-7)
      Size: S · Effort: `medium` · Skills: none (drive headless Chromium over CDP; `playwright-cli` only if the running environment already provides it)
      Scope: capture the banner rendered at **375 / 768 / 1440** on a `(public)` route **and on `/map`**, plus one post-choice capture confirming the banner is gone. Attach the captures to `execution.md`.
      Traces: NFR-5, NFR-6, `design.md` §5.4, §9
      Files: `docs/specs/enhancement/usage-analytics/execution.md` (evidence only — no source change)
      Verify: `cd frontend && npm run build` then serve `out/` and capture at the three widths; review the captures.
      Done when: at all **3** widths the banner obscures no interactive control, pushes nothing off-screen, and the page body does not scroll horizontally; on `/map` the banner paints **above** the Leaflet controls and `MapLegend` (confirming `z-[1100]` clears `z-[1000]`), and the legend overlap is visibly transient — absent after a choice.
      ⚠️ **This task exists because no automated gate covers this class.** jsdom evaluates no layout, and `frontend/CLAUDE.md` records a change that broke the `/register` grid with lint, contrast **and** build all green. A passing `npm test` is not evidence for NFR-5 and must not be offered as such.
      ⚠️ **Disqualifies the evidence:** a capture taken at a viewport the harness silently resized, or one showing a route that failed to load its map tiles, is not evidence — re-take it. If `/map` cannot be captured with the map actually rendered, report the gap rather than substituting a directory-route capture.
      ⚠️ **Human gate:** this task's output is reviewed by the user at the HITL pause, not adjudicated by an automated PASS.

- [x] **T-9 Move the OSM attribution control clear of the banner** (deps: T-8's finding)
      Size: S · Effort: `medium` · Skills: none
      Scope: reposition Leaflet's attribution control in `frontend/components/map/LeafletMap.tsx` so the consent banner cannot occlude it. The zoom control occupies top-left and `MapLegend` occupies bottom-left, so **top-right is the free corner**. Change nothing else about the map.
      Traces: FR-2 scenario 2 (*"every link, control, and region of the underlying page remains operable"*), `design.md` §5.4 (amended), T-8's measured finding
      Files: `frontend/components/map/LeafletMap.tsx`
      Verify: `cd frontend && npm test -- --silent && npm run build`, then **re-run T-8's `/map` capture at 768 and 1440** and confirm by `elementFromPoint` that the attribution links are no longer under the banner.
      Done when: the attribution renders in a position the banner never reaches; `elementFromPoint` at the attribution's rect returns the attribution, not the banner, while the banner is visible; the OSM attribution text itself is unchanged; the zoom control and `MapLegend` are undisturbed.
      ⚠️ **Added 2026-08-31 by user approval**, from T-8's rendered finding — not minted from an advisory. `design.md` §5.4 was amended in the same change to record which occlusions are accepted and which are not.
      ⚠️ **Disqualifies the evidence:** `npm test` cannot see this. There is no `LeafletMap.test.tsx` — Leaflet does not render in jsdom — so a green suite proves only that nothing else broke. **The evidence for this task is the re-captured `elementFromPoint` result**, exactly as it was for the finding that created the task.
      ⚠️ Do **not** change `OSM_ATTRIBUTION`'s text or the tile URL. The licensing requirement is that the attribution be *visible*; its wording is already correct.

---

## Dependency Graph

```
T-1 → T-2 → T-3 → T-5 → T-8 → T-9
              └──→ T-7 → T-8
      T-2 → T-4 → T-5
      T-2 → T-6 ──────→ T-8
```

A task is **eligible** when its status is `[ ]`/`[~]` and every dependency is `[x]`. Ties broken by document order.

**Parallel-safe pairs after T-2:** (T-3, T-4) and (T-4, T-6) touch disjoint files. **T-3 and T-7 are not** — T-7 wires the variable T-3 consumes.

## Coverage Closure (KZ-001)

Closed at **scenario and clause** granularity, not requirement ID. Every `BUT it must NOT` and `AND IT MUST` below is owned by exactly one task.

| Requirement | Scenarios | `BUT` / `AND IT MUST` clauses | Owner |
|---|---|---|---|
| FR-1 | 3 | no denied-state injection · no cookie pre-grant | T-3 |
| FR-2 | 2 | not a dialog / no focus trap / no backdrop · reject not harder than accept · landmark not dialog · links `/privacy` | T-4 |
| FR-3 | 3 | absence ≠ consent · rejection as durable as acceptance | T-1 (storage), T-2 (render) |
| FR-4 | 1 | no search term transmitted · no custom geographic configuration | T-3 |
| FR-5 | 2 | no pathname allowlist as mechanism · gate proven to fail | T-5 |
| FR-6 | 2 | scope re-scoped not deleted · "not consent to publish" intact · no existing assertion relaxed | T-6 |
| FR-7 | 2 | no render-blocking load · no retry loop | T-3 |
| NFR-1 / NFR-2 / NFR-3 | — | axe-clean · tokens only · no motion | T-4 |
| NFR-4 | — | inherited gap, recorded not closed (`design.md` §10) | *none — accepted* |
| NFR-5 | — | 3 widths incl. `/map` | T-8 |
| NFR-6 | — | static export preserved | T-7, T-8 |
| NFR-7 | — | no PII to the provider (structural, via FR-4) | T-3 |

**NFR-4 is the one unowned row, and deliberately so.** `primary-fg`→`primary` is absent from `frontend/lib/contrast.test.ts`'s INKS/GROUNDS lists, so every primary button in the app is already unasserted for contrast. This spec inherits that gap rather than creating it; closing it app-wide is a separate change. Recorded as an accepted risk, not discharged by citing NFR-1's axe coverage — which cannot evaluate contrast at all (`docs/trd/trd.md` QA-11).

## Delivery

**Single PR.** The spec is well past the ~400-LOC line where a split is normally considered, but the task graph converges: T-8 is a whole-feature visual gate that cannot run until T-5, T-6 and T-7 have all landed, and FR-1's central guarantee (nothing loads before consent) is only observable with the provider, the banner and the script mount all present. Splitting would ship a first PR whose main requirement is unverifiable.

Review order for the PR description: **T-5 first** (the FR-5 exclusion gate and its deliberate-failure evidence — the highest-consequence assertion), then T-3 (the FR-1/FR-4 gate), then T-4 and T-6, then T-1/T-2/T-7 as supporting mechanism, and T-8's captures last as the layout evidence.
