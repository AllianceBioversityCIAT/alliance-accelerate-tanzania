# Execution Log — Public Self-Registration (chunk 3a, applicant flow)

## Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/actors/public-self-registration/` |
| Traces | `requirements.md` FR-1…FR-8, FR-14, FR-15 (25 scenarios) · `design.md` revision 3 · `tasks.md` (23 tasks) |
| Approval Mode | **gated** (`requirements.md` §Document Control) — the Leader pauses for the user after every task |
| Budget tripwires | **>23 tasks**, **>~7,300 LOC**, or **>37 review rounds** — any one halts and escalates (`design.md` §10.1) |
| Triad | Leader (T1) → Implementer (T2, `.claude/agents/akili-implementer.md`) → Reviewer (T3, `.claude/agents/akili-reviewer.md`) |
| Baseline commit | `cf9d526` |
| Log opened | 2026-08-05 |

### Environment facts established at run start (2026-08-05)

- **Node** v22.12.0 (contract requires 20+ — met).
- **Database:** `backend/.env` `DATABASE_URL` points at the **shared dev RDS** instance, not a local container. `docs/infrastructure.md` §6 sanctions this as a legitimate local-route database choice. Verified before any task ran: reachable, **4 migrations applied, no drift** (`Database schema is up to date!`). Local port 3306 is closed; the Docker daemon is up but unused.
- **Consequence carried into every migration task:** the datasource is a *shared* resource. Implementers are briefed that a Prisma reset/drift prompt is an **abort-and-report** condition, never something to answer.

### Adjudications made by the Leader before execution

| # | Issue | Ruling |
|---|---|---|
| L-ADJ-1 | `design.md` §2.4, §2.5, §2.6 describe widening `ActorAuditAction` (`REGISTRATION_APPROVE`/`REGISTRATION_REJECT`) and adding two `ActorAuditService` methods. Those sections were written **pre-split** and contradict `tasks.md` T-1, whose disqualifying criterion forbids any `MODIFY` in 3a. | **`tasks.md` is authoritative.** The audit-enum widening is chunk **3b**. T-1's brief states this explicitly so the Implementer does not "faithfully" implement the stale design section. Recorded rather than silently resolved, because a future reader of `design.md` §2.4 alone would reach the opposite conclusion. |
| L-ADJ-2 | `design.md` §5.7 says *"Admin sidebar. A third `NAV_ITEMS` entry in `AdminSidebar.tsx`"*, which appeared to contradict `requirements.md` FR-1 scenario 1 (*the Register action must NOT appear in the admin shell nav*) and `tasks.md` T-15's done-criteria (*absent from the admin sidebar*). | **RESOLVED — no contradiction. The Leader's initial reading was wrong; corrected before it could cause harm.** `AdminSidebar.tsx:17-20` today holds exactly **two** `NAV_ITEMS` (Users, Actors). A *"third entry"* is therefore a **Registrations queue** link, serving **FR-9** — and FR-9 moved to **chunk 3b**. It is not the public *"Register your organisation"* action, so FR-1's prohibition is untouched. The bullet sits under a §5.7 heading labelled *(FR-1, FR-15)* only because §5.7 was written **pre-split**. **Two consequences:** (a) no Pivot is owed at T-15 — T-15 correctly adds nothing to the admin sidebar; (b) **this bullet must not be "corrected" out of `design.md`** — 3b needs it. Recorded because a plausible misreading that survives into execution produces either a spurious Pivot or the deletion of a line a sibling spec depends on. |

---

## Task Execution History

<!-- Entries are appended below in execution order. Evidence before checkbox: the Reviewer PASS is written here FIRST, then tasks.md flips to [x], then the commit. -->

### T-1 — Prisma migration: `RegistrationStatus`, `Registration` (full), `EmailVerification`

| Field | Value |
|---|---|
| **Status** | **PASS** |
| Date | 2026-08-05 |
| Implementer attempts | **1** |
| Review mode | **Parallel lens Reviewers (2)** — selected because the task touches **migrations**, a trigger for parallel mode independent of the effort dial |
| Effort assigned | `high` |
| Skills assigned | `nestjs-expert` (as listed in `tasks.md`; no deviation) |
| Requirements covered | `requirements.md` §10 (Data & Schema Impact) · `design.md` §2.1, §2.2, §2.3 |

**Effort rationale (deviation recorded).** `.agents/leader.md` names Prisma migrations as `max` work, but the tier↔effort rule forbids `max` on a T2 Implementer and requires escalating the tier instead. Resolved at `high`: `design.md` §2.2/§2.3 specify the schema as a complete field table, so this task is transcription under constraint, not architecture reasoning. The residual judgment risk — the stale audit-enum sections — was removed from the Implementer's path by adjudication L-ADJ-1 rather than by buying more reasoning.

#### Attempt 1

**Files changed**
- `backend/prisma/schema.prisma` — added `RegistrationStatus` enum (5 members), `Registration` model (17 fields incl. all 7 adjudication columns), `EmailVerification` model (7 fields). `npx prisma format` run after editing (alignment only).
- `backend/prisma/migrations/20260805142929_add_registration_and_email_verification/migration.sql` — new, generated, not hand-edited.

**Verification (Implementer)**
- `npx prisma migrate dev --name add_registration_and_email_verification` — applied cleanly, no drift, no reset prompt. **See the runbook deviation below — this ran against the shared dev RDS, not a local MySQL.**
- `npm run build` — clean.
- `npx eslint "{src,test}/**/*.ts" --quiet` — clean.
- `npm test -- --silent` — **1 failed, 489 passed / 490 tests; 1 failed, 37 passed / 38 suites.** Sole failure `src/common/normalize.spec.ts` — `ENOENT: docs/specs/import-export/partner-profile-onboarding/mapping.md`. **Pre-existing and unrelated;** independently confirmed by the Leader — commit `8f781e9` renamed that file into `docs/specs/archive/2026-08-05-import-export--partner-profile-onboarding/` (git reports `R100`), leaving the hardcoded path at `normalize.spec.ts:117` stale. `pii-boundary.spec.ts` (release gate) green.
- Implementer `Not Done / Assumptions`: **none**.

**Reviewer 1 — conformance / data-model integrity lens: `STATUS: PASS`**
> The schema and generated SQL conform field-for-field to `design.md` §2.1–§2.3, honour both stated scope exclusions and the T-1 Disqualifying criterion (no `MODIFY`, no audit-enum touch), and are consistent with unedited Prisma MySQL output matching in-repo precedent.

Verified independently: all 17 `Registration` fields and all 7 `EmailVerification` fields exact on type/nullability/default/attribute; **no `submitterEmail` index**; **no lookup-bounding columns** (correctly deferred to T-11 under A-4); `ActorAuditAction` still six members at `schema.prisma:86-93`; SQL is exactly 2 × `CREATE TABLE` + 1 `UNIQUE INDEX` + 2 `INDEX` + 2 `PRIMARY KEY`, zero `DROP`/`MODIFY`/`ALTER`/`UPDATE`; `@@index([status, createdAt])` emitted as one composite in order (not split, not reduced); `reviewNote` → `TEXT`; enum inlined into the column, the correct MySQL emit — closing §2.6's C-10 Postgres-vocabulary residue.

**Reviewer 2 — security / PII-boundary / risk lens: `STATUS: PASS`**
> T-1 emits exactly the two `CREATE TABLE`s and indexes `tasks.md` requires, with no `MODIFY`, no FK, and no change to the `Actor` PII policy module or the release-gate suite. The three new PII-bearing columns are structurally unreachable from any existing read path.

Verified independently: `publishedActorId` is a plain scalar with **no `@relation`** — `Actor`'s only relation field remains `crops CropsOnActors[]` (`schema.prisma:60`), and Prisma requires both sides, so no `Actor`-scoped `include` can traverse into `Registration`; migration emits no `FOREIGN KEY`/`CONSTRAINT`. `PII_ALLOWLIST`/`NEVER_PUBLIC_FIELDS` unmodified (`pii-consent.policy.ts:31-68`) — correct per `design.md` §2.7. `emailVerifiedAt` genuinely `NOT NULL` with no `DEFAULT`. `codeHash VARCHAR(191)` is the only code-bearing column; no plaintext-OTP column exists or is implied.

---

#### ⚠️ Runbook deviation — Leader error, recorded in full

**What happened.** T-1's Done-when says *"migration applies on **local MySQL**"*, and `backend/CLAUDE.md:14` requires migrations be *"rehearse[d] locally first (docker `accelerate-mysql` on localhost:3306)"*, with line 15 reserving RDS for `npx prisma migrate deploy` and `DATABASE_URL` **composed in-process** from Secrets Manager — *"Never write the URL to a file or print it."*

The migration was instead applied to the **shared dev RDS** via `migrate dev`, reading `DATABASE_URL` from `backend/.env`.

**Whose error.** The **Leader's**, not the Implementer's. At Step 2.1 the Leader ran the environment pre-check, saw `.env` pointing at dev RDS, saw `docs/infrastructure.md` §6 list *"a dev RDS instance"* as a legitimate local-route database, and briefed the Implementer accordingly — **without reading the migration-specific runbook in the child guide, which narrows that general permission.** Per root `CLAUDE.md` §Module Guides, a child guide *"add[s] to or narrow[s]"* the root rules; `backend/CLAUDE.md:14` is the more specific rule for migrations and should have won. The Implementer executed the brief exactly as written.

**What it cost.**
- `migrate dev` reads the URL from a file and **provisions a shadow database** on the target server — two behaviours the runbook exists to keep off RDS. Both completed without incident, but were authorised without that being understood.
- The rehearse-locally-first ordering is **unrecoverable for this migration** — it is already applied to shared dev infrastructure.
- Not newly caused: `.env` already contained the RDS URL before this session.

**What it did not cost.** The artifact is sound. RDS is MySQL 8, the migration applied cleanly, and two independent lens Reviewers confirmed the DDL. The *substantive* Done-when properties (applies to a real MySQL, client types compile, correct SQL shape) are evidenced and doubly audited; the unmet clause is the word **local**.

**Standing condition this exposes — affects every remaining migration task.** This checkout has **no local MySQL** (port 3306 closed; the Docker daemon is up but no `accelerate-mysql` container is running). The runbook's mandated rehearsal step is therefore **not currently performable as written**, and `.env` has been pointed at shared dev RDS in its place. This will recur at any later task needing a migration (**T-10** may need one for the A-4 reference-allocation object; **T-11** may need one for the L-* lookup-bounding columns). **Escalated to the user for a policy decision before Phase B rather than re-decided per task.**

**Ruling.** Task marked `[x]`: the deliverable passed two independent audits and the substantive criteria are met. The deviation is recorded here as a process failure rather than absorbed silently, and the remediation is the user's call, not the Leader's.

---

#### ADVISORY findings (recorded; never gate, never become tasks in this spec)

From Reviewer 1:
- **R1-A1** — the runbook deviation above (raised by the Reviewer, adjudicated by the Leader).
- **R1-A2** — the pre-existing red suite will shadow every later backend task: *"a standing 1-failure baseline is exactly the condition under which a **new** failure gets waved through as 'the known one'."* T-7…T-13 all verify with `npm test`.
- **R1-A3** — no index supports OTP-row expiry/purge. `EmailVerification`'s only index is `[email, createdAt]`; a sweep on `expiresAt`/`consumedAt` would table-scan, and `createdAt` is not the leading column so it cannot serve a `createdAt < cutoff` range either. Matches `design.md` §2.3 exactly, so out of T-1's scope — flagged for whoever owns OTP-row retention, **which no current task does**.

From Reviewer 2:
- **R2-A1** — the new schema comments are **normative, not descriptive** (`codeHash`: "Plaintext never stored, never logged"; `payload`: "never spread into a public response"; "a Registration row exists only once the code has been verified"). None is schema-enforceable and none has an implementation yet. They mirror `design.md` wording, so they are intent, not false claims — but **T-7 / T-10 / T-11 must cite these lines back in `execution.md` as obligations discharged.**
- **R2-A2** — **`NOT NULL` enforces presence, not truth.** Any writer can pass `now()` for `emailVerifiedAt`. "A row cannot exist unverified" is only as strong as T-10's ordering (consume inside the `$transaction`, A23). **T-10's evidence must explicitly assert that no path writes a `Registration` without a consumed `EmailVerification`** — the DB will not catch that regression.
- **R2-A3** — ⚠️ **directly booby-traps T-11.** The table is `utf8mb4_unicode_ci`, so a Prisma equality filter on `submitterEmail` **already matches case-insensitively at the DB**. FR-6 requires case-insensitive comparison; a T-11 test passing through Prisma therefore proves the **collation**, not application-level lowercasing — the two are indistinguishable by outcome. **T-11 must record which layer it relies on**, or its FR-6 evidence is ambiguous. (Also noted: the `submitterEmail` comment omits "Lowercased", which `design.md` §2.2 states normatively and the `EmailVerification.email` comment does carry.)
- **R2-A4** — schemaless `payload` carries **no version marker**. Write side is bounded by T-9/T-10's DTO; the read side is not, and 3b reads payload fields for display and publication from rows written under whatever DTO version was current at submission. `consentPolicyVersion` is versioned; the payload shape is not. Cheap remedy at T-10, **no migration**: embed a schema-version key inside the JSON.
- **R2-A5** — sizing fine: `reviewNote TEXT` (~64KB) adequate for the FR-13 note returned via FR-6; `rejectionReason VARCHAR(191)` suits a fixed-set structured value.
- **R2-A6** — retention (OQ-3): nothing foreclosed, one asymmetry worth pricing. Hard delete unobstructed (no FK either direction; FK-less `publishedActorId` means purging a rejected registration cannot touch a published `Actor`). Anonymise-in-place works only via sentinels — `payload` (JSON NOT NULL) overwritten with `{}`, `submitterEmail` with a tombstone; neither can be set NULL without a future `ALTER`. So **"redact in place" costs zero migrations and "null out the PII" costs one** — not equal-cost answers, worth stating to whoever resolves OQ-3. A `WHERE status='REJECTED' AND createdAt < :cutoff` sweep is well served by `@@index([status, createdAt])`.
- **R2-A7** — **stale spec residue, not a diff defect.** `requirements.md` §10's fifth table row still asserts *"`Registration` — lookup bounding | Additional columns bounding lookup attempts **per reference**"*, which `design.md` §2.2 supersedes (a reference-keyed counter fails **L-3** — RA3) and which `tasks.md` T-1 defers to T-11 under A-4. The diff correctly follows design/tasks. **Correct at T-11 so it does not resurface as a conformance argument against a later task.**

**Decisions made**
1. **L-ADJ-1 applied** (see Document Control): `design.md` §2.4/§2.5/§2.6's `ActorAuditAction` widening is chunk 3b and was excluded from the brief, with both Reviewers instructed not to report its absence as a gap and to FAIL if it *were* present. Both independently confirmed the audit enum untouched.
2. Parallel lens review chosen over the single-checklist default, on the migrations trigger.

**Issues encountered**
- Both Reviewers went idle without delivering their verdicts and had to be re-prompted via `SendMessage`. Harness behaviour, not a work defect; no rework attempt consumed. Noted in case it recurs — a verdict the Leader cannot see is indistinguishable from an unfinished review.

**Final verification result:** PASS on attempt 1, two independent lens Reviewers, zero rework rounds consumed.

---

### T-14 — Widen the trader taxonomy to ten across four files

| Field | Value |
|---|---|
| **Status** | **PASS** |
| Date | 2026-08-05 |
| Implementer attempts | **1** |
| Review mode | **Lens checklist** (single Reviewer) — effort `medium`, no security / migration / data-loss surface |
| Effort assigned | `medium` |
| Skills assigned | `tailwind-design-system` |
| Requirements covered | **FR-15** (scenario: *All ten types are available and labelled*) · contributes to **FR-2**'s trader-type scenario (completed by T-17) · **NFR-6**, **NFR-7**. Closes chunk 1's carried-forward open item **R-3**. |

**Skill deviation (recorded).** `tasks.md` T-14 lists `tailwind-design-system` + `vercel-react-best-practices`. The Leader **dropped `vercel-react-best-practices`**: the task is a type union plus three lookup maps and a literal array, with no React performance, bundle, or data-fetching surface for that skill to act on. `tailwind-design-system` was retained as the load-bearing one — the risk in this task is token/purge correctness, which is exactly its domain.

**Ran in parallel with T-1.** Independence justified against `.agents/leader.md` §Directory boundaries: `backend/prisma/` vs `frontend/lib` + `frontend/components/map` — disjoint directories, separate `node_modules`, separate build outputs, separate test commands. No contention observed.

#### Attempt 1

**Files changed**
- `frontend/lib/api/actors.ts` — `traderType` union 6 → 10
- `frontend/lib/content/roles.ts` — `ROLES` 6 → 10 (labels + `colorToken`), token-rationale docblock extended
- `frontend/components/map/RoleBadge.tsx` — **both** `ROLE_BG_CLASS` and `ROLE_CSS_VAR` 6 → 10, purge-safety docblock extended
- `frontend/components/map/MapLegend.tsx` — `TRADER_TYPES` 6 → 10
- `frontend/lib/content/roles.test.tsx` — **new**, 5 `it` blocks asserting totality on all four maps

**Verification (Implementer)**
- `npm test -- roles` — all pass *(see ADVISORY 3 — the reported suite/test count does not reconcile)*
- `npm run build` — clean; type-checks the widened union; static export succeeds (20/20 pages)
- `npm run lint` — clean (3 pre-existing unrelated `next/image` warnings in admin test files)
- Implementer `Not Done / Assumptions`: **none**, with one flagged copy judgment (label wording — see Decisions 2)

