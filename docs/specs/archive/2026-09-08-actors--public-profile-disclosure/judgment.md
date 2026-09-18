# Judgment Day — Public Profile Disclosure

- Target: `design.md` (primary) + `requirements.md` (binding context), frozen 2026-09-04
- Mode: `judgment_day` — blind dual review, round 1
- Judges: **A** (Opus) · **B** (Sonnet), launched in parallel, blind to each other, read-only
- Verdicts: **A = UNSOUND** · **B = SOUND WITH ISSUES**

> **Author ≠ auditor, partially broken and compensated.** Judge A shares the design author's model. Per the contract, a finding raised by A alone is recorded **suspect**, never auto-fixed. Three suspect findings were promoted only after the orchestrator verified them independently against source — marked **[orchestrator-verified]** below.

## Confirmed — both judges

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| **J-1** | **SEVERE** | **DD-1 cites a totality assertion that does not exist.** The design claims the suite already catches a schema field belonging to neither constant. | The only thing so named is `describe('every registered public route has a fixture (RA7 — the totality assertion)')` in the **registrations** block — a *route* totality over `RegistrationsModule`, comparing `Object.keys(FIXTURE_MAP)` to discovered routes. Nothing enumerates `Actor` columns. Both judges grepped for `dmmf`, `schema.prisma`, `ALL_FIELDS`, `exhaustive` — no such mechanism exists. |
| **J-2** | **SEVERE** | **The vacuity bug is systemic, not one file.** Six further suites spread or loop over `PII_ALLOWLIST` and go silently vacuous when it empties. None appears in design §4, §11, §15 or §16. | `role-aware.serializer.spec.ts` (two `for (const piiField of PII_ALLOWLIST)` loops) · `actors.service.spec.ts` · `actors-admin.service.spec.ts` · `admin-actors.e2e.spec.ts` · `admin-actors-crud.e2e.spec.ts` · `admin-actor-import.e2e.spec.ts` (all build `FORBIDDEN_KEYS = [...PII_ALLOWLIST, …]`). **Inverse case:** `actors-admin.service.spec.ts`'s `for (const key of PII_ALLOWLIST) expect(item).toHaveProperty(key)` is the *only* proof the Admin projection still returns PII — it deletes itself, and FR-3's "BUT it must NOT be absent from the Admin projection" points straight at it. Five of the six never import `NEVER_PUBLIC_FIELDS`, so relocating `technicalSupport` **deletes** its coverage rather than moving it. |
| **J-3** | WARNING | **The `test:e2e` claim is false in both halves.** | `backend/package.json` `scripts` has no `test:e2e` entry at all. Root `CLAUDE.md` records it was "Removed, script and row together." The requirement's `[verified 2026-09-03]` stamp is on a claim that does not survive a thirty-second check — in a document whose §2 asserts every codebase claim cites verification. Practical conclusion (don't use it) survives; the stated mechanism does not. |
| **J-4** | WARNING | **RV-3's single test does not substitute for the compile barrier.** | The type error blocked `payload.contactPerson` in **every** slot of the literal pick; one assertion covers one slot under one input shape. Uncovered variants named: `traderName ?? contactPerson`, `marketLocation ?? contactPerson`, the reverse adjacency `contactPerson ?? position`, and (B) the both-populated clobber `position: payload.contactPerson` unconditionally. |
| **J-5** | **SEVERE** *(A)* / WARNING *(B)* | **NFR-6 materially understates the exposure.** Severity disputed; substance agreed by both. | See J-13 — orchestrator verification resolves this to SEVERE. |
| **J-6** | WARNING | **Coverage orphans.** Both judges independently found the same core set. | NFR-6 has **no row at all** in design §10 — the one clause that says "do not mistake the FR-7 test for coverage of me" is the clause the test plan omits. Plus FR-5's *"Instructions sheet's allowed-value lists … agree"* and *"BUT it must NOT change the required/optional status of any existing column"* (§7.4 guarantees column *position*, a different property), and FR-4's *"recording who decided to publish `contactPerson` and when"* (design says only "rationale rewritten"). |

