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

### DD-2a — T-3 owns the key and the grant-creation statement; T-4 owns the function's own permissions

**A sequencing gap decided 2026-09-23, before T-3 hits it.** §4 lists three policies, but two of them name **the function's execution role**, which does not exist until T-4. T-3 cannot write them.

The split follows the repo's existing convention rather than inventing one: `20-backend`'s `ApiFunction` takes **SAM's auto-created role with a `Policies:` block** — no explicit `Role:`. Mirroring that keeps IAM where the resource is.

| Owner | Policy | Resource |
|---|---|---|
| **T-3** | `kms:CreateGrant` for the deploying principal, conditioned on `kms:EncryptionContext:userpool-id` | the **key policy** |
| **T-3** | the standard account-root IAM-enable statement | the **key policy** |
| **T-4** | `kms:Decrypt`, via the function's `Policies:` block | the **function's role** |
| **T-4** | `lambda:InvokeFunction` for `cognito-idp.amazonaws.com` | the **function's resource policy** |

**The deploying principal is a parameter, not a hardcode.** Today it is `arn:aws:iam::569113802249:user/cognito_csicap` (measured), but a pipeline run may assume a role instead. A template that hardcodes a developer's user ARN silently fails the day CI deploys it.

⚠️ **T-3 therefore cannot fully satisfy NFR-4 alone, and must say so** rather than reporting the requirement closed. Its `Not Done` must name the two policies T-4 owes.

### DD-2b — The grant condition takes the pool id as a **parameter**, not `!Ref UserPool`

**AMENDMENT to DD-2a, 2026-09-23, after T-3's Reviewer found a circular dependency DD-2a's own wording created.** DD-2a said "conditioned on `kms:EncryptionContext:userpool-id`" without saying *how the id is obtained*, and the obvious reading — `!Ref UserPool` — is unimplementable.

**Why it cannot stand.** CloudFormation builds its dependency graph from every `Ref`/`GetAtt` anywhere in a resource body, policy documents included. `!Ref UserPool` in the key policy makes `Key → UserPool`. This spec then mandates two return edges:

| Edge | Owner |
|---|---|
| `UserPool → Key` — T-6's `LambdaConfig.KMSKeyID` | T-6 |
| `UserPool → Function → Key` — T-6's `LambdaArn` plus T-4's `kms:Decrypt` scoped to the key ARN | T-6 + T-4 |

The first is a two-cycle; the second is **independent**, so a T-6 that cleverly avoided `KMSKeyID`'s `Ref` would still deadlock through the function's decrypt policy. **Both are blocked by the `!Ref` alone**, and `KMSKeyID` is not optional to Cognito once `CustomEmailSender` is set.

**Resolutions considered and rejected**, each for a checkable reason:

| | |
|---|---|
| Split the policy into its own resource | **Impossible** — CloudFormation has no `AWS::KMS::KeyPolicy` type; a KMS key policy is settable only inline. |
| Derive the id without a `Ref` | **Impossible** — the pool id carries a service-generated suffix. |
| An alias, so `KMSKeyID` needs no `Ref` | Breaks one edge, leaves the other; `DependsOn` for fresh-stack ordering reinstates it. |
| Drop the condition | Works, and costs less than it appears (the granted principal already holds `kms:*` via the root delegation) — but it weakens defence-in-depth against a future scoped-down CI role, and DD-2a names the condition. |

**Chosen: a `CustomEmailSenderUserPoolId` parameter**, referenced by the condition. It keeps the condition and its exact semantics, and removes the graph edge. ⚠️ **`infra/scripts/deploy.sh` resolves it from this stack's own `UserPoolId` output** using the `resolve_stack_value` helper it already uses for `MailTransport`, so the value cannot drift from the pool it names. That resolution is **T-6's**, alongside the same wiring for the deploying-principal parameter (below).

⚠️ **The context key stays spelled `userpool-id`, verbatim.** Two inherited assumptions remain open for T-7 and must not be quietly "tidied": that spelling, and whether Cognito's grant carries an encryption-context constraint at all — `StringEquals` on a context key matches nothing if it does not, and `CreateGrant` would then be denied.

