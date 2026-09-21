# Execution Log — Account-access emails that actually arrive (Phase 1)

## Document Control

| Field | Value |
|---|---|
| Spec path | `auth/account-access-emails` |
| Jira | **ATP-71** |
| Branch | `feat/atp-71-account-access-emails` |
| Approval Mode | **gated** |
| Budget | 9 tasks · ~640 LOC · 2 review rounds (`design.md` §11) |
| Leader | Opus 5 (T1) |
| Implementer | `akili-implementer` wrapper → **Sonnet** (T2) |
| Reviewer | `akili-reviewer` wrapper → **Opus** (T3) — differs from the Implementer by configuration, not by discipline |
| Run started | 2026-09-21 |

---

## Leader corrections to the spec (not task work)

### `tasks.md` T-1 / T-2 Disqualifier — corrected during T-1, attempt 1

T-1's Reviewer raised it as an advisory, and it was a defect in **Leader-authored task text**, not in the diff. The disqualifier read:

> *"if the suite passes with `PUBLIC_APP_BASE_URL` unset, the resolution is at module load and the test is not exercising FR-1's link clause."*

That describes a state that **cannot occur**. With the variable unset, a module-load resolution throws at import and the suite *fails to run* — it does not pass. Falsifier 2's observed behaviour confirmed the opposite direction empirically.

Corrected in both T-1 and T-2 (T-2 said "as T-1" and would have inherited it). **This is KZ-011's exact shape**: the Reviewer audits the diff against the task, and nothing audits the task against reality — except, here, a Reviewer who looked anyway. Recorded rather than quietly fixed, because the Leader's own artefacts are the half of the surface nothing routinely gates.

---

## Task Execution History

### T-1 — Add the invitation email template

**Status:** in progress · **Attempts so far:** 1 (FAIL) · Date: 2026-09-21

**Leader decisions.** Skills: `nestjs-expert` only — `tdd` deliberately **not** assigned, despite this being test-heavy: a direct exemplar exists (`receipt.template.spec.ts`, written under ATP-67 with the identical per-call-resolution pattern), and a worked example steers better than a process where one already solves the shape. Effort: `medium` — well-specified task with an exemplar. No environment pre-check needed; the verification is a unit suite with no stack dependency.

#### Attempt 1 — Reviewer `FAIL`

**Files changed:** `backend/src/mail/templates/invitation.template.ts` (new, 85 lines) · `backend/src/mail/templates/invitation.template.spec.ts` (new, 121 lines). No other file touched — confirmed by `git status`.

**Implementer verification:**
- `cd backend && npx jest src/mail/templates/invitation.template.spec.ts --silent` → PASS, 9/9.
- `npx eslint <the two files> --quiet` (non-mutating form) → exit 0.

**Falsifiers — both run, both observed to redden, mutation confirmed applied before trusting the red:**
1. Hardcoded a host in `signInUrl()` → 7 of 9 tests reddened, including the named target `never emits a hardcoded host`. Reverted, byte-identical, 9/9 green.
2. Hoisted the URL resolution to a module-level constant → **the whole suite failed to import** (`Missing required mail env var PUBLIC_APP_BASE_URL` at module load), which is a stronger result than the task asked for: with the variable unset in the ambient test environment, a module-load resolution cannot even reach a test body. Reverted, byte-identical, 9/9 green.

**Implementer's declared gap:** for the temp-password `AND` clause it recorded *"Falsifier not separately run (not requested)"* — honest, and neither (A) nor (B) under KZ-013.

**Reviewer verdict: `STATUS: FAIL` — one gating issue.**

> **Discovered Issue:** The `signInUrl()` docblock asserts as present-tense fact a catch contract that is both nonexistent and contrary to the approved design:
>
> > *"the caller (MailService's sendInvitation, T-3) awaits this inside its own try/catch, and UsersService.create (T-4) already swallows and logs a dispatch failure rather than failing the create request (FR-4)."*
>
> Both halves are false, verified at source:
> - `MailService.dispatch` documents the opposite contract verbatim — *"Rethrows a transport failure unchanged — this module does not decide whether a caller treats a failed send as fatal"* — and its `try` wraps only `getMailTransport().send(message)`, so it would not intercept a `getPublicAppBaseUrl()` throw raised during message construction in any case. T-3's scope and design §5.2 say `sendInvitation` only "hands to the private `dispatch`"; neither grants it a `try`/`catch`.
> - `UsersService.create` does not "already" do this. It imports no `MailService`, contains no dispatch, and has no `emailSent`. Its only `try`/`catch` routes Cognito errors through `mapCognitoError`. The swallow-and-log is T-4's unwritten work.
>
> This is not cosmetic. The exemplar sentence it was patterned on (`receipt.template.ts`: *"`RegistrationsService.dispatchReceiptEmail` already catches and logs it"*) names the **service-level** catcher and was true when written. Relocating that role to `MailService.sendInvitation` points the next task at a contract violation: **if T-3 implements the swallowing catch this comment describes, `UsersService` can never observe a send failure and `emailSent` becomes unconditionally `true`, silently defeating FR-3's "not sent" scenario and FR-4's returned signal.**
>
> **Violated Rule:** `design.md` §5.2 and §5.3; root `CLAUDE.md` § Reviewer dispatch ("those files train every future agent"); **KZ-008**.
>
> **Remediation Suggestion:** Rewrite the final sentence to name the real catcher and drop the false tense. No code change is required; the runtime behaviour of the diff is correct.

**What the Reviewer confirmed as sound** (recorded so attempt 2 does not re-litigate it): clause coverage for every T-1-owned clause; exemplar fidelity one-for-one; NFR-4's plain-text part adequate; the §5.1 block list exact; `reference: undefined` type-safe (`exactOptionalPropertyTypes` is not set); no scope creep. The all-URLs sweep in the spec was judged **stronger than the exemplar's** single `not.toContain`.

**ADVISORY (non-gating, recorded and not acted on as task work):**
- The Reviewer **closed the declared falsifier gap by inspection** rather than requiring the mutation: `TEMP_PASSWORD` has exactly one source in the output, so `toContain` over both parts cannot pass if the interpolation is removed. It credited the clause as covered "on that basis, not on the Implementer's *structurally covered* framing, which was the wrong argument for the right conclusion."
- Latent coupling: `email-layout.ts`'s `callout` escapes `& < > " '`; `generateTemporaryPassword`'s symbol set is disjoint from those five, so the HTML assertion is safe today. Adding `&` or `'` to `SYMBOLS` would break it — noisily, which is the right failure mode.
- `HARDCODED_HOST` names a domain this template never carried, so that single assertion is near-vacuous in isolation. Fine as written because the all-URLs sweep beside it is the real gate.
- Reviewer tooling note: its wrapper exposes only `Read`/`Grep`/`Glob`, so the assigned `nestjs-expert` skill was unreachable and it could re-run nothing. It reconciled Falsifier 1's "7 of 9" arithmetic against the source and found it consistent — corroboration by reading, not by execution (`author ≠ auditor` holds on reading; **KZ-012**).

#### Attempt 2 — Reviewer `FAIL`

**Files changed:** `backend/src/mail/templates/invitation.template.ts` only — two docblocks rewritten. Comment-only; the spec file stayed byte-identical.

