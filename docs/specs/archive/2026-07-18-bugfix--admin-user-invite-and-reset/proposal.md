# Proposal — Admin User Invite Email Delivery & Reset-Password Error

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `bugfix/admin-user-invite-and-reset` |
| Type | Bugfix (two coupled defects in the same admin/user-management surface) |
| Status | PROPOSED — awaiting approval |
| Date | 2026-07-16 |
| Author | Claude (investigated live IBD-DEV environment + code) |
| Parent spec | `docs/specs/archive/2026-07-01-admin--user-management/` |

## 2. Intent

When an admin creates a user, that user must actually receive a well-designed
English invitation email containing their temporary password; and the admin
"Reset pwd" action must work (or degrade to a clear, actionable message) for
every user, including users who have never signed in.

## 3. Problem / Current Behavior

Both defects were reproduced/diagnosed against the live dev environment
(pool `eu-west-1_eKINGUN3I`, stack `accelerate-tz-dev-data-auth`).

### Defect A — invitation email never arrives, and has no branding

- The backend correctly issues `AdminCreateUser` with
  `DesiredDeliveryMediums: ['EMAIL']` (`backend/src/users/users.service.ts`),
  so Cognito *is* asked to email the temporary password.
- **Root cause 1 (delivery):** the user pool has
  `EmailConfiguration.EmailSendingAccount = COGNITO_DEFAULT` — mail is sent
  from `no-reply@verificationemail.com`, capped at ~50 emails/day, with poor
  deliverability. Corporate filters (recipient domain is `cgiar.org`,
  Microsoft-hosted) commonly quarantine this sender, so the invite silently
  never lands. Verified live: **no SES identity exists** in the account
  (eu-west-1) and SES is in **sandbox** mode — SES-backed sending was never
  configured.
- **Root cause 2 (content/design):** `AdminCreateUserConfig` has **no
  `InviteMessageTemplate`** (verified live: `null`), so even when the default
  mail is delivered it is Cognito's bare default text — not the required
  branded English paragraph.

### Defect B — "Reset pwd" fails with a generic error

- Reproduction: the affected user (a staff account, identity omitted) is in
  `UserStatus = FORCE_CHANGE_PASSWORD` (invited, never signed in — consistent
  with Defect A: they never got the invite).
