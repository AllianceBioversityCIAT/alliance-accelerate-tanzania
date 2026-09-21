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