**Reviewer — lens checklist: `STATUS: PASS`**
> The taxonomy is widened correctly and totally across all four maps, every added token is a real, purge-safe, `docs/ux-ui/design.md` §7-defined token (verified directly in `tailwind.config.ts` and `globals.css`, closing the gap the test's `not.toBe('bg-muted')` assertions structurally cannot), and the four new keys match `normalize.ts` spellings exactly.

**The headline check the Leader directed, and its result.** The Implementer's suite asserts the four new values are `not.toBe('bg-muted')` / `not.toBe('--color-muted')` — assertions that **pass identically on a token that does not exist**, which is the C-6 silent-degrade failure mode wearing a different mask. The Reviewer therefore verified each token *directly against source* rather than through the test:

| Class / var | `tailwind.config.ts` | `globals.css` | `docs/ux-ui/design.md` §7 |
|---|---|---|---|
| `bg-highlight` / `--color-highlight` | L18-19 | L15 `#29C4A9` | L79 |
| `bg-highlight-soft` / `--color-highlight-soft` | L20 | L16 `#82C0C7` | L80 |
| `bg-crop-groundnut` / `--crop-groundnut` | L38, L41 | L41 `#8A8D2B` | L96 |
| `bg-warning` / `--color-warning` | L32 | L31 `#C9821B` | L89 |

All four real. The **naming asymmetry** the Leader flagged (`--crop-groundnut` with no `color-` prefix, unlike `--color-*`) is **authoritative, not a slip**: `docs/ux-ui/design.md:96` defines it that way, matching the `--crop-sorghum` precedent — so both the new `qds_producer` entry and the pre-existing `offtaker` entry are correct. Purge safety holds: all four `bg-*` strings appear as complete literals inside the `./components/**` content glob.

**The suspected vacuous assertion — cleared.** The Leader flagged that `labelNode.closest('li')?.querySelector('span[aria-hidden="true"]')` followed by `expect(swatch?.className ?? '')` could collapse to `expect('').not.toMatch(/bg-muted/)` and pass without testing anything (the A5/KZ-002 shape). It does not: `MapLegend.tsx:65-71` places the swatch `<span aria-hidden="true">` as a sibling of the label inside the `<li>`, so the chain resolves against real markup — and `roles.test.tsx:110` asserts `expect(swatch).not.toBeNull()` **before** the className check, which forecloses the empty-string degrade. The assertion can genuinely fail.

**Totality of the one map the compiler does not protect.** `ROLE_BG_CLASS` and `ROLE_CSS_VAR` are `Record<TraderType, …>`, so widening the union first made them compiler-enforced. `TRADER_TYPES` in `MapLegend.tsx` is a plain array and is **not** — it is proven behaviourally instead, by rendering `MapLegend` and reading its output; `getByText` throws on a missing label, so the test fails if the array drops a type. The Disqualifying clause (*"Assert all four maps"*) is satisfied.

**Backend spelling parity:** all ten keys match `backend/src/common/normalize.ts:207-218` exactly, same order.

**KZ-004 two-direction sweep — independently spot-checked.** Grepping `informal_trader` outside test files returns only the four changed files. Every downstream surface derives from `ROLES` dynamically — `ActorForm.tsx:798`, `admin/actors/page.tsx:672`, `DashboardFilters.tsx:187`, `DirectoryFilters.tsx:129`, `FilterControls.tsx:130`, plus `roleLabel()` in `ActorsTable`, `ShortlistTable`, `ActorTypeChart`, `ActiveFilterChips`. **FR-15's "every other surface reading it" is genuinely closed by this one edit** — no fifth consumer needs action.

**Decisions made**
1. **`LeafletMap.tsx:67` — the Implementer's conclusion was right; its reasoning was wrong, and the record carries the corrected version.** The Implementer left `ROLE_CSS_VAR[actor.traderType as TraderType] ?? '--color-muted'` in place, reasoning it is now *unreachable dead code* because `ROLE_CSS_VAR` is total. **That reasoning does not hold.** The `as TraderType` cast launders an API response the compiler does not constrain; if the backend ever adds an eleventh trader type, the lookup returns `undefined` and the fallback fires at runtime. **It is recorded here as a live runtime drift guard, not as dead code** — because if the Implementer's rationale were what landed in this log, a future cleanup task would delete a reachable guard on that authority. Correct action, corrected rationale.
2. **Label wording accepted as a copy judgment, not a spec conformance question.** No spec document mandates the four new labels verbatim — only the token mapping is specified. The Implementer chose "Humanitarian / INGO", "Digital Service Provider", "QDS Producer", "Bulk Buyer" for consistency with `normalize.ts`'s alias comments. Acceptable because `requirements.md` designates the mockup **copy-provisional**. Carried to the copy pass, with ADVISORY 5's semantic gap attached.
3. Single-Reviewer lens checklist rather than parallel lenses — the mode table's parallel triggers (effort `xhigh`/`max`, or security / migrations / data-loss surfaces) are all absent here.

**Issues encountered**
- The Reviewer went idle without delivering its verdict and had to be re-prompted via `SendMessage` — the same harness behaviour seen on both T-1 Reviewers. No rework attempt consumed.

#### ADVISORY findings (recorded; never gate, never become tasks in this spec)

- **T14-A1** — `LeafletMap.tsx:67` rationale. **Actioned in Decisions 1 above** rather than left as an advisory, because the risk was specifically that the wrong rationale would enter this record.
- **T14-A2** — **`frontend/components/map/MapLegend.test.tsx` is now stale.** Its docblock (L7) and test name (L22) both say *"6 actor roles"*. It does **not** fail — six individual `getByText` calls, no count assertion — but the file named for `MapLegend` now misinforms the next reader about the legend's size. Outside T-14's file list; a one-line follow-up.
- **T14-A3** — **evidence discrepancy, unreconciled.** `npm test -- roles` was reported as *"2 suites, 17 tests"*, but only one project file matches the path pattern `roles` (`frontend/lib/content/roles.test.tsx`, 5 `it` blocks). The Reviewer verified the diff by reading source and cannot run a suite; the Leader did not re-run it (the tree was not quiet). **Non-substantive but explicitly not reconciled** — recorded rather than rounded off, per the Verification Expectations rule that an inconclusive result is a legitimate outcome and must be reported as one.
- **T14-A4** — **route swatch distinguishability to DC-16.** `--color-highlight` (`#29C4A9`) and `--color-highlight-soft` (`#82C0C7`) are adjacent teals rendered as 12px `h-3 w-3` circles. WCAG 1.4.1 is satisfied (swatches are `aria-hidden`; text labels carry the meaning), so this is **not** an AA failure and not a FAIL. But two near-identical teals in a ten-item legend is a legibility question jsdom cannot evaluate — it belongs with the **human check** alongside the §7 contrast note at `design.md:494`.
- **T14-A5** — **one semantic gap in the labels.** `cbo` (`normalize.ts:258`) also maps to `humanitarian`, and "Humanitarian / INGO" gives a community-based organisation no signal it belongs in that bucket. Copy-provisional, so not a violation — flagged for the copy pass.

**Final verification result:** PASS on attempt 1, one Reviewer, zero rework rounds consumed.

---

## Out-of-band repairs (not tasks of this spec)

Recorded here because they changed the conditions every later task runs under, and a reader of this log would otherwise not know why the verification baseline moved. **Neither is a task of this spec**, neither carries a task number, and both were explicitly approved by the user at the wave-1 pause. Committed separately as `b359fb5`.

1. **`backend/src/common/normalize.spec.ts` — stale path repaired.** It read `docs/specs/import-export/partner-profile-onboarding/mapping.md`, which commit `8f781e9` renamed into `docs/specs/archive/2026-08-05-import-export--partner-profile-onboarding/` (git reports `R100`). `backend/` therefore sat at a standing **1-test ENOENT failure** before this spec's execution began. *That commit's own message cites **KZ-004*** — the archive move corrected the documents and left the test quoting the old path, which is KZ-004's exact failure shape occurring inside the commit that standardised KZ-004. Repaired because **every backend task in this spec verifies with `npm test`**, and a permanently red baseline is precisely the condition under which a *new* failure is waved through as "the known one".
2. **`backend/CLAUDE.md` + `backend/AGENTS.md` § Data & migrations — amended to describe reality.** The guide mandated rehearsing migrations on a local docker MySQL before RDS. Most checkouts here have **no local MySQL**, and `.env` points at the shared dev RDS that `docs/infrastructure.md` §6 explicitly sanctions — so the rule described a step nobody could perform, and was discovered only after being broken (see T-1's *Runbook deviation*). Rewritten to describe actual practice **while making the real hazards explicit**: `migrate dev` reads the URL from `.env` and provisions a **shadow database** on its target; reset/drift prompts are abort-and-report; `migrate reset` and `db push` stay forbidden against RDS. **Both mirrors updated in the same change, per KZ-004.**

**Backend baseline established.** After these repairs the Leader ran the full backend suite on a quiet tree: **38/38 suites, 490/490 tests passing** (39/39 · 496/496 after T-2). From this point in the log, `backend/` has **no known failures**, and every subsequent backend brief says so — a failure reported by any later Implementer is new by construction.

**Frontend baseline established — and a known flake found (2026-08-05, after T-16's implementation).**

Until this point **nobody had run the full frontend suite**: T-14 verified with `npm test -- roles`, T-15 with `-- Header`, T-16 with `-- home`. Each was green on its own slice, and none of them could have caught a cross-task break. The Leader ran the whole suite specifically to test the **T-15 × T-16 interaction** — both tasks add a link with the accessible name *"Register your organisation"* to the same page (T-15 puts one in the desktop nav **and** one in the mobile panel; T-16 adds a third in the landing panel), which is exactly the shape that breaks a singular `getByRole`.

| Run | Result |
|---|---|
| Full suite, 1st run | **1 failed**, 71 passed / 72 suites · 1 failed, 1013 passed / 1014 tests |
| `admin/actors/import` in isolation | **19/19 passed** |
| Full suite, 2nd run | **72/72 suites · 1014/1014 tests — all green** |

**Verdict: a pre-existing flaky test, not a regression.** The failure was `await screen.findByRole('alert')` timing out at `frontend/app/(admin)/admin/actors/import/page.test.tsx:275`. It is in the **admin** route group, which shares no import path with `components/shell/Header.tsx` or `components/home/LandingCTA.tsx`, and it passes both in isolation and on a clean re-run — a timing failure under parallel-worker load, not a logic defect.

- **Frontend baseline: 72 suites / 1014 tests, green.**
- **The T-15 × T-16 interaction question is answered empirically: no collision.** Three identically-named links to the same destination on one page break nothing across 1014 tests.
- ⚠️ **Standing condition for every later frontend task (T-17…T-22).** A red frontend run is now **ambiguous** — it may be a real defect or this flake resurfacing. That is precisely the condition the `normalize.spec.ts` repair removed on the backend side, and it cannot be removed here without fixing or de-flaking that test, which is **out of this spec's scope**. Mitigation adopted instead: every frontend brief from here carries the flake's exact signature (`page.test.tsx:275`, `findByRole('alert')`, `/only \.xlsx files can be imported/i`) so an Implementer neither burns a rework round chasing it **nor** uses it to wave through a genuine failure. **On any red frontend run, re-run before concluding** — and per the Verification Expectations rule, report an inconclusive result as inconclusive rather than collapsing it into a pass.

*(The `b359fb5` commit message carries a caveat that the `normalize.spec.ts` fix had no green run behind it, because the sandbox classifier was unavailable at the moment it landed. The confirming run above happened minutes later. The caveat is left in history as an accurate record of what was known when it was written.)*

---

### T-2 — Consent policy module + `GET /registrations/consent-policy`

| Field | Value |
|---|---|
| **Status** | **PASS** |
| Date | 2026-08-05 |
| Implementer attempts | **1** |
| Review mode | **Lens checklist** (single Reviewer) — effort `medium`; T-2 *serves* the policy, it does not *gate* on it (the consent gate is T-10), so no security/data-loss trigger applies |
| Effort assigned | `medium` |
| Skills assigned | `nestjs-expert`, `api-design-principles` (as listed; no deviation) |
| Requirements covered | **FR-3** — the mechanism behind the version-acceptance clauses. FR-3's *"Server-side acceptance is mandatory"* enforcement is **T-10**; the scroll-gate and readability clauses are **T-18**. Recorded at clause granularity per KZ-001. |

#### Attempt 1

**Files changed**
- `backend/src/registrations/consent-policy.ts` — **new.** `ConsentPolicySection`, `CONSENT_POLICY_SECTIONS` (4 ordered, placeholder-marked sections), `CONSENT_POLICY_VERSION = 'v1.0-placeholder'`, `KNOWN_CONSENT_POLICY_VERSIONS: readonly string[]` (append-only), `isKnownConsentPolicyVersion(version)`
- `backend/src/registrations/registrations.controller.ts` — **new.** `@Controller('registrations')`, one `@Get('consent-policy')`, no guards, no DTO, no DI
- `backend/src/registrations/registrations.module.ts` — **new.** Controller only, no providers
- `backend/src/registrations/registrations.controller.spec.ts` — **new.** 6 tests
- `backend/src/app.module.ts` — `RegistrationsModule` added to `imports`; existing comment extended, not rewritten

**Verification (Implementer)**
- `npm test -- registrations` — PASS, 6/6
- `npm run build` — clean
- `npx eslint "{src,test}/**/*.ts" --quiet` — clean, no output
- Full suite `npm test -- --silent` — **39/39 suites, 496/496 tests.** Against the 38/38 · 490/490 baseline above: +1 suite, +6 tests, **zero regressions**
- Implementer `Not Done / Assumptions`: **none**

**Reviewer — lens checklist: `STATUS: PASS`**
> T-2 meets every Done-when clause and satisfies the Disqualifying round-trip requirement with a genuinely falsifiable assertion; the route resolves at the contracted `/api/v1/registrations/consent-policy`, scope is exactly the four declared files plus the `app.module.ts` import, and no guard, stub, or PII surface was introduced.

**The Disqualifying clause — the round-trip, and why it is satisfied.** The clause forbids a test that only asserts a 200: it must assert *the returned version is the one the server will later accept*. The implementation asserts `isKnownConsentPolicyVersion(response.version)` where the input is **the handler's own return value**, not a second hardcoded literal. The Reviewer confirmed this is **falsifiable in both directions**: emit a literal absent from the set → red; drop the served version from the set → red. Two hardcoded `CONSENT_POLICY_VERSION` references would have passed even if the endpoint and the acceptance set silently diverged — which is exactly the drift hole DD-7 exists to close.

**Route resolution — checked statically, because the test structurally cannot.** A controller-method unit test (`new RegistrationsController()`) passes regardless of where the route actually resolves. The Leader raised this explicitly; the Reviewer verified from the bootstraps: `app.setGlobalPrefix('api/v1')` is unconditional and **identical in both entrypoints** (`main.ts:16`, `lambda.ts:24`), and every controller in the repo declares its path unprefixed (`actors`, `metrics`, `users`, `admin/actors`, `health`). So `@Controller('registrations')` is the conforming declaration and the effective path is **`/api/v1/registrations/consent-policy`**, matching `design.md` §3.1. Over-HTTP confirmation remains **T-13**'s (route enumeration) and **T-6**'s (explicit prefix assertion).

**Testing level adjudicated.** The Reviewer ruled controller-method level **sufficient for T-2**: the Done-when concerns the returned object and the predicate, the stated verify is `npm test -- registrations`, and FR-8's over-HTTP proof is explicitly T-13's — *"demanding supertest here would import T-13's obligation into T-2."* Recorded so the boundary is stated rather than assumed.

**DD-7 no-duplication verified, not assumed.** The Reviewer grepped `frontend/` and found no consent-policy content or fetch anywhere (T-18 unstarted). The server is genuinely the single source of truth today.

**Superseded-version retention — honest framing, confirmed.** Only one version exists, so the Implementer verified retention **structurally** (append-only array + a membership predicate rather than a latest-only comparison) and **said so rather than claiming it exercised**. The Reviewer judged this honest and *not* a KZ-002 presence assertion: *"A presence assertion would be `expect(KNOWN_CONSENT_POLICY_VERSIONS).toContain(CONSENT_POLICY_VERSION)` sold as proof of retention."* It also identified the tempting shortcut as a **real defect**: adding a fake superseded version to the shipped array would make the server accept a version it never issued.

**Decisions made**
1. **Mutable `CONSENT_POLICY_SECTIONS` ruled acceptable, not a defect.** The Leader flagged that the controller returns the same module-level array reference on every request in a long-lived Lambda container, while `KNOWN_CONSENT_POLICY_VERSIONS` beside it is `readonly`. Reviewer's ruling: the only exit path is Nest's JSON serialization (which copies), there is no in-process consumer, and `readonly` is compile-time only — it would not close the runtime aliasing the concern implies (that needs a deep freeze or per-request copy, over-engineering for static content). **No spec rule mandates immutability**, so it is hardening, not a violation. Carried as ADVISORY T2-A1.
2. Single-Reviewer lens checklist rather than parallel lenses — no parallel trigger applies.

**Issues encountered**
- The Reviewer went idle without delivering its verdict and had to be re-prompted via `SendMessage` — now observed on **every Reviewer in this run** (both T-1 lenses, T-14, T-2). Harness behaviour, not a work defect; no rework attempt consumed. Recorded as a pattern, since a verdict the Leader cannot see is indistinguishable from an unfinished review.

#### ADVISORY findings (recorded; never gate, never become tasks in this spec)

- **T2-A1** — type `CONSENT_POLICY_SECTIONS` as `readonly ConsentPolicySection[]` with `readonly heading`/`body`, matching `KNOWN_CONSENT_POLICY_VERSIONS` beside it and the `as const` precedent at `backend/src/common/normalize.ts:58, :218`.
- **T2-A2** — **for genuine retention coverage:** extract a two-arg pure helper (`isVersionKnown(versions, version)`) that `isKnownConsentPolicyVersion` delegates to, then test it against a fixture `['v0.9-superseded', 'v1.0-placeholder']`. This exercises retention **today** without inventing a version in the shipped set. **Natural home is T-10**, when the gate actually consumes the predicate.
- **T2-A3** — extend the placeholder tripwire to headings and to the version string (`expect(CONSENT_POLICY_VERSION).toContain('placeholder')`). The version is the strongest single marker, since resolving OQ-1 must bump it. Current test checks bodies only, and would not catch authoritative prose appended alongside a retained marker.
- **T2-A4** — ⚠️ **forward-looking trap for T-18.** FR-3's mockup progress text cites *"Keep scrolling — 2 of **6** sections read"* against the **four** sections shipped here. Content, not contract — but **T-18's progress text must derive the section count from the fetched payload, never a literal**, or it will display a count that contradicts what the user is scrolling through.

**Final verification result:** PASS on attempt 1, one Reviewer, zero rework rounds consumed.

---

### T-15 — `NavLink` variant + the nav entry

| Field | Value |
|---|---|
| **Status** | **PASS on attempt 2** (1 rework round consumed) |
| Date | 2026-08-05 |
| Review mode | Lens checklist (single Reviewer) |
| Effort | attempt 1 `medium` → attempt 2 **`high`** (rework rule: a fix that failed is usually under-thinking) |
| Skills assigned | `frontend-design`, `react-doctor`. **Deviation:** dropped `shadcn-ui` from the task's listed set — this project does not use shadcn (`tasks.md` T-17: *"no react-hook-form, no zod, no shadcn — none are in this project"*), so loading it would suggest primitives that do not exist here. |
| Requirements covered | **FR-1** scenario *"Nav entry"* (all five clauses) · NFR-5, NFR-6, NFR-7 |

#### Attempt 1 — `STATUS: FAIL`

**Files changed:** `frontend/components/shell/Header.tsx`, `frontend/components/shell/Header.test.tsx`

**Implementer verification (all green — and all blind to the defect):**
- `npm test -- Header` → 19 passed, 0 failed
- `npm run build` → 20/20 pages exported
- `npm run lint` → only the 3 pre-existing `next/image` warnings
- `npx react-doctor` → 79/100, 3 warnings, all in untouched admin files
- Implementer `Not Done / Assumptions`: none

**Reviewer FAIL finding — reproduced in full (Structured Feedback rule: passed to the next Implementer unchanged):**

> **Discovered Issue:** The **mobile** primary variant has no visible focus ring — a `primary`-coloured ring painted *inside* an element whose background is `primary`.
>
> `frontend/components/shell/Header.tsx:446` (MobileNavLink primary branch):
> `... bg-primary ... focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset`
>
> Decidable statically from token values — no DC-16 deferral applies:
> - `ring-inset` sets `--tw-ring-inset: inset`; with no `ring-offset-*` class, `--tw-ring-offset-width` stays `0px`, so the offset shadow has zero width and the ring resolves to `inset 0 0 0 2px var(--tw-ring-color)`.
> - `--tw-ring-color` = `--color-primary` = `#1F4E8C` (`globals.css:8`); the element's own background is that same `#1F4E8C`. Contrast **1:1**.
> - `focus-visible:outline-none` removes the UA fallback outline.
>
> Net: a keyboard user tabbing the mobile nav gets **zero** focus indication on the one entry FR-1 exists to make reachable. Every other `ring-inset` in this file is correct because those elements are transparent/`surface`-backed (`MobileAuth` line 205 is `border-primary` on surface; `MobileNavLink`'s default branch line 459 is `text-muted` on surface) — a primary ring is visible against `#FFFFFF`. This diff is the first `ring-inset` to land on a *filled* primary element, and it is the one case where the pattern inverts to invisible.
>
> **Violated Rule:** `requirements.md` §6 FR-1, scenario "Nav entry", clause 5 — *"IT MUST be keyboard reachable with a visible focus ring"*. Also `requirements.md:595` **NFR-5** (WCAG 2.1 AA, SC 2.4.7 Focus Visible) and `docs/ux-ui/design.md:154` — *"All interactive elements keyboard reachable with visible focus rings."*
>
> **Remediation Suggestion:** On the `MobileNavLink` primary branch **only**, give the inset ring a contrasting token: swap `focus-visible:ring-primary` → `focus-visible:ring-primary-fg` (`#FFFFFF` on `#1F4E8C` ≈ 8.6:1; token-conformant via `tailwind.config.ts:14`). Prefer this over adding `ring-offset-2` — the mobile panel is `flex-col gap-1` (4px between items), so an offset ring would crowd adjacent entries. Then add a test asserting the **mobile** occurrence (`getAllByRole(...)[1]`) does not carry `ring-primary` alongside `bg-primary`; the current test only inspects `[desktopLink]` and would not have caught this. **Do not touch the desktop branch — it is correct.**

**Leader adjudication — FAIL accepted as in-scope; rework attempt consumed.** FR-1's clause 5 is quoted verbatim in T-15's Done-when (*"keyboard reachable with a visible focus ring"*), so this is spec conformance, not an advisory. Two things make the finding unusually strong:
1. **It is invisible to all four gates by construction.** The suite asserts `expect(className).toContain('focus-visible:ring-2')`, which passes on a ring with 1:1 contrast. `npm run build`, `lint` and `react-doctor` cannot see colour relationships at all. A fully green board proved nothing about the property FR-1 actually requires.
2. **It correctly refuses a DC-16 deferral.** The Implementer routed *"is the focus ring actually visible"* to the human check — defensible in general, and `design.md:679` sanctions that routing. But a **colour collision between two known token values is decidable at review time**, and handing it to a human is how a real defect reaches a browser. The Reviewer's line (desktop = formality, mobile = decidable defect) is the correct one, and is recorded here as standing guidance for T-17…T-22, which face this judgment repeatedly.

**Reviewer's answers to the Leader's four targeted questions — three clear the diff:**
1. **No other consumer of `NAV_LINKS`.** Module-local, never exported; the only references outside the declaration are the two `.map()` call sites (`Header.tsx:333`, `:400`). The added property and widened literal type break nothing. *(Nit: the per-entry `as const` is redundant under the array-level `as const` — harmless.)*
2. **Admin-layout claim CONFIRMED by reading both layouts.** `app/(admin)/layout.tsx:34,190` imports and renders `AdminSidebar`, has no `Header` import, and builds its own inline `<header>` at line 90. `Header` is imported in exactly one place repo-wide: `app/(public)/layout.tsx:1,17`. FR-1's `BUT it must NOT appear in the admin shell navigation` holds structurally.
3. **Desktop ring is fine — a positive design read, not a concern.** Header is `bg-surface` = `#FFFFFF` (`globals.css:22`); Tailwind's default `--tw-ring-offset-color` is `#fff`, so the offset gap matches the header and the ring (`#1F4E8C`) sits against white at ~7:1. Matches the established pattern in `AuthSlot` (line 102) and the brand link (line 309). **Removed from the DC-16 list** — the colour maths is settled.
4. **The PROVEN/DEFERRED labelling is honest, but the deferral was trusted to cover more than it can.** `expect(className).toContain('focus-visible:ring-2')` asserts only that a substring exists in a class attribute — not that Tailwind generated the rule, that a ring paints, that it has contrast, or that focus reaches the element. **Not** a KZ-002 recurrence (the test name explicitly says jsdom cannot render focus visibility and routes it to DC-16). Keep the class assertions; do not read them as coverage of visibility.

**Also verified clean on attempt 1:** NFR-6 (zero hex, zero `rgb()`, zero arbitrary values; every class resolves through `tailwind.config.ts:11-16,48-53`) · NFR-7 (no SSR/ISR/route handler; file was already `'use client'`) · scope (two files; no `/register` page — correct, T-17; `AdminSidebar.tsx` untouched — correct) · **`isActive` in the primary branch is deliberate, not a defect** (`pathname.startsWith('/register')` correctly covers `register/`, `register/submitted/`, `register/status/` with no sibling producing a false positive, so `aria-current="page"` will be right once T-17 lands; omitting a *visual* active state is right for a button-styled CTA, and WCAG 1.3.1 is discharged programmatically by `aria-current`).

#### Attempt 2 — `STATUS: PASS`

Reviewed by a **fresh, independent Reviewer** — deliberately not the one that proposed the remediation, since "confirm the suggestion was followed" is trivially true and is not a review.

**The fix — one token, confined to the mobile branch:**
`focus-visible:ring-primary` → `focus-visible:ring-primary-fg` at `Header.tsx:446`. Desktop (`:272`) confirmed **byte-identical** to attempt 1.

**Contrast, resolved independently from `globals.css` (not from token names — that omission *was* the defect):**
`--color-primary-fg: #FFFFFF` (`globals.css:10`) on `--color-primary: #1F4E8C` (`:8`) = **8.31:1**. `ring-inset` with no `ring-offset-*` leaves `--tw-ring-offset-width: 0px`, so the shadow resolves to `inset 0 0 0 2px #FFFFFF`, and inset shadows paint above the background — the ring lands on top of the fill. Comfortably over SC 1.4.11's 3:1 floor. NFR-6 clean (no hex; `primary.fg` flattens to `primary-fg` via `tailwind.config.ts:14`, and `ringColor` defaults to `theme('colors')`).

> **Figure corrected (KZ-005).** Attempt 1's Reviewer suggested "≈ 8.6:1" and the Implementer repeated it. The independent recomputation is **8.31:1** (L(#1F4E8C) = 0.07632). Immaterial to the verdict, corrected because an uncross-checked number is exactly what KZ-005 exists to catch. The quoted FAIL report above is left verbatim as the historical record; **8.31:1 is the correct figure.**

**New regression test — falsifiable, with a stated limit.** Reverting to `ring-primary` turns both the negative and positive assertions red. The test also proves the mobile occurrence *exists* with the right accessible name: `const [, mobileLink]` throws `TypeError` on fewer than two matches.

> **The Implementer's stated rationale is inverted — recorded so the next reader is not taught a wrong fact.** It reasoned that a raw-string `.toContain()` check "would pass even if the bug were reintroduced". The consequence runs the other way: `'focus-visible:ring-primary-fg'` **contains** `'focus-visible:ring-primary'`, so a raw-string `not.toContain('focus-visible:ring-primary')` **false-FAILs on the corrected code** — it never false-passes on the buggy code. **The token-split remedy is nonetheless correct and necessary** (it is the only way to write that negative assertion at all). Only the explanation was backwards. The Leader repeated the inverted version to the user before this review landed and has corrected it. See ADVISORY T15-A2.

**Limit of the guard, stated plainly:** it is keyed to **token names, not resolved colours**. It would **not** catch a different colliding token — `ring-primary-hover` (`#163A66` on `#1F4E8C`) computes to ≈**1.4:1**, far under the 3:1 floor, and would pass. Nor would it catch removal of `ring-2`, nor a future edit to `--color-primary-fg`. It is a name-keyed regression guard against *this* reintroduction, not a contrast gate. That limit is spec-sanctioned — `requirements.md` §8 **DC-16** routes focus visibility and contrast to the human HITL check.

**The mobile coverage gap — adjudicated ADVISORY, not FAIL.** The Leader raised this as the headline question and forbade a hedge. Premise **confirmed**: RTL's role queries default `hidden: false` and `dom-accessibility-api`'s `isSubtreeInaccessible` checks `element.hidden` first, so with `Header.tsx:396`'s `hidden={!menuOpen}` the mobile subtree is invisible to `getAllByRole`. **Every attempt-1 test therefore ran on a 1-element result set** (`:182`, `:190`, `:200`, `:231`, `:243` — none reached mobile).

Ruled advisory on this reasoning, which the Leader accepts: `href` and tab-stop are **not properties of the mobile branch**. `href` flows from the single `NAV_LINKS` entry (`:28`) that the desktop assertion already pins, passed verbatim through to `<Link href={href}>` (`:403`, `:443`) with no transformation; tab-stop is `<a href>` default, and the primary branch (`:441-450`) sets no `tabIndex` and no `aria-disabled`. No code path lets either diverge from desktop without editing the shared source the desktop test guards — *"FAILing here demands a second assertion on a single-sourced value: test count, not coverage."* The genuinely **divergent** surface is the class string, and that is now asserted on the mobile occurrence, which is precisely where the attempt-1 defect lived. FR-1's Nav-entry clauses were verified **conformant in the mobile rendering by reading it**. The shortfall is proof strength on non-divergent properties, not non-conformance.

**Verification (Implementer, attempt 2)**
- `npm test -- Header` → **20/20** (19 baseline + 1 new)
- `npm run build` → compiled, 20/20 static pages, no new warnings
- `npm run lint` → identical 3 pre-existing `next/image` warnings, nothing new
- `npx react-doctor` → 79/100, 3 findings, all in unrelated admin files
- `Not Done / Assumptions`: **none**

**Reviewer verdict: `STATUS: PASS`**
> The attempt-2 fix is correct and confined — `focus-visible:ring-primary-fg` resolves to a 2px inset `#FFFFFF` ring at 8.31:1 over the `#1F4E8C` fill, closing the FR-1 "visible focus ring" / NFR-5 (SC 2.4.7, 1.4.11) defect, with the desktop branch untouched and NFR-6 token conformance intact. The mobile-coverage gap is a proof-strength shortfall on single-sourced, non-divergent properties rather than an FR-1 conformance gap.

**File-wide sweep — spot-checked 5 of 8, and the Implementer's claim was overstated.** `L284`, `L309`, `L353`, `L118`, `L227`, `L235`, `L459` are clean as reported (`L459`'s `bg-border` `#E2E2E2` under a primary ring = 6.4:1). **But the sweep evaluated base-state backgrounds only.** `Header.tsx:205` carries `hover:bg-primary` *together with* `focus-visible:ring-primary focus-visible:ring-inset` — **the identical 1:1 inset-ring-on-fill collision in the combined hover+focus-visible state.** Pre-existing, untouched by this diff, out of T-15's scope — but *"no other same-colour collisions"* is **not** an accurate summary of the sweep. See T15-A4.

#### ADVISORY findings (recorded; never gate, never become tasks in this spec)

- **T15-A1 — the one worth acting on, escalated to the user rather than actioned.** `focus-visible:ring-2` is **unasserted on the mobile branch**: dropping it would restore an invisible mobile ring *with a green suite* — the same defect class just fixed. The Reviewer's remedy is two lines in the existing test (`expect(classes).toContain('focus-visible:ring-2')` and `expect(mobileLink).toHaveAttribute('href', '/register')`), which would close FR-1's mobile clauses completely. **Not actioned by the Leader:** the methodology is explicit that an advisory is recorded and dies there — it may not trigger rework and may not widen an approved task. Surfaced to the user as a candidate follow-up so the decision is theirs.
- **T15-A2** — `Header.test.tsx:222-224`'s comment states the substring failure mode backwards (see the boxed note above). Reword; the token split itself is right.
- **T15-A3** — contrast figure corrected to **8.31:1** (applied above).
- **T15-A4 — pre-existing defect, out of scope, genuinely worth its own work.** `Header.tsx:205` (`MobileAuth` "Staff sign-in") reproduces the same inset-ring-on-primary-fill collision in the hover+focus-visible state. Not introduced here and not editable under T-15's scope.
- **T15-A5 — pre-existing, out of scope.** Account-menu items `:159`, `:169`, `:181` indicate focus **solely** via `focus-visible:bg-surface-alt` (`#F7F7F7` on `#FFFFFF` ≈ **1.05:1**) with `focus-visible:outline-none` — a near-invisible focus indicator. Outside the sweep's `ring-*` scope. Route to the DC-16 HITL pass.
- **T15-A6** — `const [, mobileLink]` couples to DOM order, but **fail-safe**: a reorder turns the test red (desktop carries `ring-primary`), never falsely green. `within(document.getElementById('mobile-menu'))` would be sturdier.
- **T15-A7** — T-15's *"reads as an action"* clause and focus **visibility** remain **HITL-only** per DC-16. Do not record them as covered by the automated gates.

**Final verification result:** **PASS on attempt 2.** 2 Implementer attempts, 2 Reviewers (one per attempt, second one fresh for adversarial independence), **1 rework round consumed**.

---

### T-16 — Landing CTA panel

| Field | Value |
|---|---|
| **Status** | **PASS** |
| Date | 2026-08-05 |
| Implementer attempts | **1** |
| Review mode | Lens checklist (single Reviewer) |
| Effort assigned | `medium` |
| Skills assigned | `frontend-design`, `ui-ux-pro-max` (as listed; no deviation) |
| Requirements covered | **FR-1** scenario *"Landing CTA"* — all three clauses · NFR-6, NFR-7 |

#### Attempt 1 — `STATUS: PASS`

**Files changed**
- `frontend/components/home/LandingCTA.tsx` — **new.** `<section className="bg-surface-alt py-16" aria-labelledby="landing-cta-heading">`, `<h2>`, body copy, `<Button variant="primary" href="/register">`
- `frontend/components/home/LandingCTA.test.tsx` — **new.** 4 tests
- `frontend/app/(public)/page.tsx` — `<LandingCTA />` inserted between `<Hero />` and `<MetricsBand />`

**The copy (verbatim) — this is the deliverable, not the panel:**
> Seed companies, cooperatives, offtakers, and other seed-system actors can add themselves to the registry. **Every submission is reviewed by the ACCELERATE team before it is published**, so nothing you send goes live automatically.

**Verification (Implementer):** `npm test -- home` → 12 suites / 91 tests · `npm run build` → 20/20 static pages · `npm run lint` → clean (3 pre-existing `next/image` warnings only) · `Not Done / Assumptions`: **none**.

**Reviewer verdict: `STATUS: PASS`**
> FR-1's "Landing CTA" scenario is fully discharged — all three clauses stated in copy, action links to `/register`, and test (c) is a real behavioural assertion that fails if the review fact is stripped, closing T-16's Disqualifying clause.

**The Disqualifying clause — satisfied.** *"Asserting the link exists does not cover the clause… Assert the copy."* Test (c) asserts the review sentence directly; the Reviewer confirmed the target scenario is covered — **strip the review sentence but keep the link and test (c) goes red while the others stay green.** That is the precise discrimination the clause demands.

**`getByText` verified to pass for the right reason.** The `<p>` body is a single JSX text child spanning four source lines; the transform trims each line and joins with a single space into **one text node**, which RTL's normalizer then collapses. Both regexes **span a source newline**, which is exactly the case that would fail if the collapse did not happen — so they are self-demonstrating rather than accidentally matching. Keying to exact copy is correct here: the clause is legally motivated, and brittleness is the feature.

**No D-10 overreach.** The trailing *"so nothing you send goes live automatically"* **restates** the review fact rather than adding a promise: it asserts only the absence of auto-publication, which is exactly what 3a implements. It promises no timeline, no reply, and no information-request round-trip, so it touches neither D-10 nor T-20's Disqualifying clause (both of which concern the *receipt* promising chunk 4's link-back).

**T-15 × T-16 interaction — cleared both empirically and analytically.** Three links now carry the accessible name *"Register your organisation"* on `/` (desktop nav, mobile panel, landing panel). The Leader ran the **full frontend suite: 72/72 suites, 1014/1014 green** (see the baseline section above). The Reviewer's static analysis agrees and explains why: no test composes `Header` with the home page, all `Header.test.tsx` queries use `getAllByRole`, and no test imports `app/(public)/page.tsx` at all. **On a11y:** identical accessible name **plus identical destination** is conformant — WCAG 2.4.4 requires purpose be determinable from the name, and identical-name/identical-`href` is precisely the case excluded from the "same text, different destinations" failure; axe's `identical-links-same-purpose` passes when destinations match. At most two are in the a11y tree at once (desktop nav is `hidden md:flex`; the mobile panel is `hidden` until the hamburger fires).

**`Button` cleared — and it is the structural opposite of the T-15 defect.** `Button.tsx:78-86`'s `'href' in props` branch returns a `next/link` `<Link>` (static-export compliant). Its ring is `ring-primary` with **`ring-offset-2`** — offset, not inset. Recomputed: `#1F4E8C` vs `#F7F7F7` = **7.76:1**; vs the white offset band = **8.31:1**. Visible; clears SC 1.4.11 and 2.4.11. No advisory needed.

**Contrast recomputed independently (KZ-005).**

| Pair | Implementer reported | Reviewer recomputed |
|---|---|---|
| `text-fg` `#333333` on `surface-alt` `#F7F7F7` | 11.78:1 | **11.79:1** |
| `text-muted` `#666666` on `#F7F7F7` | 5.35:1 | **5.36:1** |

Both off by 0.01 from intermediate rounding — **arithmetic drift, not the 8.6-vs-8.31 class of fabrication.** Both clear AA for body text (`text-muted` clears AA, not AAA; AA is the bar).

**Heading hierarchy verified at source, not on trust:** `Hero.tsx:197` `<h1 id="hero-heading">` is the sole `h1`; `AboutStrip.tsx:66`, `HowItWorks.tsx:57`, `CropCoverage.tsx:60`, `PartnersStrip.tsx:31`, `ClosingCTA.tsx:105` are all `<h2>`; `MetricsBand.tsx:37-39` uses `aria-label` with no heading. The new `<h2>` keeps the hierarchy flat and valid. Placement confirmed: Hero's CTA row is `Hero.tsx:213-224` inside a `py-16 lg:py-24` grid, so the panel genuinely sits below the hero actions and requires scrolling — satisfying the scenario's `WHEN`.

**Decisions made**
1. **Judgment call accepted:** no video/poster treatment, unlike the cited exemplars `ClosingCTA`/`AboutStrip`. `design.md` §5.7 describes a plain `surface-alt` panel stating a fact, not a media strip; the exemplar was a shape reference, not a mandate to replicate its media layer. Surfaces still alternate cleanly (`#FFFFFF` → `#F7F7F7` → `bg-fg` dark, no seam).

#### ADVISORY findings (recorded; never gate, never become tasks in this spec)

- **T16-A1 — ⚠️ a real hole in the spec's own decomposition, and no task closes it.** `frontend/components/home/home-a11y.test.tsx` is the **only** page-level axe gate for the home page, and its `renderHomePage()` helper (line 101) **hand-composes** sections instead of importing `page.tsx`. T-16 added an 8th section without adding it to that helper, so **`LandingCTA` is never axe-evaluated in composition** — and `LandingCTA.test.tsx` runs no axe of its own, so the component has **no axe coverage at all**. The file's own docstring is now factually wrong about the page it claims to mirror: *"the full rendered composition (all 7 sections)"* (line 5), *"mirrors PublicLayout"* (line 93), and the section-order list (lines 96-98).
  **Why it is advisory and not a FAIL:** `tasks.md`'s NFR ownership line assigns NFR-5 to **T-17, T-18, T-22** — **not** T-16 — and T-16's Done-when contains no a11y clause. So no T-16 obligation is violated.
  **Why it still matters:** **T-22 does not close it either** — `tasks.md` T-22 is scoped to `frontend/app/(public)/register/*-a11y.test.tsx`, the three register screens only. The gap is structural, one import plus one line in the helper, and it is exactly the KZ-001 shape (a clause owned by nobody because each task's scope is individually correct). The Implementer's *"home-a11y unaffected"* is true — **and it is true because of the gap.** Escalated to the user rather than absorbed, since minting a task here is forbidden.
- **T16-A2 — deployment note.** Three live entry points now target `/register`, which **404s until T-17 ships** (`Header.tsx:28` desktop, its mobile twin, and this panel). Not a T-16 defect — the brief directed linking anyway — but the home page is **undeployable mid-spec**. Consistent with `tasks.md`'s PR strategy (*"do not deploy the frontend before PR 2's endpoints exist"*); restated here because T-16 is what makes the dead link visible on the landing page itself.
- **T16-A3** — the PROVEN/DEFERRED split is accurate. Rendered-pixel contrast, whether the copy *reads as* a compelling CTA, and visual rhythm vs the mockup are genuine DC-16 human checks. The Reviewer audited the hex-vs-hex half independently rather than inheriting the Implementer's arithmetic.

**Final verification result:** PASS on attempt 1, one Reviewer, zero rework rounds consumed.

---

### T-3 — `mail` module: `MailService`, SES transport, no-op transport

| Field | Value |
|---|---|
| **Status** | **PASS** |
| Date | 2026-08-05 |
| Implementer attempts | **1** |
| Review mode | Lens checklist (single Reviewer) |
| Effort assigned | `medium` |
| Skills assigned | `aws-serverless`, `nestjs-expert` (as listed; no deviation) |
| Requirements covered | **FR-14** (the no-op-transport half), **NFR-10**, **NFR-8**/**DC-14** (the mail-side logging half). T-20/T-21 own the applicant-visible halves of FR-14; T-4 owns the request interceptor. |

#### Attempt 1 — `STATUS: PASS`

**Files created** (`backend/src/mail/**`): `mail-transport.interface.ts` · `mail.config.ts` · `ses-mail.transport.ts` · `no-op-mail.transport.ts` · `mail-transport.factory.ts` · `mail.service.ts` · `mail.module.ts` · `templates/verification-code.template.ts` · `templates/receipt.template.ts` · four spec files.
**Dependency added:** `@aws-sdk/client-ses@^3.1077.0` in `dependencies`, matching the installed Cognito client's floor. No other add or bump.

**Verification:** `npm test -- mail --silent` → 19/19 · `npm run build` → clean · `npx eslint … --quiet` → clean, no files mutated · **full suite 43/43 suites, 512/512 tests** (from 39/39 · 496/496 — **+4 suites, +16 tests, zero regressions**).

**Reviewer verdict: `STATUS: PASS`**
> The mail module conforms to FR-14, NFR-10, NFR-8 and `design.md` §4.9; the transport-selection test is a genuine sent-vs-not-sent distinction on a shared SES mock that fails in both directions, and every logging test proves emission before proving absence.

**The Disqualifying clause — satisfied, verified by reading the test.** `mail.service.spec.ts:38-66` issues the *identical* `sendReceipt('applicant@example.org', 'REG-2026-0007')` against **one shared** `mockClient(SESClient)`, with only `MAIL_TRANSPORT` differing: `toHaveLength(0)` under `no-op`, `toHaveLength(1)` under `ses`. It fails in **both** directions. The Leader's stale-memo concern was checked and **inverts safely**: `resetMailTransport()` (`mail-transport.factory.ts:26`) clears the module-level transport and is called in `beforeEach` *and* explicitly between the halves — if it failed to clear, the `ses` half would reuse the no-op and assert 0 ≠ 1. **Staleness cannot produce a false pass here.** Counts are cumulative since the single `sesMock.reset()`, so the terminal `toHaveLength(1)` re-confirms the no-op half sent nothing (a leak would read 2).

**The log-vacuity guard — ordering confirmed present.** All three logging tests (`:108`, `:128`, `:145`) assert `totalCalls > 0` **first** (`:117-118`, `:135-136`, `:158-159`), then assert absence. `emittedText()` flattens both the `log` and `error` spies, so the failure path is covered, and the receipt test asserts the reference **is** present as a positive control (`:142`). Nothing can log a body, phone or payload field: `dispatch()` (`mail.service.ts:54-65`) emits exactly two format strings containing only `kind` and `reference ?? 'n/a'`, and no `Logger`/`console.*`/stdout call exists anywhere else under `backend/src/mail/`.

**DEP-6 honesty — met.** The SES tests assert command shape, error propagation, and config-missing-before-any-SDK-call (`sesMock.calls()` length 0). Both `ses-mail.transport.ts:29-35` and its spec header state **in writing** that they cannot prove delivery, identity verification, or sandbox/quota. Nothing asserts or implies delivery — **DC-18 respected.**

**Cold start — matches the in-repo precedent line for line.** `let client: SESClient | undefined` + lazy `getSesClient()` (`ses-mail.transport.ts:17-24`) mirrors `users/cognito-admin.client.ts:15-23`, including `resetSesClient()` as the seam mirroring `resetCognitoAdminClient()`. The seam has **no production call site** (grep: only the two spec files). One client per container.

**Module boundary clean:** `backend/src/logging/**` does not exist; nothing pre-empts T-4. `MailService`'s logger is a private field behind a single `dispatch()` call site, so T-4 swaps it by replacing one field.

---

#### ⚠️ Spec correction applied — `design.md` contradicted the requirement it traces to

**The finding.** The Implementer could not satisfy *"every message carries the reference"* and **flagged it rather than inventing a value**, typing `MailMessage.reference` as `string | undefined`. The Reviewer traced the contradiction to its root and ruled the **spec sentence wrong**, not the implementation:

- `requirements.md` **FR-14** enumerates exactly **three** messages (*"submission, approval, and rejection"*) and states explicitly: *"The single deliberate exception is FR-4's verification gate, which precedes submission … **this requirement does not cover it and must not be read as promising otherwise**."*
- `design.md` §4.9 said *"Four messages — verification code, receipt, approval, rejection — **each carrying the reference**"*, folding FR-4's code into FR-14's set.
- The contradiction is **unsatisfiable, not merely sloppy**: `design.md` §4.1 allocates the reference **inside** the submission `$transaction`, entered only after the code matches. At verification-code send time no `Registration` row and no reference exist. Carrying one would require fabricating it.

**Why `string | undefined` is right and a discriminated union is not.** The guarantee the Leader worried about — "T-10 ships a reference-less receipt undetected" — **is already unreachable**: `MailService.sendReceipt(to: string, reference: string)` (`mail.service.ts:43`) takes `reference` as a **required** parameter, `buildReceiptMessage` sets it unconditionally, and `MailMessage` is module-internal — T-10 never constructs one. A union would relocate an existing compile-time guarantee, not create one. **Carried to 3b:** keep the same shape (`sendApproval(to, reference)`, `sendRejection(to, reference, note?)`) so the rule stays compiler-enforced there too.

**No weakening of FR-5/NFR-10:** FR-5's fallback is the reference on the **receipt screen** (T-20), and NFR-10's measure scopes itself — *"The measure starts at a submitted registration, because a submission cannot be reached without the OTP (FR-4)."*

**Correction applied, with the KZ-004 two-direction sweep** across the spec folder, 3b's proposal and the epic:

| Site | State | Action |
|---|---|---|
| `requirements.md:549` (FR-14) | **Correct** — already excludes FR-4 | none |
| `requirements.md:268` | Correct — about the API *response* body (FR-5), not email | none |
| `proposal.md:96`, `:149` | **Correct** — name only the three post-submission messages | none |
| `admin/registration-review-queue/proposal.md:41` | **Correct** — approval/rejection only | none |
| `design.md:399` (§4.9) | **WRONG** | **corrected + amendment note** |
| `design.md:693` (test-plan table) | **WRONG** (unscoped "every message") | **corrected** |
| `tasks.md:33` (T-3 Scope) | **WRONG** in context | **corrected + pointer here** |

The defect was confined to `design.md` (2 sites) and `tasks.md` (1) — the design had drifted from its own parent requirement, which was right all along. **Not treated as a Pivot:** no plan, task, budget or approved scope changes; this aligns a design sentence with the requirement above it. Corrected during execution so **3b's Implementer does not re-derive the same contradiction**.

#### ADVISORY findings (recorded; never gate, never become tasks in this spec)

- **T3-A1 — 🚨 UNOWNED DEPLOYMENT GAP. The only finding in this run that can reach production. Escalated to the user.** `MAIL_TRANSPORT` and `MAIL_SENDER_ADDRESS` are wired into **nothing**: `infra/20-backend/template.yaml:55-85` defines `Environment.Variables` with DB and Cognito entries and **no `MAIL_*`**; `Policies:` (line 86) grants `GetSecretValue` only — **no `ses:SendEmail`**. The Reviewer checked **T-1…T-23: no task touches `infra/20-backend/template.yaml`**, and T-23 amends documentation only. `design.md` §7 (lines 543-545) lists three deploy obligations — SES enablement, `ses:SendEmail` on the Lambda role, `MAIL_TRANSPORT` + sender address — and **none maps to a task.**
  **Why it bites:** `getMailTransportKind()` **throws** when `MAIL_TRANSPORT` is unset (`mail.config.ts:14-22`). A 3a deploy without wiring turns the first send into a **500**, breaking T-8's *"202, empty body, always"* **in the deployed environment while every test stays green.** A decomposition gap of the KZ-001 shape, not an implementation defect. **Minting a task is forbidden by the methodology, so the user decides.**
  **One concrete trap for whoever fixes it:** do **not** add `AWS_REGION` to the template — Lambda reserves it and a template defining it **fails to deploy**. The runtime supplies it, which `getSesMailConfig()` correctly relies on.
- **T3-A2 — carried into T-7's brief.** `templates/verification-code.template.ts:17` hardcodes *"It expires in 15 minutes"*, duplicating `design.md` §4.3's OTP lifetime that **T-7 implements independently**. If T-7 picks or later tunes a different value, **the email silently lies to applicants and no test can catch it** — two unconnected literals. T-7 must export the lifetime as a constant and interpolate it here.
- **T3-A3 — carried into T-7's brief.** `MailModule` is registered nowhere and exercised by **no test** — a presence-only artifact until a consumer imports it. Scope-correct for T-3 ("both transports satisfy the interface" is proven independently of DI: `implements MailTransport` is compiler-checked, both are exercised behaviourally through `MailService`, and `MailService` has **zero constructor dependencies** so DI cannot fail). **T-7 must import `MailModule` and inject `MailService` — not `new MailService()` — or the module stays dead.**
- **T3-A4** — `NoOpMailTransport.recorded` (`no-op-mail.transport.ts:21`) grows **unbounded**. Under NFR-10 the no-op is a *production* configuration, so a warm container accumulates one `{reference, at}` per send forever, and `getRecordedSends()` has no production consumer. Negligible at ~150 expected submissions, but it is an unbounded in-memory array in a long-lived process.
- **T3-A5** — `getSesClient(region)` ignores `region` after the first call. Harmless (fixed per container) and identical to the Cognito precedent; noted only against a future multi-region change.

**Final verification result:** PASS on attempt 1, one Reviewer, zero rework rounds consumed.

---

### T-9 — `RegistrationCreateDto`, enumerated explicitly

| Field | Value |
|---|---|
| **Status** | **PASS** |
| Date | 2026-08-05 |
| Implementer attempts | **1** — plus one **runtime-failure resume** (see below). **No rework round consumed.** |
| Review mode | Lens checklist (single Reviewer) |
| Effort | first worker `medium` → resume **`high`** (a resume with partial state starts one level up) |
| Skills assigned | `nestjs-expert`, `api-design-principles`; **`systematic-debugging` added on the resume** (a live failing test with a precise symptom) |
| Requirements covered | **FR-2** scenarios 1–3 (server-side half; T-17 owns the client half) |

#### Runtime failure and resume — not a rework

The first Implementer wrote both files and was **killed mid-task by a session limit** before verifying or reporting. Per `/akili-execute`'s runtime-failure fallback this is an **environment blocker, not a work FAIL**, so **no rework attempt was consumed** and the 3-attempt ceiling is untouched.

The work was left in the tree **unverified and unreported** — the one state indistinguishable from "finished" by looking at the file list. The Leader therefore **ran the task's own verification inline** rather than assuming, and found it **red: 2 failed / 20 passed**, both failures one root cause:

```
TypeError: Cannot read properties of undefined (reading 'accepted')
  100 |     expect(result!.consent.accepted).toBe(true);
```

**That is the B33 trap firing exactly as T-9's Disqualifying clause predicted** — *"if `consent.accepted` reads `undefined` in any test, `@ValidateNested` is missing… which a happy-path test would surface but a validation-only test would not."* The happy-path test the brief insisted on **did its job**; the worker simply did not survive to act on it. The spawn was retried once (prescribed) and succeeded — the limit was scoped to that worker, not the account.

**Root cause, confirmed at source by the resumed worker:** `consent` (`registration-create.dto.ts:223`) carried a bare type annotation with **no `@ValidateNested()` / `@Type()`**, while `payload` two lines below had both. `whitelist: true` (`validation-pipe.ts:93-95`) strips any property lacking validation metadata, so `consent` was stripped to nothing. **The file's own header comment (`:211-212`) claimed *"Both nested objects carry `@ValidateNested()` + `@Type()`"* — false about the code beside it.** Fix was three lines.

#### Reviewer verdict: `STATUS: PASS`

> `RegistrationCreateDto` transcribes `design.md` §4.1's field table exactly, the `@ValidateNested()`/`@Type()` fix on `consent` is genuinely present and pinned by unweakened happy-path assertions, and the cross-field coordinate rule is correct for `0`, `null`, `undefined` and empty string — verified against the installed `class-validator` sources rather than inferred.

**The tests were NOT weakened — the central question of this review.** `:100`, `:101` and `:256` are present, unchanged, none `.skip`ped or converted to a `toBeDefined` form. They are in fact **stronger**: `:99` adds `expect(result!.consent).toBeInstanceOf(ConsentInputDto)`, which fails if `@Type()` is dropped **even when `@ValidateNested()` survives**. Relaxing these was the easy path and would have destroyed the only guard against every submission `400`-ing in production.

**⚠️ The `0`-coordinate case — the Leader's concern, and it holds.** Tanzania sits close enough to the equator that latitude `0` is not hypothetical, and `0` is falsy. Verified **at source, not reasoned about**: `class-validator`'s `IsOptional.js:20` gates on `!== null && !== undefined`, and the custom check at `registration-create.dto.ts:76` uses the same test. So lat `0` / lon `0` is **not** skipped — it validates and survives; lat `0` alone yields exactly one violation. `null` behaves identically to `undefined` at both ends. **Empty string fails safe** (`@IsNumber()` rejects it). The Reviewer additionally confirmed the two properties sharing a decorator `name` cannot collide: `register-decorator.js:23-34` mints a fresh anonymous constraint class per call and resolves by `constraintCls`, not by name.

**§4.1 field table verified row by row by the Reviewer independently** (not inherited from the report): all 11 fields conformant. The only additions over the table are `@IsString()` on `traderType`/`region` and `@IsArray()` on `crops` — **additive tightenings**; no rule inverted, no bound wrong, **no string left unbounded** (the C-13/S-5 defect that made "mirror `ActorCreateDto`" wrong). `crops` is required and **no test asserts otherwise** — the Disqualifying inversion is absent.

**S-6 exclusions clean:** no `email`, `traderId`, `consent*` provenance, `gpsAltitude` or `gpsAccuracy` on the payload. `:219-227` submits a `payload.email` and asserts it is **stripped** while the top-level OTP-verified address is untouched — and under `whitelist: true` that test genuinely fails if anyone later adds a *decorated* payload `email`.

**Pipe fidelity:** tests use `createValidationPipe()` driven via `pipe.transform(body, {type:'body', metatype: RegistrationCreateDto})` — the router's actual per-argument call. **The hand-built-pipe defect that T-12 exists to correct in `pii-boundary.spec.ts` is not reintroduced here.**

**Verification:** `npm test -- registration-create` → **22/22** · `npm run build` clean · `eslint --quiet` clean · **full suite 44/44 suites, 534/534 tests** (from 43/43 · 512/512 — +1 suite, +22 tests, **no regressions**). `Not Done / Assumptions`: **none**.

#### Leader error corrected by the Implementer — recorded

The Leader's brief instructed importing `CROP_NAMES` from `backend/src/common/normalize.ts`. **That was wrong.** The Implementer checked rather than complied, found `CROP_NAMES` declared at `actors/dto/admin-actor-create.dto.ts:16`, and imported from the real source instead of re-declaring it. Verified independently by the Leader: `normalize.ts` exports only `CANONICAL_REGIONS`, `DISTRICT_TO_REGION`, `TRADER_TYPES`. **`design.md` §4.1's own opening paragraph already records this** (*"`crops`/`CROP_NAMES` are on `AdminActorCreateDto`"*) — the spec was right and the brief introduced the error. Recorded because an Implementer that verifies its brief against the source, rather than complying with it, is the behaviour this process depends on.

#### ADVISORY findings (recorded; never gate, never become tasks in this spec)

- **T9-A1 — a test that can never fail.** `registration-create.dto.spec.ts:215-217` asserts no `email` property exists via `Object.getOwnPropertyNames(new RegistrationPayloadDto())`. `backend/tsconfig.json` targets **ES2021** with `useDefineForClassFields` off, so uninitialized field declarations emit **no own instance properties** — the array is `[]` regardless. **It would pass even if `email!: string` were declared on the payload.** S-6 is genuinely covered by the sibling stripping test at `:219-227`; this one is a tautology that invites false confidence. Delete it or rewrite against `getMetadataStorage()`. *(A KZ-002 shape that survived two workers and a Reviewer's first pass.)*
- **T9-A2 — `CROP_NAMES` public→admin coupling: acceptable, keep it.** The direction is unclean, but re-declaring the catalog would be worse. The repo already carries independent crop literals in `common/template-columns.ts`, `actors/dto/list-query.dto.ts` and `metrics/metrics.service.ts`. The real fix is relocating `CROP_NAMES` to `common/normalize.ts` beside `TRADER_TYPES`/`CANONICAL_REGIONS` and repointing **four** consumers — a separate task, not T-9's.
- **T9-A3 — ⚠️ carried into T-17's brief.** FR-2 s3 requires a **both-blank** GPS submission to be accepted, but a plain-`useState` number input yields `''` when blank, which this DTO correctly rejects with *"must be a number"*. **T-17 must omit the keys or send `null` — never `''`** — or every applicant who leaves GPS blank gets a 400 on a field the requirement says is optional.
- **T9-A4 — carried into T-10's brief.** `null` coordinates transform through as `null`, not `undefined` (`:170-177` covers only `undefined`). T-10's payload JSON write should normalize, so `{gpsLatitude: null}` is not persisted as a shape distinct from an omitted key.
- **T9-A5** — `consent.policyVersion` carries `@MinLength(1) @MaxLength(40)`, which **exceeds** §4.1 (that table specifies nothing for the nested consent object). Consistent with §4.4's "bound every field" and safe today (`CONSENT_POLICY_VERSION = 'v1.0-placeholder'`, 19 chars), but **nothing pins the relationship** — a future version string over 40 chars would `400` every submission.
- **T9-A6** — add `expect(details(error!)).toHaveLength(3)` at `:231-246`. The current assertions prove the three offending fields are named; **the total-count assertion is what proves no *non*-offending field also produced an entry**, which is the other half of FR-2 s2's "one entry per offending field".

**Final verification result:** PASS. One Implementer attempt plus a runtime-failure resume, one Reviewer, **zero rework rounds consumed**.

---

### T-4 — `logging` module: request-id middleware + structured interceptor

| Field | Value |
|---|---|
| **Status** | **IN PROGRESS** — attempt 1 FAIL, rework in flight |
| Date | 2026-08-05 |
| Review mode | Lens checklist (single Reviewer) |
| Effort | attempt 1 `medium` → attempt 2 **`high`** |
| Skills | `nestjs-expert`, `error-handling-patterns` |
| Requirements covered | **NFR-8** (sole owner per `tasks.md` §NFR ownership), **DC-14**, DC-22's diagnosability substitute |

#### Attempt 1 — `STATUS: FAIL`

**Files created:** `backend/src/logging/` — `request-context.types.ts`, `request-context.middleware.ts`, `structured-log.interceptor.ts`, `logging.module.ts` + three spec files.
**Also modified (scope excursion, disclosed by the Implementer):** `registrations.module.ts` (`implements NestModule`, `configure()` with `.forRoutes(RegistrationsController)`), `registrations.controller.ts` (class-level `@UseInterceptors`).

**Verification:** `npm test -- logging` → 3 suites / 11 tests · build clean · eslint clean · **full suite 47/47 suites, 545/545 tests**, no regressions.

**Nine of ten checks passed** — recorded because attempt 2 must not regress them:
- **Scope excursion ruled JUSTIFIED, not creep.** Both edits are strictly additive and behaviour-preserving. T-4's Done-when and Scope are **wiring claims** — unmountable code satisfies neither, and a `LoggingModule` nobody imports is the KZ-002 shape. **The T-3 asymmetry is justified and neither ruling is wrong:** T-3's Done-when concerns transport selection and interface conformance, fully provable unregistered; T-4's contains a **negative scoping claim**, falsifiable only against a real route table.
- **Emission-before-absence ordering holds in every PII/OTP test** (`:141-148`, `:171-176`), with fixtures for OTP, email, phone **and payload fields** (planted on `req.body` *and* `req.query`). Mail bodies correctly not fixtured — §4.10 attributes those to `MailService`, T-3 already gates them, and the interceptor cannot structurally reach one.
- **`route` capture verified.** `req.path` is `parseurl(req).pathname`, a disjoint parse from `req.query`/`req.url`/`req.originalUrl`; a test plants an email in all three and proves `route` carries none of it.
- **`role` correct** — `'Public'` matches `auth.types.ts:9` and root `CLAUDE.md`; the field read matches `roles.guard.ts:33`; a mocked `Admin` reads through unchanged, so the fallback is generic.
- **Not global — independently grepped.** Zero `APP_INTERCEPTOR`, zero `useGlobalInterceptors`, zero `forRoutes('*')`; `main.ts`/`lambda.ts` untouched.
- **`mail.service.ts` untouched and not absorbed**; no log-capture collision (mail lines are prose, `capturedLines()` filters on `startsWith('{')`).
- **Request-id hygiene** — `randomUUID()` CSPRNG, no header read, a pre-set `requestId` is overwritten. Not PII-derived.
- **Negative-scope test ruled NOT vacuous and NOT order-dependent** in the B28 sense: `.expect(200)` inside test 2's own body excludes "route didn't boot", and the shared `beforeEach` excludes "spy never wired". Only the predicate-matches-nothing case is carried by a sibling test — file-scoped rather than test-scoped. Sound, but one deleted `it` from being vacuous.

**Reviewer FAIL finding — reproduced verbatim (Structured Feedback rule):**

> **Discovered Issue — guard-rejected requests emit no log line, and the source comment asserts the opposite for the exact case T-5 will build.**
> `structured-log.interceptor.ts:20-25` states the design handles *"a validation `400` or **a throttled `429`**"*. The first half is true; the second is false. NestJS runs **guards before interceptors** (middleware → guards → interceptors → pipes → handler). A `ThrottlerException` thrown by T-5's `registrations-throttle.guard.ts` short-circuits the pipeline **before `intercept()` is ever called**, so no `res.on('finish')` listener is registered and **no line is emitted at all** — not a wrong `status`, but silence. The same applies to any future `401`/`403` from `JwtAuthGuard`/`RolesGuard` on a controller in this module. A pipe-thrown `400` and a handler-thrown exception *are* correctly captured, because `intercept()` has already run by then.
> Compounding it: no test exercises a non-2xx status through a **real** HTTP pipeline. The `400`/`404` unit tests hand-set `statusCode` on a response double and call `emitFinish()` manually — that proves the serializer formats a non-200 status, not that the interceptor is reached or that `finish` fires on a real failure. The one real-HTTP test covers only the `200` path.
> **Violated Rule:** `tasks.md` T-4 Scope — *"one JSON line per request carrying request id, route, method, status, role, latency"*; and `requirements.md` NFR-8, whose sole task owner is T-4 (`tasks.md` §NFR ownership: *"NFR-8 → T-4"*). A throttled submission is a request that emits nothing, and once T-4 closes, no downstream task owns the gap.

**Leader adjudication — FAIL accepted; remediation (b) selected; and this exposes a design defect.**

The Reviewer offered two fixes and left the scope call to the Leader:
- **(a)** correct the comment, record the blind spot, and hand the `429` line to T-5's `throttler-exception.filter.ts` (exception filters *do* run for guard-thrown exceptions, and `req.requestId` is available since the middleware precedes guards).
- **(b)** move the `res.on('finish')` registration into `RequestContextMiddleware`, which is already `forRoutes(RegistrationsController)`-scoped and runs **ahead of guards**, so every request through this module's routes emits regardless of where it is rejected.

**(b) chosen.** (a) fixes the `429` instance but leaves the **class** open — any future `401`/`403` guard on this module still emits nothing — and it quietly transfers part of NFR-8 to T-5, which `tasks.md` assigns solely to T-4. Emission must survive its own module's guards.

**The design defect this reveals, recorded rather than papered over.** `design.md` §4.10 prescribes *"a `structured-log.interceptor.ts` emitting one JSON line per request"*. **An interceptor structurally cannot satisfy "per request" when guards precede it.** §4.10 names the wrong primitive for the obligation it states — the same shape as T-3's `reference` contradiction, where the design asserted something the flow could not deliver. The requirement (one line per request, six fields, scoped to this module, never PII) is unchanged and is what attempt 2 must satisfy; only the emission point moves, and `design.md` §4.10 will be corrected to match once attempt 2 passes.

**Factual correction to the Leader's own brief, from the Reviewer:** *"T-13 does not depend on interceptor emission — its `400`/`429` assertions are on **response bodies** in `pii-boundary.spec.ts`, not on log lines. T-5 is the only real downstream dependent."* The Leader had told the Reviewer both T-5 and T-13 depended on this. Only T-5 does.

#### Attempt 2 — `STATUS: PASS`

Reviewed by a **fresh, independent** Reviewer (not the one that proposed the remediation).

**The fix.** Emission moved into `RequestContextMiddleware.use()`, registering `res.on('finish')` **synchronously before `next()`** so the listener exists before the guard stage. **`StructuredLogInterceptor` deleted entirely** (source + spec), `@UseInterceptors` removed from the controller, `logging.module.ts` reduced to the middleware. The Implementer's reasoning for deleting rather than reducing — *"keeping it either does nothing or double-emits; no scenario adds value"* — is accepted.

**Proven empirically, not architecturally.** A throwaway `AlwaysForbiddenGuard` + controller + module, local to the spec file, boots a real Nest app and asserts one captured line with `status: 403`. The Reviewer confirmed the test is **discriminating, not decorative**: under attempt 1's interceptor it would capture **zero** lines, and it also fails if the middleware is unwired.

**Reviewer verdict: `STATUS: PASS`**
> NFR-8's obligation ("one JSON line per request", six fields, scoped to this module, never PII) is met by `RequestContextMiddleware`, and the guard-rejection gap that failed attempt 1 is closed and proven through a real HTTP pipeline. The only spec deviation is the one the Leader already adjudicated; I found no second deviation, no lost coverage, no false comment, and no scope leak.

**Evidence stated by class — the honesty the Verification Expectations require:**
- **Proven (real HTTP):** guard-thrown exception → line with `status: 403`.
- **Argued, structurally sound, not directly exercised:** pipe-thrown `400`, handler-thrown exception, and **a custom exception filter (T-5's coming `throttler-exception.filter.ts`)**. All three collapse to the mechanism the 403 case proves — the listener precedes every later stage, and any stage that *writes a response* fires `finish`. The 403 case proves it for Nest's built-in filter; a custom filter doing `res.status().json()` is the identical write path. **T-5 will exercise its own `429`.**
- **Neither proven nor argued — real, and accepted:** **a client abort fires `close` without `finish`, so an aborted request emits nothing.** Not read as an NFR-8 violation: there is no response, hence no `status`/`latencyMs` to record, and the attempt-1 FAIL concerned requests that *do* get a response. **No comment claims otherwise** — the limit is recorded rather than hidden.
- **Lambda checked, not a defect:** serverless-http resolves off the synthetic `ServerResponse`'s `finish`; listeners run synchronously during `res.end()`, so the line is emitted before the handler's promise settles. No freeze-truncation risk.

**No coverage lost to the deletion.** Accounting verified honest: logging suites 3/11 → 2/10, matching full-suite 545 → 544 (interceptor's 6 tests → 5 moved; e2e 2 → 2, with 2 folded to 1 asymmetry test plus the new guard test). **Emission-before-absence ordering survives in each absence test** (`request-context.middleware.spec.ts:171-178`, `:203-208`), with the fixture set intact — OTP `482913`, email, phone, planted on **`req.body` and `req.query`**.

**Single-emission proof sound — cancellation excluded.** `toHaveLength(1)` across a wired and an unwired route cannot be reached by a double-emit cancelling a missing-emit: (2,0) fails the length; (0,1) passes length but fails the **exact** `line.route` pin. Only (1,0) survives both. Nothing anywhere still references the deleted interceptor (repo-wide grep; no stale `dist/` artifact).

**All attempt-1 passing checks survived the wholesale rewrite** — six fields, `route = req.path` (query-string-proof, disjoint-parse test retained), `role` with generic fallback, CSPRNG request id with no header trust, `mail.service.ts` untouched. **Scoping unchanged** (grepped independently: zero `APP_INTERCEPTOR`/`useGlobalInterceptors`/`forRoutes('*')`/`APP_FILTER`/`APP_GUARD`). **Test fixtures inert** — declared inside the `describe`, unexported. **No comment asserts anything false**; the Reviewer re-checked every surviving claim against adjacent code, including the `admin-actors.controller.ts` analogy and the §3.1 citation.

**Verification:** `npm test -- logging` → 2 suites / 10 tests · build clean · eslint clean · **full suite 46/46 suites, 544/544 tests**.

#### Doc correction applied — KZ-004 sweep, four sites

The Reviewer found the stale "interceptor" mechanism in **four** places beyond the code. All corrected in the same change:

| Site | Action |
|---|---|
| `design.md` §4.10 prose | **Corrected** + a full amendment note explaining why an interceptor cannot satisfy the obligation |
| `design.md` §7 file tree | **Corrected** — no interceptor file |
| `tasks.md` T-4 title | **Corrected** + pointer |
| `requirements.md` DEP-11 | **Corrected** + pointer |
| `judgment.md` C-5 | **Left unchanged, deliberately** — it is a frozen record of what the blind dual review found at the time, not a live specification. Editing it would falsify the audit trail, which is the KZ-004 failure mode wearing the opposite sign. |

#### ADVISORY findings

- **T4-A1** — client abort emits nothing. A `res.on('close')` guarded by `!res.writableFinished` (status `499`) would close it, but the Reviewer recommends **deferring**: it adds a second emission path that must then be proven non-double-emitting — the exact hazard attempt 2 just eliminated. **Leader concurs, deferred.**
- **T4-A2** — `new Logger('registrations')` is hardcoded in a module-generic middleware, so a second importing module's lines would be misattributed. Cosmetic today; a constructor arg if `LoggingModule` is ever reused.
- **T4-A3** — one `setImmediate` tick is the e2e's only timing assumption for `finish`. Server-side `finish` reliably precedes supertest's client callback, so flake risk is low; noted because it is the sole timing dependency.
- **T4-A4 — carried into T-5's brief.** T-5's `throttler-exception.filter.ts` is the one *argued-but-unproven* path above. **T-5's evidence must assert that a throttled request emits a log line with `status: 429`**, which both closes this gap and satisfies its own DC-26 envelope check.

**Final verification result:** **PASS on attempt 2.** 2 Implementer attempts, 2 Reviewers (second fresh), **1 rework round consumed**.

---


---

### T-17 — `RegistrationForm`: sections, validation, error contract

| Field | Value |
|---|---|
| **Status** | **IN PROGRESS** — attempt 1 FAIL, rework in flight |
| Date | 2026-08-05 |
| Review mode | Lens checklist (single Reviewer) |
| Effort | attempt 1 `high` → attempt 2 **`xhigh`** |
| Skills | `frontend-design`, `tailwind-design-system`, `react-doctor`, `vercel-react-best-practices` |
| Requirements covered | **FR-2** scenarios 2, 3, 4 (client half) · NFR-5, NFR-6, NFR-7 |

#### Attempt 1 — `STATUS: FAIL` (2 issues)

**Files:** `frontend/components/register/RegistrationForm.tsx` + test (15 tests) · `frontend/app/(public)/register/page.tsx` + test (2 tests).
**Verification:** `npm test -- RegistrationForm` 15/15 · full frontend suite **74/74 suites, 1031/1031** · build **20 → 21 static pages** · lint clean · zero hex literals.

**FAIL 1 — FR-2 scenario 2's client half is not discharged; the malformed-email error is unowned.**

The Implementer chose not to collect `email` in the form, reasoning that S-6 places it in the OTP step (T-19). **The Reviewer overturned this at source, and the Leader accepts the overturn:**
- `RegistrationPayloadDto` genuinely has no `email` — **correct**.
- But `design.md:183` (§3.1) makes `email` a **top-level sibling of `payload`**, exactly like `consent`; and §4.1's prohibition (*"No `email` in the payload"*) is scoped **verbatim to the payload**.
- **S-6's own clause (`requirements.md:232`) says *"one address is **collected**, verified, stored, and published"* — it forbids a *second* address, not collection in the form.**
- The component already proves the distinction: it hands `consent` up as a **second argument** because consent is a top-level sibling of `payload`. `email` is the same shape of thing and can travel the same way.
- Nothing in `design.md` §5.1, §5.3 or §12's FR-2 row assigns an email input to the OTP step; §5.3 describes only the resend affordance.

**So the reading is correct about the DTO and wrong about the form.** The *mechanism* (count, one inline message per field, summary↔inline agreement) is field-agnostic and **is** proven — but the scenario's own named instance cannot occur, because no surface collects an email. `tasks.md:265` assigns this clause to **T-17 alone**; T-17 disclaimed it; T-19's block never mentions an email input, format validation, or an inline email error. **The clause is unowned — the exact KZ-001 discharge-by-pointing-at-a-neighbour the spec forbids** (`requirements.md:45`, `tasks.md:288`).
*Violated:* FR-2 scenario 2 (lines 152-160), §2's KZ-001 rule (line 45), `tasks.md` Coverage Closure line 265.

**Leader adjudication — remediation (a): collect `email` in the form.** The Reviewer offered a second path (amend the spec so T-19 owns email entry, editing `tasks.md:265` and T-19's Scope/Done-when **before** T-17 closes). **(a) chosen:** it satisfies the requirement as written without reopening the approved decomposition, S-6 demonstrably permits it, and the flow stays coherent — the form collects every field including the address, T-19 verifies that address, and one address is collected once. Path (b) would be a spec amendment requiring a fresh approval gate for no gain.

**FAIL 2 — the `crops` inline error is associated with no input, and its summary link is a dead anchor.**
`crops` is one of the three fields in the very error case T-17's Done-when names, and it is the one field that escapes the accessibility contract:
- `RegistrationForm.tsx:588-592` renders the crops error as `<p id={…-crops-error}>`, but **no checkbox at `:572-580` carries `aria-describedby` pointing at it.** Every other errored control does (`:448`, `:481`, `:635`).
- `:511` links the summary entry to `#${fieldId('crops')}` = `${baseId}-crops`, and **no element has that id** — the checkboxes are `${baseId}-crop-<value>` (`:568`). **The Crops summary link navigates nowhere.** Every other summary anchor resolves.
- `jest-axe` cannot catch either (axe does not require `aria-describedby`), and the test at `:173-186` samples only `phone` — **so the suite is green over both.**
*Violated:* FR-2 scenario 2's *"AND IT MUST associate each inline error with its input via `aria-describedby`"* (line 160); NFR-5 (line 595).

**Verified clean on attempt 1 — attempt 2 must not regress these:**
- **One error source CONFIRMED by reading the component**, not the test: exactly one `useState<Record<string,string>>` (`:385`); summary reads `Object.entries(errors)` (`:509`), inline reads `errors[field]`; no memo, no derived slice, no submit-time snapshot. The proof test **would** catch a two-source implementation — a summary snapshotted at submit would still read "3 fields" after the phone edit and fail line 169.
- **GPS trap fully closed.** No path can emit `''` (`parseOptionalNumber` and `trimmedOrUndefined` both test `trimmed === ''`); `'0'` → `0`, and `capacityTons: '0'` likewise; keys are **omitted, never `null`**, consistently on both coordinates. The JSON round-trip proof is **valid** — `frontend/lib/api/client.ts:219` does `body: JSON.stringify(body)`. *Carried to T-19:* `apiGet` has no POST and these are tokenless public paths, so it must use `apiFetch` with `token` omitted or the guarantee moves to an untested helper.
- **`consentPolicyVersion: ''` fails closed** — `ConsentInputDto.policyVersion` carries `@MinLength(1)`, so the pipe `400`s before `isKnownConsentPolicyVersion` is ever reached. Worst case is a loudly-rejecting path, never a bad consent record. *T-19's Done-when should assert a non-empty version so it cannot ship half-wired silently.*
- Five fieldsets per §5.1; no `lib/api/*` import, no `fetch`; ten trader types from `ROLES`, not re-declared; **NFR-6 spot-checked and resolved to hex** (`text-danger` `#B3261E` on `bg-danger-soft` `#F5E3E2` = 5.28:1; `text-primary-fg` on `bg-primary` = 8.3:1; `text-muted` on `bg-surface` = 5.74:1); A25 copy is standalone prose; A26 no entrance motion; NFR-7 clean; **the PROVEN/DEFERRED split is honest.**
- *Advisory carried to T-18:* the one-source contract survives only if `ConsentPolicyDisclosure` takes `checked`/`onChange`/`error` as **props**. If it holds its own `accepted` state, the contract breaks at that moment.

#### ⚠️ Leader record corrected — the frontend flake is file-level, not line-level

The Leader recorded the known flake as `admin/actors/import/page.test.tsx:275`. **T-17's run failed at a *different assertion in the same file*.** Two distinct failure points in one file points at shared or ordering state rather than one flaky assertion. **The signature is corrected to file-level**, and every subsequent frontend brief must say so. Consequence, and it cuts the important way: **the next failure in that file must NOT be treated as pre-cleared** — re-run to confirm, but do not assume.

#### Attempt 2 — `STATUS: PASS`

Reviewed by a **fresh, independent** Reviewer.

**FAIL 1 remediated — `email` collected in the form.** Added to the Contact fieldset (`type="email"`, required, `EMAIL_REGEX`), keyed into the **same** `errors` record so it inherits the one-source contract. `onValidated` widened to `(payload, consent, email)`; `page.tsx`'s `PendingSubmission` gained the field. **S-6 preserved and verified:** `RegistrationPayloadInput` has **zero** email keys, `buildPayload` never writes one, and a test asserts `'email' in payload === false`. The three-field test is now FR-2 scenario 2's **literal trio** — `capacityTons: -5`, `email: 'not-an-email'`, no crop.

**FAIL 2 remediated — crops association and anchor.** Checkboxes wrapped in `<div role="group" id={fieldId('crops')} aria-labelledby=… aria-describedby=…>`. The Reviewer confirmed the anchor now resolves and that **no anchor-side code changed** — the summary emits `fieldId(field)` generically for all 16 keys, with no crops-specific branch, so only the missing target was added. Computed group name is "Crops" (the asterisk span is `aria-hidden`), unambiguous against the enclosing fieldset "Crops & capacity".

**⚠️ The "mentally" claim was replaced with analysis.** The Implementer's stated evidence that its new generic assertion would have caught the attempt-1 defect was *"ran it against pre-fix code mentally"* — **not evidence**, and the Leader referred it for verification. The Reviewer established it properly:
- Summary entries are real `<a href={'#'+fieldId(field)}>` elements, so `getAllByRole('link')` returns them; `role="alert"` does not hide descendants.
- The `links.length > 0` guard is **non-vacuous**: submitting an empty form produces **9** errors (`traderName, traderType, contactPerson, region, crops, capacityTons, phone, email, consentAccepted`).
- It **would** have gone red pre-fix: `fieldId('crops')` is `${baseId}-crops`, the checkboxes were `${baseId}-crop-<value>`, so `getElementById` returned `null`. (jsdom's `getElementById` is a literal lookup, so React `useId()`'s colons are fine.)
- **Coverage of the summary space, with the hole checked:** six fields are *not* exercised by this test (`position`, `district`, `marketLocation`, `otherCrops`, `gpsLatitude`, `gpsLongitude`). **Not a live hole** — all six render through the shared `renderInput` helper, which sets `id={fieldId(field)}` unconditionally. **Crops was the sole bespoke render path, and it is now the one the test pins.**

**The email-regex question — settled, and the direction is the safe one.** `RegistrationCreateDto.email` is bare `@IsEmail()` (validator.js defaults). The client regex errs **permissive**, not strict:
- More permissive (client passes → server `400`, acceptable since the server is authoritative): `a@b.c`, `john..doe@x.com`, `user@ex_ample.com`, over-length addresses.
- Stricter (blocked client-side) **only** for RFC 5321 *quoted* local parts — `"john smith"@example.com`. No provider issues those, and no `.ac.tz` / `.go.tz` / `.or.tz` / `@cgiar.org` institutional address takes that form. **No practical FR-2 gap.**
- **Decisive point neither the Leader nor the Implementer made:** this exact literal is already the repo's established email check — `ActorForm.tsx:303` (this task's stated reference implementation), `CreateUserDialog.tsx:45`, `EditUserDialog.tsx:42`. **Introducing a different rule here would have been the drift.**

**Everything from attempt 1 re-verified after substantial edits** — one error source (exactly two `useState` calls, one `Record<string,string>`; no memo, no snapshot), the GPS trap (`''` unreachable, `0` survives, keys omitted not `null`), five fieldsets, ten trader types, zero hex literals, A25 copy, A26 (only `transition-colors` with `motion-reduce:transition-none`), no `lib/api/*` import or `fetch`, static export, and an honest PROVEN/DEFERRED split.

**Positional third argument — ruled acceptable.** The Leader flagged it as a possible maintenance hazard. The Reviewer's ruling: real for *tests*, not for *consumers* — `onValidated` is typed, so a T-19 handler omitting the parameter is caught by `npm run build`. §3.1's `{ email, code, consent, payload }` describes the **HTTP body**, which T-19 assembles; the callback is not obliged to mirror it. **Convert to a single object when T-18 lands** (it will want `policyVersion` flowing back) — a third positional slot plus a fourth is where it becomes a hazard.

**Verification:** `npm test -- RegistrationForm` → 17/17 · **full suite 74/74 suites, 1033/1033 tests** (+2 over baseline: the malformed-email and generic-href tests) · build 21/21 static pages · lint clean but for the 3 pre-existing warnings · react-doctor zero findings in the changed files · **no flake hit**.

> **Reviewer's own honesty note, recorded:** *"I am read-only and ran no suite — all run-evidence traces to the Implementer, unverified by me. The attempt-1 source state is likewise not inspectable from here; the 'would have failed pre-fix' finding is derived from the stated defect plus the current id scheme, not from a diff."*

#### ADVISORY findings

- **T17-A1 — the Reviewer's single recommendation on crops:** move `aria-describedby` onto **each checkbox** and add `aria-invalid="true"` when `errors.crops` is set, keeping the group for the anchor target and the accessible name. Reason: a group's description is announced on *entering* the group, and error recovery is exactly the pattern where users jump straight to a control via quick-nav or a summary link, never crossing the boundary. Group-level is defensible — hence advisory, not FAIL — but it is the weaker of the two.
- **T17-A2 — `autoComplete` missing on the PII inputs** (`email`, `phone`, `contactPerson`, `traderName`). WCAG 2.1 AA **SC 1.3.5** covers exactly these, and every other email input in the repo sets it (`LoginForm.tsx:249`, `ForgotPasswordForm.tsx:218,245`, both user dialogs). **The Reviewer explicitly declined to FAIL it, on a principle worth preserving:** `ActorForm.tsx` — the stated reference implementation — omits it too, and `contactPerson`/`phone` carried the same gap through attempt 1's PASS, so *"failing it now would be inconsistent gatekeeping."* Cheap fix; route to T-22 if not taken sooner.
- **T17-A3** — give the crops group `tabIndex={-1}` so the summary link actually lands focus. The other anchors target focusable inputs; `#…-crops` targets a `<div>`, so fragment navigation scrolls but only sets the sequential-focus starting point.
- **T17-A4 — carried into T-19's brief.** The permissive-regex gap creates a **dead end T-17 structurally cannot cover**: an `a@b.c`-style address passes the client, survives the OTP step, then takes a `400` from `@IsEmail()` at submit. T-19 must map `details[{field:'email'}]` back to a visible message, or the applicant hits a silent failure at the last step.
- **T17-A5 — carried into T-18's brief** (from attempt 1, still live): the one-error-source contract survives only if `ConsentPolicyDisclosure` takes `checked`/`onChange`/`error` as **props**. If it holds its own `accepted` state, the contract breaks at that moment.

**Final verification result:** **PASS on attempt 2.** 2 Implementer attempts, 2 Reviewers (second fresh), **1 rework round consumed**.

---


### Wave 6 dispatch — T-5 ‖ T-18 (Leader record, written before the reports arrive)

Both eligible by document order with all dependencies `[x]` (T-5 ← T-2; T-18 ← T-2, T-17). Disjoint trees — `backend/src/registrations/**` and `frontend/components/register/**` — so they run concurrently at the standing width cap of 2.

**Effort `high` on both.** T-5 is a security surface with two independent disqualifying clauses. T-18 is a small component, but it inherits T-17's one-error-source contract and carries the DC-17 jsdom trap, where the failure mode is a green suite over a control that never gates; the marginal cost of `high` is far below one rework round, and the review-round budget is the binding constraint at this point in the run.

**Review lens mode — `high` effort selects the lens checklist, and T-5 gets it despite touching a security surface. Recorded as a deliberate Leader deviation.** The 4R rule would ordinarily route a security surface to parallel lens Reviewers. Two reasons not to here: the run is at 22 of ~37 review rounds with 13 tasks left, so a 2–4× review fan-out on one task materially threatens the budget tripwire; and T-5's risk is already pinned by two *named, mechanically checkable* clauses (envelope shape, zero Prisma invocations) rather than the open-ended judgment that parallel lenses exist to cover. A single T3 Reviewer aimed at those clauses is the better instrument here. **If T-5 FAILs, attempt 2 escalates to parallel lens Reviewers** — the budget argument does not survive evidence that one lens missed something.

**Obligations carried into the briefs beyond each task's own Done-when:**

| Task | Carried obligation | Origin |
|---|---|---|
| T-5 | Prove a throttled request emits a structured log line carrying `status: 429` | T-4 relocated emission from an interceptor to middleware **precisely** on the argument that a guard-rejected request must still log. Nothing in the tree was guard-rejected until now, so the claim was argued and never exercised. T-5 is the first task that can falsify it |
| T-5 | `@nestjs/throttler` is not installed; no exception filter exists anywhere in `backend/src` | Leader pre-check. Recorded so the Implementer does not spend the discovery, and so a surprising resolved version is visible in the audit trail |
| T-18 | `ConsentPolicyDisclosure` must take `checked` / `onChange` / `error` as **props** | T17-A5 |
| T-18 | Progress text derives its section count from the fetched payload — the mockup says six sections, the backend ships four | Leader pre-check against `consent-policy.ts` |
| T-18 | Use `apiFetch` with `token` omitted, not `apiGet` | T-17's Reviewer, on the public tokenless paths |
| T-18 | Do **not** wire into `RegistrationForm`; if `onValidated` must change, convert it to a single object rather than adding a fourth positional argument | T-17's Reviewer, sent as a scope guard after dispatch |
| T-18 | The frontend flake signature is **file-level**, and a failure there is **not** pre-cleared | Leader record corrected during T-17 |


#### ⚠️ Leader error — L-ERR-2: a scope guard that created the gap it was meant to prevent

**What I did.** Immediately after dispatching T-18 I sent its Implementer an unsolicited addendum instructing it that *"wiring `ConsentPolicyDisclosure` into `RegistrationForm` is NOT in T-18's scope."* I inferred that from two things: T-18's `Files:` line, which names only the component, its predicate module and their tests; and T-17's Reviewer note warning that `onValidated`'s third positional argument becomes a maintenance hazard at a fourth. I read a *hazard warning about a callback signature* as a *scope boundary*, and I did not check the three places that say otherwise:

| Evidence | Says |
|---|---|
| `RegistrationForm.tsx:679-686` (written by T-17) | *"T-18 replaces this paragraph and checkbox with `ConsentPolicyDisclosure` (design.md §5.2)… This placeholder keeps the fieldset structurally present and its acceptance state part of THIS component's one `errors`/`values` pair, so T-18 can swap the body in without relocating consent out of the shared error contract."* |
| `RegistrationForm.tsx:19` (file header) | The fifth fieldset is listed as *"placeholder seam for T-18"* |
| `tasks.md` → Coverage Closure (KZ-001) | FR-3 *"Consent must be given before submission"* → **T-18 (control)** + T-10 (server) · FR-3 *"Policy readable before acceptable"* → **T-18** (+ DC-17 human check) |

T-17 built a seam and named T-18 as the task that fills it. I told T-18 not to fill it.

**What it would have shipped.** `ConsentPolicyDisclosure` imported by nothing; the running form still rendering T-17's ungated placeholder checkbox; `policyVersion: ''` still hardcoded at `RegistrationForm.tsx:466`. **Both FR-3 scenarios that T-18 owns would have been unsatisfied in the actual application, with 77 suites and 1066 tests green** — the KZ-002 failure mode exactly, and the one this spec's Coverage Closure table exists to prevent.

**Why the `Files:` line misled me, stated so the next task does not repeat it.** Throughout this spec `Files:` has been *indicative, not restrictive* — T-18's own Implementer correctly added `frontend/lib/api/registrations.ts`, likewise absent from the list, and no one would call that scope creep. A `Files:` line is a starting point for the diff; **the Coverage Closure table is the authority on what a task must make true.** I consulted the weaker artifact and overrode the stronger one with it.

**Attribution and cost.** Leader error, not an Implementer FAIL: **no rework attempt consumed**, on the same principle as T-9's session-limit interruption. The Implementer followed my instruction and then flagged the consequence under `Not Done / Assumptions` rather than silently skipping it — the field working exactly as Step 2.3 intends. **The gap was caught by the Implementer's honesty, not by my review**, which is worth recording as its own fact.

**One part of the guard survives, on re-examination.** I also told the Implementer not to convert `onValidated` to a single object parameter. That half stands and I reaffirmed it: `consent` already carries a `policyVersion` field, so flowing the real version through needs no fourth positional argument and T-17's Reviewer's hazard condition never materialises. Converting would have been genuine scope creep. **The error was in the first instruction, not the second** — recorded separately so a future reader does not discard both.

**Remainder dispatched** to the same Implementer (full context, no respawn): swap the fieldset body, flow the fetched `policyVersion` into the consent object, update `page.tsx` only as far as that forces, and report — rather than silently weaken — T-17's *"no `lib/api/*` import, no `fetch`"* assertion if it is now legitimately obsolete. Reviewer deliberately **not** spawned on the partial diff; one review of the complete change instead of two of halves.

**Also found while checking this:** T-18's stated verify command `npm test -- ConsentPolicy` does **not** match `consent-scroll-gate.test.ts` — the predicate suite, which is the *covered half* of a task whose other half is an explicit human check. The Implementer ran it separately of its own accord and reported it. Carried as an advisory against `tasks.md`'s verification lines, not against this task.


### T-5 — Throttle guard + `429` envelope filter

**Dispatched** with effort `high`, skills `nestjs-expert` + `error-handling-patterns`, single Reviewer on the lens checklist (deviation from the security-surface default recorded in the Wave 6 dispatch note above).

#### Attempt 1 — `STATUS: PASS`

**Delivered.** `RegistrationsThrottleGuard` (a thin `ThrottlerGuard` subclass carrying this module's limit constants and rationale) and `ThrottlerExceptionFilter`, both applied at the **class level** on `RegistrationsController` so T-8's `/verify`, T-10's `POST /registrations` and T-11's `/lookup` inherit them with no further wiring. `ThrottlerModule.forRoot([{ttl: 60_000, limit: 20}])` imported in `RegistrationsModule`. New dependency `@nestjs/throttler@6.5.0`.

**Both Disqualifying clauses closed, and the Reviewer confirmed the assertions are non-vacuous:**

| Clause | Evidence | Reviewer's finding |
|---|---|---|
| The `429` envelope (DC-26, A21) | `toEqual({statusCode: 429, error: 'Too Many Requests', message: expect.any(String)})`, plus `Object.keys(body).sort()` in the unit test | Closed. `toEqual` fails on extra keys, so a stray `details` or a library-added key goes red. Matches `common/validation-pipe.ts:82-83`'s convention for `400`s |
| **Zero** Prisma invocations on the rejected request (FR-7) | A test-only Prisma-touching controller behind the **real** guard class: assert the mock fired `TEST_LIMIT` times, drive one more request, assert the count **has not advanced** | Closed, and the construction is right — the pre-assertion proves the mock is genuinely wired, so its later silence is meaningful rather than vacuous |

**FR-7 scenario 1's unnamed clause — *"MUST NOT leak internal detail or a stack trace"* (QA-3, QA-10) — checked at my request and genuinely closed, by a different test than the obvious one.** The filter builds a **constant** body and never reads the exception (its parameter is `_exception`), so no library string, cause or stack can reach the response *by construction*. The Reviewer identified which test actually carries the clause: because a `ThrottlerGuard` subclass **can** inject a custom message (`throttler.guard.js:152-164`), it is the test passing `ThrottlerException('some other internal detail')` and still getting the fixed envelope that proves the property — **the `/ThrottlerException/i` substring assertions alone would not have.**

#### The carried-forward T-4 obligation — discharged, and my own earlier characterisation corrected

I had recorded T-4's middleware relocation as *"argued but never proven."* That was wrong, and the Reviewer verified the correct account rather than taking the Implementer's word: **`logging/logging-scope.e2e.spec.ts:115-190` already proved guard-rejection logging** — against a local `AlwaysForbiddenGuard` commented *"standing in for T-5's not-yet-built throttle guard"*, asserting `status === 403`. What was missing was the **real** `ThrottlerException` path, and T-5 supplies it. **No defect in T-4.**

Non-vacuity confirmed structurally, which is A5's actual trap: `capturedLines()` parses only `{`-prefixed strings, `lines.find(l => l.status === 429)` yields `undefined` on an empty capture, and `expect(throttledLine).toBeDefined()` **fails hard** on that — it is not a `forEach`-over-an-empty-array shape. Emission holds because `request-context.middleware.ts:97-109` registers `res.on('finish')` **before** `next()`, and `res.statusCode` is 429 because the filter set it.

#### Scoping — confirmed correct, by source reading rather than inference

`ThrottlerModule.forRoot()` registers **only** `THROTTLER_OPTIONS` + `ThrottlerStorageProvider` and **no `APP_GUARD`** (`throttler.module.js:14-22`). **No controller outside `RegistrationsController` is throttled**, and `auth/no-global-guard.spec.ts`'s fence is untouched. Nothing in FR-7, NFR-4, §4.4 or DD-5 requires global registration; DEP-10 pushes the other way, since opt-in-per-controller is this codebase's convention.

**Verification (Implementer's, and the Reviewer states plainly that it ran no suite):** `npm test -- registrations` 4 suites/33 tests · `npm test -- logging` 2 suites/10 tests unchanged · eslint `--quiet` clean · `npm run build` clean · **full suite 48 suites / 549 tests** (from 46/544 — delta is exactly the 2 new spec files / 5 new tests).

#### ADVISORY findings

- **T5-A1 → carry to T-6, highest value.** T-5's `429` evidence is **supertest-only**, but `design.md:689` says over-rate **and** over-cap are *"**both** proven through `lambda-handler.e2e.spec.ts`"*, and NFR-4's measure names both entrypoints. Not a T-5 failure — `tasks.md:291` assigns NFR-4 to *"T-5, T-6"* jointly, FR-7's entrypoint clause is textually attached to scenario 2 (the cap), and T-6's Done-when owns the harness. **But it is not ceremonial:** the tracker resolves through a `serverless-http`-specific path supertest never exercises. The Reviewer traced it — `create-request.js:16` maps `event.requestContext.http.sourceIp` onto an own `ip` property shadowing Express's prototype getter — but that is a **source reading, not evidence**. If a synthetic event omits `sourceIp`, **every caller shares one bucket and 20 req/min becomes a global self-DoS.** T-6 must add one `429` assertion through the real handler.
- **T5-A2 → carry to T-11, a real cross-task collision.** The class-level guard means `POST /lookup` can return a `429` **in a distinct envelope**, while L-2 (`design.md:341`) demands *"Same status, same body, same message for: reference absent · reference present + email mismatch · **rate-limited**"* against T-11's byte-identical `404`. The Reviewer's analysis: the `429` is **not** a membership oracle — the throttler key is `sha256(class + handler + ip)`, independent of whether the reference exists, so it discloses nothing. **But it violates L-2's literal text.** T-11 must resolve this **deliberately** — either `@SkipThrottle()` on that handler with the shared control carrying the load, or a documented reading of L-2 as oracle-freedom rather than byte-identity — **not discover it while chasing a red test.**
- **T5-A3 — budget granularity, disclosed and conformant.** `generateKey` hashes class **+ handler** + tracker, so 20/60s is **per route**, not per module: one IP gets **80** requests/min across the four public paths. The guard's own doc comment states this accurately and FR-7's *"on any public registration path"* reads naturally as per-path. Know the aggregate is 80.
- **T5-A4 — the value itself.** 20/60s is reasonable. Note `blockDuration` defaults to `ttl` and hits stop counting while blocked, so a tripped applicant waits the full 60 s. Acceptable.
- **T5-A5 → carry to T-13.** The guard makes any future suite driving >20 requests at one registration handler on a *shared* app instance order-dependent — B28's concern, already recorded at `design.md:690`. T-5 handled it correctly (each `describe` gets its own app and storage); T-13 must keep that discipline. No lingering-timer hazard: `ThrottlerStorageService.onApplicationShutdown` clears all timeouts and both suites call `app.close()`.
- **T5-A6 — `@Global()` consequence, narrow but real.** `THROTTLER_OPTIONS` and `ThrottlerStorage` are now injectable from **every** module, exported from a feature module. A second `ThrottlerModule.forRoot()` registered anywhere later **collides on the same global token** and this module's limit silently becomes whichever registration won, with no test to notice.

**Final verification result:** **PASS on attempt 1.** 1 Implementer attempt, 1 Reviewer, **0 rework rounds consumed.**


#### ⚠️ Leader record corrected again — L-ERR-3: the flake signature is **directory-level**, and I quoted the wrong route group

Two separate defects here, one mine and one in the signature itself.

**Mine.** T-18's brief told the Implementer the flake lived in `frontend/app/(public)/**/page.test.tsx`. The record (line 213) says `frontend/app/(admin)/admin/actors/import/page.test.tsx`. **Wrong route group entirely** — `(public)` instead of `(admin)`. This is the *third* time I have mis-stated this signature (first the line number, then the file, now the route group), and the pattern is worth naming: I have been re-deriving it from memory each time instead of reading line 213. **Every future frontend brief must quote the signature by reading it, not recalling it.**

**The signature itself is now too narrow, again.** T-18's Implementer hit a red under full parallel load and — correctly — refused to treat it as pre-cleared, because the path I gave did not match what failed. What it found is a **second** flaky file:

| File | Failure sites observed | Behaviour in isolation |
|---|---|---|
| `app/(admin)/admin/actors/import/page.test.tsx` | line 275 (`findByRole('alert')`, T-16) · a different assertion (T-17) | passes |
| `app/(admin)/admin/actors/page.test.tsx` | line 276 (`toBeInTheDocument` timeout) · line 895 (a `waitFor` on "network failure") | **passes 3×, 32/32 each run** |

Four distinct assertion sites, two files, all in the **admin actors area**, all green in isolation and only red under the full parallel run. One file with two flaky assertions can be dismissed as a slow assertion; **two sibling files with four is a property of the suite, not of any assertion** — shared or ordering state, or worker contention across the admin actors suites.

**Signature widened from file-level to directory-level: `frontend/app/(admin)/admin/actors/**/page.test.tsx`.** The standing rule from line 217 is unchanged and still cuts the same way — **a failure there is NOT pre-cleared.** Re-run and characterise; never wave one through.

**Neither the widening nor the diagnosis is mine.** Both came from an Implementer that took a red seriously despite being handed a wrong signature by its Leader, ran the file three times in isolation to establish the contrast, and reported both runs verbatim. Second time in this wave that a worker's discipline caught what the Leader's brief got wrong (see L-ERR-2).

**De-flaking those suites remains out of this spec's scope** (line 217's judgment stands — they belong to the admin actors feature, which this spec does not touch). What is now in scope is honesty about the cost: **every frontend task from T-19 onward runs against an ambiguous full-suite signal in that directory**, and that ambiguity has grown, not shrunk, over the run. Recommend a follow-up spec against the admin actors test suites; recorded here rather than minted as a task in this spec, per the advisory rule.


### T-18 — `ConsentPolicyDisclosure` + the pure scroll predicate

**Dispatched** with effort `high`, skills `frontend-design` + `react-doctor`, single Reviewer on the lens checklist. **One Implementer, two dispatches** — the second being the remainder correcting L-ERR-2 (my scope guard), which consumed **no rework attempt** because the gap was mine, not the Implementer's.

#### Attempt 1 — `STATUS: PASS`

**Delivered.** `consent-scroll-gate.ts` (pure exported predicate over `{scrollTop, clientHeight, scrollHeight}`, 10 metric cases), `ConsentPolicyDisclosure.tsx` (controlled `checked`/`onChange`/`error` + `onPolicyLoaded`), `lib/api/registrations.ts` (`getConsentPolicy()`), and — after the remainder — the real wiring into `RegistrationForm`'s fifth fieldset, replacing T-17's placeholder.

**Conformance verified by the Reviewer reading source, not tests:**

| Property | Finding |
|---|---|
| One-error-source contract (T-17's, which T-18 must not break) | **Holds.** `ConsentPolicyDisclosure` declares no `checked`/`error` state — only `policy`, `loadFailed`, `reachedEnd`. `setField('consentAccepted', …)` is the **only** writer; `handleConsentPolicyLoaded` writes `consentPolicyVersion` alone and never touches `errors` |
| DD-8 predicate | `scrollHeight <= clientHeight → true` is a direct transcription of §5.2's *"returns true when content is shorter than its container"* — no jsdom-specific branch |
| FR-3 "unticked at every initial render" | Holds. `checked` is a prop from `values.consentAccepted`, `false` in `toFormValues()` and re-initialised on every remount. An async version arrival cannot tick the box or alter `errors` |
| Fetch-once | Effect has `[]` deps and reads the callback through a ref, so a new inline callback identity per parent render does not refire it; a `cancelled` flag guards post-unmount `setState` |
| `policyVersion` flow-through | Real fetched version reaches `onValidated`; a test pins it to `'v9.9-test-fixture'` and asserts `!== ''` |
| NFR-6 tokens | Zero hex literals — `grep '#[0-9a-fA-F]{3,8}|rgb\(|\[#'` over `components/register/` returns **no matches** |
| Backend type fidelity | `ConsentPolicy {version, sections}` mirrors `ConsentPolicyResponse`; `ConsentPolicySection {heading, body}` mirrors `consent-policy.ts:17-20`. No loosened unions, no flipped optionality |
| `page.tsx` "comment-only" | **Confirmed independently**, not taken from the Leader's characterisation: `Step`, `handleValidated` and the render switch are byte-identical in behaviour |

**A regression the Implementer introduced, caught, and fixed within the attempt.** Moving the checkbox into `ConsentPolicyDisclosure` gave it its own `useId()`, so the error summary's `#${baseId}-consentAccepted` anchor lost its target — **the identical dead-anchor class that FAILed T-17 attempt 1 on the crops group.** Fixed with a `<div id={fieldId('consentAccepted')}>` landing target, mirroring that precedent. **T-17's generic *"every error-summary link resolves to a live element"* test is what caught it** — written as a guard against the class rather than the instance, and it has now paid for itself on a different field in a different task.

#### ⚠️ The Leader's premise on the jsdom question was wrong, and the correction is the most valuable finding in this review

I asked the Reviewer whether `RegistrationForm`'s tests silently depend on the predicate returning `true` for degenerate all-zero metrics. **The dependency is real but it is not the one I named**, and the true one is worse:

In `RegistrationForm.test.tsx` the default mock **never resolves**, so `policy` stays `null`, the geometry effect returns early, `reachedEnd` stays `false`, and the checkbox renders **`disabled`**. Eight tests tick it anyway and pass — because **jsdom toggles a disabled checkbox on a dispatched click**:
- `jsdom/living/nodes/HTMLInputElement-impl.js:168-172` — `_legacyPreActivationBehavior()` flips `checked` with **no `disabled` guard**
- `:191-194` — `_activationBehavior()` explicitly exempts checkbox/radio from the `_mutable` (not-disabled) check
- React then fires `onChange`, because `shouldPreventMouseEvent` covers `onClick`/mouse handlers, not `onChange`

**Only one** test ("flows the real policyVersion…") depends on degenerate-zeroes-open. **The other eight depend on jsdom ignoring `disabled` entirely** — they assert a successful submission from a state in which a real applicant **could not submit at all**.

**It masks nothing today** — `ConsentPolicyDisclosure.test.tsx:226-275` asserts `toBeDisabled()`/`not.toBeDisabled()` against *injected non-degenerate geometry*, so a gate that opened instantly or never would fail there. That is why this is an advisory and not a FAIL. But it is undocumented, in a file whose header documents the mock at length, and it detonates opaquely on a `userEvent` migration, which **does** respect `disabled`.

#### DC-17 honesty — the Disqualifying clause, genuinely satisfied

The human check is written down at `ConsentPolicyDisclosure.tsx:42-51` as four browser-executable steps. Both test files **disclaim rather than claim**: the describe is *"scroll-gate **wiring**"*, titles say *"on a scroll event that **reports** the end has been reached"* — not "at the end of the policy" — and the `Object.defineProperty` technique is characterised as proving the component *reads DOM metrics and calls the predicate*, and explicitly *"does not and cannot prove that a real browser's layout … produces these numbers."* **Nothing folded into the green result.**

**The human check, carried here so it is findable at the HITL pause rather than only in a source comment (Reviewer A-2):**
> Open `/register` in a real browser, against a reachable API. **1.** On page load the consent checkbox is unticked and disabled. **2.** Scrolling the policy region partway does **not** enable it. **3.** Scrolling to the true end of the real policy text **does** enable it. **4.** The region is keyboard-reachable and scrollable: Tab focuses it, Arrow Down / Page Down / End reaches the bottom and enables the checkbox with **no pointer used**.
>
> **Precondition (A-2):** the API must be reachable, or steps 2–4 are unperformable because the disclosure renders its load-failure state. KZ-003 cuts only partway here — the component takes plain props, but it also *fetches*, so a throwaway harness is **not** sufficient for this one, unlike the other components in this module. Use the local stack (`docs/infrastructure.md` § Local Environment) or a stubbed `NEXT_PUBLIC_API_BASE_URL`. **Also to be added to T-22's human-check list.**

**Verification (Implementer's; the Reviewer states plainly it ran no suite, lint or build):** `ConsentPolicy` 16/16 · `consent-scroll-gate` 10/10 · `RegistrationForm` 18/18 (17 prior + 1 new), 0 `act()` warnings · lint 0 errors · build 21 static pages, `/register` 4.32 kB → 5.57 kB · **full suite 77 suites / 1067 tests** · react-doctor 79/100, 6 findings all pre-existing with line numbers merely shifted.

#### ADVISORY findings

- **A-1 (highest value) — the jsdom `disabled` coupling above.** Cheapest durable fix: make that file's default mock **resolve** a one-section fixture and have `fillMinimalValidForm()` await it, so tests tick a genuinely enabled control via the legitimate DD-8 short-content path — then keep **one** explicitly-named test on the never-resolving path asserting the checkbox is disabled and `onValidated` is never called. That path is also the real *"policy failed to load"* product behaviour, and it is **currently untested at the form level**.
- **A-2 — human-check precondition.** Recorded above, and to be carried into T-22.
- **A-3 → T-19.** T-17's placeholder had `disabled={submitting}`; `ConsentPolicyDisclosure` takes no such prop, so the consent checkbox alone stays interactive while submitting. **Not a spec violation** — FR-3, NFR-5 and §5.2 say nothing about in-flight submit state — and **currently unobservable**, since `page.tsx:83` passes no `submitting` prop at all. It becomes a live inconsistency the moment T-19 wires it. T-19 should thread `disabled={!reachedEnd || submitting}`.
- **A-4 → T-19, forward risk.** The geometry effect measures once, when `policy` lands. A `display:none` or detached element reports 0/0/0, which the predicate reads as "fits" and **opens the gate**. Nothing hides the fieldset today, but §5.3 keeps OTP as a *step within* `/register` — if T-19 hides the form with `display:none` rather than unmounting it, and the disclosure ever remounts hidden, the gate opens silently.
- **A-5 — a test title that now overstates.** `RegistrationForm.test.tsx:359` still reads *"— no network call"*, but the component transitively calls `getConsentPolicy()` on mount. **The Implementer's negative claim was verified true** — `global.fetch` appears nowhere in the file and no test asserts against imports, so nothing was weakened; the file header discloses the fetch honestly. The defect is confined to the title.
- **A-6 — a contradiction between two guides, not a T-18 defect.** `getConsentPolicy()` uses tokenless `apiFetch`, while `client.ts:167` says *"Public (no-token) calls are NOT the intended usage — use apiGet for those."* Behaviourally identical here (no `Authorization` header either way, asserted at `registrations.test.ts:88`) and `frontend/CLAUDE.md` names `apiFetch` as the route. **The stale comment is in `client.ts`** and should be corrected so the next implementer is not caught between two guides.
- **A-7 → T-22.** The disclosure heading is an `<h4>` and the only other heading on `/register` is the `<h1>`, an h1→h4 skip. `RegistrationForm.test.tsx`'s axe run renders the form standalone, where the h4 is the first heading and `heading-order` passes — **no test runs axe over the whole page.** Demote to `<h3>`/`<h2>`, or route to T-22.
- **T17-A3 revisited and dismissed for T-18.** The crops group also has no `tabIndex={-1}`, so the new wrapper **matches** the established precedent rather than diverging; the wrapper's first focusable child is the `tabIndex={0}` scroll region. Adding `tabIndex={-1}` to both would be an improvement; adding it to one would not.

**Final verification result:** **PASS on attempt 1.** 1 Implementer (2 dispatches — the second a Leader-error correction), 1 Reviewer, **0 rework rounds consumed.**


### Wave 7 dispatch — T-7 ‖ T-12, with T-6 deliberately held back

**Leader correction to the dependency reading.** At the wave 6 pause I told the user *"T-6 and T-12 are the only ones with no unmet deps."* **Wrong — T-7 is also unblocked** (deps T-1 ✓, T-3 ✓). That matters because T-7 is the critical path: T-8 → T-10 → T-11 gate behind it, and T-13, T-19, T-20, T-21 behind those. Delaying it would have idled the longest chain in the spec. Corrected before dispatch, recorded here because a Leader misreading the dependency graph is a scheduling defect even when nothing was built wrong.

**Three tasks are unblocked (T-6, T-7, T-12) and all three are backend — so the usual backend‖frontend pairing that has kept this run collision-free is unavailable.** Pairing was chosen on file and command disjointness instead:

| | Files | Runs `npm run build`? | Touches shared bootstrap? |
|---|---|---|---|
| **T-7** | `registrations/email-verification.service.ts` (+ spec) | No | No |
| **T-12** | `test/pii-boundary.spec.ts` | No | No |
| **T-6** *(held)* | `common/payload-cap.config.ts`, **`main.ts`, `lambda.ts`** | **Yes** | **Yes** |

**T-6 runs alone, after.** It edits the two entrypoints that nearly every other suite imports and it runs the build, which writes `dist/`. Running it beside another backend worker is precisely the failure the root guide describes — *"a measurement taken while an Implementer reinstalls dependencies is not a slow measurement, it is a **wrong** one — and it surfaces as an inexplicable error in the other worker."* Both dispatched workers were explicitly forbidden from touching `main.ts`/`lambda.ts` or running the build.

**Effort.** T-7 `xhigh` — concurrency, cryptography and a trap that defeated two consecutive revisions. T-12 `medium` — small, but prerequisite to a release gate. `tdd` assigned to T-7 **specifically, not blanket**: V-1a is only observable if the test is written to observe it.

**Review mode — T-7 gets parallel lens Reviewers, and this is where the budget I saved on T-5 gets spent.** `xhigh` effort selects it by rule, and unlike T-5 (whose risk was pinned by two mechanically checkable clauses) T-7's risk is open-ended judgment across six independent constraints. Planned lenses: **correctness against V-1…V-6**, **security/cryptographic**, and **test-adequacy** (does each constraint have its own non-vacuous evidence, per KZ-001). T-12 gets a single Reviewer.

**Facts supplied to T-7 so it does not spend the discovery:**
- **There is no SSM SDK anywhere in `backend/src`.** Despite §4.3's phrase *"SSM-sourced secret"*, the established pattern is a lazily-resolved env var that SAM populates at deploy time (`mail/mail.config.ts`, mirroring `auth/auth.config.ts`). Adding an SSM SDK would be the drift, not the fidelity.
- **T-7's secret inherits T3-A1's deployment gap.** Its HMAC secret env var lands in the same hole as `MAIL_TRANSPORT`/`MAIL_SENDER_ADDRESS`: absent from every SAM template, throwing at first use, invisible to every test. The Implementer was told to name the variable in its report so the escalation can be extended, and **explicitly forbidden from editing any SAM template** — that file is owned by no task in T-1…T-23, which is the whole substance of T3-A1.
- T-5's per-container throttler and §4.3's 3-sends-per-email-per-hour are **complementary, not redundant** — the latter is the control that survives cold starts.

**Told to T-12 as a report-don't-solve item:** once T-6 lands, *"mirrors the production bootstrap"* will mean **three** helpers, not two. T-12 must structure its correction so the third is a one-line addition, and report how invasive it would be — without implementing it.


#### Observation — the first **backend** flaky run of this spec, and it is probably the Leader's doing

T-12's Implementer hit a single Jest timeout in `backend/src/test/admin-actor-import.e2e.spec.ts` on one full-suite run, re-ran that suite alone (22/22 green) and the full suite again (48/48, 549/549 green), and attributed it to CPU contention from concurrent agents.

**Recorded deliberately as *not* a product flake, unlike the frontend one.** Three reasons to treat it differently from `(admin)/admin/actors/**/page.test.tsx`:

1. **It appeared under a condition this run created.** Wave 7 is the first time two backend Implementers have been active in the same package simultaneously — every prior wave paired backend with frontend precisely to avoid this. The root guide's warning is explicit that contention *"surfaces as an inexplicable error in the **other** worker."*
2. **The worker exceeded its brief in the way that produced it.** T-12's verification list was `npm test -- pii-boundary` plus eslint. It additionally ran the **full** suite — thorough, and I would rather have that instinct than not, but the full run is exactly the expensive measurement that collides. **My brief should have named the full-suite run as out of bounds while a sibling agent was active; it named only `npm run build`.** Leader gap, recorded.
3. **One occurrence, cleanly non-reproducible in isolation.** The frontend signature earned its status through four distinct assertion sites across two files over three waves. One timeout is not that.

**No entry added to the flake registry.** If it recurs in a *sequential* run it becomes a real finding; until then, treating it as a product defect would launder my own scheduling choice into a property of the codebase. **What does change: future briefs cap the verification at what the task needs while a sibling agent is active** — the full suite is a wave-closing measurement for the Leader to take in the quiet window, not a per-task one.


### T-12 — Correct `pii-boundary.spec.ts` to the production bootstrap

**Dispatched** with effort `high`, skills `nestjs-expert` + `systematic-debugging`, single Reviewer on the lens checklist.

#### Attempt 1 — `STATUS: PASS`

**Delivered.** `new ValidationPipe({transform: true, whitelist: true})` → `createValidationPipe()`, plus `configureBodyParser(app)`; app type widened to `NestExpressApplication`; the false comment replaced. **No `it()` block, expectation or fixture was touched** — the Reviewer confirmed all ten tests, both scan helpers, `FORBIDDEN_KEYS` and `LEAKABLE_PII_VALUES` are byte-identical, and reconciled the count as 3 (`/actors`) + 4 (`/actors/:id`) + 3 (`/metrics`).

**Fidelity verified against the real entrypoints, not asserted:** the helper order matches `main.ts:16-18` and `lambda.ts:24-26` exactly — `setGlobalPrefix('api/v1')` → `useGlobalPipes(createValidationPipe())` → `configureBodyParser(app)` → `init()` — and matches the established reference harness `admin-actor-import.e2e.spec.ts:543-548` line for line. `NestExpressApplication` is **forced, not stylistic**: `useBodyParser` does not exist on `INestApplication`. `createNestApplication<T>()` is a type parameter only — with no adapter argument Nest already instantiates an `ExpressAdapter`, so the runtime app is unchanged.

#### The central question — the corrected bootstrap has **zero behavioural coverage**, and that is correct for this task

**The Implementer diagnosed this rather than reporting a bare green.** Nothing went red, and instead of stopping there it established *why*: no `it()` in the suite triggers a validation failure at all. The Reviewer confirmed independently — **every request is a bare `GET` with no body and no query parameter**, so neither `createValidationPipe()`'s `exceptionFactory` (`validation-pipe.ts:96-102`) nor its body-shape guard (`:81-87`) ever fires, and `configureBodyParser` is likewise inert because both `useBodyParser('json', …)` and `normalizeServerlessJsonBody` only act on a request with a body. **Both helpers are correctly wired and behaviourally unexercised.**

**Ruling, delivered without hedging as asked: a behavioural assertion is out of scope for T-12 and must wait for T-13.** Three reasons, and the second is the one I had not seen:

1. **KZ-002 is satisfied, not evaded.** Its standardized form forbids *recording an unevaluated property as covered*. T-12's Done-when never claims coverage of the `details` envelope — it claims the bootstrap and the three existing paths. The Coverage table assigns DC-2's behavioural proof to T-13. *"T-12 is scaffolding for a gate; it is not the gate."*
2. **An ad-hoc test here would be wrong-shaped, not merely premature.** §6.2 requires the scan be derived from the route table with a **total** fixture map — *"the gate is the totality assertion, not the enumeration"* (RA7/C-9) — and the `429` assertions to live in an isolated describe with a dedicated app and reset limiter (B28). A hand-written `400` case dropped into the shared `beforeAll` app **is precisely the enumeration pattern T-13 must then unpick, in the same file, as its only file.** Scope creep with a rework cost, not cheap insurance.
3. **My framing of the regression window was wider than the facts.** I put it to the Reviewer that nothing protects the fix. The factory's envelope **does** have behavioural coverage elsewhere today — `common/validation-pipe.spec.ts` (the `exceptionFactory` directly), `registrations/dto/registration-create.dto.spec.ts` (DTOs through the production pipe by name), and both `admin-actors.e2e.spec.ts` and `admin-actors-crud.e2e.spec.ts` assert `details` bodies over HTTP. **What is unprotected is this file's use of the helper, not the helper.** And T-13 depends on T-12, targets the same single file, and ships in the same PR — the window closes inside one PR. *"The correct instrument for that residual risk is the dependency you already enforce, not a test T-13 would delete."*

**T-6 interaction, answered as report-don't-solve:** the diff leaves T-6's insertion slot free and unobstructed. `configureBodyParser` sits after the pipe and **before `await app.init()`**, matching the helper's own contract (`body-parser.config.ts:114-122`); T-6's payload cap must be inserted **before** that line, and adding it here will be a single import plus a single call, in the same shape as this diff. The ordering is load-bearing rather than cosmetic — `app.use()` registers into Express at call time, the same mechanic behind `judgment.md` C-2.

**Verification (Implementer's; the Reviewer states plainly it ran no suite):** `npm test -- pii-boundary` → 1 suite / 10 tests · eslint `--quiet` clean · full suite 48 suites / 549 tests. Note the Implementer used the non-mutating `npx eslint … --quiet` form the root guide requires for a diff under review, not `npm run lint`.

**Project audit gates:** no serializer, policy, route or fixture changed — `FORBIDDEN_KEYS` still derives from `PII_ALLOWLIST ∪ NEVER_PUBLIC_FIELDS`. No AWS command, no IaC, no frontend, no tokens, no Prisma or migration. Test-only diff; nothing under production `src/**` changed.

#### ADVISORY findings

- **T12-A1 → fold into T-13.** One clause of the new comment overreaches: *"so the `details` array DC-2 inspects **is actually rendered here**"* is true read as *"this app is configured such that a validation failure would render it"* and false read as *"this suite renders it."* A T-13 implementer skimming for prior art could take the second reading. Suggested tightening, which makes the comment fully checkable against the file: *"…so a validation failure in this app renders the production `details` envelope — a bare `new ValidationPipe({...})` does not attach it. **No test in this suite currently triggers one; the `400`/`429` bodies are asserted in T-13.**"*
- **T12-A2 → T-13.** The file's doc header opens *"T-9 — End-to-end PII-boundary + consent integration tests"*, and its `T-4/T-5/T-6/T-7` references belong to **`actors/registration-source-and-consent`'s** numbering, not this spec's. Ambiguous rather than actively wrong, and **deliberately left alone**: T-12's scope names one comment, and T-13 rewrites that header region anyway. Requalify it there so the two specs' numbering stops colliding in one file — making T-12 relitigate it would invite the file-wide comment churn that makes a prerequisite diff hard to audit.

**Final verification result:** **PASS on attempt 1.** 1 Implementer attempt, 1 Reviewer, **0 rework rounds consumed.**


### T-7 — OTP service under constraints V-1…V-6

**Dispatched** with effort `xhigh`, skills `nestjs-expert` + `tdd` (Leader-assigned for this task specifically) + `systematic-debugging`. **Review mode: three parallel lens Reviewers** — correctness against V-1…V-6, security/cryptography, and test-adequacy — selected by the `xhigh` effort rule and by the security surface. This is the budget deliberately saved on T-5.

#### Attempt 1 — `STATUS: FAIL` (2 of 3 lenses)

| Lens | Verdict |
|---|---|
| Correctness against V-1…V-6 | **PASS** — 5 advisories |
| Security / cryptography | **FAIL** — 1 issue, 6 advisories |
| Test adequacy | **FAIL** — 4 issues |

**The split is the finding.** The correctness lens read the service and passed it — correctly: it verified V-1…V-6 against the source, confirmed all five DC-20 parameters, and confirmed all four §4.3-rejected mechanisms are absent. The test-adequacy lens read the **fake Prisma** and found the evidence does not discriminate. **A single Reviewer would very likely have done the first and not the second**, because the service is the interesting artifact and the harness looks like plumbing. That is the case for parallel lenses, made concretely rather than in principle.

##### FAIL 1 — test adequacy: two named regression tests do not fail when their defect is present

**One root property:** the fake Prisma destructures only `{ where }` and **silently ignores every clause it does not implement** — `take`, `orderBy`, and any unknown `where` key.

- **The RA4 regression test passes with RA4 present.** Written the way Prisma naturally expresses "latest row wins" — `findMany({ where, orderBy: {createdAt: 'desc'}, take: 1 })` — the fake ignores **both** clauses and returns both rows; `verifyCode` then matches the older row and the assertion passes. **Trap (a) is satisfied literally** — the fixture really does assert two rows — **and is still not sufficient**, because the fake destroys the discrimination the two-row fixture exists to provide.
- **A canonical S-1 shape also slips through.** Adding `codeHash: submittedHash` to the `findMany` where — the literal S-1 defect — changes nothing, because the fake filters on `email`/`consumedAt`/`expiresAt` only.
- **V-1a's "fresh read" is the same object.** `seedRow` pushes `row` into the backing array and returns *that reference*; `rows.find(...)` returns it again, so `expect(freshRead.attempts)` is byte-equivalent to `expect(row.attempts)`. And the fake exposes **no `$transaction` and no undo**, so a rollback is *unrepresentable* — the read cannot observe one because none can occur. **This is trap (b) wearing a disguise**, and the in-file comment claimed the opposite in terms: *"a real post-rollback-shaped check rather than a same-object illusion of durability."*
- **V-6's logging test is vacuous** — the service emits nothing, so `emittedText` is `''` and both `not.toContain` assertions pass on an empty string. The **A5 shape verbatim**, in the same spec that named A5.
- **5 attempts and 3 sends/hour are asserted against themselves.** Set `OTP_MAX_ATTEMPTS = 0` and the suite stays green.

##### FAIL 2 — security: the send cap is a check-then-act race

`count(...)` then `create(...)`, two statements with nothing making the pair atomic. C concurrent requests read the same stale count and all insert, yielding C live codes instead of 3. Budget rises from 15 to **5C comparisons/hour**: at C=30 expected time-to-compromise falls from **7.6 years to ~9 months**; at C=300, to **~28 days**. The per-container throttler cannot compensate — that is exactly why §4.4's table names this cap the *only* shared control on `POST /verify`. Second harm, and not brute force at all: §4.3's stated purpose is *"Stops mail-bombing"*, and a burst delivers C messages to an unconsenting third party from a verified CGIAR sending domain.

The sharpest observation in the report: **the file argues the read-then-write danger at length for `consumeCode` (V-4, lines 44-50) and the identical hazard sits unremarked in `issueCode`** — where the second observer is not a duplicate success but an unbounded one.

##### Leader adjudication — why the security finding counts as conformance, not advisory

The lens fairly noted that **V-1…V-6 never state an atomicity constraint for issuance**, so the Implementer built what was specified, and offered to route it as a design amendment instead. I ruled it in scope for rework:

- §4.4's DC-19 table designates this cap the **only** shared control on `POST /verify`;
- **this spec's own C-4 standard** is that a control which does not hold across containers **is not a shared control**;
- §4.3 asserts the cap *"holds across containers where the throttler does not"* and *"stops mail-bombing"* — the implementation delivers neither under concurrency.

So the code contradicts a design claim the task traces to, which is conformance. **Recorded as a genuine spec gap all the same:** §4.3's constraint table covers the attempt counter (V-1, V-1a) and the consume (V-4) but never issuance. If a future revision of this design is written, issuance atomicity belongs in that table as a numbered constraint. **Not amended mid-execution** — unlike T-3's contradiction and T-4's impossible primitive, this is a *missing* constraint rather than a wrong one, and adding constraints to an approved decomposition mid-run is a scope change, not a correction.

##### Effort deliberately NOT bumped to `max`

The rework rule says bump one level per retry; the tier↔effort rule forbids `max` on a T2 tier and says escalate the tier instead. Here the two rules point the same way anyway: **the failure was not under-thinking about the service** — the service passed its lens — **it was a permissive test harness with a precisely named remedy.** Attempt 2 got precision in the brief instead of more effort.

##### Carried out of T-7 deliberately

- **`EmailVerificationService` is not registered as a provider**, and `registrations.module.ts` imports no `PrismaModule` (`providers: [RegistrationsThrottleGuard]` only). T-7's `Files:` names the service + spec; T-8's names the controller/service. **No task owns the module wiring** — the same unowned-gap class as L-ERR-2. **Assigned to T-8 explicitly**, so it lands deliberately rather than as a DI resolution error.
- **`OTP_HMAC_SECRET` joins the T3-A1 escalation** — third env var that throws at first use and appears in no SAM template.
- Advisories deferred: minimum-entropy validation on the secret; HMAC domain separation (`email + ':' + code`) to make S-1's rejection structural rather than conventional; row retention/purge; key rotation with a dual-key read path.

##### Verified-correct properties the rework brief protects explicitly

Listed in the brief so attempt 2 cannot destroy passing work: `verifyCode` takes **no `tx`** and writes through `this.prisma` (load-bearing — `PrismaService` is a bare `extends PrismaClient` with no `$extends`, no extension, no AsyncLocalStorage, so there is no ambient transaction propagation); the mismatch `updateMany` touching **every** live row, which is what holds the budget at 15; `consumeCode`'s single conditional write; no `orderBy`/`take`/recency term in the lookup; `safeEqualHex`'s length guard before `timingSafeEqual`; no fallback for the secret, with a falsiness test so `""` also throws.


#### ⚠️ Leader error — L-ERR-4: my remediation instruction would have shipped the defect a fourth time

**What I did.** In the attempt-3 brief I instructed the Implementer to *"remove the `$transaction` wrapper around `issueCode`"* and to *"not leave a vestigial lock"* — treating the wrapper as part of attempt 2's failed advisory-lock apparatus. I also handed it the mechanism, citing MySQL's documented affected-rows contract (1 insert / 2 changed / **0 unchanged**) as the cap signal.

**Both halves of that instruction were wrong, in the same direction: silently disabling the cap.**

| My instruction | What it would have shipped |
|---|---|
| Decide from `affectedRows === 0` | **The cap never fires.** The Implementer tested against live dev RDS before writing service code: `affectedRows` for a known-unchanged update returns **1**, not 0 — documented `CLIENT_FOUND_ROWS` behaviour. `0` never occurs on this connector, so the cap-hit branch is unreachable and every call succeeds forever |
| Remove the `$transaction` wrapper | **The cap never fires.** MySQL user variables are **connection-scoped**. Without the wrapper, `$executeRaw` and `$queryRaw` are two independent checkouts from Prisma's pool (`connection_limit` defaults to `num_cpus * 2 + 1`, so >1 in every realistic runtime). `SELECT @newSends` frequently lands on a connection where the variable was never assigned → MySQL returns `NULL` → `Number(null)` is **`0`** → `0 > 3` is false → every call accepted |

The concurrency lens's verdict on the second one is worth quoting exactly: *"Removing the wrapper is not a simplification; it is the same bug a third time."*

**Why it did not ship.** The Implementer tested my documented-contract citation empirically instead of trusting it, and **told me directly that it was defying my instruction on the wrapper rather than complying quietly** — asking me to check its reasoning. I ruled in its favour before the lens saw it, on the asymmetry that `GET_LOCK` is released *by an explicit statement* Prisma emits before `COMMIT`, whereas an InnoDB row lock is released *by* `COMMIT`. The lens upheld that and corrected my ruling as **understated**: I called the wrapper harmless-and-incidental; it is **load-bearing**, because the connection pinning *is* the mechanism.

**The pattern, now three for three.** L-ERR-2 (a scope guard that created the gap it was meant to prevent), L-ERR-3 (a flake signature quoted from memory for the third time), and now L-ERR-4 — **every one caught by an Implementer declining to let a Leader instruction pass unexamined, and none by a gate.** In this case the Implementer was carrying an instruction from the party who adjudicates its FAILs, on its final attempt before a HALT, with every incentive to comply. It pushed back anyway and was right. That asymmetry is worth naming: the process's error-correction did not come from the reviewer tier, it came from the worker refusing deference.

**Standing correction for the remaining tasks.** When I hand an Implementer a *mechanism* rather than a *constraint*, I am doing the design work the task explicitly assigns to them (`design.md` §4.3: *"The Implementer chooses the mechanism and records it in `execution.md` with evidence"*). Both halves of this error came from that overreach. **For T-6, T-8, T-10, T-11 and T-13, brief the constraint and the evidence bar; leave the mechanism to the worker who will test it.**


#### Attempt 3 — split verdict: concurrency `STATUS: PASS` · test adequacy `STATUS: FAIL` → **HALT, rework ceiling reached**

**Mechanism shipped.** `GET_LOCK` deleted entirely (grep-confirmed: only doc-comment narrative remains, no executable vestige). Replaced by a new `EmailSendBudget` table (composite PK `(email, windowStart)`) driven by one atomic statement — `INSERT … VALUES (…, (@newSends := 1)) ON DUPLICATE KEY UPDATE sends = (@newSends := sends + 1)` — then `SELECT @newSends` on the same pinned connection, deciding in application code.

**Migration verified by the Leader from disk, not from the report:** one `CREATE TABLE` with its composite PK, `utf8mb4_unicode_ci`; **zero** matches for `DROP`/`MODIFY`/`ALTER TABLE`/`UPDATE`. Additive-only per `backend/CLAUDE.md`. No drift or reset prompt occurred.

**Leader's quiet-window measurement (taken with the tree idle, per the concurrency protocol):** backend **49 suites / 567 tests** — reconciling exactly against the 48/549 baseline (+1 suite, +18 tests) · eslint `--quiet` exit 0 · `npm run build` exit 0. `admin-actor-import.e2e.spec.ts` passed in 10.3 s, confirming the earlier timeout was contention from the Leader's own parallelisation and not a product flake.

##### Concurrency / security lens — `PASS`

Traced the duplicate-key path and found no over-accepting route: `INSERT … ON DUPLICATE KEY UPDATE` takes an **exclusive** lock (not shared) on the clustered PK record, so the second caller blocks and then performs a **current read** under the X lock — not a snapshot read — seeing the committed value regardless of isolation level. Attempt 2's window is structurally closed because **there is no release statement to mistime**: an InnoDB row lock is released *by* `COMMIT`, whereas `GET_LOCK` was released *by a statement Prisma emitted before* it. Prisma's default 5000 ms budget is now safe because no deliberate wait exists; a contended waiter costs one round trip plus a commit, and Prisma's expiry fires before `innodb_lock_wait_timeout`, giving a clean rollback. R-1 connection pressure is materially reduced versus attempt 2. All four verified-correct properties of `verifyCode`/`consumeCode` confirmed untouched.

##### Test-adequacy lens — `FAIL`, one issue, one-line remedy

**All three attempt-2 findings verified closed, not taken on assertion:** the self-referential lock-name test is gone (`realHash()` is a legitimate independent oracle, not a re-typed copy); the twelve spies are declared **and** all folded into `allCalls`, with all twelve restored in a `finally`; and **the mutation arithmetic holds for the first time** — 10/18 and 3/18 both re-derived independently from source, with no fourth failing test. The `createdAt`-tie account was confirmed coherent, and the sweep I asked for came back clean: **nothing previously passing depended on the old tie-ordering**, because the service issues no `orderBy`, the fake's allow-list has no `createdAt` key, and `verifyCode` disambiguates by hash, so row order is unobservable on the unmutated path.

**The blocking finding.** The fake's `$queryRaw` resolves **without a `tick()`** while `$executeRaw` has one. That collapses the INSERT→SELECT round trip to zero, so each caller runs its increment, its read **and its cap decision** inside the microtask drain following its own `setImmediate` — there is never an interleaving point between capture and read. Consequences:

- **The per-invocation closure is never exercised.** The file's header and the `$transaction` doc comment both assert that a naive shared variable *"would let one concurrent caller's capture leak into another's read"* and that per-invocation scoping *"is what makes it a faithful model."* **Both are false under the fake's own timing** — a module-level shared variable produces the identical 1,2,3,4,5 sequence and the test stays green. The file's central faithfulness claim has zero test consequence.
- **Round 2's mechanism — the one measured against live RDS at 1 accepted out of 8 — also passes.** The only thing preventing a port of it is a `$queryRaw` guard requiring the literal substring `@newSends`: **a spelling check on the implementation, not a behavioural one.**
- Two things do genuinely discriminate: attempt 1's bare `count`-then-`create` fails (5 ≠ 3), and **the Leader's `affectedRows === 0` recommendation fails** (the fake returns `1` unconditionally, faithfully encoding the measured connector behaviour). So the model is *convenient*, not *fair* — **generous in precisely the direction where reality bit.**

*Violated:* `judgment.md` C4 (*"Gates blind to their defect class"*); `general-setup/task.md` § Testing & Verification (*"a property the harness structurally cannot evaluate is not covered"*); the same principle as T-7's own disqualifying trap (a).

**Minimum change, with all three outcomes traced by the Reviewer:** add `await tick();` as the first statement of the fake's `$queryRaw`. The shipped implementation stays green (each caller's captured closure value survives arbitrary interleaving); a shared module variable goes red (every caller reads 5 → 0 accepted); round 2's read-the-row-back goes red the same way, reproducing the observed 8→1 collapse. One line converts two header assertions into load-bearing test properties.

##### Advisories carried, non-blocking

- The fake's `$executeRaw` `return 1;` silently encodes the empirical *"this connector never returns 0"* finding. Unmarked, so a future maintainer could "correct" it to 0 and let an `affectedRows === 0` implementation pass. One comment.
- `seedRow` does not use the monotonic `createdAtTick`, so two seeded rows can still tie — harmless today (V-3 sets both explicitly), but it is the same trap one function away.
- 12 of ~17 log surfaces spied; static `Logger.{error,warn,debug,verbose,fatal}` and `process.stdout.write` remain. Not blocking — the service imports no `Logger` at all.
- **ADVISORY (concurrency lens) — `EmailSendBudget` must be named in the deferred retention item.** The existing deferral names only `EmailVerification`. The new table's population is **strictly broader**: it increments even for **rejected** attempts, so it persists addresses to which nothing was ever sent, including ones an attacker merely probed. No TTL, no `createdAt`. With `email` as the leading PK column, pruning by `windowStart` is a full scan.
- **ADVISORY — the class doc forward-references records that did not exist when written** (`design.md`/`execution.md` citations for the fixed-window trade). Discharged by this entry; noted because it is the **A30** defect this spec named against itself.

##### Recorded deviations from the design

1. **Fixed hourly bucket, not a rolling window.** Up to `2 × 3 = 6` sends can straddle a boundary, versus `design.md:282`'s *"3 per hour"*. Deliberate: a rolling window cannot be folded into one conditional statement, so it reintroduces the read-then-decide step that is the entire defect being fixed. The concurrency lens ruled it acceptable — fixed-window counting is a standard limiter and its 2× boundary burst is the textbook known weakness; for a control whose purpose is *"stops mail-bombing"*, 3 versus a worst-case 6 messages per hour is not material to the threat.
2. **Mechanism substitution against `design.md:329`**, which names the shared `POST /verify` control as *"per-email send cap on `EmailVerification` rows"*. A dedicated counter table satisfies the property §4.4 actually requires — shared and cross-container — and satisfies it strictly better. Recorded per §4.3's standing requirement that the Implementer's chosen mechanism be documented here with evidence.
3. **Fail-closed on partial failure:** if the budget increments but `EmailVerification.create` fails, the budget is consumed with no code issued, and no compensating decrement is attempted. The ordering is load-bearing — create-then-increment would make the cap bypassable by inducing failures — and a decrement is itself a write that can fail.

##### HALT

**3 Implementer attempts, 7 Reviewer lens reports, 3 rework rounds consumed — the hard ceiling. T-7 is marked `[~]`, not `[x]`.**

Attempt 3's FAIL is **genuine and independent of L-ERR-4**: the Implementer caught both halves of my wrong instruction before they shipped, so my errors did not cause this failure. The remaining defect is its own, is narrow, and has a one-line remedy with three traced outcomes.

**Not carried to `[x]` on the strength of one PASS.** The lens that failed here is the same lens that failed attempts 1 and 2; closing the task on the concurrency PASS alone would leave open precisely the gap that lens exists to cover. **Escalated to the user** with a recommendation to authorise one bounded further attempt scoped to the single line, per the Pivot Protocol.


#### Attempt 4 — `STATUS: PASS` (user-authorised beyond the ceiling)

The user authorised **one bounded attempt** past the 3-attempt ceiling, scoped to the single test-adequacy finding. Four closed items: `await tick()` as the first statement of the fake's `$queryRaw`; a load-bearing comment on `$executeRaw`'s `return 1;`; `seedRow` drawing from the same monotonic `createdAtTick` as `create()`; and a re-check of the two doc comments the previous lens had shown to be false. **Only `email-verification.service.spec.ts` changed** — 53 insertions / 13 deletions, with the service, config, schema and migration frozen and confirmed untouched.

**The finding is closed by construction, not by assertion.** The Reviewer hand-traced Node's event loop rather than accepting the fix: five callers register immediates #1–#5 before the loop turns; in **check phase 1** each resumes inside `$executeRaw`, increments the shared row, writes `sessionNewSends` into **its own** `$transaction` closure, then hits `$queryRaw`'s new `await tick()` — and an immediate scheduled *during* the check phase is deferred to the next iteration, so every caller suspends before reading. Captures land as 1,2,3,4,5 and the row ends at 5. In **check phase 2** each reads back its own value; three accept, two throw. **Every increment now completes before any read** — the legal worst-case MySQL interleaving, pinned deterministically.

**The two previously-false claims are now true and load-bearing.** Hoisting `sessionNewSends` to `buildFakePrisma` scope leaves it at 5 after phase 1, so all five readers see 5 and **zero** accept against an assertion of exactly 3. The Reviewer independently counted the file's 18 tests and confirmed M1's 18/18 and M2/M3's 1-of-18 are the numbers the code **must** produce.

##### The three mutations were run, not predicted — and one deviated

I asked the Implementer to execute the three outcomes the previous lens had traced by reading, on the grounds that this task's own history is of documented contracts and plausible models failing under measurement. It did, and **M3 came back 0 accepted, not the predicted 1** — and it reported the discrepancy rather than rounding to the prediction.

**The Reviewer ruled the explanation correct, not a rationalisation.** Real RDS produced 1 accepted because network jitter let exactly one `SELECT` beat the other commits; the fake's two-tick schedule is a **hard barrier**, so no read can precede any write and the defect manifests at its theoretical maximum. Same defect class, deterministic worst case. **The asymmetry favours safety:** passing this fake requires a mechanism to carry each caller's own position through a point where the shared row already holds the final tally — strictly harder than production. Masking would need a defect that manifests only under *partial* overlap, which the Reviewer could not construct, since any mechanism needing a read to win a race is by definition the round-2 defect. And round 2 is not a mechanism that "would work in production" — it was **measured** broken at 1-of-8.

##### The substring guard — the previous lens's complaint is now false on both axes

A **real** round-2 service would send `SELECT sends FROM EmailSendBudget WHERE …`, fail the `@newSends` guard, throw, and drive `succeeded` to 0. **So a real read-back implementation is caught, and catching it no longer depends on hand-building a mutation.** The Reviewer's precise distinction, worth keeping: it is caught by the *guard* (which pins the service) while M3's fake-side mutation proves the *fake's fidelity* is load-bearing. Both axes hold; the complaint that "round 2 also passes" is false on each.

##### A gap in its own evidence, volunteered unprompted — for the third time in this task

The Implementer recorded, without being asked, that **the 4-distinct-email test cannot catch the shared-variable mutation**: with four different emails every writer's own value is `1`, so even a shared variable holds `1` for every reader regardless of order. That test isolates per-**email** keying, never per-**invocation** session scoping. The Reviewer confirmed the reasoning and swept for further gaps of that class — `>` → `>=` (red twice), rows created before the budget check (red), non-per-email keying (red on the distinct-email test) — and found none beyond the advisories below.

##### Regression sweep on the change itself

The extra tick lengthens **every** `issueCode`, not only concurrent ones. The only timing-sensitive assertion is the 15-minute expiry test, and it is immune: `expiresAt` derives from a `now` captured **before** the transaction, so the added tick cannot inflate the delta. No test inspects mid-`issueCode` state, no fake timers are in use, nothing became order-dependent. `createdAtTick` is a describe-scope binding and the injected closure captures the *binding*, so the `beforeEach` reset order is irrelevant; monotonicity across both producers holds because a later call has non-decreasing `Date.now()` **and** a strictly larger tick.

**Leader's quiet-window measurement:** backend **49 suites / 567 tests** · eslint `--quiet` exit 0 · `npm run build` exit 0. `admin-actor-import.e2e.spec.ts` green again at 10.9 s, a third clean sequential run.

##### ADVISORY findings

- **T7-A7 — diagnostic quality of the round-2 catch.** A real read-back implementation goes red via the `@newSends` substring guard (*"unrecognized SQL"*), not via the cap assertion. Still red, but the message points at the fake rather than the semantics. One sentence in the guard's `throw`, naming why a non-`@newSends` read **is** the round-2 defect and not a fake limitation, would make the failure self-explaining.
- **T7-A8 — a type-fidelity gap the fake structurally cannot see.** The fake returns a JS `number` and always exactly one row; the service declares `Array<{ newSends: bigint | number }>` and wraps in `Number(rows[0]?.newSends)`. Deleting `Number()` (real connector `bigint` → `bigint > number` TypeError) or an empty result (`Number(undefined)` → `NaN > 3` is `false` → **always accept**) are both invisible here. Covered in practice only by the 6-trial real-RDS runs. **This is the fourth distinct place in this task where an unchecked decode would silently disable the cap** — the pattern is now the task's defining hazard and belongs in any future hardening.
- **T7-A9 — the fixed-window deviation is untested.** `sendBudgetWindowStart` has no test and no test exercises rollover. Given it is a **recorded deliberate deviation** from §4.3's rolling window, it is the single behaviour a future reader is most likely to "fix" unknowingly.
- **T7-A10 — wording nit.** The `$queryRaw` comment says that without the tick *"N concurrent calls would finish end-to-end one at a time"*; they would still suspend on `create()`'s tick. The load-bearing half — *"no interleaving point between a caller's capture and its read"* — is exactly right; only "end-to-end" overstates.
- **Carried forward, unchanged:** `EmailSendBudget` must be named by name in the deferred retention item (it persists addresses for **rejected** attempts, so its population is strictly broader than `EmailVerification`'s, with no TTL and no `createdAt`); HMAC domain separation; minimum-entropy validation on `OTP_HMAC_SECRET`; key rotation; the five remaining static log surfaces; and **`EmailVerificationService` is still not registered as a provider — assigned to T-8.**

**Final verification result:** **PASS on attempt 4.** 4 Implementer attempts, **8 Reviewer lens reports** across 4 rounds, **3 rework rounds consumed plus one user-authorised bounded attempt.** The most expensive task of the run, and the only one to reach its ceiling.


#### ⚠️ Record corrected — T5-A5's "no lingering-timer hazard" premise no longer holds

Under T-5 I recorded, on that lens's finding: *"No lingering-timer hazard: `ThrottlerStorageService.onApplicationShutdown` clears all timeouts and **both suites call `app.close()`**."* That was true of the two suites T-5 shipped. **It is no longer true of `lambda-handler.e2e.spec.ts`**, which T-6 extended with the T5-A1 obligation.

`@nestjs/throttler`'s `ThrottlerStorageService.setExpirationTime` (`dist/throttler.service.js:25-33`) creates a plain `setTimeout(ttl)` per hit and **does not `unref()`** it; the timers are cleared only by `onApplicationShutdown`, which requires `app.close()`. `lambda.ts:17` caches the handler in module scope and never exposes the app, and that spec file has no `afterAll` — so the T5-A1 test's ~22 hits at a 60 s TTL leave ~22 live timers after the last assertion. `package.json`'s jest config sets no `forceExit`.

**Attribution, in two parts.** The *open-handle warning* is pre-existing — the file's two original tests already bootstrapped an app it never closed, and the Implementer reported that honestly. The *lingering-timer* half is **new, and the Implementer did not report it**; the evidence lens found it. Not a defect in T-6's deliverable — the timers are an artefact of the harness, not of the payload cap — and the honest fix (an `afterAll` closing the cached Lambda app) addresses a gap that predates this task.

**Deliberately kept out of T-6's rework scope** so a narrow security fix stays narrow. Recorded here instead, because the T-5 note will otherwise be read as current. **Carry to T-13**, which owns the next substantial work in the e2e harnesses and will be driving `429`s of its own under B28 discipline.

**Also worth recording as a positive:** T-6 **discharged the T-12 carry-forward**. `pii-boundary.spec.ts:13,285` now calls `configurePayloadCap(app)` in the correct pre-parser position, and the comment names all three helpers. The one-line addition T-12 was structured to enable was actually made — the release gate still mirrors production. The evidence lens confirmed the suite issues **no** `POST`/`PUT`/`PATCH` at all, so every request lands in the bodyless carve-out and the addition changes no behaviour in the gate while keeping it faithful.


### T-6 — Payload cap through a shared `common/` helper, both entrypoints

**Dispatched** with effort `high`, skills `aws-serverless` + `nestjs-expert`, run **alone** — it is the only task that edits both shared bootstraps and runs the build. **Review mode: two parallel lenses** (mechanism/security, evidence adequacy).

**Brief written to constraints, not mechanism** — the first application of L-ERR-4's standing correction. I told the Implementer explicitly why: twice in this spec I handed over a mechanism and both times it was wrong in a way that would have silently disabled the control.

#### Attempt 1 — mechanism `FAIL`, evidence `PASS`

##### The FAIL: P-2's matcher was case-sensitive; Express's router is not

`isRegistrationsPath` compared `req.path` with `===`/`startsWith` against a lowercase literal. `express/lib/application.js:69-81` builds the router with `caseSensitive: this.enabled('case sensitive routing')`, Express does not set that flag by default, and **nothing in `backend/src` sets it**. So `POST /API/V1/REGISTRATIONS` **routes to `RegistrationsController`** while the matcher returned `false`, the middleware called bare `next()`, and the request fell through to the global 8 MB limit — the exact fall-through P-3's docblock names as the thing to prevent. **The same short-circuit skipped the `chunked` rejection, so P-3 was bypassed by the same trick.**

A **bypass, not an over-match**: RA8's failure mode in a narrower form — not *"disabled everywhere"* but *"disabled for any caller who shifts one character to uppercase"*, which is zero effort for the hostile client FR-7 says the guarantee must hold against. On the deployed path nothing normalises it; API Gateway forwards `rawPath` verbatim.

**Where the blind spot was, and it is not carelessness.** The Implementer's suite tested both axes the spec names — the un-prefixed RA8 trap (**inverted, deliberately**, so a matcher with that bug would fail) and the `/api/v1/registrationsX` false positive. **The case axis appears in no document in this repository.** It was found by a lens that went and read `express/lib/application.js` rather than reasoning about the matcher in the abstract. A gap in the spec's own trap list, not in the reading of it.

#### Attempt 2 — `STATUS: PASS`

The fix lower-cases `req.path` before comparing. **The Reviewer did not accept that as obviously sufficient** — I had asked it to probe Unicode case folding, and the answer is favourable for a non-obvious reason worth preserving:

> `path-to-regexp@8.4.2` `dist/index.js:279` — `new RegExp(pattern, sensitive ? "" : "i")`. **The `i` flag without `u`.** In non-Unicode mode, ECMA-262 `Canonicalize` returns the character unchanged when `ch ≥ 128` and its uppercase is ASCII — so `/k/i` does **not** match `K` (U+212A) and `/s/i` does not match `ſ` (U+017F). The router's "case-insensitive" is effectively **ASCII-only**. *Had `path-to-regexp` passed `u`, simple case folding would apply and `/api/v1/regiſtrations` would route while `toLowerCase()` left `ſ` alone — a genuine bypass. It does not pass `u`.*

The two criteria therefore agree exactly, in both directions, because the prefix contains **no `k`** (U+212A is the only non-ASCII character that lower-cases into ASCII and could align). **No residual bypass, and not even a reachable over-match today.**

**All three new case-variant tests go red against the pre-fix matcher for the right reason** — the short-circuit leaves `mock.calls[0][0]` undefined, and the handler test would 404 rather than 413 because `POST /registrations` has no route yet.

##### Two claims corrected because they were false, not merely imprecise

1. **The P-3 harness-substitution justification was over-broad.** The Implementer had found — and the evidence lens verified against `serverless-http/lib/request.js:16-18` — that the synthetic request auto-injects `Content-Length` from the materialised body, so a length-less request cannot reach the deployed handler. True, and it justified writing `payload-cap.e2e.spec.ts` with raw `http.request` over real TCP (supertest and superagent both auto-compute the header and **structurally cannot construct the case**). **But `declaresNoLength` tests `transfer-encoding` *before* `content-length`, and `create-request.js:34-37` forwards event headers verbatim** — so a declared `chunked`, or a malformed `content-length: 'abc'`, **does** reach the middleware intact through the real handler. Only the **absent**-`Content-Length` sub-case is unreachable there. Two real-handler P-3 tests added, and the in-file claim narrowed to its true form.
2. **The "at exactly the cap" test was 6 bytes under the cap** and could not catch an off-by-one. Now `CAP - 14` with an explicit `expect(Buffer.byteLength(...)).toBe(CAP)`, and a `>` → `>=` flip would fail in **two** places.

**Also tightened:** `/^\d+$/` replaces `Number()` for the length parse. The Reviewer checked the direction that matters — **it rejects nothing legitimate**: RFC 7230 is `1*DIGIT`, llhttp admits only digits, leading zeros still pass, and values above `MAX_SAFE_INTEGER` pass the regex then fail the size check, which is the safe order.

##### T5-A1 discharged — the last carried obligation that could reach production alone

20 GETs from one `sourceIp` (all 200), the 21st → `429` in the documented envelope, then one from a **different** `sourceIp` → 200. The evidence lens confirmed that last assertion is what falsifies the failure mode: under a lost `req.ip` every caller hashes to one key, so the second caller is hit 22 against an already-blocked bucket → 429 → red. The mechanism checks out too — `create-request.js:14-19` reads `event.requestContext.http.sourceIp`, and `request.js:20-21` assigns it as an **own** property shadowing Express's prototype accessor. **`sourceIp` resolves per-caller under Lambda; 20 req/min is not a global self-DoS.**

##### The ordering proof, upheld under adversarial checking

An oversized **non-JSON** body returning `413` proves the cap runs upstream, because the counterfactual is traceable: body-parser skips on `complete: true`, 32,769 bytes is far under the 8 MiB limit so its own 413 cannot fire, no truncation path exists, no 500 path exists — so `JSON.parse` would throw and yield **400**. *"413 is uniquely attributable to the cap running upstream of the parser."* That single test also pins the `configurePayloadCap` → `configureBodyParser` ordering in `lambda.ts`.

**Leader's quiet-window measurement:** **51 suites / 595 tests** — reconciling exactly (+2 suites, +28 tests over 49/567: 21 in the two new payload-cap files, 7 added to `lambda-handler.e2e.spec.ts`) · eslint `--quiet` exit 0 · `npm run build` exit 0.

**⚠️ But the full run now emits: *"A worker process has failed to exit gracefully and has been force exited."*** This is the lingering-timer consequence recorded above, and it is **worse than I recorded it** — I described a warning local to one file; it now degrades the **whole-suite** run. Nothing fails and the counts are clean, but a force-exited worker is a real signal and the next person to see it deserves to find it written down rather than discover it. Cause unchanged: `ThrottlerStorageService` creates a non-`unref()`'d `setTimeout` per hit, cleared only by `onApplicationShutdown`, and `lambda-handler.e2e.spec.ts` never closes the cached Lambda app. **Carried to T-13.**

#### ADVISORY findings

- **T6-A1 — the Lambda path delivers `content-length` as a `number`, not a string.** `serverless-http/lib/request.js:17` assigns `Buffer.byteLength(body)`, so for every Lambda request without a client-supplied CL — including the T5-A1 throttle requests and the at-cap test — `VALID_CONTENT_LENGTH.test(...)` passes only via implicit `ToString` coercion, while the declared TypeScript type says `string`. **Correct today, but anyone who later "hardens" this to `typeof contentLength === 'string' && …` would 413 essentially every deployed registration request.** One comment is cheap insurance.
- **T6-A2 — `Content-Length: ''` changed outcome** from "treated as 0, passes" to 413. Unreachable through llhttp and the safer direction, but a behaviour change beyond the six enumerated shapes.
- **T6-A3 — a latent over-match.** If a registrations sub-route ever contains a `k` — `/api/v1/registrations/kyc` is the obvious candidate — then `…/KYC` written with U+212A would be capped while the router 404s it. Over-match, harmless, worth knowing it exists.
- **T6-A4 → carry to T-10.** Two assertions depend on `POST /api/v1/registrations` **not existing**: the at-cap test's `toBe(404)` and, by counterfactual, `payload-cap.e2e.spec.ts`'s chunked test. **T-10 creates that route.** When it lands those go red, and the tempting fix is to weaken them to a bare `not.toBe(413)`, which is vacuous. **T-10's brief must re-pin them against the new route's real status, not hollow them out.**
- **T6-A5 — `main.ts`'s registration site is proven by nothing.** Deleting `configurePayloadCap(app)` from `main.ts` leaves the suite green: `payload-cap.e2e.spec.ts` hand-copies the bootstrap rather than importing it, and no spec imports `../main`. **Pre-existing repo-wide** — `configureBodyParser` and `createValidationPipe` have the identical gap — so not a T-6 regression, and the honest fix (extract a shared `bootstrapApp()`) is outside this task. Recorded in the file's docblock, and here.
- **T6-A6 — the ordering is discipline, not structure.** Nothing enforces cap-before-parser; it is two adjacent call sites plus comments in three files. The Lambda site is guarded by accident (the 413-vs-400 test); `main.ts`'s is not. Making `configureBodyParser` call `configurePayloadCap` as its first statement would make it structural, but that edits a shared helper T-6 does not own.

**Final verification result:** **PASS on attempt 2.** 2 Implementer attempts, 3 Reviewer lens reports, **1 rework round consumed.**


### T-8 — `POST /registrations/verify`

**Dispatched** with effort `high`, skills `nestjs-expert` + `api-design-principles`. **Review mode: two parallel lenses** (oracle/PII, evidence adequacy). Brief written to constraints, not mechanism.

#### Attempt 1 — both lenses `FAIL`

**Held on both lenses and never disturbed afterwards:** the cap swallow is correct and is *not* the failure mode I most expected — it tests `instanceof EmailVerificationSendLimitExceededError` and **rethrows everything else**, so a Prisma error, transaction timeout or RDS failure propagates as a `500`. *"The endpoint does not lie about a broken system."* Module wiring resolves T-7's DI gap with no cycle. Oracle behaviour is invariant on every channel examined — status, body, `content-length`, `Date`, throttler key (keyed on `req.ip`, never the submitted address), and the structured log line (operator-side, and carrying no address since `/verify` takes no path or query parameter).

##### FAIL 1 (oracle lens) — the mail-failure log line could write the applicant's address to CloudWatch

The `.catch()` interpolated `err.message`, and `MailService.dispatch` rethrows the transport error **unchanged** (DD-9). The decisive point was not that SES *might* carry the address but that **in this repository's documented configuration it is the expected error**: `backend/CLAUDE.md` records the SES sandbox constraint and `ses-mail.transport.ts:29-35` (DEP-6) records that **no verified sending identity exists under default infra parameters** — so `MessageRejected` (*"Email address is not verified. The following identities failed the check… `<applicant@example.com>`"*) is the branch that fires.

The durable form of the argument: **you cannot bound what a third-party SDK puts in `err.message`, and the only inputs on this path are an email address and an OTP.**

A regression against a deliberate local pattern — the lens grepped all five `logger.*` calls in `backend/src` and found this was **the only one interpolating an unbounded value**. `MailService.dispatch` logs `kind=` + `reference=` and *pointedly omits the error*; `RequestContextMiddleware` emits a fixed six-field object. **T-3 and T-4 both solved this exact problem correctly.** It was also redundant: `dispatch` had already logged the failure outcome, so *"its only novel content was the leaking part."*

*Violated:* `design.md` §4.10 and §6.3; `requirements.md` NFR-8; root `CLAUDE.md`; `backend/CLAUDE.md` §PII & RBAC — **CloudWatch is not an Admin-gated surface.**

##### FAIL 2 (oracle lens) — a disclosure, not a code change

Under Lambda the runtime freezes on response `finish`, so **the in-flight SES request is frozen with it** and a container reaped before re-invocation loses the send **with `.catch()` never running**. That matters here more than anywhere: `requirements.md:225` states FR-4's gate is *"the one place email is load-bearing"* with *"no in-band fallback"*, and the accepted-cost mitigation is precisely *"send attempts/failures logged"* — **so the failure is exactly the case that goes unlogged.**

The lens explicitly did **not** ask for a code change, and I did not either: `requirements.md:245` is a hard `AND IT MUST` on timing, awaiting SES would reintroduce a real oracle, and no requirement mandates synchronous delivery. **What was unacceptable was recording the trade as purely-timing.** It also credited a detection channel the Implementer had not claimed: `MailService.dispatch` logs its attempt line **synchronously before its first `await`**, so **attempt-lines-without-outcome-lines is a countable, alarmable signal** for a systemic outage.

##### FAIL 3-6 (evidence lens)

- **The timing test measured its own mock.** `issueCode` was mocked with an **identical** injected delay on both branches, while the genuine asymmetry lives *inside* the mocked-out method (both paths run the budget `$transaction`; only the uncapped one reaches `create`). **The test constructed the equality it reported as a measurement** — and `registrations.service.ts:44-49` stated the e2e *"measures this directly"*, **a false evidentiary claim written into the implementation's own doc.** Everything it legitimately proved was already proven **deterministically** by the never-resolving-mail test.
- **⚠️ T-5's throttler was silently voiding six requests in the primary evidence file.** One app in `beforeAll`, no storage reset, class-level guard at `limit: 20 / ttl: 60_000` keyed class+handler+tracker — so **every `POST /verify` in the file shared one counter under one supertest IP**. 3+3+1+1+1+1+16 = **26 requests; 21-26 were `429`s, and all six fell inside the timing loop**, so **three of eight paired samples measured throttler-rejection latency** with the injected delay never applied. **Invisible, because the timing helpers asserted no status.** The sample composition was also an accident of file order.
- **Zero-rows had no liveness anchor** — three requests, no status asserted, so it passed unchanged if all three had 500'd.
- **`sendMock` was asserted only negatively** — a silently-failed `MailService` override would have passed.

**This is B28 emerging *between* two green tasks.** T-5 shipped the guard; T-8 wrote the suite; neither could see it alone.

##### The record correction — "two branches, three inputs"

The Done-when names three cases. The lens ruled **two branches**: over-cap is genuinely distinct and genuinely exercised (delete the `catch` and it 500s), so **the Disqualifying clause's operative demand is satisfied** — but known-vs-unknown take identical code. **The Implementer disclosed this unprompted** and had already written it into the test file's own header, which is the right place. Recorded here as two branches, three inputs, with the known/unknown pair kept as a forward guard against a future membership check.

#### Attempt 2 — one FAIL, comment-only

Five of six closed and the gates confirmed real: the PII fix is gated by a `Logger.prototype.error` spy that captures the emitted message (reinstating `${err.message}` goes red); the freeze disclosure's detection channel **was verified to exist** (`mail.service.ts:56` emits before the `await` at `:59`, reached synchronously from the `void` call); no false evidentiary claim survives; both retained never-resolving tests **hang to timeout** rather than merely running slow; the zero-rows anchor and the `sendMock` positive both landed, with `mockClear()` correctly placed.

**A contradiction I raised, resolved in the Implementer's favour.** I put its empirical `content-length: '0'` probe against attempt 1's source reading that Express sets no `Content-Length` for an undefined chunk. **Both were right about different layers:** Express 5.2.1 guards `this.set('Content-Length', len)` behind `if (chunk !== undefined)` so Express sets nothing — but `res.end(undefined)` reaches Node's `OutgoingMessage.end`, which with unsent headers sets `_contentLength = 0` and emits the header (202 has `_hasBody === true`, so the 204/304 strip does not apply). **The probe beat the source reading.**

**The FAIL:** the request-budget comment added *for* F4 stated a total the file contradicted — 10 claimed, **12 actual**, and **two of that same attempt's own fixes were unaccounted for** (F6 made the mail test 2 requests; the new length test added one the breakdown omitted). The underlying defect was closed, but the comment exists so a future addition can be checked against the budget. Same class as F3: **a file asserting something about itself that is not so**, appearing inside the fix for that very defect.

#### Attempt 3 — `STATUS: PASS`

Two comments. The Implementer **recounted by grep itself** rather than copying my arithmetic, got 12, and **added a line telling the next reader to recount rather than trust the number, since it was the second time that comment had been wrong** — the correct lesson drawn from the defect, not merely the defect fixed.

##### ⚠️ A citation error that was mine as much as the Implementer's

`registrations.service.ts` cited *"R-1"* for the risk the freeze compounds. The Implementer took it from `requirements.md` FR-4:225's own pointer (*"See R-1 in §12"*) — **which is dangling: §12 is *Dependencies & Assumptions* and holds only `DEP-1…DEP-11` and `A-1…A-6`. No R-register exists in this spec at all.** I propagated the same error, telling the Implementer it compounds *"R-4"*, which I took from the oracle lens, which took it from the same dangling pointer. **Three of us cited a register that does not exist where cited, and none checked.** In the epic proposal's register the risk actually compounded is **R-3** (SES deliverability). Fixed by dropping the numeric ID and citing the substance; **`requirements.md`'s dangling pointer is a spec defect outside T-8 and is left in place, recorded here.**

**Leader's quiet-window measurement:** **53 suites / 613 tests** — reconciling exactly (+2 suites, +18 tests over 51/595) · eslint `--quiet` exit 0 · `npm run build` exit 0. The full run still force-exits a worker on the known lingering throttler timers — unchanged, carried to T-13.

#### ADVISORY findings

- **T8-A1 — `@MaxLength(191)` closed a `500` on a public path.** `@IsEmail()` admits 254 characters; `EmailVerification.email` and `EmailSendBudget.email` are `VARCHAR(191)`, so a **well-formed** 200-character address reached the insert and MySQL raised 1406 — a `500` where `design.md` §3.1 promises only `400`/`429`. **The sibling gap in `registration-create.dto.ts:215` is unfixed and belongs to T-10.**
- **T8-A2 — the timing residue is reasoned, not measured**, and now says so in the file. One awaited `EmailVerification.create` on the uncapped path only; closing it would require either changing `issueCode`'s own await discipline (T-7's correctness trade) or padding every response to a fixed floor (rejected — taxes the common case to hide a residue two orders of magnitude below what it replaced).
- **T8-A3 — FR-8's membership-oracle property holds *by omission of a check*, not by symmetric handling.** Nothing on this path queries registry membership, so there is no branch to time. Structurally closed, which is stronger than tested-closed — but it means a future membership check would silently reopen it, and only the forward-guard test pair would notice.
- **T8-A4 — the over-191 test takes format-validity from a comment.** The Reviewer confirmed it independently (local part 4 ≤ 64, domain 247 ≤ 254, labels 60 ≤ 63), but an explicit `expect(isEmail(overLongEmail)).toBe(true)` would make it self-proving. Deliberately not folded into attempt 3.
- **T8-A5 — a spec defect, recorded not fixed.** `requirements.md:225`'s *"See R-1 in §12 and DC-22 in §8"* is a dangling pointer; §12 contains no R-register. Worth correcting in a future spec pass.

**Final verification result:** **PASS on attempt 3.** 3 Implementer attempts, 3 Reviewer lens reports plus one remediation confirmation, **2 rework rounds consumed.**


### Budget decision — review-round tripwire raised from 37 to 60 (user-approved 2026-08-06)

The spec's Execution Conventions halt-and-escalate at **>37 review rounds**. At T-8's close the run stood at **~38 with 8 tasks remaining**, so I halted and put three options to the user rather than exceeding it silently: raise the tripwire and keep the current review intensity; hold 37 and drop to one lens per task; or stop at 15/23 and archive.

**Approved: raise it, keep the intensity.** The reasoning I gave, recorded because a budget overrun deserves a justification a later reader can weigh:

The 38 rounds bought **four defects no automated gate detected**, each of which would have shipped green — T-6's case-insensitivity bypass (`POST /API/V1/REGISTRATIONS` skipped the payload cap while still routing), T-7's send-cap check-then-act race, T-8's PII leak into CloudWatch on the expected SES error, and T-8's throttler silently voiding six requests inside its own timing evidence. **Two of those were found only by a second lens on the same diff.** The remaining work is where the risk concentrates rather than thins: **T-10** writes the first public row and evaluates consent; **T-11** is the lookup under L-1…L-4 with T5-A2's `429`-versus-byte-identity collision still unresolved; **T-13** is the release gate whose Done-when requires that adding a public route **break the suite** until a fixture exists. Cutting review depth now would be economising precisely where PII and consent are decided.

**New ceiling: 60.** If the run approaches it, the same halt-and-escalate applies — the point of the tripwire is that the Leader cannot quietly redefine "enough", and raising it once by explicit decision preserves that property rather than eroding it.


### T-19 — `OtpVerificationStep`

**Dispatched** with effort `high`, skills `frontend-design` + `react-doctor`, paired with T-10 on the disjoint-tree pattern. Single Reviewer, lens checklist.

#### Attempt 1 — `STATUS: PASS`, with five in-file corrections applied before commit

##### The `429` question — my framing was right but under-grounded, and the Reviewer found the real authority

I asked whether rendering a distinct message for a `429` violates the Disqualifying clause's *"assert the message is invariant across failure modes."* My reasoning was that the per-email cap is silent while the `429` keys on the caller. **The Reviewer confirmed it and found that `design.md:188` says so explicitly**, in the same paragraph that establishes the silent cap:

> *"**Resolution: the cap is enforced silently** … A `429` from the *throttler* remains visible, because it keys on the caller, not on the submitted address."*

So the Implementer did not carve out an exception — **it implemented the carve-out the design already wrote.** The Reviewer verified the mechanism rather than accepting T-5's review: `RegistrationsThrottleGuard` is an **empty** subclass with no `getTracker`/`generateKey` override, so the request body cannot enter the throttle key, and the per-email cap lives *downstream of the guard* inside the handler with a `202` outcome — **it cannot raise a `429` at all.** Reading the clause to cover the throttler would put `tasks.md` in direct contradiction with the document it traces to.

##### ⚠️ A correction to my own brief

I told the Reviewer that four failure modes render one message. **Only three do.** A capped resend renders `RESEND_NOTICE` — the same notice as an *uncapped* resend — because a capped resend is not a code failure, it is a `202`. **There are two separate invariants**, and the implementation gets both right: `INVALID_CODE_MESSAGE` across wrong/expired/consumed, and `RESEND_NOTICE` across capped/uncapped.

##### The T17-A4 remedy and the blank-form back path — acceptable, on the counterfactual

The Implementer flagged, unprompted, that its "back" path resets `RegistrationForm` to blank. I put it to the Reviewer as a possible data-loss regression on the exact path the obligation was raised to fix. **Ruled acceptable, and the argument that settles it is the counterfactual:** without the remedy, an applicant whose address passes the client regex but fails the server's `@IsEmail()` has **no path to completion at all** — no code will ever arrive, resend fails identically, and their only recovery is a page reload **that loses the same fields with no explanation.** The remedy costs the same re-entry and adds the reason: a strict information gain, not a new loss.

§5.3's *"entered form state must survive"* was also ruled to govern the **forward** path, which holds — `page.tsx` keeps `pending` in its own state and the step never re-derives it. The section contemplates no error-recovery back path.

**Scope was explicitly not the reason.** I told the Reviewer that `Files:` lines have proven indicative in this spec, so it ruled on merit and reached the same place — noting additionally that an initial-values seam is not the cheap fix it appears: `page.tsx` holds `RegistrationPayloadInput` (numbers, optionals omitted) while the form wants all-strings, so restoring needs a lossy reverse mapping on a path that only fires for the narrow set of addresses passing the client regex and failing `@IsEmail()`.

##### Five corrections applied — three were false statements written into the code

Required before commit, all in-file, no re-review round:

1. **The button label stated something false.** *"Back to your details"* — but `page.tsx:89-92` nulls `pending`, so the details are gone. **On the one screen whose purpose is telling the applicant the truth about a failure.** Now *"Go back and re-enter your details"* plus body copy disclosing the re-entry, making the loss an informed choice.
2. **Nothing here is verified against the live API, and the file did not say so.** `POST /registrations` and `POST /verify` were unexercised live, so **the `details: [{field, message}]` envelope the whole T17-A4 branch depends on is assumed, not proven.** `frontend/CLAUDE.md` names this hazard by name — *"mock-vs-live drift has shipped bugs (the `details` envelope, W-1)"* — so **this is W-1's own failure mode.** Now recorded in the test header with the obligation to re-verify once T-10 lands.
3. **A comment asserting the opposite of how the harness works.** It claimed *"roles survive `display:none`"*; RTL's `*ByRole` defaults to `hidden: false` and **excludes** inaccessible elements. **The Implementer's rewrite is better than the correction I relayed:** in a real browser RTL *would* exclude a `display:none` element, so "not found" would not distinguish hidden from unmounted there — the assertion works **specifically because jsdom applies no CSS engine**, so a Tailwind class-based `hidden` is still found and only true removal passes. That nuance is load-bearing for dismissing A-3 and A-4.
4. **An invariance header that oversold three byte-identical inputs.** The three code-failure tests all feed `new ApiError(400, 'Bad Request', undefined)`, so they prove one client-side fact three times, not that three server causes are mutually indistinguishable — **that property is proven server-side.** Header corrected.
5. **A heading that could misstate the cause.** `classifySubmitError` fell back to `details[0]?.message` for *any* rejected field under a hardcoded *"We couldn't verify your email address"*. Now a `BlockingIssue {field, message}` type drives both the heading and the re-entry phrasing, with a `phone`-rejection test asserting the email-specific copy does **not** appear.

##### Structural findings worth keeping

- **The unmount is real**, verified from source rather than the test: `page.tsx` is a plain conditional render with no `hidden` prop, no `display:none`, no hiding wrapper. **A-3 and A-4 are genuinely inapplicable, and not wiring `submitting` was correct rather than an omission.**
- **The `policyVersion` guard is dead in production and that is fine.** `''` can only reach the step if consent is accepted without a loaded policy, and the disclosure's checkbox is `disabled` until `reachedEnd`, which the geometry effect early-returns on when `policy` is null. **A wiring break fails closed upstream, loudly, before the guard is reachable.**
- The `policyVersion` assertion proves **prop → submit**, not fetched → submitted. The chain is covered link-by-link across files; **no test exercises it end to end.**

**Leader's measurement — and an error of mine in taking it.** Runs 2 and 3: **78 suites / 1088 tests**, clean; lint clean but for the three pre-existing `<img>` warnings; build **21 static pages**. **Run 1 had one failing test, and I lost its identity by truncating the output** — a measurement mistake, not a code one. Two subsequent full runs are green. **I am deliberately not recording it as the known `(admin)/admin/actors/**` flake**, because I cannot confirm it was: attributing an unidentified red to a known flake is exactly the reasoning my own standing rule forbids. Recorded as an unidentified single-run failure, not reproduced in two attempts.

#### ADVISORY findings

- **T19-A1 — the "no `details`" indistinguishability is enforced by comment, not by test.** `classifySubmitError`'s no-`details` branch has no sub-branch to split; nothing asserts it stays that way.
- **T19-A2 — the anti-oracle keyword assertions are a canary, not a gate.** They catch *"hit the limit"* and *"too many codes"*; a regression rendering *"That address has reached its limit"* sails through.
- **T19-A3 → carry to any live smoke test.** React StrictMode double-invokes the mount effect in **dev only**, sending two codes per mount and **burning the T-7 per-email cap**. Harmless in production; it will confuse the first person to verify T-7/T-8 against a running stack.
- **T19-A4 → T-22.** `axe` runs only on the ready state; the blocking-issue screen's markup is unchecked, and focus is not moved to it when it replaces the subtree (the focused button unmounts, dropping focus to `<body>`). `role="alert"` covers announcement, not keyboard position.
- **T19-A5 — `handleBackToForm` has no dedicated test.** Exercised indirectly via `onBack` assertions. Left deliberately.
- **T19-A6 — a pre-existing harness artefact, not T-19's.** In jsdom `fireEvent.click` toggles the consent checkbox even while `disabled`, so `RegistrationForm.test.tsx` reaches `onValidated` with a never-resolving `getConsentPolicy` — **the tests exercise a state a browser cannot reach.** This is the mechanism by which `policyVersion: ''` reaches the OTP step in `page.test.tsx`. Same finding as T-18's A-1, now with a second consequence.

**Final verification result:** **PASS on attempt 1**, plus five in-file corrections. 1 Implementer attempt (two dispatches), 1 Reviewer, **0 rework rounds consumed.**


### T-10 — `POST /registrations` — attempt 1: both lenses `FAIL`

**Dispatched** effort `xhigh`, skills `nestjs-expert` + `api-design-principles` + `tdd` (Leader-assigned — consent gating is the legal basis for publication) + `error-handling-patterns`. **Two parallel lenses** (constraints/ordering, consent/PII/evidence).

#### Verified sound, from source rather than from the tests

- **V-1a and A23 both hold under the Implementer's deviation**, which §4.1 line 267 expressly authorises. `verifyCode` runs before the first `$transaction` token appears anywhere in the method, so neither the rollback hazard nor the deadlock hazard arises. **Even on the exhaustion path the final rollback restores `consumedAt: null`** — the single-use code is not burned.
- **A-2 satisfied.** The reference is allocated in its own committed transaction *before* consume+create, so a later failure leaves a gap. A-2's own parenthetical **presupposes gaps as a tolerated reality** and names the defect as *reissuing a value already handed out*; an abandoned allocation hands its value to nobody.
- **A-1's evidence is not decorative — it inherits T-7's *fixed* harness.** The lens checked for exactly the defect that FAILed T-7 twice: both fake methods carry an `await tick()`, so all five writes land before any read, and the test passes **only** because the session variable is a per-invocation closure. Promote it to module scope and the set collapses to one.
- **RA11 satisfied structurally rather than operationally** — the counter self-seeds; the first allocation of a new year takes the `INSERT` branch and lands `seq = 1`. No seeding job.
- **PII in logs clean** — grepped module-wide, not just the diff: the only two `logger.*` calls interpolate `err.name` and a server-generated `reference`. No `err.message`, no `JSON.stringify`, nothing stringifying a Prisma exception.
- **T6-A4 discharged and T8-A1's sibling gap closed.** The assertions that depended on the route not existing were **re-pinned to its real status, not hollowed out**, and `@MaxLength(191)` landed on `RegistrationCreateDto.email`.

#### FAIL 1 — A-3's exhausted retry surfaces a raw `500`

The Implementer flagged this itself and argued that three consecutive collisions mean corruption and should alert loudly. **Ruled against, and not on pedantry.** A-3 is a conjunction — bounded retry **and** never a `500` — and the failure is on *exactly the path A-3 exists to govern*; under a "never a 500 while retries remain" reading the constraint is near-vacuous, since a within-budget collision produces no response at all. **The spec settles this class itself eleven lines below the constraint table:** §4.5 line 367 has approval catch the identical Prisma violation and **return a `409` naming the colliding key** rather than let it surface as a `500`.

**And the engineering argument rests on a false dichotomy: catching it makes the failure *louder*.** Today it is a generic Nest error with no domain discriminator — nothing greppable, nothing alarmable. A caught exhaustion can emit a bounded, PII-free alarm hook the current code does not provide. Secondary: the unhandled `500` serialises with **no `error` key**, the exact envelope defect §4.4 required T-5's filter to fix.

Remediation set to **`503`** over `409`, for a reason specific to this path: the third attempt's transaction rolled back, so **the code is not burned and a retry is genuinely actionable**. A `500` with a distinct internal code is not sufficient — **A-3 prohibits the status, not the opacity.**

#### FAIL 2 — the Disqualifying clause discharged for 3 of 7 payload fields

`traderType`, `region`, `crops` and `capacityTons` are unscanned, and **`PAYLOAD_FIXTURE` carries no GPS at all**, so FR-5's explicit *"not the coordinates"* clause is structurally undetectable. **The file's own header claims `crops` is scanned.** Remediated with a total `Object.entries` sweep rather than four more hand-written lines — the same derive-don't-enumerate reasoning §6.2 applies to the route list (C-9).

#### FAIL 3 — the receipt-mail path ships with zero failure evidence

A **second** fire-and-forget mail path with a **second** `logger.error`, and **no `sendReceipt.mockRejectedValue` exists anywhere in the repo.** The T-8 FAIL-1 hazard is therefore unguarded here: `MailService.dispatch` rethrows unchanged (DD-9) and SES `MessageRejected` embeds the destination address. **The code is currently correct; the guard that keeps it correct does not exist.** FR-14's 3a half — assigned to T-10 by the Coverage table — is likewise unevidenced.

#### `consentAcceptedAt` — ruled (a): the code is right, the documentation was wrong

The Implementer surfaced the contradiction unprompted, which is the only reason it could be ruled on. `design.md` §2.2 and `schema.prisma` both said *"the applicant's acceptance time, not the write time"* — **which no implementation could satisfy**, because §3.1's request shape carries no such field.

**A client-supplied `acceptedAt` was rejected as strictly worse:** FR-3 already states acceptance *"MUST be validated server-side as a field, **never trusted as a client assertion**"*, and a timestamp the consenting party can set to anything is less evidential than an instant the server witnessed — in the one artifact whose purpose is an auditable trail.

**S-4's precedent points here, not the other way.** S-4 removed a *fabricated* timestamp; this one is genuinely witnessed. **A fabricated value must be deleted; a mislabelled true value must be relabelled** — and deletion is unavailable anyway, since the column is `NOT NULL` and 3b reads it. The real downstream cost is concrete: FR-3 scenario 4 requires the reviewer's consent block to show *"the acceptance timestamp"* from **stored values**, so a 3b reviewer would present a submission time to a human under an acceptance-time label, skewed by however long the OTP round trip took.

#### ⚠️ Leader doc sweep — §2's schema-object count was wrong by two tables, and it is the failure A-4 names by name

`design.md:27` said *"three additive Prisma schema objects"* and §2.6 said *"Two `CREATE TABLE`"*. **`EmailSendBudget` (T-7) was never swept in and had been absent for three tasks**; `RegistrationSequence` (T-10) made it two. Both arose the same way: a section that states **constraints rather than a mechanism** was answered with a new schema object, and only the migration was updated.

**This is the C-10-class disclosure failure A-4 exists to prevent, recurring inside the spec that names it.** A-4's must-hold column is *"it appears in **§2** and in the migration's done-criteria"* — the migration limb was satisfied both times, the §2 limb neither time.

Applied (KZ-004, all sites): **§1's count → five, naming all five objects**; **§2.6 → four `CREATE TABLE`**, listing the three migrations that landed; **§2.2's `consentAcceptedAt` description** replaced per the ruling above. **§4.5's line 353 narrative was deliberately left** — it is a frozen account of revision 2's defect, like `judgment.md` C-5. `schema.prisma`'s two comments (the field description and the counter's inaccurate *"gap-free"*) are in the Implementer's rework, since they are code.

**Standing rule for the rest of the run:** when an Implementer answers a constraints-not-mechanism section with a new schema object, **§2 and §2.6 are swept in the same change.** T-11 is the next task that can do this — its L-1…L-4 explicitly permit new columns.


#### Attempt 2 — `STATUS: PASS`

All three FAILs closed, verified by reading rather than by claim.

- **A-3:** the `503` is reachable **only** on exhaustion — the `catch` continues while attempts remain, and both halves are pinned (a within-budget collision retries transparently to `…-0002` and resolves; exhaustion throws `ServiceUnavailableException` with **`error: 'Service Unavailable'` genuinely asserted**, closing the secondary envelope defect). The log line interpolates two numbers. **Over-conversion checked and absent:** only `P2002` is caught, so the lost-consume-race `BadRequestException` still returns **byte-identical to a `REJECTED` verify**, and connection/timeout faults propagate untouched. No residual `P2002` pin survives module-wide.
- **FAIL 2:** a derived `Object.entries` sweep over raw `res.text`, with **no residual hand-written field list**. The Reviewer checked the way this could still be vacuous — whether GPS survives the pipe — and it does: both coordinates carry `@IsNumber()` + range + the paired decorator, so `whitelist: true` does not strip them and an echo would render `"gpsLatitude":-8.910777`, which the sweep matches exactly.
- **FAIL 3:** the spy captures the **formatted emitted string**, so reinstating `err.message` turns the first test red on the address assertion. It also asserts FR-14's 3a half directly — the submission resolves with a well-formed reference *while the send fails*.

**The tautology fix discriminates**, which was its whole point: under a hardcoded inline equality the spy would be bypassed, the submission would `400`, and the awaited call would reject. The original single-version fixture could not tell those implementations apart.

**Two interaction hazards I asked about, both resolved favourably.** The mixed-case fixture did **not** hollow the leak sweep — it scans **both** `SUBMITTER_EMAIL` and its lowercase, and the lowercase form is exactly what a leak of the stored value would look like, so the change strengthened the assertion rather than weakening it. And the *"gap-free"* inversion was ruled **better than deletion**: deleting it would leave a future reader who sees `REG-2026-0001 → 0003` in the data with no explanation and a live suspicion the allocator is broken.

**Leader's quiet-window measurement:** **56 suites / 645 tests** (+3 suites, +32 tests over 53/613) · eslint exit 0 · build exit 0. **The lingering-timer force-exit did not appear on this run** — recorded as an observation only; the underlying cause is unchanged and still carried to T-13.

#### ADVISORY findings

- **T10-A1 — `capacityTons: 733` is a bare 3-digit substring in the leak sweep.** A run where the fake counter reached seq 733 would emit `REG-YYYY-0733` and trip the assertion. **Fails in the safe direction** (spurious red, never a false green) and is unreachable today since the success test is the file's first request. Flagged so nobody reordering these tests is baffled.
- **T10-A2 — nothing proves an optional field is persisted when it *is* supplied.** The positive `toEqual` runs against the omitted-optional fixture, so a `buildStoredPayload` hardcoding `gpsLatitude: null` would pass it *and* the leak sweep. Not a regression — it is the shape the sweep already had — but one fully-populated unit case would close it.
- **T10-A3 — the wrapper→helper delegation is itself untested, and structurally cannot be.** The submit test spies the module export out, so rewriting `isKnownConsentPolicyVersion` as a direct equality would leave every test green with `isVersionKnown` dead. **With a one-element known-version set no test can distinguish those implementations behaviourally** — which is exactly the constraint the extraction was designed around. The two-layer decomposition is the correct answer to it; the residual link is recorded rather than left to be rediscovered.
- **T10-A4 — a pre-existing, repo-wide PII surface now reachable on a public path.** An unhandled `PrismaClientValidationError` would be logged by Nest's default handler with its argument object, which on this route is the applicant's payload. Not introduced by T-10 and outside its file list; worth an epic-level note if 3b adds a global exception filter.

**Final verification result:** **PASS on attempt 2.** 2 Implementer attempts (three dispatches), 3 Reviewer lens reports, **1 rework round consumed.**


### T-20 — Receipt screen + `ReferenceCard`

**Dispatched** effort `high`, skills `frontend-design` + `ui-ux-pro-max`, paired with T-11. Single Reviewer.

#### Attempts 1–3 — the same defect at three levels

**The shipped copy was right from attempt 1 and never changed.** The Reviewer confirmed the **B32 framing** is genuinely correct rather than correct-on-paper — *"the clause I expected to be missed and it is the strongest part of the change"*: lookup is named the reliable channel, email is explicitly best-effort (*"delivery is not guaranteed, so please do not rely on it"*), and the sentence closes by routing the applicant back to the reference. That discharges §5.4 against `requirements.md:225`'s no-in-band-fallback reality. Selectability is **structurally** proven and survives both a `<canvas>` and a background-image swap; the clipboard KZ-002 boundary is recorded in both source files; `<Suspense>` is correctly placed with the hook in the **child**; `NoReferenceState` was ruled **correct, not scope creep** (the route is a real S3 object reachable directly, and without it an empty code block renders under a "save this reference" instruction).

**What failed three times was the mechanism meant to *keep* the copy right — and each time, a comment claimed a property the code did not have.**

1. **Four regexes, and the header cited a paraphrase as proof they were semantic.** That paraphrase matched **zero of four**: *"by email for additional details"* is not the literal *"email you"*; *"link back to **the registration** form"* missed because the optional `(registration )?` group **was written into pattern 2 and omitted from pattern 1**. All four realistic rewordings escaped. Remedied with an **equality pin** on the copy — for a fixed block of prose that is the only semantically complete oracle available in Jest, since a regex can only enumerate what someone thought to forbid.
2. **The pin read the first `<p>`, and the sanity test used `.some()`.** Both failed **open**: a second `<p>` **appended** to the section left the pin reading the original and passing — *"the natural way a chunk-4 promise returns"*, by adding a line about email rather than editing the pinned sentence — and reverting pattern 1's group left the sanity check green because pattern 4 satisfied `.some()` independently. **Neither correction was separately guarded.**
3. **Closed.** Per-clause assertions on explicit pattern indices, and a region-wide pin (`region.textContent`, which walks all descendants, so an append **before or after** changes it).

**Both final fixes were verified by mutation, not asserted.** The Implementer reverted pattern 1 and watched exactly that line fail with the email clause untouched; then added a second `<p>` **deliberately worded to escape every regex**, watched the pin fail, and noted *"the old `querySelector('p')`-only pin would have stayed green here."* It also corrected an empirical assumption mid-fix — it expected a space between heading and paragraph, the assertion failed for the right reason, and it established that JSX drops the pure-whitespace child.

**The Reviewer confirmed the shipped copy is byte-identical to what it originally cleared** — em dash and line-break positions included — so two mutation cycles reverted clean.

#### ⚠️ The `(admin)/admin/actors/**` flake is degrading, and the mechanism is now measured

Confirmed **by identity** this time, not inferred: `app/(admin)/admin/actors/page.test.tsx › ActorsPage — lock flow › opens ConfirmDialog and calls bulkSetConsent with consentStatus:DENIED`.

**The signal is the clock, not the red.** In isolation: **32/32 green in 2.3 s.** Under full parallel load: **29.3 s** for the same file — a **13× slowdown**. These tests are not failing on logic; they are timing out because the worker is CPU-starved.

**And it is worse than when recorded.** At T-19 one full run failed and two consecutive re-runs were clean. Here **two consecutive full runs both failed** (2 tests, then 1). The suite grew 78 → 80 in the same period, so contention rose with it. `admin/actors` is untouched by T-20, whose change lives entirely in `register/`.

**Consequence for what remains: T-22 adds a11y suites to the frontend**, which will push contention further in exactly this direction. The honest statement is that the frontend full-suite signal is now *unreliable rather than merely ambiguous*, and the underlying suites belong to the admin actors feature this spec does not own. Recommend the follow-up spec recorded at L-ERR-3 be treated as blocking for the next frontend-heavy chunk, not optional.

**Leader's measurement:** **80 suites / 1101 tests**, with the above flake on full runs and green in isolation · build **22/22 static pages**, `/register/submitted` present.

#### ADVISORY findings

- **T20-A1 — the scope word in both headers is load-bearing.** A chunk-4 promise inserted **outside** the pinned section (the thank-you paragraph is the only realistic spot) is covered by the secondary regexes only. **If either header is edited later, keep the "inside this section" qualifier** — dropping it re-creates the overclaim this task failed on three times.
- **T20-A2 — a `tasks.md` defect, not the Implementer's.** T-20's `Verify` line is `npm test -- submitted`, a path regex that matches the page test but **not** `components/register/ReferenceCard.test.tsx` — so the clipboard and selectability suite **never ran** under the stated command. The Implementer then found that `npm test -- register` matches **all 80 suites**, because the repo root is named `…-actor-register` and jest matches the full absolute path. The Reviewer ruled that a **strict superset is the better recommendation**: any pattern containing `register` is a no-op filter in this checkout, while `submitted` genuinely misses coverage.
- **T20-A3 — an SVG `<text>`-rendered reference** would keep a text node and add no `img`/`canvas`, passing the structural check while arguably still being "an image" under FR-5 s2. Vanishingly unlikely; recorded.

**Final verification result:** **PASS on attempt 3.** 3 Implementer attempts, 3 Reviewer reports, **2 rework rounds consumed.**

