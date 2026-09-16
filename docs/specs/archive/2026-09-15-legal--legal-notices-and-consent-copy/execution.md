# Execution — Legal Notices & Approved Consent Copy

## Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/legal/legal-notices-and-consent-copy/` |
| Branch | `feat/legal-notices` (from `main`) |
| Jira | ATP-54 |
| Run scope | **Planned as Phase A only** (T-1..T-7 plus T-10's executable half), with T-8/T-9 blocked on Legal. **Actually executed: all ten tasks** — Legal delivered the three texts mid-run and Phase B was executed in the same session. *(Corrected 2026-09-15 by validation: this block described the plan, not the run, for the whole of the run.)* |
| Budget (design.md §11) | Declared: 10 tasks · ~700 net LOC · ~4 review rounds. **Actual: ~3,567 net code LOC and 9 review rounds — a ~5× LOC breach.** See the budget entry at the end of this log. |
| Review depth | Scaled to blast radius, not applied evenly. **Actual roster:** Reviewer on T-1 (×2, effort `max`), T-8 (×2, escalated from the light-touch the spec assigned), T-9 (×2, effort `max`), T-10 (×1), plus three validators. T-2..T-7 light-touch. |
| Concurrency | PR #72 (`chore/security-headers`) open, verified disjoint in files and semantics. Not waited on. |
| Started | 2026-09-15 |

## Task Execution History

### T-7 — Confirm the governance count and record D-8 · **PASS**

| Field | Value |
|---|---|
| Date | 2026-09-15 |
| Attempts | 1 (Leader-inline — single-file write to a document the Leader owns; below the delegation threshold) |
| Requirements covered | FR-9 |
| Review | Light, per `tasks.md`. No independent Reviewer — this task writes no code and touches no baseline. |

**The decision (D-8).** No registration was ever accepted under `v1.0-placeholder`. No re-consent flow is required, no applicant is contacted, and no follow-up ticket is opened. `v1.0-placeholder` is nevertheless **retained** in the known-version set: the append-only rule is not suspended because the set it protects happens to be empty. A rule with an exception is not an invariant.

This discharges ATP-54's acceptance criterion *"A documented decision exists for registrations accepted under the placeholder version."*

**Basis of the claim — stated, not measured.** The evidence is the product owner's statement on 2026-09-15: *"No ha habido aceptaciones bajo la versión placeholder, porque aún no hemos salido a producción con esto."* Public self-registration has never been released to production, so no environment holding real applicant traffic exists to query.

This is recorded as **stated-by-owner**, deliberately not dressed up as a measured value (KZ-011: a requirement that is internally consistent and externally false passes every gate AKILI has). No `SELECT` was run, because there is no environment against which running one would mean anything — and a query against a development database would return fixture rows, which FR-9's disqualifier explicitly excludes from counting in either direction.

**The disconfirming input, named.** One `Registration` row whose `consentPolicyVersion` is `v1.0-placeholder` and which was created by a real applicant falsifies D-8. Should such a row ever surface — for example if an environment thought to be non-production turns out to have carried real traffic — the governance question re-opens as its own ticket and is **not** resolved by this entry. Development and staging fixture rows are not acceptances and confirm nothing.

**Verification:** `SELECT consentPolicyVersion, status, COUNT(*) FROM Registration GROUP BY 1,2;` remains the check if a production environment is ever stood up before T-9 lands. Until then the basis above stands as recorded.

### T-2 — `LegalDocument` content contract and shared renderer · **PASS**

| Field | Value |
|---|---|
| Date | 2026-09-15 |
| Attempts | 1 |
| Requirements covered | FR-7, NFR-1, NFR-3 (NFR-2 partially — see *Not covered*) |
| Review | Light, per `tasks.md`. No independent Reviewer: no baseline document, no data path, no PII surface. |

**Files:** `frontend/lib/content/legal/types.ts` (new) · `frontend/components/legal/LegalDocumentView.tsx` (new) · `LegalDocumentView.test.tsx` (new, 12 tests).

**Verification:** `npm test -- LegalDocumentView --silent` → 12/12 pass · `npm run lint` → clean (only pre-existing unrelated `<img>` warnings in admin test files) · `npm run build` → compiled, static export emitted all 24 routes. The renderer adds no route, so the build confirms only that it did not break static export — not that anything new was emitted.

**Demonstrated falsifier (KZ-002).** Replaced the tripwire's `expect(() => …).toThrow()` with a direct positive assertion against a document whose first section omits its heading:

```
Tests: 1 failed, 11 passed, 12 total
TestingLibraryElementError: Unable to find an accessible element with the role "region" and name "First section"
  at Object.getByRole (components/legal/LegalDocumentView.test.tsx:180:19)
```

Reverted; suite back to 12/12. The gate discriminates.

**Both mandatory greps clean:** no hex literals and no token-opacity modifiers in the diff.

**Design notes carried forward.** Markup mirrors the existing `/privacy` page exactly (same `h1` classes, `aria-labelledby` sections, `max-w-prose` paragraphs), so T-5's migration is a swap rather than a restyle. Section ids are index-prefixed (`legal-section-{i}[-{slug}]-heading`) so two sections sharing a heading cannot collide. The optional slot is `{ afterHeading, content }`, rendered as a sibling after the matching section via `flatMap`; an `afterHeading` matching no section renders nothing, and that is tested.

**Not covered — stated, not implied.** jsdom evaluates neither contrast nor layout. Nothing here covers rendered legibility, spacing, or whether the token classes read correctly at any real viewport. That is defect class 9 (requirements.md §8), routed to the human check recorded against T-10. The suite also cannot prove copy accuracy (defect class 8) — this task authors no copy.

**Not Done / Assumptions:** none.

#### ADVISORY (recorded, does not gate, does not become work)

The Implementer noticed `frontend/components/shell/Footer.tsx` uses `text-bg/80`, a token-opacity modifier that is inert in this project.

**Leader adjudication — verified against the artefact, not the report (KZ-008).** The finding is accurate as to the mechanism: `frontend/tailwind.config.ts` defines every colour as `var(--color-x)`, and Tailwind cannot compose an alpha into an arbitrary `var()`, so the class matches no rule; a `text-*` in that state silently inherits its parent, which here is `text-bg` — the same colour at full opacity.

**But it is not a defect to fix in this spec.** `frontend/CLAUDE.md` documents this exact class of occurrence and records that the remaining instances were **deliberately left** after the five load-bearing ones were fixed on 2026-09-10, because they are decorative and render indistinguishably from the intent. Footer's is one of those.

T-6 is therefore **not** widened to absorb it — an advisory is recorded and dies here. T-6's existing constraint stands unchanged: it must not *add* a new one.

*(Correction to a standing note in the Leader's own memory: that note said `frontend/CLAUDE.md` was unreliable on this point. It was, before the guide was corrected; it now carries the most complete account of the defect in the repository. The memory has been updated.)*

### T-3 + T-4 — Cookie Notice content module and `/cookies` · **PASS**

| Field | Value |
|---|---|
| Date | 2026-09-15 |
| Attempts | 1 (one Implementer for both tasks — a single deliverable; Delegation Ceiling: one subagent beats several for one modest job) |
| Requirements covered | FR-3 (all three scenarios), NFR-1, NFR-3, NFR-4 |
| Review | Light, per `tasks.md`. |

**Files:** `frontend/lib/content/legal/cookies.ts` · `frontend/app/(public)/cookies/page.tsx` · `cookies-a11y.test.tsx` (all new).

**Verification:** `npm test -- cookies --silent` → 13/13 · **full suite** `npm test -- --silent` → 113 suites, 1715 tests pass, no regressions · `npm run lint` → 0 errors · `npm run build` → `out/cookies/index.html` emitted, 31,851 bytes, confirmed present. `react-doctor --scope changed` → 100/100.

**Token/hex greps:** zero hits. The three files carry no `className` at all — styling is inherited entirely from `LegalDocumentView`, which is the contract working as intended.

**Falsifiers — two reddened, one did not, and the one that did not is the important result.**

1. Delete the Google recipient mention → named test *"(a) names Google Analytics as the tool and Google as the third-party recipient"* reddened; the other 12 stayed green. ✅
2. Add `'use client'` + `useState` to the page module → **did NOT redden.** The build succeeded and emitted an identical `out/cookies/index.html`.
3. Remove a section heading → the axe test reddened with `Headings should not be empty (empty-heading)`; 12 others stayed green. ✅

**Leader adjudication of falsifier 2 — the spec was wrong, not the implementation.** The Implementer is correct: under `output: 'export'`, a `'use client'` page using a plain `useState` is fully compatible with static export — Next.js prerenders it to static HTML and hydrates client-side. What actually breaks the export is `useSearchParams()` without a `Suspense` boundary, a route handler, or a dynamic segment.

This is a **KZ-011 defect in the Leader-authored spec text**, not in the diff: a falsifying input named for a gate that cannot observe it. It reads as rigour and proves nothing. Had the Implementer reported the falsifier as "demonstrated" without running it — the cheap path — the error would have survived into T-5, T-8 and every future frontend spec that copied the pattern.

**Correction applied 2026-09-15 with the two-direction sweep (KZ-004).** Forward: grepped `'use client'` across the spec folder → three sites, all corrected — `requirements.md` §8 defect class 6, `tasks.md` T-4's falsifier, `design.md` §5.2's gate claim. Backward: grepped citations of NFR-1 and defect class 6 → `design.md` §5.2 asserted "no hooks … `npm run build` … fails loudly on violation", which the measurement falsifies; corrected to record that the server-component preference is **enforced by review, not by the build**. `design.md` §5.2's separate statement about where the single client boundary lives is unaffected and was left alone.

**Decisions accepted.**
- Version `v1.0` / effective date 15 September 2026 for the Cookie Notice. Consistent with D-6; this document is engineering-authored so no Legal sign-off gates its version literal.
- FR-3 clause (f) — *must NOT claim auth/fraud/performance/troubleshooting cookie use* — is satisfied by **omission**, verified by a keyword-absence test. The Implementer's reasoning is sound and worth preserving: an explicit *"we do not use cookies for X"* disclaimer would itself contain the forbidden keywords, making a keyword-absence test unusable against it. The reasoning is recorded in `cookies.ts`'s header and the test's comments, so a future reader does not "improve" it back into unverifiability.

**Not covered — stated, not implied.** jsdom evaluates neither contrast nor layout: nothing here covers rendered legibility at a real viewport (defect class 9 → T-10's human check). Content accuracy is defect class 8 and has no automated gate; NFR-4's tree audit is the substitute, and the content was built directly from that audit table.

**Not Done / Assumptions:** none outstanding. `ConsentBanner` still points at `/privacy`, which is correct until T-6.

### T-1 — Append-only registry of consent policy editions · attempt 1 · **REVIEWER FAIL**

| Field | Value |
|---|---|
| Date | 2026-09-15 |
| Implementer | T2 (sonnet), effort `max` |
| Reviewer | T3 (opus), effort `max` — different model, `author ≠ auditor` held |
| Review mode | Single Reviewer, lens checklist. **Deviation from the skill's default recorded:** effort `max` nominally calls for parallel lens reviewers; the Leader chose one thorough auditor because the diff is a ~370-line pure-data module with no security, migration or data-loss surface. Fanning out three lens agents over it would be ceremony. The gate that matters — the append-only invariant and the served contract — was audited in depth. |

**Implementer report.** Registry with four-level `Object.freeze`, derivations via `deriveConsentPolicyVersion` / `deriveKnownConsentPolicyVersions`, lookup pair `findConsentPolicyEdition` / `getConsentPolicyEdition` mirroring the `isVersionKnown` seam. `CONSENT_POLICY_SECTIONS` retained as a derived mutable shallow copy so `registrations.controller.ts` needed **zero** changes. Verification green: 43/43 targeted, full backend suite 1097/1097, `nest build` clean, `eslint --quiet` clean. Three falsifiers reported as demonstrated.

**What the Reviewer confirmed as correct** (by reading; it ran nothing and says so): the freeze topology is structural, not decorative — `.map()` produces fresh copies, so the exported graph is fully disjoint from the private source array, which answers the source-array-hole question directly. `registrations.controller.ts` genuinely needs no change: every consumer of `CONSENT_POLICY_VERSION` was enumerated and none depends on the literal type that widened to `string`. All four section strings are byte-identical in the same order. The tripwire's polarity is unchanged and live. `isVersionKnown`'s seam and comment are preserved.

#### FAIL 1 — defect class 3's gate cannot fail on its own named falsifying input

**Discovered issue.** The two wiring assertions (`consent-policy.spec.ts` — `CONSENT_POLICY_VERSION` and `KNOWN_CONSENT_POLICY_VERSIONS` each compared to their derive function applied to the real registry) are **tautological on a one-element registry**. Apply the falsifier the spec actually names — re-introduce a hand-written literal *of the same value* — and the Reviewer enumerated every assertion in the repository that reads either symbol (`consent-policy.spec.ts` ×3, `registrations.controller.spec.ts` ×2, `registrations.service.spec.ts` ×3, `pii-boundary.spec.ts`, `registrations-submit.e2e.spec.ts`). **Every one stays green.**

**Violated rule.** `requirements.md` §8 defect class 3 (falsifying-input column); `tasks.md` T-1 *Falsifying inputs* (1) and *Done when*.

**Leader adjudication — the finding stands, and it sharpens what the Implementer actually demonstrated.** The Implementer's falsifier (1) grew the registry to two editions and hardcoded `'v1.0-placeholder'` while the current version was `'v1.1-FALSIFIER-DEMO-TEMP'`. That is a **wrong-value** mutation, and it did redden a named test. But drift — the defect class 3 actually guards — is value-*preserving* at the moment it is introduced: that is what makes it drift. The demonstration was real and the gate it demonstrated is not the gate the spec asked for. This is the same trap the module's own `isVersionKnown` comment warns about, reproduced one level up.

#### FAIL 2 — FR-1 scenario 3's "must NOT begin serving a non-current edition" has no falsifiable guard

**Discovered issue.** `CONSENT_POLICY_SECTIONS` is built inline from `CONSENT_POLICY_EDITIONS[length - 1].sections` and, alone among the three derivations, was given **no parameterized seam**. Its only test compares it to that same expression, which with one edition is the same object as `[0].sections`. Mutate the module to `[0]` and the test stays green **despite its own title asserting "not any superseded one"**.

**Why this is the serious one.** After T-9 appends `v1.0`, that mutation would serve the *placeholder* edition from the public endpoint while reporting `version: 'v1.0'` — a consent-evidence mismatch on the exact wire an applicant accepts from. The inconsistency is visible in the module itself: the two derivations that never reach the public wire carry long doc comments explaining their seams; the one that does reach it has none.

**Violated rule.** `requirements.md` FR-1 scenario 3, clause *"BUT it must NOT … begin serving a non-current edition"*; `design.md` §4.2 (parameterization rationale, applied inconsistently); `tasks.md` T-1 *Clause ownership* — the key-set assertion covers the key half, nothing covers the which-edition half.

#### ADVISORY (recorded, does not gate)

1. The shallow copy is **sound** in the direction the Leader flagged: a consumer can `push`/`splice` the served array (and in a warm Lambda that corruption would persist across requests) but cannot alter a section's text and **cannot reach `CONSENT_POLICY_EDITIONS`**. The legal record is unreachable from the served copy. It is also strictly *less* mutable than the pre-diff export, so not a regression.
2. Section objects are now frozen and TS-compiled modules run strict, so a future `section.body = …` will throw where it previously succeeded silently. No such site exists today.
3. The doc comment overstates what `Object.freeze` buys: freeze stops a *caller* mutating at runtime; nothing stops a *developer* deleting an edition from the source literal — that is held by the retention tests alone. Inherited phrasing from `rejection-reasons.ts`, not invented here.
4. **Forward pointer to T-9 — carried into its brief, not left here.** The diff adds a *second* `PLACEHOLDER`-containment assertion, on the historical edition retrieved by `getConsentPolicyEdition('v1.0-placeholder')`. That one must **NOT** be inverted by T-9: after the bump it becomes a retention guard and stays correctly true. Only `registrations.controller.spec.ts`'s tripwire is T-9's to invert. Two superficially identical assertions now exist with opposite futures.
5. `deriveConsentPolicyVersion([])` throws a bare `TypeError`; its sibling returns `[]`. Asymmetry only, no requirement covers it.
6. Budget: `consent-policy.ts` ~90 → 238 lines (+148 net) against design.md §11's "backend ~140". On budget.

**Reviewer's stated boundary.** Everything above was established by **reading**; it ran no tests and no build, and says so explicitly. The two FAILs rest on exhaustive call-site enumeration, not suspicion. Its wrapper exposes no `skill` tool, so `nestjs-expert`/`tdd` were unreachable to it — noted as a harness limitation, not a gap in the audit.

### T-5 — Scaffold `/terms`, re-point `/privacy` at the shared renderer · **PASS**

| Field | Value |
|---|---|
| Date | 2026-09-15 |
| Attempts | 1 |
| Requirements covered | FR-4, FR-5 (structure only — prose is T-8), D-3, D-9 |
| Review | Light, per `tasks.md`. |

**Files:** `frontend/lib/content/legal/{terms,privacy}.ts` (new) · `frontend/app/(public)/terms/page.tsx` (new) · `frontend/app/(public)/privacy/page.tsx` (rewritten) · `terms-a11y.test.tsx` (new) · `privacy-a11y.test.tsx` (rewritten).

**Verification:** targeted 3 suites / 20 tests pass · full suite 114 suites / 1714 tests pass · lint 0 errors · build emits `out/terms/index.html` and `out/privacy/index.html`, both confirmed to contain the literal `PLACEHOLDER TEXT`. Token and hex greps zero. Both page modules carry no Tailwind classes at all — they compose `LegalDocumentView` only, so styling lives entirely in the T-2 renderer, which is the content contract behaving as designed.

**Falsifiers — all three reddened.**
1. Add an "I agree" checkbox to `/terms` → *"presents no acceptance control…"* reddened. ✅
2. Delete the "not stored by the platform" sentence → **exactly assertion (3) reddened; (1), (2) and (4) stayed green.** The four contact-channel facts are genuinely independent, which is what D-9's clause requires and what a single combined assertion would have hidden. ✅
3. Delete the limitation clause → the retention assertion reddened. ✅

**The ordering safeguard held.** `/privacy`'s limitation clause — *"does not describe how the registry handles data collected through organisation registration or shown in the public directory"* — is **retained** and now guarded by a named test. It is removed only by T-8, with the approved policy that makes it false (design.md §4.3). The "covers two things … and the analytics cookies" framing was corrected to one subject plus a pointer to `/cookies`, since cookies left.

#### Two coverage gaps found during the migration — commissioned, not volunteered

The Implementer was briefed to compare every cookie-related assertion in the old `/privacy` test against `cookies-a11y.test.tsx` **before** deleting any, and to report anything not covered on the cookies side. It found two and reported both rather than silently dropping them:

1. **Banner reactivity (DD-4) is no longer proven anywhere.** The old `/privacy` test mounted `ConsentProvider` + `ConsentBanner` + the page together to prove the banner disappears *immediately* when the control changes consent. The `/cookies` equivalent checks `readConsent()` only — it does not render `ConsentBanner` alongside. `ConsentBanner.test.tsx` does not cover it either: it uses a mocked context, not a real `ConsentChoiceControl` + `ConsentProvider` integration.
2. **The withdrawal rider's finer phrasing has no equivalent assertion.** The old test asserted the specific phrases *"including as you move between pages"* and *"stops the next time you load the site"*, plus a **negative guard** against *"until you navigate away"*. The `/cookies` asymmetry test matches only the two coarse phrases. The identical sentence now lives in `cookies.ts` with weaker guarding than it had on `/privacy`.

**Leader adjudication — in scope, and assigned to T-6.** This is **not** a 4R advisory and the "advisory never becomes work" rule does not apply: it is a coverage regression *caused by this spec's own migration*, surfaced by a check the Leader explicitly commissioned in the brief. Deleting coverage as a side effect of moving content is the reversion challenge's item (a) playing out in the test layer (design.md §4.3) — the content moved, so its guards move with it. Leaving them dropped would mean this spec shipped a silent regression of a delivered requirement.

T-6 already touches `ConsentBanner` and its test, which makes it the natural home for gap 1; gap 2 is a small addition to the cookies test. Both are carried into T-6's brief **copied**, not left as a pointer here — a forward pointer is not transported by having been filed.

Both gaps are also documented in `privacy-a11y.test.tsx`'s header docblock, so they survive independently of this log.

**Not Done / Assumptions.** The placeholder section headings in `terms.ts` and `privacy.ts` are the Implementer's own structural stand-ins, invented to give the scaffold plausible shape, and are flagged as authored rather than derived from any spec source — T-8 replaces them wholesale, so their wording carries no weight. Scaffold values `version: 'v1.0-placeholder'` / `effectiveDate: '[PLACEHOLDER TEXT — pending legal review]'` mirror the backend convention; D-6 governs only the approved-copy state, so the spec prescribes no placeholder format. **Accepted.**

### T-6 — Re-route the consent banner, extend the footer, restore two coverage gaps · **PASS**

| Field | Value |
|---|---|
| Date | 2026-09-15 |
| Attempts | 1, plus one Leader-inline follow-up (below) |
| Requirements covered | FR-6 and its scenario; restores coverage for FR-3 clauses (d) and the DD-4 reactivity guarantee |
| Review | Light, per `tasks.md`. |

**Files:** `ConsentBanner.tsx` + test · `Footer.tsx` + test · `cookies-a11y.test.tsx` (gap restoration).

**Verification:** targeted 4 suites / 41 tests · full frontend suite **114 suites / 1717 tests pass** · lint clean · build emits `/cookies`, `/privacy`, `/terms` as static routes · `react-doctor --scope changed` 100/100.

**Falsifiers — all four reddened.**
1. `/cookie` typo on the banner → banner target assertion reddened. ✅
2. Removed each of the five footer destinations one at a time → **exactly one test reddened each time, the other four stayed green in all five runs.** Independent, as FR-6 requires. ✅
3. Broke `ConsentChoiceControl`'s accept path so it does not notify the provider → **the restored gap-1 integration test reddened** (`Expected: "granted", Received: "undecided"`). This is the one that mattered: it proves the restored test exercises real reactivity rather than restoring the *appearance* of a guard. ✅
4. Appended *"until you navigate away"* to the rider in `cookies.ts` while leaving both positive phrases intact → **the negative guard reddened in isolation**, positives stayed green. ✅

**Both coverage gaps closed.** Gap 1 (banner reactivity, DD-4) is restored as a real `ConsentProvider` + `ConsentBanner` + page integration in `cookies-a11y.test.tsx` — not the mocked-context version `ConsentBanner.test.tsx` uses, which was why the gap existed. Gap 2 restores the rider's finer phrasing *and* the negative guard.

**KZ-002 boundary, stated by the Implementer rather than implied:** the `href` assertions (banner plus five footer links) prove the link's target *string*, not that the destination exists. `npm run build` under `output: 'export'` is the complementary half and emitted all three routes. Neither check is sufficient alone; both ran.

`Footer.tsx`'s pre-existing `text-bg/80` and `border-bg/15` were left untouched, per the advisory adjudication recorded against T-2. No new token-opacity modifier was introduced anywhere in the diff.

#### Leader-inline follow-up — the banner's label was left pointing at the wrong noun

The Implementer flagged, and deliberately did **not** fix, a label/destination mismatch: the banner's visible link text still read *"Read our **privacy notice** to learn more"* while its `href` now resolved to `/cookies`. It judged the task scoped to the target, not the label, and said so rather than expanding scope on its own — the right call to escalate.

**Adjudicated as in scope and fixed inline** (two files, one word each — below the delegation threshold). This is not cosmetic: the banner exists to obtain **cookie** consent, and its "learn more" affordance told the visitor it led to a privacy notice. A consent disclosure whose own link misnames its destination weakens the consent it is collecting, which is the same class of concern FR-3 addresses by requiring the recipient be named. Label changed to *"cookie notice"*.

**One defect in the Leader's own inline fix, caught by the test suite.** The first edit updated the label and the link-target assertion but missed a **second** reference in a focus-order test (`ConsentBanner.test.tsx`, the tab-order assertion), which reddened. A grep for the superseded string found it; both were then updated together. Recorded because it is a textbook KZ-004 instance — a correction applied to its cited site while a sibling reference to the same superseded value survived — and it happened in the loop whose job is catching exactly that. The suite caught it in one run.

Final state after the fix: `ConsentBanner` 18/18, full frontend suite 114 suites / 1717 tests green, build clean.

### T-1 — Append-only registry of consent policy editions · attempt 2 · **REVIEWER PASS**

| Field | Value |
|---|---|
| Date | 2026-09-15 |
| Attempts | 2 (attempt 1 FAIL recorded above) |
| Implementer | T2 (sonnet), effort `max` — the rework rule's one-level bump had nowhere to go; compensated in the brief instead |
| Reviewer | T3 (opus), effort `max` |
| Requirements covered | FR-1 (all three scenarios), D-1, D-8; defect classes 2, 3 (partly — see latent gate), 4 |

**Both FAIL issues closed, and the Reviewer recomputed rather than credited.**

- *Issue 1.* `deriveKnownConsentPolicyVersions` returns `Object.freeze(...)`, so `KNOWN_CONSENT_POLICY_VERSIONS` is genuinely frozen and a hand-written literal is not. The Reviewer confirmed from source that a **value-preserving** replacement leaves `toEqual` green and flips only `Object.isFrozen` — which is exactly the falsifier attempt 1 could not produce.
- *Issue 2.* New parameterized `deriveCurrentEdition`; `CONSENT_POLICY_SECTIONS` builds from it, and `deriveConsentPolicyVersion` delegates to it, so "which edition is current" is decided in one place. The Reviewer **recomputed the mutation's redden-set from source** — exactly three tests — and it reconciles line for line with the Implementer's report.

**The delegation was checked for the coupling risk and cleared.** The Reviewer's reasoning is worth keeping: the tests target the shared function *directly* with a synthetic fixture rather than asserting the two consumers agree with each other. Had coverage instead been "version and sections come from the same edition", the delegation would have made that test **vacuously true**. It does not.

**No defect introduced by the fix.** Explicitly checked and cleared: init order/TDZ, the literal→`string` type widening against every consumer, the controller's unchanged contract by type rather than assumption, and — the one plausible collateral break — whether any consumer mutates the now-frozen section objects or the frozen known-version array. None does; `registrations.service.spec.ts` fakes the acceptance check with `jest.spyOn`, not by pushing onto the array, which *would* have thrown. This matters because a defect-in-the-fix is this repository's most recurrent failure mode (KZ-008, measured at 100% across five remediation rounds in an earlier spec).

**Latent gate, disclosed rather than faked.** `CONSENT_POLICY_VERSION` has no runtime discriminator — it is a string primitive, and a coincidentally-equal literal is indistinguishable until a second edition exists. No discriminator was fabricated. The gap is recorded in the export's own doc comment, mirrored at the test, and activates at T-9. The Reviewer verified the "no discriminator exists" claim was true rather than lazy: under CommonJS, TypeScript compiles the intra-module call to a direct local reference, so `jest.spyOn` on the module export cannot intercept it either.

#### Independent verification by the Leader (KZ-012)

The Reviewer closed by marking that the green run rested on `author == auditor` — it read the code but ran nothing, and the suite totals came from the agent that wrote them. **The Leader re-ran them on a quiet tree** (no delegated agent active, per the concurrency protocol):

```
Test Suites: 76 passed, 76 total
Tests:       1099 passed, 1099 total
nest build   → clean
npx eslint "{src,test}/**/*.ts" --quiet → clean
```

Matches the Implementer's report exactly. This is the gap KZ-012 names — *`author ≠ auditor` holds on reading and collapses on execution* — closed for this task rather than noted.

#### Advisories applied by the Leader (one-line comment edits; Reviewer stated they need no re-review)

1. **A sentence that was false today, and the Leader wrote it.** The code comment read *"the registry above makes production's set multi-entry for the first time"* — present tense, while the registry still carries exactly one edition. It becomes multi-entry at T-9. The Implementer was being **spec-faithful**: the sentence was inherited verbatim from `design.md` §4.2, which the Leader authored. In code it contradicted five correct *"exactly ONE edition today"* statements in the same file, including the premise the latent-gate note rests on. **Corrected at both sites — the code and its origin in `design.md`** — because fixing only the copy would have left the source to re-emit it at T-9 (KZ-004: sweep the withdrawn premise, not just the changed literal).
2. `"a hand-written array literal is never frozen"` overclaimed — an `Object.freeze([...])` literal would evade the discriminator. Narrowed to *"not frozen unless someone also freezes it"* at both occurrences. The assertion still catches the natural mutation and is kept.

Re-verified after the edits: `consent-policy` 22/22, lint clean.

#### Forward pointers to T-9 — carried into its brief, not left here

1. **Two `PLACEHOLDER` assertions with opposite futures.** Only `registrations.controller.spec.ts`'s tripwire is T-9's to invert. The `getConsentPolicyEdition('v1.0-placeholder')` assertion in `consent-policy.spec.ts` becomes a **retention guard** after the bump and must stay true forever. Both now carry comments making them distinguishable.
2. **Two latent gates activate together at T-9**, not one. The disclosure note names `CONSENT_POLICY_VERSION`; `CONSENT_POLICY_SECTIONS`' *wiring* (as opposed to its selection rule, now falsifiable) is the same latent class. Both should be tightened when the second edition lands.
3. **The retained edition's body prose is not byte-pinned** by any test — only `sections.length === 4` and `body.includes('PLACEHOLDER')`. The headings *are* pinned verbatim. Sufficient for FR-1 scenario 2 today; T-9's Reviewer should know the retained text could drift without reddening anything.

### T-10 — Sync the baseline documents to what shipped · **REVIEWER PASS on the executable half** · status `[~]`

| Field | Value |
|---|---|
| Date | 2026-09-15 |
| Attempts | 1, plus Leader-inline advisory application |
| Implementer | T2 (sonnet), effort `high` |
| Reviewer | T3 (opus), effort `high` — constitutional baseline, blast-radius rule |
| Requirements covered | FR-8 (partly — see *what is deliberately not done*), D-1, D-4, D-11 |

**Files:** `docs/ux-ui/design.md` §2 (IA) and §4 (Screen Inventory) · `docs/trd/trd.md` §12.5 (ADR index).

**This task stays `[~]`, not `[x]`.** Its ADR-013 half depends on T-9, which is blocked on Legal. Marking it complete would be an unfalsifiable completion: the checkbox would read done and the evidence would not support it. See *what is deliberately not done* below.

#### What the Reviewer established — by opening files, not by reading the diff

The gate here is not *"does the code match the spec"* but *"does the document match reality"* — the untrue-spec surface KZ-011 names, where every other AKILI gate asks the wrong direction. Nothing downstream catches a plausible-but-false sentence in a baseline. The Reviewer opened `cookies.ts`, `privacy.ts`, `terms.ts`, all four page components, `ConsentBanner.tsx`, `ConsentChoiceControl.tsx`, `LegalDocumentView.tsx`, `about/page.tsx`, `ForgotPasswordForm.tsx` and `auth-client.ts` rather than accepting the descriptions.

Confirmed against the tree: `/cookies` contains every element claimed, in order. `/privacy` is a bare static server component with no island, and **the limitation clause is present verbatim** — T-8's dependency holds. `/terms` presents no acceptance control, and that is structural (the renderer emits no interactive element) rather than incidental. The D-11 drift repair introduces no new inaccuracy: every item in the new About row exists at the stated path, and the Forgot-password row's load-bearing clause *"enumeration-safe notice either way"* was verified in `auth-client.ts`, where `resetPassword` returns `code_sent` even on `UserNotFoundException`.

**ADR-011:** Decision column byte-identical, amendment confined to Consequences. **ADR-013:** untouched — and the Reviewer verified the *premise has not expired*, confirming `consent-policy.ts` still holds one edition at `v1.0-placeholder`. **ADR-014:** faithful compression, occurring exactly twice (its row and ADR-011's new cross-reference).

**Withdrawn-premise sweep re-run by the Reviewer rather than credited.** It also checked §3 (Primary User Flows) and §5 (Navigation Model), which the diff does not touch: §3 describes only the banner's accept/reject and overlay-not-gate behaviour, §5 never enumerates footer destinations. Nothing stale.

#### Out-of-scope finding the Reviewer surfaced — adjudicated IN scope and fixed

The baseline documents were clean, but **the withdrawn premise survived in seven code and test comment sites that this spec itself created**, left behind when T-5/T-6 moved the island "unchanged":

- `ConsentChoiceControl.tsx` ×3 — *"the change-choice control on `/privacy`"*, *"`/privacy` itself stays a static server component"*, *"this island on `/privacy`"*
- `consent-storage.ts` ×1 — *"Exposed for the `/privacy` change-choice control"*
- `ConsentBanner.test.tsx` ×3 — *"the privacy link"*, after T-6 both re-pointed and re-labelled it

**Leader adjudication: fixed, and not scope creep.** The Reviewer was right not to FAIL T-10 on it — the task's declared scope is the two baseline files. But this is residue *this spec produced*: comments that now assert something false about where the island lives. Fixing false text a task created is finishing that task, not widening it, and it is the same KZ-004 shape the T-6 entry already records catching once. Comment-only, seven sites, no behaviour touched. The one surviving `/privacy` mention in `ConsentChoiceControl.tsx` is a deliberate historical note recording the move.

Re-verified after: `ConsentBanner` + `cookies` 32/32, lint clean.

#### Four Reviewer advisories applied by the Leader

1. *"No cookie content"* was imprecise **and scheduled to become false by this same spec** — `privacy.ts`'s lede does carry one cookie sentence (a pointer to `/cookies`), and FR-5/D-4 require Legal's Cookies section verbatim at T-8. Rewritten to "no cookie **disclosure**… the lede carries only a pointer", with the T-8 change noted inline.
2. Two mis-descriptions in the Cookie Notice row. (a) The island is **not** *"inside"* the "Changing your choice" section — `LegalDocumentView` pushes the slot as a sibling immediately **after** the matching `<section>`, so it sits outside that `aria-labelledby` region. In a blueprint this precise about aria semantics the distinction is load-bearing. (b) *"the consent banner's 'learn more' link"* read as a literal label; the accessible name is **"cookie notice"** — which is exactly what T-6's inline fix changed it to.
3. **The most consequential one.** The Privacy row compressed two different kinds of content into *"placeholder copy pending Legal"*: placeholder prose **and** the four engineering-authored contact-channel facts that D-9 says T-8 must **not** replace. A future T-8 agent reading that clause as licence to swap the module wholesale would delete a delivered requirement. The row now states the distinction explicitly and says why.
4. Bare `(T-8)` references are unresolvable once this spec is archived. All four now carry the spec path.

#### What is deliberately NOT done — the deferred half

- **ADR-013's consequences are not amended.** They assert the consent text is still placeholder and the version deliberately un-bumped, and **that is still true today**. Amending it before T-9 would make the document false in the opposite direction. T-9 owns it.
- **NFR-5 / defect class 9 — the human visual check of the three rendered pages at mobile and desktop widths has NOT been performed.** jsdom evaluates neither contrast nor layout, so nothing automated covers it. This is an open gap, recorded as open rather than quietly counted as covered.

#### ADR-014 allocation risk, stated rather than assumed

The Reviewer could not run `git log --all` (read-only wrapper) and so **could not confirm ADR-014 is still free on unmerged branches** — it verified only that the number is unused within `trd.md` as it stands. The Leader ran that check twice (2026-09-15, before spawning and again before writing): free on `main`, `origin/chore/security-headers` and `origin/public-profile`, max observed ADR-013.

Per the root guide's concurrency corollary, the number is being allocated **from a spec branch**, which does not make it free — it decides who pays. **If a collision appears at merge, this branch pays the renumbering.** Re-verify immediately before merging to `main`.

### T-8 — Approved Terms of Use and Privacy Policy · **PASS** (attempt 2)

| Field | Value |
|---|---|
| Date | 2026-09-15 |
| Attempts | 2 |
| Reviewer | T3 (opus), effort `max` |
| Review depth | **Escalated from the `tasks.md` assignment.** T-8 was scoped to *light review* when these files were placeholder scaffolds. They are now the legally operative text, and the parallel consent audit had just found a fidelity defect (D-12). A full clause-by-clause fidelity audit was run instead. |

**The central result: the legal text is faithful.** The Reviewer reconciled every bullet-glyph line in Legal's sources against the landed data — Privacy 16 headings + 61 bullets = 77 source glyph lines; Terms 17 + 63 = 80. Nothing dropped, added or reordered. **No D-12-class reframing exists in either document**: every source bullet is a bullet, every trailing sentence is a paragraph. Trailing sentences render *after* their lists in all 19 affected sections. Legal's own errors are preserved, not repaired.

**Attempt 1 FAIL — four issues, none in the text itself.**

1. `/privacy/page.tsx`'s comment still instructed future agents to **retain** the self-limiting scope clause that T-8 had just removed — a comment telling the next author to restore what FR-5 forbids.
2. `/terms/page.tsx` still described the approved text as *"currently placeholder prose, pending delivery from Legal"*.
3. **Unratified edits to a legal document.** Legal's sources contain **zero** typographic quote characters (grep-verified); the landed text had converted 12 double-quoted terms to curly. The stated rationale — escaping — is only half true: these are single-quoted TS strings, so `"Registry"` needs no escaping. Beyond legality, it defeats byte-exact diffing of Legal's next edition against the delivered file, which is the **only** practical verification for a document class with no automated gate (defect class 8).
4. **The one structural merge.** Both ledes joined Legal's separate paragraphs into one string; in Terms this folded the **binding assent clause** (*"By accessing or using the Registry, you agree to comply…"*) into the same muted paragraph as the welcome. *"The type holds one string"* was not a real constraint — `types.ts` had already been extended additively in the same task.

**Leader adjudication on 3 and 4.** Both were offered as *revert or obtain ratification*. **Reverted, not escalated** — the product owner's standing instruction for this task is *"respeta la estructura de Legal"*, so reverting is the option that obeys it, and asking again would be re-asking a settled question. Curly **apostrophes** were kept: in single-quoted TS strings those genuinely need escaping.

**Attempt 2 — all four closed, plus three adopted advisories.** `lede` widened to `string | string[]`; `LegalSection` made a **discriminated union** so `{paragraphs, blocks}` — which silently discarded `paragraphs` — is now a **compile error** (silent content loss is the wrong default in a legal renderer); a test labelled `FALSIFIER` that could not fail was replaced with one that does.

**Falsifiers:** collapsing Terms' lede back to one string reddens a named assertion · setting both `paragraphs` and `blocks` is rejected by `tsc` (`TS2322`) — a type-level guard's falsifier is a compile error, not a red test · the replacement falsifier reddens against an injected renderer bug.

**Verification:** 114 suites / 1733 tests · `tsc --noEmit` clean · lint clean · build emits both routes, and the emitted HTML contains **zero** curly double-quote characters.

---

### T-9 — Approved consent copy as edition `v1.0` · **Reviewer FAIL on attempt 2; remediated by the Leader, NOT re-reviewed**

> **Heading corrected 2026-09-15 by validation.** This entry previously read *"PASS (attempt 2)"* while its own body describes the attempt-2 Reviewer returning FAIL on the `whitespace-pre-line` rendering defect. What actually happened: attempt 2 closed the three attempt-1 issues and the Reviewer PASSed those, then raised a **new** FAIL on a defect attempt 2 had introduced. The Leader fixed it inline and **no Reviewer saw the fix.** The fix is small (one Tailwind utility plus a guard test) and its falsifier was demonstrated, but `author ≠ auditor` was not satisfied for it, and the entry must say so rather than absorbing it into a PASS.

| Field | Value |
|---|---|
| Date | 2026-09-15 |
| Attempts | 2 |
| Reviewer | T3 (opus), effort `max`, three rounds on this module |

**Attempt 1 FAIL — the finding that justified the whole review depth.** Legal's **sixth bullet** in §Consent had been carried as a trailing paragraph. The list is introduced by *"I expressly and voluntarily consent to:"* — so as Legal marked it, record retention is an **object of consent**; as landed, a separate statement of **understanding**. A change of legal framing, made by engineering, on the document a person accepts. Escalated to the product owner, who **decided to keep the paragraph form** → **D-12**, recorded with its grammatical evidence (Legal's fourth bullet ends `; and`, the fifth closes with a full stop, the sixth is a complete `I understand that…` sentence). Engineering did not make the call; the alternative was offered and declined.

Also closed: four withdrawn-premise sites in `consent-policy.spec.ts` including **a test name** that printed a false statement on every run — a **repeat** of the same defect fixed in this module at T-1 attempt 2, where the source was corrected and the sibling file was not swept. And the *"append BELOW this line"* comment, which had drifted mid-array: a future author following it literally would insert `v2.0` **between** the two editions, `deriveCurrentEdition` would keep returning `v1.0`, the new edition would never be served, and **nothing would redden**. Now pinned by a full version-sequence assertion.

**Attempt 2 verified by the Reviewer against Legal's source, including every string-concatenation seam** — the classic place a space is dropped or doubled. All 78 source lines accounted for, in order. Exactly the two authorized edits on `CONSENT_ACCEPTANCE_STATEMENT` (`☐ ` stripped, `provided..` → `provided.`). The new byte-pins over all nine `v1.0` sections are character-identical to the module text.

**PII checked by reading, not assumed:** the added `acceptanceStatement` is a module-level string literal — no actor data, no interpolation, no serializer involvement, on a route already fully public. The Reviewer also checked it against `pii-boundary.spec.ts`'s raw-value scan for false collisions (the prose contains no digits) and confirmed every unknown-version literal in the suite is unaffected.

#### The defect nothing in this repository could have caught

The Reviewer's attempt-2 FAIL found that every `v1.0` body embeds Legal's line breaks and `- ` bullet markers **inside a single string**, while the only consumer rendered it in a `<p>` with no `whitespace-pre-line`. Under the CSS default, every newline collapses to a space.

**Measured rather than reasoned** (`frontend/CLAUDE.md`'s rule; headless Chrome, 375px, against the real `v1.0` text):

| | height | lines |
|---|---|---|
| as shipped | **280px** | 14 |
| with `whitespace-pre-line` | **440px** | 22 |

Twelve data categories rendered mid-sentence in one run-on block, inside a `max-h-64` scroll region, behind the gate that captures consent — on the one document a person legally accepts. **Invisible to all 1733 frontend tests**: jsdom applies no CSS and the text content is present either way. Introduced silently by T-9, because the pre-T-9 placeholder bodies were single sentences with no newlines, so nothing exposed the limitation.

**Fixed** with `whitespace-pre-line`, the measurement recorded at the call site, plus a guard test that pins the class and **states in its own docblock what it cannot prove** (KZ-002) — demonstrated to redden when the class is removed.

**Deferred, named, not silent:** giving the consent policy the same `paragraphs`/`bullets` shape the three legal *pages* already have. It is the structurally correct fix and would yield real `<ul>` semantics — which matters for a screen-reader user, who currently hears a run of text where a sighted user sees twelve lines. It is a second contract change and therefore a scoping decision, not an improvisation. **Recorded as debt here rather than shipped unremarked, because it is invisible to every gate in this repo.**

#### Leader follow-ups (KZ-004 sweeps the Leader owed)

1. **A doc comment asserting the opposite of what shipped.** `CONSENT_ACCEPTANCE_STATEMENT`'s comment said the field was *deliberately NOT* in the response and that adding it *"would widen that endpoint's response shape, which FR-1 scenario 3 forbids"*. Every operative clause was false at HEAD — and worse than stale: it told a future author the shipped code violated a requirement. Rewritten to cite D-13; the *"not a policy section"* half, which is still true and is why two checkboxes would otherwise render, was kept. `CONSENT_POLICY_SECTIONS`' neighbouring T-1-era claims were scoped to T-1 in the same pass.
2. **`requirements.md` §4 still listed the change D-13 authorized as an explicit non-goal.** FR-1 scenario 3 and both `design.md` sites were updated when D-13 landed; the non-goal list was missed, leaving the document forbidding and authorizing the same change. Swept — struck through with its reason rather than deleted, because its first half is still the record of what T-1's refactor did not do. **Second sweep miss by the Leader this run** (the first was the banner label's focus-order reference). Recorded as a pattern, not as two incidents: the rule is easy to state and hard to execute.

**Verification (Leader-run, quiet tree):** backend 76 suites / 1106 tests, build and lint clean · frontend 114 suites / 1733 tests, `tsc --noEmit` clean, lint clean, static export clean.

---

## Post-validation entries (2026-09-15)

Three independent T3 validators, run in parallel and each told not to defer to the Leader's framing, returned **FAIL**. The product passed; the spec and this ledger did not. Full findings: `validation-report.md`. What follows is the work that closed them.

### T-10 (resumed) — ADR-013 amendment, and the baseline sweep that T-10 could not have done

**Why this entry exists.** T-10 was correctly recorded `[~]` with a named deferred half, and was then **incorrectly flipped to `[x]`** in the same command that closed T-8 and T-9, without re-reading this log. That flip is the root cause of the validation's largest finding: the ledger read closed over an open task, so nothing re-examined `docs/ux-ui/design.md`, which T-10 had swept **before** T-8/T-9 landed the approved texts.

Evidence-before-checkbox is not a formality. The inverted order did exactly what the root guide says it does — produced a completion that no reader could falsify.

**ADR-013 amendment (previously unrecorded).** Amended in `docs/trd/trd.md` during the T-8/T-9 commit (`9a27af1`), by the Leader, inline, with **no entry here and no Reviewer pass** — on a file class the blast-radius rule says always gets one. The text itself was verified correct by two validators reading it at HEAD: the consequence is amended, the Decision column untouched, the superseded claim retained as a marked quotation. What was missing was the trail, and that is the finding.

**The baseline sweep T-10 could not have done.** `docs/ux-ui/design.md` §2 and §4 asserted, at HEAD, that `/terms` and `/privacy` carried placeholder copy pending Legal, that `/privacy` covered contact-form data only, that it retained a limitation clause T-8 removed, and that it had no cookie content when it carries Legal's entire Cookies section. Four sites, all false, all in the document that trains every future agent. Rewritten to the shipped state, plus:

- the `/privacy` Screen Inventory row's count of **four** engineering-authored contact facts corrected to **three** (the fourth is discharged by Legal's own *Information We Collect*) — a count contradicting a sibling document's prose, KZ-005's exact shape;
- a standing note under §4 recording that both legal pages ship with Legal's unfilled fields and are **not yet publishable**.

**Still open on T-10, and the reason it stays `[~]`:** the NFR-5 human render check of the three pages at mobile and desktop. Partially discharged since — overflow was measured at 360/390/414px (zero on all three pages) and the consent disclosure's rendering defect was found by measuring rather than reasoning — but contrast was never evaluated, and the width/justification rework (below) has never been looked at rendered by a human.

### Budget — the breach, recorded (L-3)

| | Declared (`design.md` §11) | Actual |
|---|---|---|
| Net code LOC | ~700 | **3,567** |
| — of which Legal's prose and the type module | — | 1,705 |
| — remaining code and tests | — | ~1,862 |
| Review rounds | ~4 | **9** |

It was escalated to the user verbally when it happened and **never written here**, which is precisely the failure mode the tripwire exists to prevent: a breach that leaves no trace disarms the instrument retroactively.

**What the estimate got wrong, since that is the reusable part.** It assumed *"paste the approved text"* without opening the `.docx` files — they hold ~4,000 words. It did not anticipate that Legal's structure would not fit the content contract; the type extension alone is 209 lines. And it assumed every task would pass review first time. Three did not, and **all three failed on defects in the Leader-authored brief, not on weak implementation** — a falsifier that could not fire, two tautological gates, and a task text that contradicted the code it governed. The estimate was not optimistic about the work. It was optimistic about the Leader.

### Unlogged visual rework, now recorded (L-4)

`LegalDocumentView.tsx` had `max-w-prose` removed from all eight sites, its container widened to `max-w-4xl`, and `text-justify hyphens-auto` added — a product-owner request that appeared in **no task, requirement, or entry** until now.

Worth recording for the diagnosis, not just the change: the container was widened **twice with no visible effect** before anyone found that `max-w-prose` (65ch, measured at 574px) was the real cap. The product owner noticed the non-effect before the Leader did. Measured after: 832px, ~128 characters per line — a 45% increase, and past the 90-character point where typographic guidance says the eye starts losing the line return. Recorded as a deliberate product-owner choice with the number stated, not as a silent default.

It lands squarely in defect class 9, where no automated gate exists and the human check has not been performed.

### NFR-5 / defect class 9 — human render check · **PERFORMED** · T-10 closed

| Field | Value |
|---|---|
| Date | 2026-09-15 |
| Performed by | Daniela Gómez (product owner), against the locally-running stack |
| Scope | The three legal pages (`/cookies`, `/terms`, `/privacy`) and the consent disclosure on `/register`, rendered |
| Result | **Correct.** No defects reported. |

This is the check nothing automated could substitute for, and its absence is why T-10 was held at `[~]` through validation rather than closed on the strength of a green suite. jsdom applies no CSS; `axe`'s contrast rule returns `incomplete` under it and `toHaveNoViolations` does not fail on incomplete. The property was genuinely uncovered, and is now covered by the only instrument that could cover it.

**Basis: the product owner's direct observation**, recorded as such rather than as a measured artifact — the same discipline applied to D-8. What it establishes is that a person who knows what these pages are supposed to say looked at them rendered and found them right.

**What it composes with, since neither half is sufficient alone.** Measured separately during this spec: horizontal overflow zero at 360, 390 and 414px on all three pages (headless Chrome, iframe-forced viewports — an earlier screenshot that appeared to show clipping was an artifact of a 500px render cropped to 390, and was discarded rather than reported); and the consent disclosure's run-on rendering defect, found by measuring (280px/14 lines collapsed vs 440px/22 correct) after the Reviewer inferred it from CSS semantics. The line length after the width rework is ~128 characters, past the 90-character point typographic guidance flags, and the product owner has now seen it rendered and accepted it.

**The one property still not measured:** contrast ratios. A person can see that text is legible; the eye cannot reliably estimate a 4.5:1 threshold, and this repository has a recorded instance of exactly that failure — a scrim measured at 3.62:1 that looked fine. A real-browser `axe` run would close it and takes seconds; offered and not taken, so it is recorded here as a known, narrow residual rather than left implied.

**T-10's `Done when` is now satisfied in full.** Status `[~]` → `[x]`.

