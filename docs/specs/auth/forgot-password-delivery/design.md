# Design — Self-service password reset that reaches the user

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/auth/forgot-password-delivery` |
| Depth | Full |
| Status | Draft — awaiting approval |
| Requirements | `requirements.md` (FR-1…FR-5, NFR-1…NFR-6) |
| Budget | see §11 |

---

## 2. Executive Summary

Cognito keeps owning the reset **state machine** — code generation, expiry, single-use, attempt limits. All that changes is **who delivers the message**: a `CustomEmailSender` Lambda decrypts Cognito's code and publishes it to the OneCGIAR microservice instead of Cognito mailing it itself.

The design's three non-obvious decisions are **where that function lives** (§4, a genuine stack tension), **how it reports failure** (§6, which is what makes FR-4 possible at all), and **a pre-existing security gap this work must close rather than inherit** (§7).

---

## 3. Architecture Overview

```
User → /forgot-password (existing screen, unchanged)
          │
          ▼
     Cognito ForgotPassword          ← owns code generation, expiry, single-use
          │  (encrypts code with the KMS key)
          ▼
  CustomEmailSender Lambda  ← NEW
          │  1. decrypt code (AWS Encryption SDK + KMS)
          │  2. build the message (link from PUBLIC_APP_BASE_URL)
          │  3. publish to the microservice, AWAIT the reply
          ▼
  OneCGIAR notification microservice → SMTP → the user's mailbox
