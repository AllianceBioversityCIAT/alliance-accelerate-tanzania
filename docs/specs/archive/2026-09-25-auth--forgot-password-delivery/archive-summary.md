# Archive Summary — Forgot-password delivery via a Cognito custom sender

## 1. Document Control

| Field | Value |
|---|---|
| Original spec path | `docs/specs/auth/forgot-password-delivery` |
| Archive date | 2026-09-25 |
| Branch | `feat/forgot-password-delivery` (Branch Context: **spec**) |
| Parent | `auth/account-access-emails` (ATP-71) Phase 2 |
| Final status | ✅ **Complete — 7/7, deployed to DEV, verified with real email** |
| Kaizen entry | `docs/specs/kaizen/auth--forgot-password-delivery.md` |

## 2. What shipped

A staff or admin user who forgets their password now receives a working reset code through the OneCGIAR notification microservice. Cognito keeps the reset state machine — it generates, expires and verifies the code; **only delivery moved.**

**Verified end to end on DEV by a real person receiving a real email**, using the code and signing in. Not inferred from a green suite — the spec's own §8 records three defect classes (the KMS grant chain, real decryption, delivery) that **no automated gate here can see**, and that manual check is the only thing that closes them.

## 3. Requirements delivered

| | |
|---|---|
| FR-1 · reset code delivered through the microservice | ✅ |
| FR-2 · unrecognised trigger source fails loudly | ✅ |
| FR-3 · the reset stays code-based | ✅ (unchanged behaviour, exercised live) |
| FR-4 · delivery is best-effort; nothing claims otherwise | ✅ |
| FR-5 · pool change deliberate, verified by before/after diff | ✅ · ⚠️ its reversibility clause is **struck** — DD-4: no rollback restores the prior behaviour |
| ~~FR-6~~ | struck at specification time (Path 1 keeps Cognito's flow) |
| NFR-1 · code and address never logged | ✅ **confirmed in production**, not only in tests |
| NFR-2 · work completes before return | ✅ structural (nothing outlives the invocation) |
| NFR-3 · links from configuration | ✅ |
| NFR-4 · KMS key symmetric, policies stated separately | ✅ |
| NFR-5 · `DEPLOY_INFRA` defaults to `false`, stated verbatim | ✅ |
| NFR-6 · latency budget in one place | ✅ recorded at DD-3a (2.55 s measured) — ⚠️ remains a `SHOULD` against a ceiling AWS does not document |

## 4. Files changed

| Area | |
|---|---|
| New deployable | `infra/10-data-auth/functions/custom-email-sender/` — 8 `.mjs` files, 1,771 lines, 59 tests |
| Template | `10-data-auth`: SAM transform, KMS key + three policies, the function, the invoke permission, `LambdaConfig`, a `DependsOn`, four parameters |
| Deploy | `deploy.sh` wires three previously-unpassed parameters, with a session-ARN shape guard and operator overrides; one new script test case |
| Backend / frontend | `users.service.ts` keeps an admin-edited email verified; `EditUserDialog` confirms the new address before saving |
| Baselines | `docs/trd/trd.md` — the C4 arrow and its correction chain |
| Artefacts | `pool-before.json`, `pool-after.json`, `validation-report.md` |

## 5. Test evidence

| Gate | Result |
|---|---|
| `infra/scripts/tests/run-tests.sh` | **51/51** |
| `./infra/scripts/validate.sh` | valid ×3 stacks |
| `custom-email-sender` | **59/59** |
| `backend` | **1205/1205** · `frontend` **1756/1756** |
| **Live** | real reset received, code worked, sign-in succeeded · attribute-verification path `dispatched` and mail received |

⚠️ **No `test-report.md`** — `/akili-test` never ran. Accepted at archive, and recorded: every test here was written by the agent that wrote the code it tests.

## 6. Validation

Three dimension-scoped validators, then two more over the remediation, then a delta audit. **4 blocking findings, all closed**; ~13 documentation FAILs and ~14 WARNs remediated or accepted.

⚠️ **The seven per-task Reviewer PASSes preceded all four blocking findings** — each Reviewer was right within its scope, and every blocking finding was a cross-task claim they structurally cannot see.

**The only behavioural defect (B-4) needed a real AWS call to find.** Three documentary validators, a full CloudFormation rehearsal and 1205 tests did not surface it; a three-command probe did.

## 7. Accepted debt

| | |
|---|---|
| **W-14** | The account-id literal left `infra/` but survives in prose and both `pool-*.json`. The guard is green because it scans `infra/` only |
| **D-10** | `deploy.sh`'s parameter wiring has **never run against AWS** — every deploy was a targeted `sam deploy` |
| **NFR-6** | A `SHOULD` against an undocumented ceiling; unfalsifiable as written |
| **`/akili-test`** | Not run |
| **`UpdateUserAttribute`** | Handled but now app-unreachable, after the `email_verified` change 79 minutes later |

## 8. Historical notes

**Three designs were written; two were killed by judgment-day review** (14 findings, then 16). The third was written *against the audited findings list* rather than from memory — recorded in `execution.md` as the method change that made the run possible.

**Two CloudFormation hazards were caught at design time**, both of which would have surfaced only at the deploy that touches live accounts: a dependency cycle, and a missing ordering edge that would have rolled back a stack holding the RDS instance **non-deterministically**.

⚠️ **The defect distribution is the lasting finding.** One behavioural defect; every other blocking finding was a false statement in prose — task text, design decisions, coverage tables, and the Leader's own ledger. In the final audit, all eight agent-owned files were clean and all six defects were in the one file the Leader wrote.
