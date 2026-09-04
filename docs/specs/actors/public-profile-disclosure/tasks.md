# Tasks — Public Profile Disclosure

- Spec path: `docs/specs/actors/public-profile-disclosure/`
- Traces: `requirements.md` FR-1…FR-9 / NFR-1…NFR-7 · `design.md` §1–§16 · `judgment.md` (terminal: ESCALATED, corrections applied)
- Budget (design §16): **19 tasks · ~2,000 net LOC (band 1,700–2,400) · ~28 review rounds**
- Commits: `[SPEC:actors/public-profile-disclosure] <message>`

> **Sequencing rule that is not negotiable.** T-5 (fixture distinctness, DD-10) runs **before** T-11 (gate inversion). The inverted gate's non-granted assertions are unfalsifiable until the fixtures differ — inverting first produces a green suite that proves nothing, which is the exact defect this spec exists to avoid.

## Phase A — Data and write paths (irreversible first, alone)

- [x] **T-1** Add `contactPerson` and `otherCrops` columns to `Actor`  (deps: none)
      Scope: Prisma model + one additive migration. No serializer, API, or UI change.
      Traces: FR-4, NFR-5 · design.md §5
      Files: `backend/prisma/schema.prisma`, `backend/prisma/migrations/<ts>_add_contact_person_other_crops/`
      Verify: `cd backend && npx prisma migrate dev --name add_contact_person_other_crops && npm run build`
      Done when: both columns exist as `String?`; the emitted SQL is `ADD COLUMN` only — **inspect it before it lands**; `prisma generate` types compile.
      Disqualifier: any emitted `DROP`, `MODIFY`, or `ALTER … NOT NULL` means abort and report, per `backend/CLAUDE.md`. A drift or reset prompt is **abort-and-report — never answer it**; the target is shared dev RDS.
      Falsifying input: a migration that alters an existing column fails the SQL inspection.
      Skills: —

- [ ] **T-2** Surface both columns to the Admin projection and form  (deps: T-1)
      Scope: `AdminActor` + `toAdminActor`, the admin create/update DTOs, and `ActorForm`'s two new optional inputs.
      Traces: FR-4 · design.md §7.3, §4
      Files: `backend/src/actors/admin-actor.serializer.ts`, `backend/src/actors/dto/{actor-create,admin-actor-create,admin-actor-update}.dto.ts`, `frontend/components/admin/ActorForm.tsx`, `frontend/lib/api/actors-admin.ts`
      Verify: `cd backend && npm test -- --silent admin-actor && cd ../frontend && npm test -- --silent ActorForm`
      Done when: an admin can set and read both fields end to end; `AdminActor` carries them.
      Disqualifier: a passing suite that never sets either field to a non-empty value has tested nothing — each new field needs a populated round-trip, not a `null` default.
      Falsifying input: submitting a `contactPerson` and reading back `null`.
      Skills: `nestjs-expert`, `shadcn-ui`

- [ ] **T-3** Publish `contactPerson`/`otherCrops` on approval, with the DD-18 reversal recorded  (deps: T-1)
      Scope: extend `RegistrationApprovalPayload` and the `approve()` literal pick; **rewrite** the DD-18 rationale to record who authorised publishing `contactPerson`, when, and under which spec; add per-slot assertions and a standing mutation test.
      Traces: FR-4 (both scenarios, incl. the `position` and no-derive clauses) · design.md §7.3, DD-5, RV-3 · D-10, D-12
      Files: `backend/src/registrations/admin-registrations.service.ts`, `…service.spec.ts`, `backend/src/registrations/dto/registration-create.dto.ts`
      Verify: `cd backend && npm test -- --silent admin-registrations`
      Done when: approval writes both columns; assertions cover **every slot** of the projection, not only `position`; the four escaping variants in RV-3 each have a named test; `registration-create.dto.ts`'s now-false `/** Review context only — never published */` comment is corrected.
      Disqualifier: a single `position`-only assertion does **not** discharge this task. If a mutation cannot be expressed as a standing test, say so — do not count a hand-run, reverted experiment as coverage.
      Falsifying input: `position: payload.position ?? payload.contactPerson` must redden a named test; so must the unconditional `position: payload.contactPerson`.
      Skills: `nestjs-expert`, `tdd`

