# Execution Log — Email via the OneCGIAR Notification Microservice

## Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/enhancement/email-notification-microservice/` |
| Branch | `email-ms` |
| Approval Mode | `gated` |
| Triad | Leader (opus) → Implementer (`akili-implementer`, sonnet) → Reviewer (`akili-reviewer`, opus) |
| Budget (design.md) | 17 tasks · ≈1,850 lines · 3 review rounds |
| Started | 2026-09-16 |

**Author ≠ auditor** is enforced by the Step 8E wrappers' `model:` bindings, not by convention.

---

## Task Execution History

### T-1 — Create the canonical timing constants and their invariant tests

| | |
|---|---|
| **Status** | ✅ **PASS** on attempt 1 |
| Date | 2026-09-16 |
| Implementer attempts | 1 |
| Requirements covered | NFR-7, NFR-1 · `design.md` §12, DD-10 |

**Leader skill/effort selection (deviation recorded).** `tasks.md` T-1 lists `nestjs-expert`; I assigned **no stack skill**. Reason: the deliverable is a constants module plus arithmetic assertions — there is no NestJS surface (no DI, no module registration, no provider). Effort **`medium`**: small work, but the constants govern an address-enumeration timing oracle, so it is not `low`.

**Files changed**

- `backend/src/mail/mail-timing.ts` (new, 109 lines)
- `backend/src/mail/mail-timing.spec.ts` (new, 118 lines)

Scope containment confirmed by the Leader with `git status --porcelain` (the Reviewer flagged, correctly, that it could only establish this by reading — A6). Result: exactly the two new files, plus this untracked spec folder. `registrations.service.ts` and `email-verification.service.ts` untouched.

**Verification**

`cd backend && npm test -- mail-timing --silent` → **7/7 pass**. Implementer also reported clean: `npx eslint` on both files (exit 0), full `npm test -- --silent` (77 suites / 1087 tests), `npm run build` (exit 0).

**Mutation evidence (KZ-002 — a gate not shown to fail is not evidence)**

| Invariant | Mutation | Result | Reverted |
|---|---|---|---|
| 1 — `PRESEND + SEND ≤ FLOOR` | `MAIL_SEND_TIMEOUT_MS` 1200 → 1300 | 2 tests red (the pin + the invariant; 800+1300 = 2100 > 2000) | ✅ green |
| 2 — `LOCK_WAIT + PROBE < SEND` | `MAIL_PROBE_TIMEOUT_MS` 250 → 1050 | 2 tests red (the pin + the invariant; 200+1050 = 1250 ≮ 1200) | ✅ green |

The Reviewer re-derived both outcomes arithmetically from the source and confirmed the failure counts reconcile exactly, while recording that it executed nothing itself (A6).

**Reviewer verdict — `STATUS: PASS`**

> All four constants match design.md §12.1/§12.2 exactly, both §12.3 invariants are asserted at the correct strictness with invariant 1 in DD-10's composed (three-term) form, the mutation evidence reconciles arithmetically against the source, and the change is confined to T-1's two Files with registrations.service.ts and email-verification.service.ts provably untouched.

Notable audit findings within the gate: invariant 2 uses `toBeLessThan` where a `≤` would have been a silent weakening — it is not present; invariant 1 is composed as a **sum**, i.e. the three-term shape DD-10 mandates rather than the two-term comparison NFR-7's revision-4 note condemns.

**Decisions made**

*The floor-constant tension.* `VERIFICATION_CODE_RESPONSE_FLOOR_MS` lives in `registrations.service.ts` at `900`; §12.1's target is `2000`; **T-7 owns re-deriving it and T-1 was forbidden to touch it.** The Implementer chose to assert invariant 1 against a locally-scoped target constant, having first verified that T-7's `Files:` list contains no `mail-timing.*` — so the alternative ("export a target, let T-7 wire it") had no planned landing step. The Reviewer independently verified that premise and judged the choice correct: asserting against the live `900` would have shipped a permanently red, unowned test.

**ADVISORY findings (4R lenses — non-gating, recorded per the Advisory rule)**

| ID | Finding | Leader disposition |
|---|---|---|
| **A1** | The second test asserts the **negation** of invariant 1 against the live constant, inside the `describe` block named for invariant 1. It reddens when T-7 lands, in a file T-7 does not own. The obvious minimal repair (weaken `<` to `≤`) would make it vacuous — the "green gate over a live defect" shape NFR-7 condemns | **Transferred mechanically** — `mail-timing.spec.ts` added to T-7's `Files:` with an explicit instruction to **delete** that test, not weaken it. A pointer filed and not transferred is not carried (leader playbook) |
| **A2** | `mail-timing.spec.ts` line 105 reads `// T-7 will make this pass:` above three lines correctly explaining T-7 makes it **fail** | Folded into A1's transfer — the same lines are deleted. Not reopened as T-1 rework: the Reviewer PASSed and an advisory may not widen a closed task |
| **A3** | ⚠️ **Design defect, not an implementation one.** `design.md` §12.1 documents the allowance as covering "the `EmailSendBudget` upsert, `emailVerification.create`, and code generation + hashing". **Only the upsert is inside `issueCode`'s `$transaction`** — Leader-verified directly: `generateCode`, `hashCode` and `emailVerification.create` run *after* it. T-7's specified mechanism (a transaction timeout) would therefore bound **one of three terms**, and NFR-7's "every term inside the padded window MUST be bounded at runtime" would not hold | **Design amended before T-7 is dispatched.** See *Design correction* below |
| **A4** | `design.md` §4.1's Phase-A inventory does not list `mail-timing.ts`; it places "The §12 constants" in `registrations.service.ts` and the invariant test in `registrations.service.spec.ts`. `tasks.md` T-1 mandates the new `mail/` module | Design reconciled to the task, which is what shipped and what the Reviewer validated |
| **A5** | `design.md` DD-10 says Prisma's 5000 ms ceiling is "5.5× the allowance" — stale from the old `900`. Correct against `800` is **6.25×**. *Two documents, one ratio, two values — the exact failure §12 exists to prevent* | Corrected in `design.md` |
| **A6** | Every red/green result was produced by the agent that wrote the code; the Reviewer re-derived but executed nothing, and established scope by reading | Leader ran `git status --porcelain` — scope containment now established by execution, not inference |
| **A7** | `mail-timing.spec.ts` imports from `../registrations/registrations.service` — the **reverse** of the dependency direction T-1's Scope line claims. Test-only; no runtime cycle (nothing in `mail/` reaches into `registrations/`), so no DI or bundle impact. But a four-constant unit test now transitively loads `@prisma/client` | Recorded so it is not later mistaken for an accidental import. Disappears with A1's deletion in T-7 |

**Issues encountered:** none blocking. One design defect surfaced (A3) and was corrected before it could reach the task it would have broken.

---

## Design correction — A3 (recorded during T-1, applied before T-7)

**Not a Pivot.** No approved work is undone, no task is blocked, and the requirement is unchanged — NFR-7 already demands that *every* term inside the padded window be bounded. What was wrong is the **mechanism** `design.md` specified for satisfying it, and T-7 had not yet been dispatched.

**The defect.** `issueCode`'s `$transaction` wraps only the `EmailSendBudget` upsert and its read-back. `generateCode()`, `hashCode()` and `await this.prisma.emailVerification.create(...)` execute *outside* it. A Prisma transaction timeout therefore bounds the budget upsert and nothing else.

