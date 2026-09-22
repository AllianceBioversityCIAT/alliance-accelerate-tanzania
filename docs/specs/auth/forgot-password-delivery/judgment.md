# Judgment Day — `design.md`

| Field | Value |
|---|---|
| Target | `docs/specs/auth/forgot-password-delivery/design.md` (immutable at judgment time) |
| Mode | Blind dual review, two judges in parallel, neither seeing the other |
| Round | 1 |
| Date | 2026-09-22 |
| Judges | Two independent `opus` contexts, adversarially framed, both told the author is a suspect source |
| ⚠️ Deviation | The skill prefers judges on a model **different** from the author. Both judges and the author ran on `opus` — the registry's T3 Auditor and T1 Architect both map there, and dropping a judge to a lower tier would have weakened the read more than the shared model weakens independence. Independence here is structural (separate contexts, adversarial brief, no sight of each other), not model-diverse. **Recorded as a known weakening.** |

## Verdict

**JUDGMENT: ESCALATED ⚠️**

Not because the judges contradict each other — they agree, closely and independently. Escalated because **the confirmed findings are not patchable**: the design's load-bearing decision is not implementable as written, and several severe findings are consequences of the chosen route rather than of how it was described.

---

## Confirmed by BOTH judges (fix-eligible under the skill's rule)