## Suspect — single judge, orchestrator-verified

| ID | Sev | Finding | Verification |
|---|---|---|---|
| **J-13** | **SEVERE** | **FR-7's CSV narrowing is inert as a bulk-exposure control.** The app already ships the whole dataset to the browser. | **[orchestrator-verified]** `useDashboardActors` declares `DASH_PAGE_SIZE = 100`, `DASH_MAX_PAGES = 10` and accumulates every matching actor into an in-memory `PublicActor[]`. `app/(public)/map/page.tsx` consumes it with the comment *"accumulates ALL matching actors across pages (pageSize=100, up to 10 pages = 1 000 actors)"*. After FR-1 widens `PublicActor`, any anonymous visitor opening `/dashboard` or `/map` holds the complete contact dataset — visible in the Network panel, no script, no auth. **FR-7 removes the button, not the data.** This promotes J-5 to SEVERE and invalidates the premise on which OQ-5 option (b) was chosen. |
| **J-8** | **SEVERE** | **`LEAKABLE_PII_VALUES` must be split, not edited — and the design never mentions it.** | **[orchestrator-verified]** It is a hardcoded array holding `'+255700000000'`, `'director@example.com'`, `'Director'`, `'Arusha Central Market'` **alongside** never-public values, swept by `JSON.stringify(wire)).not.toContain(...)` across `/actors`, `/actors/:id` **and `/metrics`**. After FR-1 four of those values must appear in the actors responses while remaining absent from `/metrics`, so the constant must be split and every call site re-pointed. |

## Suspect — single judge, not independently verified

| ID | Sev | Finding | Status |
|---|---|---|---|
| **J-7** | SEVERE *(A)* | The absence direction of DD-1 is unimplementable against current fixtures: `fixtureActor()` gives granted and non-granted actors **byte-identical** PII values, so a value sweep for the non-granted actors passes vacuously. | **Not verified by the orchestrator.** Plausible and consistent with J-8's reading of the same file. Treat as design input, not as fact. |
| **J-9** | WARNING *(A)* | ~a dozen files missing from §4: `ProfileView.test.tsx` and `profile-a11y.test.tsx` (which currently assert the *opposite* of FR-6), `lib/contrast.test.ts` (cites the deleted component as its WCAG subject), `lib/api/actors-admin.ts`, `registration-create.dto.ts`'s now-false `/** never published */` comment, the generator + committed workbook + `generate-template.spec.ts`. | Not verified. Highly plausible. |
| **J-10** | WARNING *(A)* | Budget optimistic by 40–100%; realistic band **1,400–2,000 LOC**, and 13 tasks cannot absorb J-2 + J-9. | Not verified. |
| **J-11** | WARNING *(A)* | `Actor.email` for self-registered actors is `Registration.submitterEmail` — the **OTP-verified identity address**, not a payload field (`RegistrationPayloadDto` has no `email`). FR-1's framing "everything the actor supplied" does not cover the most sensitive published field, which was collected for verification and receipts. | Not verified. **Governance-relevant** — whoever owns NFR-7 would review consent wording without being told this. |
| **J-12** | SUGGESTION *(A)* | No by-value guard is proposed for `PUBLICLY_DISCLOSED_FIELDS`, though `PII_ALLOWLIST` has one today. The constant DD-1 makes load-bearing is the one without a pin. | Not verified. |

## Fact-check

All eight claims re-checked by both judges independently. **Seven CONFIRMED** (`include` not `select`; the spread union; `--color-restricted-bg` used by `Button` + `Hero`; 45 `PublicActor` consumers; ADR-012 highest; `contactPerson` required and discarded; `TEMPLATE_VERSION = 'v2'` with neither new column). **One REFUTED** — `test:e2e` (J-3). Judge A adds a fourth `--color-restricted-bg` consumer the spec missed: `lib/contrast.test.ts`.

