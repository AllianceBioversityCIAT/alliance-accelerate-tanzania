# Execution — Forgot-password delivery via a Cognito custom sender

| Field | Value |
|---|---|
| Spec path | `docs/specs/auth/forgot-password-delivery` |
| Started | 2026-09-23 |
| Branch | `feat/forgot-password-delivery` |
| Budget | 7 tasks · ~400 LOC · 2 review rounds per task; **escalate when any single task reaches a 3rd** |
| Route | **Path 1**, simplified — `proposal.md` §12.1 |

> **Two designs were discarded before this one.** `judgment.md` records both rounds: round 1 (14 findings) killed the first Path 1 design; round 2 (16+) killed the Option B design that replaced it. This execution runs against a third design written **against that audited findings list** rather than from memory. That is the method change, and it is the only reason these tasks start from verified ground.

---

## T-1 — `10-data-auth` gains a SAM toolchain

**Status:** `[x]` · **Attempts:** 1 · **Reviewer:** PASS, first attempt · Implementer `sonnet` / Reviewer `opus`

### What it does

`10-data-auth` was plain CloudFormation and `deploy.sh` deployed it from **source**, with no `sam build` — deliberately unlike `20-backend`. It now carries `Transform: AWS::Serverless-2016-10-31`, a documented build method, and a documented dependency-install path, and `deploy.sh` builds it before deploying. **No function was added** — T-4 owns that.

This is a **deliberate convention break**: `30-frontend` documents the opposite choice in its own Description. The template header names that, quotes it, and gives the discriminating reason — that stack hosts no function, this one will.

### The falsifier, and why it discriminates

A trivial `AWS::Serverless::Function` stub was added, `validate.sh` run **without** the transform:

```
[[E3038: Check if Serverless Resources have Serverless Transform] ('AWS::Serverless::Function'
 type used without the serverless transform 'AWS::Serverless-2016-10-31') matched 51]
Error: Linting failed.
    FAIL  10-data-auth
    PASS  20-backend
    PASS  30-frontend
```

The Reviewer judged the discrimination sound for a reason worth keeping: **`E3038` is not a generic "invalid template"** — its entire semantic is *"Serverless resource without Serverless Transform"*, and a stub failing for any other cause (missing property, bad YAML) produces a different code. The other two stacks passing in the same run is the control: the runner and profile resolution were working, and only the variable under test moved.

Stub removed, verified by grep and by the built template's unchanged resource set.

### The risk I flagged, and how the Reviewer closed it

`deploy.sh` now deploys the **built** template instead of the source, on a stack holding **the RDS instance and the live Cognito pool**. If the build altered anything material, that would be a silent change to live resources.

The Reviewer settled it by reading the on-disk artifacts rather than reasoning:

- `build.toml` is `[function_build_definitions]` and `[layer_build_definitions]`, **both empty** — positive evidence of a genuine no-op, not an inference from "Build Succeeded".
- Built vs source: same 8 resources, same logical ids, nothing added, removed or renamed. **The Secrets Manager dynamic references survive equivalent** (`{{resolve:secretsmanager:${DbSecret}:SecretString:password}}`) — a mangled reference there would have broken the RDS master credential. All Outputs and Exports preserved, so `20-backend`'s `ImportValue` of `UserPoolId` still resolves.
- Differences are serialization only: short-form `!Ref`/`!Sub` → long-form, YAML re-quoting, comment stripping.

⚠️ **Carried to whoever deploys:** source-vs-**deployed** does differ (the Transform is new, the Description changed), so the next `DEPLOY_INFRA=true` run yields a **non-empty changeset** on a stack with live accounts and a database. Template-metadata level, no resource replacement — but it should not surprise the operator.

### Three claims the Reviewer settled by reading the SAM CLI's own source

Rather than recalling them — and this is the standard this spec has had to learn:

| Claim | Verdict |
|---|---|
| `BuildMethod: nodejs24.x` is valid | ✅ `nodejs24.x` is a key of `selectors_by_runtime`, resolving to `NODEJS_NPM_CONFIG` — SAM's built-in npm builder |
| SAM `Globals` cannot carry `Metadata` | ✅ **Correct and understated** — `Metadata` is absent from the `supported_properties` allow-list, and an unknown key raises `InvalidGlobalsSectionException`. Not "not injected": a hard template error |
| `sam build` uses `npm ci` when a lockfile exists | ❌ **FALSE.** `npm ci` additionally requires `Metadata: BuildProperties: UseNpmCi: true`; the default is `npm install --omit=dev` |

### Advisories applied (the Reviewer's own prescribed text)

**ADVISORY 1 — the `npm ci` error, corrected because T-4 consumes this contract.** Non-operative (deps install either way) but T-4 could have relied on committing a lockfile for deterministic installs. The comment now states the real command and the flag `npm ci` actually needs.

**ADVISORY 3 — citation corrected.** The template cited "design.md §4/§8" for `@aws-crypto/client-node`; the package is named in **§3 step 1**. §4 covers the KMS policies.

`validate.sh` re-run after both: green across all three stacks.

### ⚠️ Forward pointers — these must be copied into the briefs that own them

- **T-4 creates `infra/10-data-auth/functions/custom-email-sender/`** with its own `package.json` declaring `@aws-crypto/client-node`, plus the `AWS::Serverless::Function` resource (`CodeUri: ./functions/custom-email-sender`, `Handler: index.handler`, `Runtime: nodejs24.x`, `Metadata: BuildMethod: nodejs24.x`). T-1 stopped at the toolchain deliberately. **None of those files exist yet.**
- **T-2 has nowhere to run its tests.** Reviewer ADVISORY 2: there is no root `package.json` and no jest config at the chosen `CodeUri` — `backend/` and `frontend/` are the only jest roots. T-2's verify is `npx jest <the new specs>`, and T-2 owns the function's message module, which by this contract lives under `infra/10-data-auth/functions/`. **A runner must be stood up there, and T-2's brief must say so rather than letting it be re-decided twice.**
- **The Reviewer noted the template is better-worded than the design** on one point: `@aws-crypto/client-node` is pure JS, so the template's *"a real npm dependency NOT bundled in the Lambda runtime"* is more accurate than `design.md` §8's "native dependencies". No action; recorded so the design's phrasing is not treated as authoritative on it.