### DD-2c — Both parameters are wired at deploy time, and until then the defaults are inert

T-3's Reviewer found that `CustomEmailSenderKmsGrantPrincipalArn` **is never passed by any deploy path** — `deploy.sh` step 1 passes only `VpcId` and `DevCidr` — so its Default ships on every deploy including a pipeline's. The parameter's own description argues against hardcoding while, as wired, behaving exactly like a hardcode.

**T-6 adds both to `deploy.sh` step 1's `--parameter-overrides`:** the principal from `aws sts get-caller-identity --query Arn`, and the pool id from the stack's `UserPoolId` output. ⚠️ **Trap to record where someone might add one:** this only holds while `sam deploy` runs **without** `--role-arn`. A CloudFormation service role changes the principal Cognito sees. `deploy.sh` passes none today.

### DD-2d — `EnableKeyRotation` stays off, as a decision

Recorded here rather than left in a completion report, so T-6 does not re-open it. Rotation is safe (KMS retains old backing material; grants and encryption context are unaffected) but near-worthless for codes that live minutes, against a dev stack with an explicitly cost-aware posture. **Set `PendingWindowInDays: 7`** to match this stack's easy-teardown stance (`DeletionProtection: false`) — the 30-day default leaves a billed key behind after a stack delete.

### DD-3a — The function publishes over **AMQP**, connecting per invocation and caching nothing

**Decided 2026-09-23, before T-4, by reading the microservice rather than assuming.** §3 step 5 said "publish" without saying how, and the obvious worry — that a Lambda would need the backend's 786-line transport — turns out not to follow.

**Why not HTTP**, which looked simpler: the microservice does expose `POST api/email/send` (verified in its `app.module.ts`, guarded by a `JwtMiddleware` that validates an `x-api-key` against CLARISA). But its **URL is not in `MailMicroserviceSecret`** — that secret carries `rabbitmqUrl`, `apiKey` and `queueName` only — and the endpoint takes `multipart/form-data` with the HTML as a file part, which a bare Lambda would have to construct by hand or take a dependency for.

**AMQP needs no configuration we do not already hold.**

⚠️ **Connect per invocation. Cache nothing.** The backend's transport is large because it keeps a long-lived connection: a mutex, a liveness probe, a detached teardown, and a sanitized-error hierarchy built because *"amqplib errors routinely carry the full connection string"*. **A function that opens a connection, publishes under a confirm, and closes needs none of that** — and caching across invocations would import the exact freeze hazard this repo already shipped a production fix for (`fix/otp-mail-lambda-freeze`).

The cost is a TLS+AMQP handshake per reset. For a flow that runs a handful of times a month, against a function whose alternative is a connection that can be frozen mid-publish, that is the right trade — and it is what makes **NFR-2 structural here**: nothing is in flight at return because nothing outlives the invocation.

⚠️ **The envelope shape is a contract we do not own.** `buildMicroserviceEnvelope` in `backend/src/mail/microservice-mail.transport.ts` is its only statement in this repo, and DD-1a already ruled the function cannot import from `backend/`. Three wire-format defects are recorded against that shape in `enhancement/email-notification-microservice` — `socketFile`'s name, a composite `from`, a comma-joined `to`. **T-4 must read that builder and mirror it exactly**, and its tests must pin the shape, because nothing else will catch drift.

⚠️ **`id` and `reply_to` must be absent.** That spec's FR-2 records it as deliberate: an `id` without a `reply_to` makes the microservice attempt an RPC reply nothing consumes. `proposal.md` §12.1 dropped the awaited reply, so this stays absent.

### DD-3b — The secret is reached by a **parameterised** name

`MailMicroserviceSecret` is named `!Sub "${AWS::StackName}-mail-microservice-secret"` — and that `AWS::StackName` is **`20-backend`'s**, not this stack's. So the function cannot construct the name from its own context.

