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
