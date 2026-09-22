# Tasks — Account-access emails that actually arrive (Phase 1)

## Document Control

| Field | Value |
|---|---|
| Spec path | `auth/account-access-emails` |
| Jira | **ATP-71** |
| Scope | **Phase 1 only** — invitation + admin-initiated reset. `/forgot-password` (FR-6, NFR-5) is Phase 2 and is **deliberately not decomposed here**; see §4. |
| Design | [`design.md`](./design.md) — approved by judgment day, `judgment.md` |
| Budget | 9 tasks · ~640 LOC · 2 review rounds. `/akili-execute` escalates on exceeding this rather than continuing. |
| Branch | `feat/atp-71-account-access-emails` |

## 1. Dependency Graph

```
T-1 invitation template ─┐
T-2 reset template ──────┼─► T-3 MailService + sub helper ─┬─► T-4 create()  ─┐
                         │                                  └─► T-5 reset()  ─┼─► T-6 response contract ─► T-7 UI
                         │                                                     │
                         └─────────────────────────────────────────────────────┴─► T-8 handler e2e

T-9 retire Cognito template + docs sweep   (independent — may run at any point)
```

No cycles. T-9 shares no file with any other task.

## 2. Testing & Verification Expectations

Beyond each task's own `Verify`:

- **Every gate must be shown to fail.** Run the named mutation, watch it redden, revert. A gate that cannot fail is not a gate (**KZ-002**, ×8 on this project).
- **Confirm the mutation actually applied.** A `replace` that matches nothing produces a green run indistinguishable from a passing falsifier. Assert the edit landed before trusting the red.
- **Sweep every clause the task owns** — for each, either (A) the mutation that reddens a *named* test, or (B) a declared unevaluable gap with its structural reason. *"Structurally covered"* counts only as (B) (**KZ-013**).
- **A presence-assertion is not a behavioural proof** (**KZ-002**). Asserting `MailService.sendInvitation` was *called* proves dispatch, never delivery. **D-6 in `requirements.md` §9 has no automated gate at all** — it is discharged by the manual inbox check in §3, not by any task below.

## 3. ⚠️ The one check no task can perform

**D-6 — the message dispatches but never arrives.** Every test below can be green while no email reaches a human.

**Before this spec is called done, at the HITL pause:** create a real user against DEV, open the recipient's mailbox, confirm the email arrived, and follow its link through to a successful sign-in. Record the result. **No green suite substitutes for this**, and no task below claims to cover it.

## 4. ⚠️ Not decomposed here, and why

FR-6 (`/forgot-password`) and NFR-5 are **Phase 2**. They are absent from this file deliberately: DD-6 forbids designing on an unverified premise, and FR-6's premise — that a `CustomEmailSender` trigger can intercept ForgotPassword and decrypt the code — is explicitly unverified. Writing its tasks now would be the exact failure DD-6 exists to prevent.

Phase 2 opens with the DD-6 verification spike and becomes its own spec. **The commitment is not dropped; only its breakdown is deferred to where it can be made honestly.**

## 5. Tasks

- [x] **T-1** Add the invitation email template  (deps: none)
      Scope: `invitation.template.ts` — subject, plain-text part, HTML via `renderEmailHtml` with the §5.1 block list. Link resolved **per call** from `getPublicAppBaseUrl()`, never at module load.
      Traces: FR-1 (scenario 1: the temp-password `AND`, the link `AND`, the no-hardcoded-host `BUT`), NFR-3, NFR-4; design.md §5.1
      Files: `backend/src/mail/templates/invitation.template.ts` (+ `.spec.ts`)
      Skills: `nestjs-expert`
      Verify: `cd backend && npx jest src/mail/templates/invitation.template.spec.ts --silent`
      Falsifier (must be run and seen to redden): hardcode a host in the link — the no-hardcoded-host test must fail. Then unset `PUBLIC_APP_BASE_URL` — the refusal test must fail if the resolution was moved to module load.
      Disqualifier: the refusal tests must FAIL when resolution is moved to module load. *(Corrected during T-1 execution — this originally read "if the suite passes with `PUBLIC_APP_BASE_URL` unset, the resolution is at module load", which describes a state that cannot occur: with the variable unset, a module-load resolution throws at import and the suite fails to run rather than passing. The Reviewer caught the Leader's task text, not the diff — KZ-011's exact shape.)*
      Done when: the spec mirrors `receipt.template.spec.ts` — derived link in **both** parts, trailing-slash normalisation, refusal on `*`/absent/non-http, and a guard that no hardcoded host appears.

