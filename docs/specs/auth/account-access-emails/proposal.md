# Proposal — Account-access emails that actually arrive

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `auth/account-access-emails` |
| Slug | `account-access-emails` — derived from the free-text argument (4 words); the full text is context, not a path |
| Jira | **ATP-71** (subtask of ATP-49) |
| Proposal date | 2026-09-21 |
| **Type** | **Change** — with one live defect inside it (see §3.2). Not filed as a Bug: the dominant work is changing *how* account-access mail is delivered, and one of the two flows never sent anything by design. |
| **Approval Mode** | **gated** |
| Parent Spec | *none* (not a chunked family) |
| Depends on | `ATP-67` / PR #80 — `PUBLIC_APP_BASE_URL` is the portal-link mechanism this reuses. Branch `feat/atp-71-account-access-emails` is cut from it. |
| Parallel-safe | **no** — touches `users`, `mail`, and `10-data-auth`, all shared |
| Branch | `feat/atp-71-account-access-emails` |
| Suggested depth | **Standard** — the code is modest, but it is credential delivery and one option changes the auth path |

## 2. Intent

An administrator invites a colleague, and that colleague receives an email that lets them sign in. An administrator forgets their password, clicks **Forgot password**, and receives an email that lets them get back in. Neither requires anyone to pass a credential by hand.

Both are ordinary expectations. Neither works today.

## 3. Problem / Current Behavior

### 3.1 The root cause is one shared channel

The Cognito pool sends through `EmailSendingAccount: COGNITO_DEFAULT` (`infra/10-data-auth/template.yaml`) — the shared `no-reply@verificationemail.com`, rate-capped and poor-reputation, which delivers badly to `@cgiar.org`. Everything below follows from that.

### 3.2 Two flows, two different failures

| Flow | What happens today | Status |
|---|---|---|
| **Admin invitation** | `UsersService.create()` passes `MessageAction: 'SUPPRESS'`, so Cognito sends **nothing**. The temporary password is returned in the API response for the admin to relay out of band. | Deliberate workaround. Works, but manual. |
| **Admin-initiated reset** | `UsersService.resetPassword()` sets a temporary password with `AdminSetUserPassword` and sends nothing either. Same manual handoff. | Same. |
| **`/forgot-password`** | Amplify calls Cognito's own `ForgotPassword`, which emails a code over the bad channel. Nobody suppressed it. | ⚠️ **Live and silent.** A user may simply never get the code, and nothing reports it. |

**The third row was a recorded decision, not an oversight.** `docs/specs/enhancement/email-notification-microservice/requirements.md` §6 lists it out of scope: *"Cognito's forgot-password email — Amplify calls Cognito's ForgotPassword directly; Cognito cannot publish to RabbitMQ. Stays on COGNITO_DEFAULT (50/day). **User decision.**"* This proposal **revisits** that decision; it does not correct an omission. The 50/day cap named there is a second reason to move: it is a ceiling on password resets across the whole service.

### 3.3 A dead template carrying a domain that will go stale

The pool defines a branded `InviteMessageTemplate` whose CTA points at `${PortalUrl}/login`, and `PortalUrl` defaults to the current CloudFront domain. Because invitations are suppressed, **no application path ever sends it** — it would fire only if someone created a user directly in the AWS console. It is dead config with a latent stale link (the sibling of the problem ATP-67 just fixed for the registration receipt).

### 3.4 What already works

The project has a **proven** email channel: the OneCGIAR notification microservice, delivering registration OTPs, receipts, approval and rejection messages in production through `MailService`. The problem was never email. It was *Cognito's* email.

## 4. Proposed Outcome

| # | Outcome | Observable by |
|---|---|---|
| O-1 | An admin creates a user; that user receives an email with the temporary password and a working link to the sign-in screen, and signs in from it. | Creating a user and reading the inbox. |
| O-2 | The admin still sees the temporary password on screen, as a fallback. | The existing handoff view is unchanged. |
| O-3 | The admin is told whether the email was sent, so they know when to relay it manually. | New state in the handoff view. |
| O-4 | A send failure never fails user creation. | The user exists in Cognito regardless. |
| O-5 | An admin-initiated reset behaves the same way as O-1…O-4. | Same. |
| O-6 | `/forgot-password` delivers through the reliable channel, and stops depending on a 50/day cap. | Requesting a reset and reading the inbox. |
| O-7 | Every link in these emails is built from `PUBLIC_APP_BASE_URL`; no email contains a hardcoded domain. | Grep, and the ATP-67 precedent. |

## 5. Scope