**Implementer verification:** suite 9/9, eslint clean. Leader re-ran both independently: same result.

**What attempt 2 got right.** The Reviewer confirmed the gating defect is genuinely closed — it re-read `mail.service.ts`, `users.service.ts` and `mail.config.ts` and found every claim in the corrected `signInUrl()` docblock true of the code as it stands, with each future-tense "will" anchored to both a named task and a design section that actually prescribes it. The Implementer also found and corrected a **second** false docblock on its own initiative (the file header, same present-tense defect), which was not in its brief.

**Reviewer verdict: `STATUS: FAIL` — two issues, both the same class as the first FAIL, both in text the sweep was supposed to have covered.**

> **Issue 1 — the spec file still asserts the rule this project retracted during this very task.** `invitation.template.spec.ts`'s docblock reads *"A suite that passes with `PUBLIC_APP_BASE_URL` unset would mean the resolution moved to module load — the disqualifier this task names."* It inverts the signal (with per-call resolution the suite **does** pass, because each test sets the variable itself; under module-load resolution the import throws and the suite fails to run — exactly what Falsifier 2 observed) **and** it misattributes the claim to a task text that now says the opposite.
> **Violated Rule:** `tasks.md` T-1 Disqualifier as corrected, and this log's own "Leader corrections" entry; **KZ-011**; **KZ-008**.
>
> **Issue 2 — `@param temporaryPassword The single-use credential Cognito issued.`** Cognito does not issue it. `users.service.ts` calls `generateTemporaryPassword()` (local CSPRNG, `temp-password.util.ts`) and *passes* it to `AdminCreateUser`; the response returns no credential. `design.md` §2 states the opposite of the comment.
> **Violated Rule:** `design.md` §2, §5.3; `backend/CLAUDE.md` § Users module.

**⚠️ Leader accountability — Issue 1 is the Leader's defect, not the Implementer's.** The original T-1 Disqualifier was wrong (see "Leader corrections" above). The Implementer faithfully reproduced it in a code comment in attempt 1. The Leader then corrected `tasks.md` **and did not sweep for the comment quoting it** — which is precisely **KZ-004**: *a correction is not applied when its cited site is fixed; grep the withdrawn premise and read every hit.* The Reviewer caught the Leader's incomplete sweep.

**Sweep performed after this FAIL (both directions, KZ-004):**
- Forward — `grep` for the retracted phrasing across the tree: three hits. Two are intentional historical records (the correction note in `tasks.md`, the quotation in this log). **One is live and wrong:** `invitation.template.spec.ts:9`.
- Backward — `grep` for references *to* the corrected disqualifier: one hit, the same spec-file comment.
- Verified Issue 2 independently: `users.service.ts:164` and `:307` both call `generateTemporaryPassword()`.

**ADVISORY (non-gating, recorded, not acted on as task work):**
- The file's top docblock sits directly above `const SIGN_IN_PATH = '/login'`, so IDE hover attaches the FR-1 description to a string constant. The exemplar `receipt.template.ts` avoids this with a dedicated one-liner on the constant.
- "`MailService.dispatch` … does not absorb this" is true but may imply the config throw passes *through* `dispatch`; it never reaches it, being raised during message construction.
- "replacing the manual handoff" tracks FR-1's rationale, but FR-2 **retains** the on-screen password as the fallback — demoted, not removed. Noted so no later reader treats it as licence to drop FR-2.
- Reviewer could not diff directly (no `Bash` in its wrapper) and re-ran nothing; it reconciled the Leader's `git status` and line-count delta instead, and flagged that neither issue would change colour under any test in the suite — *"which is exactly why they need a reader."*

#### Attempt 3 — Reviewer `PASS` ✅

