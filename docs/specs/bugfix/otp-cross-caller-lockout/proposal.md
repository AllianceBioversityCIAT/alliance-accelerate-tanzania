# Proposal — Two unauthenticated lockout paths in the registration OTP flow

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/bugfix/otp-cross-caller-lockout` |
| Type | **Bug** |
| Status | Draft — awaiting triage |
| Severity | Live in production. Today: denial of public registration against a targeted address. **Escalates to denial of account recovery** if `auth/forgot-password-delivery` builds on this machinery unchanged. |
| Found | 2026-09-22, by the round-2 judgment-day pass on `auth/forgot-password-delivery` — **not** by that spec's code, which does not exist |
| Related | `auth/forgot-password-delivery` (`judgment.md` round 2, R2-1 / R2-2) |

---

## 2. Bug Diagnosis

Both defects are **structural**, in shared state keyed too coarsely. Both were verified by reading the code, and each claim below names what was read.

### 2.1 Defect A — the hourly send budget has no caller dimension

`backend/prisma/schema.prisma`, `model EmailSendBudget`:

```
@@id([email, windowStart])
```

Keyed on **the target address and the hour**. No purpose, no requester, no IP. `OTP_MAX_SENDS_PER_HOUR = 3` (`email-verification.service.ts:186`), incremented in `issueCode` before anything else.

`POST /api/v1/registrations/verify` carries **no handler-level guard** — only the class-level throttle — and the controller records that as deliberate (`registrations.controller.ts:55`: *"no `@UseGuards` here is itself the intended behaviour, not an omission"*).

**Consequence.** Anyone can force code issuance against any address. Three requests exhaust that address's hourly budget, and the fourth — including the **victim's own** — throws `EmailVerificationSendLimitExceededError` before any send. Renewable every hour, at zero cost, against any address the attacker knows.

### 2.2 Defect B — a failed guess burns every live code for the address

`email-verification.service.ts:317-322`, on a mismatch:

```
await this.prisma.emailVerification.updateMany({
  where: { id: { in: liveRows.map((row) => row.id) } },
  data: { attempts: { increment: 1 } },
});
```

Every currently-live row for that address is incremented, and the match predicate requires `row.attempts < OTP_MAX_ATTEMPTS` (`:310`, `OTP_MAX_ATTEMPTS = 5`).

**Consequence.** Five wrong guesses from *anyone* render every outstanding code for that address permanently unusable — including codes the legitimate holder already received.

### 2.3 Why this is not a design oversight, and what it tells us

**The per-row design is deliberate and correct.** `email-verification.service.ts:17-26` explains at length why up to three codes may be simultaneously live and why selecting "the newest" would wrongly invalidate a valid older one. The defect is not that state is shared; it is that **the key does not include who is asking**.

**This repository has already solved this exact shape, once.** `RegistrationLookupAttempt` is keyed on the composite `(ip, reference, windowStart)` specifically so — quoting `registrations.service.ts` — *"an attacker guessing against a real applicant's reference can only lock out THEMSELVES, never the applicant"*, and the review round that rejected an `(ip)`-only version is recorded beside it.

The countermeasure exists in this codebase. It was applied to one flow and not to its sibling.

### 2.4 Impact today, and impact if built upon

| | Today (registration) | If `forgot-password-delivery` reuses this unchanged |
|---|---|---|
| Defect A | A targeted person cannot complete public registration | **A locked-out admin cannot recover their account**, and the masking required by that spec's FR-4 means they are told a code *was* sent |
| Defect B | Same, via guessing instead of flooding | Same |
| Combined | ~15 requests/hour denies registration to a known address | ~15 requests/hour denies account recovery to a known address — **the exact scenario that spec was commissioned to prevent** |

## 3. Fix strategy

Key the shared state so that an attacker can only exhaust **their own** allowance, following the `RegistrationLookupAttempt` precedent rather than inventing a scheme:

- **Defect A** — add a requester dimension to `EmailSendBudget`'s key, and (if `forgot-password-delivery` proceeds) a purpose dimension, so one flow cannot consume another's allowance.
- **Defect B** — attribute failed attempts to the guesser, not to the target's rows. The victim's codes must survive someone else's wrong guesses.

⚠️ **Both changes touch a live rate-limiting boundary.** A key change that is too permissive re-opens the flooding these caps exist to prevent. The fix must be measured against both failure directions, and the existing concurrency proof for the atomic increment (`email-verification.service.ts:126-136`, *"6 independent trials of true concurrent load against the real dev RDS"*) must be re-established, not assumed to survive a key change.

## 4. Regression tests (mandatory — Bug Mode)

1. **Defect A** — a third-party may not exhaust a target's budget: issue three codes for an address as an attacker, then assert the address's own holder can still receive one. **Red before the fix.**
2. **Defect B** — a third-party's wrong guesses may not invalidate a held code: issue a code, submit `OTP_MAX_ATTEMPTS` wrong guesses from a different requester, then assert the original code still verifies. **Red before the fix.**

Both must be shown failing against current `main` before any change lands. A test written after the fix proves the fix compiles, not that the defect existed.

## 5. Non-goals

- Changing the deliberate multi-live-code design (`:17-26`) — it is correct and the reasoning is recorded.
- The `forgot-password-delivery` spec itself. This is a prerequisite for it, not a part of it.

## 6. Next step

Triage severity, then `/akili-specify bugfix/otp-cross-caller-lockout` in **Bug Mode**.

> **Provenance worth keeping.** Neither defect was found by a test, a lint, or a review of changed code. Both were found by an adversarial reading commissioned for a *different* document — and one of them by asking what a countermeasure already in this repository was protecting, that its sibling was not.
