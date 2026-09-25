# Kaizen Entry — auth/forgot-password-delivery

## Document Control

| Field | Value |
|---|---|
| Spec Path | `auth/forgot-password-delivery` |
| Date | 2026-09-25 |
| Branch | `feat/forgot-password-delivery` |
| Branch Context | **spec** (resolved by fact: `Default Branch: main` pinned, no `Integration Branch:` pin) |
| Archive Run | 1 |
| Approval Mode | gated |

## Metrics

| Signal | Value | Source |
|---|---|---|
| Tasks executed | 7 (all `[x]`) | `tasks.md` |
| Reviewer FAIL rework attempts | **9** — T-4 ×3, T-5 ×3, T-6 ×3 (T-6 audited by **two parallel Reviewers** per round) | `execution.md` |
| HALTs / FATAL_FAILs | 1 HALT (T-5 reached the 3-attempt ceiling) / 0 | `execution.md` |
| Pivots | 0 | `execution.md` |
| PRODUCT_BUGs | — (no `test-report.md`; `/akili-test` never ran) | — |
| Judgment-day severe findings | **30** across two rounds (14 + 16), both of which killed a design | `judgment.md` |
| Validation FAIL / WARN | **4 blocking + ~13 FAIL / ~14 WARN**, all closed or accepted | `validation-report.md` |
| `REVIEW_WAIVED` / `REVIEW_SKIPPED` | 0 / 0 | `execution.md` |
| **Escaped defects** | **1 — B-4, a live production defect found *after* all 7 tasks closed** | `validation-report.md` §3 |

⚠️ **The distribution is the finding, not the totals.** Of every blocking defect this spec produced, **one was behavioural** (B-4) and the rest were false statements in prose — task text, design documents, coverage tables, and the Leader's own ledger. Seven Reviewer PASSes preceded all four blocking findings.

## Lessons

- **KZ-auth--forgot-password-delivery-1 — `git stash` cannot establish that a failure is "pre-existing" on a branch that carries commits.** (Product + Methodology, **High**)
  - **Root cause.** `git stash` shelves the *working tree* only. On a spec branch with committed work, stashing answers *"not from my uncommitted diff"* — which reads identically to *"not from this branch"* and is a different claim. The discriminating check is `git checkout <default-branch>` and re-run.
  - **Evidence.** It produced a false record **twice in one day**, and a Reviewer corroborated the first by reading:
    - `guard-account.no-account-id-literal-in-infra` — recorded in `execution.md` as *"pre-existing … confirmed unchanged by `git stash`"*. It **passes on `main`**. This spec's own T-3 introduced the literal, violating another shipped spec's requirement (FR-3′, no account id versioned under `infra/`), and shipped a red gate as inherited.
    - `registrations/consent-policy.spec.ts` — reported as *"a pre-existing failure … confirmed via `git stash` to predate and be unrelated"*. It also passes on `main`.
  - ⚠️ The sentence refuted itself in the first case — *"pre-existing (**T-3's** account-id Default)"*, where T-3 is a task **in this spec**. Neither the author nor the Reviewer caught the contradiction inside one clause.
  - Standardization → **P1**

- **KZ-auth--forgot-password-delivery-2 — A configuration-drift audit must enumerate the deploy *paths*, not only the configuration.** (Product, **Medium**)
  - **Root cause.** T-5 walked all 24 live pool keys and asked, correctly, *"what sets this value?"* It never asked *"what could remove it?"* A value governed from outside the template is not thereby safe — it is safe only while **every deploy path supplies it**.
  - **Evidence.** T-5 classified `UserPoolTags` as *"not this resource's property — `Project` comes from `samconfig.toml`'s stack-level `tags`"*. True, and the conclusion (no template change) was right. The first deploy then **stripped that tag from every taggable resource in the stack** — RDS, the pool, the KMS key, the function — because the runbook's targeted `sam deploy` omitted `--config-file`, where the tag lives, and CloudFormation read the stack as untagged.
  - ⚠️ Neither the exhaustive audit, nor the CloudFormation rehearsal, nor two Reviewers caught it: **all three reasoned about the template, and the defect lived in the invocation.**
  - Standardization → **P2**

## Noted, not a lesson