- [ ] **T-4** Import template v3 — two columns, version bump, regenerated workbook  (deps: T-1)
      Scope: append both columns to `TEMPLATE_COLUMNS`; `TEMPLATE_VERSION` `v2` → `v3`; regenerate the committed workbook byte-stably; map both cells in the parser; pin the required-flag map by value.
      Traces: FR-5 (both scenarios, incl. the allowed-value-list and required/optional clauses) · design.md §7.4 · D-5, D-13
      Files: `backend/src/common/template-columns.ts`, `…template-columns.spec.ts`, `backend/src/actors/actor-import.service.ts`, `…actor-import.service.spec.ts`, `backend/scripts/generate-import-template.ts`, `backend/src/common/generate-template.spec.ts`, `frontend/public/templates/actor-import-template.xlsx`
      Verify: `cd backend && npm run generate:template && npm test -- --silent "template|import"`
      Done when: a v3 row round-trips both fields; **no existing column's `required` flag changes** (pinned by value); the two new columns carry no allowed-value list and the Instructions sheet reflects that; the committed asset matches the generator.
      Disqualifier: asserting the two headers exist proves presence, not agreement. The gate is the required-flag value pin plus a real round-trip — a header-existence check alone leaves D-13 uncovered.
      Falsifying input: flipping any existing column's `required` flag must redden the pin.
      Skills: `nestjs-expert`

## Phase B — Gate prerequisite

- [x] **T-5** Give the non-granted gate fixtures distinct PII values  (deps: none — **must precede T-11**)
      Scope: `actor-unknown-1` and `actor-denied-1` receive their own `phone`, `email`, `position`, `marketLocation`, `sex`, `technicalSupport`, distinct from every granted fixture. No assertion changes in this task.
      Traces: FR-2 (both scenarios) · design.md DD-10 · D-2 · judgment.md J-7
      Files: `backend/src/test/pii-boundary.spec.ts`
      Verify: `cd backend && npm test -- --silent pii-boundary`
      Done when: no PII value is shared between a granted and a non-granted fixture; the suite is still green (this task changes inputs, not expectations).
      Disqualifier: **green here proves nothing on its own** — it only means nothing broke. This task's value is realised in T-11 and T-12; record it as a prerequisite, never as evidence of consent enforcement.
      Falsifying input: none by design. If any assertion reddens, an existing test was silently depending on the shared values — investigate before proceeding.
      Skills: `tdd`

## Phase C — Policy and projections

- [ ] **T-6** Restructure the policy constants and pin every one by value  (deps: none)
      Scope: `PII_ALLOWLIST` → empty (retained, documented); add `PUBLICLY_DISCLOSED_FIELDS` and `CONTACT_BLOCK_FIELDS`; relocate `technicalSupport` into `NEVER_PUBLIC_FIELDS` with its reason; by-value pin on **all four** constants including the empty one.
      Traces: FR-1, FR-3, FR-9 · design.md §7.1, DD-1, DD-2 · D-1c
      Files: `backend/src/common/pii-consent.policy.ts`, `…pii-consent.policy.spec.ts`
      Verify: `cd backend && npm test -- --silent pii-consent`
      Done when: each constant has a by-value assertion; the now-vacuous disjointness and empty-allowlist tests are **annotated as vacuous in the suite**, not silently left looking meaningful.
      Disqualifier: a suite that would still pass if a constant silently lost a member has not discharged this task.
      Falsifying input: removing `phone` from `PUBLICLY_DISCLOSED_FIELDS` must redden a named test.
      Skills: `tdd`, `nestjs-expert`

- [ ] **T-7** Split the serializer into list and detail projections  (deps: T-1, T-6)
      Scope: `toPublicListItem` and `toPublicDetail`, both explicit literal picks; `PublicActorListItem` / `PublicActorDetail`; correct the controller's return-type annotations.
      Traces: FR-1, FR-9 · design.md §7.2, §6, DD-3 · D-1b
      Files: `backend/src/common/role-aware.serializer.ts`, `backend/src/actors/actors.controller.ts`, `…actors.controller.spec.ts`
      Verify: `cd backend && npm test -- --silent "role-aware|actors.controller" && npm run build`
      Done when: detail carries the contact block, list does not; neither is built by spread; `findOnePublic` is annotated with the **detail** type.
      Disqualifier: implementing detail as `{...listItem, ...contact}` defeats the explicit-pick property (DD-9). Two picks, not a pick plus a spread.
      Falsifying input: adding a field to the entity and to neither projection must leave it absent from both outputs.
      Skills: `tdd`, `nestjs-expert`