```

**What does not change:** the `/forgot-password` and confirm screens, the code-based shape (FR-3), and the backend API — this path never touches NestJS.

---

## 4. Where the function lives — the decision this design turns on

### DD-1 — The function ships in `10-data-auth`, despite the iteration cost

| Option | Verdict |
|---|---|
| **A. In `10-data-auth`, beside the pool and the key** | ✅ **Chosen.** No cross-stack cycle; the trigger, the key and the function version together. ❌ Cost: `10-data-auth` is `DEPLOY_INFRA`-gated, so every change to the function needs an operator-run build. |
| **B. In `20-backend`, wired into the pool by ARN** | Rejected — **it creates a stack cycle.** `20-backend` already imports `UserPoolId` from `10-data-auth`; putting the function there and referencing it from the pool makes `10-data-auth` import from `20-backend`. CloudFormation refuses. Breakable only by passing the ARN as a parameter, which trades a compile-time error for a hand-maintained string. |
| **C. A third stack** | Rejected — a whole stack for one function, and the cycle returns unless the pool takes a parameter anyway. |

**The accepted consequence, stated plainly:** iterating on this function is slow. Design for that — keep the function thin, and put anything likely to change (copy, link shape) where it can be changed without a `10-data-auth` deploy, or accept that it changes rarely.

### DD-2 — The function publishes directly; it does **not** import `MailService`

`MailService` is a NestJS provider inside the backend Lambda. This is a different deployable with a different lifecycle; importing the Nest DI graph into a trigger function would drag the whole application into a cold start Cognito waits on.

**But the wire envelope must not be re-derived by hand.** `backend/src/mail/microservice-mail.transport.ts` already exports `buildMicroserviceEnvelope` and `MicroserviceMailEnvelope` as a pure function and type. Two hand-written copies of that shape **will** drift — and the shape is exactly where ATP-71's spec recorded three separate wire-format defects (`socketFile` naming, composite `from`, comma-joined `to`).

**Decision:** share the envelope builder rather than re-implement it. How it is shared (a small shared module, a build-time copy with a drift gate) is a task-level choice; what is **not** acceptable is a second hand-maintained copy of the shape with nothing detecting divergence.

---

## 5. Data Model

No persistence. Cognito holds the code; this function is stateless. No Prisma change, no migration.

---

## 6. How failure reaches the user — the mechanism behind FR-4

This is the part that makes FR-4 achievable here when it was not achievable for ATP-71's admin screens.

**The chain is already synchronous.** Cognito invokes the trigger and waits for it. If the function **throws**, Cognito's `ForgotPassword` API call fails, and the frontend's existing error path shows the user a failure instead of "check your email".

**So FR-4 needs no new plumbing — it needs the function to not lie.** Two verified facts make the outcome knowable:

| Verified | Source |
|---|---|
| The microservice's handler is `@MessagePattern('send')` — RPC-capable, and it `return`s the send result | its `mailer.controller.ts` |
| `sendMail` **awaits the real SMTP send** before returning, and returns `'Email sent successfully'` / `'Error sending email'` accordingly; an invalid recipient **throws** `BadRequestException('No valid emails found in "TO" or "CC"')` **before** the send | its `mailer.service.ts` |

### DD-3 — The function awaits the microservice's reply and throws on failure

Publishing fire-and-forget would reproduce exactly the defect ATP-71's D-6 caught: `status=sent` logged while the microservice rejected the message 800 ms later.

Three outcomes, three behaviours:

| Microservice result | Function behaviour | What the user sees |
|---|---|---|
| Send succeeded | return normally | "check your email" — **true** |
| Send failed, or invalid recipient | **throw** | an honest failure |
| No reply within the budget | **throw** | an honest failure |

⚠️ **NFR-2 is satisfied structurally by this, not incidentally.** Because the function awaits the reply before returning, there is no in-flight work at return time to be frozen. The same property ATP-71's T-8 had to prove with a held-open transport promise comes free here — *provided* the await is real. A task must still demonstrate it can fail.

⚠️ **The honest limit, stated so it is not overclaimed later:** "the microservice accepted it and SMTP took it" is **not** "the mailbox received it". This is far stronger than broker acceptance, and still not delivery. No copy may promise delivery.

---

## 7. A pre-existing security gap this work must close

### DD-4 — `PreventUserExistenceErrors` MUST be set to `ENABLED`

**Measured on the live pool:** the app client `accelerate-tz-dev-data-auth-spa-client` has `PreventUserExistenceErrors: null`.

With it unset, Cognito's `ForgotPassword` returns a distinguishable error for an address that has no account. **The forgot-password form is therefore already a user-enumeration oracle today** — before this spec changes anything.

FR-4 requires the failure message to be identical for an unknown address and a real one whose send failed. **That requirement cannot be met while this setting is off**, because Cognito answers differently before our function is ever invoked.

This is in scope not as scope creep but because FR-4 is unsatisfiable without it — and because this spec is already performing the one dangerous pool update (FR-5) that can set it.

> **Reversion challenge (Step 2.3).** This changes delivered behaviour. *What does enabling it break?* Error messages become less specific, so a legitimate user who mistypes their address gets a generic response instead of "no such user". That is the intended trade and the industry default. No code path depends on distinguishing the two — verified: the frontend's reset flow surfaces whatever error arrives and has no branch on user-not-found.

---

## 8. Infrastructure Design

| Resource | Placement | Notes |
|---|---|---|
| KMS symmetric key | `10-data-auth` | Customer-managed. NFR-4's three grants and no more. |
| `CustomEmailSender` function | `10-data-auth` (DD-1) | Needs `@aws-crypto/client-node`. |
| Pool `LambdaConfig` | `10-data-auth` | `CustomEmailSender` + `KMSKeyID`, `LambdaVersion: V1_0`. |
| App client `PreventUserExistenceErrors` | `10-data-auth` | DD-4. |

### DD-5 — The `EmailConfiguration` side effect is made explicit, not discovered

`10-data-auth`'s template already carries `EmailSendingAccount: COGNITO_DEFAULT` while the **live pool is on `DEVELOPER`/SES** — authored, never deployed (`proposal.md` §2.2).

So the deploy that activates this trigger **also** flips the pool's mailer. With the trigger active that is harmless — Cognito stops sending mail itself entirely, so `EmailConfiguration` becomes inert for every path the function handles.

**But ordering decides whether there is an outage window.** If FR-7's deploy (ATP-71) lands *before* this function exists, self-service reset falls back to Cognito's shared sender — the `@cgiar.org` deliverability problem this whole effort exists to escape.

**Decision:** this spec's deploy activates the trigger **and** the `EmailConfiguration` change in the **same** `DEPLOY_INFRA=true` build. ATP-71's FR-7 template retirement rides that same build or waits for it. The sequencing is a task deliverable, not an operator's improvisation.

---

## 9. Frontend

**No component changes.** The existing `/forgot-password` screens already surface whatever error the Cognito call returns (verified: the reset flow has no branch on user-not-found, which is also what makes DD-4 safe). FR-4 is satisfied server-side.

The only frontend question is whether the generic failure copy is good enough once DD-4 makes all failures generic. That is a copy review, recorded as a task, not a component rewrite.

---

## 10. Observability & Rollback

| Concern | Decision |
|---|---|
| Logging | The function logs `triggerSource` and outcome. **Never the code, never the address** (NFR-1) — the same `reference`-only shape the backend uses. |
| Unknown trigger source | Logged with the source name, then **raised** (FR-2). |
| Rollback | Remove `CustomEmailSender` from `LambdaConfig` via the same full-parameter update. Cognito resumes sending itself. **Rollback is a `DEPLOY_INFRA=true` build** — not instant, and that is the real cost of DD-1. |
| Blast radius if the function is broken | **Total for pool email.** With the trigger set, Cognito sends nothing itself. A broken function means no reset emails at all — which FR-2's loud failure makes visible immediately rather than silently. |

---

## 11. Budget (Step 2.4 tripwire)

| Metric | Estimate |
|---|---|
| Tasks | **7** |
| LOC | **~420** (function ~120, its tests ~140, IaC ~100, shared-envelope plumbing ~60) |
| Review rounds | **2 per task** |

Deliberately excluded from the LOC figure: the manual live check (§8 of `requirements.md`), which is time, not lines — and which ATP-71's evidence says is where the real defects will be found.

`/akili-execute` escalates to the user on exceeding this rather than continuing. ⚠️ ATP-71 declared the same tripwire and **consumed 21 review rounds against a stated 2 with no escalation ever firing** — a documented gate that never ran. If this one is exceeded, it must actually stop.

---

## 12. Design Decisions Index

| ID | Decision | Requirement |
|---|---|---|
| DD-1 | Function ships in `10-data-auth`; slow iteration accepted to avoid a stack cycle | FR-1 |
| DD-2 | Publish directly; share the envelope builder rather than re-implement it | FR-1 |
| DD-3 | Await the microservice reply; throw on failure or timeout | FR-4, NFR-2 |
| DD-4 | `PreventUserExistenceErrors: ENABLED` — FR-4 is unsatisfiable without it | FR-4 |
| DD-5 | Trigger and `EmailConfiguration` flip land in the same build; FR-7 rides or waits | NFR-5 |
| DD-6 | Unknown `triggerSource` raises, naming the source | FR-2 |
| DD-7 | Latency budget lives in one place, per `mail/mail-timing.ts`'s existing discipline | NFR-6 |

**No ADR is allocated here.** Per root `CLAUDE.md`'s concurrency protocol, a shared monotonic id is allocated on the default branch after re-checking unmerged branches — never from a spec branch. `docs/trd/trd.md` §12.5 ends at `ADR-015` as of 2026-09-22; DD-1 and DD-3 both warrant an entry at merge time.
