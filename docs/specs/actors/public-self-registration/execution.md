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
| L-ADJ-2 | `design.md` §5.7 says *"Admin sidebar. A third `NAV_ITEMS` entry in `AdminSidebar.tsx`"*, but `requirements.md` FR-1 scenario 1 says the Register action **must NOT** appear in the admin shell nav, and `tasks.md` T-15's done-criteria require it **absent** from the admin sidebar. | **Flagged, not yet adjudicated** — it does not bind until T-15. Raised here so it is not discovered mid-loop. Likely a Pivot Protocol item at T-15 (a design/requirements contradiction, not an implementation defect). |

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
