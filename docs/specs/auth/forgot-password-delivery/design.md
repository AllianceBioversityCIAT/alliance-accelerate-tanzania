# Design — Forgot-password delivery via a Cognito custom sender (Path 1)

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/auth/forgot-password-delivery` |
| Depth | Full |
| Status | Draft — awaiting approval |
| Decision | `proposal.md` §12.1 — Path 1, simplified. SES is excluded from every layer, permanently. |
| Requirements | `requirements.md` FR-1…FR-5 (FR-6 struck), NFR-1…NFR-6 |
| Supersedes | `design.superseded-option-a.md` (round 1) and the Option B design it replaced |
| Budget | §9 |

**This design is written against `judgment.md`'s audited findings, not from memory.** Round 1 produced 14 both-judge-confirmed findings on a Path 1 design; §10 disposes of every one by name. That list is the fact base — the judges read the files, with citations, and using their reading rather than re-deriving it is the method change this spec needed.

---

## 2. What actually changes

**One thing.** Cognito stops mailing the reset code itself and hands it to a function of ours, which publishes it to the microservice.

Everything else is untouched: Cognito still generates the code, expires it, verifies it, counts attempts, and enforces the password policy on the new password. The `/forgot-password` screens do not change. The backend API does not change. No database change.

```
user clicks "forgot password"
        │
        ▼
   Cognito  ── generates the code, encrypts it, and instead of sending …
        │
        ▼
  CustomEmailSender function   ← the only new thing
        │  decrypt · build the message · publish · return
        ▼
  OneCGIAR microservice → the user's mailbox