**T-4 adds a parameter for the backend stack name** (default `accelerate-tz-dev-backend`, matching `deploy.sh`'s own default), composes the secret name from it, and reads the secret at invocation time. Same shape as DD-2b's pool-id parameter and for the same reason: a cross-stack value that must not be guessed or hardcoded.

### DD-5b — The invoke permission's `SourceArn` is conditional, for the same reason DD-2b exists

**Raised by T-4's Reviewer, decided 2026-09-23 before it blocks T-6.**

`CustomEmailSenderInvokePermission` scoping its `SourceArn` with `!Sub ".../userpool/${UserPool}"` creates the edge `Permission → UserPool`, so CloudFormation always builds the **pool first**. But Cognito validates invoke permission **when `LambdaConfig.CustomEmailSender` is set**, and the standard remedy — `UserPool DependsOn CustomEmailSenderInvokePermission` — would be a **cycle**.

⚠️ **And the failing order is the likely one.** `DEPLOY_INFRA` defaults to `false`, so the first real deploy plausibly carries T-4 and T-6 **together**.

| Option | Verdict |
|---|---|
| Omit `SourceArn` | Works, but widens the grant to any Cognito pool in the account. Rejected — a narrower grant is available. |
| `!Ref CustomEmailSenderUserPoolId` (DD-2b's parameter) | ✅ **Chosen** — the same trick, for the same reason, on the same graph problem. |
| `DependsOn` | **Impossible** — it is the cycle. |

⚠️ **With a `Condition`, because the parameter defaults to empty.** An empty value composes a malformed ARN (`…:userpool/`), so `SourceArn` is set **only when the parameter is non-empty** (`!If [HasCustomEmailSenderUserPoolId, <arn>, !Ref "AWS::NoValue"]`).

That makes the pre-T-6 state an unscoped-but-inert permission on a function no pool invokes yet, and the post-T-6 state correctly scoped — **provided T-6 wires the parameter**, which DD-2c already obliges it to do for two other reasons. T-6 now has three.

## 5. Which emails the function handles — resolving round-1 C-6

The trigger is **all-or-nothing**: once set, Cognito routes *every* pool email to this function.

**Verified, not assumed** — but the verification proved the wrong half of the claim. **⚠️ CORRECTED post-deploy, validation-report.md B-4:** `users.service.ts:363-367` (line drift from the `:361-367` this row previously cited; the method itself is now at `:356`) sends `AdminUpdateUserAttributesCommand` with a new `email`, and the pool carries `AutoVerifiedAttributes: ["email"]` — that reachability was, and remains, correctly established: an admin editing a user's address **does** cause this trigger to fire. What was never independently checked is *which* Cognito `triggerSource` name that mechanism uses. **It is measured live in DEV to be `CustomEmailSender_UpdateUserAttribute`, not `CustomEmailSender_VerifyUserAttribute`.** Round-1 C-6 established that raising on the admin-edit source would break that shipped admin feature — that conclusion still holds, it was just attached to the wrong row.

| `triggerSource` | Decision |
|---|---|
| `CustomEmailSender_ForgotPassword` | **Handle** — the purpose of this spec. |
| `CustomEmailSender_UpdateUserAttribute` | ⚠️ **Handle — corrected post-deploy, see the addendum below.** This, not `VerifyUserAttribute`, is the source `users.service.ts::update()`'s `AdminUpdateUserAttributesCommand` measurably emits against this auto-verified pool. Same shape, same message builder. Raising here would break the admin email-edit path — the risk C-6 named, on the right mechanism, under the wrong name. |
| `CustomEmailSender_VerifyUserAttribute` | **Handle.** Same shape, its own message. **Not reachable today** (corrected — see addendum): AWS fires this only for a user's own explicit attribute-verification request, and no such self-service screen exists in `frontend/`. Kept handled anyway — a correct handler costs nothing, and dropping it would re-open the same silent-loss class the day a self-service flow reaches it. |
| `CustomEmailSender_AdminCreateUser` | ⚠️ **RAISE — corrected 2026-09-23, see below.** *(This row previously said "handle defensively … the invitation must not vanish silently." That premise is false.)* |
| Everything else (`SignUp`, `Authentication`, `ResendCode`, `AccountTakeOverNotification`) | **Raise, naming the source.** Not reachable in this pool today (no self-signup, MFA off). |

### Addendum — the source name was wrong, not the reachability (validation-report.md B-4, found post-deploy)

**What happened:** `proposal.md` §2.3 first named `CustomEmailSender_VerifyUserAttribute` as "the one live edge besides ForgotPassword" for an admin email-attribute change, without citing a measurement — a plausible-sounding guess (the action *is*, informally, "verifying an attribute"), not a checked one. `judgment.md`'s C-6 and this design's §5 then each verified that the *mechanism* — `update()`'s `AdminUpdateUserAttributesCommand` against an auto-verified pool — really does invoke the trigger, and reported that as verifying the *sentence*, which also named a specific `triggerSource` string. **Confirming the mechanism fires is not the same claim as confirming which of AWS's several `CustomEmailSender_*` names it fires under**, and only the first half was ever actually checked by reading code; the second half rode along, unverified, through three documents (`proposal.md` → `judgment.md` → this file) because each reader saw "verified" attached to the row and re-confirmed the mechanism again rather than the name.

**The gap closed by measurement, not further reading:** a throwaway pool user's `email` attribute was changed with `admin-update-user-attributes` against the live DEV pool and CloudWatch was read directly. The trigger fired with `triggerSource=CustomEmailSender_UpdateUserAttribute` — a distinct AWS-defined value from `VerifyUserAttribute`, which per AWS's own trigger-source documentation fires only for a user's own explicit `GetUserAttributeVerificationCode`/`VerifyUserAttribute` request, never for an admin-initiated `AdminUpdateUserAttributes` call.

**Consequence for T-4 (already shipped) and this spec's own C-6 disposition (§10):** the handled set gains `CustomEmailSender_UpdateUserAttribute` (mapped to the same `buildAttributeVerificationMessage` builder `VerifyUserAttribute` already used — same shape, same message), and `VerifyUserAttribute` itself is reclassified from "reachable today" to "not reachable today, kept handled anyway." Before this fix, `CustomEmailSender_UpdateUserAttribute` fell into the unhandled "everything else" set and **raised** — in production, this silently took away the only verification email an admin-initiated address change ever gets, flipping `email_verified` to `false` with no automatic path back.

### DD-5a — `AdminCreateUser` raises. The premise for handling it was wrong, and it was mine.

**Corrected during T-4, after the Implementer flagged that handling it meant sending attribute-verification copy for an invitation.** The copy mismatch was the symptom; the decision was the defect.

§5 originally said to handle it *"so the invitation must not vanish silently."* **The invitation does not vanish.** Verified: `users.service.ts::create()` passes `MessageAction: 'SUPPRESS'` **and dispatches `MailService.sendInvitation` itself** (ATP-71 T-4, shipped). Cognito's `AdminCreateUser` mail is a **duplicate** of one this system already sends by its own hand.

So the two behaviours trade like this:

| | |
|---|---|
| **Handle it** | If suppression is ever removed, the user receives **two invitations** — ours and Cognito's — and the second carries whatever copy the function happens to pass it. Silent, confusing, and discovered by a user. |
| **Raise** | Someone learns, on the day the setting changes, that a decision was reversed. |

**Raise.** It is the same reasoning DD-2 already applies to the unreachable set, and the original row was the one place it was not applied — because I wrote it from "don't lose mail" rather than from what `create()` actually does.

⚠️ **Consequence for T-4:** the `AdminCreateUser` branch and its use of `buildAttributeVerificationMessage` are **deleted**, not re-copied. At the time T-4 shipped, the handled set was `ForgotPassword` and `VerifyUserAttribute`. **⚠️ Corrected post-deploy (validation-report.md B-4, addendum above): the handled set is now exactly three** — `ForgotPassword`, `VerifyUserAttribute`, and `UpdateUserAttribute` (the actual admin-edit source). Everything else raises, naming the source.

### DD-2 — Raising is the right behaviour for the unreachable set, and this is why

A silent no-op means that the day someone enables MFA, users stop receiving codes and nobody learns why. That is precisely how ATP-71's missing IAM grant survived for months: **nothing complained.** A loud failure surfaces the gap on the day the setting changes, to the person changing it.

---

## 6. Changing the pool safely — resolving round-1 C-5

Activating the trigger requires `UpdateUserPool`, and **CloudFormation composes that call from the template, so any live setting the template omits is reset.**

**⚠️ Amended 2026-09-23 (T-5) — the 2026-09-22 four-row table is withdrawn and replaced.** The withdrawn table was measured 2026-09-22 against round-1's criticism (four rows, one genuine divergence) — and it was still incomplete: T-5's live read (`docs/specs/auth/forgot-password-delivery/pool-before.json`, committed) carries **24 top-level `UserPool` keys** (machine-counted from the artefact), of which the withdrawn table accounted for four. The replacement below is exhaustive — walked from `pool-before.json` key by key, not from the withdrawn table, from memory, or from the task brief (KZ-008: a partial enumeration that looks complete is the failure mode). It also introduces a **third class** the original table's binary default/drift split did not have room for: a setting an *earlier, already-shipped* spec decided to remove from the template, still visible live only because no `DEPLOY_INFRA=true` deploy has landed that removal yet. Writing such a setting back into the template would silently reverse a decision this repo already made.

| Setting | Live pool | Template | Class | Why |
|---|---|---|---|---|
| `EmailConfiguration` | `DEVELOPER` + SES identity + branded `From` | `COGNITO_DEFAULT` | **(c) deliberately removed** | `enhancement/email-notification-microservice` design.md §7.1 Phase B: "the `EmailConfiguration` `!If` → unconditional `COGNITO_DEFAULT`." Already the template's value — restoring SES would revert that spec. |
| `AdminCreateUserConfig.InviteMessageTemplate` | branded invite HTML, CTA hardcoded to a CloudFront URL | absent | **(c) deliberately removed** | `auth/account-access-emails` design.md DD-5 / its T-9: "Retire the Cognito `InviteMessageTemplate` and `PortalUrl`." Already omitted — restoring it would revert that spec. |
| `AccountRecoverySetting` | `verified_email`(1), `verified_phone_number`(2) | absent | **(a) AWS default** | `tasks.md` T-5's Disqualifier: "`AccountRecoverySetting`'s live value is also AWS's default." |
| `MfaConfiguration` | `OFF` | absent | **(a) AWS default** | `tasks.md` T-5's Disqualifier: "`MfaConfiguration: OFF` and `LambdaConfig: {}` are what an omitted property already means." |
| `LambdaConfig` | `{}` | absent | **(a) AWS default** | `tasks.md` T-5's Disqualifier: "`MfaConfiguration: OFF` and `LambdaConfig: {}` are what an omitted property already means." T-6 sets this next; setting it in T-5 would activate the trigger early. |
| `Policies.PasswordPolicy.TemporaryPasswordValidityDays` | `7` | absent | **(a) AWS default** | `aws cognito-idp update-user-pool help`: "Defaults to 7." |
| `Policies.SignInPolicy.AllowedFirstAuthFactors` | `["PASSWORD"]` | absent | **(a) AWS default** | No first-factor other than password is used anywhere in this pool (`ExplicitAuthFlows` has no `WEB_AUTHN`/`EMAIL_OTP`/`SMS_OTP`). Not stated as a literal default in the CLI help — reasoned, not quoted. The rehearsal that would have confirmed it empirically did not run (T-5's `Not Done`); no empirical step for this row ran at all. |
| `DeletionProtection` | `INACTIVE` | absent | **(a) AWS default** | AWS's universal opt-in convention for deletion protection, not a CLI-help-quoted default. Matches this stack's existing explicit `DeletionProtection: false  # easy teardown (NFR-6)` posture on `Db`. `CustomEmailSenderKey` (a KMS key) carries no `DeletionProtection` property at all — it uses `PendingWindowInDays` instead, and its own comment attributes the stack's easy-teardown posture to elsewhere in the stack, i.e. to `Db`, not to itself. |
| `SchemaAttributes` | the full standard OIDC attribute set | absent (`Schema` unset) | **(a) AWS default / not applicable** | Confirmed against the CLI help: `Schema` is **not a parameter of `UpdateUserPool` at all** — schema is immutable after pool creation. The "silent reset on omission" risk this whole section exists for cannot apply to it. |
| `UsernameAttributes` | `["email"]` | `["email"]` (matches) | not drift | Also not an `UpdateUserPool` parameter (creation-time only); listed for completeness, not because it is at risk. |
| `EmailVerificationMessage`, `EmailVerificationSubject` | mirror `VerificationMessageTemplate`'s content | absent | **(a) AWS default / inert** | CLI help, both fields, verbatim: "This parameter is no longer used." `VerificationMessageTemplate` (which the template does set, matching live) is the live field. |
| `UserAttributeUpdateSettings.AttributesRequireVerificationBeforeUpdate` | `[]` | absent | **(a) AWS default** | Cognito's default — no attribute requires reverification before update. Not a CLI-help-quoted default. |
| `UserPoolTier` | `ESSENTIALS` | absent | **(a) AWS default** | CLI help, verbatim: "Defaults to ESSENTIALS." |
| `KeyConfiguration.KeyType` | `AWS_OWNED_KEY` | absent | **(a) AWS default** | CLI help, verbatim: "If not specified, Amazon Web Services managed keys are used." |
| `IssuerConfiguration.Type` | `ORIGINAL` | absent | **(a) AWS default** | Paraphrased from the CLI help's description of `ORIGINAL` as the baseline single-region issuer shape (`UPDATED` is the opt-in for multi-region replication, unused here) — not a quoted default statement. |
| `AdminCreateUserConfig.UnusedAccountValidityDays` | `7` | absent | **(a) AWS default / legacy no-op** | CLI help, verbatim: "This parameter is no longer in use... The default value for this parameter is 7," and superseded once `Policies.PasswordPolicy.TemporaryPasswordValidityDays` is in effect (it is, at its own default). |
| `UserPoolTags` | `Project=ACCELERATE-Tanzania` + three `aws:cloudformation:*` tags (four tags total) | absent (no `UserPoolTags:` set in this resource's `Properties:`) | **(a) not this resource's property** | `Project` comes from `infra/samconfig.toml`'s stack-level `tags`, propagated by CloudFormation to every taggable resource across all three stacks; the `aws:cloudformation:*` tags are CFN-injected automatically. `UserPoolTags` is a real property of `AWS::Cognito::UserPool` — this resource simply does not set it, so neither the `Project` tag nor the CFN-injected tags are affected by anything this resource's `Properties:` block does or omits. |
| `Id`, `Arn`, `CreationDate`, `LastModifiedDate`, `EstimatedNumberOfUsers` | — | — | **not applicable** | Read-only pool metadata; not settable via `Create`/`UpdateUserPool`, so "present live, absent from template" does not apply. |
| `Name` | `accelerate-tz-dev-data-auth-users` | `!Sub "${AWS::StackName}-users"` → same string | matches | Not drift. |
| `AutoVerifiedAttributes` | `["email"]` | `["email"]` (matches) | matches | Not drift. |
| `AdminCreateUserConfig.AllowAdminCreateUserOnly` | `true` | `true` (matches) | matches | Not drift. |
| `VerificationMessageTemplate` | branded reset-code HTML | identical branded HTML | matches | Not drift. |

**Net result: zero (b) real drift.** Every present-live/absent-from-template setting is either (a) or (c), and both mean "leave the template as it is" — for opposite reasons. T-5 therefore wrote **no new property** into `UserPool`; the decision itself (including the "nothing to change" rows) is recorded as a comment block directly above the resource in `infra/10-data-auth/template.yaml`, so a future reader sees the classification rather than an unexplained absence.

⚠️ **A concern raised by T-5's audit and since REFUTED by measurement — recorded because the refutation is the useful part.** `aws cognito-idp update-user-pool help` states `VerificationMessageTemplate`'s `EmailMessage`/`EmailSubject` are *"allowed only if the value of `EmailSendingAccount` is `DEVELOPER`."* This resource sets `EmailConfiguration.EmailSendingAccount: COGNITO_DEFAULT` **and** a branded `VerificationMessageTemplate.EmailMessage`/`EmailSubject` together — content that predates this spec (already live in the 2026-07-17 pool; **not** this spec's T-4, which is the function and touched no pool property). On documentation alone that combination looked likely to be rejected on T-6's first real `UpdateUserPool`, against a pool holding live accounts. **Measured 2026-09-24 and it is accepted, two independent ways:** T-5's rehearsal created *and* updated a pool carrying both, through CloudFormation, to `CREATE_COMPLETE`/`UPDATE_COMPLETE` with the template intact; and a direct `cognito-idp create-user-pool` with both set returned a pool whose `EmailMessage`/`EmailSubject` survived verbatim. **On `UpdateUserPool` — the very API the quoted text governs, reached the way T-6 reaches it — the documented constraint is not enforced.** T-6 is not blocked on this. Two honest limits on that sentence: the direct check used `create-user-pool`, a *different* API, so it guards against operator error rather than re-testing the same rule; and the quote also covered `InviteMessageTemplate`, whose violating direction was never exercised. ⚠️ The general lesson is worth more than the specific answer: *the CLI help is a claim about AWS, not a measurement of it* — this spec cites it as the authority for **seven** of §6's rows — while three others explicitly record that it does *not* support them, which is the distinction that mattered and the one a blanket count would have hidden.

### DD-3 — The drift audit is a task with an artefact, not an instruction

Round-1 C-5 found "no mechanism"; round 2 found the replacement was still a procedure with no owner. So:

1. **Before:** `aws cognito-idp describe-user-pool --profile IBD-DEV` → commit the full JSON into the spec folder as `pool-before.json`.
2. Decide each setting present there and absent from the template; write the decided values **into** the template.
3. **After:** capture again as `pool-after.json` and commit the diff of the two.
4. **Rehearse on a throwaway pool first** — reinstated from `proposal.md` R-1, which both previous designs dropped.

The artefacts are the gate. A step with no file produced is not auditable.

⚠️ **Step 4 — attempted 2026-09-23 and blocked; PERFORMED 2026-09-24. This paragraph records both, because the block is a finding in its own right.** First attempt: the deploying principal (`cognito_csicap`) got `AccessDenied` on both `cloudformation:CreateChangeSet` and `cloudformation:CreateStack`, for every stack name tried — a hard IAM boundary, not a judgment call. No stack was created. The weaker CLI-only rehearsal was **deliberately not substituted**: it does not exercise CloudFormation's `UpdateUserPool` composition, which is the whole risk being measured, so it would have produced a green result that measured nothing. A scoped grant (CloudFormation on `accelerate-tz-dev-rehearsal-*` only) was requested and granted, and the rehearsal ran on 2026-09-24 as `accelerate-tz-dev-rehearsal-t5`: pool deployed → live drift applied out-of-band and **verified landed** → template redeployed → full before/after diff → stack deleted. **Result: CloudFormation reset exactly the two (c)-class settings §6 predicted (`EmailConfiguration`, `AdminCreateUserConfig.InviteMessageTemplate`) and nothing else.** ⚠️ **Read that precisely: it measures the MECHANISM, not the (a) classification.** The rehearsal pool was built from this same template, so every omitted property already sat at the AWS default *by construction*, and only the two (c) settings were ever drifted away from it — so the (a) rows could not have done anything but survive, and their surviving discriminates nothing. **The two (c) resets are measured; the twenty-two (a) rows remain reasoned.** What would measure them: drift an (a) property away from its default (say `MfaConfiguration: ON`) and see whether a template-composed update resets it. Not done, and named here rather than left implied. Full evidence in `execution.md`'s T-5 entry. ⚠️ **And one thing nobody predicted:** redeploying an *unchanged* template returns `No updates are to be performed` — CloudFormation diffs template text, not live state, so the reset does not fire until a property actually changes. **T-6's `LambdaConfig` addition is the change that fires it.**

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
| C-1, C-4 | **Dissolved** — no reply is awaited (`proposal.md` §12.1). Remove the reply and neither finding has a subject left. |
| **C-7** | ⚠️ **HALF-dissolved — corrected 2026-09-23, this row previously claimed the same full dissolution.** C-7 had three components. Only one is closed. |
| C-2 | **Moot** — the frontend does not change. |
| C-3 | **Out of scope** — a login-path finding; recorded, not fixed here. |
| C-5 | **§6 / DD-3** — artefact-producing audit; DD-4 states the rollback limitation honestly. |
| C-6 | **§5** — every source enumerated and decided; the admin-edit source handled. ⚠️ **Corrected post-deploy (validation-report.md B-4):** the row originally read "`VerifyUserAttribute` handled, verified reachable" — reachability of the admin-edit *mechanism* was genuinely verified; the `triggerSource` *name* attached to it was not, and was wrong. The admin-edit source is `UpdateUserAttribute`; `VerifyUserAttribute` is handled but not reachable today. |
| C-8 | **DD-1** — runtime secret read by predictable name. |
| C-9 | **§4** — three separate policies on three resources, with the grant mechanism explained and cited. |
| C-10 | **§3 step 3** — recipient validated before publish. |
| C-11 | **§8** — toolchain change named and budgeted. |
| C-12 | **§9** — tasks enumerated. |
| C-13 | **§9** — literal NFR-5 text. |
| C-14 | **DD-1** — the Option B cycle is real; the honest reason is colocation, not impossibility. |

### C-7, honestly — the correction T-4's review forced

I disposed of C-7 alongside C-1 and C-4 with one line: *"Dissolved — no reply is awaited."* For those two that is complete. **For C-7 it is not**, and T-4's Implementer spotted it before its Reviewer confirmed it.

C-7 had **three** components:

| Component | Status |
|---|---|
| The awaited round trip must fit a budget | ✅ **Dissolved** — nothing downstream is awaited. |
| **Cognito enforces a non-configurable ceiling on the trigger invocation itself** | ❌ **OPEN.** Not a property of the reply. Removing the reply removed the largest *consumer* of the budget; it did not remove the limit, nor establish that this function fits under it. |
| **Cognito retries a timed-out invocation → duplicate codes** | ❌ **OPEN.** `publishEnvelope` correctly forecloses the function's *own* retry; Cognito's is outside the function and is exactly what C-7 described. |

⚠️ **The function's own `Timeout: 15` is irrelevant to this.** A Cognito ceiling below it means Cognito abandons the invocation while the Lambda is still running — and DD-3a's deliberate *"connect per invocation, cache nothing"* makes the cold path longer on purpose: KMS decrypt, then a Secrets Manager round trip, then a fresh TLS/AMQP handshake, then an **awaited** close, all serial.

That is the right trade for NFR-2 and it stands. But it means the open half of C-7 is **the** thing to watch.

**Nothing in this repository can close it** — every AWS client is mocked. It goes to **T-7**, whose instructions now carry one more question: watch for a **timed-out trigger** and for a **duplicate** reset email, not only for a delivered one.

*(NFR-6's latency budget, C-7's third strand, is separately and correctly disposed of in `tasks.md` §5 as a declared `(B)` — not applicable once no reply is awaited.)*

---

## 11. Documentation this spec owes

`docs/trd/trd.md:288` labels the Cognito arrow *"self-service password-reset mail (COGNITO_DEFAULT)"*. It is false today (the pool is on SES) and becomes false differently after this change. Correcting it is a `proposal.md` §14.4 success criterion that **went unscheduled across both previous designs** (`judgment.md` round-1 S-5, round-2 R2-9). It is task 6.

---

## 12. What nothing automated can check

- **The KMS grant chain** — every suite mocks the AWS clients. ATP-71 shipped a missing IAM grant that was invisible for months and live in production.
- **Decryption against the real key** — a mocked decrypt proves the call shape, never that key, grant and ciphertext agree.
- **Delivery** — a mock proves dispatch, never that a human received an email.

**One mandatory manual check covers all three:** request a real reset against DEV from a mailbox you control, receive the mail, use the code, sign in. **Record the result.** ATP-71's identical check found two production defects on two runs, against 1203 green tests.
