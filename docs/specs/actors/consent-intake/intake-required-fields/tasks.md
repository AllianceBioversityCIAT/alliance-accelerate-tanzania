# Tasks — One intake contract: required fields, generated Trader ID, duplicate detection, template v4

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/actors/consent-intake/intake-required-fields` |
| Parent Spec | `actors/consent-intake` ([`family.md`](../family.md)), chunk 1 of 2 |
| Depth | Standard |
| Approval Mode | gated |
| Requirements | [`requirements.md`](requirements.md): FR-1 to FR-6, NFR-1 to NFR-4 |
| Design | [`design.md`](design.md) r2 (judgment **APPROVED**, [`judgment.md`](judgment.md)) |
| Budget | **8 tasks · ~1,800 LOC · ~13 review rounds.** *Re-sized at decomposition: design §11 said 7 tasks. Import was split into T-4 (template and validation) and T-5 (duplicates), because one task carrying both exceeded a single focused session. LOC is unchanged.* `/akili-execute` **escalates to the user when any task reaches a 3rd review round**, or when actuals pass the budget. |
| Branch | `feature/atp-84-consent-request-email` |

---

## 2. Rules every task inherits

- **Every gate must be shown to fail.** Apply the named mutation, paste the red, restore, paste the green. Assert that the mutation actually applied (KZ-002).
- **Sweep every clause the task owns** (KZ-013). Each clause in the closure table (§5) owned by this task gets either (A) a mutation that reddens a *named* test, or (B) a declared unevaluable gap with its reason.
- **The harness mocks Prisma** (design P-17). A green suite proves the code does what the mock allows. It never proves MySQL behaviour, concurrency, or migration SQL. Migrations are proven by `npx prisma migrate dev` against the local stack (the `docs/infrastructure.md` *Local Environment* contract).
- **Re-check `git log --oneline --all -5 -- <files>` before writing and before committing** (KZ-010; memory: concurrent sessions are real here).
- **Verification commands are the failure-only forms** from root `CLAUDE.md`. Lint in `backend/` is `npx eslint "{src,test}/**/*.ts" --quiet`, never `npm run lint`, because that runs `--fix`.
- **Consumers are part of Verify.** Every file listed under a task's `Consumers` must be green at its end.

---

## 3. Tasks

- [ ] **T-1** The intake contract, and the required set on admin create and edit  (deps: none)
      Scope:
      - Create `backend/src/common/intake-contract.ts` (design §4.1).
      - Make `ActorCreateDto` / `AdminActorCreateDto` require Contact Person, ≥1 crop, Capacity, Phone and Email, with self-registration's bounds: traderName ≤ 200, contactPerson ≤ 120, phone ≤ 40, email ≤ 191, capacity ≥ 0.
      - `update`: add the merged-state required check. `crops` absent keeps the stored links; `crops: []` gets a 400 (design §4.4).
      - Add the NFR-1 metadata test over `RegistrationPayloadDto` (+ `RegistrationCreateDto.email`) and `AdminActorCreateDto`.
      - `traderId` **stays** in the DTOs until T-2.
      Traces: FR-1 (API side of every scenario); NFR-1 (DTO half); design §4.1, §4.4, DD-1, P-20, P-21, P-22
      Files: `backend/src/common/intake-contract.ts` (+ spec), `backend/src/actors/dto/actor-create.dto.ts`, `admin-actor-create.dto.ts`, `backend/src/actors/actors-admin.service.ts`, specs
      Skills: `nestjs-expert`, `tdd`
      Verify: `cd backend && npm test -- --silent && npm run build && npx eslint "{src,test}/**/*.ts" --quiet`
      Falsifier:
      1. Make `phone` `@IsOptional` on `AdminActorCreateDto`. The NFR-1 test **and** a DTO spec redden.
      2. Remove `@ArrayNotEmpty` from `crops` and send `otherCrops: 'millet', crops: []`. The "other crops alone" spec reddens.
      3. Drop the merged-state check. The "edit an actor stored without email" service spec reddens.
      4. Let `crops: []` pass on PATCH. The crops spec reddens.
      5. Raise the email max to 254. The bound spec reddens.
      Red run: each falsifier must redden on the **validation assertion**, never on fixture setup. A spec that fails because the fixture itself is now invalid is not a red.
      Disqualifier: if the NFR-1 test passes with a mutated DTO, it is reading the wrong metadata target, for example the base class only. Fall back to DD-1's black-box `validate()` convention and report it. A metadata test proves decorator presence, not runtime behaviour, so the black-box DTO specs remain the behavioural proof.
      Consumers: fixtures that create actors without the newly required fields:
      - `actors/dto/actor-dto.spec.ts`
      - `actors/dto/admin-actor-dto.spec.ts`
      - `actors/actors-admin.service.spec.ts`
      - `test/admin-actors-crud.e2e.spec.ts`
      - `test/admin-actors.e2e.spec.ts`
      - `test/lambda-handler.e2e.spec.ts`
      - `test/pii-boundary.spec.ts`
      - `common/validation-pipe.spec.ts`
      - `prisma/actor-model.spec.ts`

      Grep `traderName:` across `backend/src/**/*.spec.ts` to find the rest; the list is the union.
      Review: `full`. It is the contract every later task consumes, and the fixture churn is wide.
      Done when: admin create and edit reject each missing required field and each over-bound value at the API, an incomplete stored actor is still readable but not savable incomplete, and all five falsifiers were shown red.

- [ ] **T-2** System-generated Trader ID on admin create  (deps: T-1)
      Scope:
      - **First step:** confirm P-17's gap stands. Record it in `execution.md`; no spike.
      - Migration `add_actor_sequence` (design §2).
      - `backend/src/actors/trader-id.util.ts`: range allocation, the `TM-<year>-<NNNN>` format, widening past 9999 (design §4.2).
      - `traderId` leaves `ActorCreateDto`, `AdminActorUpdateDto` and `SCALAR_FIELDS`.
      - `create` allocates before its transaction, merges the ID explicitly, and retries on `P2002` up to 3 attempts. Exhaustion is a 500.
      - `mapPrismaError`'s `traderId` branch is kept for the retry path only.
      Traces: FR-2 scenarios 1–4 for **create** (scenario 2's concurrency clause is a declared gap with retry-spec substitute; design §10); design §2, §4.2, §4.4 step 4, DD-2, P-9, P-10, P-17, P-24
      Files: `backend/prisma/schema.prisma`, `backend/prisma/migrations/<ts>_add_actor_sequence/`, `backend/src/actors/trader-id.util.ts` (+ spec), the DTOs, `actors-admin.service.ts` (+ spec)
      Skills: `nestjs-expert`, `tdd`
      Verify: `cd backend && npx prisma migrate dev --name add_actor_sequence` against the local stack, then `npm test -- --silent && npm run build && npx eslint "{src,test}/**/*.ts" --quiet`
      Falsifier:
      1. Make the range arithmetic return `[value − count, value − 1]` (off by one). The range spec reddens.
      2. Remove the retry. The "stubbed `P2002` then success" spec reddens.
      3. Retry forever. The exhaustion spec, which expects a 500 after 3 attempts, reddens.
      4. Re-add `traderId` to `SCALAR_FIELDS`. The "body `traderId` is ignored / never changes on edit" spec reddens.
      Red run: the retry specs must red on the **assertion on the created ID or the status**, not on a mock left unconsumed.
      Disqualifier: the allocation SQL runs only against a mock here. A green util spec proves the arithmetic and the call shape, never MySQL's atomicity. That is the declared gap, so state it in the report. Do not claim FR-2 scenario 2 is proven.
      Consumers: every create-actor test body that sends `traderId`, and every assertion on a typed `traderId` (design P-15: 36 test files / 303 lines in total; this task owns the **create** and **update** ones). `grep -rln "traderId" backend/src --include=*.spec.ts` gives the list, which is recorded in the report.
      Review: `full`. Identity allocation is correctness-critical.
      Done when: a created actor carries a `TM-` ID, a client-sent `traderId` never lands, existing IDs never change on edit, the migration applies locally, and all four falsifiers were shown red.

- [ ] **T-3** Intake duplicate check and the admin-create gate  (deps: T-2)
      Scope:
      - **First step, which settles P-14:** measure the matcher over a 1,000-candidate batch against ≥1,000 fixture actors, run 3 times. Record the spread in `execution.md`. If any run is > 10 s, **stop and Pivot** (design §4.3's algorithm is the premise).
      - Export the normalizers and `computeMatchedOn` from `duplicate-detection.service.ts`, with no behaviour change to the registration queue.
      - Add `IntakeDuplicateService`: strength classification, uncapped strong set, weak capped at 5, in-file indexing API. Register it in `ActorsModule`.
      - Migration `add_audit_duplicate_confirmation`.
      - `create`: a 409 carrying `duplicateCandidates` unless every strong candidate is in `confirmedNotDuplicateOf`; `logCreate` writes `duplicateConfirmation`; the response carries `duplicateWarnings`.
      Traces: FR-3 (all five scenarios, API side); NFR-2 (P-14); NFR-3 (create surface); design §2, §3, §4.3, §4.4, DD-3, DD-4, P-2, P-3, P-11, P-14
      Files: `backend/src/registrations/duplicate-detection.service.ts` (exports only), `backend/src/actors/intake-duplicate.service.ts` (+ spec), `actors.module.ts`, `actor-audit.service.ts`, the `ActorAuditLog` schema + migration, `admin-actor-create.dto.ts`, `actors-admin.service.ts` (+ spec), `test/admin-actors-crud.e2e.spec.ts`
      Skills: `nestjs-expert`, `tdd`, `api-design-principles`, `error-handling-patterns`
      Verify: `cd backend && npx prisma migrate dev --name add_audit_duplicate_confirmation`, then `npm test -- --silent && npm run build && npx eslint "{src,test}/**/*.ts" --quiet`
      Falsifier:
      1. **The DD-3 falsifier.** The fixture has 5 actors matching on name+GPS plus 1 matching on email only. Re-apply the registration cap (sort by count, slice 5). The "email-only strong match still gates" spec reddens.
      2. Treat a confirmation as a boolean instead of a set of ids. The "changed email now matches B" spec reddens.
      3. Classify `traderName` as strong. The weak-creates spec reddens.
      4. Add `phone` to the candidate projection. The NFR-3 key-set spec reddens.
      5. Skip the gate when `confirmedNotDuplicateOf` is present but empty. The direct-POST e2e reddens.
      6. Omit `duplicateConfirmation` from `logCreate`. The audit spec reddens.
      Red run: the 409 specs must red on the **status and the candidate ids**, not on a thrown mock.
      Disqualifier: the P-14 measurement is evidence only if the 3 runs vary by less than the margin to 10 s. Otherwise, report the spread and do not claim NFR-2. A local timing is not a Lambda timing; the report says so.
      Consumers:
      - `registrations/duplicate-detection.service.spec.ts`
      - `registrations/admin-registrations.service.spec.ts`
      - `registrations/admin-registrations-dismiss-duplicate.spec.ts`
      - `registrations/admin-registrations-reject.spec.ts`

      These must stay green unchanged; that proves no behaviour change to the queue. Add `actor-audit.service.spec.ts` and `test/admin-actors-crud.e2e.spec.ts`.
      Review: `full`. This is the gate whose failure creates duplicates silently.
      Done when: P-14 is settled in `execution.md`, a strong match cannot be created without naming every strong candidate, a confirmation is audited, weak matches create with warnings, the registration-queue suites are unchanged and green, and all six falsifiers were shown red.

- [ ] **T-4** Template v4 and import row validation on the intake contract  (deps: T-2)
      Scope (design §4.5 first bullet, §4.6):
      - `TEMPLATE_VERSION = 'v4'`. Drop Trader ID, GPS Altitude, GPS Accuracy and Registration Source. Required flags come from the intake contract.
      - Add the `HOW_TO_LINES` line.
      - Regenerate `frontend/public/templates/actor-import-template.xlsx` with `npm run generate:template`.
      - Add a test pinning Consent Method's new Lists letter, `H`.
      - `validateRow` consumes the contract. Imports are always `TEAM_MANAGED`.
      - Commit allocates **per chunk** before each chunk transaction, retries a chunk on `P2002` up to 3 attempts, and on exhaustion fails only that chunk while later chunks run (design §4.2 table, §4.5).
      - The Trader-ID dedupe (`dedupeInFile` / `dedupeAgainstDb`) is **removed**; T-5 replaces it. In between, the branch has no import dedupe, which is acceptable because the branch is unreleased.
      - The NFR-1 test is extended to the template's required headers.
      Traces: FR-1 import scenarios (missing cell, capacity 0, bounds); FR-2 import path; FR-5 (all four scenarios, plus the Instructions-sheet clause); NFR-1 (template half); design §4.5, §4.6, P-4, P-5, P-7, P-8, P-23
      Files: `backend/src/common/template-columns.ts` (+ spec), `backend/scripts/generate-import-template.ts`, `backend/src/common/generate-template.spec.ts`, `frontend/public/templates/actor-import-template.xlsx`, `backend/src/actors/actor-import.service.ts` (+ spec), `actor-import.types.ts`, `test/admin-actor-import.e2e.spec.ts`, `test/partner-profile-onboarding-import.e2e.spec.ts`
      Skills: `nestjs-expert`, `tdd`, `error-handling-patterns`
      Verify: `cd backend && npm run generate:template && npm test -- --silent && npm run build && npx eslint "{src,test}/**/*.ts" --quiet`, then `git diff --stat frontend/public/templates/` (the asset must have changed)
      Falsifier:
      1. Regenerate, then hand-edit one cell of the committed `.xlsx`. The byte-identity spec reddens.
      2. Leave `TEMPLATE_VERSION` at `'v3'`. The v3-rejected spec reddens.
      3. Leave Contact Person `required: false`. The NFR-1 template assertion reddens.
      4. Make chunk exhaustion rethrow. The "later chunk still created, response is a report" spec reddens.
      5. Allocate once for the whole import. The "collision in chunk 2 retries only chunk 2" spec reddens.
      6. Import a `GRANTED` row with no method. The provenance spec reddens; it must stay unchanged.
      Red run: the byte spec must red on `generated.equals(committed)`, not on a missing file.
      Disqualifier: if the regenerated asset is byte-identical to v3, the generator did not read the new columns. Stop. A green import spec with Prisma mocked proves row routing, not that the per-chunk transactions commit in MySQL. Say so.
      Consumers:
      - `common/template-columns.spec.ts` (pins `'v3'`)
      - `common/generate-template.spec.ts` (Lists B/D, bytes)
      - `actors/actor-import.service.spec.ts`
      - `test/admin-actor-import.e2e.spec.ts`
      - `test/partner-profile-onboarding-import.e2e.spec.ts`
      - `import/import.service.spec.ts`: the unwired legacy importer. Confirm it is untouched, or record why.
      Review: `full`.
      Done when: a v4 workbook imports with generated IDs as `TEAM_MANAGED`, v3 is rejected, the asset matches the generator byte for byte, chunk exhaustion is chunk-local, and all six falsifiers were shown red.

- [ ] **T-5** Import duplicate classification and per-row confirmation  (deps: T-3, T-4)
      Scope (design §3 import row, §4.5):
      - `classifyDuplicates` runs over rows that passed validation, against the DB and against **earlier** rows. Failed rows are never match sources; `possible-duplicate` rows are.
      - Add `duplicateConfirmations` to `ActorImportRequestDto`.
      - The outcome union becomes `created | possible-duplicate | failed`.
      - Each row gets `duplicateCandidates` and `duplicateWarnings`.
      - Totals: `skipped` is renamed `possibleDuplicate`.
      - `logImport` writes each row's `duplicateConfirmation`, with row snapshots resolved to created IDs.
      - Commit recomputes everything.
      - Re-time a 1,000-row preview (NFR-2).
      Traces: FR-4 (all six scenarios); NFR-2 (import path); NFR-3 (import surface); design §3, §4.5, DD-4, DD-5
      Files: `actor-import.service.ts` (+ spec), `actor-import.types.ts`, `dto/actor-import-request.dto.ts` (+ spec), `actor-audit.service.ts`, `test/admin-actor-import.e2e.spec.ts`, `test/partner-profile-onboarding-import.e2e.spec.ts`
      Skills: `nestjs-expert`, `tdd`
      Verify: `cd backend && npm test -- --silent && npm run build && npx eslint "{src,test}/**/*.ts" --quiet`
      Falsifier:
      1. Match in both directions in-file. The "row 5 is not flagged" spec reddens.
      2. Let a failed row be a match source. The "failed row sharing a phone does not flag the later row" spec reddens.
      3. Honour a confirmation without recomputing at commit. The stale-premise spec reddens.
      4. Create unconfirmed flagged rows. The re-upload "zero created" spec reddens.
      5. Drop one outcome from the totals sum. The countability spec, in both preview and commit forms, reddens.
      6. Add `email` to the row candidate. The NFR-3 import key-set spec reddens.
      Red run: on the per-row outcome and totals assertions.
      Disqualifier: the same timing rule as T-3. A 1,000-row preview that only passes once in three is not NFR-2 evidence.
      Consumers: the 10 `skipped-exists` files and 8 `skipped-duplicate-in-file` files from design P-15. The **backend** ones are owned here; the frontend ones are T-7's.
      Review: `full`.
      Done when: every FR-4 scenario has a red-then-green spec, `skipped-*` no longer exists in backend production code (`grep -rn "skipped-exists\|skipped-duplicate-in-file" backend/src --include=*.ts` → test-fixture hits only, or zero), NFR-2 is re-timed, and all six falsifiers were shown red.

- [ ] **T-6** Admin form: required fields, no Trader ID input, the duplicate dialog  (deps: T-3)
      Scope (design §5):
      - `ApiError` keeps `body`.
      - The `lib/api/actors-admin.ts` types mirror T-1 to T-3's contracts exactly.
      - `ActorForm`:
        - `validate()` mirrors the required set and bounds, pinned by a test against the same literal list (NFR-1, frontend half).
        - The Trader ID input is removed on create; edit shows it read-only.
        - `mapApiError` no longer maps every 409 to `traderId`.
        - A 409 carrying candidates opens a new `DuplicateConfirmDialog`. Confirming resubmits with the ids.
        - `onSuccess(actor)`.
      - `new/page.tsx` shows an informational dialog when `duplicateWarnings` is non-empty, then redirects.
      - `ActorHistoryPanel` renders `duplicateConfirmation`.
      Traces: FR-1 form side (no phone, crops, edit incomplete); FR-2 (the admin sees the ID; no input on create; read-only on edit); FR-3 UI side (strong dialog, confirm and resubmit, weak info dialog, audit line shown); NFR-1 frontend half; NFR-4; design §5, P-12, P-13
      Files: `frontend/lib/api/client.ts`, `frontend/lib/api/actors-admin.ts`, `frontend/components/admin/ActorForm.tsx`, `frontend/components/admin/DuplicateConfirmDialog.tsx` (new), `frontend/app/(admin)/admin/actors/new/page.tsx`, `frontend/components/admin/ActorHistoryPanel.tsx`, tests
      Skills: `vercel-react-best-practices`, `tailwind-design-system`, `frontend-design`, `react-doctor`
      Verify: `cd frontend && npm test -- --silent && npm run lint && npm run build`
      Falsifier:
      1. Keep the old `mapApiError`, so a 409 goes to `traderId`. The "409 with candidates opens the dialog" test reddens.
      2. Resubmit without the ids. The "resubmit carries `confirmedNotDuplicateOf`" test reddens.
      3. Render the Trader ID input in create mode. The create-form test reddens.
      4. Drop `body` from `ApiError`. The client test reddens.
      5. Make Phone optional in `validate()`. The frontend required-set pin reddens.
      6. Drop the focus trap. The dialog focus test reddens.
      Red run: on the rendered-output assertions, not on a missing mock.
      Disqualifier: jsdom cannot evaluate layout, contrast, or whether a token emits CSS (memory: `/NN` opacity is inert). Those are **not covered** by these tests. Take rendered captures at 375/768/1440 with headless Chromium (memory: measure, don't estimate) and show them at the HITL pause. The rendered-measurement checklist applies:
      - Confirm the production text and icon fonts are loaded before capturing.
      - Measure the dialog's baseline overflow before asserting none.
      - Read geometry (bounding rects), not class presence.
      Consumers:
      - `components/admin/ActorForm.test.tsx`
      - `app/(admin)/admin/actors/edit/page.test.tsx`
      - `app/(admin)/admin/actors/page.test.tsx`
      - `lib/api/actors-admin.test.ts`
      - `lib/api/client` tests
      - `components/admin/ActorHistoryPanel.test.tsx`
      - `components/admin/ActorsTable.test.tsx`

      Grep `traderId` under `frontend/{app,components,lib}` test files; the list is the union.
      Review: `full`.
      Done when: the form enforces the same set as the API, the strong path cannot create without the dialog's confirmation, weak warnings are shown, the history shows confirmations, captures exist at three widths, and all six falsifiers were shown red.

- [ ] **T-7** Import page: per-row confirmation and the new outcomes  (deps: T-5, T-6)
      Scope (design §5):
      - `ImportPreviewTable` shows `possible-duplicate` rows with their candidates and a **Not a duplicate — create** checkbox, in the `hidden md:block` table **and** the `md:hidden` cards (P-19).
      - Weak warnings use `bg-surface-alt text-warning` (I-11).
      - The new labels.
      - Trader ID shows "—" in preview and the assigned ID after commit.
      - The import page holds the confirmations, sends them on commit, and shows the totals from the new shape.
      Traces: FR-4 UI side (confirming a row; weak shown; totals shown); NFR-4; design §5, P-19
      Files: `frontend/app/(admin)/admin/actors/import/page.tsx`, `frontend/components/admin/ImportPreviewTable.tsx`, tests
      Skills: `vercel-react-best-practices`, `tailwind-design-system`, `frontend-design`, `react-doctor`
      Verify: `cd frontend && npm test -- --silent && npm run lint && npm run build`
      Falsifier:
      1. Render the checkbox only in the table branch. The cards-branch test reddens.
      2. Send all flagged rows as confirmed. The "only ticked rows are sent" test reddens.
      3. Keep `bg-warning/10` on the new line. A class assertion reddens. This is a presence check only; the capture is the proof.
      Red run: on the request-payload and rendered-text assertions.
      Disqualifier: the same jsdom limits as T-6. The **capture at 375/768/1440 is the gate** for both branches, including the `md` boundary at 767/768.
      Consumers:
      - `app/(admin)/admin/actors/import/page.test.tsx`
      - `components/admin/ImportPreviewTable.test.tsx`
      - the frontend `skipped-*` files from design P-15
      Review: `full`.
      Done when: an admin can confirm individual flagged rows and only those are created, both layouts carry the control, captures exist at three widths plus the boundary, and all three falsifiers were shown red.

- [ ] **T-8** Baseline documents  (deps: T-5, T-6)
      Scope (design §4.7, DD-6):
      - `docs/prd.md`: the required set and the generated Trader ID.
      - `docs/trd/trd.md`:
        - the data-model natural-key line, the "upsert by `traderId`" line, and QA-9's tactic and outcome shape;
        - `ActorSequence` and the audit column;
        - the new ADR. Its **number is allocated at archive time on `main`**: write `ADR-NNN` here, and check unmerged branches first (CLAUDE.md *Concurrency protocol*).
      - `backend/CLAUDE.md` + `backend/AGENTS.md` in lockstep for the v4 bump.
      Traces: FR-6 (both bullets and the "no stale instruction" scenario); design §4.7, DD-6, P-16
      Files: `docs/prd.md`, `docs/trd/trd.md`, `backend/CLAUDE.md`, `backend/AGENTS.md`
      Skills: `product-manager-toolkit`, `software-architect`, `cognitive-doc-design`
      Verify: `grep -rniE "dedupes on|upsert by .?traderId|template v3|\bv3\b.*template|trader id is required" docs/prd.md docs/trd/trd.md docs/infrastructure.md backend/CLAUDE.md backend/AGENTS.md` → 0 live hits. Run the same pattern **before** the edits and record the pre-change hit list.
      Falsifier: the pre-change run must show the QA-9 and natural-key hits (design P-16). If it shows 0, the pattern is wrong; fix it before editing.
      Red run: n/a (no test gate).
      Disqualifier: a 0-hit grep proves the named phrasings are gone, not that no paraphrase survives (KZ-004). Read every TRD section that mentions `traderId` and record each one as checked.
      Consumers: none (no shared symbol changed).
      Review: `full`. **Mandatory**, because these are constitutional baselines (CLAUDE.md, *blast radius*).
      Done when: the pre/post grep pair is recorded, every `traderId` mention in the TRD has been read and is true, and `backend/CLAUDE.md` and `backend/AGENTS.md` say the same thing.

---

## 4. Dependency Graph

```
T-1 → T-2 → T-3 → T-6 ─┐
        └──→ T-4 → T-5 ─┼→ T-7
               T-3 → T-5 └→ T-8   (T-8 also needs T-6)
