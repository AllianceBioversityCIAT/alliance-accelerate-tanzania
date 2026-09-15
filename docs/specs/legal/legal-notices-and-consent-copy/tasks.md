# Tasks — Legal Notices & Approved Consent Copy

- Spec path: `docs/specs/legal/legal-notices-and-consent-copy/`
- Branch: `feat/legal-notices` (from `main`)
- Commits: `[SPEC:legal/legal-notices-and-consent-copy] <message>`
- Budget (design.md §11): 10 tasks · ~700 net LOC · ~4 review rounds

**Review depth is scaled to blast radius, not spread evenly.** T-1 and T-10 get a Reviewer; the rest are light-touch. Recorded per task under `Review:`.

---

## Phase A — Executable now (not blocked by Legal)

- [x] **T-1 Convert `consent-policy.ts` into an append-only registry of editions**  (deps: none)
      Scope: Add `ConsentPolicyEdition` and `CONSENT_POLICY_EDITIONS` (ordered, oldest first, seeded with the existing `v1.0-placeholder` content). Derive `CONSENT_POLICY_VERSION` and `KNOWN_CONSENT_POLICY_VERSIONS` from it. Add lookup-by-version. Keep `isVersionKnown`'s parameterized seam and its explanatory comment intact (design.md §4.2).
      Traces: FR-1 (all three scenarios), design.md §4.1, §4.2
      Files: `backend/src/registrations/consent-policy.ts`, `consent-policy.spec.ts`, `registrations.controller.spec.ts`
      Clause ownership: *derives both exports* → derivation test · *superseded prose retrievable without git* → lookup test · *contract does not move* → controller response test · *must NOT gain/lose/rename a field* → key-set assertion *(constrains T-1 only; T-9 widened the contract deliberately under D-13 and updated this assertion with its reason recorded beside it)*
      Verify: `cd backend && npm test -- consent-policy registrations.controller --silent`
      Falsifying inputs (run each, watch it redden, revert): (1) replace a derived export with a hand-written literal → derivation test reds; (2) drop the non-final edition from the registry → set-semantics test reds; (3) add a key to the controller's response → key-set assertion reds.
      Done when: all three mutations demonstrably redden a **named** test, the suite is green on the real code, and `npm run build` compiles.
      Review: **Reviewer, effort `max`.** `Registration.consentPolicyVersion` is legal evidence; a broken append-only invariant is a legal problem, not a bug.
      Skills: `nestjs-expert`, `tdd`

- [x] **T-2 Add the `LegalDocument` content contract and its renderer**  (deps: none)
      Scope: `frontend/lib/content/legal/types.ts` (`LegalDocument`, `LegalSection`) and `frontend/components/legal/LegalDocumentView.tsx` — title, version/effective-date stamp, `aria-labelledby` sections, optional bullet lists, optional post-section slot (design.md §5.3).
      Traces: FR-7, design.md §5.1, §5.3
      Files: `frontend/lib/content/legal/types.ts`, `frontend/components/legal/LegalDocumentView.tsx`, `LegalDocumentView.test.tsx`
      Clause ownership: *uniform version/date position* → renderer test · *no hardcoded colors/geometry* → grep the diff for hex literals · *no token opacity modifier* → grep the diff for `/[0-9]` suffixes on token utilities
      Verify: `cd frontend && npm test -- LegalDocumentView --silent`
      Falsifying input: render a document whose section omits its heading → the `aria-labelledby` assertion reds. **What this cannot prove:** that the rendered result is legible or correctly contrasted — jsdom evaluates neither. Routed to T-10's human check.
      Done when: the renderer handles a two-section document with and without a slot, and the two greps return clean.
      Review: light
      Skills: `tailwind-design-system`, `frontend-design`

- [x] **T-3 Author the Cookie Notice content module**  (deps: T-2)
      Scope: `frontend/lib/content/legal/cookies.ts` — the factual inventory from requirements.md NFR-4. Names Google Analytics and Google as recipient; the four GA4 signals with **city-level** granularity; no cookie before consent; the asymmetric withdrawal; that the site does not delete already-set cookies.
      Traces: FR-3 (all three scenarios), requirements.md NFR-4, design.md §5.1
      Files: `frontend/lib/content/legal/cookies.ts`
      Clause ownership: *names Google as recipient* · *four signals* · *city-level not understated* (ADR-011 records understating it as a real defect) · *must NOT claim auth/fraud/performance/troubleshooting cookie use* — each is a separate assertion in T-4, not one combined check.
      Verify: content assertions land in T-4 with the page.
      Done when: every clause above appears; the negative clause is verified by asserting the module does **not** contain the four false purposes.
      Review: light — **but the content itself is defect class 8**: its accuracy rests on NFR-4's audit, which was measured against the tree, not reasoned.
      Skills: `cognitive-doc-design`

