# Tasks — Registration Source & Consent Provenance

- **Spec path:** `docs/specs/actors/registration-source-and-consent/`
- **Depth:** Standard · **Budget (design.md §10):** 10 tasks · ~1,250 LOC · ~12 review rounds
- **Traces:** `requirements.md` FR-1..FR-9, NFR-1..NFR-8 · `design.md` §1..§12
- **Commits:** `[SPEC:actors/registration-source-and-consent] <message>`

> **Two failure modes dominate this spec.** Both have a named task and a named test:
> - **R-9 / J-1** — implementing the guard as *key-present* instead of *value-changed* makes every legacy `GRANTED` actor uneditable. Owned by **T-2**, proven by **T-3**.
> - **R-1** — forgetting `SCALAR_FIELDS` means the fields validate, return `200`, and never persist. Owned by **T-3**, which is why its done-criteria is a read-back, not a status code.

---

## Phase A — Foundation

- [x] **T-1** Add registration-source and consent-provenance columns to the Actor model  (deps: none)
      **Scope:** `RegistrationSource` + `ConsentMethod` enums; four `Actor` columns with defaults per `design.md` §2; index on `registrationSource`. Schema and migration only — no service, DTO, or API change.
      **Traces:** FR-1, FR-2, NFR-2 · `design.md` §2
      **Files:** `backend/prisma/schema.prisma`, `backend/prisma/migrations/*`
      **Verify:** `cd backend && npx prisma migrate dev --name add_registration_source_and_consent_provenance && npm run build`
      **Done when:** migration applies cleanly against the local docker MySQL; generated client types compile; a pre-migration row count and a sampled row read back **identical** afterwards, with the new columns at their defaults.
      **Not done if:** any existing column is altered, narrowed, or dropped; any pre-existing row's non-new fields differ; or a backfill populates provenance for legacy `GRANTED` rows (**FR-9 forbids this — the gap must stay visible**).
      **Skills:** `nestjs-expert`

- [x] **T-2** Implement the shared consent-provenance invariant  (deps: T-1)
      **Scope:** New pure, Nest-independent `common/consent-provenance.policy.ts` beside `pii-consent.policy.ts`. Exposes one predicate over (stored state, submitted payload). **Triggers on value change, never on field presence** — conditions (a) and (b) of `design.md` §4.1. No call sites wired in this task.
      **Traces:** FR-3, NFR-7 · `design.md` §4.1, DD-1, DD-3
      **Files:** `backend/src/common/consent-provenance.policy.ts`, `backend/src/common/consent-provenance.policy.spec.ts`
      **Verify:** `cd backend && npm test -- consent-provenance --silent`
      **Done when:** a table-driven test covers **all five rows** of the `design.md` §4.1 truth table, including the legacy-actor-unchanged-values row and the un-publish-then-strip row.
      **Not done if:** the implementation inspects key presence (`'consentStatus' in payload`, `payload.consentStatus !== undefined`) as its trigger rather than comparing against stored values; or the module imports anything from `@nestjs/*` or Prisma runtime (it takes plain objects, matching `pii-consent.policy.ts`).
      **Evidence is disqualified if:** the truth-table test passes but was written by asserting the implementation's actual output rather than the §4.1 table — the expected values come from the **requirements**, not from running the code. Cross-check each expected value against FR-3's scenarios by hand.
      **Skills:** `nestjs-expert`, `tdd` *(Leader-assigned: this is a pure business rule with a published truth table — the case where `tdd` earns its cost)*

---

## Phase B — Backend write paths