**Why it matters more than a one-third shortfall.** The **over-cap branch throws immediately after the transaction**; the **accepted branch** additionally pays `emailVerification.create` — a further unbounded database round-trip. The unbounded term is precisely the one that *differs between the two branches*, which is the divergence the constant-time floor exists to erase. Bounding only the transaction would have left the timing oracle open while `mail-timing.spec.ts` asserted the arithmetic was sound — the same green-gate-over-a-live-defect shape that Judgment Day rounds 2 and 3 both condemned.

**The correction.** The allowance is applied as a deadline over the **whole pre-send region** — `requestVerificationCode` bounds its `issueCode(...)` call as a unit — rather than as a Prisma transaction option. This bounds every term inside it regardless of `issueCode`'s internal structure, and it survives someone later moving work into or out of that transaction.

Amended: `design.md` §12.1 ("Covers" and "Enforced by"), DD-10's mechanism sentence, §4.1, §10; `tasks.md` T-7 scope and Done-when.

---

### T-3 — Extend mail configuration: add `microservice`, retain `ses`

| | |
|---|---|
| **Status** | ✅ **PASS** on attempt 1 |
| Date | 2026-09-16 |
| Implementer attempts | 1 |
| Requirements covered | FR-3 · `design.md` §4.5, §7.3 |

**Leader decomposition correction (in flight, before dispatch).** `tasks.md` T-3 listed `mail-transport.factory.ts` in its Files. **Moved to T-4:** the factory branch must construct `MicroserviceMailTransport`, a class T-4 creates — T-3 cannot add a branch for a type that does not exist. Recorded here because it changes two tasks' file lists, not just this one's.

**Leader skill/effort:** no stack skill (config surface, no NestJS construct); effort `medium`.

**Files changed:** `backend/src/mail/mail.config.ts`, `mail.config.spec.ts` (+157 / −9).

**Verification:** `cd backend && npm test -- mail.config --silent` → **14/14 pass**; eslint exit 0; build success. The Reviewer independently reconciled the count against the file (3+3+7+1 `it()` blocks = 14) rather than accepting the figure.

**Mutation evidence**

| Target | Mutation | Result | Reverted |
|---|---|---|---|
| Required-variable throw | `rabbitmqUrl` defaults instead of throwing | 1 test red | ✅ |
| Lazy resolution | a `required()` call moved to module top level | **whole suite failed to load**, before any test body ran | ✅ |

**Reviewer verdict — `STATUS: PASS`**