- [x] **T-4 Create `/cookies` and move `ConsentChoiceControl` onto it**  (deps: T-2, T-3)
      Scope: `frontend/app/(public)/cookies/page.tsx` — static server component rendering the Cookie Notice with the island in its slot. New a11y + content test.
      Traces: FR-3, NFR-1, NFR-2, design.md §5.2, §5.3
      Files: `frontend/app/(public)/cookies/page.tsx`, `cookies-a11y.test.tsx`
      Clause ownership: all four FR-3 clauses from T-3, plus *changing a stored choice works* and *accepting is immediate / rejecting deferred is disclosed*.
      Verify: `cd frontend && npm test -- cookies --silent && npm run build`
      Falsifying inputs: (1) delete the "Google" mention → content assertion reds; (2) add `useSearchParams()` without a `Suspense` boundary to the page module → `npm run build` fails under `output: 'export'`. *(Corrected 2026-09-15: this originally named `'use client'` + `useState`, which was measured during T-4 and does **not** fail — such a page prerenders and hydrates fine.)*; (3) remove a section heading → `jest-axe` reds.
      Done when: tests green, `out/cookies/index.html` is emitted, the control changes a stored choice in the test.
      Review: light
      Skills: `ui-ux-pro-max`, `react-doctor`

- [x] **T-5 Scaffold `/terms` and re-point `/privacy` at the renderer**  (deps: T-2)
      Scope: `frontend/lib/content/legal/terms.ts` and `privacy.ts` with clearly-marked placeholder bodies; `/terms/page.tsx` new; `/privacy/page.tsx` rewritten to render the document. Cookie content and the island are removed from `/privacy` (they now live on `/cookies`).
      Traces: FR-4, FR-5 (structure only — the prose is T-8), design.md §4.3
      Files: `frontend/lib/content/legal/{terms,privacy}.ts`, `frontend/app/(public)/terms/page.tsx`, `frontend/app/(public)/privacy/page.tsx`, `terms-a11y.test.tsx`, `privacy-a11y.test.tsx`
      Clause ownership: *`/terms` presents no acceptance control* → assert no checkbox/agree affordance.
      **Explicitly NOT owned here:** `/privacy`'s self-limiting scope statement is **retained** at this task. It is removed only in T-8, with the approved policy that makes it false (design.md §4.3 reversion challenge — deleting it before the replacement exists over-promises to exactly the visitor it protects).
      Verify: `cd frontend && npm test -- terms privacy --silent && npm run build`
      Falsifying input: add an "I agree" checkbox to `/terms` → the negative assertion reds.
      Done when: both routes build and emit, the placeholder marker is present and visible on both, the scope statement still stands on `/privacy`.
      Review: light
      Skills: `ui-ux-pro-max`

- [x] **T-6 Re-route the consent banner and extend the footer**  (deps: T-4, T-5)
      Scope: `ConsentBanner`'s policy link → `/cookies`. `Footer` lists About · Contact · Cookie Notice · Privacy Policy · Terms of Use via the existing `FOOTER_LINK_CLASSES`. Update `ConsentBanner.test.tsx`'s target assertion; add footer assertions. `contact-a11y.test.tsx`'s `/privacy` assertion stays as-is.
      Traces: FR-6, requirements.md §5 re-routing table
      Files: `frontend/components/analytics/ConsentBanner.tsx` + test, `frontend/components/shell/Footer.tsx` + test
      Clause ownership: *must NOT introduce a second divergent link list* → the footer nav stays the single source for these links.
      Verify: `cd frontend && npm test -- ConsentBanner Footer contact-a11y --silent && npm run build`
      Falsifying inputs: (1) point the banner at `/cookie` → target assertion reds; (2) delete `app/(public)/cookies/page.tsx` → `npm run build` fails. **What the target assertion alone cannot prove:** that the destination exists — it asserts an `href` string. The build is the half that proves emission; neither half is sufficient alone.
      Done when: five footer destinations assert green, the banner targets `/cookies`, the contact form still targets `/privacy`.
      Review: light
      Skills: `react-doctor`