| # | Finding | Judge A | Judge B |
|---|---|---|---|
| **C-1** | **DD-3 and DD-2 are mutually exclusive.** The awaited RPC reply requires an `id` + `reply_to` on the envelope; `buildMicroserviceEnvelope` — the artifact DD-2 mandates reusing — emits no `id` **by contract**, and its docblock plus `enhancement/email-notification-microservice` FR-2 both record that omission as deliberate. FR-4 and NFR-2 both rest on DD-3. | F1 SEVERE | F2 SEVERE |
| **C-2** | **"The frontend reset flow has no branch on user-not-found" is FALSE.** `frontend/lib/auth/auth-client.ts:251` is exactly that branch, under a comment reading *"Do not reveal non-existence on the request path (NFR-4)"*. Asserted twice, both times marked *verified*. DD-4's safety argument and §9's "no component changes" both rest on it. | F2 SEVERE | F1 SEVERE |
| **C-3** | **DD-4 does not deliver FR-4.** With `PreventUserExistenceErrors: ENABLED`, an unknown address gets a **simulated success**; a real address whose send fails gets an **error**. Opposite outcomes — different copy, different step, different ARIA region. And DD-3 opens a **multi-second timing oracle** (KMS + AMQP + a per-message CLARISA HTTP call + SMTP) that the repo's own `mail-timing.ts` response-floor machinery exists to close and **cannot** close here, because Cognito owns the response. | F3 SEVERE | F4 SEVERE |
| **C-4** | **The failure signal DD-3 depends on does not exist in the described form.** `mailer.service.ts:84-95` **catches** every SMTP failure and *resolves* with `{description:'Error sending email', status:500}`. Over RMQ that is an ordinary successful reply. Only invalid-recipient and auth rejection actually throw. An implementer awaiting the reply and treating non-rejection as success ships D-6 verbatim — the defect DD-3 exists to prevent. | W2 | F3 SEVERE |
| **C-5** | **FR-5's central clause has no mechanism, and the rollback does not restore prior behaviour.** CloudFormation composes `UpdateUserPool` from the *template*, not the live pool, so every live setting absent from `10-data-auth/template.yaml` resets. The design identifies one divergence (`EmailConfiguration`) and treats it as the side effect. Rollback lands on `COGNITO_DEFAULT`, **worse** than the pre-spec state. `proposal.md` R-1's throwaway-pool rehearsal is dropped without comment. | F8 SEVERE + W4 | F5 SEVERE |
| **C-6** | **FR-2's raise breaks a shipped admin path.** `users.service.ts::update()` issues `AdminUpdateUserAttributes` against an auto-verified pool, which can emit `CustomEmailSender_VerifyUserAttribute` — the live edge `proposal.md` §2.3 already named. Under DD-6 that raises and the admin's email edit **fails**. The design never enumerates the handled `triggerSource` set. | F5 SEVERE | F7 |
| **C-7** | **Cognito's trigger ceiling and retry are unmentioned, and NFR-6's latency budget is recorded nowhere.** The awaited round trip must fit inside a non-configurable Cognito response timeout, on top of an existing publish-only budget of 3.2 s. On timeout Cognito **retries** — so the failure mode is *duplicate codes plus an error message*, not the clean failure DD-3's table claims. NFR-6 requires the budget in `design.md`; DD-7 points at a file in a **different deployable**. | F6 SEVERE | F8 + F9 |
| **C-8** | **DD-1's chosen stack cannot reach the configuration the function needs.** The broker URL, API key, queue name, sender identity and `PUBLIC_APP_BASE_URL` all live in `20-backend`, which deploys **after** `10-data-auth` and therefore cannot be imported from it. §8's table has no row for any of them. DD-1's own mitigation — *"put anything likely to change where it can be changed without a `10-data-auth` deploy"* — becomes unreachable the moment the function lives there. | F4 SEVERE | F12 |
| **C-9** | **NFR-4's closed grant set grants nobody the right to encrypt.** `lambda:InvokeFunction` is a Lambda resource policy, not a KMS grant — so §8's *"three grants and no more"* leaves Cognito unable to encrypt the code the whole mechanism depends on. Lands squarely in D-4, the defect class `requirements.md` §8 records as having **no automated gate** and a live precedent. | F7 SEVERE | F20 |
| **C-10** | **FR-1's "rather than publish" has no mechanism.** The design detects a bad recipient *at the microservice, after publishing* — which is the D-6 shape with a better error report attached, not the pre-publish guard the scenario demands. | W3 | F11 |
| **C-11** | **`10-data-auth` cannot host a Lambda today.** No `Transform: AWS::Serverless-2016-10-31`, no build step — `deploy.sh` deploys it from source with no `sam build`, in deliberate contrast to the backend. Adding a function with native dependencies is a toolchain change absent from the budget. | W5 | F16 |
| **C-12** | **Budget is unreachable from the design's own text.** Both judges enumerated 11+ deliverables against the stated 7 tasks. Judge A additionally found the parent spec budgets this same phase at **4 tasks / ~230 LOC**, and that §11's "same tripwire" comparison is against a different unit (ATP-71's 2 *per phase* vs this design's 2 *per task*). | S1 | F15 + F17 |
| **C-13** | **NFR-5's literal text is absent.** It requires documentation to state that `DEPLOY_INFRA` **defaults to `false`**. The design says "`DEPLOY_INFRA`-gated" and "`DEPLOY_INFRA=true` build" — what to run, not what NFR-5 requires stated. D-8's only control is that sentence. | W6 | F21 |
| **C-14** | **DD-1's rejection of Options B and C is thinner than the table implies.** The cycle itself is real and verified. But the dismissal of a parameter-passed ARN is unsound: `20-backend` already takes `DataAuthStackName` as exactly such a hand-maintained string, and `deploy.sh` already resolves cross-stack values from stack outputs. The conclusion may still be right; the argument is not the reason. | F4 (part) | F18 |

## Reported by ONE judge — recorded as suspect, NOT auto-fixed