**Files changed:** both T-1 files, comment-only. Two flagged sentences corrected; the advisory constant-doc separation taken (a dedicated one-liner above `SIGN_IN_PATH`, mirroring `receipt.template.ts`'s `STATUS_LOOKUP_PATH`, so the FR-1 module docblock no longer binds to a string constant on hover).

**Required deliverable:** an **itemised, comment-by-comment verification list** naming the file and symbol where each external claim was confirmed — not a sentence claiming a sweep was done. Two rounds had already failed on a declared-but-unperformed sweep, so the brief made the list itself the evidence and stated plainly that a passing suite proves nothing about a prose defect.

**Verification:** suite 9/9, eslint clean — Leader re-ran both independently. Leader also grepped the tree: the retracted phrasing and the Cognito misattribution are both gone from code, surviving only in the two intentional historical records.

**Reviewer verdict: `STATUS: PASS`.** It did not accept the itemised list — it spot-checked a representative sample at source and found every sampled claim true, and it went past the sample in one place that matters: to test the new spec-file sentence's premise it read `backend/package.json`'s Jest block and confirmed there is **no `setupFiles` and no dotenv hook**, so `PUBLIC_APP_BASE_URL` genuinely is unset ambiently. It then noted the claim holds in the other direction too — if the variable *were* set, hoisting would make the refusal tests fail rather than pass, so *"cannot pass"* is true either way. It also reconciled the 9/9 figure by counting nine `it` blocks rather than trusting the report.

**ADVISORY (recorded, not acted on — advisories never gate and never become tasks):**
1. The module docblock says "Staff/Admin user", but `role` is optional on `CreateUserDto` and `create()` dispatches regardless of group, so a group-less user can also receive an invitation. Tracks the persona wording rather than the code path; does not mislead about behaviour.
2. Carried from attempt 2: *"`MailService.dispatch` … does not absorb this"* is true but leaves unsaid that the config throw is raised during message construction and never reaches `dispatch` at all.
3. Pre-existing, not introduced here: the all-URLs sweep runs over `msg.html` only; a second independently-written host in `msg.text` would be caught only by the narrower `HARDCODED_HOST` assertion.
4. Neither fixed defect would have changed the colour of any test — the third Reviewer in a row to make that observation about this class.

---

### T-1 — FINAL: `[x]` PASS

**Attempts:** 3 · **Reviewer invocations:** 4 (one per attempt, plus the judgment-day pair ran earlier against the design, not this task) · **Date:** 2026-09-21

**Requirements covered:** FR-1 scenario 1 — the temp-password `AND`, the link `AND`, the no-hardcoded-host `BUT`; NFR-3; NFR-4. *(FR-1's `AND IT MUST` `FORCE_CHANGE_PASSWORD` clause and scenario 2 belong to T-4 per the `tasks.md` §6 coverage table and are correctly untouched here.)*

**Final verification:** `cd backend && npx jest src/mail/templates/invitation.template.spec.ts --silent` → 9/9 PASS. `npx eslint <both files> --quiet` → clean. Both falsifiers demonstrated in attempt 1 and unaffected since.

**Issues encountered — all three FAILs were the same class, and none was a code defect.** Every one was a comment asserting something the artefacts did not bear (**KZ-008**, the project's most recurrent lesson at ×7). The first would have done real damage: it instructed T-3 to put a swallowing `try`/`catch` inside `MailService`, which would have made `UsersService` structurally unable to observe a send failure and pinned `emailSent` to `true` — defeating FR-3's "not sent" scenario and FR-4's returned signal, **with the whole suite green**.

**Leader decisions and one Leader defect:**
- Skills `nestjs-expert`, no `tdd` (a direct exemplar existed). Effort `medium` → `high` → `xhigh` across attempts, per the rework rule.
- ⚠️ **The second FAIL was caused by the Leader.** T-1's original Disqualifier text was wrong; the Implementer faithfully reproduced it in a code comment; the Leader corrected `tasks.md` and did not sweep for the comment quoting it (**KZ-004** — *a correction is not applied when its cited site is fixed*). Recorded as the Leader's, not diluted into "the Implementer's sweep missed it".

**Process change carried into T-2 onward (brief wording only — no change to `tasks.md`, no new scope).** Every T-1 defect shared one shape: a comment describing a contract with a task that does not exist yet, written in the present tense. Each subsequent Implementer brief will carry an explicit rule — *any claim about a later task is written in the future tense with its design reference, never as "already"* — and will require the itemised verification list that finally closed T-1. This attacks the cause rather than paying a Reviewer to catch the same class six more times.

---

## Leader corrections to the spec (continued)

### T-9 → T-6: the TRD §4 response-shape update was sequenced wrong

T-9 (`deps: none`) was scoped to update `docs/trd/trd.md` §4 for the new response shape. But `emailSent` is created by **T-6**, and T-9 is independent of it — so running T-9 first, as its own dependency graph invites, would have had an Implementer document a field that does not exist.

That is the same defect class that cost T-1 three attempts: **a document asserting something the codebase does not bear** (KZ-008). It would have been written by an Implementer faithfully following an approved task, exactly as in T-1's second FAIL.

Moved the single bullet to T-6, which is where the field comes into existence. T-9 keeps the Cognito retirement and the premise sweep and stays dependency-free. No new scope — one bullet relocated between two approved tasks to fix a sequencing defect found in flight.

---

### T-2 — Add the admin-reset email template

**Status:** `[x]` PASS · **Attempts:** 1 · **Date:** 2026-09-21 · Ran **in parallel with T-9** (disjoint files, disjoint toolchains)

**Leader decisions.** Skills `nestjs-expert`; effort `medium`. Exemplar chosen deliberately: the **just-approved `invitation.template.ts`**, not `receipt.template.ts` — same shape, and it already embodies the comment discipline that took T-1 three attempts to reach. The brief also carried the two new rules introduced after T-1 (future tense + design reference for any claim about a later task; an itemised file+symbol verification list as the deliverable).

**Files:** `backend/src/mail/templates/admin-reset.template.ts` (103 lines, new) · `admin-reset.template.spec.ts` (164 lines, new). Nothing else.

**Verification:** 12/12 on the task suite; full backend suite 81 suites / 1178 tests; `eslint --quiet` clean; `npm run build` clean.

**Falsifiers — both run, reddened, mutation confirmed applied, reverted byte-identical:**
1. Hardcoded host → 7 failed / 5 passed, including the named target.
2. Hoisted resolution to module load → the whole suite failed to run at import.

**Reviewer verdict: `STATUS: PASS` (first attempt).**

It did not take the done-when on trust. Rather than checking that a distinguishability test exists, it **read both templates side by side** and judged the copy: *"reset the password on your **existing** account"* vs *"**created** an account for you"*; callout *"**New** temporary password"* with *"your **previous password no longer works**"*. It singled out the closing note as the sign of real judgment rather than string-swapping — the invitation's *"you can ignore this message"* would be **actively wrong advice on a reset**, since the password has already changed, and it was replaced with *"contact your administrator"*. It further confirmed the three tests are discriminating by checking the invitation's own output fails all three.

It spot-checked 5 of the 6 itemised claims at source plus two the list omitted, and **reconciled Falsifier 1's arithmetic exactly**: hardcoding the host would fail tests 1, 2, 5, 6, 7, 8, 9 and leave 3, 4 and the three distinguishability tests green — 7/5, precisely as reported. *"That arithmetic could not come out right by accident, so I credit the mutation as real."*

**The T-1 failure class did not recur.** Every forward claim is future-tense with its design reference and marked not-yet-built; every present-tense claim about another file verifies. The Reviewer specifically checked the T-1 near-miss and found it corrected at the root: this comment places the swallowing `try`/`catch` in `UsersService` and says explicitly that `MailService.dispatch` rethrows — the correct instruction for T-3/T-5, preserving FR-3/FR-4 observability.

**Requirements covered:** FR-5's dispatch `THEN` (T-2's half — the message exists and carries password + link), NFR-3, NFR-4. T-5's clauses (`emailSent`, `Permanent: false` pinned by test, `sub` resolution) correctly absent.

**ADVISORY (recorded, not acted on — advisories never gate and never become tasks):**
1. Test title `'carries the new temporary password in both parts (FR-5 AND)'` cites a clause that does not exist — FR-5's scenario has two `AND`s, neither about the email's contents. The behaviour **is** required, by FR-5's *Description*. The exemplar's `(FR-1 scenario 1 AND)` was accurate; this copy of it is not. A false citation in a test title, same class as T-1's failures but non-gating.
2. Carried from the approved T-1 exemplar: the `signInUrl` docblock's blast-radius reasoning attributes containment to `MailService.dispatch` rethrowing, when the `getPublicAppBaseUrl` throw actually fires at build time inside the send method, before `dispatch` is entered. True as written, slightly wrong mechanism. **Fix in both or neither** — it is inherited, not introduced.
3. `{@link ../templates/invitation.template.ts | buildInvitationMessage}` — redundant path on a sibling, and a TSDoc file-path link resolves to no symbol.
4. Two template literals with no interpolation.

**⚠️ Leader note on concurrency — the isolation was not airtight.** T-2's Reviewer was instructed not to read `backend/CLAUDE.md` (T-9 was mid-edit). It complied, and reported that **the harness injected the file's full contents into its context anyway, twice**, including T-9's in-flight edit. Nothing in the audit depended on it, so the verdict stands — but the mitigation was incomplete, and a future parallel wave should not assume a "do not read X" instruction isolates a worker from X.

---

### T-9 — Retire the dead Cognito invitation template and sweep the premise

**Status:** in progress · **Attempts so far:** 1 (FAIL) · Date: 2026-09-21 · Ran **in parallel with T-2**

**Leader decisions.** Skills `aws-serverless` + `cognitive-doc-design`; effort `high` (touches a constitutional baseline and turns on the KZ-004 premise sweep, which had just caused T-1's second FAIL). Scope corrected before launch — see "Leader corrections" above: the `docs/trd/trd.md` bullet moved to T-6.

**Files:** `infra/10-data-auth/template.yaml`, `infra/README.md`, `backend/CLAUDE.md`.

**Verification:** grep before → hits in both infra files; grep after → clean outside `docs/specs/**`. `validate.sh` → PASS on all three stacks, reported explicitly as *"the template parses"* and not as evidence of deployment.

#### Attempt 1 — Reviewer `FAIL` (3 issues)

**What held:** both symbols gone; FR-7's J-2 clause discharged **wider than claimed** — the Reviewer re-ran the grep itself and independently established two things the report did not: no `infra/scripts/*.sh` passes `PortalUrl` as a `--parameter-overrides` value (*"that would have broken `sam deploy` on the next `DEPLOY_INFRA=true` run"*), and `infra/README.md` §6's prose carries no invite-template reference either. Every factual claim in the `backend/CLAUDE.md` note verifies. DD-7's annotate-not-rewrite is structurally satisfied. The premise-sweep disposition (leave `users.service.ts` / `temp-password.util.ts` alone) is correct — *"editing them would itself have been the scope violation."*

> **Issue 1 — the `template.yaml` comment reintroduces the J-3 defect AND describes an undeployed change as live.** The clause *"a console-created user **now gets** Cognito's unbranded default invitation"* fails twice: DD-5 **as corrected by J-3** says only that such users are *"understood to trigger it"* and records the consequence as *possible, not certain* — the comment converts that to flat fact; and `now … instead of` asserts a change in pool behaviour that has not happened, since `10-data-auth` deploys only under `DEPLOY_INFRA=true`. FR-7's negative clause is *"must NOT be described **anywhere** as live before that deploy has run"*.
> The Reviewer's sharpest point is the internal inconsistency: **the comment seven lines above it, in the same resource, hedges correctly** (*"This repo has recorded (not independently re-measured here)…"*, *"whether IT reaches this template is untested here"*), and **the sibling `backend/CLAUDE.md` edit in the same diff gets the not-shipped framing exactly right.** So this is a regression against discipline already practised in the file being edited — and it lands in config, which gets no judgment-day pass.
> **Violated Rule:** FR-7 (`BUT it must NOT`); DD-5's J-3 marker; `judgment.md` J-3.

> **Issue 2 — the `backend/CLAUDE.md` tail lets an absolute security rule read as conditional.** *"…must never be logged/stored/audited; it exits only via the Admin-guarded response **while this remains the active path**."* Strict syntax attaches the adjunct to the second clause only, but a semicolon coordinates, and the qualifier is sentence-final **and bolded**. The standard for a file that trains every future agent is not *"what does careful parsing yield"* but *"can a hurried reader take the weaker reading"* — they can.
> **The direction of the misreading is what makes it gating.** "Never logged" is NFR-1, absolute, and its blast radius **expands** at exactly the moment the qualifier suggests it lapses: once FR-1/FR-5 land, the credential enters a dispatch path with attempt/outcome log lines — the very path where **J-4** caught a near-miss that would have logged a plaintext address as the correlation id.
> **Violated Rule:** NFR-1; root `CLAUDE.md` § constitutional-baseline blast radius.

> **Issue 3 — `"This **was** a deliberate exception"` is now false, and is a rewrite rather than an annotation.** FR-2 requires the response to **continue** returning the temporary password (*"SHALL continue to return"*), so the exception to "never return a plaintext password" is not past — it persists after this spec ships. DD-7 authorised correcting the **forward-looking instruction**; the tense of a still-true statement of record was not in scope, and flipping it tells a future agent the exception has ended.
> **Violated Rule:** FR-2; DD-7 (*"the section keeps its text"*).

**ADVISORY (recorded):**
1. Scope confirmed only as far as reading allows — the Reviewer cannot enumerate a working-tree diff, so *"exactly three files"* rests on the Leader's extraction. `validate.sh` PASS is likewise the Implementer's account; its meaning is narrow and the Implementer said so correctly.
2. **The premise sweep needs an explicit handoff or it dies here.** `users.service.ts`'s module and `create()` docstrings and `temp-password.util.ts` carry the same withdrawn premise. Correctly outside T-9's Files list — but T-4's and T-5's task text says nothing about docstrings, so *"absent an instruction in their briefs the premise survives in the very file the feature rewrites."* **Carried as a forward pointer below.**
3. No breadcrumb at the `Parameters:` block for an operator diffing against a deployed stack that still has `PortalUrl`. Optional.

**🔭 FORWARD POINTER — T-4 and T-5 briefs MUST carry this.** `backend/src/users/users.service.ts` (module docstring + `create()` docstring) and `backend/src/users/temp-password.util.ts` state the withdrawn premise *"@cgiar.org deliverability, therefore no email"*. They are accurate **today** and become false the moment T-4/T-5 wire the dispatch. Two independent sources flagged it — T-9's Implementer and its Reviewer. Per KZ-004 the sweep is over the **premise**, not the phrase. A pointer filed here is not carried by having been filed; the brief carries it or nobody does.

#### Attempt 2 — Reviewer `PASS` ✅

**Fixes:** the three prose defects, in two files. Nothing structural touched.

**Leader-run verification** (not the Implementer's account this time — the Reviewer has no `Bash` and attempt 1's advisory noted the gap): grep gate empty outside `archive/` and `docs/specs/`; `./infra/scripts/validate.sh` PASS on all three stacks; `sed` on `backend/CLAUDE.md:53` confirms `This is a deliberate exception`.

**Reviewer verdict: `STATUS: PASS`.** Notable in how it judged rather than what it concluded:

- **On over-hedging** (the risk I flagged): it found the comment avoids it **structurally**, not by luck. The rationale is two-pronged — *"No application path sent it"* is asserted **flatly**, and only the console-user *consequence* carries the hedge. So the retirement stands even if the hedged claim resolves false, which is exactly DD-5's *"if the claim is false, the template is simply dead in every case."* **The hedge attaches to the consequence, never to the decision.**
- **On the deploy clause**, it verified rather than read: `DEPLOY_INFRA` appears nowhere under `infra/`, and it established why that is legitimate — it is a Jenkins flag, and `docs/infrastructure.md` records that the `Jenkinsfile` is not versioned here. It then confirmed the default is `false` and that the skipped stage is the one owning `infra/10-data-auth/`.
- **On NFR-1** it read the paragraph as a hurried agent would and found the structure inverted in the right direction: the old defect was a sentence-final bolded adjunct after a semicolon; now **the absolute claim is the one that ends its sentence**, and the only temporal language sits in a separate sentence under a distinct bolded subject. It also grepped every use of the credential in `users.service.ts` (L164/174/191, L307/313/318) to confirm *"today the Admin-guarded response is the only one"* — **no logger call touches it**.
- **On DD-7** it scanned the whole section for a residual "do not email" directive and found none; all four original citations survive.

**ADVISORY (recorded):**
1. *"not independently re-measured here"* faintly implies a prior measurement exists — true for the sibling comment, not for this claim, which J-3 calls uncited. The adjacent ⚠️ marker dominates and resolves it. Register nit. The Reviewer explicitly recommends **keeping** the ⚠️ glyph in config: *"it makes the hedge harder to skim past in config — which is where attempt 1 failed."*
2. **The forward pointer was incomplete — extended below.**
3. Attempt 1's breadcrumb advisory remains unaddressed and optional.

---

### T-9 — FINAL: `[x]` PASS

**Attempts:** 2 · **Date:** 2026-09-21 · Ran in parallel with T-2

**Requirements covered:** FR-7, all three clauses — both symbols gone; the `AND IT MUST` no-other-reference clause discharged repo-wide (the Reviewer's own grep found hits only under `docs/specs/**` and the frozen archive); the `BUT it must NOT` describe-as-live clause satisfied by the `DEPLOY_INFRA=true` precondition. DD-5 and DD-7 honoured.

**Final verification:** grep gate clean · `validate.sh` PASS ×3 stacks · both run by the Leader.

**⚠️ FR-7 is authored, NOT deployed.** `10-data-auth` ships only under `DEPLOY_INFRA=true`, which is not the pipeline default. The repository no longer carries the template; the live Cognito pool still does. This is recorded per NFR-5 and is the task's own disqualifier — do not read the `[x]` as "the pool changed".

**🔭 FORWARD POINTER (extended — supersedes the one filed under T-9 attempt 1).** Four sites carry claims that go false the moment T-4/T-5 wire the dispatch. **T-4's and T-5's briefs must carry all four:**
1. `backend/src/users/users.service.ts` — module docstring (*"no email"*, *"@cgiar.org poor deliverability"*)
2. `backend/src/users/users.service.ts` — `create()` docstring, same premise
3. `backend/src/users/temp-password.util.ts` — docstring, same premise
4. **`backend/CLAUDE.md` — two independently-worded "today" clauses** (*"users.service.ts today calls no MailService method"* and *"today the Admin-guarded response is the only one"*), added by T-9 itself

Sites 1–3 were flagged by T-9's Implementer and its first Reviewer; **site 4 was flagged by the second Reviewer, which observed that the pointer as filed covered only 1–3** — the task's own edits had created new instances of the very thing the pointer tracks. Per KZ-004 the sweep is over the **premise**, not the phrase.

---

## Leader corrections to the spec (continued)

### T-3: the `sub` helper moved from `mail/` to `users/`

`tasks.md` placed the Cognito `sub`-extraction helper "beside" `mail.service.ts`. Resolved before spawning rather than left ambiguous in the brief:

- Its **only** consumers are `UsersService.create()` and `resetPassword()` (T-4/T-5) — `MailService` never calls it.
- `backend/src/users/temp-password.util.ts` already establishes the util pattern in that module.
- Placing a Cognito-attribute concern in `mail/` would create a `users → mail` dependency purely to reach it.

Moved to `backend/src/users/cognito-sub.util.ts`; T-3's `Verify` widened to `npx jest src/mail src/users --silent` so the relocated file stays inside the task's own gate. Decomposition judgment, recorded — no scope added.

---

### T-3 — `sendInvitation` / `sendAdminReset` + the Cognito `sub` helper

**Status:** in progress · **Attempts so far:** 1 (FAIL) · Date: 2026-09-21

**Leader decisions.** Skills `nestjs-expert` **+ `tdd`** — a deliberate override (the task lists only `nestjs-expert`). `.agents/leader.md` says `tdd` earns its cost on PII rules, and T-3's disqualifier is a *test-design* constraint (assert over what the logger emitted, not the helper's return value); writing that assertion first is what forces it. Effort `xhigh` — **not `max`**, because the rule is *never `max` a cheaper tier, escalate the tier instead*, and the Implementer is T2. Helper relocated to `users/` before spawning (see the correction above).

**Files:** `mail/mail.service.ts` (+43) · `mail/mail.service.spec.ts` (+135) · `users/cognito-sub.util.ts` (new, 67) · `users/cognito-sub.util.spec.ts` (new, 73). `users.service.ts` untouched.

**Verification:** 16 suites / 187 tests — Leader re-ran, identical. `eslint --quiet` clean.

**Falsifier — run and reddened**, with output that is itself the proof: mutating the helper to `?? source?.Username` produced
`reference=admin-created-no-sub@example.org` in the captured log text, tripping `expect(emitted).not.toContain('@')`. The Reviewer reconciled that output against `dispatch()`'s two format strings and the fixture address and credited the mutation as real.

#### Attempt 1 — Reviewer `FAIL` (2 issues)

**What held.** `resolveCognitoSub` read line by line: `Username` is never referenced, strict `===`, no coercion; the Reviewer found no input that returns an address except an attribute literally named `sub` holding one, which is upstream and contrary to how Cognito issues `sub`. The `Attributes: []` edge fails **safe** (lost correlation, never a leak). Log capture is genuine and complete — the spies patch `Logger.prototype`, `emittedText()` flattens both, an anti-vacuity `totalCalls > 0` guard is present, and the falsifier's two-line output independently proves both the attempt and outcome lines are captured. Every itemised claim verified at source. Tense discipline held throughout; **the T-1 failure class did not recur.**

> **Issue 1 — the single `(B)` is not a structural gap, and it hides a real hole.** "dispatch rethrows" splits into two claims: `dispatch`'s own rethrow (out of scope, genuinely covered) and **"no swallowing in the new methods"** — a property of `sendInvitation`/`sendAdminReset`, squarely in T-3's scope, provable without touching `dispatch`. Today **no test in the suite would change colour if either new method wrapped its `await this.dispatch(...)` in a swallowing `try`/`catch`**: the transport-selection test asserts only publish counts, and every logging test runs under `no-op`, which never rejects. The exemplar sits **45 lines below** the new tests (`sendContactMessage rethrows a transport failure unchanged`).
> **This is T-1's first FAIL made real.** That gate was about a comment instructing a future task to swallow inside `MailService`; here the property is simply unguarded. A swallow pins `emailSent` to `true` and defeats FR-3's "not sent" scenario and FR-4's signal — with the whole suite green.
> The Implementer's reason — *"existing tests already exercise that private method"* — is precisely the *structurally covered* framing `tasks.md` §2 names as insufficient.
> **Violated Rule:** `tasks.md` §2 and **KZ-013**; consequentially FR-3/FR-4.

> **Issue 2 — the comment justifying the forbidden field gives a false reason, and the false reason invites the edit that disarms the guard.** `CognitoAttributeSource`'s docblock says `Username` is accepted *"so either raw SDK response object can be passed through unmodified."* Not true: TypeScript's excess-property check applies only to **fresh object literals**, so raw `AdminCreateUserCommandOutput.User` / `AdminGetUserCommandOutput` assign to a parameter typed with only `Attributes?`/`UserAttributes?` whether or not the field is declared.
> **What the field actually buys is the tests** — three specs pass object *literals* carrying `Username`, and those literals are what make the J-4 scenario expressible. A reader who discovers raw objects assign without it will delete it as dead weight and silently disarm the falsifier.
> **Violated Rule:** `judgment.md` J-4; `design.md` §5.2; root `CLAUDE.md` § Reviewer dispatch; the comment-truth standard that closed T-1.

**On the design question the Leader put to the Reviewer** (*is putting the email-shaped field inside the helper's own input type acceptable?*): it **weighed it and answered keep the field**, showing the Leader's proposed alternatives are worse. Dropping `Username` buys a compile-time guard but **disarms all three behavioural tests**, so a future editor who re-widens the type and adds the fallback in one commit meets a fully green suite. Narrowing to `AttributeType[]` is the strongest structural guard but pushes design §5.2's `UserAttributes`-vs-`Attributes` trap out to the T-4/T-5 call sites — *"precisely where this class of mistake is made. Net loss."* **Only the stated reason is wrong, not the shape.**

**ADVISORY (recorded):**
1. No test drives the **error** path for the two new kinds, so `status=failed` is unasserted for them. Issue 1's fix closes it for free.
2. `resolveCognitoSub` trusts the value of an attribute named `sub`. Upstream, and exactly what §5.2 prescribes.
3. `Attributes: []` beside a populated `UserAttributes` resolves to `undefined` — safe direction, documented by a precedence test.
4. **🔭 Carry into T-5's brief.** The util quotes `users.service.ts`'s docblock including *"does not echo `Username`"*. **The SDK contradicts it** — `AdminGetUserResponse.Username` is a required member. The quotation is faithful and attributed, and the load-bearing half is true, so it is a **pre-existing inaccuracy inherited by citation**, not introduced here. T-5 is the task that will call `AdminGetUser` and could act on the false belief.
5. As of this diff the helper's only actual consumer is `mail.service.spec.ts`, which reaches from `mail/` into `users/` — correct and load-bearing (it is what lets the falsifier redden a `MailService` test), but it is the mirror of the dependency the relocation avoided, and the placement rationale does not mention it.
6. `mail.service.ts`'s class docblock still says the reference is `"n/a"` only *"for the verification-code message"*. Two new kinds can now log `n/a`, and doing so is the NFR-1-protecting behaviour.

#### Attempt 2 — Reviewer `PASS` ✅

**Fixes:** two `rejects.toThrow` tests closing the swallow hole, with the `@`/password assertions folded onto the failure-path output; and the `CognitoAttributeSource` docblock's justification replaced. **Type unchanged** — the prior Reviewer had already weighed narrowing it and concluded the current shape is the correct trade.

**Verification:** 16 suites / **189 tests** (187 + 2) — Leader re-ran. `eslint --quiet` clean. `grep` confirmed no residual `try`/`catch` in either new method and the interface's three fields intact.

**Reviewer verdict: `STATUS: PASS`.** It verified rather than accepted:
- Traced the new tests through the **real** path — real `MailService` → real private `dispatch` → real `getMailTransport()` → real `MicroserviceMailTransport`, with only `amqplib` mocked — and confirmed the rejecting channel is wired byte-for-byte like two pre-existing passing tests.
- Confirmed the `@`/password assertions genuinely range over the **failure** line, because each test independently pins `status=failed` (emitted only by `dispatch`'s `catch`) into the captured stream. Attempt 1's ADVISORY 1 closed as predicted.
- Checked the new docblock's reasoning **against the SDK types and this `tsconfig.json`** rather than accepting it: `exactOptionalPropertyTypes` is not set, so raw responses assign either way; and because the transform is `ts-jest`, removing the field would break the spec literals at **test-run** time, not merely under `tsc`. Both load-bearing claims true.

**⚠️ Leader-run measurement, closing the Reviewer's ADVISORY 1.** The Reviewer flagged that the `sendAdminReset` arm's discrimination was **inferred from structural symmetry, not measured** — the Implementer had mutated only `sendInvitation`. It noted a second mutation would remove the inference. The Leader ran it: wrapping `sendAdminReset`'s dispatch in a swallowing `try`/`catch` reddens **its own test and only that one** (`Tests: 1 failed, 14 passed`), with `sendInvitation`'s arm staying green. Reverted; 189/189.

Recorded because it is this spec's recurring lesson in miniature: a sound inference is not an observation, and the observation cost thirty seconds.

**ADVISORY (carried, not acted on):**
1. Closed by the Leader measurement above.
2. The spies patch `Logger.prototype`, so a future `Logger.log`/`error` from the transport carrying the fixture broker URL (which contains `@`) would redden these tests for a reason unrelated to NFR-1. Safe today — the transport uses `logger.warn`, unspied, and sanitizes. Same exposure the pre-existing `logs a failed outcome` test already carries.
3. **🔭 Carry into T-5's brief** (persists from attempt 1): `cognito-sub.util.ts` quotes `users.service.ts`'s *"does not echo `Username`"*, which the SDK contradicts — `AdminGetUserResponse.Username` is a **required** member. Inherited by citation, not introduced here. T-5 calls `AdminGetUser` and could act on the false belief.
4. `mail.service.ts`'s class docblock still says `reference="n/a"` applies only to the verification-code message; three kinds can now log it.

---

### T-3 — FINAL: `[x]` PASS

**Attempts:** 2 · **Date:** 2026-09-21

**Requirements covered:** FR-1 and FR-5 (the dispatch methods), **NFR-1** (the spec's privacy property), and design §5.2's corrected DD-3 including both typed traps.

**Final verification:** 16 suites / 189 tests · `eslint --quiet` clean · three mutations demonstrated to redden their named tests — the `Username` fallback (Implementer), the `sendInvitation` swallow (Implementer), and the `sendAdminReset` swallow (Leader).

**Why this task mattered most.** NFR-1 is the property a blind dual review caught the *design* getting backwards (J-4): the original DD-3 said log the Cognito `sub` as a non-PII id, when the `id` in scope **is** the email address. The falsifier's red output is the proof the guard works — `reference=admin-created-no-sub@example.org` appearing in a captured log line, tripping `not.toContain('@')`.

**Issues encountered.** One prose defect (a false justification for a type field — ninth of the spec's prose FAILs) and, newly, **one real coverage hole**: nothing would have caught a swallowing `catch` in the two new methods, which is T-1's first FAIL made real rather than merely instructed. Its exemplar sat 45 lines below the new tests in the same file, and the reason it was missed was the *"structurally covered"* framing `tasks.md` §2 names as insufficient.

**Leader decisions:** `tdd` assigned over the task's listed skills (recorded above); effort `xhigh` held at the T2 ceiling rather than escalating the tier, since the retry's fixes were precise rather than hard; the `sub` helper relocated to `users/` before spawning.

---

### T-4 — Dispatch the invitation from `UsersService.create()`

**Status:** in progress · **Attempts so far:** 1 (FAIL) · Date: 2026-09-21

**Leader decisions.** Skills `nestjs-expert`, `error-handling-patterns` **+ `tdd`** (override — the disqualifier is a test-design constraint). Effort `xhigh`.

**Declared deviation, adjudicated and CONFIRMED:** `users.module.ts` gained `imports: [MailModule]`, outside the assigned Files list. Necessary — Nest modules are encapsulated, so `MailService` cannot resolve without it and every route on the controller would 500. Minimal (`MailModule` already exports `MailService`; neither module's surface changed) and flagged by the Implementer rather than hidden.

> ⚠️ **Leader correction.** I told the Reviewer that `users.e2e.spec.ts` is what proves this wiring. **It is not** — that spec builds a testing module from `UsersController` plus a *mocked* `UsersService`, so it is blind to the DI gap. What actually proves it is the set of specs that bootstrap the real `AppModule` (`lambda-handler.e2e.spec.ts`, the admin e2e suites), where `UsersModule` is eagerly instantiated and a missing import fails bootstrap outright. The conclusion held; the stated reason was wrong — the tenth instance in this spec of a claim that sounds right and is not.

**Verification (Leader re-ran both):** `npx jest src/users` → 6 suites / 56 tests. `npm test -- --silent` → **82 suites / 1196 tests**. ⚠️ A **stale jest process, alive 1h50m** from an earlier run, was found and killed before these runs — it explains the long-standing *"Jest did not exit"* warnings and is exactly the contention the root `CLAUDE.md` concurrency protocol describes. *(A separate Leader misdiagnosis is recorded for honesty: I briefly concluded the suite was hanging, when in fact I had wrapped it in `timeout`, which does not exist on macOS — the command was failing instantly, not blocking.)*

**Four falsifiers run, reddened, reverted** — including one **self-initiated** (a stray `AdminSetUserPassword(Permanent:true)`, strengthening FR-1's `FORCE_CHANGE_PASSWORD` clause). The Reviewer found falsifier 1 discriminating in **both** directions: moving the dispatch earlier than `AdminCreateUser` also reddens a different test.

#### Attempt 1 — Reviewer `FAIL` (2 issues)

**What held.** Trap 1 clean — the Reviewer traced every path to the log line and found no route by which the address can become the reference; the `undefined` branch reaches `reference=n/a` through both `dispatch` and `UsersService`'s own line. Trap 2 clean — dispatch is genuinely last, with only the pure `toAdminUser` projection after it. The disqualifier is **satisfied on all four** assertions, unlike T-3's under-asserted clause. The `(B)` on FR-1 s2 is **genuinely structural**, and the Reviewer re-ran the grep rather than accepting it: `NEW_PASSWORD_REQUIRED|RespondToAuthChallenge|AdminInitiateAuth|ChallengeName` returns **zero** matches under `backend/src`; sign-in is handled entirely in `frontend/lib/auth/auth-client.ts`. Crucially it also checked that the property is not left unguarded — the only way T-4 *could* falsify it (permanentizing the credential) is covered by (A).

> **Issue 1 — a comment asserts a test guard that does not exist, plus two misstated facts.** The new spec docblock says *"`resetPassword`'s own tests above are UNCHANGED and deliberately still assert no `MailService` call happens from that method."* That describe block contains **no reference to `mailService` at all** — nothing would change colour if `resetPassword` dispatched today. *"UNCHANGED"* is true; *"deliberately still assert"* is false, and it is the **"structurally covered" framing `tasks.md` §2 names as insufficient — asserted this time as a fact rather than offered as a defence.** "above" is also wrong (the block is ~230 lines below).
> Same class in `users.service.ts`: *"The controller response shape … are T-6's scope, not built as of this task."* The controller returns `this.usersService.create(dto)` unmodified, typed `Promise<CreateUserResult>` — **`emailSent` is already on the wire.** T-6 adds the reset half, the frontend types and the TRD entry; it does not add the field to this response.
> **Violated Rule:** `tasks.md` §2 / KZ-013; the comment-truth standard that produced this spec's T-1 and T-3 FAILs.

> **Issue 2 — the premise sweep stopped at the two docstrings the brief named, leaving four now-false markers inside T-4's own files.** All in `users.service.spec.ts`: the file docblock (*"NO email"*), the FR-3 section banner (*"no-email admin-mediated handoff"*), a **test title** (*"...+ a temp password (NO email)..."*) whose own body 45 lines later asserts `sendInvitation` was called once, and an inline *"// No email is ever requested."* Each was true only of **Cognito's** mailer.
> **Violated Rule:** **KZ-004** as restated under T-9 (*"the sweep is over the premise, not the phrase"*) and in this task's own brief.

**ADVISORY (recorded):** the docstring overclaims that the dispatch is *"safe wherever it sits in this outer `try`"* — the J/A-6 hazard is the **group-add** throwing after a credential was emailed, which "never rethrows" does nothing to prevent; *"never rethrows"* is also absolute where the cited exemplar names its residual (a throwing `logger.error` would escape into `mapCognitoError`). *"Mirrors … exactly"* is a small overclaim (it returns `boolean`). A positional anchor says "two lines above" for something ~15 lines below (KZ-009).

**🔭 Leader dispatch decision on the two out-of-scope false sites.** This diff falsified two files outside T-4's Files list. The Implementer flagged `temp-password.util.ts` (correct) but not these:
1. **`backend/CLAUDE.md`** — T-9's own superseded-by note now reads falsely: *"`users.service.ts` today calls no `MailService` method."* It is a **constitutional baseline**, it is false as of this diff, and no remaining task owns it. **Folded into T-4's rework by Leader decision** — the task that falsified it fixes it. My forward pointer named this as site 4 but the brief passed it along as *"already annotated by T-9"* rather than *"your change will make it false"*; that framing error is mine.
2. **`users.controller.ts:61`** — *"`POST /api/v1/users` — create a user (FR-3). No email is sent."* **Assigned to T-6**, which owns that file and will edit it anyway.

#### Attempt 2 — Reviewer `FAIL` (1 issue) — ⚠️ **and the defect is the Leader's**

**What held.** All four Cognito-scoped rewrites verified TRUE at source, including the test title: `(Cognito's own mailer)` attaches to `"SUPPRESS"` and makes no no-email claim, so its body asserting `sendInvitation` was called once is **consistent, not contradictory** — the correct repair of attempt 1's `(NO email)`. `backend/CLAUDE.md` correct on both sentences and still an annotation under DD-7; the Reviewer verified the second sentence the Implementer found on its own initiative end-to-end, down to `invitation.template.ts` putting the credential in both the text part and the callout. The premise sweep verified by the Reviewer's **own** grep rather than accepted: nothing describing `create()` is left false. `CreateUserResult`'s restatement confirmed at source — no narrowing DTO, no global `ClassSerializerInterceptor`, so `emailSent` genuinely is on the wire today.

> **Issue — the new assertion is documented as a tripwire over T-5, and it cannot fire on T-5.** Both docblocks say it *"must go red the day T-5 adds that call"*. But **T-5 dispatches `MailService.sendAdminReset`**, not `sendInvitation` — the method T-3 authored *for this exact caller*. The `beforeEach` mock declares only `sendInvitation`, so T-5's `await this.mailService.sendAdminReset(...)` throws a `TypeError` **inside the T-4-shaped swallowing `try`/`catch` that T-5 inherits by its own Scope**, gets logged, `resetPassword` resolves normally, and the assertion stays **green**.
> The line therefore pins a **permanently-true** property (`resetPassword` never sends an *invitation*) while instructing a future implementer that it is a temporary guard to be replaced — *"the precise 'tripwire a future implementer would silently delete' the brief names as worse than none."*
> The supporting mutation varied `sendInvitation` — **the wrong variable**. It proves the assertion is live; it does not corroborate what the docblock claims it guards.
> **Violated Rule:** `tasks.md` §2 / **KZ-002** (*"a gate that cannot fail is not a gate"*); the comment-truth standard.

> ⚠️ **This is a Leader defect, the third in this spec.** The assertion was **my recommendation**, and I named it "T-5's tripwire" without checking which method T-5 dispatches. The Implementer followed the recommendation faithfully and inherited the error — exactly as it faithfully reproduced my wrong Disqualifier text in T-1. Verified myself before recording: `mail.service.ts` has both `sendInvitation` (:98) and `sendAdminReset` (:117), and the mock at `users.service.spec.ts:91` declares only the former.
> **Pattern worth naming:** attempt 1's defect was *"a docblock asserts a guard that does not exist."* Attempt 2 made the guard exist and attached a **new false claim about what it guards** — the same defect one level deeper. That is the shape KZ-008 records seven times: the correction introducing the next instance.

**ADVISORY (recorded):**
1. `users.service.ts` cites *"(TRD/OpenAPI)"* — there is **no OpenAPI or Swagger artifact anywhere in this repository**, and T-6's Files list names only `docs/trd/trd.md`. A future agent will hunt for a document that does not exist.
2. `backend/CLAUDE.md` and `users.service.ts` both say `resetPassword()` *"still only `SUPPRESS`es Cognito mail"*. It issues **no** suppression directive — `AdminSetUserPassword` has no `MessageAction` and sends nothing. Restates the section's pre-existing shorthand, so it misleads nobody about behaviour, but attributes a mechanism the method does not use.
3. **🔭 Leader dispatch needed — `temp-password.util.ts`.** It still carries the withdrawn premise, and its docstring's instruction that callers return the credential *"ONLY in the Admin-guarded HTTP response body"* is now **exceeded by `create()`**. Correctly outside T-4's Files list and correctly declared by the Implementer — but **no remaining task owns that file** (T-9 closed; T-5 and T-6 do not touch it), so absent assignment it survives the spec. Same shape as the `backend/CLAUDE.md` site. **Folded into attempt 3** by Leader decision, on the same principle: the task that falsified it fixes it.
4. Attempt 1's three advisories persist and were not in the rework brief (re-recorded, not new): *"safe wherever it sits in this outer `try`"*, *"Mirrors … exactly"* (it returns `boolean`), and a *"two lines above"* anchor pointing ~20 lines below (**KZ-009**).

#### Attempt 3 — Reviewer `PASS` ✅

**Fixes:** the tripwire widened to `sendAdminReset` (the method T-5 actually dispatches) with the mock declaring both; the correct falsifier run; both docblocks rewritten; `temp-password.util.ts` corrected (Leader scope extension); five advisories fixed. The Implementer additionally found, fixed and **declared** a second occurrence of the "SUPPRESS" misattribution in `backend/CLAUDE.md` that nobody had flagged.

**Verification (Leader):** `npx jest src/users --silent` → 6 suites / 56 tests. Mock and `temp-password.util.ts` corrections confirmed by grep.

**Reviewer verdict: `STATUS: PASS`,** with two pieces of analysis worth keeping:
- **Why the widened tripwire genuinely fires:** a `jest.fn()` records the invocation in `mock.calls` **before** the call returns and independently of what any downstream `catch` does — so the swallow *cannot* hide it. The previously-dead path is closed: with the property `undefined`, the call threw `TypeError` **before any recording**, the helper's `catch` ate it, and the only assertion pinned a permanently-true property.
- **A second escape route checked, unprompted:** if T-5 resolves `sub` via `AdminGetUser` first, that command is unstubbed here and resolves empty, so T-5's attribute read throws into `resetPassword`'s `catch` → `mapCognitoError` (typed `: never`) → the call **rejects**. Red either way.

It verified every advisory correction at source rather than accepting it: **no OpenAPI/Swagger artifact exists anywhere** in the repo (grep returns only the correction itself and this log); `AdminSetUserPasswordRequest` has exactly four members and **no `MessageAction`**; `dispatchReceiptEmail` is `Promise<void>`, awaited, swallow-and-log — so *"same shape, returns `boolean` where the exemplar returns `void`"* is exact. No regressions from attempts 1–2.

**ADVISORY (recorded):**
1. **🔭 Carry into T-5's brief — this one can cause an FR-4 violation.** `users.service.spec.ts`'s mock comment attributes the swallow to the wrong frame: it says T-5's call *"would throw a `TypeError` inside `resetPassword`'s own swallowing `catch`"*. **`resetPassword`'s only `catch` calls `mapCognitoError`, typed `: never` — it always throws, never swallows.** The swallowing `catch` belongs to the T-4-shaped dispatch helper that T-5 inherits. The Reviewer did not gate on it, but named the consequence precisely: *"a T-5 implementer who believes `resetPassword`'s `catch` swallows could inline the dispatch there, where a mail rejection becomes a **500** — precisely FR-4's `BUT it must NOT return a 5xx`."*
2. **⚠️ Out of this spec's scope entirely — needs a separate ticket, NOT folded into a task.** `admin-registrations.service.ts` describes `RegistrationsService.dispatchReceiptEmail` as *"still-fire-and-forget"*. That went false on 2026-09-17 when `registrations.service.ts` began awaiting it (the D-I fix). T-4's new docblock cites the same method as the **awaited** exemplar, so **the repository now holds two contradicting descriptions of one method**. No task in this spec owns that file, and an advisory may not mint a task — recorded here and raised to the user.
3. `users.controller.ts:61` (*"No email is sent"*) — false as of this diff, already assigned to **T-6**. Line 109's identical claim for `:id/password` stays true until T-5.
4. `temp-password.util.ts` keeps the withdrawn rationale ahead of its correction (DD-7's annotate-don't-rewrite pattern, so not a defect); a one-line "see the correction below" pointer at the top would remove the ordering hazard.

---

### T-4 — FINAL: `[x]` PASS

**Attempts:** 3 · **Date:** 2026-09-21

**Requirements covered:** FR-1 (scenario 1's `AND IT MUST`), FR-3 (both scenarios), **FR-4 (all four clauses, asserted together in one test)**, NFR-1, NFR-2 at unit level. FR-1 scenario 2 recorded as a **(B)** with a structural reason the Reviewer re-verified by its own grep: no backend route participates in Cognito's sign-in challenge flow at all.

**Final verification:** 6 suites / 56 tests · full backend suite 82 suites / 1196 tests · eslint clean · build clean. **Five mutations demonstrated to redden their named tests** — dispatch moved between the Cognito calls, `try`/`catch` removed, reference falling back to `dto.email`, a stray `AdminSetUserPassword(Permanent:true)` (self-initiated), and `sendAdminReset` inserted into `resetPassword`.

**Deviation confirmed:** `users.module.ts` gained `imports: [MailModule]` — necessary (Nest modules are encapsulated), minimal, flagged not hidden, and proven by the e2e suites that bootstrap the real `AppModule`.

**⚠️ Two of this task's four defects were the Leader's.** Recorded rather than diluted:
- The brief passed `backend/CLAUDE.md` along as *"already annotated by T-9"* instead of *"your change will falsify it"*.
- **The tripwire was my recommendation**, and I named it "T-5's tripwire" without checking which method T-5 dispatches. The Implementer followed it faithfully and inherited the error — the same shape as T-1, where it faithfully reproduced my wrong Disqualifier text.

**The pattern, now with enough data to state plainly:** across five tasks this spec has produced **eleven FAILs, ten of them prose and one a coverage hole**. Zero were logic defects. Three of the eleven originated in Leader-authored text. The cause is structural, not incidental: this spec's deliverable is largely *normative text about a system that changes underneath it*, and the only gate that reads text is a Reviewer who chooses to look. `tasks.md` §2's rules and the brief-level future-tense rule both measurably reduce it — T-2 passed first time under them — but they do not eliminate it.
