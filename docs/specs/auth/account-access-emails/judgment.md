# Judgment Day — `design.md` (ATP-71)

## Transaction

| Field | Value |
|---|---|
| Target | `docs/specs/auth/account-access-emails/design.md` (immutable at review time, commit `bbf2e91`) |
| Mode | `judgment_day` — blind dual review |
| Round | 1 |
| Judges | Two independent `akili-reviewer` agents, read-only (Read/Grep/Glob only), **Sonnet** — author was Opus, so *author ≠ auditor* holds |
| In scope | `design.md` against `requirements.md`, `proposal.md`, the constitutional baseline, and the live code the design makes claims about |
| Date | 2026-09-21 |

**Totals:** Judge A — 1 severe, 5 warning, 0 suggestion · Judge B — 4 severe, 2 warning, 1 suggestion.

## Verdict summary

**The review earned its cost.** Every factual claim either judge made about the codebase was independently re-verified by the orchestrator and **all of them held**. Five defects in the design are real, and one of them — found by a single judge — would have shipped the exact privacy leak the design claims to prevent.

## Ledger

### Confirmed by both judges → fix

| ID | Severity | Finding |
|---|---|---|
| **J-1** | SEVERE | **§4 names a route that does not exist.** The design says the admin reset is `POST /api/v1/users/:id/reset-password`. The real route is `@Post(':id/password')` → `POST /api/v1/users/:id/password`. §4 is the contract an Implementer works from; following it verbatim leaves the real handler without `emailSent`, silently failing FR-3 and FR-5. *(A-1 severe + B-5 warning; verified in `users.controller.ts`.)* |
| **J-2** | SEVERE | **FR-7's "no reference from any other file" clause is undischarged.** `infra/README.md` §3 documents `PortalUrl` in its Shared-parameters table. The design's §8 and DD-5 discuss only `10-data-auth/template.yaml`. Retiring the parameter as designed leaves a live doc describing config that no longer exists — the same stale-reference failure ATP-67 was cited to avoid. *(A-5 warning + B-4 severe; verified at `infra/README.md:91`.)* |
| **J-3** | SEVERE | **KZ-011 rigor is applied selectively.** The design is scrupulous about marking one AWS premise unverified (FR-6/DD-6) while asserting sibling Cognito claims as settled fact: that `SUPPRESS` prevents a `CustomEmailSender` trigger firing (load-bearing for DD-1's rejection of Option A), that console-created users trigger `InviteMessageTemplate` (load-bearing for DD-5), and that the code flow leaves the existing password valid (load-bearing for DD-2). None is cited. *(A-2 + B-2, with B-6 on the third claim.)* |

### Reported by one judge, independently verified by the orchestrator → promote and fix

The protocol says a single-judge finding is recorded as *suspect* and not auto-fixed. Both below were **checked against the code before promoting** — the rule exists to stop action on unsupported findings, not to discard verifiable facts.

| ID | Severity | Finding |
|---|---|---|
| **J-4** | **SEVERE** | **DD-3's privacy mechanism does not exist as described, and its failure mode is the leak it claims to prevent.** The design says to log the Cognito `sub` as a non-PII correlation id. Verified: `create()` sets `Username: dto.email`, and `users.serializer.ts` derives the public `id` as `user.Username` — so the `id` this system passes around **is the email address**. Worse for `resetPassword(id)`: the only value in scope is that same email-shaped `id`, and `AdminSetUserPasswordResponse` is an **empty interface** — no `sub` is obtainable without an additional, undescribed `AdminGetUser` call. An Implementer following DD-3 literally would log a plaintext email address on every attempt and outcome line, violating NFR-1. *(B-1; verified in `users.service.ts:169`, `users.serializer.ts:71`, and the AWS SDK's `models_0.d.ts`.)* |
| **J-5** | SEVERE | **A requirements clause demanding design-time confirmation was deferred instead.** `requirements.md` §12 A-1 says the microservice's acceptance of these messages is *"To be confirmed in design, not assumed."* Design §10 R-3 restates it as an open assumption for implementation time. It was closable by inspection: `buildMicroserviceEnvelope(message, config)` takes only a `MailMessage` and builds the wire envelope identically regardless of message kind. *(B-3; verified in `microservice-mail.transport.ts:114`.)* |