- [x] **T-2** Add the admin-reset email template  (deps: none)
      Scope: `admin-reset.template.ts`, same construction as T-1.
      Traces: FR-5 (the dispatch `THEN`), NFR-3, NFR-4; design.md §5.1
      Files: `backend/src/mail/templates/admin-reset.template.ts` (+ `.spec.ts`)
      Skills: `nestjs-expert`
      Verify: `cd backend && npx jest src/mail/templates/admin-reset.template.spec.ts --silent`
      Falsifier: as T-1.
      Disqualifier: as T-1 (see the correction recorded there — the original wording described an impossible state).
      Done when: same criteria as T-1, and the copy is distinguishable from the invitation (a reset is not a welcome).

- [x] **T-3** Add `sendInvitation` / `sendAdminReset` and the `sub` resolution helper  (deps: T-1, T-2)
      Scope: two `MailService` methods beside `sendApproval`, each handing to the private `dispatch(kind, message)`. Plus a small helper that extracts `sub` from a Cognito attribute list and **returns undefined when absent**.
      Traces: FR-1, FR-5, **NFR-1**; design.md §5.2 (DD-3 as corrected by J-4)
      Files: `backend/src/mail/mail.service.ts` (+ `.spec.ts`) · `backend/src/users/cognito-sub.util.ts` (+ `.spec.ts`)
      *(Helper relocated from `mail/` to `users/` during execution — its only consumers are `create()` and `resetPassword()`, `users/temp-password.util.ts` already sets the util pattern there, and placing a Cognito-attribute concern in `mail/` would create a `users → mail` dependency for it. See execution.md.)*
      Skills: `nestjs-expert`
      Verify: `cd backend && npx jest src/mail src/users --silent`
      Falsifier: make the helper fall back to the `Username`/`id` when `sub` is absent — the NFR-1 test asserting no `@` appears in any logged string must redden.
      Disqualifier: a test that only checks the helper's return value proves nothing about NFR-1. The assertion must be over **what `dispatch` logged**, captured from the logger, not over the helper in isolation.
      Done when: logged strings contain neither the password nor the body nor any `@`; `sub` is the reference when resolvable; **`undefined` — never `id` — when not** (J-4's fallback rule, the thing that actually protects NFR-1).

- [x] **T-4** Dispatch the invitation from `UsersService.create()`  (deps: T-3)
      Scope: resolve `sub` from `AdminCreateUserResponse.User.Attributes`; dispatch **last, after the optional `AdminAddUserToGroup`**; awaited inside its own `try`/`catch` that swallows and logs; return `emailSent`.
      Traces: FR-1, FR-3 (both scenarios), **FR-4 (all four clauses, incl. the `BUT NOT 5xx` and the `AND IT MUST NOT leave a Cognito user the API reports as not created`)**, NFR-2; design.md §5.3
      Files: `backend/src/users/users.service.ts` (+ `.spec.ts`)
      Skills: `nestjs-expert`, `error-handling-patterns`
      Verify: `cd backend && npx jest src/users --silent`
      Falsifier: (a) move the dispatch **between** the two Cognito calls and make `AdminAddUserToGroup` reject — the FR-4 boundary test must redden, because the request now errors after a credential was emailed. (b) Remove the `try`/`catch` — the rejecting-transport test must redden.
      Disqualifier: a rejecting-transport test that asserts only `emailSent === false` does **not** cover FR-4. It must also assert the user was created, the password returned, and the status is 2xx. Assert all four or the clause is uncovered.
      Done when: a rejecting transport yields a 2xx carrying the user, the password, and `emailSent: false`; the failure is logged; ordering is dispatch-last and a test pins it.

- [x] **T-5** Dispatch the reset from `UsersService.resetPassword()`  (deps: T-3)
      Scope: resolve `sub` via `AdminGetUser` (already imported by `get()`); dispatch under the same rules as T-4; return `emailSent`.
      Traces: FR-5 (all clauses incl. `AND IT MUST` require a password change at next sign-in), FR-3, FR-4, NFR-1, NFR-2; design.md §5.2, §5.3
      Files: `backend/src/users/users.service.ts` (+ `.spec.ts`)
      Skills: `nestjs-expert`
      Verify: `cd backend && npx jest src/users --silent`
      Falsifier: pass the method's `id` argument as the reference — the NFR-1 no-`@`-in-logs assertion must redden. **This is the single most important falsifier in the spec**: `id` *is* the email, and it is sitting right there in scope.
      Disqualifier: if the `AdminGetUser` call is mocked to always return a `sub`, the absent-`sub` path is untested. Both branches must be exercised.
      Done when: `Permanent: false` is unchanged (the account still requires a change at next sign-in, pinned by a test); `sub` resolves through `AdminGetUser`; the absent-`sub` path passes no reference and never the `id`.

- [ ] **T-6** Extend the response contract with `emailSent`  (deps: T-4, T-5)
      Scope: `CreateUserResult` / `ResetPasswordResult`, the controller responses on `@Post()` and **`@Post(':id/password')`** — the real route, not `/reset-password` (J-1) — and the frontend API types.
      Traces: FR-3; design.md §4
      Files: `backend/src/users/users.service.ts`, `backend/src/users/users.controller.ts`, `frontend/lib/api/users.ts`, `docs/trd/trd.md` (+ tests)
      Also: update `docs/trd/trd.md` §4 for the new response shape — **moved here from T-9 during execution**, because the field must exist before a baseline document asserts it.
      Skills: `api-design-principles`, `nestjs-expert`
      Verify: `cd backend && npx jest src/users --silent && npm run build` · `cd frontend && npx tsc --noEmit`
      Falsifier: drop `emailSent` from one of the two interfaces — `tsc --noEmit` must fail at the consuming call site. If it does not, the frontend is not actually typed against this contract and the gate is blind.
      Disqualifier: a green `tsc` proves the types line up, **not** that the field carries a true value. That is T-4/T-5's job; do not read it as coverage of FR-3.
      Done when: both endpoints return the field, the frontend types match, and the docstring states that `emailSent` is not a delivery receipt and is `true` under `MAIL_TRANSPORT=no-op`.

- [ ] **T-7** Surface the send status, and fix the copy this feature falsifies  (deps: T-6)
      Scope: render the sent / not-sent line in `CredentialHandoff`; **revise the existing string `"This password is shown only once. Share it securely (not by email)."`** (J/B-7) — this feature makes it false, and it would otherwise sit beside a line saying the invitation *was* emailed.
      Traces: FR-2 (incl. `AND IT MUST` be shown whether or not the email was sent), FR-3 (both scenarios, incl. the `BUT it must NOT` present it as a creation failure); design.md §6
      Files: `frontend/components/admin/CredentialHandoff.tsx`, `frontend/components/admin/CreateUserDialog.tsx` (+ tests)
      Skills: `frontend-design`, `tailwind-design-system`, `react-doctor`
      Verify: `cd frontend && npx jest components/admin --silent && npx tsc --noEmit && npm run lint`
      Falsifier: hide the password in the `emailSent: false` branch — the FR-2 test must redden. Reword the failure line to say the user was not created — the FR-3 negative test must redden.
      Disqualifier: ⚠️ **No `/NN` opacity modifier on a semantic token** — they emit **no CSS** in this project, so a test asserting the class is present passes while nothing renders (`docs/specs/quick/quick-log.md`). If styling uses one, the test is a presence-assertion over an inert class: use `opacity-*` or a solid token.
      Done when: both branches show the password; the failure reads as a delivery failure; the retired string appears nowhere.

- [ ] **T-8** Prove the dispatch survives the Lambda freeze class  (deps: T-4, T-5)
      Scope: extend `lambda-handler.e2e.spec.ts` — the **only** harness that reproduces this class — to drive a user-create through the real `lambda.ts` handler and assert the send completed before the handler resolved.
      Traces: **NFR-2**, requirements §9 D-4; design.md §5.3
      Files: `backend/src/test/lambda-handler.e2e.spec.ts`
      Skills: `nestjs-expert`, `aws-serverless`
      Verify: `cd backend && npx jest src/test/lambda-handler.e2e.spec.ts --silent`
      Falsifier: convert the dispatch to fire-and-forget (drop the `await`) — this test must redden. If it stays green, it is not testing NFR-2 and must be rewritten before the task is done.
      Disqualifier: supertest **cannot** reproduce this — it never exercises `serverless-http`. A version of this test written against supertest is worthless however green; it must go through the real handler.
      Done when: the falsifier reddens it, and the suite passes with the `await` restored.

- [x] **T-9** Retire the dead Cognito template and sweep the premise it rested on  (deps: none)
      Scope: remove `InviteMessageTemplate` and `PortalUrl` from `infra/10-data-auth/template.yaml` **and** the `PortalUrl` row from `infra/README.md` §3 (J-2). Annotate — do **not** rewrite — `backend/CLAUDE.md`'s "no-email credential handoff (intentional)" section per DD-7, correcting its forward-looking instruction. *(The `docs/trd/trd.md` §4 response-shape update moved to T-6 during execution — see execution.md. Documenting `emailSent` from here would assert a field that does not exist until T-6 builds it.)*
      Traces: **FR-7 (incl. `AND IT MUST` leave no reference from any other file, and `BUT it must NOT` be described as live before the deploy)**, DD-5, DD-7; design.md §8, §9
      Files: `infra/10-data-auth/template.yaml`, `infra/README.md`, `backend/CLAUDE.md`
      Skills: `aws-serverless`, `cognitive-doc-design`
      Verify: `grep -rn "PortalUrl\|InviteMessageTemplate" --exclude-dir=archive . | grep -v node_modules` returns **only** intentional historical mentions · `./infra/scripts/validate.sh`
      Falsifier: the grep above **is** the falsifier — it currently returns hits in two files (`template.yaml`, `README.md:91`). Run it before the change and confirm it does; a grep that returns nothing beforehand is searching wrong.
      Disqualifier: ⚠️ **This task changes the repository, not the deployed pool.** `10-data-auth` deploys only with `DEPLOY_INFRA=true`, which is **not** the default. A green `validate.sh` says the template is well-formed, **never** that the change is live. FR-7 is not done until that build has run — say so in `execution.md` rather than marking it complete.
      Done when: the grep is clean, `validate.sh` passes, `backend/CLAUDE.md`'s stale instruction no longer tells future agents not to send email, and the not-yet-deployed status is recorded.

## 6. Coverage Closure (KZ-001)

Closes at **scenario and clause** granularity. A gap may not be discharged by citing a different requirement.

| Requirement | Clause | Owner |
|---|---|---|
| FR-1 s1 | temp password present | T-1 |
| FR-1 s1 | link from `PUBLIC_APP_BASE_URL` | T-1 |
| FR-1 s1 | `AND IT MUST` leave `FORCE_CHANGE_PASSWORD` | T-4 |
| FR-1 s1 | `BUT NOT` any hardcoded host | T-1 |
| FR-1 s2 | recipient forced to set a new password | T-4 |
| FR-2 | password shown with copy affordance | T-7 |
| FR-2 | `AND IT MUST` be shown either way | T-7 |
| FR-3 sent | states it was emailed | T-7 |
| FR-3 not-sent | states it could not be sent | T-7 |
| FR-3 not-sent | `AND IT MUST` still show the password | T-7 |
| FR-3 not-sent | `BUT NOT` present it as a creation failure | T-7 |
| FR-4 | 2xx with user + password | T-4 |
| FR-4 | failure logged | T-4 |
| FR-4 | `emailSent: false` returned | T-4, T-6 |
| FR-4 | `BUT NOT` a 5xx | T-4 |
| FR-4 | `AND IT MUST NOT` leave a user the API reports as uncreated | T-4 *(ordering falsifier)* |
| FR-5 | reset dispatches | T-2, T-5 |
| FR-5 | admin still gets password + signal | T-5, T-6 |
| FR-5 | `AND IT MUST` require a change at next sign-in | T-5 |
| FR-7 | neither symbol appears | T-9 |
| FR-7 | `AND IT MUST` leave no reference in any other file | T-9 *(the `infra/README.md` site, J-2)* |
| FR-7 | `BUT NOT` described as live before the deploy | T-9 *(disqualifier)* |
| NFR-1 | never in logs | T-3, T-5 |
| NFR-1 | `BUT NOT` in `ActorAuditLog` | T-4, T-5 — **(B) unevaluable gap:** neither path touches `ActorAuditLog`; no code exists to test. Structural, and recorded as such rather than counted as verified. |
| NFR-2 | awaited dispatch | T-8 |
| NFR-3 | no hardcoded host | T-1, T-2 |
| NFR-4 | plain-text part + reused layout | T-1, T-2 |
| NFR-4 | renders in real clients | **(B) unevaluable gap** — no harness rasterizes email HTML (D-7, accepted risk). Mitigated by the §3 manual check. |
| **D-6** | the message actually arrives | **No task.** §3 manual check at the HITL pause. |
| FR-6, NFR-5 | — | **Phase 2, not decomposed here** (§4). |

## 7. Estimated Effort

| Task | LOC (incl. tests) |
|---|---|
| T-1 | ~120 |
| T-2 | ~90 |
| T-3 | ~80 |
| T-4 | ~90 |
| T-5 | ~80 |
| T-6 | ~50 |
| T-7 | ~90 |
| T-8 | ~60 |
| T-9 | ~30 (mostly deletion) |
| **Total** | **~690** |

Against the design's budget of ~640. Within tolerance; `/akili-execute` escalates only on a material overrun.

## 8. PR Strategy

**~690 LOC is above the ~400 single-PR guideline. Two PRs, split at the API boundary:**

| PR | Tasks | Review focus |
|---|---|---|
| **1 — backend** | T-1…T-6, T-8 | The NFR-1 falsifier in T-5 first: `id` is the email and sits in scope. Then T-4's ordering. |
| **2 — frontend + retirement** | T-7, T-9 | Both branches render the password; the retired string is gone; the grep in T-9 is clean. |

T-9 has no dependencies and could ship in either, but it belongs with PR 2: it is documentation and infrastructure, and PR 1 should stay a reviewable backend diff.

Each PR description should say what to review first and what is out of scope, and link its sibling (`cognitive-doc-design` review empathy).