- [ ] **T-3** Wire provenance into admin create and update  (deps: T-2)
      **Scope:** Four optional validated fields on `ActorCreateDto` (enum membership from Prisma-generated types, `@IsDateString` + not-in-future, `@MaxLength(255)`); **add the four names to `SCALAR_FIELDS`** (`actors-admin.service.ts:59`); call the T-2 predicate in `create` and `update` alongside — **not instead of** — the existing `acknowledged` checks; extend `admin-actor.serializer.ts`.
      **Traces:** FR-1, FR-2, FR-3, NFR-6 · `design.md` §4.2, §4.3, §4.5, DD-2
      **Files:** `backend/src/actors/dto/actor-create.dto.ts`, `backend/src/actors/actors-admin.service.ts`, `backend/src/actors/admin-actor.serializer.ts`, `backend/src/test/admin-actors-crud.e2e.spec.ts`
      **Verify:** `cd backend && npm test -- admin-actors --silent`
      **Done when:** (1) each of the four fields **round-trips** — written via `POST`/`PATCH`, then read back with the stored value (**this, not a `201`, is what proves `SCALAR_FIELDS` was updated — R-1**); (2) create and update each reject grant-without-provenance with a field-level `400`; (3) **editing `district` on a legacy `GRANTED` + `NOT_RECORDED` actor succeeds when the request body is the full object `ActorForm` actually sends** (R-9); (4) an update touching the fields produces an `ActorAuditLog` diff row.
      **Not done if:** the existing `acknowledged` checks were replaced rather than kept (DD-2 — they are independent gates), or the legacy-edit case is tested with a sparse body instead of the full object the frontend emits.
      **Skills:** `nestjs-expert`, `api-design-principles`, `error-handling-patterns`

- [ ] **T-4** Bulk set-consent: batch provenance that fills without overwriting  (deps: T-2, T-3)
      **Scope:** `BulkConsentDto` gains `consentMethod` + `consentObtainedAt` (required when `GRANTED`) and optional `consentReference`. Replace the single uniform `updateMany` (`actors-admin.service.ts:373-376`) with a **partitioned** write inside the existing transaction: batch provenance applies **only** to actors whose `consentMethod` is `NOT_RECORDED`; already-evidenced actors get status only. Result envelope gains the preserved count.
      **Traces:** FR-3 (both bulk scenarios), NFR-6 · `design.md` DD-4, §11 R-8
      **Files:** `backend/src/actors/dto/bulk-consent.dto.ts`, `backend/src/actors/actors-admin.service.ts`, `backend/src/actors/actor-audit.service.ts`, `backend/src/test/admin-actors.e2e.spec.ts`
      **Verify:** `cd backend && npm test -- admin-actors --silent`
      **Done when:** (1) unlocking without method/date is rejected `400` with **zero** rows modified; (2) a **mixed** batch — some actors carrying `SIGNED_FORM` + their own date, some `NOT_RECORDED` — leaves the evidenced actors' method, date, **and reference** byte-identical while filling the rest, and the envelope reports the preserved count (R-8); (3) every actor in the batch ends `GRANTED` **with** provenance.
      **Not done if:** the mixed-batch test uses a batch where every actor is unevidenced — that batch cannot detect the overwrite bug and is not evidence for this task.
      **Skills:** `nestjs-expert`, `api-design-principles`

- [x] **T-5** Extend the trader taxonomy  (deps: none)
      **Scope:** Add `humanitarian`, `digital_service_provider`, `qds_producer`, `bulk_buyer` to `TRADER_TYPES`; add source aliases for the client workbook's spellings (`INGO`, `NGO/INGO`, `Digital Service Provider`, `QDS`, `cbo`, `Bulk buyer`, …). Ambiguous values stay **absent** so they quarantine.
      **Traces:** FR-4 · `design.md` §4.4, DD-7
      **Files:** `backend/src/common/normalize.ts`, `backend/src/common/normalize.spec.ts`
      **Verify:** `cd backend && npm test -- normalize --silent`
      **Done when:** each new alias resolves case- and whitespace-insensitively; unknown values still quarantine rather than defaulting; and the six pre-existing types produce byte-identical results to before the change.
      **Not done if:** an ambiguous source value was added to the alias map to raise the mapped-row count.
      **Human check required (defect class D-g):** the alias table must be read by someone who knows the dataset. A test proves the mapping is *applied*, never that it is *semantically right* — `cbo → qds_producer` is a judgement, not a fact. Surface the table at the review pause.
      **Skills:** *(none beyond repo conventions — pure data + unit tests)*