- **`/akili-test` was never run.** No `test-report.md` exists, so every test in this spec was written by the agent that wrote the code it tests (KZ-012's territory). Accepted at archive; recorded because it is the condition under which two keyword-blocklist gates and one non-discriminating NFR-2 gate shipped.
- **The corrections were the second-largest defect source.** Two validation rounds over the ~20 documentation fixes found a miscount *inside* the correction of a miscount, a corroboration that did not corroborate, and a table row with four cells in a three-column table whose overflow — the entire correction — rendered as nothing. Below the lesson bar only because KZ-008 already names the class at ×8.
- **Parallelism caused three findings that single ownership would not have.** Four batches each owned one file; three findings were cross-file (a sweep that stopped at a file boundary, a correction that never reached the ledger, a citation the fix itself invalidated). The single-owner cleanup pass was the remedy, and the validator recommended it explicitly.
- **`author ≠ auditor` held, visibly.** In the final delta audit, all **eight agent-owned files were clean** and all **six defects were in the one file the Leader wrote**. Three of those six were the same defect — a status sentence narrating the plan rather than the outcome.
- **A validator committed the error it was hunting.** It read today's tree and concluded B-4's claim had always been false; git shows the code it cites changed **79 minutes after** the measurement.

## Pending Items

### P1

| Field | Value |
|---|---|
| Kind | standardization |
| Target | `docs/specs/general-setup/task.md` |
| Edit | Under Testing & Verification: **"`git stash` cannot show a failure is pre-existing on a branch with commits — it shelves only the working tree. Check out the default branch and re-run; that is the only answer that distinguishes 'not from my diff' from 'not from this branch'."** |
| Severity | High |
| Status | pending |

### P2

| Field | Value |
|---|---|
| Kind | standardization |
| Target | `docs/specs/general-setup/design.md` |
| Edit | Under drift/configuration audits: **"Enumerate the deploy paths, not only the configuration. For every value the audit leaves out of the template, name which paths supply it — a value governed from outside is safe only while every path does."** |
| Severity | Medium |
| Status | pending |

### P3

| Field | Value |
|---|---|
| Kind | digest-update |
| Target | `KZ-010` |
| Severity | **High** (raise) |
| Edit | Recurrence **×4**, add `auth/forgot-password-delivery` as a source. ⚠️ **New in this instance, and worse than a muddled ledger: the collision produced a wrong answer to the user.** Two sessions executed T-5 in one checkout, unseen; the Leader told the user a permission set was unnecessary while the other session was blocked for want of exactly it. Also: the start-of-task `git log` check the rule prescribes **passed cleanly and still missed it** — the colliding commit did not exist yet. Re-check before writing and before committing, not only at task start. |
| Status | pending |

### P4

| Field | Value |
|---|---|
| Kind | digest-update |
| Target | `KZ-011` |
| Severity | High (unchanged) |
| Edit | Add `auth/forgot-password-delivery` as a source, with the new shape: **vendor documentation is a third-party claim under this rule, not a primary source.** `aws cognito-idp update-user-pool help` states `EmailMessage` may be set only when `EmailSendingAccount` is `DEVELOPER`. It was cited as authority for **seven** classification rows and raised a false blocker against a deploy touching live accounts. **Two minutes of measurement refuted it** — the constraint is not enforced. Citing the vendor's own docs is not verification of the vendor's behaviour. |
| Status | pending |

### P5

| Field | Value |
|---|---|
| Kind | trd-adr |
| Target | `docs/trd/trd.md` |
| Supersedes | none (new decision; sits beside ADR-006 Cognito and ADR-015 mail transport) |
| Edit | **Cognito's self-service password-reset mail is delivered by a `CustomEmailSender` Lambda trigger, not by Cognito.** Cognito keeps the reset state machine — it generates, expires and verifies the code (FR-3); only delivery moved. The function decrypts the code against a customer-managed symmetric KMS key and publishes it over AMQP to the OneCGIAR notification microservice. Consequences: the trigger is **all-or-nothing per pool**, so every pool email routes through this function; it adds a **new deployable unit inside `10-data-auth`**; and **no rollback restores the prior behaviour** — removing it lands on `COGNITO_DEFAULT`, since SES is excluded permanently. Verified live on DEV 2026-09-25 by a real reset. |
| Severity | High |
| Status | pending — ⚠️ **no ADR number allocated.** `ADR-016` was verified free against `main` and all four unmerged branches on 2026-09-25, but numbering is an apply-time act on the apply-capable branch. |

### P6

| Field | Value |
|---|---|
| Kind | guide-sync |
| Target | root `CLAUDE.md` + `AGENTS.md`, `## Module Guides` index |
| Edit | Index the new module: **"`infra/10-data-auth/functions/custom-email-sender/` — the Cognito `CustomEmailSender` trigger. Plain JavaScript (ESM), the only JS in a TypeScript repo (design.md DD-1b); its own `package.json` and jest runner; tests run with `npm test`, not bare `npx jest` (needs `node --experimental-vm-modules`)."** |
| Severity | Medium |
| Status | pending |

### P7

| Field | Value |
|---|---|
| Kind | factual-sweep |
| Target | root `CLAUDE.md` + `AGENTS.md`, § Verification commands |
| Edit | The `infra/` row names only `validate.sh` and is now materially incomplete — **two further gates exist in `infra/` and an agent following the table runs neither**: `./infra/scripts/tests/run-tests.sh` (51 cases, the account-id and profile guards) and `cd infra/10-data-auth/functions/custom-email-sender && npm test` (59 tests). Add both rows. |
| Severity | **High** — the verification table is the one thing agents execute verbatim, and one of the omitted gates is what caught this spec's own shipped violation of another spec's requirement. |
| Status | pending |