- [ ] **T-8** Wire `ActorsService.findPublic` to the list projection  (deps: T-7)
      Scope: `findPublic` maps through `toPublicListItem`; `findOnePublic` through `toPublicDetail`. The consent pin and `include` stay untouched.
      Traces: FR-1, FR-2, FR-9, NFR-1 · design.md §2, DD-9
      Files: `backend/src/actors/actors.service.ts`, `…actors.service.spec.ts`
      Verify: `cd backend && npm test -- --silent actors.service`
      Done when: list and detail return their respective shapes; **no `select` is introduced**; the `consentStatus: GRANTED` `WHERE` clause is byte-identical to before.
      Disqualifier: any diff touching the `where` object in this task is out of scope and must be reported, not absorbed.
      Falsifying input: removing the consent pin must redden `actors.service.spec.ts` (and, after T-11, the gate).
      Skills: `nestjs-expert`

## Phase D — The sweep and the gate

- [ ] **T-9** Re-point all seven `PII_ALLOWLIST` iteration sites  (deps: T-6)
      Scope: every site that spreads or loops over `PII_ALLOWLIST` moves to a non-empty constant. Six of the seven do not import `NEVER_PUBLIC_FIELDS` — relocating `technicalSupport` must **move** their coverage, not delete it.
      Traces: NFR-2 · design.md RV-2, DD-1 · **D-1c**
      Files: `backend/src/common/role-aware.serializer.spec.ts`, `backend/src/actors/actors.service.spec.ts`, `backend/src/actors/actors-admin.service.spec.ts`, `backend/src/test/{admin-actors,admin-actors-crud,admin-actor-import}.e2e.spec.ts`, `backend/src/test/pii-boundary.spec.ts`
      Verify: `cd backend && grep -rn "PII_ALLOWLIST" src && npm test -- --silent`
      Done when: the grep shows **no surviving iteration site** — only the policy module and its by-value pin reference the empty constant. `actors-admin.service.spec.ts`'s Admin-PII loop, the only proof the Admin projection still returns PII, iterates a non-empty constant.
      Disqualifier: a green full suite is **not** evidence here — these suites go green precisely by asserting nothing. The evidence is the grep output plus, for each re-pointed loop, a named mutation that reddens it.
      Falsifying input: emptying the replacement constant must redden each of the seven sites.
      Skills: `tdd`

- [ ] **T-10** Split `LEAKABLE_PII_VALUES` into its three directions  (deps: T-5, T-6)
      Scope: replace the single mixed array with detail-only / never-public groups per DD-4's table. **All eleven members must be assigned.**
      Traces: FR-1, FR-2, FR-3, FR-9 · design.md DD-4
      Files: `backend/src/test/pii-boundary.spec.ts`
      Verify: `cd backend && npm test -- --silent pii-boundary`
      Done when: every one of the eleven values belongs to exactly one group; `/metrics` keeps sweeping the full set; `technicalSupport`'s value moved rather than vanished.
      Disqualifier: an unassigned member is the RV-2 failure one layer down — enumerate all eleven explicitly in the diff, do not rely on "the rest".
      Falsifying input: leaking `'Needs cold storage'` on any public path must redden.
      Skills: `tdd`

- [ ] **T-11** Invert the release gate  (deps: T-5, T-8, T-9, T-10)
      Scope: presence of the disclosed set on **detail**; absence of the contact block from **list** by key *and* value; absence of everything for non-granted actors; never-public absence unchanged; the two `404` bodies compared byte-for-byte.
      Traces: FR-1, FR-2, FR-3, FR-9, NFR-1 · design.md §10 · D-1, D-1b, D-2, D-4, D-11
      Files: `backend/src/test/pii-boundary.spec.ts`
      Verify: `cd backend && npm test -- --silent pii-boundary`
      Done when: each of the five directions has named assertions; the non-granted absence checks are falsifiable **because T-5 made the values distinct**.
      Disqualifier: if T-5 was skipped or partially applied, the non-granted assertions cannot fail and this task is **not** complete regardless of suite colour. Check the fixtures before claiming this task.
      Falsifying input: see T-12 — this task is not verified until T-12 runs.
      Skills: `tdd`