## Round-1 status

Severe confirmed findings exist. Per the contract, correction is **paused for explicit user decision** before any fix round. Rounds used: 1 of 2.

---

## Round-1 correction (applied 2026-09-04)

Authorised by Daniela Gómez: fix all confirmed + orchestrator-verified + cheap plausible suspects. **OQ-5 re-decided** — contact block moves off the list endpoint entirely (option A), superseding the CSV-only mitigation.

| ID | Disposition | What changed |
|---|---|---|
| J-1 | **fixed** | DD-1's invented totality citation removed. Replaced with the truth — the serializer's explicit-pick construction is a *design property, not a test* — plus the by-value constant pins that were the missing test. |
| J-2 | **fixed** | RV-2 and DD-1 restated as a **seven-file** systemic defect. All six additional sites listed in §4. New defect class **D-1c** with an exhaustive-sweep gate. §13 flags `actors-admin.service.spec.ts` as the only Admin-PII proof. |
| J-3 | **fixed** | `test:e2e` claim corrected in `requirements.md` §11, with the false `[verified 2026-09-03]` stamp recorded rather than quietly deleted. |
| J-4 | **fixed** | RV-3 upgraded to per-slot assertions across the whole projection plus a *standing* mutation test; the residual weakness vs. a compile error is stated, not smoothed over. |
| J-5 / J-13 | **fixed — design changed** | **DD-3:** the bulk boundary moves from the CSV allowlist into the **list projection**. New **FR-9**; FR-1's "list and detail must not drift" clause reversed; NFR-6 rewritten and quantified (~10 requests → one-per-actor). **DD-6:** the frontend type splits so bulk views cannot name a contact field. |
| J-6 | **fixed** | Orphans given owners: new defect classes **D-11** (404 indistinguishability), **D-12** (no-derive on all three write paths), **D-13** (required/optional + allowed-value lists), **D-14** (page-level absence), **D-15** (filtered-set fidelity). §10 gains an **NFR-6 row** with its disqualifier honoured. DD-5 carries FR-4's who/when. |
| J-8 | **fixed** | **DD-4:** `LEAKABLE_PII_VALUES` split per direction, not edited; `/metrics` expectation preserved. |
| J-9 | **fixed** | §4 rewritten with the full ~24-file surface, and made a closed set — a file outside it is a tripwire event. |
| J-10 | **fixed** | §16 rebased to 17 tasks / ~1,600 LOC / ~24 rounds, and the tripwire reworded so a scoping miss is not misread as an implementation deviation. |
| J-11 | **fixed** | NFR-7 now states that `Actor.email` for self-registered actors is `submitterEmail` — collected for identity verification and receipts, not as a public contact — so legal is told before drafting wording. |
| J-12 | **fixed** | DD-1/DD-2: every policy constant pinned by value, including the empty one. |
| J-7 | **carried to round 2** | Fixture PII values may be byte-identical across granted/non-granted actors, making a value sweep vacuous. Not independently verified; DD-4's split makes it more tractable but does not settle it. **Explicitly handed to the round-2 judges.** |

Rounds used: 1 of 2. Scoped re-judgment: **pending**.

---

## Round 2 — scoped re-judgment (2026-09-04)

Verdicts: **A = ISSUES REMAIN** · **B = ISSUES REMAIN**. Rounds used: **2 of 2 — lineage exhausted.**

### Fix verification

All 11 corrections **landed as text**; both judges verified them against source, not only against the documents. Judge A additionally marks three **LANDED-BUT-DEFECTIVE** (J-8, J-9, J-10) — the correction arrived but is wrong in a way that would mis-direct implementation.

### Clean — verified, do not re-open

