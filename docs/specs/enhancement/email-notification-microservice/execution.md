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