- [ ] **T-12** Demonstrate the gate can fail  (deps: T-11)
      Scope: remove the `consentStatus: GRANTED` pin from `findPublic`, run the gate, capture the failure output verbatim, restore the pin, re-run green. Repeat for one contact-block-on-list mutation.
      Traces: **NFR-2** · design.md §10, §15 · D-3
      Files: none committed — evidence only, recorded in `execution.md`
      Verify: `cd backend && npm test -- --silent pii-boundary` before and after each mutation
      Done when: `execution.md` carries the **verbatim** red output for both mutations and the restored green run.
      Disqualifier: **if either mutation does not redden the suite, report the gap and stop — do not record the task as passed.** A gate that cannot fail is not a gate (KZ-002). An inconclusive result here is a legitimate outcome and must be reported as one.
      Falsifying input: this task *is* the falsifying input for T-11.
      Skills: `tdd`, `systematic-debugging`

## Phase E — Frontend

- [ ] **T-13** Split the frontend actor types  (deps: T-7)
      Scope: `PublicActorListItem` (with `PublicActor` as its alias, so the 45 consumers compile unchanged) and `PublicActorDetail`; `useActor` returns the detail shape; update the two API test fixtures.
      Traces: FR-1, FR-9 · design.md §9, DD-6 · D-1b
      Files: `frontend/lib/api/actors.ts`, `frontend/lib/api/useActor.ts`, `frontend/lib/api/actors.test.ts`, `frontend/lib/api/useActor.test.ts`
      Verify: `cd frontend && npm run build && npm test -- --silent "actors|useActor"`
      Done when: `actor.phone` is a **compile error** in any list-typed consumer; the profile compiles against the detail type.
      Disqualifier: `useActor.test.ts` types its mock as bare `jest.Mock`, so type drift there goes **stale, not red** — a green run does not prove the fixture matches the contract. Assert the fixture's shape explicitly.
      Falsifying input: referencing `phone` from `DirectoryView` must fail `npm run build`.
      Skills: `vercel-react-best-practices`

- [ ] **T-14** Replace the restricted panel with the real contact section  (deps: T-13)
      Scope: delete `RestrictedContactPanel`; add `ProfileContact` (Contact: contact person, position, phone, email, market location · Profile: sex, other crops); swap it into `ProfileView`. Plain text, no `tel:`/`mailto:`.
      Traces: FR-6 (both scenarios) · design.md §8, DD-7 · NFR-4
      Files: `frontend/components/profile/{RestrictedContactPanel.tsx,ProfileContact.tsx,ProfileView.tsx}`
      Verify: `cd frontend && npm test -- --silent Profile && npm run lint`
      Done when: rows always render with an em-dash when empty; `docs/ux-ui/design.md` §7 tokens only, no hex; no `tel:`/`mailto:` anchor.
      Disqualifier: jsdom cannot evaluate contrast or layout — a green component suite does **not** discharge NFR-4. That is T-19's.
      Falsifying input: a hardcoded hex must fail lint or the token review.
      Skills: `ui-ux-pro-max`, `tailwind-design-system`, `react-doctor`
      **Note:** `sex` is **not** in `CONTACT_BLOCK_FIELDS` despite sitting near contact fields in the UI. Do not "harmonise" it in.

- [ ] **T-15** Invert the profile suites and re-point the contrast test  (deps: T-14)
      Scope: two suites currently assert the locked panel **exists** — invert them; add a **page-level** absence assertion for any "Restricted" affordance; re-point `contrast.test.ts`'s WCAG pairs from the deleted component to `ProfileContact`.
      Traces: FR-6 · design.md §4, RV-1 · **D-14**
      Files: `frontend/components/profile/ProfileView.test.tsx`, `frontend/components/profile/profile-a11y.test.tsx`, `frontend/lib/contrast.test.ts`
      Verify: `cd frontend && npm test -- --silent "Profile|contrast"`
      Done when: no assertion references `RestrictedContactPanel`; the absence check is page-level, not component-level.
      Disqualifier: deleting the old assertions without adding the page-level absence check leaves D-14 uncovered — removal is not replacement.
      Falsifying input: re-rendering the old panel anywhere on the page must redden.
      Skills: `react-doctor`