| # | Finding | Judge |
|---|---|---|
| S-1 | `PreventUserExistenceErrors` is a property of **`UpdateUserPoolClient`**, not `UpdateUserPool` — so §7's stated reason for its in-scope-ness ("this spec is already performing the *one* dangerous pool update") is wrong, and there are **two** dangerous full-parameter updates, not one. The app client holds `ExplicitAuthFlows`; resetting those breaks sign-in for everyone. | B (F6) |
| S-2 | §6's Cognito error-propagation claim is presented as verified, but its two evidence rows are both about the **microservice** — neither is the Cognito fact the section turns on. Uncited, against a proposal that set the citation standard. | A (W1) |
| S-3 | The **email body itself has no owner**. Once the trigger is active, `VerificationMessageTemplate`'s 34 lines of branded HTML go inert and the function must author subject and body. No budget line, no reference to the `*.template.ts` convention. FR-1's link clause and FR-3's code shape are properties *of that body*. | A (W7) |
| S-4 | NFR-1's "never in any error payload" has no mechanism. The backend's version is an enforced sanitized-error hierarchy built because *"amqplib errors routinely carry the full connection string"*, gated by QA-13 with a leaking mutation probe. DD-3 introduces a **new** throw path and mandates no equivalent. | B (F13) |
| S-5 | `proposal.md` §14.4's success criterion — correct `trd.md` §12.1's account of the pool's mailer — appears in **neither** `requirements.md` nor `design.md`. The false text is live at `trd.md:288`. | B (F14) |
| S-6 | §10 conflates the blast radius of the *function* with that of the *deploy*: the same build updates `10-data-auth`'s RDS instance, its security group and its secrets. | A (S2) |
| S-7 | FR-4's *"an action they can take"* is unmet under §9's "no component changes" — a thrown trigger error reaches the default branch, yielding *"Something went wrong. Please try again."* to a user for whom retrying is not an action. | B (F19) |

## Contradictions between judges

**None.** Where both looked at the same thing they reached the same conclusion, differing only in severity label (C-4 and C-6). That agreement is the corroboration mechanism, and it held.

## Corrections applied this round

**None.** The skill permits correcting severe findings confirmed by both judges, after asking. This lineage is escalated **before** round one, because the confirmed set is not a list of fixes — see below.

## Why this is escalated rather than corrected

Three of the confirmed findings are not defects *in how the design was written*. They are consequences of the **route** it chose:

- **C-1** — the awaited reply needs machinery the repo deliberately built itself not to have.
- **C-7** — the Cognito trigger ceiling bounds the whole design from outside, and its retry turns the timeout path into duplicate codes.
- **C-8 / C-11** — the trigger must live where the pool lives, and that stack has neither the configuration nor the toolchain the function needs.

Patching the prose leaves all three intact. And they are **specific to Option A** — the route `proposal.md` §12 recommended, over Option B, **on my own reasoning**. That recommendation now looks wrong, and the honest next step is to re-open it rather than to repair a design built on it.

---

# Round 2 — target `design.md` (Option B)

| Field | Value |
|---|---|
| Target | `docs/specs/auth/forgot-password-delivery/design.md` — the Option B design |
| Round | 2 (final — the skill permits two) |
| Date | 2026-09-22 |
| Judges | Two independent `opus` contexts, blind, told to check **both** the design's own merits **and** whether round 1's confirmed findings were closed, relocated, or dropped |
| Verdict | **JUDGMENT: ESCALATED ⚠️ — terminal. No round 3.** |

## Confirmed by BOTH judges

### Security defects in the reused machinery — the two that matter most

| # | Finding |
|---|---|
| **R2-1** | **`EmailSendBudget` is keyed `(email, windowStart)` with no purpose column** (`schema.prisma:232-241`), and `POST /api/v1/registrations/verify` is **public and unauthenticated**. Three requests against a victim's address exhaust the same hourly budget the reset flow draws on — so the victim's reset throws before any send, and DD-3 **masks it** into *"If an account exists, a reset code has been sent."* They receive nothing and are told nothing, renewably, at zero attacker cost. **DD-1's "one migration, one column" is false**: it discriminates the code table and not the budget that gates it. |
| **R2-2** | **`verifyCode` increments `attempts` on every live row for the address in one statement** (`email-verification.service.ts:317-322`). Five wrong guesses at the public confirm endpoint kill every outstanding reset code for that address. Combined with R2-1, **~15 requests/hour permanently deny self-service reset to any address an attacker knows** — the exact scenario `proposal.md` §13.1 Q-1 was decided on. ⚠️ **This repository already solved this shape**: `RegistrationLookupAttempt` is keyed on the composite `(ip, reference, windowStart)` *"so an attacker guessing against a real applicant's reference can only lock out THEMSELVES, never the applicant"* — precedent neither cited nor applied. |

### The masking mechanism does not close

