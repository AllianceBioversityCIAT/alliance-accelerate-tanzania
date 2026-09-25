# Validation Report — Forgot-password delivery via a Cognito custom sender

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/auth/forgot-password-delivery` |
| Date | 2026-09-25 |
| Branch | `feat/forgot-password-delivery` (28+ commits ahead of `main`) |
| Tasks | 7/7 `[x]` |
| Deployed | **Yes** — `accelerate-tz-dev`, trigger live, verified by a real password reset |
| Method | Three **dimension-scoped validators in parallel**, each instructed not to defer to the Leader's framing (root `CLAUDE.md` § Validation dispatch, KZ-012's countermeasure) |
| Validators | coverage closure · decision consistency · claims-vs-code |
| **Verdict** | ⛔ **NOT ARCHIVE-READY** — **4 blocking** (three prose, **one live behavioural** — B-4), ~11 documentation FAILs, ~12 WARN |

---

## 2. Summary — read this first

**The implementation is sound and is verified in production. The documentation is not reliable.**

That split is the whole finding. Of 31 requirement clauses enumerated independently, **18 are genuinely and verifiably closed**, several with unusually strong evidence: NFR-1 confirmed in a real CloudWatch record rather than only in tests, the before/after pool diff reconciling exactly as claimed under independent recount, and T-7 closing D-3/D-4/D-6 the only way they can be closed — a human receiving a real email.

**Every blocking finding is in prose**: a closure claim that does not close, a requirement the design declares impossible but nobody amended, a red gate archived as inherited. Not one is a defect in shipped behaviour.

> ⚠️ **This is the third time this pattern has been measured on this spec, and the validators were mandated because of it.** Seven per-task Reviewer PASSes did not catch any of the three blocking findings, because each Reviewer audited one diff against one task — the correct scope, and the reason a cross-task claim is invisible to them.

---

## 3. Blocking — must resolve before archive

### B-1 · A red gate this spec introduced is recorded as pre-existing — **all three validators**

`execution.md` states the failing case `guard-account.no-account-id-literal-in-infra` is *"pre-existing … (T-3's account-id Default), confirmed unchanged by `git stash`"*. **The sentence refutes itself — T-3 is a task in this spec** — and the Leader confirmed it by checking out `main`, where the case **passes**.

The method could not have established the claim: `git stash` shelves only the *working tree*, and T-3's literal had been committed three tasks earlier, so the probe answered *"not from T-6's uncommitted diff"* and was read as *"not from this branch"*. **An Implementer asserted it, a Reviewer corroborated it by reading, and it entered the permanent record.**

Two literals, both this spec's:

| File | Literal | Task |
|---|---|---|
| `infra/10-data-auth/template.yaml:115` | `569113802249` — the **real AWS account id** | T-3 |
| `…/custom-email-sender/index.spec.mjs:92` | `000000000000` — a UUID tail, one digit off the allow-listed `000000000001` | T-4 |

⚠️ **Severity is not cosmetic.** The guard's own header binds it to another shipped spec: *"`requirements.md` FR-3′ requires that no account id be versioned under `infra/`."* This spec ships a violation of a shipped constraint — the exact *"(c) deliberately removed by an earlier spec"* class that T-5's entire 24-key audit existed to avoid reversing. **T-5 walked that same file and never saw the account id 600 lines above.**

**Sharpest detail:** the parameter's `Description` argues for five lines *against* hardcoding — *"a template that hardcodes today's developer user ARN would silently stop granting the right principal"* — directly above a `Default` that hardcodes exactly that. Its two sibling parameters, created under the same rationale, both got `Default: ""` (fail-closed), a choice `execution.md` records as *"ruled correct"*. No reason is recorded for the opposite treatment here.

**Close it by:** `Default: ""` + an `AllowedPattern` (mirroring what T-6 already did to the pool-id parameter) — T-6's own deploy proved the override wins, so the literal is dead weight that can only ever name the wrong principal; allow-list or renumber the fixture; **correct the `execution.md` line before it is archived as precedent.**

### B-2 · NFR-6 is closed on a premise the spec itself refutes four lines away

`tasks.md` books NFR-6 as *"(B) Not applicable … The function publishes and returns; **no user-visible wait is introduced**."*

`design.md` §10, same author, refutes it: **Cognito's non-configurable ceiling on the trigger invocation — OPEN**; **Cognito retries a timed-out invocation — OPEN**; and DD-3a's connect-per-invocation *"makes the cold path **longer on purpose**."* A ceiling and a retry exist *only because* the user's `ForgotPassword` call blocks on this function. Dropping the awaited microservice reply removed the largest consumer of that wait; it did not remove the function from the request path.

**T-7 measured the wait: 2.55 s of cold-path latency that did not exist before this spec.**

Two consequences:
- NFR-6's operative clause — *"the budget belongs in one place only, per `mail/mail-timing.ts`'s existing discipline"* — is **unmet**. That referent is real: the sibling mail path budgets itself at `MAIL_SEND_TIMEOUT_MS = 3000`. This function has no constant and `design.md` records no number.
- ⚠️ **The Leader's own error:** `execution.md`'s *"2.55 s against a 15 s timeout — 17 % of budget"* divides by the function's `Timeout: 15` — which `design.md` states **in bold** is *"irrelevant to this"*. The single latency figure in the spec uses the denominator the design disqualified.

**Close it by:** deleting the `(B)`; recording the budget in `design.md` beside DD-3a with T-7's 2.55 s as the datum, stated against Cognito's trigger ceiling rather than `Timeout: 15`; and saying plainly that DD-3a buys freeze-safety at ~0.6 s init plus a handshake inside the user's request.

### B-4 · The trigger raises on the source the admin email-edit path actually emits — **live defect, found after this report's first draft**

⚠️ **Added 2026-09-25, after W-1's probe was run.** This is the **only behavioural defect** the validation found; B-1…B-3 are all prose. It is recorded here as blocking because it is a measured regression in a shipped feature, live in DEV at the time of writing.

`design.md` §5 handled `CustomEmailSender_VerifyUserAttribute` and asserted — **labelled *"Verified, not assumed"*** — that an admin editing a user's address emits it, citing round-1 **C-6**, which established that raising there *"would break that shipped admin feature."*

**Measured (W-1's probe: throwaway user with `MessageAction: SUPPRESS`, `admin-update-user-attributes`, CloudWatch, user deleted):**

```
ERROR custom-email-sender: failed triggerSource=CustomEmailSender_UpdateUserAttribute
      unhandled triggerSource "CustomEmailSender_UpdateUserAttribute"
