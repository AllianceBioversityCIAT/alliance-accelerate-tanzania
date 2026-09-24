# Tasks — Forgot-password delivery via a Cognito custom sender

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/auth/forgot-password-delivery` |
| Scope | **Path 1 only** — Cognito keeps the reset state machine; only delivery moves (`proposal.md` §12.1) |
| Budget | **7 tasks · ~400 LOC · 2 review rounds per task.** `/akili-execute` **escalates to the user when any single task reaches a 3rd round** rather than continuing. |
| Requirements | `requirements.md` FR-1…FR-5 (FR-6 struck), NFR-1…NFR-6 |
| Design | `design.md` |

> ⚠️ **`DEPLOY_INFRA` defaults to `false`**, so `10-data-auth` **does not ship on an ordinary merge**. Nothing in this spec takes effect until an operator runs that build deliberately. Every task below changes the repository; **T-6 is the only one that changes the deployed pool**, and T-7 is the only evidence that any of it works.

---

## 2. Rules every task inherits

- **Every gate must be demonstrated capable of failing.** Paste the red output, restore, paste the green. A gate not shown to fail is not a gate.
- **A presence-assertion is not a behavioural proof.** Asserting a class name, a config key or a mocked call proves presence; say what it cannot prove and name what would.
- **NFR-1 is absolute.** The decrypted code and the recipient address must never reach a log, an error payload, or CloudWatch — by the function or anything it calls.
- **Report `Not Done / Assumptions` completely.** An omission declared is recoverable; an omission hidden is not.

---

## 3. ⚠️ Before this spec is called done — the check no suite replaces

Request a real password reset against **DEV**, from a mailbox you control. Confirm the email **arrives**, that the code in it **works**, and that you can sign in with the new password. **Record the result in `execution.md`.**

Three defect classes in this spec have **no automated gate whatsoever** — the KMS grant chain, decryption against the real key, and delivery — because every suite mocks the AWS clients. ATP-71's identical check found **two live production defects on two separate runs**, against 1203 green tests. Treat a green suite as evidence the code does what it was written to do, never as evidence that a human received an email.

---

## 4. Tasks

- [x] **T-1** `10-data-auth` gains a SAM toolchain  (deps: none)
      Scope: add `Transform: AWS::Serverless-2016-10-31`, a build method, and a dependency-install path to `infra/10-data-auth/template.yaml`; update `infra/scripts/deploy.sh` so that stack is built before deploy, as `20-backend` already is.
      Traces: design.md §8 (round-1 C-11)
      Files: `infra/10-data-auth/template.yaml`, `infra/scripts/deploy.sh`, `infra/scripts/validate.sh`
      Skills: `aws-serverless`
      Verify: `./infra/scripts/validate.sh`
      Falsifier: **it must fail before it passes.** Add a trivial `AWS::Serverless::Function` stub and run `validate.sh` **without** the transform — it must reject the template. Then add the transform and watch it pass. If it validates either way, `validate.sh` is not reading what you think.
      Disqualifier: a green `validate.sh` says the template is **well-formed**, never that a function would build or run. It makes no AWS call and creates nothing.
      Done when: the stack accepts a function, `validate.sh` is green across all three stacks, and `deploy.sh` builds `10-data-auth` before deploying it.

- [x] **T-2** The two message bodies  (deps: none)
      Scope: a reset-code message and an attribute-verification message, following the layout convention in `backend/src/mail/templates/`. Both derive any link from configuration.
      Traces: FR-1 (`AND IT MUST` derive the link from `PUBLIC_APP_BASE_URL`; `BUT it must NOT` contain a password), NFR-3; design.md §3 step 4, §5
      Files: `infra/10-data-auth/functions/custom-email-sender/` — **T-2 creates this package** (`package.json`, a test runner, the message module, its specs). Plain JavaScript ESM, per design.md DD-1b. T-4 adds the handler and the SAM resource.
      Skills: `cognitive-doc-design`
      Verify: `npx jest <the new specs> --silent`
      Falsifier: set the base URL to `*` and to unset — the builder must **refuse**, not emit a link containing them. ⚠️ *(Now true of the **verification** builder only. DD-1c removed the reset message's link entirely after a Reviewer FAIL — the reset builder does not call `getPublicAppBaseUrl()` at all, so its equivalent guarantee is stronger and asserted differently: it renders identically under unset / `*` / configured, and emits zero URLs.)* Sweep every URL the message can emit; a test that checks only the first one passes while a second is hardcoded.
      Disqualifier: asserting the string `https://` appears proves a link is present, **not** that it is the configured one. Assert the **derived host**, and assert that no other host appears anywhere in either part.
      Done when: both bodies render, neither can emit a hardcoded host, and neither ever contains a password.

