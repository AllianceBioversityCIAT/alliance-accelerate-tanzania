# Archive Summary — Deploy-script guardrails

## Document Control

| Field | Value |
|---|---|
| Original spec path | `docs/specs/bugfix/deploy-script-guardrails/` |
| Archive path | `docs/specs/archive/2026-09-21-bugfix--deploy-script-guardrails/` |
| Archive date | 2026-09-21 |
| Branch | `bugfix/deploy-script-guardrails` — **spec branch**, resolved *by fact* against root `CLAUDE.md`'s `Default Branch: main` pin |
| Jira | **ATP-64**, **ATP-65** (merged into one spec) |
| PR | [#82](https://github.com/AllianceBioversityCIAT/alliance-accelerate-tanzania/pull/82) |
| Final status | **Done.** 8/8 tasks, 0 unresolved FAIL, 0 code follow-ups outstanding |

## What it was

Both tickets are the same root cause in the same header block of
`infra/scripts/deploy.sh`:

```bash
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-*}"     # ATP-64
PROFILE="${AWS_PROFILE:-IBD-DEV}"         # ATP-65
```

`${VAR:-default}` makes a safety value a **fallback** rather than a
**floor**. A leaked `AWS_PROFILE` won silently; a failed CORS lookup opened
the API to `*`.

## Requirements delivered

| ID | Requirement | Status |
|---|---|---|
| FR-1 | Profile floor — `IBD-DEV` unless explicitly overridden | ✅ |
| FR-2 | Override is a dedicated, **value-carrying** variable, never a boolean flag | ✅ |
| ~~FR-3~~ | ~~Account-number assertion~~ | **WITHDRAWN** by Pivot |
| **FR-3′** | Account **announcement** — informational, never a gate | ✅ |
| FR-4 | `*` only on a **confirmed-absent** frontend stack | ✅ |
| FR-5 | A failed lookup **aborts**; failure ≠ absence | ✅ |
| FR-6 | `smoke.sh` verifies the CORS boundary | ✅ |
| FR-7 | Documentation matches behaviour | ✅ |
| NFR-1..4 | No new dependency · hermetic · pipeline-compatible · one place | ✅ |
| NFR-5 | No behavioural change to the application | ✅ — **amended 2026-09-21**; the measure was narrower than its own requirement |

## Files changed — real effect on the application

| File | Net | What |
|---|---|---|
| `infra/scripts/_guard.sh` | **new** | Shared library; the floor and its override execute **on `source`**, so a script cannot load it and forget to call it. Exposes `announce_account` and `resolve_stack_value`, exports `PROFILE`/`REGION` |
| `deploy.sh` | +72 / −40 | `ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-*}"` deleted; resolves the live `CloudFrontUrl`. `*` only on confirmed absence, announced. Failed lookup aborts |
| `smoke.sh` | +89 / −6 | **Check 6** — a real CORS preflight, failing on `*`, an echoed origin, a refused connection, and a `500` with no `ACAO` |
| `set-cors.sh` · `teardown.sh` · `migrate-seed.sh` · `deploy-frontend.sh` · `validate.sh` | — | Guard wired in; local `PROFILE=`/`REGION=` deleted; `CONFIRM=yes` override removed from both destructive scripts. **`teardown.sh`'s destruction confirmation is byte-identical** — verified by diff |
| `infra/jenkins/` | **new**, +102 | **Advisory, unapplied.** CORS resolution only; deliberately does not touch `MailTransport` |
| `infra/aws-accounts.conf` | created T-3, **deleted T-8** | Net zero. No account id is versioned under `infra/` in any form |

**No application change.** No `.ts`, `.tsx`, `.prisma`, or `package.json`
touched. No API, data-model, or PII-boundary change.

### The distinction the whole change rests on

`2>/dev/null || true` conflates **"the call failed"** with **"the thing does
not exist"**. `resolve_stack_value` separates them: value on stdout, `2` for
confirmed absent, `1` to abort — and classification requires **both**
`ValidationError` **and** the literal absent-stack phrasing, because
`ValidationError` alone also fires for a malformed stack name.

## Test evidence

**No `/akili-test` run — accepted.** The evidence is the 50-case harness
built by T-1 and recorded in `execution.md`; author ≠ tester was not
satisfied for test authorship, which is recorded as a limitation, not
resolved.

| | |
|---|---|
| Cases | **50**, all passing |
| Harness | bash-only, no new installable dependency (NFR-1) |
| Hermeticity | `aws`, `curl`, `sam`, `npm`, `npx` stubbed on `PATH`; text tools run real (NFR-2) |
| `validate.sh` | green on all three stacks against **real AWS**, in both invocation forms |

**Every gate was proven to fail before being trusted.** Two defects came out
of that and out of nothing else:

- **A dead gate.** `\b` in `[[ =~ ]]` is inert under BSD `regcomp`; the positional half of D-3 never ran while its header said it did. Silent on macOS — and `[[:<:]]`, the obvious fix, would have broken the Linux Jenkins agent.
- **An adjacency evasion.** The old pattern consumed its boundary character and `grep -o` resumes past it, so a forbidden account id **adjacent** to an allow-listed one was invisible.

## Validation

| Round | Result |
|---|---|
| `/akili-validate` | 8 WARN, 0 FAIL — not archive-ready |
| Remediation | 7/7 docs, N-1 resolved → ready with follow-ups |
| Delta re-validation (post-Pivot) | 1 FAIL + 4 WARN closed |
| Follow-up round (2026-09-21) | **All four carried code follow-ups closed**; Reviewer FAILed on 5 prose defects, all remediated |

## Final figures — recomputed at archive, not republished

Method: `git diff --numstat f7fbe70~1..HEAD`, added minus deleted, per path
class.

| | Net lines |
|---|---|
| Production (`infra/scripts/*.sh`) | **+474** |
| Tests (`infra/scripts/tests/`) | **+3,919** |
| Documentation | +1,518 |
| Jenkins advisory (unapplied) | +102 |
| **Ratio tests : production** | **8.3 : 1** |

**The ratio FELL from the 8.7 : 1 published at T-8** — production grew in
the follow-up round while the harness grew proportionally less. It had
*risen* at the previous measurement because the Pivot removed production
code. Direction has reversed twice; that is why the method is stated and the
number recomputed rather than carried forward (KZ-005).

## Accepted warnings and follow-ups

| Item | Disposition |
|---|---|
| **`teardown.sh`** still conflates failure with absence | **Accepted residual.** A write-path change to the most destructive script in the repo; deserves its own spec, not an appendix to this one |
| **The `Jenkinsfile`** | **Not fixable from this repository** — not versioned here. Advisory patch handed over in `infra/jenkins/`, and restated as a forwardable comment on PR #82. `smoke.sh` Check 6 detects the consequence but cannot prevent it (smoke runs last; nothing rolls back) |
| **V-01** — if the pipeline's AWS account differs | Needs a **design decision**, not a config edit. Unaffected by the Pivot |
| Pre-existing `resolve-*` cases lack the stub-`PATH` precondition | **Test-only**, no application effect. The new F-1 case has it; the others have not adopted it |

## Historical notes

**The Pivot.** FR-3 asserted the AWS account number. The infrastructure
owner argued the account can change and asserting it adds a brittle
coupling; the product owner agreed. Executed on a **stronger argument than
the one offered**: the assertion's only unique coverage was the scenario CI
creates by design, so its unique value was also its most probable false
positive — and removing it closed three open validation findings. The
`.conf` was deleted, not emptied.

**A conflict of interest, disclosed.** At the Phase-2 decision gate the
product owner was told committing the account id "would be the
repository's first" occurrence. That was **false** — it had been in an
archived spec summary since August, derived from a truncated `grep … | head
-5`. The same false universal negative then recurred **four times**, each
correction checked against where the previous instance lived rather than
against the artefact making the claim. Recorded in the Pivot Record.

**The checkout moved under the task.** `git branch --show-current` returned
a different branch mid-run — the product owner's, with uncommitted work.
Per the Concurrency Protocol a `git worktree` was created rather than
checking out; nothing of hers was touched (KZ-010).

**One figure worth carrying forward.** Of the ~21 review rounds this spec
consumed, **not one died on the mechanism being wrong.** They died on false
claims and on gates that could not fire. The only countermeasure with a
success record was not care but **execution**: every defect caught before
review was caught by running a command against a draft, never by re-reading
it.