| # | Finding |
|---|---|
| **R2-3** | **The floor cannot be composed as DD-3 describes.** Every existing term is a **runtime-enforced ceiling** (`800 + 200 + 3000`), which is what makes the invariant hold by construction; DD-3 adds a Cognito lookup that has **no deadline anywhere in this codebase**, and `padToVerificationCodeResponseFloor` **no-ops on a negative remainder** — the exact silent-absorption mechanism that file's own history records being closed once. And DD-3's stated reason for the new term is **false**: the Cognito lookup runs on *both* paths, since it is *how* an unknown address is recognised. |
| **R2-4** | **The citation for that machinery is wrong**, in the section carrying FR-4. `padToVerificationCodeResponseFloor` is **module-private** in `registrations.service.ts:636`, not in `mail-timing.ts` — and `mail-timing.ts:19-27` carries a paragraph headed ***"What this file deliberately does NOT export"*** saying exactly that. Reusing it requires extraction and export, which neither §6 nor §10 budgets. |
| **R2-5** | **Exits that are address-independent in registration become account oracles here.** `registrations.service.ts:695-703` is *"deliberately NOT padded"*, correctly, because registration issues for **every** address. Under DD-3 `issueCode` sits **behind an existence check**, so that unpadded exit — and the pre-send-allowance error reaching it — is reachable **only for real accounts**. FR-4's own last clause forbids exactly this. DD-3 enumerates three masked cases; there are at least five. |

### Round-1 findings that survived the route change

| # | Finding |
|---|---|
| **R2-6** | **C-5's rollback half is silently gone.** The superseded design had an Observability & Rollback section; this one has **no rollback text at all**, while FR-5 still requires reversibility — and the `EmailConfiguration` divergence the design itself documents means rollback still lands on `COGNITO_DEFAULT`, **worse than the pre-spec state**. The ledger now reads as resolved. |
| **R2-7** | **C-12 recurs.** ≥13 deliverables nameable from the design's own text against a stated **8 tasks**. The unit ambiguity was fixed; the reachability was not. One clause is inert: over 8 tasks no distribution reaches 17 aggregate without some task first hitting 3. |
| **R2-8** | **C-13 recurs, worse.** NFR-5 requires the literal words *"`DEPLOY_INFRA` defaults to `false`"*. The string `DEPLOY_INFRA` **does not occur in `design.md` at all** — the previous design at least said "gated". |
| **R2-9** | **Round-1 S-5 still open.** `trd.md:288` still labels the arrow *"self-service password-reset mail (COGNITO_DEFAULT)"* — false today and **more** false under FR-6. It is a `proposal.md` §14.4 success criterion, absent from requirements and design across two rounds. Two new public routes also need TRD API-surface rows. |
| **R2-10** | **§8's "This is not theoretical. Measured" overstates by half.** `MfaConfiguration: OFF` and `LambdaConfig: {}` are CloudFormation defaults — absent→absent, no change. `AccountRecoverySetting` is **self-cancelling**, since DD-5 puts it in the template. Only `EmailConfiguration` is real, and it was already in `proposal.md` §2.2 before this design existed. |
| **R2-11** | **DD-6 is a procedure, not a mechanism** — no command, no artefact, no owner, no task line, no LOC. The reinstated rehearsal is unfunded. Structurally the same gap as round 1's C-5, with a heading. |

### Gaps in what moving off Cognito loses