```
and afterwards: `email` changed, **`email_verified: false`**.

That path emits **`UpdateUserAttribute`**, a source in neither the handled set nor §5's "everything else" list. **The reachability analysis was right; the source name was wrong** — so the feature C-6 protected broke by exactly the mechanism C-6 predicted.

| Live consequence | |
|---|---|
| The address changes | ✅ |
| `email_verified` → **`false`** | ⚠️ |
| **No verification mail** — before the trigger, Cognito sent it | ⛔ |
| CloudWatch error on every admin email edit | ⛔ |

⚠️ **And it breaks this spec's own deliverable.** `AccountRecoverySetting` is `verified_email` (priority 1), so a user left unverified **cannot use `/forgot-password`** — the feature this spec exists to ship. Raising on this source would disable password reset for anyone whose address an admin edits.

**How the wrong name got in** — the transferable part. `proposal.md` §2.3's table is headed *"Measured on the live pool"*, and its measured columns genuinely were. But **`describe-user-pool` cannot tell you which trigger source fires** — the `triggerSource` name in the consequence column was an inference under a measured heading. C-6 inherited it explicitly, and §10's disposition then verified the **mechanism** and reported that as verifying the **sentence**. Three checks, each correct about the half it examined, and the half that mattered went unread. *(Structurally identical to the §6 defect found during T-5: a measured heading spanning measured and inferred content.)*

**Fixed** (pending redeploy): `UpdateUserAttribute` handled, mapped to the existing verification builder — justified by the DD-5a test applied at source, `users.service.ts::update()` dispatching no mail of its own, so Cognito's is the only one. `VerifyUserAttribute` kept handled (AWS's other, currently unreachable source). §5, `proposal.md` §2.3 and `judgment.md` corrected; the judges' C-6 row left verbatim with an addendum below it.

⚠️ **The redeploy's probe must observe the right thing.** `UpdateUserAttribute` is now the **first live path depending on `PUBLIC_APP_BASE_URL` being well-formed in production** — a value that reached production through the hand-composed deploy of **D-10**, and that resolves to `'*'` on a bootstrap. A `getPublicAppBaseUrl()` throw produces a *different* error line, not success — so **"the error is gone" is not sufficient**. Confirm `dispatched triggerSource=CustomEmailSender_UpdateUserAttribute` **and** that `email_verified` flips / the mail arrives, or one silent failure has merely replaced another.

---

### B-3 · FR-5's `AND IT MUST be reversible` is a live, unstruck MUST the design declares impossible

Three documents, three positions on one clause:

| Document | Position |
|---|---|
| `requirements.md` FR-5 | *"**AND IT MUST** be reversible"* — unstruck, unannotated; §9 index still says *"reversible"* |
| `design.md` DD-4 | *"there is **no rollback** that restores current behaviour"* |
| `tasks.md` §5 | *"⚠️ **(B) NOT SATISFIABLE**"* |

⚠️ **`judgment.md` R2-6 raised exactly this in round 2 and it appears in no disposition table.** `design.md` §10 disposes of the fourteen round-**1** findings only.

The spec had the right convention and did not apply it here: FR-6 was *"struck rather than deleted so `judgment.md`'s references still resolve."* FR-5 got nothing.

**Also over-declared.** The clause has two halves. Post-deploy, removing the trigger loses **no data**, and the `EmailConfiguration` flip is `email-notification-microservice` Phase B's decision landing — it happens with or without this spec. So *"without data loss"* is **met**; only *"restore the prior behaviour"* is not. `tasks.md` marks both unmet and attributes the loss to this spec.

**Close it by:** splitting the clause in §5; amending `requirements.md` FR-5 with the DD-4 pointer (or recording the waiver in it); fixing the §9 index row; adding R2-6 to a disposition table.

---

## 4. Documentation FAILs — false statements in documents about to be frozen

| # | Claim | Reality |
|---|---|---|
| D-1 | `design.md` DD-3: *"the **twenty-two** (a) rows remain reasoned"* | §6 has **22 rows total**; **15** keys are `(a)`. ⚠️ **The same defect this document congratulates itself for catching** — the parallel sentence in §6 was corrected, this one inverted it |
| D-2 | `design.md` §11 + `tasks.md` T-7 quote `trd.md:288` as *"self-service password-reset mail (COGNITO_DEFAULT)"* | That text is **not in the file**. Either T-7 edited the diagram and `execution.md` never says so, or the quote was never accurate and propagated through three documents |
| D-3 | `design.md` §11: *"It is **task 6**"* | The TRD correction is **T-7**. `design.md` §9's enumeration — written *"so the count is reachable"* — disagrees with `tasks.md` in **6 of 7 positions**; totals coincide only because a split and a merge cancel |
| D-4 | `execution.md`: *"**Every** (a)-class row also survived untouched — [13 keys]"* | Covers **12 of 15** `(a)` keys and includes **2 non-`(a)`** rows |
| D-5 | `requirements.md` **NFR-2** cites ATP-71's `lambda.ts` harness: *"Under **Option B** this flow runs in that same handler"* | Option B was abandoned. This is a standalone `.mjs` Lambda; that harness does not apply |
| D-6 | `requirements.md` **NFR-5**: *"closing off Cognito's own ForgotPassword (**FR-6**) is now the **only reason** this spec touches `10-data-auth`"* | **FR-6 is struck.** Both halves false. This is the live dependency on a struck requirement |
| D-7 | `requirements.md` **NFR-6**: *"since **FR-4 makes the request wait on the real send**"* | FR-4 was rewritten 45 lines above, in the same document, to remove exactly that |
| D-8 | `proposal.md` §15: *"Confirm the revised §12 recommendation (**Option B**), then re-run `/akili-specify`"* | Route reversed to Path 1. §12 carries a reversal banner; **§15 does not** — and §15 is the section later documents quoted D-5/D-6 from |
| D-9 | `proposal.md` §13.1 **Q-3**, a recorded *user ruling* | Silently reversed by §12.1 + FR-4's rewrite. The section whose purpose is recording user decisions carries one a later decision overturned |
| D-10 | `execution.md`: *"the parameter wiring **proved itself** on first contact"* | ⚠️ **Leader's own.** The deploy was a **targeted `sam deploy` that bypassed `deploy.sh`** — where that wiring lives. What resolved the parameter was the Leader's runbook duplicating the logic. **T-6's actual deliverable has never been exercised against AWS** |
| D-11 | `design.md`/`execution.md`: *"the backend's **786-line** transport"* | **785** lines. Trivial, but stated as a measurement and load-bearing for DD-3a |

### D-12 · The budget was breached on three axes and no document records it

| Axis | Budget | Actual | Recorded? |
|---|---|---|---|
| Tasks | 7 | 7 | ✅ |
| Review rounds | 2/task, **escalate at 3** | T-4 = 3 · T-5 = 3 + Leader fix · T-6 = 3 **× two parallel Reviewers** | **1 of 3** — T-5 only |
| **LOC** | **~400** | **≈1,644 in the function package alone**, before template, `deploy.sh`, the new test case and the TRD | **Nowhere** |

⚠️ KZ-005's recorded harm, verbatim: *"an unmeasured breach disarms the budget tripwire retroactively."* Two earlier designs of this spec were killed for budget unreachability; the third fixed the enumeration and then nobody measured the outturn.

### D-13 · `tasks.md` §5 — the coverage table is not accurate

Of 23 rows: one rests on a false premise (NFR-6), one contradicts the design amendment that superseded it (NFR-4 is booked to T-3, but DD-2a states *"T-3 therefore cannot close NFR-4"*), one over-declares a partially-met clause (FR-5), one implies a live verification that could not have occurred (FR-3's negative clause). It **omits** a row for FR-1's decrypted-code clause — the one clause whose gate did not exist until T-4's third attempt.

⚠️ KZ-001: *"Closure cannot be self-certified."* §5 is a self-certifying table, and it was read as evidence for seven tasks.

---

## 5. WARN

| # | Finding | Cost to close |
|---|---|---|
| **W-1** | ⚠️ **`CustomEmailSender_VerifyUserAttribute` is live and has never been exercised.** The trigger is all-or-nothing; T-7 tested only `ForgotPassword`. The verification path is the *more fragile* one — the only builder calling `getPublicAppBaseUrl()`, which throws on `*`. Its value reached production through a **hand-composed** deploy, not `deploy.sh`'s tested wiring | **Minutes.** One admin email-edit against DEV + a CloudWatch check |
| W-2 | FR-3's `BUT it must NOT` (a request alone cannot invalidate the password) is closed **by construction**, not by T-7 — the user changed her password, so nothing discriminates it | One request, then sign in with the **old** password |
| W-3 | Four of seven questions routed to T-7 are unanswered. Three are implicitly settled; the ledger closes them by **silence** — the distinction T-7's own Disqualifier exists to protect | One paragraph |
| W-4 | Two clause gates are keyword blocklists (`/\b(arrived\|delivered\|received)\b/`, `/new password is\|temporary password/`). *"Your code is in your inbox"* passes both | Strengthen or declare |
| W-5 | NFR-2 has **no test that would change colour if it were false** — deleting an `await` leaves the suite green. Verified true by reading | Declare or add a gate |
| W-6 | FR-4's *"no copy **anywhere**"* is scoped in §5 to two message bodies. The frontend copy is compliant — *by luck*, it says "sent" | Widen the scope note |
| W-7 | **Both `requirements.md` and `design.md` still read `Status: Draft — awaiting approval`** on a spec that is live in DEV | One line each |
| W-8 | DD-4's *"worse than **today's** SES"* names a state that no longer exists, in 2 of 3 places | Re-tense |
| ~~W-9~~ | ⚠️ **FALSIFIED by W-1's probe and promoted to B-4.** This row read *"`UpdateUserAttribute` unnamed … **not live today**"*. It is live, it fires on every admin email edit, and it was breaking a shipped feature. **A WARN superseded by the very probe the adjacent W-1 recommended** — kept, struck, as the record of how close this came to being filed as cosmetic. | — |
| W-10 | Copy defect, `messages.mjs`: *"you can ignore this message. **y**our password will not change"* — lowercase after a period, a consequence of the em-dash→period edit | Two characters |
| W-11 | `docs/specs/bugfix/otp-cross-caller-lockout/proposal.md` is on this branch and belongs to a **different spec** | Remove or split before archive |
| W-12 | The *"297 non-whitespace characters (measured)"* IAM policy is **committed nowhere** — unauditable by construction | Commit it (scoped, no secrets) or drop the figure |
| W-13 | `execution.md`'s *"ten findings, nine in prose"* cannot be reconciled from the record it appears in (the attempt table accounts for 6) | Recount or drop |

---

## 6. Build Integrity

| Gate | Result |
|---|---|
| `./infra/scripts/validate.sh` | ✅ PASS ×3 stacks |
| `custom-email-sender` `npm test` | ✅ **59/59** (was 56/56; B-4's fix added three, including a handled-set guard) |
| `infra/scripts/tests/run-tests.sh` | ⛔ **50/51** — see **B-1** |
| `backend/` · `frontend/` | Not run — **this branch touches neither** (verified against `main`) |
| `test-report.md` | ❌ **Does not exist.** `/akili-test` was never run. Every test here was written by the agent that wrote the code it tests (KZ-012) |

---

## 7. What is genuinely strong — recorded so remediation does not overshadow it

- **T-7 is real evidence.** A human received a real email, used the code, signed in. It closed D-3, D-4 and D-6 — three defect classes with *no automated gate* — and D-4 is the class that shipped ATP-71's missing grant live and invisible for months.
- **NFR-1 is confirmed in production**, not merely asserted: the CloudWatch record is one line carrying only `triggerSource`.
- **The pool diff reconciles exactly**, recounted independently: 24 keys, 4 changed, 20 untouched, `Arn` and `CreationDate` byte-identical — direct evidence the pool was **modified, not replaced**.
- **Eight decisions were checked for mutual consistency and found clean**, including DD-5a ↔ code ↔ design table (exact agreement), DD-2b ↔ DD-5b ↔ the `DependsOn` fix (they compose rather than fight), and T-5's `(a)`-claim being correctly walked back and then correctly re-established on narrower ground — *"the cleanest piece of cross-time reasoning in the spec."*
- **Two blocking defects were caught before production by reading**, not by tooling: the missing `DependsOn` (a non-deterministic rollback of a stack holding RDS) and the unscoped invoke permission.

---

## 8. Remediation

**Blocking (4):** **B-4** (the only behavioural one — fix written, redeploy pending) · B-1 · B-2 · B-3.
**Cheapest high-value (1):** W-1 — minutes, and it is the only live path with zero live evidence.
**Documentation truth (13):** D-1…D-13 — all text-only.
**WARN (12):** W-2…W-13.

Suggested order: **B-1** (a red gate and a violated shipped constraint) → **W-1** (cheap, closes a live blind spot) → **B-3** and **B-2** (requirement amendments) → **D-*** as one sweep → **W-11** (unbundle the foreign spec).

⚠️ Apply **correction closure** to every fix: grep the superseded value forward across the spec folder, and grep references *to* each corrected section backward. This spec has four recorded instances of a correction landing at its cited site and not at its siblings.

---

## 9. Archive Readiness

⛔ **Not ready.**

Four blocking findings. **B-4** is a measured live regression in a shipped feature and is the one the per-task Reviewers could never have seen — it needed a real AWS call. Of the rest, **B-1** ships a violation of another spec's shipped requirement with a red gate and a false record of why. The documentation set is about to be **frozen as the permanent account of this work**, and it currently contains a requirement the design calls impossible, a closure resting on a premise the design refutes, three requirements reasoning from an abandoned route, and a quoted line that is not in the file it cites.

**The code is ready. The record is not** — and archive freezes the record.