- **Root cause:** Cognito's `AdminResetUserPassword` is only valid for
  `CONFIRMED` users; for `FORCE_CHANGE_PASSWORD` it throws
  `NotAuthorizedException` ("User password cannot be reset in the current
  state").
- **Aggravator:** `backend/src/users/cognito-error.mapper.ts` has no case for
  `NotAuthorizedException`, so it collapses to a generic
  `500 — An unexpected error occurred.`, which is what the admin sees.
- Note: reset *would* work for a `CONFIRMED` user (one who has already signed
  in), but its reset-code email suffers the same Defect-A deliverability problem.

## 4. Proposed Outcome

1. Creating a user sends a **branded, English, HTML invitation email**
   (project identity, short welcome paragraph, temporary password, link to the
   admin sign-in) that **reliably reaches** the recipient's inbox.
2. "Reset pwd" on a `CONFIRMED` user sends a branded reset email and reports
   success.
3. "Reset pwd" on a `FORCE_CHANGE_PASSWORD` user **re-sends the invitation**
   (Cognito `AdminCreateUser` with `MessageAction: 'RESEND'` — the
   semantically correct operation, which also issues a fresh temporary
   password) instead of erroring.
4. Any remaining Cognito state error surfaces as a **clear 4xx message** in
   the UI (e.g. "This user hasn't signed in yet — the invitation was re-sent
   instead."), never a generic 500.

## 5. Scope

- `infra/10-data-auth/template.yaml` — Cognito `UserPool`:
  - `AdminCreateUserConfig.InviteMessageTemplate` (branded HTML + `{####}` /
    `{username}` placeholders, English copy).
  - `VerificationMessageTemplate` / forgot-password message styling (same
    branding for reset-code emails).
  - `EmailConfiguration` → `DEVELOPER` (SES) with a verified SES identity ARN
    (see dependency below).
- SES setup in IBD-DEV / eu-west-1 (identity verification; sandbox handling —
  operator/DevOps step, documented in the runbook).
- `backend/src/users/users.service.ts` — `resetPassword`: status-aware
  behavior (`FORCE_CHANGE_PASSWORD`/`RESET_REQUIRED` → re-send invite;
  `CONFIRMED` → `AdminResetUserPassword`).
- `backend/src/users/cognito-error.mapper.ts` — map
  `NotAuthorizedException` (and `UnsupportedUserStateException`) to a clear
  4xx instead of generic 500.
- `frontend` admin Users surface — success/info feedback distinguishing
  "reset email sent" vs "invitation re-sent"; no new screens.
- Tests: unit (service + mapper), handler-level e2e per
  `backend/CLAUDE.md` conventions; template lint (`validate.sh`).

## 6. Non-Goals

- No custom-domain email (DKIM/DMARC on `cgiar.org` or a project domain) —
  a verified single-address SES identity is enough for dev.
- No Cognito CustomMessage Lambda trigger (template-based customization
  suffices for one language).
- No change to the RBAC model, user list, create/edit/delete flows.
- No multi-language email content (English only, per request).

## 7. Affected Users, Systems, And Specs

- **Users:** admins inviting staff; invited staff/admin users.
- **Systems:** Cognito user pool (data-auth stack), SES (new dependency),
  backend users module, admin frontend Users page.
- **Specs:** extends archived `admin/user-management` (FR-3 invite, FR-7
  reset); touches `infra/aws-deployment` runbook (SES operator step).

## 8. Requirement Delta Preview

### ADDED Requirements

- Invitation and password-reset emails are sent through SES from a verified
  project sender identity.
- Invitation email is a branded HTML template in English containing the
  temporary password and sign-in URL.
- Admin "Reset pwd" on a not-yet-confirmed user re-sends the invitation
  (fresh temporary password) and the UI says so.
- Cognito user-state errors map to specific 4xx messages (never generic 500).

### MODIFIED Requirements

- `admin/user-management` FR-7 (reset password): from "always
  `AdminResetUserPassword`" to status-aware reset/re-invite.

### REMOVED Requirements

- None.

## 9. Approach Options

### Option A — Template-only, keep COGNITO_DEFAULT mailer

Add `InviteMessageTemplate` + fix reset flow; no SES.
- ✅ Smallest change; no operator steps.
- ❌ Does **not** fix deliverability (the actual reported failure) — mail
  still comes from `no-reply@verificationemail.com` and will keep being
  filtered; 50/day cap remains.

### Option B — SES `DEVELOPER` sending + branded template + reset fix (recommended)

Verify one SES sender identity, point the pool at it, add branded templates,
fix backend reset behavior + error mapping, adjust frontend feedback.
- ✅ Fixes all three symptoms (delivery, design, reset error) at their roots.
- ❌ Operator dependency: SES identity verification and, while the account is
  in **SES sandbox**, either (a) verify recipient addresses used in dev, or
  (b) request SES production access (DevOps).

### Option C — CustomMessage Lambda trigger

Full programmatic control of every email.
- ❌ New Lambda + trigger wiring for something a static template already
  does; larger surface, no added value for one language. Overkill.

## 10. Recommended Approach

**Option B.** It is the smallest change that actually fixes the reported
problem (email not arriving); Options A/C either don't fix delivery or
over-engineer it. The backend/template/frontend work is agent-implementable;
the SES identity verification + sandbox exit is a documented operator step
(same boundary as the existing deploy runbook).

## 11. Risks, Dependencies, And Open Questions

- **DEP-1 (blocking for delivery):** which sender address to verify in SES
  (e.g. a project mailbox the team controls). Needs the user/DevOps to pick
  and click the verification link.
- **DEP-2:** SES sandbox only delivers to verified recipients until
  production access is granted — fine for dev (few internal users), but
  production access should be requested for real rollout.
- **RISK-1:** pool `EmailConfiguration` change is an in-place `UserPool`
  update (no replacement) — low risk, validated via change set.
- **OQ-1:** exact email copy/branding (logo? colors from design tokens §7?)
  — a default draft will be proposed in the spec for review.
- **OQ-2:** should "Reset pwd" button label change per user status (e.g.
  "Resend invite" for `FORCE_CHANGE_PASSWORD`)? Default: yes, minor UI text.

## 12. Success Criteria

1. Creating a user with a (sandbox-verified) recipient → branded English
   email with temporary password arrives in the inbox; user can sign in and
   set a new password.
2. "Reset pwd" on a `FORCE_CHANGE_PASSWORD` user → 2xx, invitation re-sent,
   UI shows the re-invite message; no 500.
3. "Reset pwd" on a `CONFIRMED` user → 2xx, branded reset email arrives.
4. All backend gates green (`npm test && npm run build && npm run lint`,
   including the lambda-handler e2e); `./infra/scripts/validate.sh` PASS.
5. Live smoke on dev after deploy reproduces 1–3.

## 13. Next Step

```text
/sdd-specify bugfix/admin-user-invite-and-reset
```
