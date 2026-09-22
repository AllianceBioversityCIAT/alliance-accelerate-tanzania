# Design — Self-service password reset (Option B: our own flow)

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/auth/forgot-password-delivery` |
| Depth | Full |
| Status | Draft — awaiting approval |
| Requirements | `requirements.md` FR-1…FR-6, NFR-1…NFR-6 (NFR-4 struck) |
| Supersedes | `design.superseded-option-a.md` — kept unedited as `judgment.md`'s audit target |
| Budget | §10 |

**Every AWS claim below carries a citation.** The previous design asserted three and cited none; two were wrong. Claims about this codebase name the file and line read.

---

## 2. Executive Summary

The reset flow moves **out of Cognito and into our backend**, onto the code-issuing machinery already serving public registration. Cognito keeps only the final act — setting the password — through a call whose IAM grant was fixed on 2026-09-22.

Three decisions carry this design: **whether the existing code table can be reused as-is** (§4 — it cannot, and the reason is a privilege-escalation path), **how FR-4's masking is actually achieved** (§5), and **how Cognito's own reset is closed** (§7, verified against AWS documentation).

---

## 3. Architecture Overview

```
REQUEST                                 CONFIRM
POST /api/v1/auth/password-reset        POST /api/v1/auth/password-reset/confirm
  { email }                               { email, code, newPassword }
      │                                       │
      ▼                                       ▼
 issue a code, scoped to PURPOSE          verify code (purpose-scoped,
 hash it, persist, mail it via             constant-time, attempt-limited)
 MailService → microservice                     │
      │                                       ▼
      ▼                                 AdminSetUserPassword(Permanent: true)
 ALWAYS the same masked response               │
 padded to a response floor                    ▼
                                         user signs in normally
