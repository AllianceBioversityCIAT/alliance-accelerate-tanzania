# Execution — Forgot-password delivery via a Cognito custom sender

| Field | Value |
|---|---|
| Spec path | `docs/specs/auth/forgot-password-delivery` |
| Started | 2026-09-23 |
| Branch | `feat/forgot-password-delivery` |
| Budget | 7 tasks · ~400 LOC · 2 review rounds per task; **escalate when any single task reaches a 3rd** |
| Route | **Path 1**, simplified — `proposal.md` §12.1 |

> **Two designs were discarded before this one.** `judgment.md` records both rounds: round 1 (14 findings) killed the first Path 1 design; round 2 (16+) killed the Option B design that replaced it. This execution runs against a third design written **against that audited findings list** rather than from memory. That is the method change, and it is the only reason these tasks start from verified ground.

---

## T-1 — `10-data-auth` gains a SAM toolchain

**Status:** `[x]` · **Attempts:** 1 · **Reviewer:** PASS, first attempt · Implementer `sonnet` / Reviewer `opus`

### What it does

`10-data-auth` was plain CloudFormation and `deploy.sh` deployed it from **source**, with no `sam build` — deliberately unlike `20-backend`. It now carries `Transform: AWS::Serverless-2016-10-31`, a documented build method, and a documented dependency-install path, and `deploy.sh` builds it before deploying. **No function was added** — T-4 owns that.

This is a **deliberate convention break**: `30-frontend` documents the opposite choice in its own Description. The template header names that, quotes it, and gives the discriminating reason — that stack hosts no function, this one will.

### The falsifier, and why it discriminates

A trivial `AWS::Serverless::Function` stub was added, `validate.sh` run **without** the transform:

```
[[E3038: Check if Serverless Resources have Serverless Transform] ('AWS::Serverless::Function'
 type used without the serverless transform 'AWS::Serverless-2016-10-31') matched 51]
Error: Linting failed.
    FAIL  10-data-auth
    PASS  20-backend
    PASS  30-frontend
```

The Reviewer judged the discrimination sound for a reason worth keeping: **`E3038` is not a generic "invalid template"** — its entire semantic is *"Serverless resource without Serverless Transform"*, and a stub failing for any other cause (missing property, bad YAML) produces a different code. The other two stacks passing in the same run is the control: the runner and profile resolution were working, and only the variable under test moved.

Stub removed, verified by grep and by the built template's unchanged resource set.

### The risk I flagged, and how the Reviewer closed it

`deploy.sh` now deploys the **built** template instead of the source, on a stack holding **the RDS instance and the live Cognito pool**. If the build altered anything material, that would be a silent change to live resources.

The Reviewer settled it by reading the on-disk artifacts rather than reasoning:

- `build.toml` is `[function_build_definitions]` and `[layer_build_definitions]`, **both empty** — positive evidence of a genuine no-op, not an inference from "Build Succeeded".
- Built vs source: same 8 resources, same logical ids, nothing added, removed or renamed. **The Secrets Manager dynamic references survive equivalent** (`{{resolve:secretsmanager:${DbSecret}:SecretString:password}}`) — a mangled reference there would have broken the RDS master credential. All Outputs and Exports preserved, so `20-backend`'s `ImportValue` of `UserPoolId` still resolves.
- Differences are serialization only: short-form `!Ref`/`!Sub` → long-form, YAML re-quoting, comment stripping.

⚠️ **Carried to whoever deploys:** source-vs-**deployed** does differ (the Transform is new, the Description changed), so the next `DEPLOY_INFRA=true` run yields a **non-empty changeset** on a stack with live accounts and a database. Template-metadata level, no resource replacement — but it should not surprise the operator.

### Three claims the Reviewer settled by reading the SAM CLI's own source

Rather than recalling them — and this is the standard this spec has had to learn:

| Claim | Verdict |
|---|---|
| `BuildMethod: nodejs24.x` is valid | ✅ `nodejs24.x` is a key of `selectors_by_runtime`, resolving to `NODEJS_NPM_CONFIG` — SAM's built-in npm builder |
| SAM `Globals` cannot carry `Metadata` | ✅ **Correct and understated** — `Metadata` is absent from the `supported_properties` allow-list, and an unknown key raises `InvalidGlobalsSectionException`. Not "not injected": a hard template error |
| `sam build` uses `npm ci` when a lockfile exists | ❌ **FALSE.** `npm ci` additionally requires `Metadata: BuildProperties: UseNpmCi: true`; the default is `npm install --omit=dev` |

### Advisories applied (the Reviewer's own prescribed text)

**ADVISORY 1 — the `npm ci` error, corrected because T-4 consumes this contract.** Non-operative (deps install either way) but T-4 could have relied on committing a lockfile for deterministic installs. The comment now states the real command and the flag `npm ci` actually needs.

**ADVISORY 3 — citation corrected.** The template cited "design.md §4/§8" for `@aws-crypto/client-node`; the package is named in **§3 step 1**. §4 covers the KMS policies.

`validate.sh` re-run after both: green across all three stacks.

### ⚠️ Forward pointers — these must be copied into the briefs that own them

- **T-4 creates `infra/10-data-auth/functions/custom-email-sender/`** with its own `package.json` declaring `@aws-crypto/client-node`, plus the `AWS::Serverless::Function` resource (`CodeUri: ./functions/custom-email-sender`, `Handler: index.handler`, `Runtime: nodejs24.x`, `Metadata: BuildMethod: nodejs24.x`). T-1 stopped at the toolchain deliberately. **None of those files exist yet.**
- **T-2 has nowhere to run its tests.** Reviewer ADVISORY 2: there is no root `package.json` and no jest config at the chosen `CodeUri` — `backend/` and `frontend/` are the only jest roots. T-2's verify is `npx jest <the new specs>`, and T-2 owns the function's message module, which by this contract lives under `infra/10-data-auth/functions/`. **A runner must be stood up there, and T-2's brief must say so rather than letting it be re-decided twice.**
- **The Reviewer noted the template is better-worded than the design** on one point: `@aws-crypto/client-node` is pure JS, so the template's *"a real npm dependency NOT bundled in the Lambda runtime"* is more accurate than `design.md` §8's "native dependencies". No action; recorded so the design's phrasing is not treated as authoritative on it.


---

## T-2 — The two message bodies

**Status:** `[x]` · **Attempts:** 2 · **Reviewer:** PASS on attempt 2 · Implementer `sonnet` / Reviewer `opus`

### What it built

`infra/10-data-auth/functions/custom-email-sender/` — the function's package, created by T-2 per DD-1b (T-1 stopped at the toolchain deliberately, and `tasks.md` had assigned the directory to T-4, which would have left T-2 with nowhere to put a test). Plain JavaScript ESM, no build step. Nine files, a jest root that is the first outside `backend/`/`frontend/`, and 21 tests.

Verify command, for every later task: `cd infra/10-data-auth/functions/custom-email-sender && npm test`

### The blocking defect, and why no test could have caught it

Attempt 1 linked the reset message to `/forgot-password` and told the reader *"Enter it on the password reset page."*

The Reviewer read `ForgotPasswordForm.tsx` and found it is a **two-step in-memory wizard**: fresh loads open at step 1 — an email field and a "Send reset code" button, **no code field**, no query-param entry to step 2. So a reader clicking that link arrives where they **cannot enter the code they hold**, and their only forward action re-issues a code and **invalidates the one they have**.

**Nothing in the suite could see it.** Every assertion pinned the *host*; none pinned the *path*. The suite was green for `/forgot-password`, `/login`, or any other path. It took reading the destination component — which is what I asked the Reviewer to do, having asked the same question of the design and not answered it myself.

Recorded as **DD-1c** in `design.md`, with the two rejected alternatives and the consequences for T-4.

### The trap in the fix, and how it was checked

The replacement copy makes **its own promise**: *"go back to the window where you requested this — it is already waiting on that step, with your email address filled in."* A component that reset state on blur, navigation or a timer would make that a **new false instruction replacing the old one**.

The Reviewer verified it clause by clause: `setStep('submit')` on success and nothing sets it back; no `useEffect`, no timer, no `key` remount, no blur handler; `email` never cleared and rendered pre-filled at step 2; the step-1 form **unmounted**, so the re-issue hazard is structurally unreachable, not merely unlikely.

### Also fixed — a test that could not fail