- [x] **T-7 Confirm the governance count and record D-8**  (deps: none)
      Scope: Confirm zero real acceptances under `v1.0-placeholder`; write D-8 into `execution.md` with the evidence that produced it.
      Traces: FR-9
      Files: `docs/specs/legal/legal-notices-and-consent-copy/execution.md`
      Verify: `SELECT consentPolicyVersion, status, COUNT(*) FROM Registration GROUP BY 1,2;` against any environment carrying real traffic — **or**, if no such environment exists because the feature never shipped, record that as the evidence and say so plainly.
      Disqualifier: development and staging fixture rows are **not** acceptances and must not be counted as either confirming or disconfirming.
      Falsifying input: **one `Registration` row with `consentPolicyVersion = 'v1.0-placeholder'` created by a real applicant.** One such row falsifies D-8, and the governance question re-opens as its own ticket rather than being resolved here.
      Done when: D-8 is recorded with its basis stated as *measured* or *stated-by-owner*, never ambiguously.
      Review: light
      Skills: —

## Phase B — Blocked on Legal's approved texts

- [x] **T-8 Place the approved Terms of Use and Privacy Policy**  (deps: T-5, T-6; **blocked: approved texts only — OQ-A resolved**)
      Scope: Replace both content modules with the approved prose. Legal's Cookies section is carried **verbatim and unamended** into `privacy.ts` (D-10) and closes with a link to `/cookies`. Add the short engineering-authored contact-channel section after Legal's block (D-9). Remove `/privacy`'s self-limiting scope statement — now, with the replacement in place.
      Traces: FR-4, FR-5 (both scenarios), D-9, D-10
      Files: `frontend/lib/content/legal/{terms,privacy}.ts`, `privacy-a11y.test.tsx`, `terms-a11y.test.tsx`
      Clause ownership: the four-part obligation is asserted as **four separate assertions**, not one — (1) what a submission collects (satisfied by Legal's *"Information We Collect"*), (2) who receives it, (3) relayed and not stored, (4) not consent to publish. Parts 2–4 come from the D-9 section. *Must NOT be discharged by the page merely existing, nor by the collection list alone* → each of the four has its own assertion, so losing any one reddens exactly one.
      Also owned: *`/privacy` must NOT name Google* (D-10) → assert the recipient disclosure is absent here and present on `/cookies`.
      Verify: `cd frontend && npm test -- privacy terms contact-a11y --silent && npm run build`
      Falsifying inputs: (1) delete the "not stored" sentence → assertion 3 reds and 1, 2, 4 stay green, proving the four are independent; (2) drop the D-9 section entirely → three assertions red at once.
      Done when: both documents carry approved prose, a visible version and effective date, no placeholder marker, and all four parts assert independently green.
      Review: light — content accuracy is defect class 8 and has no automated gate.
      Skills: `cognitive-doc-design`

- [x] **T-9 Land the approved consent copy as edition `v1.0` and invert the tripwire**  (deps: T-1; **blocked: approved consent text**)
      Scope: Append a `v1.0` edition to `CONSENT_POLICY_EDITIONS` with the approved headings and bodies. Invert `registrations.controller.spec.ts`'s placeholder assertion to assert the **current** edition carries no marker. Update the `v1.0-placeholder` literals in `ConsentPolicyDisclosure.test.tsx` and `lib/api/registrations.test.ts` to whatever those fixtures should now assert.
      Traces: FR-2 (both scenarios)
      Files: `backend/src/registrations/consent-policy.ts`, `registrations.controller.spec.ts`, `frontend/components/register/ConsentPolicyDisclosure.test.tsx`, `frontend/lib/api/registrations.test.ts`
      Clause ownership: *no marker in the current edition* → inverted tripwire · *must NOT be achieved by deleting the historical edition* → the retention assertion from T-1 must still pass · *in-flight submissions still accepted* → `v1.0-placeholder` acceptance test
      Verify: `cd backend && npm test -- registrations --silent && cd ../frontend && npm test -- ConsentPolicyDisclosure registrations --silent`
      Falsifying inputs: (1) leave one placeholder body in the current edition → inverted tripwire reds; (2) delete the historical edition to "clean up" → retention test reds; (3) remove `v1.0-placeholder` from the derived known set → acceptance test reds.
      Done when: all three mutations redden named tests, and no `PLACEHOLDER` string remains in the current edition.
      Review: **Reviewer.** The tripwire inversion is the one change where a deleted guard and a passing guard look identical in a green run.
      Skills: `nestjs-expert`

## Phase C — Baseline sync

- [~] **T-10 Sync the baseline documents to what shipped**  (deps: T-6; T-8/T-9 for the consent half)
      Scope: `docs/ux-ui/design.md` §2 IA — add `/cookies` and `/terms`, rewrite `/privacy`'s description, and **repair the pre-existing drift (D-11): `/about` and `/forgot-password` both ship and neither is listed** in §2 or §4. §4 Screen Inventory — add two rows, rewrite the Privacy row. `docs/trd/trd.md` — add **ADR-014** (D-1), amend **ADR-013**'s consequences (it asserts the text is still placeholder), and amend **ADR-011**'s consequences (it asserts city-level geography is something *"the `/privacy` notice must state"*, which this spec makes false).
      Traces: FR-8, design.md §4.3
      Files: `docs/ux-ui/design.md`, `docs/trd/trd.md`
      Clause ownership: D-11's two missing routes → each listed in §2 **and** given a §4 Screen Inventory row. *sweep the withdrawn premise, not the changed literal* (KZ-004) — ADR-011's site shares **no literal** with ADR-013's and was found by the reversion challenge, not by grep. *Must NOT rewrite an accepted ADR's decision text* — amend consequences or supersede.
      **ADR allocation:** ADR-014 verified free on `main` and all four unmerged branches on 2026-09-15. Per the root guide, allocate **at apply time on the default branch**; re-check immediately before writing (`git log --oneline --all -20 -- docs/trd/trd.md`).
      Verify: No automated gate — this is documentation. Reviewer reads the diff against both baselines. Additionally: grep both files for the withdrawn premise and show zero surviving present-tense assertions.
      **What the grep cannot prove:** that the *new* text is true. That is the Reviewer's read, and it is the reason this task gets one at all (blast-radius rule — these files train every future agent).
      Done when: both baselines describe the shipped state, ADR-014 exists, ADR-011 and ADR-013 consequences are amended, and the human check of the three rendered pages (defect class 9 — mobile and desktop) is recorded.
      Review: **Reviewer.** Constitutional baseline.
      Skills: `software-architect`, `cognitive-doc-design`

---

## Dependency Graph

```
T-1 ──────────────► T-9 ──┐
                          ├─► T-10
T-2 ─┬─► T-3 ─► T-4 ─┐    │
     └─► T-5 ────────┴─► T-6 ─► T-8 ─┘
T-7 (independent)
```

**All tasks are `[x]` except T-10, which is `[~]`** pending the NFR-5 human render check. *(This line read "Eligible now: T-1, T-2, T-7" until validation caught it — written at decomposition and never updated.)* T-10's consent half waits on T-9; its IA half is ready once T-6 lands.

## Coverage closure (KZ-001)

~~Every scenario and every `BUT`/`AND IT MUST` clause is owned by exactly one task above.~~ **That claim was false when written, and validation proved it (2026-09-15).** Two clauses were owned by no task and guarded by no test:

- **FR-3 scenario 3** — *"THEN it names the GA4 cookies as the only cookies this site sets"*. The sentence shipped; deleting the whole section that carried it reddened nothing, because the neighbouring tests are keyword **absence** checks that a deletion satisfies more thoroughly. Now owned by T-4 with a falsifiable assertion.
- **FR-6** — *"AND IT MUST reuse the existing `FOOTER_LINK_CLASSES` treatment"*. `Footer.test.tsx` asserted five `href`s and zero classNames. Now owned by T-6.

**The lesson is about the claim, not the gap.** This section asserted closure in the same document that failed to close it — an unfalsifiable statement of completeness, which is the shape KZ-001 exists to catch and which an author checking their own work cannot see. Closure was only established by an independent enumeration that assumed nothing. Two clauses are deliberately **deferred across tasks rather than split**: `/privacy`'s scope statement (retained in T-5, removed in T-8) and the contact-form disclosure (asserted in T-8, gated by OQ-A). Neither is discharged by citing a different requirement.

## Open items carried into execution

| ID | Status | Outcome |
|---|---|---|
| OQ-A | **resolved 2026-09-15** | → D-9. Legal's text covers the collection half; parts 2–4 become a short engineering-authored section in T-8. |
| OQ-B | **resolved 2026-09-15** | → D-10. Legal is not asked to amend. `/privacy` verbatim, recipient disclosure on `/cookies` only. |
| OQ-C | **resolved 2026-09-15** | → D-11. T-10 repairs the drift in passing. |

**Legal's three texts were delivered and landed.** What remains blocked is publication, not implementation: the unfilled fields inside those texts.