> All six FR-3 clauses are implemented and owned by discriminating tests; the no-leak guarantee holds by construction (the only value-interpolating throw carries MAIL_TRANSPORT's own value, never a secret); scope is exactly the two authorized files.

The Reviewer noted one detail worth preserving: the test regex `/EMAIL_SENDER\b/` correctly refuses to match `EMAIL_SENDER_NAME`, which is the single place a sloppier pattern would have passed vacuously.

It also **corrected the Implementer's own claim**: the "two independent mechanisms" argued for the lazy-resolution proof are in fact *sequential and masking* — the static import at the spec's top kills the file before the dedicated test can run, so mechanism 1's firing was inferred, not observed. Verdict unchanged; the property is genuinely driven.

**The routing hazard — Leader-raised, Reviewer-ruled**

The Leader found that widening `MailTransportKind` while leaving the factory untouched creates a window where `MAIL_TRANSPORT=microservice` is *accepted by config and silently routed to the no-op transport* — success reported, nothing sent.

**Ruling: acceptable intermediate state; no guard belongs in T-3.** The window is type-level only and unreachable by any configuration in the tree — `infra/20-backend/template.yaml` still pins `MAIL_TRANSPORT: ses`, `.env.example` pins `no-op`, and no test calls `getMailTransport()` with the new kind. Dependency order closes it before it opens: **T-4 owns the factory and is strictly prior to T-8**, which is the first task that makes `microservice` selectable in a deployed environment. Adding a guard here would have meant editing the one file deliberately removed from this task while T-2/T-4 work is in flight in the same directory — trading an unreachable hazard for a real collision.

**ADVISORY findings**

| ID | Finding | Leader disposition |
|---|---|---|
| **A1** | ⚠️ **The no-leak test is near-vacuous.** Both assertions check for the absence of a value *just deleted from the environment*. An implementation appending `JSON.stringify(process.env)` to the error would **pass this test while leaking the live broker URL**. The Reviewer passed the clause on **reading** — a static property of a 12-line function with one interpolation site — and said so explicitly rather than letting the test stand as the evidence | **Transferred to T-5**, which owns the same property at transport level and whose brief already demands a non-sanitizing variant. `mail.config.spec.ts` added to its Files. The discriminating fix is one line: the second block already has `RABBITMQ_URL` **set**, so asserting `amqps://` absent there tests a secret that is actually present |
| **A2** | The lazy test can never be observed failing on its own — the static import kills the file first. Cosmetic today; matters the moment someone cites it as discrimination evidence | Recorded. Folded into A1's transfer |
| **A3** | `mail.config.ts`'s `Invalid MAIL_TRANSPORT "${value}"` is the module's one value-interpolating throw. Harmless (it can only carry `MAIL_TRANSPORT`'s own value) and pre-existing, but it is an escape path | **Transferred to T-5** as a known site to enumerate |
| **A4** | `required()`'s widened advice points a caller missing `MAIL_SENDER_ADDRESS` at `MAIL_TRANSPORT` first | Nit. Recorded, not actioned |

**Guard transferred to T-4 — stronger than "add the branch."** The Reviewer's recommendation, adopted: T-4 must **replace the ternary with an exhaustive `switch` whose `default` throws**, not append a third arm. The current `=== 'ses' ? Ses : NoOp` makes the no-op transport the silent fallback for *every* unhandled kind — it is the generator of this hazard and would regenerate it at Phase B when the union narrows again. This is the spec's own worst-named failure class (D-J: *"every request `202`, zero emails, no signal anywhere"*). It is now a **Done-when bullet**, not a Scope mention, because a guard that is hoped for is not a guard.

---

### T-2 — Build the envelope as a pure, separately-testable function

| | |
|---|---|
| **Status** | ✅ **PASS** on attempt 1 |
| Date | 2026-09-16 |
| Implementer attempts | 1 |
| Requirements covered | FR-2, FR-4, DD-8 · `design.md` §4.2 |

**Leader skill/effort:** no stack skill (a pure mapping function; `api-design-principles` targets REST surfaces, not a wire envelope); effort `medium`.

**Files changed:** `backend/src/mail/microservice-mail.transport.ts` (new, 138 lines), `…spec.ts` (new, 216 lines) — 13 cases.

**Verification:** `npm test -- microservice-mail --silent` → **13/13**. Full suite **78 suites / 1108 tests** green, confirming T-1/T-2/T-3 coexist without interference. eslint clean.

**Mutation evidence**

| Target | Mutation | Result | Reverted |
|---|---|---|---|
| Assigned gate — `socketFile` → `file` | renamed interface field + literal key | **TS2339, suite failed to load (0/13)** | ✅ |
| Self-chosen — DD-8's `.trim()` on `to` | `return list.map(a => a.trim())` → `return list` | 2/13 red with value diffs | ✅ |

The Implementer's stated reason for its self-chosen target is worth preserving: a dropped `.trim()` is invisible in ordinary traffic because upstream DTOs already send clean addresses, so only a whitespace-padded fixture can catch it. It picked the clause that rots silently.

**Reviewer verdict — `STATUS: PASS`**

> The envelope matches FR-2 field-by-field and nesting-by-nesting against every in-repo statement of the contract, all FR-2/FR-4/DD-8 clauses are owned (one — the `file` prohibition — by structural assertions rather than a named test), the injected-config builder is precisely the shape design.md §4.2(3) mandates and imposes zero wiring cost on T-4 given T-3's superset config, and the change is confined to T-2's two files.

**Ruling on the injected-config builder — correct on the merits, not merely convenient.** The Implementer's stated reason was scheduling (avoiding T-3's concurrent edit). The Reviewer rejected that as the justification and supplied a better one: §4.2 assigns *"resolve configuration lazily"* to the **transport** and *"build the envelope"* to a **separate pure function**; importing the config getter into the builder would fold the first into the second and destroy the exact property the separation buys — the spec would have to mutate `process.env` and reason about lazy resolution to test a JSON mapping. It further established the wiring cost on T-4 is **zero**: T-3's `MicroserviceMailConfig` is a structural superset with identical field names, so T-4 passes it straight through and it type-checks unchanged.

**A gate-shape finding worth recording (A-1).** The assigned `socketFile` → `file` mutation can only redden as a **compile** error, and the Leader flagged that a type error proves the field is *referenced*, not *correctly populated*. The Reviewer confirmed the concern and then showed it is not a weakness that could have been avoided: in a statically typed builder an assertion-level redden for that exact mutation is **unreachable** — renaming the key in the literal alone is an excess-property error, and renaming it in the interface too breaks the spec's dereference. The population property is proven separately, at assertion level, by test 2's value-level `toEqual`. **The compile error is the shape this gate necessarily takes, not a weaker substitute.** Recorded so the evidence is never later read as stronger — or weaker — than it is.

**ADVISORY findings**

| ID | Finding | Leader disposition |
|---|---|---|
| **A-1** | The `socketFile` gate reddens only at compile time; an assertion-level redden is structurally unreachable (see above) | Recorded above, in full, so the evidence is correctly weighted later |
| **A-2** | FR-2's *"nor use the `message.file` field"* has no test **named** for it. Closed three ways — the interface, test 3's `Object.keys` equality, test 1's exact `toEqual` | Covered, not named. Recorded; no action |
| **A-3** | Only the text-only case gets a **full-envelope** `toEqual`; the HTML case asserts the nested `message` object only. Since `toEqual` tolerates `undefined`-valued keys, an extra optional key populated *only when HTML exists* would escape every assertion | Recorded. Foreclosed by the interface today; revisit if the envelope shape grows |
| **A-4** | The text-only branch is **unreachable in production** — all five templates set `html` unconditionally. So omit-vs-`null` for `socketFile` is inert today. The Reviewer ruled omission **safe on the merits**: the sibling producer proves `null` is accepted and says nothing about absence, while absence is at least as safe against every plausible consumer shape (`@IsOptional()` skips both; `if (socketFile)` treats both as falsy; only a key-presence check distinguishes them, and there `null` is the worse of the two — it would route an HTML path with a null body) | Recorded with the residual stated correctly: **not "covered by unit tests" but "unexercised against the real service"**, and it only becomes live if a text-only kind is ever added |
| **A-5** | `normalizeTo` trims but does not drop empties: `to: ['']` survives | Recorded, **not actioned**. No in-repo caller can produce it (the contact path falls back to a configured recipient; the other four pass a single applicant address) and FR-2 is silent. Hardening here would be advisory-driven scope growth |
| **A-6** | ⚠️ T-4 will likely pass the whole `MicroserviceMailConfig` through, since it type-checks as a superset — which hands the **credential-bearing `url`** into the builder. Harmless as written (explicit literal, no spread), but a future `...config` inside the builder would publish the broker URL **into the message body** | **Transferred to T-4** as an explicit call-site constraint: destructure, never spread. This is FR-7/NFR-3 territory, and the cheapest possible moment to foreclose it |

**An authority gap the Reviewer surfaced, and it is real.** The microservice's own contract document — cited in `requirements.md` §2's verification ledger as the source for the envelope, `socketFile` support, and the recipient-validation rule — **is not in this repository**. The only in-repo statements of the wire contract are FR-2's JSON skeleton and `proposal.md`'s mapping table. The Reviewer correctly marked the recipient-validation rule `UNVERIFIABLE` from reading rather than passing or failing it, and routed it to T-9's observed send. *Raised to the product owner: vendoring that contract into the repo would close a gap that will otherwise recur on every future mail change.*

---

### T-7 — Bound the pre-send window and re-derive the floor

| | |
|---|---|
| **Status** | 🔄 **IN PROGRESS** — attempt 1 FAILED review, attempt 2 dispatched |
| Date | 2026-09-16 |
| Requirements covered | NFR-7 · `design.md` DD-10, §12 |

**Leader skill/effort:** `nestjs-expert` + `systematic-debugging`; effort **`xhigh`** — the dial rose for *security*, not size.

#### ⚠️ Leader error — concurrency incident during this task

I dispatched T-6 and T-7 in parallel (sanctioned: disjoint files) **and instructed T-7's brief to run the full `npm test -- --silent` suite**. A full-suite run is a global measurement; to get a clean baseline the worker ran `git stash`, which stashed **T-6's uncommitted work**.

**Root cause, named precisely:** `.agents/leader.md` says *"Never run a measurement command while a delegated agent is active."* I applied that rule to myself and **never propagated it into the briefs** — then actively instructed a global measurement inside a parallel dispatch. **This is KZ-010 recurrence ×4**, and it repeats the most uncomfortable detail of ×3: *the detection came from below.* The T-6 worker caught it, not the Leader.

**Worker behaviour was correct and is recorded as such:** T-6 detected the collision, **declined to pop the stash** while another process was mid-run (which would have created a second collision), started a monitor, and reported instead of improvising.

**Recovery:** no work lost. Stash empty on inspection; both workers' edits intact in the tree; T-6's files additionally backed up to the scratchpad before any further action.

**Standing constraints added to every future brief:**
1. **No worker runs `git stash`** — destructive mutation of shared state, not a measurement.
2. **No worker runs the full suite** — scoped commands only. Full-suite runs are Leader-scheduled in a quiet window.

#### Attempt 1 — Reviewer `STATUS: FAIL`

Files changed: `registrations.service.ts` (+227), `registrations.service.spec.ts` (+123), `registrations-verify.e2e.spec.ts`, `email-verification.service.ts` (doc-only), `mail-timing.ts` (doc-only), `mail-timing.spec.ts` (−92).

**What the Reviewer confirmed holds** (verified by reading, not by accepting the account):
- The bound covers the **whole** pre-send region — every `await` in `issueCode` is inside the raced promise; `issueCode` has exactly one call site repo-wide.
- Both traps closed: `.catch(() => {})` attached at race construction **before** `Promise.race`; timer cleared in `.finally` on both paths.
- Floor **composed in code** from the two imported constants — no literal.
- Warn line interpolates only the overrun; no address anywhere.
- Invariant 1 still gated against the **live** constant, in the file `design.md` §8 and `tasks.md` nominate. The double deletion was in bounds and **net-neutral** — the removed target-only test asserted `800 + 1200 ≤ 2000` over constants that `mail-timing.spec.ts` still pins individually — and it **discharges T-1's advisory A7**, exactly as A7 predicted.
- The e2e cost comment updated *and arithmetically re-derived* — the Reviewer recounted the padded requests (3+3+2+1+2 = 11, max 3 per test) rather than trusting the figure.
- `mail-timing.ts`'s doc-only edit ruled **in bounds**: it corrected a statement **T-7 itself falsified**; leaving it would be the drift §12 exists to prevent.

**FAIL issue 1 — the third-exit argument is false against the code it describes.**

The docblock states: *"No branch inside `issueCode` does MORE work for an address that is 'known', 'mid-registration', or has prior live codes — an attacker cannot choose an address that makes this allowance more or less likely to breach."*

`issueCode` **branches on `newSends > OTP_MAX_SENDS_PER_HOUR`**: the over-cap branch throws immediately after the `$transaction`; the under-cap branch additionally pays `generateCode`, `hashCode` and a second DB round trip. **Which branch runs is a function of the address's prior sends in the window** — so an attacker *can* choose an address whose pre-send region costs one fewer round trip. The sentence is the exact negation of what the code does, and is contradicted by **DD-10's own Consequences clause**, which this spec already states: *"they do not perform identical pre-send work… which is precisely why the allowance is sized on the accepted branch, the larger of the two."*

Because the third exit is unpadded, the differential surfaces as a **`500`-vs-`202` distinction under load**, not as latency.

⚠️ **The conclusion may well survive — the argument does not.** The Reviewer noted the safety case holds on DD-10's actual ground (the delta is one `INSERT` plus hashing; the allowance is sized on the *larger* branch so the smaller carries more margin; the exit's own latency is constant at the allowance, so it discloses nothing through timing; and what it converts under load is a bounded delta into a status code, which DD-10 accepts by name — *"failing loudly beats leaking silently"*). **That argument is nowhere in the file.** This is a KZ-011 defect: a claim internally plausible and externally false, in the one place a future reader will trust it.