- [ ] **T-16** Extend the public CSV to the list set  (deps: T-13)
      Scope: `PUBLIC_COLUMNS` gains `sex` and `otherCrops`; the header comment is rewritten to state the new reason; add assertions naming the contact block explicitly and checking filtered-set fidelity.
      Traces: FR-7 (both scenarios) · design.md §9, DD-3, A-1 · D-1b, D-15
      Files: `frontend/lib/dashboard/csv.ts`, `frontend/lib/dashboard/csv.test.ts`
      Verify: `cd frontend && npm test -- --silent csv`
      Done when: the CSV carries the list set; an assertion **names** `contactPerson`, `position`, `phone`, `email`, `marketLocation` and fails if any appears; no actor outside the filtered `GRANTED` set is exported; the no-spread construction is intact.
      Disqualifier: asserting a column **count** instead of the five names is not coverage — a rename would pass it.
      Falsifying input: adding `phone` to `PUBLIC_COLUMNS` must redden.
      Skills: `vercel-react-best-practices`

## Phase F — Constitution and human verification

- [ ] **T-17** Update the six constitutional documents in one commit  (deps: T-11, T-16)
      Scope: `CLAUDE.md`, `docs/prd.md`, `docs/trd/trd.md`, `docs/ux-ui/design.md`, `docs/specs/general-setup/requirements.md`, `docs/specs/general-setup/design.md`+`task.md`. The TRD gains the list/detail asymmetry in its endpoint table.
      Traces: FR-8 · design.md §4, §6 · D-7
      Files: the six above
      Verify: `grep -rn "phone.*email" CLAUDE.md docs/prd.md docs/trd/trd.md docs/ux-ui/design.md docs/specs/general-setup/` and inspect every hit
      Done when: **zero** surviving statements that `phone`/`email` are withheld from `Public`, outside `docs/specs/archive/`; all six land in one commit.
      Disqualifier: **`docs/specs/archive/` must not be edited** — archived specs are frozen records. A sweep that "fixed" an archived spec has damaged an audit trail, not closed a finding.
      Falsifying input: a surviving old-policy statement must appear in the grep.
      Skills: `cognitive-doc-design`

- [ ] **T-18** Write the superseding ADR and flip ADR-003  (deps: T-17)
      Scope: a new ADR recording consent-as-the-boundary **plus** the list/detail split; ADR-003 marked `superseded` (never rewritten in place).
      Traces: FR-8 · design.md DD-8
      Files: `docs/trd/trd.md`
      Verify: `git log --oneline --all -20 -- docs/trd/trd.md` then read the highest ADR in the newest commit touching it
      Done when: the number is allocated **on the default branch at apply time**, after re-checking unmerged branches. Expected ADR-013 (highest on `main` is ADR-012 as of 2026-09-04) — but re-derive it, do not assume.
      Disqualifier: allocating from this branch without the unmerged-branch check is the KZ-010 defect that already cost a 14-citation sweep once. The check is the gate, not the number.
      Falsifying input: another branch holding the same number must surface in the `git log --all`.
      Skills: `software-architect`