- [ ] **T-6** Template columns, version bump, and per-row import enforcement  (deps: T-2, T-5)
      **Scope:** Four columns in `TEMPLATE_COLUMNS` (allowed-value lists derived from the Prisma enums, never re-typed); bump `TEMPLATE_VERSION` to `v2`; regenerate the committed asset; parse the columns in `actor-import.service.ts` and call the T-2 predicate **per row** inside `applyConsentGate`, keeping the existing file-level `acknowledged`.
      **Traces:** FR-5, NFR-3, NFR-4 · `design.md` §4.2, DD-5
      **Files:** `backend/src/common/template-columns.ts`, `backend/src/actors/actor-import.service.ts`, `frontend/public/templates/actor-import-template.xlsx`, `backend/src/common/template-columns.spec.ts`, `backend/src/common/generate-template.spec.ts`, `backend/src/test/admin-actor-import.e2e.spec.ts`
      **Verify:** `cd backend && npm run generate:template && npm test -- "template|import" --silent`
      **Done when:** (1) the committed asset matches a fresh generation byte-for-byte; (2) the Instructions sheet lists allowed values for each new enum column; (3) a row asserting `GRANTED` without row provenance fails **that row only**, with neighbours committing normally (preserves QA-9); (4) a `v1` template is rejected with a re-download message, not an opaque parse error.
      **Not done if:** allowed-value lists were hand-typed rather than derived from the canonical constants (NFR-3), or `TEMPLATE_VERSION` was left at `v1`.
      **Skills:** `nestjs-expert`

- [x] **T-7** Close the public boundary  (deps: T-1)
      **Scope:** Add `NEVER_PUBLIC_FIELDS` to `pii-consent.policy.ts` covering the four new fields **plus** the already-never-public `traderId`, `gpsAltitude`, `gpsAccuracy` (which today are documented only in prose). `PII_ALLOWLIST` unchanged. Extend `pii-boundary.spec.ts` to iterate the union across every public path.
      **Traces:** FR-7, FR-8, NFR-1 · `design.md` §4.5, §6, DD-6
      **Files:** `backend/src/common/pii-consent.policy.ts`, `backend/src/common/pii-consent.policy.spec.ts`, `backend/src/test/pii-boundary.spec.ts`, `frontend/lib/dashboard/csv.test.ts`
      **Verify:** `cd backend && npm test -- "pii" --silent && cd ../frontend && npm test -- csv --silent`
      **Done when:** zero occurrences of any `NEVER_PUBLIC_FIELDS` name **or its value** appear in the response body of `/actors`, `/actors/:id`, `/metrics`, asserted end-to-end over HTTP; and the public dashboard CSV likewise contains none.
      **Scope correction (2026-08-03, approved by JuanCode mid-execution):** this criterion originally also named `/actors/geo`. That endpoint **does not exist** in `backend/src` — it is a *planned* feed documented only in `docs/trd/trd.md` QA-1/QA-6. Independently verified twice. The surface it was meant to protect is covered anyway: the public map consumes `/actors`. See `requirements.md` FR-8's scope-correction note. Mirrors the FR-7 precedent in the same spec.
      **Not done if:** `PII_ALLOWLIST`'s contents changed (DD-6 — it means *PII*, and `registrationSource` is not PII), or the assertion checks only field names and not values.
      **This is a hard release gate (NFR-1).**
      **Skills:** `nestjs-expert`

---

## Phase C — Admin UI