| # | Finding |
|---|---|
| **R2-12** | **Nothing revokes sessions.** `AdminSetUserPassword` does not revoke refresh tokens; `RefreshTokenValidity: 30` days. A reset motivated by *"my account may be compromised"* **leaves the attacker's token live**. `AdminUserGlobalSignOut` is neither designed nor IAM-granted. |
| **R2-13** | **DD-4 removes one dead branch; four more die with it** — including `InvalidPasswordException`, which is **the only password-policy feedback the form has** (`ForgotPasswordForm` does no client-side validation). DD-4's own argument applies verbatim to all of them. |
| **R2-14** | **Identity resolution is unspecified.** The pool is `UsernameAttributes: [email]` (so `Username` is a UUID) **and case-sensitive**, while `EmailVerification.email` is lowercased. §6 names `AdminSetUserPasswordCommand({ Permanent: true })` with **no `Username` sourcing and no normalization decision** — and a mismatch fails *inside the mask*. ⚠️ This is the shape of the production defect fixed on 2026-09-22. |
| **R2-15** | **`requirements.md` is still an Option A document.** FR-2 ("An unrecognised trigger source fails loudly") has **no referent** and is unstruck; FR-1's scenarios are written against trigger events; §4 still scopes in *"a Cognito custom email sender trigger, its KMS key, and its IAM"*; the glossary still defines the code as Cognito-generated and encrypted; D-1/D-3/D-7 are trigger-specific and still listed as live gates. **The design's own §11 index traces four of the six FRs it claims.** A conformance claim against it is unauditable. |
| **R2-16** | **`PreventUserExistenceErrors` was dropped without a note.** NFR-4 was struck *with* a note precisely so the ledger would still resolve; this was not, so round-1 S-1 now resolves against nothing — and the login path remains an enumeration oracle while the design spends its longest section masking the reset one. |

## Reported by ONE judge — suspect, not auto-fixed

| # | Finding | Judge |
|---|---|---|
| R2-S1 | **Round-1 C-4 was silently dropped and is still live.** The microservice **catches** SMTP failures and *resolves* with `status:500` in the body — so DD-3's *"an address-specific failure is logged and alertable"* has **no detection mechanism**, and FR-4's accepted user harm has no mitigation, only a stated one. It was a fact about the microservice, not about Cognito; the route change did not touch it. | B |
| R2-S2 | **`RegistrationsModule` has no `exports`** — `EmailVerificationService` and the throttle guard are module-private, and `backend/src/auth/` registers no `APP_GUARD`. The wiring the design depends on does not exist. | B |
| R2-S3 | **`Permanent: true` resolves `FORCE_CHANGE_PASSWORD` → `CONFIRMED`**, so an admin-created user who never signed in can complete a self-service reset and **bypass the out-of-band handoff entirely**. Cognito's own `ForgotPassword` refuses users in that state; ours would not. Nothing checks `email_verified` either, though FR-1's scenario presumes it. | B |
| R2-S4 | NFR-1 appears **nowhere** in the design, while DD-3 promises address-specific logging — and the existing code went to real trouble to log `errorType` only, *because a transport rejection can carry the destination address verbatim*. | B |
| R2-S5 | The confirm endpoint is itself an **unpadded enumeration channel**: `verifyCode` performs an extra write only when live rows exist, so a timed request distinguishes an address with an outstanding reset from one without. §5 scopes only the request endpoint. | B |

## Contradictions between judges

**None**, across both rounds. Where both looked at the same thing they agreed.

## Why this terminates

The skill permits **two** fix rounds. This is round 2, and the confirmed set is not a list of edits:

- **R2-1 and R2-2 are exploitable defects** in machinery the design chose *because* it was already hardened. The hardening does not transfer to this threat model, and the repo's own precedent for fixing it was not applied.
- **R2-3 through R2-5** mean FR-4's masking — the reason Option B was chosen over A — **does not close** as designed.
- **R2-15** means the requirements document the design claims conformance to describes a different route, so the claim cannot be audited at all.

Round 1 escalated because the **route** was wrong. Round 2 escalates because, on the right route, the design **stops one step short of a mechanism** in each of its three load-bearing decisions — and because four round-1 findings survived the change, two of them silently, in documents that now read as resolved.

## The author's pattern, as both rounds measured it

Round 1 named it: *asserting a fact about an artefact without opening it.* The design promised a correction — *"Every AWS claim below carries a citation… Claims about this codebase name the file and line read."*

Round 2's verdict on that promise: **eight of ten citations resolved; the two that failed are both in DD-3, the section carrying FR-4.** And one judge's closing line is the finding that matters most:

> *"The dominant species has not been eliminated. It has moved from 'asserted about AWS' to 'asserted about this repository'."*

**Ten Leader-authored defects across two specs, one species.** Writing "cite everything" into a document did not change it. That is evidence about the method, not about effort.