DD-3 genuinely closes the API bulk path. Both judges independently confirmed: the only public routes returning actor data are `GET /actors`, `GET /actors/:id`, `GET /metrics`; `admin/*` is guarded; there is **no** server-side export endpoint; no Next.js dynamic route or `generateStaticParams` (the profile is `/profile?id=`); no prebuilt actor data under `frontend/public/`. `ListQueryDto` exposes only `crop`/`search`/`role`/`region`/`page`/`pageSize` (`@Max(100)`) and `createValidationPipe()` runs `whitelist: true` — **no request shape can widen the list projection**. DD-6 holds: aliasing `PublicActor` to the list item makes `actor.phone` a compile error in all 45 consumers.

### J-7 — ADJUDICATED **TRUE** by both judges

`fixtureActor()`'s defaults are inherited verbatim: `actor-unknown-1` and `actor-denied-1` each override exactly seven keys (`id`, `traderId`, `traderName`, `region`, `traderType`, `consentStatus`, `crops`). All five fixtures therefore carry **byte-identical** `phone`, `email`, `position`, `marketLocation`, `sex`, `technicalSupport`, `district`, `capacityTons`, `gpsAltitude`, `gpsAccuracy`, and all four provenance values. Only `id`/`traderId`/`traderName` are per-row unique — the three the existing assertions happen to use.

**Revision 2 does not close it.** FR-9's by-value clause is sound *by luck* — after DD-3 no row emits the contact block on the list path at all. But FR-2's *"no field of either actor appears in any public response body"* and §10's FR-2 row **cannot be honoured by value** for any shared field: on detail, the granted actor legitimately supplies the same strings. Judge A adds that **DD-4 widens the blind spot**, by moving four of those strings out of the never-appear array. Neither document mentions fixture value distinctness anywhere. The fix is cheap and the file already has the pattern (the provenance values are deliberately non-default) — but **no task owns it**.

### Round-2 findings — open at escalation

