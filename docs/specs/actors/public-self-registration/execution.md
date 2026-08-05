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