Reviewer ADVISORY 1 on attempt 1: `config.spec.mjs`'s sentinel `throw new Error('expected … to throw')` sat **inside** its own `try`, so the `catch` swallowed it and the assertion passed regardless. **It stayed green under a mutation that should have reddened it.** Rewritten to assert `toThrow()` first, and demonstrated to redden when the throw is removed — which the old form did not.

### Leader-applied advisories (the Reviewer's own prescribed changes)

- **ADVISORY 2** — `expect(thrower).toThrow()` accepted *any* throw, so a `TypeError` lacking the sentinel would have kept it green. Now `toThrow(/PUBLIC_APP_BASE_URL/)`, matching the six sibling tests.
- **ADVISORY 3** — the new path-pin test iterates `allUrls(message)` with no non-vacuity guard of its own; FALSIFIER 3 supplied it from a *different* test, so deleting that one would have silently made the pin vacuous. Guard added inline.

Re-verified after both: 21/21.

### The vacuity problem this created, and how it was solved rather than deleted

Removing the link means the reset builder emits no URL — which breaks the guard `expect(textUrls.size).toBeGreaterThan(0)` that stops the sweep passing over an empty set. **Deleting that guard is exactly what would hollow out the test.**

Solved by inversion: the shared `describe.each` keeps only what holds for both builders; a reset-only block asserts **zero** URLs *positively* and that the message renders **identically** under unset / `*` / configured; the attribute-verification-only block keeps the full sweep, both refusal falsifiers, and the new exact-path pin. The Reviewer reconciled 21 executions from 18 declarations and confirmed the 4 tests removed from the shared block are *exactly* the 4 carried into the attribute block — nothing dropped to keep the number steady.

### ⚠️ Carried forward

- **T-4 must not re-add a reset link.** DD-1c.
- **T-4 must never log the builders' return value** — `{ to, subject, text, html }` carries both the address and the plaintext code (NFR-1). Reviewer ADVISORY 4 on attempt 1.
- **T-4 must let `getPublicAppBaseUrl()`'s throw propagate**, not catch and default.
- **`infra/10-data-auth/template.yaml`'s contract comment is now stale** — it says the directory and `package.json` are *"a NEW directory T-4 creates"* / *"does not exist yet"*. DD-1b reassigned that to T-2, which has done it. T-2 was correctly barred from editing that file; **T-4 corrects the comment.**
- **T-7 checks the closed-tab case** — read the real message as someone on a different device from the one that made the request.

### A product gap this surfaced, outside this spec

**The attribute-verification code has no screen anywhere in `frontend/`** — grep-verified independently twice. So a user whose email an admin changes would receive a well-formed message carrying a code they **cannot enter anywhere**. The gap pre-exists; this spec would make it *more* visible by making that mail arrive reliably.

**A cleaner exit exists than handling it:** have `users.service.ts::update()` set `email_verified` in the same `AdminUpdateUserAttributes` call, so Cognito emits no verification mail at all. Small backend change, outside this spec. **Raised with the user, awaiting a decision.**

---

## T-3 — The KMS key and its grant statement

**Status:** `[x]` · **Attempts:** 2 · **Reviewer:** PASS on attempt 2 · Implementer `sonnet` / Reviewer `opus`

### Scope, narrowed before briefing

`tasks.md` listed three policies. Two name **the function's execution role, which does not exist until T-4** — so DD-2a split them: T-3 owns the key and `kms:CreateGrant`; T-4 owns `kms:Decrypt` and the Cognito invoke permission. **T-3 therefore cannot close NFR-4, and was required to say so** rather than report it satisfied. It did, in three places a reader actually reaches.

### The finding that would have blocked T-6

Attempt 1 wrote the grant condition as `!Ref UserPool`. I suspected a circular dependency and asked the Reviewer to check it **as a suspicion, not a verdict**. It confirmed it and found **a second, independent cycle I had not seen**:

| Edge | Owner |
|---|---|
| `Key → UserPool` — the `!Ref` in the condition | T-3, shipped |
| `UserPool → Key` — T-6's `LambdaConfig.KMSKeyID` | T-6 |
| `UserPool → Function → Key` — T-6's `LambdaArn` + T-4's `kms:Decrypt` scoped to the key ARN | T-6 + T-4 |

**Both are blocked by the `!Ref` alone**, so a T-6 that cleverly avoided `KMSKeyID`'s reference would still have deadlocked through the function's decrypt policy.

⚠️ **And the template asserted the opposite as fact** — *"there is no circular dependency: UserPool does not depend on this key"* — true of the graph that day, false of the graph this spec mandates four tasks later, **inside the comment block written to brief T-6's implementer**, who would have read it while staring at the error.

`validate.sh` was green throughout: only one edge of the cycle existed yet.

Resolved by **DD-2b** — a pool-id parameter, with four alternatives rejected for checkable reasons, two of them outright impossible (CloudFormation has no `AWS::KMS::KeyPolicy` type; the pool id carries a service-generated suffix nothing derives).

### A fabricated citation — the third in this spec's history

Attempt 1 justified `Resource: "*"` by citing a precedent in this repository that **does not exist**: `MailMicroserviceSecret` has no policy at all. The only resource-based policy here is `FrontendBucketPolicy`, which uses the **opposite** pattern.

**The decision was right; the reason was invented.** That distinction matters: a plausible-sounding false reason survives every review that does not go and look.

The correction is the right shape — it states the true reason (a KMS key policy is evaluated only against its own key), **and records which files it opened**, so the correction is itself falsifiable. The Reviewer verified both citations and swept the repo for any other resource-based policy to confirm the comment's claim to have checked the full set.

> Two rounds of judgment-day died over this defect class, both times in text I wrote. Here it appeared in an Implementer's work despite a brief that demanded source verification. It is not an intent problem — it is what happens when a reason is written from plausibility rather than from a file.

### A finding T-3's own report missed

The Reviewer found that `CustomEmailSenderKmsGrantPrincipalArn` **is never passed by any deploy path** — `deploy.sh` step 1 passes only `VpcId` and `DevCidr`, so the Default ships on every deploy including a pipeline's, while the parameter's own description argues against hardcoding. **As wired, it behaved exactly like the hardcode it warned about.** Recorded as DD-2c; T-6 owns the wiring.

### Applied on top (Reviewer advisories)