- [ ] **T-19** Human and T6 verification of what no harness can evaluate  (deps: T-4, T-14)
      Scope: (a) rendered profile — contrast, spacing, responsive, both sections; (b) the stale-template message read as an operator would.
      Traces: FR-5, FR-6, NFR-4 · **D-8, D-9** — the two classes with no automated gate
      Files: none — evidence recorded in `execution.md`
      Verify: manual review at the HITL pause, or a T6 Multimodal pass on captured screenshots (per the registry's cross-host dispatch: Antigravity/Gemini vision)
      Done when: `execution.md` records the contrast measurements and a verdict on whether the stale-template message tells an operator what to do.
      Disqualifier: `axe` in jsdom returns *incomplete* for contrast — quoting it as a pass is exactly the KZ-002 pattern. If neither a human nor a T6 pass happens, record D-8/D-9 as **unverified gaps**; do not infer them from the component suite.
      Falsifying input: a contrast pair below 4.5:1 must be reported, not rounded.
      Skills: `ui-ux-pro-max`

## Dependency Graph

```
T-1 → T-2
T-1 → T-3
T-1 → T-4 → T-19
T-1 ┐
T-6 ┴→ T-7 → T-8 ┐
T-6 → T-9 ────────┤
T-5 ┬→ T-10 ──────┤
T-5 ┴─────────────┴→ T-11 → T-12
T-7 → T-13 → T-14 → T-15
              T-13 → T-16
T-11 ┐
T-16 ┴→ T-17 → T-18
T-14 → T-19
```

T-1, T-5 and T-6 are the three roots and may run concurrently. T-5 has no code dependency on T-11 but **must be sequenced before it**.

## Coverage Closure (KZ-001 — scenario and clause granularity)

| Requirement · scenario · clause | Owner |
|---|---|
| FR-1 · all fields present · `THEN`/`AND` | T-11 |
| FR-1 · all fields present · `BUT it must NOT contain technicalSupport, traderId, …` | T-6, T-11 |
| FR-1 · all fields present · `AND IT MUST NOT return the contact block from the list` | T-8, T-11 |
| FR-1 · optional fields absent · `AND IT MUST NOT be omitted` | T-7, T-11 |
| FR-2 · unreachable · `THEN 404` / `AND no field appears` | T-5, T-11 |
| FR-2 · unreachable · `BUT it must NOT be distinguishable from a non-existent id` | T-11 (D-11) |
| FR-2 · unreachable · `AND IT MUST hold on list and /metrics` | T-10, T-11 |
| FR-3 · technicalSupport · `THEN absent` | T-6, T-10 |
| FR-3 · technicalSupport · `BUT it must NOT be absent from the Admin projection` | **T-9** (the re-pointed Admin loop) |
| FR-3 · technicalSupport · `AND IT MUST be declared with its reason` | T-6 |
| FR-4 · contact person published · `THEN`/`AND otherCrops` | T-3 |
| FR-4 · contact person published · `BUT it must NOT be reachable through position` | T-3 (D-10) |
| FR-4 · contact person published · `AND IT MUST leave the rationale rewritten` | T-3 (DD-5) |
| FR-4 · pre-existing actor · `THEN em-dash` | T-14 |
| FR-4 · pre-existing actor · `AND IT MUST NOT be backfilled, invented or derived` | T-1 (no backfill), T-3 + T-4 (no derive on the other write paths — D-12) |
| FR-5 · v3 row imports · `AND headers/allowed-value lists/parser agree` | T-4 |
| FR-5 · v3 row imports · `BUT it must NOT change required/optional status` | T-4 (D-13) |
| FR-5 · v3 row imports · `AND IT MUST keep field-names-only errors` | T-4 |
| FR-5 · v2 workbook · `THEN`/`AND IT MUST name the action` | T-4 (automated), **T-19** (is it useful? — D-9) |
| FR-6 · locked panel gone · `THEN no affordance anywhere on the page` | T-15 (D-14) |
| FR-6 · locked panel gone · `BUT it must NOT hide an empty row` | T-14 |
| FR-6 · locked panel gone · `AND IT MUST use §7 tokens only` | T-14, T-19 |
| FR-6 · accessible structure · `AND IT MUST meet WCAG 2.1 AA contrast` | **T-19** (D-8 — not evaluable in jsdom) |
| FR-7 · export omits contact block · `THEN`/`AND no never-public field` | T-16 |
| FR-7 · export omits contact block · `BUT it must NOT include an actor outside the filtered set` | T-16 (D-15) |
| FR-7 · export omits contact block · `AND IT MUST keep the named allowlist, no spread` | T-16 |
| FR-7 · widening the API does not widen the export · `AND IT MUST name the contact block` | T-13 (type), T-16 (assertion) |
| FR-8 · no contradiction · `THEN zero survivors` | T-17 |
| FR-8 · no contradiction · `BUT it must NOT edit docs/specs/archive/` | T-17 |
| FR-8 · no contradiction · `AND IT MUST land in a single commit` | T-17 |
| FR-9 · list never carries contact · `THEN`/`AND list set present` | T-8, T-11 |
| FR-9 · list never carries contact · `BUT it must NOT be circumventable by a parameter` | T-8, T-11 |
| FR-9 · list never carries contact · `AND IT MUST be asserted by value` | T-5, T-10, T-11 |
| FR-9 · detail is the only source · `AND IT MUST be recorded in NFR-6` | design §12 DD-3 (documented), T-17 (TRD) |
| NFR-1 consent at the query | T-8 |
| NFR-2 gate can fail | **T-12** |
| NFR-3 no new write path | T-8 (scope guard) |
| NFR-4 a11y + tokens | T-14, **T-19** |
| NFR-5 migration safety | T-1 |
| NFR-6 bulk bounded by the projection | T-8, T-11 (list assertion — explicitly **not** the CSV test) |
| NFR-7 consent wording gap | out of scope by decision; recorded, owner programme/legal |

**Every scenario and every `BUT`/`AND IT MUST` clause above is owned.** Two are owned by a human/T6 check rather than a command (D-8, D-9) — declared, not silently counted as automated.