```

Everything runs in `20-backend`, which already holds the broker credentials, `PUBLIC_APP_BASE_URL`, `MailService`, the Cognito admin client, and the OTP machinery. **None of the cross-stack problems that sank Option A exist here** (judgment C-8, C-11).

---

## 4. Data Model — the decision that is a security boundary

### DD-1 — Reset codes MUST be scoped by purpose. The existing table cannot be reused as-is.

`EmailVerification` (`backend/prisma/schema.prisma:189`) carries `email`, `codeHash`, `attempts`, `expiresAt`, `consumedAt` — and **no purpose discriminator**. `EmailVerificationService.verifyCode` looks up by `{ email, consumedAt: null, expiresAt: { gt: now } }` (`:305`).

**Reusing it unchanged creates a privilege-escalation path:** a code issued to verify an address during *public registration* would satisfy a *password reset* for that address. Registration codes are issued to anyone who can type an email; password resets change account credentials. The two must not be interchangeable.

| Option | Verdict |
|---|---|
| **A. Add a `purpose` discriminator** to the existing model, defaulted for existing rows, and require it on every issue and verify | ✅ **Chosen.** One migration, one column, and the mixing becomes impossible rather than merely unlikely. The existing registration path keeps its behaviour by taking the default. |
| **B. A separate table** | Rejected — duplicates the hashing, expiry, attempt and consumption logic, which is exactly the drift surface DD-2 of the previous design was written to avoid. |
| **C. Reuse unchanged** | **Rejected as unsafe.** This is the finding, not an option. |

⚠️ **The falsifier for this is not "a test passes".** It is: issue a *registration* code, submit it to the *reset* endpoint, and require a rejection. That test must exist and must be shown to fail if the discriminator is dropped.

### DD-2 — Every constant is re-justified for this risk profile, not inherited

`OTP_MAX_ATTEMPTS = 5`, `OTP_LIFETIME_MS`, the send limit and the throttle were tuned for **registration**, where a failure costs a spurious registration. Here a failure costs an account. The values may well be right; **inheriting them by proximity is what is forbidden.** Each is re-stated with its reason in the task that adopts it, or changed.

---

## 5. How FR-4's masking is achieved

FR-4 was re-written on the axis judgment finding C-3 exposed: an **address-dependent** failure correlates with account existence and must be masked; a **systemic** failure is identical for an address with no account and may be reported.

### DD-3 — One response path, one floor, decided before the account is looked up

The request endpoint returns **the same body and status** in all three masked cases — no account, account plus successful send, account plus address-specific send failure — and pads every one to a common floor.

| Concern | Decision |
|---|---|
| Copy | The existing enumeration-safe wording already in the product: *"If an account exists, a reset code has been sent."* (`ForgotPasswordForm.tsx:127`) |
| Timing | `padToVerificationCodeResponseFloor` (`backend/src/mail/mail-timing.ts`). ⚠️ **Composed for this flow, not reused blindly** — that file's own history records a floor found insufficient because a term was omitted. This flow's floor must cover the Cognito lookup **and** the send, since both happen only for real accounts. |
| Systemic failure | Reported honestly **only** where the same code path produces it for an address with no account. FR-4's last clause makes an error reachable only for real accounts an oracle by definition. |
| Operator visibility | An address-specific failure is logged and alertable. The user is not told — FR-4 records this cost explicitly. |

### DD-4 — The existing frontend enumeration guard becomes dead code and is removed deliberately

`frontend/lib/auth/auth-client.ts:251` maps `UserNotFoundException` to `{ status: 'code_sent' }` under the comment *"Do not reveal non-existence on the request path (NFR-4)"*.

**This is the branch the previous design twice asserted did not exist** (judgment C-2, my ninth defect of that species). Under Option B the frontend stops calling Amplify for this flow, so the branch stops executing. It must be **removed as part of the change, not left**: a dead enumeration guard is worse than none, because the next reader assumes it is protecting something.

---

## 6. Backend Module Design

| Piece | Placement | Notes |
|---|---|---|
| Request + confirm endpoints | `backend/src/auth/` | Public, throttled. Existing `RegistrationsThrottleGuard` is the precedent; whether it is reused or a sibling is added is a task decision, but the limit must be **re-justified** per DD-2. |
| Code issue/verify | Extend `EmailVerificationService` with the purpose scope (DD-1) | Keeps hashing, constant-time compare (`safeEqualHex`), expiry and consumption in one place. |
| Mail | `MailService` + a new template, following `backend/src/mail/templates/`'s convention | Link derives from `PUBLIC_APP_BASE_URL` (NFR-3). |
| Password set | `AdminSetUserPasswordCommand({ Permanent: true })` | ⚠️ `Permanent: true`, unlike the admin-reset flow's `false` — the user chose this password, so it must not force another change. |

**NFR-2 needs no new harness.** This flow runs in the same `lambda.ts` handler ATP-71's T-8 already gates with a held-open transport promise. That test extends; it is not rebuilt.

---

## 7. Closing Cognito's own reset (FR-6)

### DD-5 — `AccountRecoverySetting` → `admin_only`

Verified, with citation: `admin_only` is a valid `RecoveryOptionType.Name`, and AWS states — *"The `admin_only` option prevents self-service account recovery."*
Source: [RecoveryOptionType](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_RecoveryOptionType.html)

This satisfies FR-6's `AND IT MUST`: the path is closed **by configuration**, so it is unreachable to anyone holding the pool and client ids, not merely absent from the UI.

---

## 8. ⚠️ The pool-update hazard, with a concrete instance found while writing this

FR-5 and judgment C-5 require the full live configuration be read and the update composed from it, because CloudFormation composes `UpdateUserPool` from the **template**, resetting anything the template omits.

**This is not theoretical. Measured 2026-09-22:**

| Setting | Live pool | `10-data-auth/template.yaml` |
|---|---|---|
| `AccountRecoverySetting` | `verified_email` (1), `verified_phone_number` (2) | **absent** |
| `EmailConfiguration` | `DEVELOPER` + SES identity | `COGNITO_DEFAULT` |
| `LambdaConfig` | `{}` | absent |
| `MfaConfiguration` | `OFF` | absent |

So the very deploy that sets `admin_only` would, without care, **also reset a recovery setting that is live today** — and it is the setting this spec is deliberately changing. The two must not be confused with each other.

### DD-6 — A drift audit is a deliverable, not a precaution

Before the deploy: enumerate every live pool setting absent from the template, decide each one explicitly, and write the decided values **into** the template. After: diff the full configuration. `proposal.md` R-1's throwaway-pool rehearsal — **dropped without comment by the previous design** (judgment C-5) — is reinstated as part of this.

---

## 9. Frontend

Unlike Option A, this **does** change the frontend: `resetPassword` and `confirmResetPassword` (`auth-client.ts:241`, `:262`) stop calling Amplify and call our endpoints. The screens keep their shape; the enumeration-safe copy is already correct and stays.

DD-4's dead branch is removed in the same change.

---

## 10. Budget (Step 2.4 tripwire)

| Metric | Estimate |
|---|---|
| Tasks | **8** |
| LOC | **~520** (endpoints + service extension ~150, migration ~20, template ~60, tests ~180, frontend ~60, IaC ~50) |
| Review rounds | **2 per task — 16 aggregate. Escalation fires on the 17th, and on any single task reaching a 3rd.** |

⚠️ Judgment finding C-12 caught the previous budget being unreachable from its own text and its tripwire stated in an ambiguous unit. Both are fixed above: the threshold is now numeric and the unit explicit.

**This exceeds the parent spec's Phase 2 estimate (4 tasks, ~230 LOC).** Stated rather than hidden — the parent estimated a trigger function, and this is a full request/confirm flow with a migration and a frontend change.

---

## 11. Design Decisions Index

| ID | Decision | Requirement |
|---|---|---|
| DD-1 | Reset codes scoped by purpose — reuse-unchanged is a privilege-escalation path | FR-3, FR-6 |
| DD-2 | Every inherited constant re-justified for this risk profile | FR-3 |
| DD-3 | One masked response path, one composed floor, decided before the account lookup | FR-4 |
| DD-4 | The now-dead frontend enumeration guard is removed, not left | FR-4 |
| DD-5 | `AccountRecoverySetting: admin_only` closes Cognito's own reset | FR-6 |
| DD-6 | A full-configuration drift audit, plus the reinstated rehearsal | FR-5 |

**No ADR allocated here** — allocated on the default branch at merge, per root `CLAUDE.md`. `trd.md` §12.5 ends at `ADR-015`. DD-1 and DD-5 both warrant entries.

---

## 12. What this design owes that nothing automated can check

Carried from `requirements.md` §8, unchanged in force:

- **D-4 (IAM):** every suite mocks the AWS clients. `AdminSetUserPassword`'s grant was added on 2026-09-22 and has never been exercised by a test — only by the live D-6 check that found it missing.
- **D-5 (pool update):** no test can see a reset setting. §8's drift audit is the only control.
- **D-6 (delivery):** a mock proves dispatch, never that a human received an email.

One mandatory manual check covers all three: request a real reset against DEV, receive the mail, use the code, sign in with the new password. **Record the result.** ATP-71's identical check found two production defects on two runs against 1203 green tests.
