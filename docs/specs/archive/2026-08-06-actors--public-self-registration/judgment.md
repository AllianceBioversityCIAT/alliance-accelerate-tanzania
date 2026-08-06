# Judgment Day — Public Self-Registration & Admin Review Queue

Findings ledger for the blind dual review run during `/akili-specify` Phase 2, Step 2.5
(**Review Design** option). Read by `/akili-archive` as Kaizen evidence.

## 1. Transaction

| Field | Value |
|---|---|
| Spec path | `docs/specs/actors/public-self-registration/` |
| Mode | `judgment_day` |
| Target | `design.md` (primary) + `requirements.md` (its contract) — frozen at launch |
| AKILI moment | `/akili-specify` Step 2.5 — user-selected **Review Design** |
| Round | 1 |
| Requested by | JuanCode, 2026-08-04 |
| Judges | 2, blind, parallel, read-only (`Read`/`Grep`/`Glob`) |
| Refuter | **Not launched** — two-judge agreement is the corroboration mechanism |
| Fix ceiling | 2 rounds, 2 scoped re-judgments |
| Terminal states | `approved` \| `escalated` |

### Criteria issued to both judges (identical)

| ID | Criterion |
|---|---|
| C1 | False claims about the existing codebase |
| C2 | Internal and cross-document contradictions (KZ-005) |
| C3 | Requirement scenarios/clauses with no design mechanism (KZ-001) |
| C4 | Gates blind to their defect class (KZ-002) |
| C5 | Security, PII, and consent correctness |
| C6 | Unimplementable or hand-waved design |
| C7 | Budget realism |

### Skill resolution

`judgment-day` reference files (`../_shared/review-ledger-contract.md`,
`references/prompts-and-formats.md`) are **not packaged with AKILI-SPECS in this
environment** and were unavailable. Per the skill's own fallback clause, the run
proceeds on the contract in `SKILL.md` alone, with the ledger persisted here.

### Disclosed deviation — judge model identity

The skill states: *"Prefer running the two judges on a model different from the one
that authored the design (author ≠ auditor, per AKILI model routing)."*

Both judges ran on **`opus`**, the same model that authored the design.

Rationale, recorded rather than hidden: this project's `## Model Routing` registry maps
**T3 Auditor → `opus`** for the Claude Code host — the same entry as T1 Architect — so
there is no different-model option *at the auditor tier* on this host. The registry's
cross-host note makes dispatch "a routing preference only, never the dispatcher", and no
cross-host judge was reachable in this session. The alternatives were a weaker tier
(`sonnet`) for nominal independence, or full auditor capability without model diversity.
**Capability was chosen.** The residual risk is correlated blind spots between author and
judges; the partial mitigations are that both judges ran with fresh context, blind to each
other and to the authoring conversation, and that the brief directed them to verify every
codebase claim against the files rather than reason from the documents.

## 2. Findings Ledger — Round 1 (frozen)

| Judge | SEVERE | WARNING | SUGGESTION |
|---|---:|---:|---:|
| alpha | 11 | 18 | 3 |
| beta | 18 | 13 | 2 |