**FAIL issue 2 — a stale timing constant survives in a file this task edited.** `registrations.service.spec.ts` still reads *"a genuine ~900 ms of wall-clock cost PER TEST"*, in the **present tense**, after the floor became 2000. Same class T-7's Done-when explicitly required fixed in the sibling file — and in the other file from its own Files list. (The `900` references in `registrations.service.ts` and `mail-timing.ts` are correctly framed as *history* and are fine.)

**ADVISORY (non-gating):** a test name overclaims its discrimination — a hardcoded `2000` would keep it green, so it gates invariant 1, not composition-in-code (which is established by reading) · the O(1) synchronous prologue sits outside the timer window but inside the floor window, so nothing leaks · **a breached request `500`s while `issueCode` may still land — burning one of the address's three hourly sends and creating a row for a code never delivered**; a reliability note for T-9, not a timing leak · §12.3's "asserted by one unit test" needs reconciling now that the two invariants live in two files (the split is sanctioned by `tasks.md`).

#### Attempt 2 — dispatched

Effort held at **`xhigh`**, not raised to `max`. The rework rule says bump one level, but the routing rule forbids `max` on a cheaper tier — and escalating the *tier* would put the Implementer on the Reviewer's model, breaking `author ≠ auditor`. The compensation is precision instead of depth: the Reviewer supplied the correct argument's full structure, so attempt 2 is largely transcription of a supplied remediation plus one stale figure.

---

### T-6 — Bound the SES transport with the same deadline

| | |
|---|---|
| **Status** | 🔄 **IN PROGRESS** — attempt 1 FAILED review, attempt 2 dispatched |
| Date | 2026-09-16 |
| Requirements covered | NFR-7 · `design.md` DD-10 |

**Leader skill/effort:** `aws-serverless`; effort `medium` (attempt 2: `high`).