- [x] **T-3** The KMS key and its three policies  (deps: T-1)
      Scope: a customer-managed **symmetric** key in `10-data-auth`, plus `kms:CreateGrant` for the deploying principal on the **key policy**. ⚠️ *(Narrowed by design.md **DD-2a**: `kms:Decrypt` and `lambda:InvokeFunction` name the function's execution role, which does not exist until T-4, so **T-4 owns both** and **T-3 cannot close NFR-4**. The grant condition takes the pool id as a **parameter**, not `!Ref UserPool` — see **DD-2b**, which exists because the `!Ref` created a circular dependency that would have blocked T-6.)*
      Traces: NFR-4 (incl. round-1 **C-9**); design.md §4
      Files: `infra/10-data-auth/template.yaml`
      Skills: `aws-serverless`
      Verify: `./infra/scripts/validate.sh`
      Falsifier: **none exists, and that is the finding.** No test in this repository exercises IAM — every suite mocks the AWS clients. ⚠️ This is the exact class that shipped ATP-71's missing `AdminSetUserPassword` grant, live and invisible for months. **The only gate is T-7.**
      Disqualifier: ⚠️ **Do not restate NFR-4's list and call it done.** Round-1 C-9 found the previous enumeration listed `lambda:InvokeFunction` among three *KMS* grants, leaving a closed set in which **nobody could encrypt** — which Cognito must. State each policy against its own resource and cite AWS for the grant mechanism.
      Done when: the key is symmetric, the three policies sit on their correct resources, and the Cognito-cannot-encrypt-without-a-grant mechanism is written down where the next reader will find it.

- [x] **T-4** The function  (deps: T-2, T-3)
      Scope: decrypt the code · route by `triggerSource` per design.md §5 · **validate the recipient before publishing** · build · publish · return. No reply awaited.
      Traces: FR-1 (both scenarios, incl. `BUT it must NOT` substitute another identifier), FR-2 (all clauses), FR-4 (both scenarios), NFR-1, NFR-2; design.md §3, §5, DD-1, DD-2
      Files: the function module (+ specs)
      Skills: `aws-serverless`, `nestjs-expert` *(for the template/message conventions only — this is not a Nest app)*
      Verify: `npx jest <the function's specs> --silent`
      Falsifier — **three, each shown red**:
        1. Make the recipient validation accept anything, then feed it a UUID → a test must redden. *(This is ATP-71's 2026-09-22 production defect approached from the other side; it must not be re-introduced.)*
        2. Feed an unhandled `triggerSource` → the function must raise **and** the raise must name the source. Make it return normally instead → a test must redden.
        3. Feed a handled source whose event carries no email attribute → it must refuse to publish. Make it publish anyway → a test must redden.
      Disqualifier: ⚠️ **Mocking the decrypt proves the call shape, never that key, grant and ciphertext agree.** A green suite here is compatible with a function that cannot decrypt a single real code. Say so in the report; T-7 is the only thing that closes it.
      Done when: the three falsifiers redden and restore, nothing the function logs contains the address or the code, and a `Not Done` names any `triggerSource` left unhandled.

- [x] **T-5** Pool drift audit — artefacts, not a procedure  (deps: none; must complete before T-6)
      Scope: capture the live pool configuration, decide every setting present there and absent from the template, write the decided values **into** the template, and rehearse the change against a **throwaway pool** first.
      Traces: FR-5 (all clauses, incl. `AND IT MUST` verify by comparing the complete before/after); design.md §6, DD-3
      Files: `infra/10-data-auth/template.yaml`, `docs/specs/auth/forgot-password-delivery/pool-before.json`
      Skills: `aws-serverless`
      Verify: `aws cognito-idp describe-user-pool --user-pool-id <pool> --profile IBD-DEV` → committed as `pool-before.json`
      Falsifier: **the artefact is the gate.** A step that produces no file is not auditable — round-1 C-5 found "no mechanism", and round 2 found its replacement was still an instruction. If `pool-before.json` is not committed, this task is not done regardless of what the report says.
      Disqualifier: ⚠️ **Do not list AWS defaults as drift.** `MfaConfiguration: OFF` and `LambdaConfig: {}` are what an omitted property already means; `AccountRecoverySetting`'s live value is also AWS's default. Round 2 rejected a table that presented four rows of which only one was a real divergence. Mark each row **default** or **divergent**, and justify the label.
      Done when: `pool-before.json` is committed, every divergent setting is decided in writing, the template carries the decided values, and the throwaway-pool rehearsal is recorded.

- [ ] **T-6** Activate the trigger  (deps: T-4, T-5)
      Scope: set `LambdaConfig` (`CustomEmailSender` + `KMSKeyID`, `LambdaVersion: V1_0`) on the pool via `10-data-auth`.
      Traces: FR-5; design.md §6, DD-4
      Files: `infra/10-data-auth/template.yaml`, `docs/specs/auth/forgot-password-delivery/pool-after.json`
      Skills: `aws-serverless`
      Verify: `./infra/scripts/validate.sh` · after the deploy, capture `pool-after.json` and commit the diff against `pool-before.json`
      Falsifier: the before/after diff **is** the falsifier — it must show the `LambdaConfig` addition **and nothing else unintended**. A diff showing an unexpected setting change is a FAIL, not a note.
      Disqualifier: ⚠️ **This task changes the repository, not the deployed pool**, until a `DEPLOY_INFRA=true` build runs — and `DEPLOY_INFRA` **defaults to `false`**. A green `validate.sh` says the template is well-formed, **never** that the trigger is live. ⚠️ Record also that **rollback does not restore current behaviour**: with SES excluded permanently, removing the trigger lands on `COGNITO_DEFAULT`, not on today's SES (design.md DD-4).
      Done when: the template carries the trigger, the diff is clean, and the not-yet-live status is written in `execution.md` rather than implied by an `[x]`.

- [ ] **T-7** Prove it against DEV, and correct the record  (deps: T-6 deployed)
      Scope: the §3 manual check, **plus** correcting `docs/trd/trd.md:288`, whose C4 arrow reads *"self-service password-reset mail (COGNITO_DEFAULT)"* — false today and false differently after this change.
      Traces: FR-1, FR-3, FR-4; `proposal.md` §14.4 criterion 4
      Files: `docs/trd/trd.md`, `docs/specs/auth/forgot-password-delivery/execution.md`
      Skills: `software-architect`, `cognitive-doc-design`
      Verify: the manual check of §3, performed against DEV and **recorded**
      ⚠️ **Three additional questions, added during execution, that only this task can answer:**
        · Does the trigger ever **time out**? Cognito enforces a ceiling independent of the function's own `Timeout` (design.md §10's C-7 correction), and DD-3a's connect-per-invocation makes the cold path deliberately longer.
        · Did the user receive **more than one** code? Cognito retries a timed-out invocation — the function forecloses its own retry, not Cognito's.
        · Read the message **as someone on a different device** from the one that made the request (DD-1c's accepted residual: a reader who closed the requesting tab gets no recovery instruction).
      Falsifier: ⚠️ **there is no automated one, and that is the point.** This task exists because three defect classes in this spec — the KMS grant chain, real decryption, and delivery — are invisible to every suite here.
      Disqualifier: **a green test suite is not evidence a human received an email.** If the check cannot be performed, record it as an **unperformed gate**, explicitly — silence is indistinguishable from performed-and-passed, and ATP-71's D-6 entry exists because that distinction was nearly lost.
      Done when: the result is recorded with what arrived, whether it went to spam, and whether the link and code worked; and `trd.md:288` is true.

---

## 5. Coverage — every clause, and who owns it

| Requirement · clause | Owner |
|---|---|
| FR-1 — delivered through the microservice | T-4 |
| FR-1 `AND IT MUST` — link from `PUBLIC_APP_BASE_URL` | T-2 |
| FR-1 `BUT it must NOT` — no password in the body | T-2 |
| FR-1 s2 — recipient undeterminable → fail loudly | T-4 (falsifier 3) |
| FR-1 s2 `BUT it must NOT` — never substitute another identifier | T-4 (falsifier 1) |
| FR-2 — unrecognised source raises | T-4 (falsifier 2) |
| FR-2 `AND IT MUST` — names the source | T-4 (falsifier 2) |
| FR-2 `BUT it must NOT` — never swallow | T-4 (falsifier 2) |
| FR-3 — reset stays code-based | **(A) Satisfied by not changing it.** Cognito keeps the whole state machine; this spec touches only delivery. Verified by T-7's end-to-end check, which exercises the real code path. |
| FR-3 `BUT it must NOT` — a request alone cannot invalidate the password | **(A) Same.** Cognito's behaviour, unmodified. |
| FR-4 — publish and return | T-4 |
| FR-4 `BUT it must NOT` — no copy claims delivery | T-2 |
| FR-4 s2 — transport rejection fails visibly | T-4 |
| FR-5 — full config read, composed from it | T-5 |
| FR-5 `AND IT MUST` — before/after comparison | T-5 + T-6 (the two artefacts) |
| FR-5 `BUT it must NOT` — not by hand | T-6 (goes through `10-data-auth`) |
| FR-5 — reversible | ⚠️ **(B) NOT SATISFIABLE.** design.md DD-4: with SES excluded permanently, no rollback restores current behaviour. Recorded as an accepted limitation, not as coverage. |
| NFR-1 — code and address never logged | T-4 |
| NFR-2 — work completes before return | T-4 (no reply awaited; nothing in flight at return) |
| NFR-3 — links from configuration | T-2 |
| NFR-4 — KMS key and the three policies | T-3 |
| NFR-5 — `DEPLOY_INFRA` defaults to `false`, stated | §1 and T-6's disqualifier, in those words |
| NFR-6 — latency budget | ⚠️ **(B) Not applicable under this design.** The budget existed to bound an awaited reply, which `proposal.md` §12.1 removed. The function publishes and returns; no user-visible wait is introduced. Recorded rather than silently dropped. |

**(A)** = closed by unchanged existing behaviour · **(B)** = declared gap, not coverage.