| ID | Sev | Judges | Finding |
|---|---|---|---|
| **R2-1** | **SEVERE** | A | **DD-4 assigns `marketLocation` the wrong direction.** It lists `'Arusha Central Market'` among values that "must appear on detail, **be absent from list**". But FR-1, FR-7's table and the glossary all put `marketLocation` in the **list set**. DD-4 is the whole fix for J-8 and defines the constants every by-value gate re-points at; followed literally it produces either a failing assertion against a correct projection, or a "fix" that drops `marketLocation` from `toPublicListItem` — contradicting three requirements. Same layer-confusion class as J-13. |
| **R2-2** | WARNING | A | **DD-4 enumerates 9 of the array's 11 members.** `'Needs cold storage'` (`technicalSupport`) and `'1400'` (`gpsAltitude`) are assigned to neither group — and `technicalSupport` is the one field FR-3 *relocates*, so it is the member most likely to be dropped rather than moved. RV-2's failure mode, one layer down. |
| **R2-3** | WARNING | A | **§4's closed set is missing four files the split forces:** `actors.controller.ts` (its `findOnePublic(): Promise<PublicActor>` would name the *list* shape on the *detail* route), `actors.controller.spec.ts`, `frontend/lib/api/actors.test.ts`, `frontend/lib/api/useActor.test.ts`. The last types its mock as bare `jest.Mock`, so the compiler will **not** catch the drift — those suites go quietly stale rather than red. The first implementation task would trip §4's own tripwire. |
| **R2-4** | WARNING | A | **Defect class D-4 was left behind by its own requirement.** It still cites "FR-1's cross-path assertion" as its gate, but this revision *reversed* that clause — list and detail now deliberately differ. D-4 marks a non-existent gate "✅ automated" and licenses an auditor to file the intended asymmetry as drift. The live class is *convergence* (D-1b). |
| **R2-5** | WARNING | A (+ B's N-1, same area) | **A-1's justification rests on a false premise, and the CSV widens.** `PUBLIC_COLUMNS` today is `traderName, region, district, traderType, capacityTons, crops` — `sex` is **added**, not "kept" as A-1 says. And A-1's reasoning ("not contactable once the person's name is withheld") is wrong: `traderName` is the first CSV column and `informal_trader` is a live trader type, so for those rows the name *is* a natural person. The bulk surface J-13 was raised about gains `sex` **and `marketLocation` — a physical find-them-here location keyed to a name**. NFR-6's "contact data MUST NOT be obtainable in bulk" holds only by defining `marketLocation` out of "contact data". |
| **R2-6** | SUGGESTION | A | §4's preamble says "ten files + roughly a dozen more" (~22) and the correction table says ~24, but the tree carries **~38 line-items** plus seven documents. The ~1,600 LOC band and the ~450-LOC tripwire were computed against roughly half the tree they accompany. |
| **R2-7** | SUGGESTION | A | Two factual slips: RV-2 says "Five never import `NEVER_PUBLIC_FIELDS`" — it is **six**. NFR-7 says `Actor.email` is "not a form field", but `RegistrationCreateDto.email` **is** applicant-typed at the top level; only `RegistrationPayloadDto` lacks it. Legal must be told "collected under a narrower purpose", not "never supplied by the actor". |

### Terminal state

**JUDGMENT: ESCALATED ⚠️** — round lineage exhausted with open findings. The architecture (DD-3/DD-6 projection split) is verified sound by both judges; what remains is one SEVERE bookkeeping defect in DD-4, an unassigned J-7 fixture fix, a false premise under A-1, and four smaller corrections. None requires re-deciding the approach; all require a human call on scope before `tasks.md`.

---

## Round-2 correction (applied 2026-09-04, post-escalation)

Applied by user decision after escalation. The transaction stays **ESCALATED** — the lineage is not reopened or extended; these are corrections made with the ledger closed.

| ID | Disposition | What changed |
|---|---|---|
| **R2-1** | **fixed — decision changed** | `marketLocation` **joins the contact block** (detail-only). DD-4's table now agrees with FR-1/FR-7/FR-9 instead of contradicting them. Decided by Daniela Gómez, 2026-09-04. |
| **R2-2** | fixed | DD-4 now assigns **all eleven** array members across three groups in an explicit table. `technicalSupport` and `gpsAltitude` are named. |
| **R2-3** | fixed | `actors.controller.ts`, `actors.controller.spec.ts`, `lib/api/actors.test.ts`, `lib/api/useActor.test.ts` added to §4, each with the reason. `useActor.test.ts` flagged as going **stale rather than red** (bare `jest.Mock`). |
| **R2-4** | fixed | Defect class **D-4 rewritten**: the live risk after FR-9 is *convergence*, not drift. The old wording cited a gate this revision deliberately removed. |
| **R2-5** | **fixed — decision changed** | A-1 rewritten. The false premise ("not contactable once the name is withheld") is recorded and refuted in place. `sex` stays in the export; `marketLocation` leaves it. DD-3's "the CSV is unaffected" corrected — it gains `sex` and `otherCrops`. |
| **R2-6** | fixed | §4 preamble now states the **measured** 40 line-items + 7 documents. §16 rebased a second time: **19 tasks / ~2,000 LOC / ~28 rounds**. |
| **R2-7** | fixed | RV-2's "five" → **six**. NFR-7 reworded: the applicant *does* type the address, as top-level `RegistrationCreateDto.email` for OTP verification — the issue is the **narrower purpose**, not absence of supply. |
| **J-7** | **fixed — now owned** | New **DD-10**: the non-granted fixtures get distinct PII values, sequenced **before** the gate inversion as a prerequisite, owning defect class D-2. Previously unassigned to any task. |

**Net effect of two judgment rounds:** one requirement reversed (FR-1's cross-path clause), one requirement added (FR-9), two decisions changed by the user (`marketLocation`, and the CSV mitigation approach), three new design decisions (DD-3, DD-6, DD-10), seven defect classes added (D-1b, D-1c, D-11…D-15), the file surface corrected from 10 to 40, and the budget from ~950 to ~2,000 LOC.