- [ ] **T-8** Surface source and consent in the admin actors table  (deps: T-3)
      **Scope:** Extend the client types in `lib/api/actors-admin.ts`; add **Source** and **Consent** (status chip + method caption) columns; add both filters, URL-synced via the repo's query-param routing pattern.
      **Traces:** FR-1, FR-2, FR-6, FR-9, NFR-5, NFR-8 · `design.md` §5
      **Files:** `frontend/lib/api/actors-admin.ts`, `frontend/components/admin/ActorsTable.tsx`, `frontend/app/(admin)/admin/actors/page.tsx`, plus their `.test.tsx`
      **Verify:** `cd frontend && npm test -- "ActorsTable|actors/page" --silent`
      **Done when:** filtering `consentStatus = GRANTED` **and** `consentMethod = NOT_RECORDED` returns exactly the legacy unevidenced set (**this is FR-9's enumeration mechanism**); filter state survives a reload via the URL; `jest-axe` clean.
      **Not done if:** any color or radius is hardcoded instead of using `docs/ux-ui/design.md` §7 tokens (NFR-8), or the new columns are dropped rather than scrolled below `md`.
      **Human check required (defect class D-h):** `jest-axe` sees DOM semantics and contrast, **not** column crowding. Two more columns on an already-dense table needs a human or T6 look at `md` and `lg` before this is called done.
      **Skills:** `ui-ux-pro-max`, `tailwind-design-system`, `vercel-react-best-practices`, `react-doctor`

- [ ] **T-9** Add the Consent & provenance fieldset to the actor form  (deps: T-3, T-8)
      **Scope:** New grouped fieldset (status · method · date · reference) in `ActorForm.tsx`; extend `buildDto` and `toFormValues`; client-side FR-3 validation as **UX only**.
      **Traces:** FR-2, FR-3, FR-6, NFR-5, NFR-8 · `design.md` §5
      **Files:** `frontend/components/admin/ActorForm.tsx`, `frontend/components/admin/ActorForm.test.tsx`
      **Verify:** `cd frontend && npm test -- ActorForm --silent`
      **Done when:** selecting `GRANTED` without method or date surfaces a field-level error bound by `aria-describedby` and announced in a live region, and blocks submit; a legacy actor loads with `NOT_RECORDED` / empty date and can still be saved after editing an unrelated field.
      **Not done if:** the client guard is treated as the enforcement point — T-3's server rejection must remain independently tested (`design.md` §5, "client check is UX only").
      **Skills:** `ui-ux-pro-max`, `shadcn-ui`, `tailwind-design-system`, `react-doctor`

- [ ] **T-10** Add opt-in provenance inputs to the shared acknowledge dialog  (deps: T-4, T-9)
      **Scope:** New **optional** prop on `AcknowledgeDialog` enabling method + date inputs. Wire it **only** at the bulk-unlock call site (`admin/actors/page.tsx:686`). The import call site (`admin/actors/import/page.tsx:618`) and the single-actor call site (`ActorForm.tsx:609`) keep today's behavior unchanged.
      **Traces:** FR-3, FR-6, NFR-5 · `design.md` §5 (three-call-site table), §9, DD-4/DD-5
      **Files:** `frontend/components/admin/AcknowledgeDialog.tsx`, `frontend/app/(admin)/admin/actors/page.tsx`, `frontend/lib/api/actors-admin.ts`, `frontend/components/admin/AcknowledgeDialog.test.tsx`
      **Verify:** `cd frontend && npm test -- "AcknowledgeDialog|actors/page" --silent && npm run build`
      **Done when:** bulk unlock collects and submits method + date; **both** other call sites render with no new inputs, asserted by a test per call site; the bulk confirm copy states that actors already holding evidence will keep it (T-4's behavior made legible).
      **Not done if:** the inputs render unconditionally — that leaks redundant fields into the single-actor dialog and asks the import flow for a value it structurally cannot supply (J-2).
      **Skills:** `ui-ux-pro-max`, `shadcn-ui`, `react-doctor`

---

## Dependency Graph

```
T-1 ─┬─ T-2 ─┬─ T-3 ─┬─ T-4 ──────────────┐
     │       │       ├─ T-8 ─ T-9 ─ T-10 ─┘
     │       └─ T-6                        (T-10 also deps T-4)
     └─ T-7
T-5 ─── T-6
```

Edges: `T-1→T-2`, `T-1→T-7`, `T-2→T-3`, `T-2→T-6`, `T-3→T-4`, `T-3→T-8`, `T-5→T-6`, `T-8→T-9`, `T-4→T-10`, `T-9→T-10`.

No cycles. **T-5 and T-1 are eligible immediately** and independent of each other.

**Recommended first task: T-1** — everything except T-5 waits on it, and it is the lowest-risk way to confirm the migration story before any logic is written.

---

## PR Strategy

**~1,250 LOC — split into two chained PRs.** A single PR mixing a migration, a cross-path invariant, and three UI surfaces is not reviewable in one sitting, and the backend half is where the consent-boundary risk lives.

| PR | Tasks | LOC | Review this first |
|---|---|---:|---|
| **PR 1 — Backend** | T-1 … T-7 | ~730 | `consent-provenance.policy.ts` and its truth table (T-2), then `SCALAR_FIELDS` (T-3), then `pii-boundary.spec.ts` (T-7). Out of scope: all UI. |
| **PR 2 — Admin UI** | T-8 … T-10 | ~520 | The three-call-site handling in T-10 — the one place a shared component could regress two unrelated flows. Depends on PR 1. |

PR descriptions follow `cognitive-doc-design` review-empathy rules: what to review first, what is explicitly out of scope, link to the previous/next PR.

> **Deploy note (`design.md` §7):** PR 2 changes no contract, but PR 1 **breaks bulk unlock** until PR 2 ships. Deploy them in the same window, frontend second. Do not merge PR 1 to a live environment and leave PR 2 for another day.

---

## Verification Expectations

| Package | Command |
|---|---|
| `backend/` | `cd backend && npm test -- --silent` · `npx eslint "{src,test}/**/*.ts" --quiet` · `npm run build` |
| `backend/` (e2e) | `cd backend && npm run test:e2e -- --silent` |
| `frontend/` | `cd frontend && npm test -- --silent` · `npm run lint` · `npm run build` |

**Failure output prints complete and verbatim** — a summary line is for green runs only; a failure's full output *is* the evidence the Reviewer audits.

**Release gates:** `src/test/pii-boundary.spec.ts` and `src/test/lambda-handler.e2e.spec.ts` green. The latter matters here because DTO changes cross the serverless-http body-parsing path that supertest does not exercise.

**Inconclusive is a legitimate report.** If a verification cannot distinguish pass from fail — a flaky suite, a measurement whose spread exceeds what it measures — report it as inconclusive with the spread. Never collapse it into a pass because the command exited `0`.

---

## Execution Conventions

- Commits: `[SPEC:actors/registration-source-and-consent] <message>`.
- Evidence before checkbox: append the Reviewer's PASS to `execution.md` **first**, then flip `tasks.md` to `[x]`, then commit.
- No task may introduce a new PII field without it being declared in `requirements.md`. **This spec declares none** — the four new fields are admin-only via `NEVER_PUBLIC_FIELDS` (DD-6), and `PII_ALLOWLIST` must not change.
- Migrations: rehearse on local docker MySQL first; RDS via `npx prisma migrate deploy` with `DATABASE_URL` composed **in-process** from Secrets Manager. Never run `migrate-seed.sh` whole against a live DB — it also seeds.
- All AWS commands `--profile IBD-DEV`, region `eu-west-1`.
- **Budget tripwire:** 10 tasks / ~1,250 LOC / ~12 review rounds. Exceeding it is information, not failure — the Leader **stops and escalates** rather than continuing silently.