```

---

## 3. The function

Small by design, because §4 makes it expensive to change.

| Step | Detail |
|---|---|
| 1. Decrypt | AWS Encryption SDK (`@aws-crypto/client-node`) against the KMS key. |
| 2. Route by `triggerSource` | §5 — an enumerated set, everything else raises. |
| 3. Validate the recipient | ⚠️ **Round-1 C-10.** The email attribute must be present and address-shaped **before** anything is published. A UUID published as a recipient is the production defect fixed on 2026-09-22 (`users.service.ts` reset path); it must not be re-introduced from the other side. |
| 4. Build | Subject + body, reusing the layout convention in `backend/src/mail/templates/`. Any link derives from configuration (NFR-3). |
| 5. Publish | Envelope shape from `buildMicroserviceEnvelope`'s contract. **No reply awaited** (`proposal.md` §12.1) — publish, confirm, return. |

### DD-1 — Configuration is read at runtime, not imported at deploy time

Round-1 **C-8** held that `10-data-auth` cannot reach the broker credentials because they live in `20-backend`, which deploys after it. True for `Fn::ImportValue` — and irrelevant, because the function does not need one.

`MailMicroserviceSecret` has a **predictable name** — `!Sub "${AWS::StackName}-mail-microservice-secret"` (`infra/20-backend/template.yaml:172`). The function reads it **by name at invocation time** via the SDK. The dependency is on the secret *existing when someone resets a password*, which is long after both stacks are up — not on deploy ordering.

`PUBLIC_APP_BASE_URL` becomes a `10-data-auth` parameter, defaulted and overridable, mirroring how `20-backend` already derives it.

⚠️ **The honest cost of DD-1**, which round-1 **C-14** said the previous design understated: the function lives in the stack that only deploys under `DEPLOY_INFRA=true`, so **changing it is slow**. Option B (put it in `20-backend`) really is blocked by a CloudFormation cycle — `20-backend` imports `UserPoolId` from `10-data-auth`, verified. The parameter-passing workaround exists and this repo already uses it (`DataAuthStackName`), so the honest statement is *"colocation with the pool and the key is worth more than fast iteration on a function we expect to change rarely"* — not that the alternative is impossible.

---

### DD-1a — The function carries its own minimal renderer; the convention is mirrored, not the code

**A gap this design left, decided 2026-09-23 before T-2 hit it.** §3 step 4 says the bodies follow `backend/src/mail/templates/`'s convention — but the function is a **standalone Lambda in `10-data-auth`**, not part of the NestJS app, so it cannot import `renderEmailHtml`.

| Option | Verdict |
|---|---|
| **Duplicate a minimal renderer in the function** | ✅ **Chosen.** Two stable message bodies do not justify a shared package spanning a Nest app and a bare Lambda. |
| A shared package | Rejected — build tooling, versioning and a publish step for ~50 lines, across two stacks that deploy on different cadences. |
| Import from `backend/` | Rejected — different deployable, different `package.json`, and it would drag the Nest dependency tree into a trigger Cognito waits on. |

⚠️ **The accepted cost, named so it is not discovered as a surprise:** the two systems' email styling can drift. Bounded deliberately — these two bodies are the *only* mail this function ever sends, and they are not expected to change. **If a third message is ever added here, revisit this decision rather than duplicating again.**

### DD-1b — The function is plain JavaScript (ESM), and T-2 creates its package

**Two gaps decided 2026-09-23, before T-2 hits them.** T-1 established the build contract but deliberately created no files; `tasks.md` assigned the directory to T-4, while T-2 needs it first to have anywhere to put a message module or a test.

**Language: plain JavaScript (ESM, `.mjs`), not TypeScript.**

| | |
|---|---|
| ✅ | T-1 chose `BuildMethod: nodejs24.x` — SAM's **built-in npm builder**, which installs dependencies and stages them. **It does not transpile.** TypeScript would need an added esbuild or `tsc` step, re-opening the build-method decision T-1 made for good reasons. |
| ✅ | It matches AWS's own `CustomEmailSender` example, which is the reference an implementer will check. |
| ⚠️ | **The cost, named:** this is the only JavaScript in a TypeScript repository. Accepted because the alternative is a transpile step for ~110 lines, and because the function's contract with the outside world is two fixed shapes (Cognito's event, the microservice envelope) rather than a type surface that earns checking. |

**Scaffold ownership: T-2 creates the package; T-4 adds the handler and the SAM resource.**

T-2 creates `infra/10-data-auth/functions/custom-email-sender/` with its `package.json` and a test runner, plus the message module and its specs. T-4 then adds `index.mjs`, the runtime dependencies it needs, and the `AWS::Serverless::Function` resource.

The split is natural: **T-2 owns "the package exists and can render a message"; T-4 owns "the handler wires it to Cognito and the broker."** ⚠️ Reviewer ADVISORY 2 on T-1 flagged that there is no jest root there and that leaving it unassigned would get it re-decided twice — this is that assignment.

### DD-1c — The reset message carries **no link**. Only the verification message does.

**Decided during T-2, after a Reviewer FAIL, and recorded here because it changes what a later implementer should expect.**

T-2 originally linked the reset message to `/forgot-password`. That destination is a **two-step in-memory wizard**: it opens at step 1 on every fresh load — an email field and a "Send reset code" button, no code field, no query-param entry to step 2. A reader who clicked the link **could not enter the code they held**, and their only forward action would re-issue a code and invalidate it. The body also *instructed* them to "enter it on the password reset page", so the instruction was false against the address it gave.

| Option | Verdict |
|---|---|
| **Remove the link; direct the reader back to the tab that made the request** | ✅ **Chosen.** That tab is already on step 2 with the email pre-filled — verified against `ForgotPasswordForm.tsx`: no `useEffect`, no timer, no remount, no blur handler resets it. The code is six digits, read on one device and typed on another, which is how code-based resets ordinarily work. |
| Make `/forgot-password` accept a query param and open on step 2 | Rejected here — a frontend change **§7 forecloses**. Viable, but it needs a design amendment, not an in-task fix. |
| Link to `/login` instead | Rejected — the same defect at a different address. The reader is not trying to sign in. |

**`buildAttributeVerificationMessage` keeps its `/login` link**, which is correct: no attribute-verification screen exists anywhere in `frontend/` (grep-verified, twice, independently).

⚠️ **Consequences a later task must not trip over:**
- **`tasks.md` T-2's falsifier — *"set the base URL to `*` and to unset — the builder must refuse"* — is now true of one builder of two.** The reset builder does not call `getPublicAppBaseUrl()` at all, so it cannot refuse; its equivalent guarantee is stronger and asserted differently: it renders **identically** under unset / `*` / configured, and emits **zero** URLs.
- **T-4 must not add a reset link back.** If the closed-tab case is ever addressed, it is addressed in frontend copy under a design amendment, not by re-pointing this message.
- **Residual, accepted:** a reader who closed the requesting tab gets no recovery instruction. Strictly smaller than the defect it replaces — that instruction was impossible in *every* case; this one is correct in the ordinary case and silent in the exceptional one. **Carried to T-7's manual check** (design.md §12): read the real message as someone on a different device and confirm it reads sensibly.

## 4. The KMS key — resolving round-1 C-9 rather than repeating it

**The previous enumeration was wrong in a way that would have failed at runtime.** It listed three "grants", one of which (`lambda:InvokeFunction`) is not a KMS permission at all, leaving a closed set in which **nobody could encrypt** — yet Cognito must encrypt the code before invoking us.

Three **separate** policies, on three different resources:

| Policy on | Principal | Permission | Why |
|---|---|---|---|
| **The KMS key** | the deploying principal | `kms:CreateGrant` | Cognito does not hold a static encrypt permission. The principal that creates or updates the pool issues Cognito a **grant** against the key; that grant is what lets Cognito encrypt. |
| **The KMS key** | the function's execution role | `kms:Decrypt` | So the function can read the code. |
| **The function** | `cognito-idp.amazonaws.com` | `lambda:InvokeFunction` | A Lambda **resource policy** — not a KMS grant. |

Sources: [Activating custom sender Lambda triggers](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-custom-sender-triggers.html) — *"The IAM principal that creates or updates your user pool creates a one-time grant against the KMS key that Amazon Cognito uses to encrypt the code. Grant this principal `CreateGrant` permissions"* · [Custom email sender trigger](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-custom-email-sender.html).

The key MUST be **symmetric** (AWS: *"Amazon Cognito uses symmetric keys"*).

---

## 5. Which emails the function handles — resolving round-1 C-6

The trigger is **all-or-nothing**: once set, Cognito routes *every* pool email to this function.

**Verified, not assumed:** `users.service.ts:361-367` sends `AdminUpdateUserAttributesCommand` with a new `email`, and the pool carries `AutoVerifiedAttributes: ["email"]`. So an admin editing a user's address **can** emit `CustomEmailSender_VerifyUserAttribute`. Round-1 C-6 established that raising on it would break that shipped admin feature.

| `triggerSource` | Decision |
|---|---|
| `CustomEmailSender_ForgotPassword` | **Handle** — the purpose of this spec. |
| `CustomEmailSender_VerifyUserAttribute` | **Handle.** Same shape, its own message. Reachable today via the admin user-edit path; raising here would break it. |
| `CustomEmailSender_AdminCreateUser` | **Handle defensively.** `create()` passes `MessageAction: 'SUPPRESS'`, so it should never arrive — but if suppression is ever removed, the invitation must not vanish silently. |
| Everything else (`SignUp`, `Authentication`, `ResendCode`, `AccountTakeOverNotification`) | **Raise, naming the source.** Not reachable in this pool today (no self-signup, MFA off). |

### DD-2 — Raising is the right behaviour for the unreachable set, and this is why

A silent no-op means that the day someone enables MFA, users stop receiving codes and nobody learns why. That is precisely how ATP-71's missing IAM grant survived for months: **nothing complained.** A loud failure surfaces the gap on the day the setting changes, to the person changing it.

---

## 6. Changing the pool safely — resolving round-1 C-5

Activating the trigger requires `UpdateUserPool`, and **CloudFormation composes that call from the template, so any live setting the template omits is reset.**

**Measured 2026-09-22 — and stated with its caveat this time.** Round 1's version of this table was criticised, fairly, for presenting AWS defaults as drift. Only genuine divergences are listed:

| Setting | Live pool | Template | Real divergence? |
|---|---|---|---|
| `EmailConfiguration` | `DEVELOPER` + SES identity | `COGNITO_DEFAULT` | ✅ **Yes** |
| `AccountRecoverySetting` | `verified_email`(1), `verified_phone_number`(2) | absent | ⚠️ **These are AWS's defaults for an omitted property** — listing it as drift overstates. Enumerate it; do not assume it resets. |
| `MfaConfiguration`, `LambdaConfig` | `OFF`, `{}` | absent | ❌ No — absent matches default. |

### DD-3 — The drift audit is a task with an artefact, not an instruction

Round-1 C-5 found "no mechanism"; round 2 found the replacement was still a procedure with no owner. So:

1. **Before:** `aws cognito-idp describe-user-pool --profile IBD-DEV` → commit the full JSON into the spec folder as `pool-before.json`.
2. Decide each setting present there and absent from the template; write the decided values **into** the template.
3. **After:** capture again as `pool-after.json` and commit the diff of the two.
4. **Rehearse on a throwaway pool first** — reinstated from `proposal.md` R-1, which both previous designs dropped.

The artefacts are the gate. A step with no file produced is not auditable.

### DD-4 — `EmailConfiguration` and rollback

The activating deploy also flips `EmailConfiguration` to `COGNITO_DEFAULT`. **With the trigger active this is inert** — Cognito sends nothing itself, so the setting governs nothing.

**But rollback is where round-1 C-5's second half bit, and it is still true:** removing the trigger resumes Cognito's own sending, now on `COGNITO_DEFAULT` — worse than today's SES. Since SES is excluded permanently, **there is no rollback that restores current behaviour.** Rollback means self-service reset degrades to Cognito's shared sender until the trigger is restored.

That is a real limitation and it is stated rather than papered over. It argues for rehearsing (DD-3) rather than relying on being able to undo.

---

## 7. What does not change

- **The frontend.** No component, no copy, no error mapping. Round-1 C-2's dead-branch question does not arise on this path.
- **Cognito's reset semantics** — code-based, existing password valid until the code is used, existing expiry and attempt limits (FR-3).
- **The backend API.** This path never enters NestJS.
- **`PreventUserExistenceErrors`** — a real finding about the *login* path, out of scope here and recorded in `judgment.md` round-1 S-1.

---

## 8. `10-data-auth` needs a toolchain change — resolving round-1 C-11

Verified: `10-data-auth/template.yaml` has **no `Transform: AWS::Serverless-2016-10-31`**, and `infra/scripts/deploy.sh` deploys it from source with **no `sam build`**, deliberately unlike `20-backend`.

Hosting a function with native dependencies therefore requires: the SAM transform, a build method, a dependency-install path, and a `deploy.sh` change. **Budgeted in §9 as its own line** — round 1 found this absent entirely.

---

## 9. Budget

| Metric | Estimate |
|---|---|
| Tasks | **7** |
| LOC | **~400** — function ~110 · its tests ~120 · message templates ~50 · KMS + IAM + pool config ~70 · `10-data-auth` SAM/build wiring + `deploy.sh` ~50 |
| Review rounds | **2 per task. Escalation fires when any single task reaches a 3rd round.** |

**Tasks, named, so the count is reachable from this document** (round-1 C-12 found the previous one was not):
1. The function: decrypt, route, validate, publish · 2. Message templates · 3. KMS key + the three policies of §4 · 4. `10-data-auth` SAM transform + build + `deploy.sh` · 5. Pool `LambdaConfig` + the DD-3 drift audit artefacts · 6. TRD updates (§11) · 7. The manual live check (§12).

⚠️ **NFR-5, in the literal words the requirement demands** (round-1 C-13 found the previous design paraphrased it): **`DEPLOY_INFRA` defaults to `false`**, so `10-data-auth` **does not ship on an ordinary merge**. Nothing in this spec takes effect until someone runs that build deliberately.

---

## 10. Round-1 findings — disposition of all fourteen

| # | Disposition |
|---|---|
| C-1, C-4, C-7 | **Dissolved** — no reply is awaited (`proposal.md` §12.1). |
| C-2 | **Moot** — the frontend does not change. |
| C-3 | **Out of scope** — a login-path finding; recorded, not fixed here. |
| C-5 | **§6 / DD-3** — artefact-producing audit; DD-4 states the rollback limitation honestly. |
| C-6 | **§5** — every source enumerated and decided; `VerifyUserAttribute` handled, verified reachable. |
| C-8 | **DD-1** — runtime secret read by predictable name. |
| C-9 | **§4** — three separate policies on three resources, with the grant mechanism explained and cited. |
| C-10 | **§3 step 3** — recipient validated before publish. |
| C-11 | **§8** — toolchain change named and budgeted. |
| C-12 | **§9** — tasks enumerated. |
| C-13 | **§9** — literal NFR-5 text. |
| C-14 | **DD-1** — the Option B cycle is real; the honest reason is colocation, not impossibility. |

---

## 11. Documentation this spec owes

`docs/trd/trd.md:288` labels the Cognito arrow *"self-service password-reset mail (COGNITO_DEFAULT)"*. It is false today (the pool is on SES) and becomes false differently after this change. Correcting it is a `proposal.md` §14.4 success criterion that **went unscheduled across both previous designs** (`judgment.md` round-1 S-5, round-2 R2-9). It is task 6.

---

## 12. What nothing automated can check

- **The KMS grant chain** — every suite mocks the AWS clients. ATP-71 shipped a missing IAM grant that was invisible for months and live in production.
- **Decryption against the real key** — a mocked decrypt proves the call shape, never that key, grant and ciphertext agree.
- **Delivery** — a mock proves dispatch, never that a human received an email.

**One mandatory manual check covers all three:** request a real reset against DEV from a mailbox you control, receive the mail, use the code, sign in. **Record the result.** ATP-71's identical check found two production defects on two runs, against 1203 green tests.