```

| Task | Deps |
|---|---|
| T-1 | none |
| T-2 | T-1 |
| T-3 | T-2 |
| T-4 | T-2 |
| T-5 | T-3, T-4 |
| T-6 | T-3 |
| T-7 | T-5, T-6 |
| T-8 | T-5, T-6 |

T-3 and T-4 are independent once T-2 is done. Do **not** run them concurrently in one checkout; both touch `actor-audit.service.ts` and the e2e suites (CLAUDE.md *Concurrency protocol*).

---

## 5. Coverage closure (scenario and clause level — KZ-001)

| Requirement → scenario / clause | Owner(s) |
|---|---|
| FR-1 · admin create without phone → form "required" | T-6 |
| FR-1 · *AND IT MUST* be rejected by the API too (direct `POST` → 400 naming `phone`) | T-1 |
| FR-1 · no crop, only Other crops → rejected (form and API) | T-6 (form), T-1 (API) |
| FR-1 · *BUT* Other crops alone MUST NOT satisfy | T-1 (falsifier 2), T-6 |
| FR-1 · edit of an incomplete actor → rejected until filled | T-1 (API), T-6 (form shows the field error) |
| FR-1 · *BUT* not altered, hidden or flagged just by existing | T-1 (a spec: read paths still return the incomplete actor) |
| FR-1 · import row missing a required cell → `failed`, others unaffected | T-4 |
| FR-1 · capacity 0 accepted | T-1, T-4 |
| FR-1 · same bounds (200 / 120 / 40 / 191) | T-1 (admin), T-4 (import) |
| FR-2 · create assigns an ID; the admin sees it | T-2 (assign), T-6 (shown) |
| FR-2 · concurrent creates → IDs differ | T-2. **Declared gap** for real concurrency (P-17); substitute: atomic allocation + retry specs |
| FR-2 · *AND IT MUST* never surface as a uniqueness error | T-2 (create retry), T-4 (import chunk retry) |
| FR-2 · a client-sent `traderId` is ignored | T-2 |
| FR-2 · *BUT* an existing ID MUST NOT change on any edit | T-2 |
| FR-2 · existing actors' IDs unchanged | T-2 |
| FR-2 · no input on form/template; read-only on edit | T-6 (form), T-4 (template) |
| FR-3 · strong match → not created, candidate shown, two choices | T-3 (API), T-6 (dialog) |
| FR-3 · confirmed → created; *AND IT MUST* record the confirmation in the trail | T-3 (audit), T-6 (shown) |
| FR-3 · weak only → created with warning; *BUT* MUST NOT ask | T-3, T-6 |
| FR-3 · confirmation not reusable (B after A) | T-3 (falsifier 2) |
| FR-3 · the API enforces it (direct POST) | T-3 (falsifier 5) |
| FR-3 · PII: matched values never exposed | T-3 (NFR-3) |
| FR-4 · re-upload → all flagged, zero created | T-5 |
| FR-4 · within-file → later flagged, earlier not | T-5 |
| FR-4 · confirming a row → created and audited; *BUT* unmarked flagged rows MUST NOT be created | T-5 (API), T-7 (UI sends only ticked rows) |
| FR-4 · confirmation whose premise changed → held again | T-5 |
| FR-4 · weak → created, listed in result | T-5, T-7 |
| FR-4 · totals sum; one reason per non-created row | T-5, T-7 (shown) |
| FR-5 · v4 imports as `TEAM_MANAGED` with generated IDs | T-4 |
| FR-5 · v3 rejected naming the expected version | T-4 |
| FR-5 · `GRANTED` without method → today's reason, unchanged | T-4 (falsifier 6) |
| FR-5 · published file byte-identical to the generator | T-4 |
| FR-5 · the Instructions sheet describes v4 and duplicate detection | T-4 |
| FR-6 · PRD states the set and the generated ID | T-8 |
| FR-6 · TRD dedupe/upsert statements replaced; backend guides accurate | T-8 |
| FR-6 · no stale instruction survives | T-8 |
| NFR-1 · one definition, drift reddens | T-1 (DTOs), T-4 (template), T-6 (frontend pin) |
| NFR-2 · 1,000 rows inside the budget | T-3 (settles P-14), T-5 (import re-time) |
| NFR-3 · no matched value on any surface | T-3 (create), T-5 (import) |
| NFR-4 · keyboard, focus trap, `aria-live`, AA | T-6, T-7, plus captures |
| Defect class "layout at 375/768/1440" (no automated gate) | T-6, T-7: rendered captures at the HITL pause |

Every row has an owner. The one gap is FR-2's real-database concurrency, declared above with its substitute.

---

## 6. PR strategy

About 1,800 LOC is well above the ~400 single-PR line. The recommendation is **two PRs from this branch, merged together**: the contracts change in lockstep (design §3, *Deploy coupling*), so neither ships alone.

| PR | Tasks | Review first | Out of scope |
|---|---|---|---|
| PR 1 — backend + docs | T-1 to T-5, T-8 | `intake-contract.ts`, `intake-duplicate.service.ts` (the gate), `trader-id.util.ts` | UI |
| PR 2 — frontend | T-6, T-7 | `ActorForm` 409 handling, `DuplicateConfirmDialog`, the import-row confirmation | Backend logic (PR 1) |

Each PR description links the other and follows `cognitive-doc-design` review-empathy rules.

## 7. `skip-eligible` tasks

**None.** Every task is `full`: each touches the duplicate gate, identity allocation, a shared contract, or a constitutional baseline.