**Worker conduct during the concurrency incident (see T-7's entry).** This worker's task was the one whose files were stashed. It detected the collision, **declined to pop the stash** while another process was mid-run, started a monitor, and reported rather than improvising. It was resumed by the Leader once the tree was quiet and delivered its full evidence then. Recorded because correct behaviour under an incident deserves the same visibility as a defect.

#### Attempt 1 — the finding that justifies the task

⚠️ **`requestTimeout` alone aborts nothing.** The Implementer set it, then went and *checked empirically* that it worked — a standalone probe against a hung server ran past 120 s with the timeout configured. The Reviewer then confirmed it from the **installed vendor source** (`@smithy/node-http-handler@4.9.13`, `set-request-timeout.js`): without `throwOnRequestTimeout`, a breach only calls `logger.warn` and lets the request continue. The vendor's own types say so: *"users must also opt-in for request timeout thrown errors. Without this setting, a breach of the request timeout will be logged as a warning."*

**Had only `requestTimeout` shipped, DD-10's "both transports are bounded" would have been false behind a green suite** — the exact defect class this spec exists to eliminate. Both options are present in the delivered code.

**The test is genuinely behavioural, and self-corroborating.** It un-mocks `SESClient.prototype.send` (`aws-sdk-client-mock` stubs *above* the middleware stack, so nothing built on it can reach the handler at all), points a real client at a silent TCP stub via `AWS_ENDPOINT_URL_SES`, and measures wall-clock to rejection. The Reviewer credited the account without executing it, for a stated reason: **had the endpoint override not been honoured, the request would have hit real SES and failed in a few hundred ms with a credentials error — below the lower bound and with a different error name.** A green run is only reachable if the request really hung and was really killed. The mutation (remove the block ⇒ that test alone hits Jest's ceiling; the other 9 stay green) reconciles for the same reason.

#### Reviewer `STATUS: FAIL` — one blocking issue, and a third option neither the Leader nor the Implementer had found

The Leader asked the Reviewer to rule between (a) switching to `abortSignal` and (b) declaring `@smithy/node-http-handler` as a direct dependency. It rejected **both** and supplied a third that dominates them, verified end to end against the installed sources:

`SESClient`'s `requestHandler` is typed `__HttpHandlerUserInput` — *"the HTTP handler to use **or its constructor options**"* — and the client's own runtimeConfig calls `NodeHttpHandler.create(config.requestHandler)`, which constructs from a plain object whenever the input has no `.handle`. So:

```ts
requestHandler: { requestTimeout: MAIL_SEND_TIMEOUT_MS, throwOnRequestTimeout: true }
```

type-checks fully with **zero imports**, is byte-identical at runtime, guarantees the handler is the exact version `@aws-sdk/client-ses` resolved (declaring it directly risks a *second, version-skewed copy*), needs no `package.json` edit — and therefore creates no removal obligation in T-10 that `tasks.md` does not carry.

**On `abortSignal` (option a), the reason for rejection is worth keeping:** it is genuine first-party API and would work, but it is *per-call* plumbing — a future call site that forgets the argument is silently unbounded, and the bound stops being a property of the client. The handler option makes it a **construction-time property of the singleton**, so every command through it is bounded unconditionally. Measured against this spec's own standard — *"a guard that is hoped for is not a guard"* — the client-level mechanism is the right one.

**Blocking issue:** the delivered code imports `NodeHttpHandler` from a package **not declared** in `backend/package.json`, resolving only by npm hoisting. A `@aws-sdk/client-ses` bump, a lockfile regeneration, or a different npm version breaks the build of the one file keeping DD-10's claim true. Remediation: delete the import, pass the options object, keep the `throwOnRequestTimeout` explanatory comment (**load-bearing — it must survive**), and re-run the *sharper* mutation: drop `throwOnRequestTimeout` **alone**, not the whole block.

#### ADVISORY (non-gating)

| Finding | Note |
|---|---|
| **`maxAttempts: 1` is not merely sound — it is forced.** The Implementer under-sold its own reasoning. Invariant 1 is `800 + 1200 ≤ 2000` with **zero slack**, so any `maxAttempts > 1` makes the worst-case send `n × 1200` ms, breaching the floor and reopening the oracle. There is no defensible alternative while the floor is composed this way | Cost accepted: transient SES throttling now surfaces to the user during Phase A. Correct trade — DD-4 imposes the identical no-internal-retry rule on the microservice transport, so Phase A and Phase B behave the same |
| **Test-window tension, recorded where a maintainer will see it.** The upper bound does double duty — jitter margin *and* the only proof of `maxAttempts: 1`. If it ever flakes, the obvious fix (widen the window) **silently retires the retry discrimination** | Preferred remedy if it flakes: keep the window, assert retry count separately, or raise Jest's per-test timeout — never the assertion bound |
| `AWS_ENDPOINT_URL_SES` is genuine SDK-wide config, not a test seam — no test-only plumbing entered the production file | Scope clean |
| The spec file lacks the `// @sdd-spec … (T-6)` header its sibling carries | Folded into attempt 2 — the file is open anyway |
| The `finally` deletes `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` unconditionally, including when ambient. `jest --runInBand` shares `process.env` across files | Theoretical here; save-and-restore is strictly safer. Folded into attempt 2 as a fix to T-6's own new code |

---

#### Attempt 2 — Reviewer `STATUS: PASS`

> Both FAIL issues are closed and verified against source — the third-exit paragraph now concedes the branch asymmetry in the direction `issueCode` actually goes, with (a)–(d) each reconciling against `email-verification.service.ts`, `mail-timing.ts` and `design.md` DD-10; and the stale ~900 ms is replaced by the named, imported constant with no number restated. The (c) narrowing is correct — a blanket constancy claim would itself have been false — and it opens no address-dependent gap.

**The Implementer improved on the argument it was handed, and that is the notable outcome.** It was given a four-part remediation and told to *verify each part against the code, not transcribe it*. It verified all four and **narrowed (c)**: `Promise.race` cannot see which statement the loser is on, so when the **deadline** wins, elapsed time is constant — but it declined to extend that to the sub-case where `issueCode` rejects from a genuine infrastructure failure *before* the timer fires, where latency is whatever that failure took. It wrote the distinction into the docblock rather than claiming blanket constancy.

**The Reviewer independently ruled the narrowing correct — and sharper than that:** a blanket claim *"this exit's latency is always constant"* **would itself have been a third statement contradicted by the code, in the same docblock**. It then checked the non-deadline sub-case for address dependence specifically and found the only structural correlation (`emailVerification.create` is reachable only on the accepted branch) is **pre-existing, not attacker-inducible, and already conceded by (d)**.

This is the inverse of the attempt-1 defect: attempt 1 wrote a plausible claim the code contradicted; attempt 2 **rejected a plausible claim a reviewer supplied**, because checking it showed it did not hold entire.

It also verified (a) more sharply than asked: no query in `issueCode` scales with the address's history, **and** there is no unique constraint on `email` that could make an address with prior live codes throw deterministically — so there is no address-history-dependent *error* path either.

**Leader-run scope check.** The Reviewer recorded that it could not run `git diff` and asked the Leader to confirm the scope claim. Done: the change since `HEAD` spans T-7's declared Files plus `mail-timing.ts` (doc-only, previously ruled in bounds) — 438 insertions / 137 deletions across 6 files. No file outside that set.

**ADVISORY (non-gating) — all three transferred to T-14, which already owns both files**

| ID | Finding | Disposition |
|---|---|---|
| **A1** | `registrations.service.ts` carries *"(see the O(1) reasoning below)"* — a **dangling pointer**: the string appears nowhere else and nothing below argues query-cost-in-history. The claim it supports is **true** (independently verified), so it misdirects a reader rather than misleading one | → **T-14** |
| **A2** | Two reference imprecisions in `registrations.service.spec.ts`: it points at `mail/mail-timing.ts` as the constant's home, but that file **explicitly states it does not define it**; and *"never restated as a number"* is true of that site but **false file-wide** — Leader-verified, the invariant test's own name restates `800 + 1200 ≤ 2000`. That same test name also **overclaims its discrimination** (a hardcoded `2000` would keep it green; it gates invariant 1, not composition-in-code) | → **T-14** |
| **A3** | **Pre-existing, but T-7 made it more wrong.** `registrations.service.spec.ts` claims *"every test in this block that exercises `requestVerificationCode` now runs through that pad"* — falsified by two tests reaching the deliberately **unpadded** third exit, one of which **T-7 itself added**. Routed *inside* the spec per the leader playbook's routing test: it fails "is it in scope?" but passes "did this spec cause it?" | → **T-14** |

**A boundary worth preserving, in the Reviewer's own words:** *"nothing in the suite can redden if any of this prose is wrong — the docblock is unfalsifiable by test, so this review **is** its only gate."* That is the honest statement of what was established here, and why the argument's correctness mattered more than the code's.

**Final status: ✅ PASS on attempt 2.**

---

#### T-6 attempt 2 — Reviewer `STATUS: PASS`

> The undeclared `@smithy/node-http-handler` import is gone, replaced by a plain `requestHandler` options object carrying **both** `requestTimeout` and `throwOnRequestTimeout: true`; verified against the vendored SDK sources that this form is type-compatible with the intended `NodeHttpHandlerOptions` union member and that the client's runtimeConfig genuinely consumes it, with no dependency added to `package.json` or the lockfile.

**The sharper mutation did its job.** Dropping `throwOnRequestTimeout` **alone**, keeping `requestTimeout`, made the request run past Jest's 10 s ceiling — the single-variable control the Reviewer asked for. It predicted the mechanism and the observation matched: with the option off the vendor warns and lets the request run, the silent stub never responds, and **nothing else bounds it** (`socketTimeout` defaults to disabled; `connectionTimeout` already elapsed on a successful accept). *A merely-"some bound exists" test would have stayed green here.*

Two corroborations the Reviewer added from reading: the green path asserts `name === 'TimeoutError'`, a string produced **only** by the throwing branch of `setRequestTimeout`, so it cannot be satisfied by a socket hangup; and the mutation's *hang* rather than a fast auth error is itself evidence the request reached the local stub rather than real SES.

⚠️ **The finding that changes how the build evidence should be read.** `requestHandler`'s type union includes `Record<string, unknown>`, so **a misspelled option key would still type-check**. `npm run build` clean is therefore **not** evidence the options are honored — only the behavioural test carries that claim. This makes T-6's test load-bearing rather than decorative, and it is the correct outcome: the property is proven where it can be proven, not where it merely compiles.

The Reviewer also confirmed the mechanism end to end against vendored source: `SESClient.d.ts` types `requestHandler` as `__HttpHandlerUserInput`, both keys are declared on the intended member (not slipping through the escape hatch), and `@aws-sdk/client-ses`'s runtimeConfig is literally `NodeHttpHandler.create(config?.requestHandler ?? …)`, with `resolveDefaultConfig` destructuring `throwOnRequestTimeout` out of those options.

**The load-bearing comment was judged against its purpose, not its presence.** The Reviewer asked whether it would actually stop a maintainer from re-introducing an advisory-only timeout, verified its vendor-behaviour claim against `@smithy/node-http-handler`'s source, and noted it also explains *why the import is absent* — which pre-empts a future "helpful" re-import.

**ADVISORY (non-gating) — all recorded, none actioned. `ses-mail.transport.ts` is deleted in T-10, so transferring hygiene fixes into a file with weeks to live would be churn.**

| ID | Finding |
|---|---|
| **A1** | Env-hygiene asymmetry **in the same `finally` the previous advisory just fixed**: `AWS_ENDPOINT_URL_SES` is still deleted unconditionally while the two credential vars now save-and-restore — *the same class of issue, one variable over*. Related: the credential assignments sit **outside** the `try`, so a throw from `server.listen` would leak them into the shared `--runInBand` environment |
| **A2** | The mutation gate's failure shape is deterministic but **not self-describing**: a 10 s Jest ceiling is ~8× the deadline so it cannot be confused with jitter, but its message names the symptom, not the cause. A future maintainer must rediscover the advisory-timeout trap from scratch. An explicit ~3 s watchdog rejecting with *"send never settled — is `throwOnRequestTimeout` still set?"* would fail faster and teach the reader |
| **A3** | The `maxAttempts` comment **inlines 800 / 1200 / 2000** — a fourth copy of constants §12 exists to keep in one place, this time in code. Low-risk (the invariant test would redden in the same edit that staled it) and the Leader's own remediation asked for the arithmetic; flagged so a future value change sweeps this line |

**Final status: ✅ PASS on attempt 2.**

---

### T-4 — Implement the connection lifecycle

| | |
|---|---|
| **Status** | 🔄 **IN PROGRESS** — attempt 1 FAILED review, attempt 2 dispatched |
| Date | 2026-09-16 |
| Requirements covered | FR-1, NFR-1, NFR-2 · `design.md` §4.3, DD-3, DD-4, DD-5, DD-11 |

**Leader skill/effort:** `aws-serverless` + `error-handling-patterns`; **`nestjs-expert` deliberately dropped** (a plain class implementing a one-method interface — no DI, no module registration, no provider). Effort `xhigh`.

**Leader-assigned ownership fix, before dispatch:** `design.md` §4.1 lists `backend/package.json` (`+amqplib`) under Phase A, but **no task's Files carried it** — nobody owned the dependency the whole transport needs. Assigned to T-4.

Files: `microservice-mail.transport.ts` (+604, the class **appended alongside** T-2's untouched builder), `…spec.ts` (+589, 34 tests behind a hand-rolled `amqplib` mock), `mail-transport.factory.ts` (+52/−7), `package.json`.

#### The three inherited constraints — all satisfied, two more strongly than asked

1. **Exhaustive switch:** `default: { const exhaustiveCheck: never = kind; throw … }` — compile-time *and* runtime guard. Assignment is per-`case`, so nothing is cached behind the throw.
2. **Config separation:** rather than merely destructuring at the call site, the Implementer declared **two disjoint types** — `MicroserviceMailBrokerConfig` (carries `rabbitmqUrl`) and `MicroserviceEnvelopeConfig` — so no object in `send()` holds both the credential and reaches the builder.
3. **The probe's two roles:** `probeConnection` returns `'alive' | 'stale' | 'not-found'`; timeout → invalidate + reconnect; `404` → configuration error, thrown immediately, no reconnect.

Mutation (b) is the most instructive: removing the mutex's `finally` reddened **five** tests — the release test plus every later test hanging behind the leaked lock, reproducing exactly the container-lifetime failure the brief warned about.

#### ⚠️ Mock fidelity — the dimension the Leader prioritised, answered against the library itself

The 34 tests run on a mock the Implementer wrote, which can make its own tests pass against behaviour the real library lacks. **The Reviewer checked each behaviour against the installed `amqplib@2.0.1` source** rather than against docblocks: the `404` rejection shape (`convertCloseFrameToError` sets `error.code` from the reply code — so `err.code === 404` **is** the correct discriminator), the confirm-channel callback contract, and the `'error'`/`'close'` emission path (including that `safe_emit` **rethrows** when unlistened, which confirms DD-5's premise).

**Verdict: no test's green depends on behaviour `amqplib` does not have.** One genuine infidelity found — a failed passive declare closes the channel in reality and the mock's does not — and the Reviewer *traced both 404 tests under a faithful mock* to confirm the call counts are unchanged. **The infidelity hides a docblock claim, not a gate** (advisory A-1).

#### Reviewer `STATUS: FAIL`

**Issue 1 — the deadline path does not invalidate the cached connection, and the test compensates for it instead of the code fixing it.**

`§4.3` step 5 requires invalidation on *"deadline, nack, or return"*. Two of the three invalidate; **the deadline does not** — `send()`'s catch sanitizes and rethrows, while only `publishOnce`'s catch clears the cache. A send that times out with the publish still pending leaves the pair cached and `healthy === true`.

**The tell is in the Implementer's own test.** The mutex-release test hand-emits `model.emit('close')` with the comment *"it is still cached and reported healthy — reusing it would just hang again"*. The behaviour was **observed, and worked around in the test**, rather than implemented. That compensation is currently doing the job the gate should do.

Three consequences the Reviewer traced, all in the post-deadline window where the lock is released but `sendLocked` still runs: (a) a wedged pair survives until the next send pays the full probe timeout — **this is D-F's own shape**; (b) `confirmPublish`'s `'return'` listener is removed only inside the ack callback, so on a hung publish it is never removed and a later send's `'return'` can be **attributed to the wrong publish** — the exact mis-attribution DD-11's wide mutex scope exists to prevent — while listeners accumulate on a long-lived channel; (c) `acquireConnection` assigns `cached` unconditionally, so an orphaned `sendLocked` can overwrite a pair a concurrent send just established, leaking it.

**Issue 2 — "detaches cleanup" has no test.** The mock's `close` resolves in the same tick on every path, so an implementation that `await`ed it *inside* the deadline — consuming the caller's budget, precisely what NFR-1's last sentence forbids — **would leave all 34 tests green**. The property is implemented correctly (verified by reading); nothing would change colour if it regressed.

#### ADVISORY

| ID | Finding | Disposition |
|---|---|---|
| **A-1** | The 404 docblock is **false against the real library**: it says the connection "is fine", but a 404 passive declare closes the **channel**. The system still behaves correctly — the `'close'` listener sets `healthy = false` — but the stated reason is not the operating one | → attempt 2. False claims are this spec's recurring defect class |
| **A-2** | One vacuous assertion: `expect(channel.assertQueue).toBeUndefined()` asserts a property of the **mock**, not the transport. (The real gate for FR-1's `BUT` is the mock's minimal surface — a topology call would `TypeError` — which is a good gate, just not the one the line claims) | → attempt 2 |
| **A-3** | Heartbeat placement: **local is defensible and should not move** — §12.1 is the floor budget and §12.2 its sub-budgets; the heartbeat is neither, and T-1's scope forbade adding values to `mail-timing.ts`. **The residual is a design-document gap**: §12 should gain a "connection-level tunables" row. *Also:* the heartbeat **mechanism is ungated** — `connect` reads it only from the URL query, so a refactor to `connect(url, { heartbeat })` would silently disable it | §12 row: **Leader, applied now.** URL assertion → attempt 2 |
| **A-5** | After a stale probe a send can call `amqp.connect` twice (initial + retry) against NFR-2's *"at most once per send"*. One-retry-per-send is the reasonable reading and what the tests gate; the deadline bounds the cost either way | Recorded so the phrasing is not later read as an unnoticed breach |
| **A-6** | NFR-2's literal measure — *"one reconnect **and then exactly one publish**"* — is half-gated: the hanging-probe test asserts the reconnect but never the publish counts | → attempt 2 |
| **A-4** | `@types/amqplib@^0.10.8` is dead weight: `amqplib@2.0.1` ships its own `index.d.ts`, which wins resolution. A 0.10-era types package beside a 2.x runtime is a future footgun | → **T-10 housekeeping** |
| **A-7** | No T-4 test emits `'error'`; that leak path is established by reading only — correct sequencing, since **T-5 owns that gate** | Recorded |

---

#### T-4 attempt 2 — Reviewer `STATUS: PASS`

> Both attempt-1 issues are genuinely closed **in the code rather than in the fixture** — the deadline-path invalidation runs under the held mutex and only on `MicroserviceMailTimeoutError`, the shared-teardown `'return'` sweep covers the hung-publish gap without breaking `amqplib` internals, and the new detached-cleanup test reddens structurally under an awaited teardown.

**The compensating fixture nudge is gone and the assertion became the gate.** The Reviewer traced mutation (a) against the source and confirmed the precise failure it produces: with the invalidation removed, `cached` survives healthy, the second send's probe passes, the publish hangs, and the test advances only 190 ms against a 1200 ms deadline — reddening with exactly the reported text.

**Two library facts the Reviewer checked rather than assumed**, both about the new blunt listener sweep: `amqplib` registers **no** internal `'return'` listener (it only emits), so `removeAllListeners('return')` cannot break library internals; and `safeEmit` rethrows only when a *listener* throws, never on zero listeners, so a late `BasicReturn` on a stripped channel is dropped silently rather than escaping.

**The Implementer refused a Leader instruction, correctly.** I told it to assert a connection had **zero** publishes. It refused: that connection legitimately had **one**, from the first send — asserting zero would have been a green test affirming something false. It captured the baseline and asserted it stays unchanged. The Reviewer verified this rather than accepting it, and found the captured-baseline form is **strictly stronger** than a hardcoded `1`, because the baseline is itself pinned — so the "unchanged" assertion cannot go vacuous by the baseline drifting. *The instruction was mine and it was wrong; check-don't-transcribe caught it.*

#### Accepted residual — recorded as the Reviewer directed

The Implementer **declared** that consequence (c) was not fixed rather than narrowing silently. The Reviewer ruled it **acceptable to close**, and narrowed it further than the Implementer had:

**The window.** `acquireConnection`'s stale-branch teardown is **unreachable** post-fix — it sits after a probe bounded by `MAIL_PROBE_TIMEOUT_MS`, and §12.3 invariant 2 guarantees the overall deadline cannot fire first. The single surviving window is: **the deadline fires while `connectWithRetry` is in flight** (the one unbounded sub-step), `cached` is `undefined` so nothing is invalidated, and the orphan's terminal assign overwrites a pair a concurrent send established meanwhile.

**Reachability** needs two overlapping sends in one container. `ReservedConcurrentExecutions: 5` does not prevent it — it bounds containers, not intra-container interleaving at `await` points. The realistic route is the one the design already names as **D-I**: the fire-and-forget `receipt` times out during a slow connect, the request returns `202`, the container freezes with the orphan pending, and the orphan resumes on thaw beside a new awaited send.

**Worst outcome, ordered:** (1) **one leaked connection** — an orphaned socket plus heartbeat timer, alive for the container's lifetime; (2) a **mis-attributed `'return'`**, second-order, costing one spurious undeliverable error (a `502` on contact, a failed OTP request); (3) **not** a wedged send — DD-11's probe reclassifies any wrong `cached` within 250 ms, which is the structural reason this cannot compound; (4) **not** a duplicate email — one `publish` per `send()`, no retry loop; (5) **not** a credential leak — the orphan's rejection is `.catch()`-guarded and every escape is sanitized.

**Ownership of a follow-up — explicitly *not* T-5.** The Reviewer warned that T-5's "promise orphaned by the deadline race" clause is **credential-scoped** (§4.4); treating it as the owner would quietly convert a cache-integrity residual into a leak-path one. **T-9 is the only place this is observable**: a broker connection-count reading across the cold → idle → warm sequence, where a monotonically growing count is this residual's signature.

⚠️ **B-5 — recorded in `design.md` §12.3, because it changes what a future retune means.** Invariant 2 is load-bearing for a **second, previously unwritten reason**: it is what keeps the orphan's teardown branch unreachable. If anyone retunes §12 so `LOCK_WAIT + PROBE ≥ SEND`, this residual **grows from a leak into "an orphan can tear down a live connection out from under a concurrent send."** Any T-9 re-derivation must re-check the residual, not only the latency budget.

**Other advisories:** **B-1** (no test asserts teardown *happens* — deleting `void model.close()` outright leaves all 36 green) → **transferred to T-5**, same file, one line, with an explicit note not to absorb the cache-integrity residual with it. **B-3** (`withHeartbeat` re-serializes the whole query string; not byte-preserving if an operator supplies a URL already carrying query params) → **transferred to T-8**. **B-2** (the Issue-2 gate fails by hanging to Jest's timeout — correct but opaque; *do not "fix" it later by adding timer advancement, which would silently un-gate it*) → recorded.

**Final status: ✅ PASS on attempt 2.**

---

## Constitution Impact: T-4 — a dependency ships agent instructions

The Reviewer flagged (**B-4**) that `backend/node_modules/amqplib/CLAUDE.md` exists and is auto-loaded into an agent's context as project instructions. **Leader-verified, and broader than reported — three files across two packages:**

```
backend/node_modules/amqplib/CLAUDE.md
backend/node_modules/ts-loader/CLAUDE.md
backend/node_modules/ts-loader/AGENTS.md
```

`ts-loader`'s predate this spec; `amqplib`'s arrived with **T-4's dependency**. Content is benign — the packages' own contributor guidelines (generated-file warnings, commit hygiene). **The mechanism is the finding, not the content:** a third-party package can ship text that a harness ingests as project instruction, and `npm install` is how it arrives.

Not actioned here: root `CLAUDE.md` is a constitutional baseline, and editing it outside a task with no Reviewer would bypass the very dispatch rule that governs it. It is **not** actively misleading today, so it defers to `/akili-archive`'s constitution sync rather than being smuggled into this commit. Recommended there: a `node_modules/**` ignore, or a one-line note under the Concurrency protocol. **Raised to the product owner.**

---

### T-5 — Close all three credential-leak paths, and gate them

| | |
|---|---|
| **Status** | ✅ **PASS** on attempt 1 |
| Date | 2026-09-16 |
| Requirements covered | NFR-3, D-D · `design.md` §4.4, DD-5 |

**Leader skill/effort:** `error-handling-patterns`; effort `xhigh`.

**Files changed:** `microservice-mail.transport.spec.ts`, `mail.config.spec.ts`. **No production code.**

**Verification:** 55/55; eslint clean. **Non-sanitizing variant → 7 red**, with the leak visible in the output: `"microservice mail connection error: read ECONNRESET amqps://produser:sup3rSecr3t@broker.example.org:5671"`, and a full `process.env` dump carrying the live `RABBITMQ_URL`. Reverted; `git diff` on both production files empty.

#### The disclosure that matters more than the result

During its own mutation pass, the Implementer discovered **its first draft of the PATH 3 test was vacuous**: a single-failure connect queue let DD-4's retry self-heal, so nothing ever rejected and nothing could leak. It fixed it, and reported it:

> *"flagging it here since it's exactly the class of defect this task exists to prevent, and worth knowing it nearly slipped through even inside the test-authoring step itself."*

**This is the strongest argument this execution has produced for the mutation rule.** In the one task whose entire purpose is preventing vacuous gates, a vacuous gate was nearly written — and what caught it was not care or expertise but the mechanical requirement to run the mutation. Without that step the test would have been green forever, watching nothing.

#### "No production code changed" — the Leader asked whether this was a finding or a convenience

T-5's Scope says *"sanitize every escaping error"* — implementation language. The Implementer reported reducing it to test-authoring because T-4 had already closed all three paths. **The Reviewer independently enumerated every escape site** in the transport — twelve of them — and confirmed each is sanitized before T-5 touched anything. Callers corroborate: all four log `errorType` (the class name), never `err.message`.

**It found one real structural note in doing so:** `getMicroserviceMailConfig()` is called **outside** `send()`'s `try`, so its throw escapes without passing through `sanitizeEscapingError` — meaning the "final boundary sanitizer" docblock is not literally true for `send()`. The property still holds, because `required()` interpolates only the variable *name*, and **T-5's own A1 fix is exactly what now gates that** — in the other file, which `tasks.md` correctly lists in T-5's Files. Verdict: the reduction to test-authoring is a genuine finding.

#### Reviewer `STATUS: PASS`

> All three §4.4 leak paths now carry a test that injects a genuinely credential-bearing error and asserts absence in `name`, `message` and every Logger level; I independently enumerated the transport's escape sites and confirm T-4 had already closed them, so "no production code changed" is a finding rather than convenience.

Notable reasoning: the Reviewer traced PATH 3's fixture and confirmed the deadline genuinely wins before the late rejection, with the second queue entry load-bearing exactly as claimed. It also ruled on a question the Leader asked — *is the anti-vacuity guard present on every path?* — **and said no, correctly**: paths 1 and 3 produce **zero** Logger calls in unmutated code, so a `some(calls > 0)` guard there would assert something false. The asymmetry is right, not an omission.

#### ADVISORY — six findings; three have no owning task and are raised to the product owner

| ID | Finding | Disposition |
|---|---|---|
| **A-1** | ⚠️ **`fail()` is not defined under jest-circus, and the adjacent `catch` swallows the resulting `ReferenceError`.** If `getMicroserviceMailConfig()` ever stopped throwing, `fail(...)` would raise, be caught two lines below, and every `not.toContain` would pass against the string `"fail is not defined"`. **The test T-5 was assigned to de-vacuum still cannot distinguish "threw cleanly" from "did not throw."** Repo-wide: the same dead pattern sits in `contact.service.spec.ts` and `cognito-error.mapper.spec.ts` | **No owning task** — raised |
| **A-2** | **PATH 1's test name states a mutation that would leave it green.** Its named mutation (passthrough `sanitizeEscapingError`) changes nothing on that path, because `connectWithRetry` constructs the typed error *before* the boundary sanitizer sees it — and zero Logger calls occur there, so that half is structurally unfailable under that single mutation. Both halves *do* redden under the actual six-site variant. PATH 3's name gets this exactly right. **This spec's documented recurring defect class is a comment naming a mechanism that is not the operating one**; the Reviewer said it would not leave it | **No owning task** — raised |
| **A-3** | **PATH 3's non-vacuity rests on a comment, not an assertion.** One fixture edit — dropping the second `connectQueue` entry — silently restores the exact vacuous state the Implementer already hit once, and the suite stays green. `expect(connectMock).toHaveBeenCalledTimes(2)` pins it in one line | **No owning task** — raised |
| **A-4** | The `unhandledRejection` half of PATH 3 **cannot fail**: `Promise.race` internally calls `promise.then(resolve, reject)`, marking it handled, so a late rejection never reaches V8's detector. The assertion passes even with the explicit `.catch()` deleted. The guard is still correct defence-in-depth — it survives a refactor away from `Promise.race` — but it is itself ungated, while §4.4 describes it as the closure | Recorded |
| **A-5** | No **content** assertion on the publish-phase rejection — the nack and return tests assert only `toBeInstanceOf` | Recorded |
| **A-6** | `withHeartbeat`'s docblock is true of `.message` (Node's `ERR_INVALID_URL` is a fixed string) but the error object carries **`err.input`** holding the full URL. Immaterial today; the gate asserts `name`/`message`, so a leak via an error *property* would be invisible to it | Recorded |

⚠️ **A-1, A-2 and A-3 have no later task that owns these files.** Transferring them would file a pointer to nobody — the failure the leader playbook names explicitly. They are therefore **raised to the product owner as a named, bounded decision** rather than recorded as handled.

**Final status: ✅ PASS on attempt 1.**

---

#### T-5 — advisory polish pass (product-owner authorized, Reviewer waived)

The product owner authorized fixing advisories A-1, A-2 and A-3 — vacuity defects **in the task whose purpose is preventing vacuity** — scoped to the two files T-5 already owns. The repo-wide `fail()` pattern in `contact.service.spec.ts` and `cognito-error.mapper.spec.ts` was explicitly fenced out as a separate change.

**No Reviewer on this pass, by waiver.** The Implementer's report is the evidence, and it was told so. **Leader-verified independently afterward:** production files byte-identical to `HEAD` (empty diff on both), only the two spec files changed (+40/−15), and the scoped suite re-run by the Leader on a quiet tree → **55/55**.

**Fix 1 — the strongest form of proof available.** Replaced both `fail()` sites with a captured-message form. The Implementer did not merely show the new form works: it mutated `getMicroserviceMailConfig()` to stop throwing, showed the **new** form reddens (`message` is `''`), then restored the **old** `fail()`-based form from `git show HEAD:…` against *the same mutated source* and showed it **passed**, silently swallowing `ReferenceError: fail is not defined`. That is a direct A/B demonstration that the old gate could not distinguish "threw cleanly" from "did not throw".

**Fix 2 — the rewritten name tells a harder truth than the one it replaced.** Testing the named mutation empirically, the Implementer found the Logger half is not merely un-reddened but **structurally impossible to redden on that path**: `connectFresh`'s `amqp.connect()` rejects before a channel model exists, so `attachHealthListeners` — the file's only `Logger.warn` site — is never attached. It rewrote the name to state the message-half mechanism precisely **and** to say plainly that the Logger check is a structural invariant of the scenario rather than a gate any mutation there reddens. It noted the result is more verbose than its exemplar and declined to shorten it at the cost of a fresh inaccuracy.

⚠️ **Fix 3 — the Reviewer's own suggested fix did not discriminate, and the Implementer caught it.** The Reviewer proposed `expect(connectMock).toHaveBeenCalledTimes(2)`; the Leader relayed it verbatim. The Implementer tested it and found **it does not redden**: deleting the second `connectQueue` entry still leaves `connectMock` called twice, because the mock's `mockImplementation` falls back to a default *successful* script when the queue empties — so the retry still happens, just successfully. It replaced the assertion with `expect(connections.length).toBe(0)` and verified *that* reddens (`Expected: 0, Received: 1`).

**This is the fourth time in this execution that check-don't-transcribe caught a defect in guidance handed down from above** — after T-7 narrowing a Reviewer's four-part argument, T-4 refusing a Leader instruction to assert a false count, and T-5's own mutation pass catching its first draft's vacuity. Here the non-discriminating suggestion originated with the **Reviewer** and passed through the **Leader** unchallenged. Neither caught it; the Implementer did, by running it.

**Residual, unchanged and still owned by nobody:** the dead `fail()` pattern in `contact.service.spec.ts` and `cognito-error.mapper.spec.ts`. Out of this spec's scope; recommended as a standalone `/akili-quick`.

---