---

## T-2 — The two message bodies

**Status:** `[x]` · **Attempts:** 2 · **Reviewer:** PASS on attempt 2 · Implementer `sonnet` / Reviewer `opus`

### What it built

`infra/10-data-auth/functions/custom-email-sender/` — the function's package, created by T-2 per DD-1b (T-1 stopped at the toolchain deliberately, and `tasks.md` had assigned the directory to T-4, which would have left T-2 with nowhere to put a test). Plain JavaScript ESM, no build step. Nine files, a jest root that is the first outside `backend/`/`frontend/`, and 21 tests.

Verify command, for every later task: `cd infra/10-data-auth/functions/custom-email-sender && npm test`

### The blocking defect, and why no test could have caught it

Attempt 1 linked the reset message to `/forgot-password` and told the reader *"Enter it on the password reset page."*

The Reviewer read `ForgotPasswordForm.tsx` and found it is a **two-step in-memory wizard**: fresh loads open at step 1 — an email field and a "Send reset code" button, **no code field**, no query-param entry to step 2. So a reader clicking that link arrives where they **cannot enter the code they hold**, and their only forward action re-issues a code and **invalidates the one they have**.

**Nothing in the suite could see it.** Every assertion pinned the *host*; none pinned the *path*. The suite was green for `/forgot-password`, `/login`, or any other path. It took reading the destination component — which is what I asked the Reviewer to do, having asked the same question of the design and not answered it myself.

Recorded as **DD-1c** in `design.md`, with the two rejected alternatives and the consequences for T-4.

### The trap in the fix, and how it was checked

The replacement copy makes **its own promise**: *"go back to the window where you requested this — it is already waiting on that step, with your email address filled in."* A component that reset state on blur, navigation or a timer would make that a **new false instruction replacing the old one**.

The Reviewer verified it clause by clause: `setStep('submit')` on success and nothing sets it back; no `useEffect`, no timer, no `key` remount, no blur handler; `email` never cleared and rendered pre-filled at step 2; the step-1 form **unmounted**, so the re-issue hazard is structurally unreachable, not merely unlikely.

### Also fixed — a test that could not fail

Reviewer ADVISORY 1 on attempt 1: `config.spec.mjs`'s sentinel `throw new Error('expected … to throw')` sat **inside** its own `try`, so the `catch` swallowed it and the assertion passed regardless. **It stayed green under a mutation that should have reddened it.** Rewritten to assert `toThrow()` first, and demonstrated to redden when the throw is removed — which the old form did not.

### Leader-applied advisories (the Reviewer's own prescribed changes)

- **ADVISORY 2** — `expect(thrower).toThrow()` accepted *any* throw, so a `TypeError` lacking the sentinel would have kept it green. Now `toThrow(/PUBLIC_APP_BASE_URL/)`, matching the six sibling tests.
- **ADVISORY 3** — the new path-pin test iterates `allUrls(message)` with no non-vacuity guard of its own; FALSIFIER 3 supplied it from a *different* test, so deleting that one would have silently made the pin vacuous. Guard added inline.

Re-verified after both: 21/21.

### The vacuity problem this created, and how it was solved rather than deleted

Removing the link means the reset builder emits no URL — which breaks the guard `expect(textUrls.size).toBeGreaterThan(0)` that stops the sweep passing over an empty set. **Deleting that guard is exactly what would hollow out the test.**

Solved by inversion: the shared `describe.each` keeps only what holds for both builders; a reset-only block asserts **zero** URLs *positively* and that the message renders **identically** under unset / `*` / configured; the attribute-verification-only block keeps the full sweep, both refusal falsifiers, and the new exact-path pin. The Reviewer reconciled 21 executions from 18 declarations and confirmed the 4 tests removed from the shared block are *exactly* the 4 carried into the attribute block — nothing dropped to keep the number steady.

### ⚠️ Carried forward

- **T-4 must not re-add a reset link.** DD-1c.
- **T-4 must never log the builders' return value** — `{ to, subject, text, html }` carries both the address and the plaintext code (NFR-1). Reviewer ADVISORY 4 on attempt 1.
- **T-4 must let `getPublicAppBaseUrl()`'s throw propagate**, not catch and default.
- **`infra/10-data-auth/template.yaml`'s contract comment is now stale** — it says the directory and `package.json` are *"a NEW directory T-4 creates"* / *"does not exist yet"*. DD-1b reassigned that to T-2, which has done it. T-2 was correctly barred from editing that file; **T-4 corrects the comment.**
- **T-7 checks the closed-tab case** — read the real message as someone on a different device from the one that made the request.

### A product gap this surfaced, outside this spec

**The attribute-verification code has no screen anywhere in `frontend/`** — grep-verified independently twice. So a user whose email an admin changes would receive a well-formed message carrying a code they **cannot enter anywhere**. The gap pre-exists; this spec would make it *more* visible by making that mail arrive reliably.

**A cleaner exit exists than handling it:** have `users.service.ts::update()` set `email_verified` in the same `AdminUpdateUserAttributes` call, so Cognito emits no verification mail at all. Small backend change, outside this spec. **Raised with the user, awaiting a decision.**
