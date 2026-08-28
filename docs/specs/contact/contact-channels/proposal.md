# Proposal — General contact form

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `contact/contact-channels` |
| Proposal date | 2026-08-28 · **revision 2 (scope cut) 2026-08-28** |
| Author | AKILI (Leader) on behalf of Daniela Gómez |
| **Type** | **Change** |
| **Approval Mode** | **gated** |
| Status | **Approved** (revision 1) · **rescoped by the owner, 2026-08-28** · **revision 2 awaiting owner approval** |
| Jira | [ATP-42](https://cgiarmel.atlassian.net/browse/ATP-42) — **the only story this spec covers** |
| Deferred | [ATP-28](https://cgiarmel.atlassian.net/browse/ATP-28) actor contact — descoped, see §2.1 · [ATP-58](https://cgiarmel.atlassian.net/browse/ATP-58) dedicated sender address |
| **Depends on** | none |
| **Parallel-safe** | **no** — touches `src/mail/`, shared with the live registration OTP path |
| Suggested depth | **Standard** |

## 2. Intent

Give the registry one way to be contacted that ends in an ordinary email thread.

A visitor writes to the **registry team** from a public `/contact` page. The platform renders one email, sends it to the current administrators, and stops. `Reply-To` carries the requester, so an admin hits Reply and the conversation continues in normal email. **Nothing is persisted** — no inquiry entity, no status lifecycle, no administrative inbox.

### 2.1 Why the actor contact channel was cut

Revision 1 covered two entry points: this one and a contact section on each actor profile (ATP-28). After Judgment Day (`judgment.md`) re-derived the budget from measured comparables, the two-entry-point design came to **~4,000 LOC across 18 tasks** — at the Standard/Full boundary. The owner cut the actor channel on 2026-08-28.

**The cut is disproportionately good, not merely proportional.** Nearly every serious risk the review surfaced lived in the actor entry point:

| Risk from revision 1 | Status after the cut |
|---|---|
| Outbound relay carrying anonymous text to unverified third parties | **Gone** — recipients are the registry's own administrators |
| Phishing laundering under the programme's identity | **Split, not gone.** *(Corrected 2026-08-28, Judgment Day W-4.)* Laundering to **third parties** is gone. What remains is anonymous content arriving under the registry's display name in the inboxes of every `admin`-group member — the platform's highest-privilege users. Reduced blast radius, higher-value target. Mitigated by the mandatory provenance line; see `design.md` §6 |
| Enumeration oracle over actor existence and contactability (FR-11, DD-4) | **Gone** — no registry state is reachable through this endpoint |
| `Actor.email` read on a public path, under NFR-1's release gate | **Gone** — no actor data is read at all |
| `contactable` on the public projection; serializer and type changes | **Gone** — no serializer change of any kind |
| Per-actor mail-bombing, unbounded (R-3) | **Gone** |
| **SES sandbox blocking the channel** | **NOT gone — this row was wrong.** *(Corrected 2026-08-28, Judgment Day R3-3.)* The template states in-tree that the account is still in the SES sandbox and can deliver only to verified addresses. Adding a user to a Cognito group verifies nothing in SES, so FR-3's live resolution introduces unverified recipients with no operator action. What the cut removed is the need to reach **arbitrary third parties**; administrator addresses are a bounded, verifiable set — but verifying them is an operational step someone must perform, not a property that follows from the cut. See `design.md` §7.2 |
| `PrismaService` in the contact module, and FR-7's guarantee resting on discipline | **Reduced, not gone.** *(Corrected 2026-08-28, Judgment Day R3-1.)* The module declares no data dependency, which removes the actor read — but `PrismaModule` is `@Global()`, so `PrismaService` remains injectable without any import. The guarantee is still disciplinary; what changed is that it now has a real gate, the DC-4 zero-writes test |

What remains is a form that emails the team that owns the platform. ATP-28 keeps its rescoped description in Jira and returns to the backlog as its own spec, which can reuse everything this one builds.

## 3. Problem / Current Behavior

There is no contact channel of any kind. No `/contact` route exists under `frontend/app/(public)/`, and no contact module exists in `backend/src/`. A donor with a question, or a trader who wants their record corrected, has no route back to anyone.

`RestrictedContactPanel` on the actor profile already tells visitors to *"contact the ACCELERATE Tanzania programme team"* — with nowhere to go. That sentence was written before a channel existed.

## 4. Proposed Outcome

| # | Outcome |
|---|---|
| 1 | A public `/contact` page, reached from the top nav plus footer, About and home, delivers one message addressed to every current member of the Cognito `admin` group. |
| 2 | The email carries `Reply-To: <requester>`, so replying reaches the requester and the thread leaves the platform. |
| 3 | Adding or removing an admin in the panel changes who receives contact mail, with no redeploy. |
| 4 | Nothing is persisted. |
| 5 | `RestrictedContactPanel`'s dead-end instruction finally links somewhere. |

## 5. Scope

### In scope

**Backend** — a new `ContactModule` with `POST /api/v1/contact` (public, unauthenticated, stateless); an administrator-recipient resolver over the Cognito `admin` group with a bounded cache and a configured fallback; DTO validation, sanitization, honeypot, length caps, server-generated subject; rate limiting reusing the existing throttle guard and exception filter.

**Mail** — `replyTo` added (the recipient contract is unchanged — `design.md` DD-6 sends one message per recipient rather than one message to many); `SesMailTransport` sends `ReplyToAddresses` and a display-name `Source`; one new public `MailService` method; one template; a reply-to composition utility handling RFC 5322 quoting and RFC 2047 encoding.

**Frontend** — the `/contact` page and form; a minimal `/privacy` page as the privacy-notice link target; nav, footer, About and home entry points; a link from `RestrictedContactPanel`.

**Infra** — `cognito-idp:ListUsersInGroup` added to the Lambda policy (confirmed absent today); the fallback recipient environment variable.

**Docs** — `docs/ux-ui/design.md` §2 IA (plus the stale `/directory/[id]` → `/profile?id=` fix), §4 screen inventory, §5 nav model; `docs/trd/trd.md` §4 API table and §13 QA scenario.

### Explicitly out of scope

| Dropped | Why |
|---|---|
| **The entire actor contact channel (ATP-28)** | Descoped by the owner — see §2.1 |
| `contactable` on the public actor projection | Belonged to ATP-28 only |
| `Inquiry` model, migration, statuses, assignment, internal notes | The relay design makes them unnecessary; email is the case tracker |
| Administrative inbox or triage UI; reference numbers | Same |
| Configurable routing rules; configurable category catalogue | Categories are a constant in code |
| Category-dependent form fields | One field set |
| Attachments and malware scanning | Removes an S3 surface and a scanning dependency |
| Bounce handling and delivery confirmation | Accepted limitation of the no-persistence design |
| Dedicated sender domain and its DNS records | **ATP-58** |
| `staff` as recipients | Owner decision, 2026-08-28 |

## 6. Non-Goals

- Not a CRM, ticketing system, or inbox.
- Not a path for a visitor to change registry data.
- Not a consent mechanism.
- Not a replacement for `/register` — "Join the registry" as a category routes a human question to the admins; the actual intake stays the self-registration flow.

## 7. Affected Users, Systems, And Specs

| Area | Impact |
|---|---|
| **Public visitor** | Gains a contact route |
| **Admin** | Receives contact mail; membership of the Cognito `admin` group now carries a side effect beyond authorization |
| **Staff** | No change — deliberately excluded from recipients |
| `backend/src/mail/` | Contract and transport extended; **shared with the live registration OTP path**, so its tests are the regression guard |
| `backend/src/common/role-aware.serializer.ts` | **No longer touched** — that change belonged to ATP-28 |
| `infra/20-backend/template.yaml` | One IAM action, one environment variable |
| `docs/ux-ui/design.md`, `docs/trd/trd.md` | IA, screen inventory, nav model, API table, QA scenario |

## 8. Visual Reference

- **Source:** Placement direction from the product owner (2026-08-28). No Figma, no generated mockup.
- **Placement:** an additional tab in the public top navigation.
- **Measured nav reality:** `NAV_LINKS` in `frontend/components/shell/Header.tsx` holds **six** entries today — Home, Discovery Map, Dashboard, Directory, About, and the primary-variant Register your organisation. `AuthSlot` is a sibling component outside the array. Contact makes **seven array entries, six of them plain-text before the primary CTA**. The header's own comment records that primary nav links must not wrap, so a rendered capture at 375 / 768 / 1440 must confirm the desktop bar does not crowd at `md`–`lg`; if it does, that returns to the owner as a placement question.
- **Binding visual criteria:** the placement above, design-token compliance per `docs/ux-ui/design.md` §7, the form patterns in `frontend/CLAUDE.md`, and WCAG 2.1 AA per §10. The Figma acceptance criterion in ATP-42 is superseded — recorded on the ticket.

## 9. Requirement Delta Preview

### ADDED

- A public `/contact` page collecting requester name, email, organization (optional), category, subject, message and a required privacy acknowledgement, delivering one message addressed to every current member of the Cognito `admin` group, with the send **awaited** so a failure reaches the visitor (`design.md` DD-3).
- Recipients resolved from Cognito behind a bounded cache, never a configured list; a configured address serves only as a fallback.
- Every message carries a fixed registry display name in `From`, the requester in `Reply-To`, and a server-generated subject. Requester-supplied text reaches the body and `Reply-To` — and `Reply-To` is composed with RFC 5322 quoting and RFC 2047 encoding, since it is the one header an anonymous party influences.
- A client-observable failure produces one friendly, non-technical error, preserving what was typed.
- A minimal `/privacy` page as the privacy-notice link target — **no such page exists today**, and the registration `consent-policy` endpoint is registration-scoped, so linking it would misdescribe what the visitor is agreeing to.
- Abuse controls: rate limit, honeypot, length caps, server-generated subject, sanitization.
- A new quality-attribute scenario registered in the TRD.

### MODIFIED

- **`MailMessage`** widens `to` to accept multiple recipients and gains `replyTo`; `SesMailTransport` sends `ReplyToAddresses` and a display-name `Source`; `MailService` gains one public method — its surface today is only `sendVerificationCode` and `sendReceipt`, with `dispatch` private. The registration OTP and receipt paths keep working unchanged.
- **`RestrictedContactPanel`** gains a link to `/contact`.
- **`docs/ux-ui/design.md` §2** gains `/contact` and `/privacy`, and its stale `/directory/[id]` entry is corrected to the shipped `/profile?id=` — dynamic segments are forbidden under static export.

### REMOVED

- Nothing in the product. Relative to revision 1 of this proposal, the entire actor contact channel is removed (§2.1).

## 10. Approach

**One spec, one entry point.** The shared foundation revision 1 identified — mail contract, throttle stack, DTO shape, error contract, form component — is still built once, but now has a single consumer. When ATP-28 returns as its own spec, it inherits all of it and adds only the actor-scoped controller, the eligibility rule, and the `contactable` projection.

Sequencing within the spec: mail contract and transport → recipient resolver → endpoint → frontend → docs and infra.

**Rejected alternative — keep both entry points.** That was revision 1, and it is what the owner cut. The reasoning is in §2.1: the second entry point carried nearly all the risk and roughly half the cost, and it is the only half SES sandbox can block.

## 11. Risks, Dependencies, And Open Questions

| # | Item |
|---|---|
| **R-1** | **The shared transport edit touches the live OTP path.** Widening `to`, adding `replyTo` and changing `Source` all land on code the registration flow depends on. Existing mail tests are the regression guard, and `ses-mail.transport.spec.ts` asserts the exact `Source` value today, so it will fail deliberately |
| **R-2** | **Silent non-delivery.** SES acceptance is not delivery, and with no persistence a bounce surfaces only in the sender mailbox. Lower exposure than revision 1 — administrator addresses are current and internal, not imported |
| **R-3** | **Abuse volume.** The throttle store is per-container, so the effective cap is *containers × limit*. The registration module tolerated that only because it paired it with a database-backed control; this module has no database and therefore no second control. Stated, not assumed away. Consequence is bounded: the recipients are the team's own inboxes |
| **R-4** | **IAM grant confirmed absent.** `infra/20-backend/template.yaml` grants eleven `cognito-idp:*` actions action-by-action with no wildcard, and `ListUsersInGroup` is not among them. A missing grant fails at **runtime, not deploy** |
| **R-5** | Nav crowding at `md`–`lg` with a seventh entry — verified by rendered capture, escalated to the owner if it fails |
| ~~**D-1**~~ | ~~`callbackWaitsForEmptyEventLoop` remains `true` in `lambda.ts`~~ — **withdrawn 2026-08-28 (round 4).** That dependency existed only because dispatch was fire-and-forget. `design.md` DD-3 awaits the send, so the runtime flag no longer governs whether contact mail is delivered |
| **OQ-1** | Who monitors the interim sender mailbox? R-2 leans on "a bounce lands where a human could see it", which is asserted, not evidenced |

**SES production access remains a live dependency** — an earlier version of this proposal said otherwise and was wrong. The cut narrows it from "any address in the registry" to "a bounded set of admin addresses", which is a real reduction, but the sandbox still delivers only to verified identities. `design.md` §7.2 carries the interaction and its mitigations; requesting production access is the recommended resolution (OD-2).

### Kaizen lessons in force

**KZ-002** — a presence assertion is not behavioural proof: the honeypot and throttle need checks that fail against the pre-change state. **KZ-005** — every numeric claim reconciled against prose. **KZ-008** — an assertion about an artifact is a defect when the artifact does not bear it. **KZ-009** — cite symbols, not `file:line`.

## 12. Success Criteria

| # | Criterion |
|---|---|
| SC-1 | A visitor submits `/contact`; the message is delivered to every current member of the `admin` group **whose address is deliverable**, and one undeliverable address does not prevent the others. |
| SC-2 | Removing an admin in the panel removes them from sends issued after the 60 s cache window, with no redeploy. **Adding one requires their address to be a verified SES identity before they will actually receive mail** (§2.1, `design.md` §7.2). |
| SC-3 | Replying to the email addresses the requester, not the registry. |
| SC-4 | A client-observable failure produces the friendly message in the form, with entered content intact. |
| SC-5 | Over-limit submissions are rejected by the throttle guard before any handler runs; a filled honeypot produces the same accepted response and zero dispatches. |
| SC-6 | No requester value and no administrator address appears in any response, error envelope, URL or log line. |
| SC-7 | No registry data is created, modified or deleted by a submission. |
| SC-8 | The privacy acknowledgement is enforced server-side, and the privacy notice link resolves. |
| SC-9 | `npm test`, `npm run build` and lint green in both packages; `lambda-handler.e2e.spec.ts` and the existing mail tests stay green. |
| SC-10 | No hardcoded colors or geometry; only tokens from `docs/ux-ui/design.md` §7. |

## 13. Next Step

```text
/akili-specify contact/contact-channels
```

`requirements.md` (revision 2) and `design.md` (revision 5) already exist at this scope and have been through a third blind dual review; `judgment.md` is the full record across all three rounds. Two owner decisions remain open in `design.md` §12 — chiefly **OD-2**, whether to request SES production access or verify each admin address operationally.