- `backend/src/users/users.service.ts` — `create()` and `resetPassword()` dispatch an email.
- `backend/src/mail/` — new invitation and reset templates, plus `MailService` methods, mirroring `sendApproval`/`sendRejection` exactly.
- The API response shape for both endpoints gains a "was it sent" signal.
- `frontend/components/admin/CreateUserDialog.tsx` and the reset path — surface that signal.
- `/forgot-password` delivery (mechanism decided in §10).
- Retire the dead Cognito `InviteMessageTemplate` and the `PortalUrl` parameter.

## 6. Non-Goals

| Excluded | Reason |
|---|---|
| Changing Cognito's password policy, MFA, or session handling | Unrelated to delivery. |
| Moving the pool off `COGNITO_DEFAULT` to SES | The SES identity was deliberately torn down by `email-notification-microservice` §7.1. Re-introducing it reverses a settled decision and solves a problem the microservice already solves. |
| Retry, dead-letter, or delivery confirmation | The microservice does not offer them on this path (that spec's D-H). Unchanged here. |
| Self-service **signup** | The RBAC model has no anonymous account creation. Admin-managed only. |
| Changing the registration OTP flow | Reused as a reference pattern at most; its behaviour is untouched. |

## 7. Affected Users, Systems, And Specs

| Affected | How |
|---|---|
| **Admin** (persona, `docs/prd.md` §3) | Stops relaying passwords by hand; gains a send-status signal. |
| **Staff/Admin invitee** | Receives a usable invitation for the first time. |
| `backend/src/users/**`, `backend/src/mail/**` | Primary code surface. |
| `infra/10-data-auth/template.yaml` | Template/parameter retirement, and Option A's trigger. ⚠️ Only deploys when the pipeline runs with `DEPLOY_INFRA=true`, which is **not** the default. |
| `docs/trd/trd.md` §4 | The users endpoints' documented response shape changes. |
| `docs/specs/archive/2026-07-18-bugfix--admin-user-invite-and-reset` | The frozen record of why the no-email handoff exists; this supersedes its premise, and the supersession must be stated where that rationale is quoted (`backend/CLAUDE.md`), per **KZ-004**. |
| `docs/specs/enhancement/email-notification-microservice` | Its §6 decision on forgot-password is revisited. |

## 8. Visual Reference

- **Source:** None — no new screens.
- **Location:** n/a.
- **Notes:** The only UI change is a send-status line in the existing credential-handoff view (`CreateUserDialog.tsx`), using established tokens and copy patterns. A mockup was considered and judged unnecessary for a single status line; it can be generated on request if the wording or placement turns out to be contentious.

## 9. Requirement Delta Preview

### ADDED

- An invitation email carrying the temporary password and a `PUBLIC_APP_BASE_URL`-derived sign-in link.
- A reset email for admin-initiated resets.
- A send-status signal on both admin endpoints, surfaced in the UI.
- Reliable delivery for `/forgot-password`.

### MODIFIED

- `UsersService.create()` / `resetPassword()` — same Cognito calls, plus a dispatch that cannot fail the operation.
- The users endpoints' response contract.
- `backend/CLAUDE.md`'s "no-email credential handoff (intentional)" section — its premise no longer holds.

### REMOVED

- The Cognito `InviteMessageTemplate` and the `PortalUrl` parameter.
- The out-of-band-only credential handoff as the *sole* route (it remains as the fallback).

## 10. Approach Options

The two flows differ in one decisive way: **who holds the credential.**

For invitation and admin reset, *we* generate the temporary password — Cognito's mailer is not involved at all, and never needs to be. For `/forgot-password`, *Cognito* owns the flow and the code; we either route its mail elsewhere or replace the flow.

| | **A — CustomEmailSender for everything** | **B — Split by ownership** *(recommended)* | **C — Backend owns everything** |
|---|---|---|---|
| Invitation / admin reset | Cognito emails via a Lambda trigger | **Backend sends via `MailService`** | Backend sends via `MailService` |
| `/forgot-password` | Same trigger | **CustomEmailSender trigger** | Backend-owned reset reusing the registration OTP machinery |
| New infrastructure | Lambda + KMS key + `10-data-auth` change | Same, but only for one flow | None |
| Ships on an ordinary merge? | **No** — needs `DEPLOY_INFRA=true` | **Invitation half: yes.** Reset half: no | Yes |
| Reimplements an auth flow? | No | No | **Yes — password reset** |
| Main risk | A new failure point inside the auth path | Two mechanisms to understand | Enumeration oracles, rate limiting, replay — on an account-takeover path |

### Why not C

It is the cheapest and the most dangerous. Reimplementing password reset means re-deriving protections Cognito already ships: enumeration resistance, code lifetime, replay, throttling. This project *has* built that once, carefully, for the registration OTP — including constant-time padding so response latency cannot reveal whether an address exists. But "verify an address before submitting a form" and "take over an administrator account" are not the same stakes. Do not reimplement auth to save a CloudFormation change.

### Why not A alone

A is the clean destination, but **nothing ships until an infra deploy runs with a non-default flag.** The invitation half needs no infrastructure at all, and it is the half the product owner asked for first. Coupling it to the flag delays it for no benefit — and with `MessageAction: 'SUPPRESS'` retained, a trigger would never fire for invitations anyway.

## 11. Recommended Approach

**Option B, delivered in two phases.**

**Phase 1 — what we already own.** `UsersService.create()` and `resetPassword()` dispatch through the existing `MailService`, exactly as `AdminRegistrationsService` already does for approvals and rejections. Templates live in the repo, are unit-tested, and build their links from `PUBLIC_APP_BASE_URL`. Ships on an ordinary merge. Retires the dead Cognito template.

**Phase 2 — the flow Cognito owns.** A `CustomEmailSender` trigger routes Cognito's forgot-password mail to the microservice. Requires the `10-data-auth` deploy, so it is sequenced second and gated on `DEPLOY_INFRA=true`.

This is the smallest safe path because each half uses the right tool: we send what we generate, and we re-route what Cognito generates rather than rebuilding it.

**On the reset shape — keep the code, not a new password.** Emailing a freshly-minted password invalidates the current one the instant anyone submits the form, so anyone who knows an administrator's address can lock them out without ever reading the inbox. Cognito's code flow leaves the existing password valid until the code is used. The delivery channel is the defect; the security shape is not. *(Product owner asked for "a new password by email"; this is the counter-recommendation, accepted 2026-09-21.)*

## 12. Risks, Dependencies, And Open Questions

| # | Risk / question | Handling |
|---|---|---|
| R-1 | **A temporary password now travels by email.** | Accepted by the product owner. Single-use; the account stays in `FORCE_CHANGE_PASSWORD`. Must never be logged — `MailService`'s existing logging discipline (reference only, never body) already enforces this and must be preserved. |
| R-2 | **`CustomEmailSender` was deferred once already.** The recorded reason is cost, not impossibility — but that is a claim about a third party. Per **KZ-011**, Phase 2 must *verify* the trigger's contract (KMS decryption, payload shape, which flows it intercepts) against AWS documentation and a live test, and cite where. Do not design Phase 2 from memory. |
| R-3 | Phase 2 cannot ship on a normal merge (`DEPLOY_INFRA=false` by default). | Sequenced second, and called out in its own tasks so nobody merges it believing it is live. |
| R-4 | **"The email was sent" is not "the email arrived."** Per **KZ-002**, a test asserting `MailService.sendX` was called proves dispatch, not delivery. The acceptance criteria must say which is which, and at least one end-to-end check against a real inbox must be recorded rather than inferred. |
| R-5 | The archived `admin-user-invite-and-reset` spec and `backend/CLAUDE.md` both state the no-email handoff as intentional. Per **KZ-004**, sweep the *premise*, not the phrase — every sentence resting on "Cognito mail is unusable" must be revisited in the same change. |
| R-6 | **Open:** does `/forgot-password` need Phase 1's fallback in the meantime? Until Phase 2 lands it stays on the 50/day capped channel. An admin-initiated reset is the workaround, and it works from Phase 1 onward. Confirm that is acceptable as an interim. |
| R-7 | **Open:** should the invitation email carry the password at all, or only the link, with the password relayed by the admin? The product owner chose to include it. Recorded here because it is the one decision a future reader will question. |
| D-1 | **Dependency:** ATP-67 / PR #80 must merge before this can use `PUBLIC_APP_BASE_URL`. The branch is cut from it, so the code is present; the merge order matters for `main`. |

## 13. Success Criteria

1. Creating a user sends an email whose link reaches the sign-in screen, and whose temporary password signs that user in and forces a change.
2. The admin sees the password *and* whether the email was sent.
3. Killing the mail transport does not fail user creation; the failure is logged and shown.
4. No email in the repo contains a hardcoded domain.
5. The Cognito `InviteMessageTemplate` and `PortalUrl` are gone, with no remaining reference.
6. `/forgot-password` delivers through the microservice (Phase 2), verified against a real inbox.
7. Every claim about Cognito's trigger behaviour cites where it was verified (**KZ-011**).

## 14. Next Step

```text
/akili-specify auth/account-access-emails
```

Standard depth. Consider specifying Phase 1 and Phase 2 as separate task groups within one spec, so Phase 1 can merge while Phase 2 waits on an infra window.