### Recorded as info — not auto-fixed

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| A-3 | WARNING | §11's total says 3–4 review rounds; its own components are 2 + 2 across two **sequential** phases, so the lower bound is unreachable. | Fix — one number, and it is the section arguing for narrowing scope. |
| A-4 | WARNING | `requirements.md` Q-3 was delegated to design ("design decides") and the design defers it again to task execution. | Fix — decide it. |
| A-6 | WARNING | §5.3 does not say whether the dispatch sits before or after `create()`'s optional `AdminAddUserToGroup`. Placed before, a group-assignment failure maps the whole request to an error **after** a live credential was already emailed — the state FR-4's boundary clause forbids. | Fix — specify the ordering. |
| B-7 | SUGGESTION | `CredentialHandoff.tsx:108` reads *"This password is shown only once. Share it securely (not by email)."* — which this feature makes false. | Fix — name the string in §6. |

### Contradictions between judges

**None.** Where both judges reached the same finding they agreed on the fact and differed only on severity (J-1: severe vs warning). No escalation required on this ground.

## What the judges confirmed as sound

Recorded so the next reader knows what was checked and held: `dispatch()`'s logging discipline (kind + reference, never body), `MessageAction: 'SUPPRESS'` and `AdminSetUserPassword(Permanent: false)` being left unchanged, `getPublicAppBaseUrl()`'s validation and lazy resolution, the `EmailBlock` kinds named in §5.1 all existing, the `CreateUserResult` / `ResetPasswordResult` shapes, `infra/10-data-auth/template.yaml`'s `PortalUrl` / `InviteMessageTemplate` / `EmailConfiguration: COGNITO_DEFAULT`, and the claim that ADR-015 is the highest on `main`. FR-1…FR-5 and NFR-1…NFR-4 each have a named design mechanism behind their scenarios and negative clauses.

## Status

**Round 1 complete. Awaiting the user's decision before applying corrections** (protocol: ask before round-one correction).

Terminal state not yet reached — neither `approved` nor `escalated`.

---

## Round 2 — scoped re-judgment

Same two judges, same blind protocol, scope narrowed to the nine corrections (commit `9c47c72`) and to one question above all: **did any fix introduce a new defect?** That category matters here because it is a documented failure mode on this project — KZ-008 records seven recurrences, including corrections that introduced a fresh defect while closing the previous one.

| Judge | Closed | Not closed | Fix-caused |
|---|---|---|---|
| A | **9** | 0 | 0 |
| B | **9** | 0 | 0 |

Both re-verified against the code and the AWS SDK types rather than against the design's own assertions. Unanimous on all nine.

### One residual, raised by Judge B and acted on

B closed J-4 but noted that one link in its replacement mechanism — that Cognito returns a `sub` entry *inside* the attribute array — rests on repo precedent (`acting-admin.resolver.ts` filters `ListUsers` by `sub`; its fixtures show `sub` in that same shape) rather than on a cited AWS guarantee. B deliberately did not fail it.

**Marked anyway**, in §5.2, to the same standard J-3 imposed on three sibling claims. Leaving it unmarked would have reproduced the exact inconsistency J-3 existed to correct, inside the fix for J-4. The claim is also safe either way: if `sub` is absent, the "pass no reference, never fall back to `id`" rule applies, and that rule — not the `sub` lookup — is what protects NFR-1.

## Terminal receipt

| Field | Value |
|---|---|
| Target | `docs/specs/auth/account-access-emails/design.md` |
| Rounds used | 1 of 2 correction rounds, 1 of 2 scoped re-judgments |
| Round 1 | 5 severe (3 confirmed by both, 2 single-judge and orchestrator-verified), 4 info |
| Corrections applied | 9 |
| Round 2 | 18/18 verdicts `CLOSED`; **0 fix-caused** |
| Contradictions between judges | None, in either round |
| Skill resolution | `akili-reviewer` ×2, read-only (Read/Grep/Glob), Sonnet — author was Opus |
| Artifacts | this ledger · `design.md` commits `bbf2e91` (reviewed) → `9c47c72` (corrected) |

**What the review bought.** Five real defects in a design its own author believed sound, including one — J-4 — that would have shipped the precise privacy violation the document claimed to prevent, and which only one of the two judges saw. Blind duplication, not consensus, is what surfaced it.

## JUDGMENT: APPROVED ✅