- **`Default: ""` ruled correct** — fail-closed, and the only value satisfying DD-2b (keep the condition) and DD-2c (deployable today) at once. An `AllowedPattern` would break the working deploy path to guard a statement nothing calls until T-6; it becomes right *then*, and is carried to T-6.
- **ADVISORY 2 had landed at one site and not the other.** The key comment carried the corrected disjunction; the parameter description still asserted one branch as fact — and under the other branch that claim is **wrong**, not merely unqualified. Swept both. *(The same "fix the phrase, not the premise" failure this repo's KZ-004 records.)*
- **ADVISORY 1** — *"this stack's only other resource-based policy"* → *"this repo's"*; the sentence contradicted itself, since `10-data-auth` has none.
- **ADVISORY 6** — `EnableKeyRotation: false` written out rather than left to the default, matching the file's own stated principle that a reader should never need to know an AWS default.

### ⚠️ Carried forward

- **T-4 owes** `kms:Decrypt` on its function's `Policies:` block and `lambda:InvokeFunction` for `cognito-idp.amazonaws.com` on the function's resource policy. **NFR-4 is not closed until both land.**
- **T-6 owes** the `deploy.sh` wiring for **both** parameters (DD-2c), and should add an `AllowedPattern` once the override exists — converting the fail-closed default from "first reset fails at T-7" into "deploy refuses at changeset time". ⚠️ The `--role-arn` trap is recorded in DD-2c: the wiring only holds while `sam deploy` runs without one.
- **T-7 carries four open questions nothing in this repo can answer:** whether the context key is spelled `userpool-id`; whether Cognito's grant carries an encryption-context constraint at all (if not, `StringEquals` matches nothing and `CreateGrant` is denied); whether KMS accepts an empty-string condition value; and whether the `cognito_csicap` principal still resolves (KMS rejects a policy naming a non-existent one).

### The falsifier, restated because it is the point

**There is none, and there cannot be one here.** `validate.sh` makes no AWS call; every suite in this repository mocks the AWS clients, so IAM is never exercised. The Reviewer added that a green validate would not even establish that KMS *accepts* this key policy.

Two days before this task, that exact blindness shipped a live defect: a policy granting `cognito-idp:AdminResetUserPassword` while the code called `AdminSetUserPassword` — every admin password reset returning a bare 500, for months, behind 1203 green tests. **T-7 is the only gate.**

---

## T-4 — The function

**Status:** `[x]` · **Attempts:** 3 · **Reviewer:** PASS on attempt 3 · Implementer `sonnet` / Reviewer `opus`

The spec's largest task: decrypt · route · validate the recipient · build · publish. **56 tests.**

### Two decisions taken before briefing, both by reading rather than assuming

**DD-3a — AMQP, connecting per invocation, caching nothing.** HTTP looked simpler and is not: the microservice's endpoint URL is **not** in `MailMicroserviceSecret`, and it takes `multipart/form-data`. AMQP needs no configuration we do not already hold. And the backend's 786-line transport is large *because it keeps a connection alive*; a function that opens, publishes under a confirm and closes needs none of it — and caching would import the freeze hazard this repo already shipped a production fix for. **That is what makes NFR-2 structural here**: nothing outlives the invocation.

**DD-3b — the secret's name embeds `20-backend`'s stack name**, not this one's, so it cannot be composed from the function's own context. A parameter, same shape and reason as DD-2b.

### The design defect the Implementer found

It reported that handling `CustomEmailSender_AdminCreateUser` meant sending **attribute-verification copy for an invitation**, and **declared it instead of writing replacement copy**. That decision is what exposed the defect.

§5 said to handle it *"so the invitation must not vanish silently."* **The premise was false and checkable**: `create()` passes `MessageAction: 'SUPPRESS'` **and dispatches `MailService.sendInvitation` itself**. Cognito's mail is a **duplicate**. So handling it risked **two** invitations; raising means someone learns the day a setting changes. Recorded as **DD-5a**; the branch was deleted rather than re-copied.

> My twelfth defect of the session, same species: written from *"don't lose mail"* rather than from what `create()` does. Caught by an Implementer I had asked to verify.

### The finding that mattered most — a gate that did not exist

Attempt 2 passed every structural check. The Reviewer then found that **nothing asserted the *decrypted* code reaches the body**: `decryptMock`'s return was consumed only by negative log assertions, and the envelope pin matched with `expect.any(String)`.

It proved it by mutation: swapping to `event.request.code` — **mailing the user the base64 ciphertext** — left **all 48 tests green**.

The implementation was correct throughout. **The gate for FR-1's central clause was missing** — and it is the one decryption property a mocked suite can actually prove. Now pinned positively in both parts, with the ciphertext asserted absent from the whole serialized body, and demonstrated red with that exact swap.

### A credential path the file's own docblock forbade

`readMicroserviceMailSecret` validated nothing and parsed unguarded. Two defects, one fix:

- **No validation** — a secret missing `apiKey` publishes an envelope from which `JSON.stringify` silently drops it: the broker acks, the function logs `dispatched`, the microservice discards. A silent no-op, the class DD-2 exists to forbid. It also **diverged from the source it mirrors** — `mail.config.ts` wraps all three in `required()`.
- **Unguarded `JSON.parse`** — a `SyntaxError` can embed a window of the offending input, and because `handler` ends in `throw err`, the runtime writes it verbatim to CloudWatch. That fragment would be the broker URL, which embeds `user:password`.

⚠️ **The function's own docblock said "NEVER log `secret` or any field of it — the broker URL embeds a credential."** The rule sat above the code that broke it.

Fixed with a `catch` that **binds nothing** (so the parse error is unreferenceable) and a `requiredSecretField` naming **the key only**. The Reviewer confirmed the test's read-set — message plus stack, with `cause` structurally absent — **is** the entire CloudWatch surface for that path.

### A cycle that would have blocked T-6, found before it could

`SourceArn: !Sub` on `UserPool` creates `Permission → UserPool`, forcing CloudFormation to build the pool first — while Cognito validates invoke permission **when `LambdaConfig` is set**. The standard remedy (`DependsOn`) is a **cycle**. And `DEPLOY_INFRA` defaults to `false`, so the first real deploy plausibly carries T-4 and T-6 **together** — the failing order.

**DD-5b**: the parameter, conditionally (`AWS::NoValue` while empty). The Reviewer verified the graph is **acyclic under T-6's two future edges**.

*(Second cycle this spec has caught at design time. Both would have surfaced only at the deploy that touches live accounts.)*

### `mandatory: true` — the Implementer's call, and it was right

A publisher confirm attests **persistence, not routing**. Without `mandatory`, a wrong `queueName` acks, logs `dispatched`, and drops the email with zero signal — the same silent-no-op class, from a new angle. Mirrors `confirmPublish` field for field. The Reviewer checked the listener-removal question specifically and found the backend's known gap does **not** apply here, structurally: one channel per invocation, closed in `finally`, so no later publish can see a lingering listener.

### ⚠️ A finding against `design.md`, not against this diff

The Implementer argued, and the Reviewer confirmed, that **§10's disposition of round-1 C-7 as "Dissolved" closes only one of its three components.**

| C-7's component | Reality |
|---|---|
| The awaited round trip must fit a budget | ✅ Dissolved |
| **Cognito's non-configurable ceiling on the trigger invocation** | ❌ **OPEN** — not a property of the reply |
| **Cognito retries a timed-out invocation → duplicate codes** | ❌ **OPEN** — outside the function |

`§10` is corrected and **T-7 now carries three explicit questions**: does the trigger time out; did the user receive more than one code; and does the message read sensibly on a different device (DD-1c's residual).

### Applied on top

- **ADVISORY 1** — the comment claimed *every* `JSON.parse` failure leaks the input. True of the unexpected-token class, **not** of truncation — and the test fixture was truncated, i.e. the one shape that would **not** have leaked. Narrowed. *(The guard was right either way; the claim was not — the over-definite-prose pattern again.)*

### Carried forward

- **T-6 owes three things now**, not two: `deploy.sh` wiring for the principal **and** the pool-id parameters (DD-2c), plus the `AllowedPattern` T-3's review suggested once the override exists. ⚠️ The pool-id wiring is now load-bearing for **DD-5b's `SourceArn`** as well.
- **T-7 owes the three questions above**, plus the four from T-3 that nothing in this repository can answer.
- Reviewer ADVISORY 2 (a docblock displaced from the function it documents) and 3 (a near-vacuous assertion) — **not applied**, recorded; neither changes behaviour.

---

## T-5 — Pool drift audit: artefacts, not a procedure

**Status:** `[x]` — closed 2026-09-24. *(Read as `[~]` "does NOT close" until then; the rehearsal that was blocked has since run — see "T-5 (continued)" at the end of this entry, which supersedes every status statement above it.)* · **Date:** 2026-09-23 · **Attempts:** 3 Implementer + 1 Leader-applied fix · **Reviewer:** FAIL, FAIL, FAIL, PASS · Implementer `sonnet` / Reviewer `opus`

> **Why `[~]` and not `[x]` — as at 2026-09-23. ⚠️ SUPERSEDED: clause 4 was met on 2026-09-24.** T-5's Done-when has four clauses. Three are met and verified. The fourth — *"the throwaway-pool rehearsal is recorded"* — is **not**, and it is blocked on an IAM boundary, not on effort. A task with outstanding scope does not reach `[x]` even on a Reviewer PASS.

### What was produced

| Artefact | State |
|---|---|
| `pool-before.json` | **Committed.** Full `describe-user-pool` of `eu-west-1_eKINGUN3I`, unedited, 24 top-level keys. Reviewer confirmed it complete, untruncated, no user records, no credentials. |
| `design.md` §6 | Four-row table **withdrawn and replaced** by an exhaustive one over all 24 keys, each row carrying a checkable warrant. |
| `infra/10-data-auth/template.yaml` | A classification comment block above `UserPool`. **No property value changed** — of 139 changed lines, every one is a comment. |

### The finding that mattered: the enumeration was not two-way, it was three-way

`tasks.md`'s Disqualifier names two classes — AWS default, or real drift. The live pool needed a **third**, and the Implementer found it rather than forcing the data into the given taxonomy:

- **(a) AWS default** — omission already means this value.
- **(b) Real drift** — a value that diverged and the template should now carry. **Found zero times.**
- **(c) Deliberately removed by an earlier, shipped spec** — visible live only because no `DEPLOY_INFRA=true` deploy has landed the removal. `EmailConfiguration` (`email-notification-microservice` §7.1 Phase B) and `AdminCreateUserConfig.InviteMessageTemplate` (`account-access-emails` DD-5/T-9). **Writing either back into the template would have silently reverted an approved decision.** Both quotes verified at source by the Reviewer.

So T-5's "write the decided values into the template" correctly resolved to **no property written** — (a) and (c) both mean "leave it", for opposite reasons. The Reviewer held this conclusion to a deliberately higher bar (it is the conclusion that requires least work) and confirmed it supported, twice.

### ⚠️ A finding against already-merged code — **RAISED HERE, REFUTED 2026-09-24. T-6 does NOT own it.**

> ⚠️ **SUPERSEDED 2026-09-24 — see "T-5 (continued)" at the end of this entry.** The concern below was raised from AWS documentation and **measurement refuted it**: the combination is accepted on `UpdateUserPool`. Do not carry it to T-6 as a risk. The paragraph is kept because the *refutation* is the lesson — the CLI help is a claim about AWS, not a measurement of it.

`aws cognito-idp update-user-pool help` states that `VerificationMessageTemplate`'s `EmailMessage`/`EmailSubject` *"can be set only if the value of `EmailSendingAccount` is `DEVELOPER`."* **The Leader verified this independently against the CLI's own output.** `UserPool` sets `EmailSendingAccount: COGNITO_DEFAULT` **and** a branded `VerificationMessageTemplate.EmailMessage`/`EmailSubject`. That combination predates this spec, has never been deployed, and **T-6's deploy is the first call that would ever exercise it** — against the pool holding 3 live accounts. It may be rejected outright.

⚠️ It could not be confirmed empirically **because the rehearsal that would have tested it is the step that did not run.** The blocked gate and the defect it would have caught are the same gap.

> **Provenance correction carried to T-6:** both files attribute the branded template to "T-4's content". *This spec's* T-4 is the function and touched no pool property; the branded HTML predates this spec (already live 2026-07-17). Reviewer advisory, left unapplied under the same-sentence rule — **T-6 must not inherit the wrong owner.**

### Attempt history

| # | Reviewer | Findings |
|---|---|---|
| 1 | **FAIL** | Four false claims in a diff that is nothing but claims: "23 keys, machine-counted" (the artefact has **24** — and that number was the exhaustiveness warrant for the whole table); "four" CFN tags (three); a `DeletionProtection` justification citing a property **a KMS key cannot have**, contradicted by a comment three lines below it; the SUPERSEDED marker describing its own replacement. Substance sound — enumeration exhaustive, both (c) quotes verbatim, scope clean, `Properties:` untouched. |
| 2 | **FAIL** | All four fixed correctly, each verified at source — **and the fix introduced a new false claim.** The `VERBATIM`/`INFERRED` taxonomy declared "most rows are VERBATIM": of 15, five quoted, four marked, **six quoted nothing and carried no mark**. Three of those six cited `design.md` §6, which said "Unchanged", pointing back at the table `design.md` declares **withdrawn** — a citation chain terminating in an anulled source. |
| 3 | **FAIL** | Deletion applied (see below). The round-2 defect closed cleanly and 14 of 15 warrants survived. **One did not:** the `LambdaConfig` warrant landed in `template.yaml` and **not** in its `design.md` mirror — and `template.yaml` points the reader at `design.md` "for the full table", i.e. from the complete version at the incomplete one. |
| 4 | **PASS** | Leader-applied one-clause fix. Quote verified against `tasks.md:86`; row now justifies its label instead of explaining why not to write the property; both files agree; table structurally intact and every other cell byte-identical. |

### Decisions

- **DD-5c — the taxonomy was deleted, not repaired.** Round 2's defect originated in **the Leader's own brief**, which imposed a binary partition on a set with three kinds of member (quoted / reasoned / not-a-parameter-at-all). The Reviewer's remediation would have added a third label and more prose — the direction that had just failed. Escalated to the user at the budget's 3rd-round tripwire; the user chose deletion, on KZ-008's rule: *where a correction can be made by deleting the false text rather than replacing it, delete — deletion cannot introduce the next instance.* **Nothing was lost:** each row already carried its own warrant, and a reader can see which rows quote AWS. The taxonomy added no information — it added a false claim *about* the information.
- **The 3-attempt ceiling was reached and `git restore .` was NOT run.** The HALT protocol's rollback exists so a user is not left with broken code. Nothing here was broken — `validate.sh` green, zero config values altered — and rollback would have destroyed a twice-verified audit plus an irreproducible artefact over a one-clause omission. The options, including that rollback is what the rule literally says, were put to the user, who authorised Leader-applies-then-Reviewer-verifies. **Author ≠ auditor held:** the Leader wrote one clause, the Reviewer audited it at an Implementer's bar.
- **Two sound Reviewer advisories left unapplied deliberately** — dropping `or from the task brief` (`design.md:264`) and striking *"Every row below except the two in (c) is this class."* (`template.yaml:342`). Both correct, both deletion-compatible. Declined because the loop was exhausted and the user authorised **one** clause; widening a Leader-applied edit past its authorisation is wrong even when each addition defends itself. **Recorded here as open advisories.**

### The gap — declared, not implied *(⚠️ CLOSED 2026-09-24 — the rehearsal ran; see "T-5 (continued)")*

**The throwaway-pool rehearsal (design.md DD-3 step 4, `proposal.md` R-1) did not run.** The identity available (`cognito_csicap` — the same principal `CustomEmailSenderKmsGrantPrincipalArn` names) got `AccessDenied` on **both** `cloudformation:CreateChangeSet` and `cloudformation:CreateStack`, for every stack name tried. A hard IAM boundary, not a judgment call. **No stack was created** (`describe-stacks` → `ValidationError: … does not exist`, both names); nothing leaked, nothing to delete.

The weaker CLI-only rehearsal was **deliberately not substituted**: the risk being measured is CloudFormation composing `UpdateUserPool` from the template, and a hand-composed CLI call does not exercise that mechanism. A fallback would have produced a green result that measured nothing.

**A scoped IAM grant has been requested** (CloudFormation create/update/delete on `accelerate-tz-dev-rehearsal-*` only — cannot reach the three real stacks). T-5 reopens to run the rehearsal when it lands.

### Requirements

| Clause | State |
|---|---|
| FR-5 — full config read, update composed from it | ✅ `pool-before.json` + the exhaustive classification |
| FR-5 `AND IT MUST` — before/after comparison | ⏳ before captured; after is T-6's |
| FR-5 `BUT it must NOT` — not by hand | ✅ nothing applied by hand; the live pool was read-only throughout |
| D-5 (`requirements.md` §8) — `UpdateUserPool` silently resets an omitted setting | ⚠️ **Enumerated, not rehearsed** *(as at 2026-09-23)*. **Updated 2026-09-24:** the rehearsal demonstrated the **mechanism** twice — an omitted non-default setting IS reset — on the two (c) rows. The (a) classification itself is still reasoned, not measured. |

### Final verification

- `./infra/scripts/validate.sh` → `PASS 10-data-auth` · `PASS 20-backend` · `PASS 30-frontend`. **Run by the Leader**, closing the Reviewer's standing note that the earlier PASSes were the Implementer's account.
- `grep -n "VERBATIM\|INFERRED"` over both files → **empty, exit 1.** No orphan label survives.
- `UserPool`'s `Properties:` → **untouched**, confirmed two ways: the Leader filtered the diff for non-comment changes (zero hits), and the Reviewer re-read the block as byte-identical.

### T-5 continuation — DD-3 step 4 rehearsal attempt (2026-09-24) — ⚠️ WRITTEN BY A CONCURRENT SESSION

> ⚠️ **Provenance, and it is a finding in its own right (KZ-010, 4th recurrence).** This section arrived via commit `78017b7` from a **different AKILI session working in the same checkout**, in parallel with and unknown to the session that wrote everything else in this entry. Neither saw the other; it was found by accident while inspecting the file for an unrelated reason. Root `CLAUDE.md` § Concurrency protocol forbids exactly this ("one AKILI session per checkout"), and the kaizen log already records it three times with the note that no diff review catches it. **Kept, not deleted** — it is a real attempt and its finding is valuable.
>
> **What it attempted, and why it is NOT redundant with the rehearsal that succeeded:** it went after the *harder* target — rehearsing **T-6's actual change** (`LambdaConfig.CustomEmailSender`), which needs a disposable Lambda, IAM role and KMS key. It failed on `UnauthorizedTaggingOperation` for KMS. That is precisely the residual the successful rehearsal declared for itself, so the two are complementary, not duplicates.
>
> **Its status line below ("Status remains `[~]`; T-5 is not ready for Reviewer") is superseded** — see "T-5 (continued)".

**Status remains `[~]`; T-5 is not ready for Reviewer.** The user-authorized rehearsal was attempted against exactly one disposable stack, then cleaned up. CloudFormation accepted `CreateStack`, but the caller could not create the disposable Lambda execution role or KMS key required for Cognito to accept `LambdaConfig.CustomEmailSender`. The rehearsal therefore never reached an `UPDATE_IN_PROGRESS` or a valid before/after pool comparison. No CLI-only substitute was run.

**Identity and scope.** The command was run with `--profile IBD-DEV --region eu-west-1`. The identity output was:

```text
{
    "UserId": "AIDAYJAOTOYERBEE4IPMR",
    "Account": "569113802249",
    "Arn": "arn:aws:iam::569113802249:user/cognito_csicap"
}
```

Exact stack name: `accelerate-tz-dev-rehearsal-20260924-pool-drift`.

The preflight checks for that exact name returned, verbatim:

```text
aws: [ERROR]: An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id accelerate-tz-dev-rehearsal-20260924-pool-drift does not exist
aws: [ERROR]: An error occurred (ValidationError) when calling the DescribeStackEvents operation: Stack [accelerate-tz-dev-rehearsal-20260924-pool-drift] does not exist
```

**Smallest faithful template attempted.** The baseline template contained only the pool's relevant template settings plus the dependencies Cognito requires for a custom sender: `AWS::Cognito::UserPool`, a minimal `AWS::Lambda::Function`, its `AWS::IAM::Role`, an `AWS::Lambda::Permission` for `cognito-idp.amazonaws.com`, and an `AWS::KMS::Key`. The update template was identical except for the intended pool addition:

```yaml
LambdaConfig:
  CustomEmailSender:
    LambdaArn: !GetAtt RehearsalFunction.Arn
    LambdaVersion: V1_0
  KMSKeyID: !GetAtt RehearsalKey.Arn
```

The pool baseline preserved `UsernameAttributes: [email]`, `AutoVerifiedAttributes: [email]`, `EmailConfiguration.EmailSendingAccount: COGNITO_DEFAULT`, admin-only creation, the live password policy, and the verification-code template. The Lambda, permission, and KMS key were disposable prerequisites, not application resources; no RDS, Secrets Manager resource, user, real pool, or real stack was used.

**CreateStack evidence.** The exact `create-stack` command used the baseline file, `CAPABILITY_NAMED_IAM`, only the rehearsal stack name, and the required profile/region. Its complete output was:

```json
{
    "StackId": "arn:aws:cloudformation:eu-west-1:569113802249:stack/accelerate-tz-dev-rehearsal-20260924-pool-drift/533d60c0-b84d-11f1-b839-0a23129ac41d",
    "OperationId": "533e9940-b84d-11f1-b839-0a23129ac41d"
}
```

CloudFormation then rolled back. The complete failure evidence from `describe-stack-resources` was:

```json
{
    "LogicalResourceId": "RehearsalFunctionRole",
    "PhysicalResourceId": "accelerate-tz-dev-rehearsal-2-RehearsalFunctionRole-DrHAKe4smZNN",
    "ResourceType": "AWS::IAM::Role",
    "ResourceStatus": "DELETE_COMPLETE"
}
{
    "LogicalResourceId": "RehearsalKey",
    "ResourceType": "AWS::KMS::Key",
    "ResourceStatus": "CREATE_FAILED",
    "ResourceStatusReason": "Resource handler returned message: \"Encountered a permissions error performing a tagging operation, please add required tag permissions. See https://repost.aws/knowledge-center/cloudformation-tagging-permission-error for how to resolve. Resource handler returned message: \"Unauthorized tagging operation\"\" (RequestToken: 5cabfb40-bef9-a8c6-2521-7b152c080b70, HandlerErrorCode: UnauthorizedTaggingOperation)"
}
{
    "LogicalResourceId": "RehearsalPool",
    "PhysicalResourceId": "eu-west-1_LjHHEshf0",
    "ResourceType": "AWS::Cognito::UserPool",
    "ResourceStatus": "DELETE_COMPLETE"
}
```

The exact denied IAM action appeared in the stack event for the role:

```text
User: arn:aws:iam::569113802249:user/cognito_csicap is not authorized to perform: iam:CreateRole on resource: arn:aws:iam::569113802249:role/accelerate-tz-dev-rehearsal-2-RehearsalFunctionRole-DrHAKe4smZNN because no identity-based policy allows the iam:CreateRole action (Service: Iam, Status Code: 403, Request ID: 4711b3aa-a6d1-497d-b604-b24eddee631) (SDK Attempt Count: 1)
```

The KMS failure was an `UnauthorizedTaggingOperation`; CloudFormation did not return a more specific underlying tag action. The stack-level `Project=ACCELERATE-Tanzania` tag was the only explicit stack tag. The pool was created far enough to receive physical id `eu-west-1_LjHHEshf0`, but its event was `CREATE_FAILED` with `Resource creation cancelled`, followed by `DELETE_COMPLETE` during rollback. `RehearsalFunction` and `RehearsalInvokePermission` were never created.

**Before/after evidence.** No complete live `describe-user-pool` before artefact exists for this attempt: the pool was in a failed stack create and rolled back before a read could be captured. No update ran, so there is no after pool evidence, no `pool-after.json`, and no intended/unintended diff to claim. The only pool evidence is CloudFormation's complete `ResourceProperties` for the failed baseline event, which confirms the baseline template was submitted; it is not a substitute for a live before read. Intended difference: not exercised. Unintended differences: not measurable because `UpdateStack` did not run.

**Cleanup proof.** The exact stack was deleted after `stack-rollback-complete`. The following post-cleanup checks returned verbatim:

```text
aws: [ERROR]: An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id accelerate-tz-dev-rehearsal-20260924-pool-drift does not exist
aws: [ERROR]: An error occurred (ResourceNotFoundException) when calling the DescribeUserPool operation: User pool eu-west-1_LjHHEshf0 does not exist.
aws: [ERROR]: An error occurred (NoSuchEntity) when calling the GetRole operation: The role with name accelerate-tz-dev-rehearsal-2-RehearsalFunctionRole-DrHAKe4smZNN cannot be found.
```

No resource from this attempt remains. The KMS resource had no physical id and failed before creation; the pool and role are confirmed absent. Files changed by this continuation: `docs/specs/auth/forgot-password-delivery/execution.md` only. The temporary rehearsal templates were removed. `tasks.md` was intentionally not changed and T-5 remains `[~]`. A scoped IAM grant for the disposable Lambda/KMS prerequisites, or operator credentials with those permissions, is required before T-5 can become Reviewer-ready.

### T-5 (continued) — the rehearsal ran, 2026-09-24. Clause 4 closes.

**Status change: `[~]` → `[x]`.** The blocker was permissions, not design. A scoped IAM grant (CloudFormation on `accelerate-tz-dev-rehearsal-*` only) was requested, granted, and verified by the Leader with a throwaway probe stack before any real work. All four Done-when clauses are now met.

> ⚠️ **The grant request itself produced a finding worth keeping.** The first attempt was rejected by IAM's **2048-non-whitespace-character limit, shared across *all* inline policies on a user** — the budget was already nearly spent. The fix is a **customer-managed policy** (6144 chars, separate budget), not a shorter inline one. The policy was also compacted to **297 non-whitespace characters** (measured) by collapsing eleven scoped CloudFormation actions into `cloudformation:*` **on the same scoped resource ARN** — no widening, since the resource constraint is what bounds it.

#### What was rehearsed, and why this shape

Stack `accelerate-tz-dev-rehearsal-t5` — a **Cognito-pool-only** template, carrying the real `EmailConfiguration` + branded `VerificationMessageTemplate`. No RDS, secrets, KMS, Lambda or IAM: none is needed for the question, and the grant deliberately does not cover them.

1. Deploy the pool → `CREATE_COMPLETE`.
2. **Apply the live drift out-of-band**, via direct `update-user-pool` outside CloudFormation — the step that makes it a rehearsal rather than a fresh-pool test.
3. **Verify the drift actually landed** before proceeding: the rehearsal pool's `EmailConfiguration` and `AdminCreateUserConfig` were confirmed **byte-identical to the committed `pool-before.json`**. ⚠️ This check is load-bearing — *a rehearsal whose drift silently failed to apply reports a reassuring no-op and proves nothing* (KZ-002). It was required in the brief for that reason.
4. Redeploy the template over the same stack → `UPDATE_COMPLETE`.
5. Full key-by-key before/after diff.
6. Delete the stack.

#### Result — §6's enumeration moves from reasoned to measured

CloudFormation's `UpdateUserPool` reset **exactly the two (c)-class settings and nothing else**:

| Key | Before (drifted) | After | Predicted? |
|---|---|---|---|
| `EmailConfiguration` | `DEVELOPER` + SES `SourceArn` + branded `From` | `COGNITO_DEFAULT` | ✅ §6 (c) |
| `AdminCreateUserConfig.InviteMessageTemplate` | branded invite HTML | **gone** | ✅ §6 (c) |

Every (a)-class row also survived untouched — `Policies`, `AutoVerifiedAttributes`, `SchemaAttributes`, `MfaConfiguration`, `AccountRecoverySetting`, `VerificationMessageTemplate`, `UserPoolTier`, `KeyConfiguration`, `IssuerConfiguration`, `UserAttributeUpdateSettings`, `UserPoolTags`, `UsernameAttributes`, `LambdaConfig`.

> ⚠️ **What that does and does not establish — this paragraph originally overstated it and the Reviewer was right to reject the claim.** The rehearsal pool was created **from this same template**, so every omitted property already sat at the AWS default *by construction*, and only the two (c) settings were ever drifted. The (a) rows therefore **could not have done anything but survive** — the observation is identical under the hypothesis that any (a) label is wrong about the real pool, so it discriminates nothing. **The two (c) resets are measured. The (a) enumeration remains reasoned.** What would measure it: drift an (a) property away from its default (e.g. `MfaConfiguration: ON`) and see whether the template-composed update resets it — not done. `DeletionProtection` is deliberately absent from the list above: it was the **forcing change**, explicitly set in the update template, so it is evidence about nothing. D-5's **mechanism** is now demonstrated (twice); D-5's classification is not.

#### ⚠️ The headline: the T-6 blocker does not exist

The `COGNITO_DEFAULT` + `VerificationMessageTemplate.EmailMessage` combination — which the previous entry flagged as a probable hard failure on T-6's deploy — **is accepted.** Confirmed two independent ways:

- **Through CloudFormation** (the Implementer): both `create-stack` and `update-stack` carried both settings and reached `CREATE_COMPLETE` / `UPDATE_COMPLETE`, template intact, no silent stripping.
- **Through the raw API** (the Leader, independently): `cognito-idp create-user-pool` with `EmailSendingAccount: COGNITO_DEFAULT` and a custom `EmailMessage`/`EmailSubject` returned a pool whose template survived **verbatim**. Pool deleted immediately.

`aws cognito-idp update-user-pool help` says *"You can set an `EmailMessage` template only if the value of `EmailSendingAccount` is `DEVELOPER`."* **On `UpdateUserPool` — the API the quote governs, reached the way T-6 reaches it — the constraint is not enforced.** design.md §6 is corrected accordingly; T-6 is not blocked on this.

> **Two limits on that retraction, since the person who raised the alarm also wrote the retraction.** (i) The Leader's independent check used `create-user-pool`, a **different API** — it guards against operator error, it is not a second test of the same rule; the CloudFormation `update-stack` is the one that actually refutes it. (ii) The quoted constraint also covered `InviteMessageTemplate`, and **that half was never exercised in the violating direction** — in the rehearsal it was set while `EmailSendingAccount` was `DEVELOPER`, which satisfies the constraint rather than testing it.

> **The transferable lesson, worth more than the answer.** The concern was raised from documentation and refuted by measurement — and **this spec cites that same CLI help as the authority for seven of §6's rows** — while three others explicitly record that it does *not* support them. *(The first draft of this sentence said "fifteen", which is the count of (a)-class bullets in `template.yaml`, not the count resting on the help. The Reviewer caught it; both counts were then re-run independently and disagreed at first — 6 vs 7 — because one row cites `aws cognito-idp update-user-pool help` without using the words "CLI help". Seven is right. A false number inside the sentence warning against unverified vendor claims is the whole lesson in miniature.)* The CLI help is a claim about AWS, not a measurement of it. Candidate for the kaizen log at archive: *vendor documentation is a third-party claim under KZ-011, not a primary source.*

#### ⚠️ A second finding nobody predicted — and it is T-6's

Redeploying the **unchanged** template returned:

```
An error occurred (ValidationError) when calling the UpdateStack operation: No updates are to be performed.
```

**CloudFormation diffs template *text*, not live resource state.** Since T-5 wrote zero new properties, a redeploy of the T-5 template would never invoke `UpdateUserPool` at all — the reset is **dormant until a template property changes**. The change that fires it is **T-6's `LambdaConfig` addition**. So the two (c)-class resets above are not a hypothetical: they land on the live pool, with 3 real accounts, on T-6's deploy, and that deploy is the first that will.

To reach step 4 at all the Implementer substituted a one-property forcing change (`DeletionProtection: INACTIVE`, already the default, so inert) — declared, and the correct call: it exercises the same recomposition mechanism without needing the Lambda/KMS permissions the grant excludes. **It is not a byte-for-byte rehearsal of T-6's specific change**, and that residual is recorded rather than glossed.

#### A stated residual that turned out false — reported rather than quietly kept

The brief predicted the live SES `EmailConfiguration` could not be reproduced, since the identity (`j.cadavid@cgiar.org`) was torn down. **It reproduced exactly** — `update-user-pool` accepted the dead identity's ARN, so Cognito does not validate SES-identity existence at config-write time. The Implementer flagged the false premise instead of banking an unearned residual. What genuinely remains untested is whether Cognito could *send* through a dead identity — a delivery question, and **T-7's**, not T-5's.

#### Safety — verified by the Leader after the fact, not taken on report

| Check | Result |
|---|---|
| Live pool `eu-west-1_eKINGUN3I` | **3 users, `LastModifiedDate` 2026-07-17** — identical to the pre-rehearsal baseline |
| Stack `accelerate-tz-dev-data-auth` | `UPDATE_COMPLETE`, last updated **2026-08-05** — pre-dates this session |
| Rehearsal stacks remaining | **none** (`Stacks[?contains(StackName,'rehearsal')]` → `[]`) |
| Probe/api-check pools | deleted; `ResourceNotFoundException` on lookup |
| Working tree after the rehearsal | clean — the Implementer changed no files |

No command against the live pool or the real stack was anything but `describe-*`.

#### Carried to T-6 — three things, not two

1. **The deploy WILL reset `EmailConfiguration` → `COGNITO_DEFAULT` and drop `InviteMessageTemplate`.** Measured, not predicted. Both are intended (each is another spec's decision landing at last), but the operator must not be surprised.
2. **`pool-after.json` is T-6's artefact**, deliberately not written here — committing a throwaway pool's capture under that name would collide with the live before/after T-6 owes. (`tasks.md` lists it under T-6's Files, correctly.)
3. **The provenance correction stands:** the branded `VerificationMessageTemplate` is *not* this spec's T-4. It predates this spec and was live on 2026-07-17.

#### Two decisions taken at closure, both the user's

**1. The harder rehearsal will NOT be pursued — T-7 covers it better.** A concurrent session (see the KZ-010 note above) attempted to rehearse **T-6's actual change** — setting `LambdaConfig.CustomEmailSender` — and failed on `UnauthorizedTaggingOperation` for KMS. Running it would need IAM-role, KMS and Lambda permissions beyond the CloudFormation grant. Put to the user, who declined, and the reasoning is worth keeping: the remaining unknown is whether *adding the trigger* breaks something, and **T-7 tests that far more strongly than any rehearsal can** — with a real reset, a real inbox and a real code. A rehearsal would prove the deploy succeeds; T-7 proves a human got the email. Recorded as an accepted residual, not as coverage.

> ⚠️ **A correction the Leader owes the record.** Asked whether the extra IAM/KMS/Lambda permissions were necessary, the Leader answered **no**, having verified the Cognito-only rehearsal needed none. That was true of *that* rehearsal and **false as a general claim** — those permissions are exactly what rehearsing T-6's change requires, which is why the concurrent session asked for them. The answer was right about the experiment it had in mind and wrong about the question as asked. Had the concurrency been visible, the two designs would have been reconciled instead of one silently answering for both.

**2. Concurrency: the other sessions are being closed.** Two further AKILI sessions were open on this checkout. The user is closing them so a single session owns the spec, per root `CLAUDE.md` § Concurrency protocol.

#### For `/akili-archive` — kaizen candidates from this task

- **KZ-010, 4th recurrence.** Two sessions executed T-5 in one checkout, in parallel, neither aware of the other; found by accident, not by any gate. Previous recurrences each ended "still unenforced". ⚠️ **New in this instance: the collision produced a *wrong answer to the user*, not just a messy ledger** — the Leader told the user a permission set was unnecessary while the other session was blocked for want of exactly it. A concurrency defect crossed into advice.
- **A new lesson, candidate: vendor documentation is a third-party claim under KZ-011, not a primary source.** The CLI help was cited as authority for seven classification rows and raised a false T-6 blocker; a two-minute measurement refuted it. Distinct from KZ-008 (that is about *this repo's* artefacts) — this is about trusting an *external* authority's description of its own behaviour.
- **KZ-005/KZ-011 again, and at the worst possible site:** the false count ("fifteen" for seven) landed *inside* the sentence warning against unverified claims, in the Leader's ledger — the surface KZ-011 says nothing audits. It took a fifth Reviewer round to catch. Of this task's ten total findings, **nine were in Leader- or prose-authored text and one was in the audit's substance.**

#### Closure

All four Done-when clauses met: `pool-before.json` committed · every divergent setting decided in writing · the template carries the decided values (there were none to carry, and that conclusion survived a deliberately hostile re-read) · the throwaway-pool rehearsal performed and recorded. **T-5 → `[x]`.**

**T-6 inherits:** the two (c)-class resets will land on the live pool on its deploy, measured not guessed; the `No updates are to be performed` behaviour means its `LambdaConfig` addition is the change that fires them; the `COGNITO_DEFAULT` concern is refuted and must not be re-raised; `pool-after.json` is its artefact; and the branded `VerificationMessageTemplate` is **not** this spec's T-4.

---

## T-6 — Activate the trigger

**Status:** `[~]` — **the repository change is complete and passed review; the deploy has not happened.** · **Date:** 2026-09-24 · **Attempts:** 3 · **Reviewers:** two in parallel (template / `deploy.sh`), by artefact · Implementer `sonnet` / Reviewers `opus`

> **Why `[~]`.** T-6's Done-when has three clauses. Two are met. The third — *"the diff is clean"* — means the live pool's before/after diff, which needs a deploy that **T-6's own Disqualifier says will not happen** (`DEPLOY_INFRA` defaults to `false`). ⚠️ **The task text contradicts itself**, and the Leader adjudicated it template-only rather than passing the contradiction into the loop. `pool-after.json` and the diff belong to the deploy, now scheduled.

### What changed

| | |
|---|---|
| `LambdaConfig` on `UserPool` | `CustomEmailSender` (`LambdaArn`, `LambdaVersion: V1_0`) + `KMSKeyID`. The property that activates the trigger. |
| **`DependsOn: CustomEmailSenderInvokePermission`** | The deploy-blocking fix — see below. |
| `deploy.sh` step 1 | Now passes **three** parameters that nothing had ever passed, each resolved or overridable, none hardcoded. |
| `AllowedPattern` on the pool id | A malformed value now fails the changeset instead of failing silently at T-7. |
| A new test case + two stub repairs | The change had **no gate at all** before this. |

### ⚠️ The deploy-blocking defect, and why nothing automated caught it

`UserPool` and `CustomEmailSenderInvokePermission` had **no dependency edge in either direction** — unordered siblings. Cognito validates the invoke permission *at the moment `LambdaConfig` is set*, i.e. while `UserPool` is being built. If CloudFormation picked that order, `UpdateUserPool` is rejected and **the whole stack rolls back — including the RDS instance.**

**It was non-deterministic**: it might have succeeded by luck, which is worse than a clean failure. And it lands on *this* deploy specifically — `Key`, `Function` and `Permission` are all new resources (the stack was last updated 2026-08-05, before T-3/T-4 merged), so T-4 and T-6 arrive in one changeset: the exact failing scenario.

**Fix:** `DependsOn: CustomEmailSenderInvokePermission` on `UserPool`. Provably acyclic — `Key → Function → Permission → UserPool` — **and legal only because DD-5b had already removed `Permission → UserPool`. That is what the parameter substitution bought, and the task had not spent it.**

> **The falsifier reasoned from a graph that no longer exists.** Attempt 1 concluded that adding this `DependsOn` would create a cycle — reading the template's own T-4 comment, which says it *"would be a CYCLE (**but Permission's SourceArn already needs UserPool**)"*. DD-5b deleted that parenthetical premise. So **the one configuration the falsifier declined to test was the required fix, declined on a ground that had already been withdrawn** — and the comment was arguing against its own remedy. KZ-008's exact mechanism: reasoning from a remembered artefact instead of the present one.
>
> **The corrected falsifier then reddened**, restoring `!Ref UserPool` in the *Key's* condition: `E3004 … Circular Dependencies for resource UserPool`. So the true statement is sharper than "the gate is blind": **`validate.sh` catches the DD-2b graph cycle and is blind to the DD-5b API-ordering hazard** — a Cognito runtime-ordering requirement CloudFormation's static graph cannot express. That blindness is now written **into the template**, because a green `validate.sh` is exactly what would reassure someone deleting the `DependsOn` as redundant.
>
> **An unclaimed gain the Reviewer found:** with the `DependsOn` in place, the regression a maintainer is most likely to reach (re-pointing `SourceArn` at `!Ref UserPool`) becomes a two-node cycle that lint **will** catch. Previously silent, now caught.

### The second blocking defect — a silent-failure path in `deploy.sh`

The principal ARN was resolved with no shape validation. Under an assumed role or SSO, `sts get-caller-identity` returns a **session** ARN; KMS accepts it, but it is scoped to one expiring session — **the deploy succeeds and every later password reset dies with no deploy-time signal.** The block's comment claimed it was wired "the same way" as `ALLOWED_ORIGIN`/`MAIL_TRANSPORT`, which carry post-resolution guards; audited against the artefact, it was not.

⚠️ **Leader-measured: the identity here is `arn:aws:iam::569113802249:user/cognito_csicap`, an IAM user, not a session** — so this never bit. The guard was added anyway; the latent path and the false claim were both real.

### The all-or-nothing consequence, found by review and escalated to the user

The trigger is **per-pool, all-or-nothing**: activating it routes *every* pool email through the function. `CustomEmailSenderPublicAppBaseUrl` was **passed by nothing** (Leader-verified: zero occurrences), and `config.mjs`'s `getPublicAppBaseUrl()` **throws** on empty — which `CustomEmailSender_VerifyUserAttribute` needs. **Activating the trigger would have broken the admin email-edit path.**

`CustomEmailSender_ForgotPassword` was never at risk — DD-1c removed the reset message's link, so the reset builder never calls it.

DD-2c names only two parameters because it predates this interaction. **Put to the user, who approved widening T-6**: T-6 is the task that makes the trigger live, and shipping a trigger that throws on a reachable path would choose the letter over the outcome. Now resolved from `$ALLOWED_ORIGIN` (measured: `https://d3idqvvg0xa1r7.cloudfront.net`), mirroring `20-backend`'s own shipped fallback. **Residual, declared in the template:** on a bootstrap with no frontend stack, `$ALLOWED_ORIGIN` is `'*'` and the throw persists — accepted, no worse than the empty default, self-heals on the next run.

### ⚠️ The change had no gate at all, and the green suite proved nothing

The Reviewer established that the repo's 49/50 script-test run **carried no information about this diff**: the stub `aws` answered `sts get-caller-identity` ignoring `--query`, so the harness resolved nonsense, passed it to a stubbed `sam`, and went green. **Deleting the entire new block would not have changed a single test's colour.** `validate.sh` never reads `deploy.sh` at all.

Fixed as `tasks.md` §2 compliance, not as an advisory: a new case asserts the three resolved values are literally what reach `--parameter-overrides`. The Reviewer verified it **genuinely discriminates** under four destruction tests — and noted the detail that saves it: the announcements print `Key = value` (spaces) while the assertions needle `Key=value` (none), so they can only match the real call, never the echo.

The new guard also reddened two **pre-existing** cases whose stubs were imprecise; the Implementer repaired the stubs. ⚠️ A stub edited by the author of the code it stubs is the shape to distrust, so the Reviewer was asked to adjudicate specifically: **faithful repair** — the fixtures move *toward* the real CLI, nothing was removed, and **the assertion blocks are byte-identical to the previous attempt.**

### Attempt history

| # | Verdict | Findings |
|---|---|---|
| 1 | **FAIL / FAIL** | Missing `DependsOn` (deploy-blocking, non-deterministic stack rollback) · the falsifier's conclusion wrong, reasoned from the pre-DD-5b graph · comment conflating cycle with ordering · lint-blindness unrecorded · principal resolved with no shape guard (deploy-blocking) · plus the all-or-nothing escalation |
| 2 | **FAIL (docs) / PASS** | All seven addressed; `deploy.sh` and the tests passed. Template FAIL on documentation only — the new parameter's `Description` still described the pre-change world, i.e. told the operator the verification path was broken at the moment this change fixed it |
| 3 | **PASS** | `Description` corrected, header inventory completed, bootstrap residual moved into the artefact, a stale tense re-tensed, a garbled attribution fixed |

### Verification

- `./infra/scripts/validate.sh` → green across all three stacks. **Run by the Leader** at rounds 2 and 3.
- Corrected cycle falsifier: red (`E3004`) → restore → green.
- New test-case falsifier: red → restore → green.
- `./infra/scripts/tests/run-tests.sh` → 51 cases, 50 pass; the one failure is the **pre-existing** `guard-account.no-account-id-literal-in-infra` (T-3's account-id Default), confirmed unchanged by `git stash`. Reported, not fixed — out of scope.
- **Round 3 moved no property value**: the Leader filtered the cumulative diff for changed lines that are neither blank nor comments; only earlier attempts' structural lines appear.
- `shellcheck` unavailable — declared UNVERIFIABLE, not silently skipped. The Reviewer judged the gap low-consequence here and said why.

### What none of this establishes

That the trigger works. **No test in this repository exercises IAM, KMS, or delivery** — every suite mocks the AWS clients. Two premises this deploy tests for the first time, both declared open since T-3: whether Cognito's grant carries an encryption-context constraint at all (if not, the `StringEquals` on `kms:EncryptionContext:userpool-id` matches nothing and `CreateGrant` is denied), and whether `userpool-id` is the right spelling. **T-7 is the only gate.**

### For the operator — expected shape, so "right" is recognisable

The deploy is scheduled (user's decision). Adding `LambdaConfig` is a no-interruption property update and `DependsOn` affects ordering only, so the changeset must show `UserPool` as **`Modify` with `Replacement: False`**. ⚠️ **`Replacement: True` means stop** — that would destroy the pool and its 3 accounts, and nothing in this task should produce it.

It will also reset the two (c)-class settings T-5 measured: `EmailConfiguration` → `COGNITO_DEFAULT`, and `AdminCreateUserConfig.InviteMessageTemplate` removed. Both intended. **No rollback restores current behaviour** (DD-4).

### T-6 (continued) — deployed to DEV 2026-09-25. The diff is clean. Clause 3 closes.

**Status: `[~]` → `[x]`.** Deployed by an operator (`cristian.gamboa`) via a **targeted** `sam deploy` of `10-data-auth` alone, not through Jenkins and not through `deploy.sh`'s full four-step run.

#### Why targeted, and what it bought

The user asked whether a specific deploy was possible instead of flipping Jenkins' `DEPLOY_INFRA`. It was, and it was strictly better. ⚠️ **This only became answerable once the user supplied the `Jenkinsfile`, which is not versioned in this repository** — every prior plan in this spec reasoned about the deploy path from files that do not describe it.

| Jenkins route | Targeted route |
|---|---|
| Requires editing the `Jenkinsfile` on the server (`DEPLOY_INFRA` is a hardcoded env var at line 104, **not** a build parameter — correcting an earlier Leader statement) | No Jenkins change |
| Redeploys all three stacks | Only the stack that changed |
| `DEV_CIDR` is empty, so `deploy.sh` **auto-detects the Jenkins agent's IP and overwrites the RDS ingress rule**, evicting developers | **Untouched** — SAM sends `UsePreviousValue` for omitted parameters, so `DevCidr` stayed `181.234.40.157/32` |
| Must remember to flip the flag back | Nothing to revert |

#### The parameter wiring proved itself on first contact

`CustomEmailSenderKmsGrantPrincipalArn` resolved to **`arn:aws:iam::569113802249:user/cristian.gamboa`** — the operator who actually ran it, **not** the `cognito_csicap` ARN hardcoded as the template `Default`. That is precisely the defect DD-2c existed to prevent, and without T-6's wiring the KMS key policy would have named the wrong principal on this very deploy. The other two resolved correctly as well (`eu-west-1_eKINGUN3I`, `https://d3idqvvg0xa1r7.cloudfront.net`).

#### The before/after diff — T-6's falsifier, satisfied

`pool-after.json` committed. **24 keys before, 24 after; 4 changed, 20 untouched.**

| Key | Before → After | Predicted? |
|---|---|---|
| `LambdaConfig` | `{}` → `CustomEmailSender` (`LambdaArn`, `V1_0`) + `KMSKeyID` | ✅ **the point of T-6** |
| `EmailConfiguration` | `DEVELOPER` + SES → `COGNITO_DEFAULT` | ✅ §6 (c) |
| `AdminCreateUserConfig.InviteMessageTemplate` | branded HTML → **gone** | ✅ §6 (c) |
| `LastModifiedDate` | — | ✅ mechanical |

**Every (a)-class row survived untouched**, against the real pool this time rather than a rehearsal built from the same template. T-5's classification held completely.

#### ⚠️ An unpredicted change on the first attempt — caused by the Leader's runbook

The **first** deploy also removed `UserPoolTags`' `Project: ACCELERATE-Tanzania`. Stack tags went to `[]` — across **every taggable resource in the stack**, not just the pool: RDS, the secret, the KMS key, the function.

**Cause: the Leader's runbook omitted `--config-file ../samconfig.toml`**, where the tag lives (`tags = "Project=\"ACCELERATE-Tanzania\""`, annotated in that file as a *DevOps cost-allocation requirement*). Without it CloudFormation read the stack as untagged and removed what was there. `accelerate-tz-dev-backend` retaining the tag was the control that made it unambiguous.

**T-6's falsifier calls this a FAIL, not a note** — *"a diff showing an unexpected setting change is a FAIL"* — so T-6 was held open and a second, tags-only deploy restored it. That run deliberately passed **no** `--parameter-overrides`, so `UsePreviousValue` preserved all three resolved parameters and the KMS principal did not churn to whoever ran the fix. Verified: tags `[{"Key":"Project","Value":"ACCELERATE-Tanzania"}]`, parameters unchanged.

> **The lesson, and it is a new one.** T-5's audit classified `UserPoolTags` correctly — *"not this resource's property; `Project` comes from `infra/samconfig.toml`'s stack-level `tags`, propagated by CloudFormation"* — and concluded the template needed no change. Both true. **But the whole audit asked *"what sets this value?"* and never asked *"what could remove it?"*** A property governed from outside the template is not thereby safe; it is safe only while every deploy path supplies it. The enumeration had no column for that, and neither the rehearsal nor two Reviewers caught it, because all three reasoned about the template rather than about the *invocation*.
>
> **Kaizen candidate for archive:** *a drift audit must enumerate the deploy paths, not only the configuration.* Sibling to the entry already filed this run about vendor documentation — both are cases of the spec being internally consistent and externally incomplete (KZ-011).

#### What is now live, and what is still unproven

Live: the trigger routes Cognito's password-reset mail to our function. **Unproven: that a human receives an email.** The KMS grant chain, real decryption, and delivery remain invisible to every suite here (`requirements.md` §8, D-3/D-4/D-6). `kms:ListGrants` was attempted from this session and denied by IAM, so even the grant's existence is unconfirmed. **T-7 is the only gate, and it is now unblocked.**
