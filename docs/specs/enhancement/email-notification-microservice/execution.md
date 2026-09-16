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