Both judges independently re-counted `requirements.md`'s **40 scenarios** and confirmed the
figure against §14's per-FR column. Both delivered only after a second explicit request; the
first idle signal from each carried no findings (harness behaviour, not a judgment —
cf. chunk 2's Kaizen row *"4 Reviewers lost to `ENOTFOUND` / mid-response disconnects"*).

### 2.1 CONFIRMED SEVERE — both judges, both at SEVERE (8)

| # | IDs | Defect | Verified by Leader |
|---|---|---|---|
| **C-1** | A1 · B1 | `ActorAuditService.logCreate` hardcodes `action: ActorAuditAction.CREATE` with no parameter, and no method can write `REGISTRATION_REJECT`. Design lists the service as "reused **unchanged**" while requiring two new actions. | **Yes** — `actor-audit.service.ts:127` |
| **C-2** | A2 · B2 | A `MiddlewareConsumer` middleware **cannot** run before the global body parser: `configureBodyParser(app)` installs into Express at call time, module middleware registers during `init()`. §4.1 step 1, §4.4, §9 and R-3 all rest on the false ordering. | Reasoned from `main.ts:15-20`, `lambda.ts:24-27` |
| **C-3** | A3 · B6 | `POST /verify` specified as `202` empty "unconditionally" (§3.1) **and** as surfacing the per-email cap on refusal (§5.3). Mutually exclusive; the §5.3 branch is a membership oracle. §12 asserts both. | Textual, self-evident |
| **C-4** | A4 · B10 | `GET /lookup` has **no** shared or persistent control. DD-5's honesty paragraph names only two paths as having one, silently excluding the single path `requirements.md` FR-6 explicitly requires rate-limiting for. FR-6's brute-force clause is unowned. | Textual, self-evident |
| **C-5** | A5 · B16 | **No logging exists anywhere in `backend/src`.** NFR-8's structured logs, DC-14's log-capture gate and DC-22's diagnosability substitute are all unowned; a fifth from-zero capability absent from §1's table, §4's file tree and §10's budget. | **Yes** — 0 matches for `new Logger\|LoggerService\|console.*` |
| **C-6** | A6 · B17 | FR-15 is not "four entries in `roles.ts`". `TraderType` derives from a six-member union in `lib/api/actors.ts`; widening it breaks `RoleBadge.tsx`'s `ROLE_BG_CLASS`/`ROLE_CSS_VAR` and `MapLegend.tsx`'s `TRADER_TYPES`. §9 calls it "purely additive" — false. New legend colours would silently degrade to `bg-muted`. | **Yes** — `roles.ts:15` derives from `PublicActor['traderType']` |
| **C-7** | A7 · B15 | `frontend/CLAUDE.md` **mandates** `AcknowledgeDialog` for any submit setting `consentStatus` to `GRANTED`. Design chose `ConfirmDialog`, whose confirm button is hardcoded `bg-danger`, and misattributed the pattern's provenance to `admin/bulk-actor-operations` (which proved `AcknowledgeDialog`). | Pending |
| **C-8** | A8 · B8 | `pii-boundary.spec.ts` bootstraps with a bare `ValidationPipe` and never calls `configureBodyParser` — despite an in-file comment claiming it mirrors production. Only `createValidationPipe()` attaches the `details` envelope, so the release gate designated for DC-2 cannot render the envelope whose leak it certifies. | Pending |

### 2.2 CONFIRMED — both judges, severity contested (7)

Both reported the defect; they graded it differently. Treated as confirmed; severity resolved to the higher grade where the hard release gate or a constitutional rule is involved.

| # | IDs | Grades | Defect |
|---|---|---|---|
| **C-9** | A9 · B30 | SEVERE / WARNING | The "asserted public route table" fails the build when a route is **added**, not when one is **uncovered**. Appending one string silences it, leaving the new path unasserted. FR-8's structural guarantee degrades to "the paths we remembered" — behind a test that appears to enforce it. |
| **C-10** | B5 · A13 | SEVERE / WARNING | Adding two enum members on **MySQL** emits `ALTER TABLE … MODIFY`. §2.5's "No `DROP`, no `MODIFY`" is false for the change it specifies, and describes MySQL in Postgres vocabulary (`CREATE TYPE`/`ALTER TYPE`). **Leader-verified**: `20260710132750_add_import_audit_action/migration.sql` is exactly that `MODIFY`. |
| **C-11** | B9 · A20 | SEVERE / WARNING | `GET /lookup?email=` puts PII in a query string, on the same page that forbids logging email addresses. Reaches request lines, `Referer`, history, and any access log later enabled — none visible to DC-14's application-level test. A20 notes `AccessLogSetting` is currently absent, so nothing leaks *today*. |
| **C-12** | B12 · A24 | SEVERE / WARNING | FR-10's `AND IT MUST show the reference code` is unowned — absent from §5.5's detail composition and §12's FR-10 row. The KZ-001 shape. |
| **C-13** | B14 · A16+A17 | SEVERE / WARNING | Two false DTO claims: `crops`/`CROP_NAMES` are on `AdminActorCreateDto`, **not** `ActorCreateDto` (and `{ each: true }` was dropped); and `@MaxLength` is on only 2 of 9 string fields, so §4.1's "like every other string" contradicts §4.4's "bound **every field**". Followed literally, the public write path accepts unbounded free text. |
| **C-14** | B18 · A12 | SEVERE / WARNING | Design ships **4 public + 5 admin** endpoints; `requirements.md` §4 and §14 say **3 + 4**. The design flags its fifth admin endpoint but never reconciles `GET /consent-policy`. The TRD §4 amendment task would document 7 of 9. KZ-005. |
| **C-15** | A18 · B20 | WARNING / WARNING | §10's budget is not calibrated. **A18**: the two named analogues alone exceed the whole frontend allocation — `ActorForm.tsx` 916 + `ActorsTable.tsx` 729 = 1,645 code and 699+599 = 1,298 test lines, vs ~1,300/~900 budgeted for 5 pages and 12 components. **B20**: the epic's RICE puts chunk 3 at **6×** chunk 1 (E 3.0 vs 0.5), not the 2.4× claimed, and chunk 1's *actual* review-round count exists nowhere as a number to scale from. |

### 2.3 SUSPECT — single judge, SEVERE (7)

Not auto-fixed per the contract. Each is cheaply checkable and, on inspection, logically sound; all are queued for Leader verification before any edit.

| # | ID | Defect |
|---|---|---|
| **S-1** | B3 | **The OTP attempt cap is unreachable.** Consumption is a conditional update keyed on the submitted code's HMAC; a *wrong* code matches no row, so `attempts` never increments. §4.3 calls that cap "the actual control, not the length" — with a per-container throttler (DD-5), the 6-digit code then has no effective brute-force bound. |
| **S-2** | B4 | `traderId` is **not** unique "by construction". Admin create accepts an arbitrary client-supplied `traderId` with no format constraint, so an `SR-2026-0184` actor can pre-exist; the design reserves insert-and-retry for `reference` only, so the collision surfaces as an unhandled `P2002` → 500 and that registration can never be approved. |
| **S-3** | B7 | **NFR-3's atomicity gate cannot exist.** Every backend suite mocks `PrismaService` (`lambda-handler.e2e.spec.ts` uses a pass-through `$transaction`), so "fault injection, not inspection" is impossible — and §8's ungated-class table does not list it, while DC-5 claims the class is gated. |
| **S-4** | B11 | FR-10 requires the activity trail to carry the duplicate-check event **with a timestamp** *and* be derived only from stored fields. Detection is computed at read time and never persisted; the only related column is `duplicateDismissedAt`. Both clauses cannot hold. |
| **S-5** | B13 | `crops` is `@IsOptional` on the admin DTO, so "mirror field for field" accepts a submission with **no main crop** — but FR-2's scenario requires it rejected `400` with a `details` entry. No `@ArrayNotEmpty` appears anywhere in the design. |
| **S-6** | A10 | The design defines a top-level OTP-verified `email` → `submitterEmail`, **and** a payload mirroring `ActorCreateDto` which has its own `email`, and never states their relationship or which becomes `Actor.email`. Either every self-registered actor publishes an unverified address, or `Actor.email` is null for the whole cohort. |
| **S-7** | A11 | FR-12's publishable-subset clause has a mechanism but **no gate**. Neither §8 nor §12 asserts that `contactPerson`/`otherCrops` are absent from the created `Actor` — so a projection bug mapping `contactPerson` onto `Actor.position` would **publish a named natural person** with every listed gate green. |

### 2.4 INFO — remaining WARNING / SUGGESTION

Recorded, not fixed in round one. Confirmed by both judges: **A19·B22** (`duplicateDismissedAt` is row-level, so clearing one false positive permanently hides a later true positive) · **A22·B31** (the `isConsentProvenanceSatisfied` call is tautological at this call site — it cannot return false, so DC-6's second gate is a presence assertion) · **A25·B29** (FR-2's GPS-optional copy unowned) · **A27·B27** (NFR-9's "uses the composite index" unprovable against mocked Prisma, and absent from §8) · **A28·B25** (field-parity A-4 is the **proposal's**, not the **epic's** — the epic's A-4 is consent sufficiency; miscited in both documents) · **A29·B24** (`NAV_LINKS` is a uniform `{label,href}` list; an entry cannot be "styled as a primary action", and FR-1's accessible-name clause is uncovered).

Single-judge: **A14** (chunk 2 fixed **eight** prefixes — `SDC`/`QDS` omitted from the design's list, so DC-7's test would be written against an incomplete set) · **A15** (the SES identity is gated by `MakeSenderIdentity`, not `EnableSesSending`, and with default `SenderEmail: ""` **no identity exists at all**) · **A21** (`ThrottlerException` serialises without the `error` key, breaking the documented envelope and the frontend's `ApiError` mapping) · **A23** (the OTP is consumed *outside* the write transaction, so a reference-collision retry exhaustion burns a single-use code against a 3/hour cap) · **A26** (`prefers-reduced-motion` clause unowned) · **A30** (the chunk-4 quotation does not support the accepted-version-set claim it is cited for) · **A31** (the `REG-<year>-<seq>` allocation strategy is never stated, in the place `traderId` uniqueness structurally depends on) · **A32** (both documents are dated 2026-08-04 yet state chunk 2 archived 2026-08-05) · **B19** (**Leader-verified**: `TZ-` *is* used — 14 `TZ-SEED-*` rows in `seed-data.ts`, so "matches no namespace this registry actually uses" is false) · **B21** (FR-7's "same shared bootstrap" clause is textually negated by §4.4's chosen mechanism) · **B23** (`@@index([submitterEmail])`'s stated rationale is wrong — the lookup keys on `reference`) · **B26** (DD-6 self-contradicts: approve rows carry a *real* `actorId`, yet the instruction excludes both new actions from actor-history queries, erasing the audit trail for the spec's most consequential write) · **B28** (driving the throttler to `429` inside a `beforeAll`-shared app makes the hard release gate order-dependent and flaky — cf. chunk 1's R-4, "a 14%-red suite trains people to rerun past failures") · **B32** · **B33**.

### 2.5 What the judges verified as TRUE

Recorded because it bounds the damage. judge-alpha confirmed correct: `isConsentProvenanceSatisfied`'s location; audit methods taking `Prisma.TransactionClient`; `ConfirmDialog`'s exact-match gate, focus trap and `aria-live`; `ActorForm.tsx`'s plain `useState` with no react-hook-form/zod/shadcn; `apiFetch`/`ApiError`; `PII_ALLOWLIST`/`NEVER_PUBLIC_FIELDS` enumerating only `Actor` columns; `pii-boundary.spec.ts`'s `FORBIDDEN_KEYS` union and `LEAKABLE_PII_VALUES`; the 8 MB limit; no global guard; `AdminSidebar`'s two items; `roles.ts` 6 vs `normalize.ts` 10; the region/type/capacity/coordinate/email validators; **every** token named in §5.8; the §7 contrast figures; no rate limiting in `backend/src` or any `infra/` template; no SES client; no `traderId` generator; `actors.controller.ts`'s two `@Get`s; the route tree and `?id=` pattern; `toAdminActor`; `ActingAdminResolver`; `lambda-handler.e2e.spec.ts`; the `*-a11y.test.tsx` convention; and that `SR-` collides with no chunk-2 prefix.

**The root defect is therefore not that the design was unverified — most of it was accurate. It is that §1 was headed "verified present, not assumed" over a table assembled from a subagent's summary that the author never opened the files to check.** Seven false claims passed under a label asserting they could not. That label is the finding; C-1, C-5, C-6, C-10, C-13, and B19 are its symptoms.

## 3. Correction Round 1

**Authorised by JuanCode, 2026-08-05**, at the widest of the three offered scopes: all
confirmed findings, all severity-contested findings, and all seven suspects **after Leader
verification against the files** — plus the both-judge INFO rows that were unowned
requirement clauses. Three fixes were genuine forks and were decided by the user, not the
Leader:

| Fork | Decision |
|---|---|
| C-2 payload cap | **Raw `app.use` ahead of `configureBodyParser` in both entrypoints.** Chosen over parse-then-reject and over lowering the global limit. Accepts a shared-bootstrap edit and therefore **triggers the §9 reversion challenge** that revision 1 declared not triggered |
| C-5 logging | **Build a minimal capability in scope** — interceptor + request-id, scoped to this module's paths. Chosen over narrowing NFR-8 or striking it |
| C-11 lookup transport | **`POST` with a body.** Chosen over keeping `GET` with an infra constraint, or a hashed email |

### 3.1 Leader verification of the suspects

Verified directly against the files before any edit, per the commitment that file evidence
outranks single-judge assertion:

| ID | Verified | Evidence |
|---|---|---|
| S-2 | Confirmed | `actors/dto/actor-create.dto.ts` — `traderId` is `@IsString() @MinLength(1)`, no pattern |
| S-3 | Confirmed | `test/lambda-handler.e2e.spec.ts:51` — `$transaction` is a mock; no rollback semantics |
| S-5 | Confirmed | `actors/dto/admin-actor-create.dto.ts:20` — `crops` is `@IsOptional()` |
| S-1, S-4, S-6, S-7 | Confirmed by inspection | Logic defects in the Leader's own document; no file check applicable |

Also verified during round 1, before the correction: C-1 (`actor-audit.service.ts:127`),
C-5 (zero logging matches in `backend/src`), C-6 (`roles.ts:15`), C-7
(`frontend/CLAUDE.md:26`, `ConfirmDialog.tsx:245`), C-8 (`pii-boundary.spec.ts:276-278`),
C-10 (`20260710132750_add_import_audit_action/migration.sql`), B19
(14 `TZ-SEED-*` rows in `prisma/seed-data.ts`). **Ten findings verified directly.**

### 3.2 Correction actor

Performed **by the parent orchestrator inline**, not by a delegated fix actor — a
disclosed deviation from the skill's "use the bounded fix actor" step. Reason: the
correction was a full rewrite of `design.md` plus ~12 targeted `requirements.md`
amendments, where document-wide coherence matters more than actor independence, and the
ledger itself supplied the specification. The scoped re-judgment is the independence
check on this work.

### 3.3 Work units

`design.md` → **revision 2** (full rewrite; disposition table at its §13).
`requirements.md` → amended: §4 and §14 endpoint counts; FR-4 (+2 clauses: verified
address is the published address, attempt counter increments on a wrong code); FR-6
(+1 clause: no PII in a URL); FR-10 (scenario amended — no fabricated duplicate-check
timestamp); FR-12 (+1 clause: collision is a recoverable error; prefix count 6→8; `TZ-`
claim retracted); FR-15 (+scope correction: four files); D-9 (A-4 attribution corrected);
NFR-3 (measure amended); §8 (+DC-23, DC-24, DC-25, DC-26; DC-5 downgraded from "gated");
§10 (migration `MODIFY` disclosed; `EmailVerification` and lookup-bounding columns added);
§12 (DEP-6 gating corrected, DEP-11 added).

**Budget re-derived, not adjusted:** 24 tasks / ~4,700 LOC / ~30 rounds →
**31 / ~9,300 / ~38**, from measured analogues. The revised figure agrees with the epic's
6× RICE ratio, which revision 1's did not — the clearest single indicator that revision 1
under-read the scope by roughly half.

## 4. Scoped Re-Judgment (round 1)

**`rejudge-alpha`: 0 NOT FIXED · 3 PARTIAL · 0 REGRESSED · 6 new SEVERE.**
`rejudge-beta` did not deliver through two requests — recorded as a **single-judge
re-judgment**, not as a clean second pass (same harness behaviour as round 1, where both
judges required explicit re-requests; cf. chunk 2's Kaizen row on lost Reviewers).

### 4.1 All 22 round-1 fixes verified landed

C-1 … C-10, C-12 … C-14, S-1 … S-7 and the both-judge INFO rows: **FIXED**, each
re-verified against the files. Notably the judge independently confirmed two mechanisms
sound that could have been wrong: the **raw `app.use` payload cap** (Express ordering
genuinely holds, since `configureBodyParser` is itself `app.useBodyParser` + `app.use` at
`body-parser.config.ts:123-126`) and **per-candidate `duplicateDismissals`**. It also
confirmed runtime route enumeration is achievable (C-9), and — checking DD-3's retraction —
traced `consent-provenance.policy.ts:81-119` to verify that with `stored = null` every
return path is `true`, so the invariant call really is tautological at that call site.

### 4.2 PARTIAL (3)

| ID | Residue |
|---|---|
| **C-11** | Fixed in `design.md` and FR-6, **stale at `requirements.md:54`** — the §4 diagram still reads `GET /registrations/lookup`, the verb the fix forbids. The same diagram omits `consent-policy` and `dismiss-duplicate`. **Leader-verified.** |
| **C-15** | A18's limb fixed and every measured count verified exact (`ActorForm.tsx` 916, `ActorsTable.tsx` 729, tests 699/599, `pii-boundary.spec.ts` 423). **B20's limb not fixed:** "31 tasks at chunk 1's demonstrated >1 round/task" is still uncited, and the arithmetic runs the wrong way — chunk 1's record gives ≈16–17 rounds over 10 tasks (~1.6/task), so 38/31 = **1.23/task** puts the tripwire *below* the evidence it claims to scale from (~50 at chunk 1's rate) |
| **A28·B25** | Corrected at D-9 and purged from `design.md`, but the miscitation survives twice in `requirements.md` — FR-2's `Rationale / Source` and §14's trace column |

### 4.3 Fix-caused SEVERE (6) — the round's real finding

**Four of the six are mechanisms invented to close round-1 findings, and each is a mechanism a design document structurally cannot validate.**

| ID | Fix-caused defect | Leader-verified |
|---|---|---|
| **RA1** | The A31 fix specifies a **per-year counter row that no schema object declares.** §2 declares three objects, §2.6 describes two `CREATE TABLE`, and `requirements.md:670` says "Two new schema objects" while `:70` says "one new enum and two new models". The allocator cannot be built as described | **Yes** |
| **RA2** | The C-4 fix never states **what a locked lookup returns** — and no answer preserves byte-identity, because a lockout is reachable only for a reference that *exists*. **It reintroduces the exact membership oracle C-3 and §3.1 decision 4 existed to eliminate** | Reasoned |
| **RA3** | `lookupAttempts` is keyed on an **enumerable sequential** reference, with no reset-on-success and no per-caller dimension. A few hundred requests lock out **every** applicant — denying the R-3 fallback channel that FR-13 and NFR-10 both depend on | Reasoned |
| **RA4** | The S-1 fix moves OTP lookup onto `email`, which is **not unique** and which the design allows 3 live rows for, without stating row selection. Latest-row selection rejects a valid earlier code, burns its attempts, and makes the per-code cap of 5 an effective 15/hour | Reasoned |
| **RA5** | The B26 fix deliberately routes `REGISTRATION_APPROVE` into actor history, where `frontend/lib/api/actors-admin.ts:203` is a hardcoded **5-member union** and `ActorHistoryPanel.tsx`'s `actionBadgeClasses` switches those five with **no `default`**. `IMPORT` is already absent — **the drift is live in the repo today**, proving it degrades silently. §9's "no existing label or token changes" is false; both files are absent from §1.3, §10 and §12 | **Yes** |
| **RA6** | The S-6 fix added an FR-4 scenario and never updated §14. **The true total is 41, not 40** — verified by count: FR-4 has 3. The uncounted scenario is *"The verified address is the published address"*, whose failure publishes an unverified or null contact address for the entire cohort. **KZ-005 committed in the document that carries the KZ-005 rule** | **Yes** |

WARNING: **RA7** (the route-derived scan needs a per-route fixture map, and nothing requires it to be total — one `continue` restores C-9) · **RA8** (the cap keys on `Content-Length`, so a chunked request bypasses it; and raw Express middleware sees `/api/v1/...`, so a scope match written against `/registrations` matches nothing) · **RA9** (two hand-written `app.use` sites reintroduce exactly the drift `body-parser.config.ts:8-11` exists to forbid — a `configure*` helper in `common/` was available and unused). SUGGESTION: RA10, RA11, RA12 (`§136` cited as a section number where `:136` was a line).

## 5. Terminal Receipt

**`JUDGMENT: ESCALATED ⚠️`**

| Field | Value |
|---|---|
| Target | `design.md` revision 2 + `requirements.md` |
| Rounds | 1 correction round, 1 scoped re-judgment (single-judge) |
| Round 1 | 8 confirmed SEVERE · 7 severity-contested · 7 suspects (all Leader-verified) · 19 INFO |
| Correction | 22 findings fixed, all verified landed |
| Re-judgment | 3 PARTIAL · **6 fix-caused SEVERE** · 3 WARNING · 3 SUGGESTION |
| Fix rounds remaining | 1 |
| Terminal state | **escalated** |

**Why escalated rather than approved.** Two independent reasons, either sufficient:

1. **The correction round injected six severe defects while fixing twenty-two.** That is not a residue to patch; it is a signal about *where* the design was being specified. Four of the six were mechanisms invented under audit pressure — a counter row, a lockout counter, an OTP row-selection rule, a byte-identity exception — each plausible in prose and each unverifiable by any gate a document can carry. A third round would very likely invent a fourth.
2. **The target has been superseded.** The user approved splitting this spec (R-11), so the artifact this lineage judged no longer exists in that form. Signing off an approval for a document being decomposed would be a false receipt.

**Disposition, user-approved 2026-08-05:**

- **Round two corrects by *reducing prescriptiveness*, not by inventing again.** RA1–RA4 become stated **constraints plus rejected options**, with the decision explicitly deferred to implementation and recorded in `execution.md`. RA5 and RA6 are plain factual errors and are fixed outright, along with the three PARTIALs.
- **The spec splits in two**, each successor eligible for its own fresh Judgment Day lineage with its own two fix rounds — which this exhausted lineage can no longer offer, and which is the stronger argument for the split than size alone:

| Successor | Dominant risk | Owns |
|---|---|---|
| **3a** `actors/public-self-registration` | The first unauthenticated write path; unapproved PII at rest | FR-1…FR-8, FR-14 (receipt), FR-15; `Registration` + `EmailVerification` + `RegistrationStatus`; mail, logging, throttling, payload cap; the four public endpoints and the `pii-boundary` release gate |
| **3b** `admin/registration-review-queue` | Irreversible publication of another party's personal data | FR-9…FR-13, FR-14 (decision notices); the five admin endpoints; the two audit actions and methods; the approve transaction and `traderId` derivation |

The split boundary is principled, not merely arithmetic: the two halves carry **different dominant risks and therefore different gates**, and they share only the `Registration` model. Following chunk 1's precedent (which declared `PORTAL_CHECKBOX` for a later chunk to save it a migration), **3a creates the full `Registration` model including the adjudication columns**, so 3b needs no schema migration.

## 6. Correction Round 2 (final — fix ceiling reached)

`rejudge-beta` delivered late, after revision 3 had already been written: **0 NOT FIXED · 7 PARTIAL · 0 REGRESSED · 3 new SEVERE**. It therefore audited **revision 2**, which makes it an unintended but useful control — several of its findings had already been closed by revision 3 without its knowledge, and the ones that survived are the ones revision 3 genuinely missed.

**Two judges now agree on the re-judgment's shape:** all round-1 fixes landed, and the corrections injected new severe defects. `rejudge-alpha` found 6, `rejudge-beta` 3, overlapping on the OTP and lookup mechanisms.

### 6.1 Already closed by revision 3 (no action)

| Finding | Closed by |
|---|---|
| **RB2** `/lookup` lock keyed on the reference → an attacker locks out every applicant | L-3 explicitly rules out any bound keyed **solely** on the reference |
| **RB4** which of ≤3 live codes is selected | V-2 (one live code verifiable) + V-3 (a valid older code is never rejected) |
| **RB7** `Content-Length` bypass; middleware not in `common/` | P-1 (shared `common/` helper), P-2 (`api/v1` prefix), P-3 (length-less requests) |
| **RB12** route enumeration does not deliver FR-8's clause | The RA7 totality requirement — a missing fixture must fail the suite |
| **RB3** scenario count | §14 rebuilt: 25 (3a) / 16 (3b) / 41 total |
| **RB11** `§136` | Corrected to `:136` |
| C-11, C-14 diagram residues | §4 diagram redrawn |
| A28·B25 residues | FR-2 Rationale and §14 Traces corrected |

### 6.2 Fixed in round 2

| Finding | Severity | Fix |
|---|---|---|
| **RB1** | **SEVERE** | **The A23 fix destroyed the S-1 fix.** Moving the OTP consume inside the write transaction — correct, so a downstream failure could not burn a single-use code — meant the `400` rejecting a *wrong* code rolled back the `attempts` increment that S-1 existed to make observable. Two individually-correct corrections, mutually destructive. Fixed by **splitting the obligation**: new constraint **V-1a** (the increment must survive the rejection), §4.1 restructured so the mismatch path never enters a transaction and the success path consumes inside one, and `tasks.md` T-7 given a disqualifier requiring the counter be read in a **separate query after** the request — an in-request assertion structurally cannot see a rollback |
| **C-10 residue** | PARTIAL | `requirements.md` §10 said "Two new schema objects" over a table of three, and "no change to `ActorAuditLog` structure" ten lines above the disclosure that its enum *is* modified. Both corrected, with the 3a/3b ownership named |
| **S-3 residue** | PARTIAL | FR-12's atomicity scenario still demanded proof "by a test that forces the failure" while DC-24 declared that unachievable — the document asserting and denying one gate. The clause now demands what is provable; DC-24 owns what is not |
| **A22·B31 residue** | PARTIAL | DC-6 still listed "a test that the shared invariant is the code path taken" as a gate. That assertion **cannot fail** at this call site. Removed from the gate; retained in DD-3 as drift protection |
| **RB10** | SUGGESTION | The taxonomy failure mode was mis-stated: the three maps are total `Record` types, so a missing entry is a **compile error**, not a silent degradation — and revision 2's own §12 said so. Corrected, and a genuinely-silent fifth consumer added (`LeafletMap.tsx:67`'s `?? '--color-muted'` fallback) |

### 6.3 Carried to chunk 3b, not fixed here

**RB5** (the frontend audit-action union is a hardcoded five-member list with a no-`default` switch; `IMPORT` is already missing, so the drift is live today) · **RB8** (`duplicateDismissals` as a `Json` read-modify-write has no compare-and-set, so two reviewers dismissing different candidates lose one) · **RB9** (`AcknowledgeDialog.tsx:379` carries the *identical* `bg-danger` as `ConfirmDialog.tsx:245`, so the token argument in DD-10 is void — the `frontend/CLAUDE.md:26` mandate alone justifies the choice, and the red confirm is an accepted deviation) · **RB6** (a single per-year counter row inside an interactive transaction serialises submissions while holding a connection; tolerable at ~150 submissions, but the trade and the year-boundary case are undocumented — folded into constraint A-1's evidence obligation).

### 6.4 Fix ceiling

**Reached.** Two correction rounds and two scoped re-judgments are the contract's maximum. No third round is available on this lineage, and **round 2's changes are unaudited** — that is stated plainly rather than left for a reader to infer. The successors each open a fresh lineage.

### 5.1 Lessons for `/akili-archive`

Two, and the second is the one worth carrying:

- **Round 1: a provenance claim is a factual claim.** §1 was headed *"verified present, not assumed"* over a table built from a subagent's summary the author never checked. Most of it was true — one judge verified ~25 claims — but seven were false and passed **because the label asserted they could not be**. Revision 2 put a `file:line` on every codebase assertion.
- **Round 2: fixing an audit finding by inventing a mechanism moves the defect, it does not remove it.** Six of six new SEVEREs were introduced by the corrections, four of them mechanisms invented to satisfy a finding. Under audit pressure the instinct is to answer *"how?"* — but a design document cannot test a `how`, so each answer became a new untested claim. RA2 is the clearest case: the fix for a missing rate limit reintroduced the membership oracle two earlier decisions existed to prevent. **The correct response to "this requirement has no mechanism" is often to state the constraint and the rejected options, and let the choice be made where it can actually be verified.**

- **The sharpest instance, and the one to carry: two correct fixes can cancel each other.** A23 said *move the OTP consume inside the transaction* so a downstream failure cannot burn a single-use code. S-1 said *increment the attempt counter on a wrong code* so the brute-force cap is reachable. Both were right. Applied together they produced a counter that increments and is then rolled back by the very `400` that should have recorded it — so S-1's defect **survived its own fix**, invisibly, and would have passed any test that asserted the counter *within* the failing request (RB1).
  Neither round-1 judge could have caught it: it did not exist until the corrections created it. It was found only because the re-judgment was scoped to *fix-caused* defects rather than to re-reviewing the design. **A findings ledger tracks defects independently; it does not track interactions between their fixes. When two corrections touch one transaction boundary, one control flow, or one lifecycle, the interaction is a third thing that needs its own verification** — and the verification has to observe state from *outside* the operation, because inside it the rollback is invisible.
