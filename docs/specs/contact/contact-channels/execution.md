# Execution Log — General contact form

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/contact/contact-channels/` |
| Started | 2026-08-28 |
| Leader | AKILI Leader (this session) |
| Approval Mode | **gated** (inherited from `proposal.md` Document Control) |
| Branch | `contact-section` |
| Traces | `requirements.md` (rev 2) · `design.md` (rev 6) · `tasks.md` · `judgment.md` |
| Budget (tripwire) | 11 tasks · ~3,400–4,000 LOC · ~15 review rounds (`design.md` §13) |
| Agent wrappers | `.claude/agents/akili-implementer.md`, `akili-reviewer.md` present — roles spawn on their own tier models, so `author ≠ auditor` is enforced by configuration |

## 2. Pre-Execution Environment Record

**2026-08-28 — dependency install, before any delegation.**

`backend/node_modules` and `frontend/node_modules` were **both absent** at the start of this run. Every task in `tasks.md` carries an npm-based `Verify` (`npm test`, `npm run build`, `npm run lint`), so no task could have produced verification evidence in that state — an Implementer would have reported completion against a command that cannot execute, which is the unfalsifiable completion this methodology's evidence-before-checkbox rule exists to prevent.

The Leader ran `npm ci` in both packages (lockfiles present, so the install is reproducible) **before spawning any agent**, and held all delegation until it finished — starting an Implementer during a dependency install is the exact collision the root guide's concurrency protocol describes, where the failure surfaces as an inexplicable error in the other worker.

**Consequence for T-6.** `tasks.md` T-6 carries a verification duty rather than only an implementation one: confirm that `@Throttle` exists in the installed `@nestjs/throttler` and that the unnamed `forRoot` entry is auto-named `default`. That duty was written because `node_modules` was absent when the spec was authored, so the claim rested on `package-lock.json` (which resolves 6.5.0) plus indirect corroboration — the repo reasons about the sibling `@SkipThrottle()` in three places. **With dependencies now installed, that check is directly performable**, and T-6 must perform it rather than inherit the spec's caveat.

## 3. Task Execution History

*(Appended per task: final status, attempts, files changed, verification evidence, Reviewer verdict, ADVISORY findings, decisions, issues.)*

### T-1 — Extend the mail contract and SES transport · **PASS**

| Field | Value |
|---|---|
| Date | 2026-08-28 |
| Implementer attempts | **1** |
| Reviewer verdict | `STATUS: PASS` (+ 6 ADVISORY) |
| Requirements covered | FR-2, FR-4 · `design.md` §2, §4.2, §4.6, DD-5, DD-6 |

**Files changed:** `backend/src/mail/mail-transport.interface.ts` · `ses-mail.transport.ts` · `mail.service.ts` · `ses-mail.transport.spec.ts` · `mail.service.spec.ts`. `no-op-mail.transport.ts` deliberately **not** modified.

**Verification (Implementer):** `cd backend && npm test -- mail --silent` → 6 suites / **43 tests** passing (Leader baseline immediately before the spawn: 6 suites / 37 tests). Full suite `npm test -- --silent` → 57 suites / 681 tests. `npm run build` clean. `npx eslint "{src,test}/**/*.ts" --quiet` clean.

**Red-then-green evidence for the one permitted assertion change** (the task required observing the failure, not merely editing the expectation):

```
Expected: "registry@example.org"
Received: "ACCELERATE Tanzania Seed Registry <registry@example.org>"
```

**Reviewer summary:** widened `to` → `ToAddresses`, conditional `ReplyToAddresses`, the exact §4.2 display name with the exact `includes('<')` guard, and a rethrowing `sendContactMessage` — matching `design.md` §2/§4.6/DD-5 clause for clause. No existing assertion weakened; the no-op transport's no-`to` invariant verified **at source**, including the shape-lock `expect(Object.keys(recorded[0]).sort()).toEqual(['at', 'reference'])` that would catch a later attempt to stash a recipient.

**Independent checks the Reviewer performed beyond the brief:** grepped every reader of `MailMessage.to` in `backend/src` (only the transport) to confirm the type widening breaks no consumer; grepped for any other assertion on `Source`/`ToAddresses`/`ReplyTo` (only `ses-mail.transport.spec.ts`) to confirm no suite silently depended on the bare address.

**Live-path adjudication (the risk R-1 names).** The `Source` display name now applies to the registration OTP and receipt messages too, because it is built in the shared transport. The Reviewer confirmed this is **authorized by DD-5**, which pre-designates the `ses-mail.transport.spec.ts` update as deliberate — not an unflagged side effect. Content, recipients and delivery for those messages are unchanged; only the envelope display name is added.

**Implementer's `Not Done / Assumptions`, verbatim:**

> "I added test coverage beyond the letter of the task's Files list (new cases in ses-mail.transport.spec.ts for array to/ReplyToAddresses/double-wrap guard, and two new cases in mail.service.spec.ts for sendContactMessage, which wasn't listed under T-1's Files). This is additive verification of the new code paths I introduced, not a change to any existing test's behavior or assertions."
> "Did not touch contact-categories.ts, DTOs, controller, module, or templates — out of scope per the task, reserved for T-3/T-4/T-6."
> "No assumption was needed for the From display-name constant text or the double-wrap guard condition — both are stated verbatim in design.md §4.2/§4.6/DD-5."

**Leader adjudication:** nothing owed. The added `mail.service.spec.ts` cases sit outside T-1's `Files` line but inside its `Scope`, which mandates `sendContactMessage` and its rethrow — testing the method the task requires is not scope creep. The omission was in the Leader's `Files` list, not in the Implementer's work. The Reviewer reached the same conclusion independently.

**ADVISORY findings (recorded; they never gate, never trigger rework, and never become new tasks):**

1. `MAIL_SENDER_DISPLAY_NAME`'s docblock says "**every** message … now carries" the fixed name; under the double-wrap branch it carries the operator's instead. The adjacent `buildSource` docblock states the exception correctly, so the file is truthful as a whole — the first sentence read alone is not.
2. "Both are optional additions" in `mail-transport.interface.ts` is imprecise: `replyTo` is optional; `to` is a **widening of a required field**.
3. `sendContactMessage`'s "carries no `reference`" is a convention, not something the signature enforces — a caller could set one. Same class of overclaim `judgment.md` S-2/F-4 flagged in the design itself.
4. `mail.service.spec.ts` did not gain the `// @sdd-spec contact/contact-channels (T-1)` tag the other four files did. Cosmetic; precedent exists for treating it as advisory.
5. **For T-5/T-6's reviewer, not for T-1:** an empty `to: []` would produce `ToAddresses: []` and an SES rejection. The transport adds no guard, which is correct layering — but it makes `design.md` §4.3's fallback **load-bearing for this transport's correctness**.
6. **Deploy-visible consequence, surfaced to the owner rather than left to be discovered by a recipient.** `infra/20-backend/template.yaml` sets `MAIL_SENDER_ADDRESS: j.cadavid@cgiar.org` — no `<`, so the guard does not fire. On the next deploy, **every registration OTP and receipt email's `From` becomes `ACCELERATE Tanzania Seed Registry <j.cadavid@cgiar.org>`**. This is what DD-5 intends and R-1 anticipates, and it intersects **OD-2**: an individual's mailbox now presents under the registry's name. To be repeated in the PR description.
### T-2 — Reply-To composition utility · **PASS**

| Field | Value |
|---|---|
| Date | 2026-08-28 |
| Implementer attempts | **1** |
| Reviewer verdict | `STATUS: PASS` (+ 3 ADVISORY) |
| Requirements covered | FR-4 (`AND IT MUST compose the Reply-To display name safely`), DC-3 · `design.md` §4.5 |

**Files added:** `backend/src/contact/reply-to.util.ts` · `reply-to.util.spec.ts` (both new).

**Verification:** `cd backend && npm test -- reply-to` → 1 suite / **22 tests** passing. Lint clean.

**The task's crux — the full character set — is closed.** `QUOTING_TRIGGERS = /["\\<>,;:@]/` carries all eight, and the spec drives **one individual case per character** plus a combined `\` + `"` case. Deleting a single character from the class reddens exactly one test. This is the defect an earlier design revision shipped (full set specified, four-character test row) and the reason the task's "Done when" called it out.

**RFC arithmetic verified by the Reviewer by hand, not taken on trust:** prefix `=?UTF-8?B?` (10) + suffix `?=` (2) = 12 overhead → base64 budget 63 → `MAX_CHUNK_OCTETS = floor(63/4)*3 = 45` → every emitted word `12 + ceil(n/3)*4 ≤ 72` ≤ 75. Optimal, not merely safe: 46 raw octets would need 64 > 63. Worked through the test's own 200×`文` case — 600 octets → 14 words → lines of 72, 73×12, 52, all far under 998, correctly **folded rather than truncated**. `for...of` iteration walks by code point, so an astral character's surrogate pair is never split.

**Both declared assumptions independently CONFIRMED** (the Leader's provisional adjudication held, but the Reviewer was instructed to refute if wrong, since a malformed `Reply-To` on an attacker-controlled field is a header-safety defect, not a style issue):

1. *`CRLF SP` fold rather than a bare space* — RFC 2047 §6.2 has decoders discard linear whitespace between adjacent encoded-words. A bare space would satisfy separation but would not fold, and §4.5's 998-octet clause is unreachable without folding for a 200-character non-ASCII name. It is the only choice satisfying both clauses at once.
2. *RFC 2047 takes precedence over quoting, never nested* — RFC 2047 §5 states outright that an encoded-word MUST NOT appear inside a `quoted-string`, and raw non-ASCII is equally invalid as `qtext`. The `else if` order is the correct resolution of an overlap `design.md` §4.5 left abstract.

**KZ-002 check answered directly:** all 22 tests discriminate. On the specific question asked — a splitter that silently drops a chunk **is** caught, because `decodeRfc2047(wordPart)` reassembles every encoded-word and asserts `toBe(longName)` against the full 200-character original; a dropped chunk shortens the result. The same test independently pins each word ≤75 and each line ≤998, so an inflated `MAX_CHUNK_OCTETS` also reddens it.

**KZ-008:** nine docblock RFC claims re-resolved against the code, all accurate. Two cosmetic imprecisions noted (the 75-octet cap is RFC 2047 §2, cited as §5; "no padding" is true of full chunks but not the final partial one — the budget holds regardless).

---

#### ⚠️ FORWARD POINTER — T-3 and T-6 must carry this, and their briefs will state it

**The folded `CRLF SP` value flows into a SES *API parameter*, not a raw MIME header.** `ses-mail.transport.ts` passes the composed string as `ReplyToAddresses: [message.replyTo]`. **SES builds the header itself and validates each array element as an address** — a folded, multi-line element may be rejected with `InvalidParameterValue` rather than folded through.

Folding is unambiguously mandated by `design.md` §4.5 ("no line exceeds 998"), and T-1 is already PASSed, so this is **not a defect in T-2 or T-1**. It is a boundary between two correct decisions that no unit test can exercise, because both sides are mocked.

- **Risk window:** non-ASCII display names longer than roughly 15 characters — exactly the case the 200-character DTO cap makes reachable.
- **Owed by T-3/T-6:** an explicit check when `composeReplyTo` is wired into the template and service, ideally a real (non-mocked) send in Dev.
- **Why this is recorded loudly:** a forward pointer is not carried by having been filed. The brief carries it or nobody does.

**Other ADVISORY findings (recorded; they never gate and never become tasks):**

1. C0 control characters other than CR/LF (e.g. `\x00`, `\x1B`) pass through unquoted and unencoded — valid in neither `atext` nor `qtext`, so the result is RFC-malformed without taking the fallback. Outside `design.md` §4.5's enumerated set and not a header-injection sequence under NFR-2, so not a violation. Widening `CR_LF` to `/[\x00-\x1F\x7F]/g` would close it in one edit.
2. "Never throws" is very slightly overstated — the two `stripCrLf` calls sit outside the `try`, so a non-string reaching the function from untyped JS would throw past the fallback. Theoretical given the signature and the `?? ''` guards.
3. Address-side edge cases (`<`/`>` inside the address, an empty address) produce a questionable value, but the spec's named fallback — the bare address — would be equally malformed, so the fallback is not the remedy; `@IsEmail` + `@MaxLength(254)` is the layer that owns it.
### T-4 — Categories, DTO, and the request-body cap · **PASS** (2 attempts)

| Field | Value |
|---|---|
| Date | 2026-08-28 |
| Implementer attempts | **2** — attempt 1 FAIL, attempt 2 PASS |
| Requirements covered | FR-2 (both scenarios), FR-6, FR-8, NFR-2 · `design.md` §4.1.1, §4.2 |

**Files:** `backend/src/contact/contact-categories.ts` (new) · `dto/contact-create.dto.ts` (new) · `dto/contact-create.dto.spec.ts` (new) · `backend/src/common/payload-cap.config.ts` (modified) · `payload-cap.config.spec.ts` (modified).

#### Attempt 1 — `STATUS: FAIL`, one issue

**Discovered issue.** `name`, `subject` and `message` were declared required but carried only `@IsString() @MaxLength(...)`, which **accepts the empty string**. A submission with all three empty passed the production `createValidationPipe()` and would have been relayed to every administrator recipient as an empty message.

**Violated rule.** `requirements.md` FR-2, scenario "Valid submission" — *"AND IT MUST reject the submission with field-level errors when a required field is missing"*, read against the same scenario's GIVEN, *"a visitor has **completed** every required field"*.

**Root cause — adjudicated as a Leader spec defect, not an Implementer defect.** `design.md` §4.1.1's table mixed prose with decorator names (`email`'s row read "required, valid email, `@MaxLength(254)`") and never stated how "required" is *encoded*. The rows pairing "required" with a semantic rule — `@IsEmail`, `@IsIn`, `@Equals(true)` — exclude `""` incidentally. The three plain-string rows had nothing enforcing it. The Implementer translated the decorator-named parts literally, **declared that choice in its `Not Done / Assumptions`**, and could not have discovered the missing idiom from the table.

**The idiom the Leader failed to cite.** `@IsNotEmpty` appears **nowhere** in `backend/src`; this repo uses `@MinLength(1)`, applied consistently in `registration-create.dto.ts` on `traderName`, `contactPerson` and `policyVersion`, and deliberately omitted on optional strings such as `position` and `district`. That is exactly the required/optional split §4.1.1's table describes, already encoded in the codebase.

**Leader action before rework:** amended `design.md` §4.1.1's three rows to state `@MinLength(1)` explicitly, with a dated note recording why `organization` and the honeypot keep no `MinLength`. Fixing only the DTO would have left the next reader to re-translate the same prose and reach the same conclusion.

#### Attempt 2 — `STATUS: PASS` (+ 2 ADVISORY)

Scope was narrow by instruction: `@MinLength(1)` on exactly the three required strings, between `@IsString()` and `@MaxLength(...)`; nothing previously cleared touched.

**Verification (Implementer):** targeted 3 suites / **62 tests** (was 57 — five additions). **Verification (Leader, re-run on a quiet tree to discharge ADVISORY 1):** `npm test -- --silent` → **59 suites / 744 tests passed**; `npm run build` clean; `npx eslint "{src,test}/**/*.ts" --quiet` clean.

**Reviewer verification that went beyond taking the code at its word:**

- Read `class-validator`'s **actual source** rather than assuming semantics: `IsOptional` registers the predicate `value !== null && value !== undefined`, so `''` is **not** skipped and every sibling decorator still runs on it; `MinLength` resolves to `typeof value === 'string' && isLength(value, {min})`, false for `''`. Therefore adding `@MinLength(1)` to `organization` or the honeypot **would** produce a `400`, and the two acceptance tests genuinely fail in that case. **The required/optional asymmetry is pinned in both directions**, not inferred.
- Reconstructed the 57 → 62 delta independently by expanding every `it.each`: 34 + 28 = 62 and 29 + 28 = 57. The arithmetic closes on five pure additions with zero replacements, deletions or skips.
- Confirmed `@IsNotEmpty` still returns zero occurrences across `backend/src`, so the amendment note's own premise remains true after the fix.
- KZ-008: verified rather than accepted the Implementer's claim that no docblock needed editing — the class docblock claims the DTO transcribes §4.1.1's table, the *table* changed, so the claim stayed true.

**Shared-file safety (cleared in attempt 1, restated because it matters).** `payload-cap.config.ts` belongs to `actors/public-self-registration`. The generalization `isRegistrationsPath` → `isCappedPath` is a pure widening: `REGISTRATIONS_PATH_PREFIX` is element 0 of `CAPPED_PATH_PREFIXES`, so for any registrations path the predicate is bit-identical to the original disjunction. Case-insensitivity, segment-boundary handling and the chunked/malformed-`Content-Length` bypass are untouched, and `REGISTRATIONS_PAYLOAD_CAP_BYTES` keeps its exported name — confirmed imported by `lambda-handler.e2e.spec.ts`.

**Concurrency incident, recorded because the protocol predicted it.** The Implementer disclosed that an earlier run of the full suite "collided with a leftover background test process I had started and produced spurious flaky failures in unrelated e2e suites", and re-ran in isolation. That is exactly the failure the root guide's concurrency protocol describes — *a measurement taken beside an active worker is not slow, it is wrong*. It was self-detected and self-corrected, and the clean figure was independently re-confirmed by the Leader on a quiet tree.

*Jest emits "a worker process has failed to exit gracefully" on the full run. It is a teardown warning, not a failure — all 744 pass. No full-suite baseline was taken before this spec began, so it is **unattributed** rather than assumed pre-existing.*

---

#### ⚠️ FORWARD POINTER — T-3 must carry this (second one; see also T-2's)

`organization: ''` is now an explicitly **accepted** value, pinned by test. `design.md` §4.5 renders organization as body data, so **`''` and `undefined` must render identically** — an empty-string organization must not produce a dangling `Organization:` label with nothing after it. T-3's template unit tests must assert this.

**Other ADVISORY:** the Leader-run full suite above discharges the Reviewer's note that it could not verify the 744 figure as a read-only auditor.
### T-5 — Administrator recipient resolver · **PASS**

| Field | Value |
|---|---|
| Date | 2026-08-28 · Attempts **1** · Reviewer `STATUS: PASS` (+ 5 ADVISORY) |
| Requirements covered | FR-3 (both scenarios, all clauses), NFR-8, DC-2 · `design.md` §4.3 |

**Files added:** `backend/src/contact/admin-recipient.resolver.ts` + spec. **Verification:** 1 suite / 11 tests; full suite 60 / 755 (baseline 59 / 744 — exactly +1 suite / +11 tests); build and lint clean.

**The adjudication the Leader asked for — and the Leader's premise was partly wrong.** The Leader flagged that `getFallback()` throws when `onModuleInit` has not run, and asked whether that violates "never throws to its caller". The Reviewer **grepped the spec folder** and found `design.md` §4.3 contains **no such sentence at all**; the only occurrence is `tasks.md`, scoped to *"never throws to its caller **on a directory failure**"* — and every directory-adjacent throw (`getCognitoAdminClient`, `getUserPoolId`, every `client.send()`) is inside the `try`. FR-3's "Directory unavailable" scenario presupposes a bootstrapped app, so its precondition and the throwing state are mutually exclusive. **Ruling: not a defect.** The alternative — returning `[]` — is precisely what T-1's forward pointer forbids, and under DD-3's awaited send a throw becomes the `502` FR-5 mandates, which is the opposite of a silent discard.

**Verified structurally, not only by test:** `resolve()` has exactly two `return` statements, and the Reviewer traced both — `this.cached.emails` (written in one place, non-empty by the length ternary) and `result` (non-empty by construction). `fetchAdminEmails()` can return `[]` but is private and length-checked before use. **The "never empty" invariant holds by construction**, so the transport's absent guard is safe.

**Cache discriminates in both directions**, at a **1 ms** boundary rather than a wide margin: `now + 59_000` → 1 SDK call, `now + 60_001` → 2. An inflated TTL reddens it. `staff` exclusion is structural — one `ADMIN_GROUP_NAME` reference, and the test arms a `staff` stub to prove no filter-after-query implementation would pass.

**ADVISORY (recorded; none gate):**

1. Docblock overclaim (KZ-008 shape): line 20 says *"The resolver NEVER throws to its caller"*, contradicted by lines 154-160 of the same file. Same kind as T-2's advisory. One-sentence edit, fold into T-6.
2. **Stale rationale:** the docblock justifies init-time validation partly because a lazy throw would land *"inside a fire-and-forget-shaped continuation"*. **DD-3 retired fire-and-forget** — the send is awaited. Left uncorrected, it could lead T-6's implementer to believe dispatch is fire-and-forget.
3. `design.md` §4.2's "fails loudly" clause for a 50+ admin group is **unowned** — the implementation correctly does not truncate, but there is no loud-failure path, and no task owns it. Would also close a theoretical infinite loop if a page ever echoed its own `NextToken`.
4. `CONTACT_FALLBACK_RECIPIENT` is checked for presence, not shape — a whitespace-only value would become the sole recipient. Deploy-time misconfiguration, T-11's surface.

5. **⚠️ FORWARD POINTER for T-6 — carried into its brief.** The docblock's "per-container cache" claim holds **only under Nest's default singleton scope**. Registering `AdminRecipientResolver` with `Scope.REQUEST` or `Scope.TRANSIENT` in `contact.module.ts` would **silently void NFR-8 and DC-2 while every test in this file still passes**, because they instantiate the class directly. T-6 must register it as a plain default-scoped provider.

---

## Leader Decisions — 2026-08-28, arising from T-3's report

T-3's Implementer escalated two items rather than resolving them alone. Both turned out to be **defects in `design.md` §4.5**, not in the implementation. §4.5 has been amended; both decisions were put to the owner and approved.

### Decision A — no `CRLF SP` folding; join encoded words with a single space

**T-3's investigation** (it was asked to report, explicitly not to change T-2's code): the SDK's `Source` documentation requires encoded-word syntax for a non-ASCII friendly name and says **nothing about line folding**; `ReplyToAddresses` is terser still. This is `SendEmail`, a **structured** API — **SES assembles the MIME headers itself** from these field values, which is why `buildSource()` never folds either. A literal `\r\n ` inside the value is therefore a raw-header artifact in a logical field, the shape address-list validators commonly reject as containing control characters. Conclusion recorded honestly as **"evidence suggests unsafe, not confirmed unsafe"** — the transport spec only mocks the SDK, so real SES parameter validation is unobservable from this checkout.

**Root cause: a false premise in `design.md` §4.5.** The clause "no line exceeds 998" assumed we assemble the header line. We do not. A single space satisfies RFC 2047 §5's separation rule, §6.2 still discards whitespace between adjacent encoded words so the text reconstructs exactly, and line wrapping returns to SES where it belongs. **The 998-octet clause is withdrawn.**

**Consequence: T-2 is reopened.** It is already `[x]` with a PASS, but its output no longer matches the amended spec. Changing its code silently inside another task would break the audit trail, so T-2 returns to `[~]` for a scoped rework and re-review.

### Decision B — CR/LF stripping covers single-line fields only

T-3 followed §4.5's literal "strip CR/LF from every field", **flagged the consequence rather than quietly choosing otherwise**, and covered it with a test: a multi-paragraph submission was being flattened to one unreadable line in the administrators' inboxes.

The Implementer was right and the spec was wrong. CR/LF stripping exists for **header safety**; `message` renders into `Message.Body.Text.Data`, where a newline is a newline and no header can be injected. `name`, `organization`, `category` and the visitor-submitted `subject` stay stripped — the last because the server generates the real `Subject` header while that value renders as a single-line body label.

**T-3 is marked `[~]`** pending rework against the amended §4.5. Its implementation is otherwise complete and its verification was green (1 suite / 19 tests; full suite 61 / 774).
### T-2 — REWORK after Decision A · **PASS**

| Field | Value |
|---|---|
| Date | 2026-08-28 · Rework attempts **1** · Reviewer `STATUS: PASS` (+ 6 ADVISORY) |
| Reason for reopening | Not a defect in the original work — `design.md` §4.5 rested on a false premise (see Decision A) |

**Delta:** `ENCODED_WORD_FOLD = '\r\n '` → `ENCODED_WORD_JOINER = ' '`; `anyLineExceedsHeaderLimit`, its call site and `MAX_HEADER_LINE_OCTETS` **removed**; docblocks rewritten to drop every folding claim; two withdrawn-behaviour tests removed and the "splits and folds" test replaced.

**Verification:** 20 tests in-file; full suite **61 / 772**. Lint and build clean.

**The trap was avoided, and the Reviewer proved it arithmetically rather than trusting the test.** A repo-wide grep for the three removed symbols returns **zero** hits — gone, not bypassed, not dead. Reconstructing the numbers: `'文'.repeat(200)` = 600 octets → `MAX_CHUNK_OCTETS` 45 → 15 chars/chunk → 14 encoded words → 13×72 + 32 + 13 join spaces = **981**, plus `' <jane@example.org>'` (19) = **exactly 1000**. A reinstated 998 guard fires, the function returns the bare address, and `expect(result).not.toBe(address)` reddens.

**Independent corroboration of the test count:** T-3's entry recorded the full suite at 61 / **774**; this rework reports 61 / **772** — same suite count, exactly −2 tests, consistent only with two deletions in this one file and no change anywhere else.

**Confirmed:** all eight quoting triggers survive individually; `qtext`-aware escaping, 2047-over-quoting precedence, the 75/45 arithmetic, code-point-safe splitting and both fallbacks are intact. `decodeRfc2047` reassembles at the **byte** level before a single UTF-8 decode — a faithful reading of RFC 2047 §6.2, not a decoder tuned to pass.

**ADVISORY (recorded; none gate, none become tasks):**

1. **⚠️ The trap test's margin is 2 octets.** It discriminates only because the fixture address is 16 characters: 981 + 19 = 1000 > 998. **A guard reinstated over the display-name portion alone (981) would not fire, and a shorter fixture address would sink the total below 998 — the test would silently stop discriminating.** The gate that protects against the regression is itself fragile to an unrelated fixture edit. Worth pinning the arithmetic in a comment on a future touch.
2. `decodeRfc2047`'s `.trim()` is vestigial from the folding era — with it, the helper alone can no longer detect a reinstated fold; the three explicit `not.toContain` assertions carry that burden alone.
3. `ENCODED_WORD_JOINER`'s docblock says SES "would reject" a literal `CRLF SP`, firmer than §4.5's own hedge ("validators *commonly* reject") and **still unverified** — the original forward pointer asked for a real non-mocked Dev send, which has not happened.
4. `reply-to.util.ts` line 8 still calls `ReplyToAddresses` a "header" — the exact premise amendment 1 overturned. The same docblock corrects itself 45 lines later.
5. Carried unchanged from the original T-2 review: "Never throws" slightly overstated; the 75-octet cap is RFC 2047 §2 cited as §5; "no padding" holds for full chunks only.

6. **⚠️ FORWARD POINTER for T-3's review — carried into its brief.** `contact.template.spec.ts` asserting `result.replyTo` against `composeReplyTo`'s **own live output** is what made it immune to this amendment — but it is **self-referential**: it proves *delegation*, not *correctness*, and would stay green if `composeReplyTo` regressed. That is the right trade for a delegation test; flagged so T-3's audit does not mistake it for coverage of the composition rules.
### T-3 — Message template · **PASS** (implemented, then reworked after Decision B)

| Field | Value |
|---|---|
| Date | 2026-08-28 · Implementer attempts **2** (both complete; the first was correct against the spec as written) · Reviewer `STATUS: PASS` (+ 5 ADVISORY) |
| Requirements covered | FR-4, `design.md` §4.5, §6 content-abuse row |

**Files added:** `backend/src/mail/templates/contact.template.ts` + spec. **Verification:** 20 tests in-file; full suite **61 / 773**; build and lint clean.

**Attempt 1 was not a failure.** It followed §4.5's literal "strip CR/LF from every field", **measured the consequence** (multi-paragraph submissions flattened to one unreadable line in administrators' inboxes), documented the trade-off in the docblock, covered it with a test, and escalated the alternative to the Leader. That is the correct response to an instruction that turns out to be wrong. The spec was amended (Decision B) and the rework followed.

**The field split, verified in `renderBody` itself rather than by test alone:** `name`, `email`, `organization`, `category` and the visitor-submitted `subject` are stripped; `message` is bound raw (`const message = data.message;`) and rendered last. The Reviewer corrected the Implementer's own framing on one point — `email` being stripped is **affirmatively right**, not merely inert: `Email: ${email}` is a labelled single-line body field, so it falls inside "single-line fields only".

**KZ-002 holds in both directions, per field.** Reinstating stripping on `message` reddens two tests independently; removing it from any one of the four reddens that field's own test only, because each has its own `it`, its own data override and its own distinct payload — no shared render, so no field's regression can hide behind another's. The multi-paragraph fixture deliberately mixes `\r\n`, `\n` and splits on `/\r\n|\r|\n/`, proving `message` survives **verbatim**, not merely that "some newline survived".

**The header-injection test — adjudicated HONEST, not self-serving.** The Leader asked the Implementer to assess whether its own security assertion was meaningful or merely reassuring, and to say so plainly if it could not assert it meaningfully. It reported that the claim is real within `buildContactMessage`'s contract but is **not** a claim about SES's MIME assembly. The Reviewer verified the boundary rather than accepting it: `buildContactMessage` returns `{ to (parameter), subject (module constant), text, replyTo (composed from name/email) }` and `data.message` is referenced **exactly once** in the file — there is no code path from `message` to any header-shaped field. `ses-mail.transport.ts` places `message.text` in `Message.Body.Text.Data` and nowhere else. **Boundary accurate, not evasive.**

**The T-2 forward pointer was discharged correctly.** T-3 does not duplicate T-2's composition rules — no test here asserts quoting, RFC 2047 encoding, chunk splitting, the single-space join or the fallback. Better than the pointer asked for: the plain-ASCII case adds a second, **non-self-referential** literal assertion (`'Jane Requester <jane@example.org>'`), which the Reviewer re-derived from `reply-to.util.ts` independently. A regression in `composeReplyTo`'s simple path would now redden T-3's suite too, **partially repairing the self-referentiality** T-2's reviewer flagged.

**A limitation the Reviewer stated rather than glossed:** the files are untracked, so there is no git baseline to diff the previous 19 tests against, and it could not mechanically prove no surviving assertion was loosened. It substituted the stronger check — re-deriving every assertion against the code and confirming each would redden against the mutation it names — and the arithmetic closes (19 → 20, one removal, two additions, suite count held at 61).

**ADVISORY (recorded; none gate):**

1. **Acted on before the checkbox flipped:** `tasks.md` T-3's "Done when" still carried *"CR/LF are stripped from every field"* — the premise Decision B withdrew. `design.md` was amended and `tasks.md` was not. **Corrected now.** The Reviewer's framing is the right one: leaving it is how the next reader re-derives a withdrawn premise, which is precisely the failure Decisions A and B were escalated over.
2. The docblock's stripping enumeration names four fields while the code strips five (`email` omitted). The general clause covers it; the list does not.
3. `email` is the one CR/LF branch with no test in this file — inert in practice, since `@IsEmail` precludes CR/LF in a valid value, so no gate is missing.
4. **Accepted residual, recorded so it is known rather than discovered:** because `message` renders last and unstripped, a visitor can emit lines that *look* like labelled fields (`Organization: Ministry of Agriculture`) beneath the real ones. A reader scanning the whole body could be misled. This is the correct trade — the alternative is the unreadable flattening that reopened T-3 — and it sits inside `design.md` §6's already-accepted content-abuse residue, mitigated by the mandatory provenance line.
5. The header-injection test's incremental value is modest, as the Implementer itself said: its three header assertions restate earlier tests under a different payload. Correctly scoped and honestly described.
### T-6 — Contact module, controller and service · **IMPLEMENTED, awaiting review** · surfaced a 12-suite regression

| Field | Value |
|---|---|
| Date | 2026-08-28 · Implementer attempts **1** · Review pending |

**Files:** `contact.module.ts`, `contact.controller.ts`, `contact.service.ts`, `contact.service.spec.ts` (new) · `app.module.ts` (registration) · `admin-recipient.resolver.ts` (two docblock sentences, per a forward pointer).

**The `@Throttle` verification duty is DISCHARGED with evidence from the installed package** — the caveat `design.md` §4.2 carried because `node_modules` was absent when the spec was written:
- `dist/throttler.decorator.d.ts`: `Throttle: (options) => MethodDecorator & ClassDecorator` — it exists and is class-usable.
- `dist/throttler.guard.js`'s `onModuleInit`: `.map((opt) => ({ ...opt, name: opt.name ?? 'default' }))` — an unnamed `forRoot` entry **is** auto-named `default`, which is the exact key `@Throttle({ default: {...} })` is looked up on.
- **Both hold, so no fallback-to-20/60 s acceptance was needed** and the endpoint's limit is genuinely 5/60 s.

#### The regression, recorded in full because two amendment notes cite it

Registering `ContactModule` in `app.module.ts` — a mandatory item of T-6's own scope — placed `AdminRecipientResolver` into **every** graph that includes `AppModule`. T-5's then-current `onModuleInit` threw when `CONTACT_FALLBACK_RECIPIENT` was unset, so **12 pre-existing e2e suites failed: 62 suites run, 12 failed / 50 passed; 781 tests run, 153 failed / 628 passed.**

```
Missing required env var CONTACT_FALLBACK_RECIPIENT...
  at AdminRecipientResolver.readFallback (contact/admin-recipient.resolver.ts:85:13)
  at AdminRecipientResolver.onModuleInit (contact/admin-recipient.resolver.ts:79:26)
  at ... callModuleInitHook ... Proxy.init (nest-application.js:105:9)
```

The twelve, each owned by an already-landed spec and none of which had reason to know about this variable: `common/payload-cap.e2e` · `logging/logging-scope.e2e` · `registrations/{lookup,submit,throttle,verify}.e2e` · `test/admin-actor-import.e2e` · `test/admin-actors-crud.e2e` · `test/admin-actors.e2e` · **`test/lambda-handler.e2e`** · `test/partner-profile-onboarding-import.e2e` · **`test/pii-boundary`** — the last being the PII release gate.

**What the Implementer did, and why it mattered.** It did **not** weaken T-5's already-reviewed validation to make its own tests pass, and did **not** edit the twelve suites, which were outside its stated constraint. It completed its mandated scope, reported the interaction verbatim, and returned it labelled as a Leader adjudication, citing KZ-007 — *"three correct constraints whose interaction is where a defect lives"* — which is precisely what this was. **Either shortcut would have produced a green run and left in place a defect where a contact-form environment variable can prevent the entire API from booting.**

#### Leader adjudication — Decision C: revert to lazy validation

Investigating rather than patching the tests found that **the instruction's own justification had been retired.** `design.md` §4.3 read: *"under fire-and-forget that landed inside a swallowed continuation"* — and **DD-3 removed fire-and-forget in the same revision.** With the send awaited, a lazy throw is no longer swallowed. The justification was void the moment it was written, and it passed a Reviewer.

**The signal was already on the record and the Leader misread it.** T-5's Reviewer had flagged the stale fire-and-forget sentence surviving in the resolver's docblock. The Leader treated it as a comment to fix in passing, rather than as evidence that the *decision that comment justified* no longer had a basis. **An obsolete comment is rarely alone.**

The repo had also already settled the question: `mail.config.ts` documents the pattern across three config modules — *"Resolved lazily … not at module init, so a checkout without `MAIL_TRANSPORT` set can still boot and serve every other route."*

**Remediation chosen: amend `design.md` §4.3 to lazy resolution and rework T-5.** Explicitly rejected: seeding the variable into the twelve suites. That would have turned the run green while leaving the real defect — the blast radius — untouched, and would have taxed every future e2e suite with knowledge it should not need. The rework was instructed to touch **only** the resolver and its spec, and all twelve suites now pass **unmodified**, verified by the Leader on a quiet tree and corroborated by a repo-wide grep showing `CONTACT_FALLBACK_RECIPIENT` appears in exactly two files.
### T-5 — REWORK after Decision C · **PASS**

| Field | Value |
|---|---|
| Date | 2026-08-28 · Rework attempts **1** · Reviewer `STATUS: PASS` (+ 6 ADVISORY) |

**Delta:** `OnModuleInit` and the `fallback` field removed; `getFallback()` reads the env var at first use and throws there; docblocks rewritten; the init-throw test replaced by three (construction does not throw; `resolve()` rejects on both the empty-group and directory-failure sub-cases) plus a module-lifecycle test.

**Verification — Implementer:** 14 tests in-file; full suite **62 / 784, zero failures**. **Leader re-verified on a quiet tree:** same figures, `pii-boundary` and `lambda-handler` green individually, newest-file check confirming no e2e suite was edited.

**The never-empty invariant survived, and the Reviewer found a property the change created:** the `getFallback()` throw is evaluated **inside the ternary, before the assignment to `this.cached`** — so a missing variable cannot poison the cache with an empty entry. `ToAddresses: []` remains unreachable; T-1's forward pointer stays discharged.

**Why the twelve suites count as the real gate.** The Reviewer verified the premise rather than assuming it: `package.json`'s jest config declares **no `setupFiles` and no dotenv loader**, and a repo-wide grep for `CONTACT_FALLBACK_RECIPIENT` returns hits in **exactly two files** — the resolver and its spec. So those suites pass because `AppModule` genuinely boots without the variable, **not** because anything seeded it. The substitution the amendment existed to prevent did not occur.

**Test arithmetic closed with zero residual:** 11 − 1 + 4 = 14 in-file; suite 773 → 784 = +1 suite (T-6's `contact.service.spec.ts`, counted at exactly 8) + 3 here. Zero residual independently proves no other suite anywhere lost or gained a test.

---

### T-6 — Contact module, controller and service · **PASS**

| Field | Value |
|---|---|
| Date | 2026-08-28 · Implementer attempts **1** · Reviewer `STATUS: PASS` (+ 4 ADVISORY) |
| Requirements covered | FR-2, FR-3, FR-5, FR-7, FR-8, NFR-2, NFR-7 · `design.md` §3, §3.1, §3.2, §4.1, §4.2, §4.4, DD-3, DD-4 |

**The trap was not taken.** DD-3 requires the send to be **awaited**; the resolver's docblock had carried a stale fire-and-forget sentence that could have led the implementer to the wrong pattern. `await this.mailService.sendContactMessage(message)` sits directly inside the `try`, and a grep for `void this`/`.catch(` across `backend/src/contact/` returns **zero** — the only hits repo-wide are in `registrations.service.ts`, the deliberately fire-and-forget OTP path.

**The awaited-ness test genuinely discriminates.** It resolves the mocked send inside `setImmediate`: against a `void … .catch()` shape the method would resume on a microtask, before the check-phase callback, and `sendResolved` would be `false`. A real gate, not an execution.

**The `@Throttle` verification duty — independently re-confirmed by the Reviewer**, which also read the piece neither the task nor the Implementer named: `throttler.guard.js` reads `THROTTLER_LIMIT + namedThrottler.name` through `Reflector.getAllAndOverride([handler, classRef])` and applies `routeOrClassLimit || namedThrottler.limit`. **The endpoint's limit is genuinely 5/60 s**, not silently 20/60 s. The Reviewer also noted the Implementer's `dist` quotation was semantically right but **not literally verbatim** (the shipped bundle is downleveled to ES5) — a precision worth keeping, since a "verbatim" citation that is not verbatim is the KZ-008 shape.

**Other verified points:** no second `ThrottlerModule.forRoot()` (the module does not even import `ThrottlerModule`); `registrations-throttle.e2e.spec.ts` still observes **its own** 20/60 s, unaffected because `generateKey` is `${class}-${handler}-${name}`; `AdminRecipientResolver` registered plain with **zero** `scope:` matches in the directory — a defect with no automated gate, confirmed structurally; `forRoutes(ContactController)`, never `'*'`; **zero** `Prisma` matches anywhere in `backend/src/contact/`, and no docblock claims FR-7 is structural — it correctly defers to DC-4's gate; the honeypot's emptiness rule correctly accepts `website: ''`, matching T-4's position, so a browser submitting an empty hidden input still dispatches.

#### Leader adjudication — Decision D: a missing fallback is `500`, not `502`

**Both Reviewers found this independently**, which is what makes it a confirmed finding rather than one opinion. `ContactService` calls `resolve()` **outside** its `try`, so a missing `CONTACT_FALLBACK_RECIPIENT` escapes as a plain `Error` → Nest renders `500`, while `design.md` §4.3 and the resolver's docblock both assert `502`.

Neither Reviewer called it a FAIL, and both were right not to: **the divergence is between two Leader-owned documents, not between spec and implementation.** `tasks.md` T-6 says "`502` on transport rejection" verbatim and the Implementer conformed exactly.

**Ruling: the code is right and the documents were wrong.** A missing environment variable is *our* misconfiguration, not an upstream gateway failure — `500` is the accurate status. Moving `resolve()` inside the `try` would have made the sentence true at the price of making the status wrong. `design.md` §3 and §4.3 amended; **the resolver's docblock still repeats the `502` claim and is carried to T-7 as a correction.**

*This is the third time in this spec a docblock or design sentence asserted a downstream behaviour the downstream file did not implement — after the fire-and-forget premise, twice.*

**ADVISORY (recorded; none gate):** `ContactModule` cannot be compiled standalone — it imports no `ThrottlerModule`, so a `TestingModule` importing only it fails to resolve `ThrottlerGuard`'s options token. `tasks.md` T-7 already anticipates this. · Two docblock cross-references in `contact.module.ts` are imprecise analogies (conflating re-importing a `@Global()` module with re-calling `forRoot`); both substantive conclusions are correct. · The honeypot's timing signal is now booked in `design.md` §4.1.1's residual paragraph. · `execution.md` previously had no T-6 entry despite two amendment notes citing it — **closed above**.
### T-7 — Endpoint e2e: submission, honeypot, throttle · **PASS**

| Field | Value |
|---|---|
| Date | 2026-08-28 · Implementer attempts **1** · Reviewer `STATUS: PASS` (+ 5 ADVISORY) |
| Requirements covered | FR-2, FR-5, FR-6, FR-8, NFR-2, NFR-7, DC-5 |

**Files:** `backend/src/contact/contact.e2e.spec.ts` (new, **23 tests**) · `admin-recipient.resolver.ts` (one docblock sentence — the Decision D 502→500 correction).

**Verification — Leader-measured on a quiet tree:** `contact.e2e` 23/23 · `registrations-throttle` still green at **its own** 20/60 s · full suite **63 suites / 807 tests, zero failures** (baseline 62 / 784, so +1 suite / +23 tests with zero residual).

#### The discrimination was proven, not asserted

`tasks.md` required the throttle gate to fail against a controller with **no guard at all**. The Implementer did not stop at claiming it would: it temporarily stripped `@UseGuards(ThrottlerGuard)`, `@UseFilters(ThrottlerExceptionFilter)` and `@Throttle(...)` from `ContactController`, ran the test, and observed the red:

```
Expected: 429
Received: 202
Tests: 1 failed, 22 passed, 23 total
```

then restored the file from a pre-edit backup and diffed to confirm. **That red/restore cycle is the sole cause of `contact.controller.ts`'s modification timestamp**, which the Leader had queried as a possible scope violation.

**The Implementer disclosed the gap in its own process without being pushed:** *"I should have reported this step explicitly at the time rather than let a stray mtime be the only trace — that's a gap in my own diligence, not in the file's content."* Correct on both halves.

**Both halves of the gate carry weight** — the Reviewer answered the Leader's specific question: the count assertion is **not** carried by the status. Against an unguarded controller the loop still passes (5×202, counts 1…5) and the status fails first; the count assertion *would also* fail, since the 6th would dispatch and reach 6. It independently catches a different mutation — a guard that rejects **after** the handler has already run.

#### The fixture proves itself

The `afterEach` `ThrottlerStorage` clear is the kind of mechanism that can silently disable the gate it serves. The Reviewer verified it two ways: `@nestjs/throttler`'s `ThrottlerStorageService` really is `_storage = new Map()`, so `.clear()` is a genuine `Map.clear` and not a no-op on a plain object; and — the stronger argument — **the arrangement is self-validating in the safe direction.** Twenty-two requests reach the Nest guard before the throttle test runs, so a clear that did nothing would leave that test's **first** request at `429`, failing `expect(res.status).toBe(202)`. The green run therefore proves the seam is real.

#### Other assertions that discriminate rather than observe

- **Over-cap body asserts `413`, not `400`** — proving rejection at the Express-level payload cap, *ahead* of DTO validation. A `400` would mean the body was parsed first, defeating NFR-2's purpose.
- **`502` fixture carries a real leak shape:** `Error('Email address: admin-two@example.org is not verified in the SES sandbox (MessageRejected)')` with `.name = 'MessageRejected'`, where that address is a genuine member of the mocked recipient list — not a decoy. Assertions run against `res.text` for **values**, never key names.
- **Honeypot, all three:** filled → `202` + zero dispatch; 10 KB value → `202`, never a `400` naming the field (which is what proves no cap was added to the trap, and stays under 32 KB so it genuinely reaches validation rather than passing via a `413`); `website: ''` → `202` **and dispatch count 1**, the KZ-002 gate on T-4's accepted position.
- **Recipient assertion is a deep equality** against the mocked resolver's list plus `toHaveBeenCalledTimes(1)` — FR-2's "**one** message addressed to every resolved administrator", not "a send happened".
- **KZ-002 sweep across all 23:** the Reviewer named the mutation each would catch. None passes against a broken implementation.

#### A verification limit, recorded rather than papered over

The Reviewer stated it could not run `git`, so its "byte-identical" finding for `contact.controller.ts` is inferred from a full content read plus the zero-residual arithmetic, not measured. It proposed a closing check for the Leader: `git diff --stat -- backend/src/contact/contact.controller.ts`.

**The Leader ran it, and it proves nothing** — `backend/src/contact/` is entirely **untracked**, so a `git diff` on any file in it returns empty regardless of content. No fault of the Reviewer, which had no way to discover the tracking state. **The controller's integrity therefore rests on the content read and the arithmetic, which is what actually did the work.**

*Consequence worth stating for the rest of this spec: with nothing committed, no "restore" or "unchanged" claim in this run has a git baseline to be checked against.*

**ADVISORY (recorded; none gate):** `storage.clear()` leaves `timeoutIds` populated — harmless today (the suite finishes well under 60 s, `app.close()` clears them) and the failure direction is safe, since a stale timer can only turn the throttle test red, never green. · The seam couples to a library internal (`throttlerStorage.storage`); a minor bump would break loudly, not silently. · The dispatch seam asserts only `to`; `design.md` §10 also names `replyTo`/subject/body, which `tasks.md`'s coverage table assigns to T-1/T-2/T-3's unit specs — noted so the row is not later read as unowned. · Honeypot tests compare status, not bodies; indistinguishability holds structurally via `Promise<void>` + unconditional `@HttpCode(202)`. · The `502` test has no **positive** assertion on the friendly envelope — an accidentally emptied body would pass. Outside T-7's scope; T-9 owns the visitor-facing half.
### T-8 — FR-7's zero-writes gate, and the PII boundary extension · **PASS**

| Field | Value |
|---|---|
| Date | 2026-08-28 · Implementer attempts **1** · Reviewer `STATUS: PASS` (+ 4 ADVISORY) |
| Requirements covered | FR-7, **NFR-1 (release gate)**, DC-1, DC-4 |

**Files:** `backend/src/contact/contact-no-writes.e2e.spec.ts` (new) · `backend/src/test/pii-boundary.spec.ts` (extended — a release gate owned by `actors/public-self-registration`).

**Verification — Leader-measured on a quiet tree:** **64 suites / 815 tests, zero failures** (baseline 63 / 807, so +1 suite / +8). Build and lint clean. `git diff --stat -- backend/src/contact/contact.service.ts` → **empty**, so the transient red-proof mutations are *provably* reverted — the first task in this spec where that claim could be measured rather than inferred, thanks to commit `19bffbf`.

#### Both gates were observed failing. That was the task.

**DC-4 red proof:** a `PrismaService` param added to `ContactService` and `await this.prismaService.actor.findMany()` inserted at the top of `submitContact`. **3 of 4 tests reddened** — `Received: 1` on success and honeypot, `Received: 5` on throttled. The Reviewer confirmed those numbers are arithmetically consistent with the injection point (above the honeypot short-circuit, and 5 allowed requests before the 429).

**PII red proof** — `err.name` → `err.message`, driving a `MessageRejected`-shaped rejection:

```
Expected substring: not "contact-admin-recipient-do-not-leak@example.org"
Received string: "...contact message send failed: errorType=Email address is not
verified. The following identities failed the check in region EU-WEST-1:
contact-admin-recipient-do-not-leak@example.org"
```

That is not a test passing — **it is the leak §3.2 exists to prevent, happening.** The AWS SDK error carries the recipient address verbatim in its `message`; one word changed in the catch block puts it in CloudWatch. There is now a gate that has been seen catching it.

#### The one-line deletion in the release gate — bounded arithmetically, not by assurance

`git diff --stat` showed **230 insertions, 1 deletion** in a file owned by another spec. The Reviewer identified the deletion as line 3's import, rewritten in place: `import { RequestMethod }` → `import { Logger, RequestMethod }`, with `RequestMethod` already used at lines 659/665 (pre-existing) and `Logger` used only inside the new block.

**The proof is the arithmetic:** 1,413 original lines − 1 + 230 = 1,642 actual. Insertions decompose as 1 (rewritten import) + 2 (new imports) + 227 (the append, verified to begin at line 1416, immediately after the `});` closing the pre-existing B28 block). **Because the count is exact, any other mid-file edit is arithmetically excluded** — a changed assertion would have produced a second deletion; a mid-file insertion would have pushed insertions past 230. No pre-existing `describe`, assertion or fixture was touched, and the new block is a **fifth sibling**, not a modification.

*The Reviewer also corrected the Implementer's own wording: "lines 1–1413 byte-identical" is not literally true, since line 3 changed. The substance held; the phrasing overstated it.*

#### The gate that could have been vacuous, and was not

`design.md` §10 names two ways DC-4 could pass unconditionally. Both were checked:
- **Standalone `ContactModule`** → `PrismaService` absent from the graph, `overrideProvider` a silent no-op. **Avoided:** the suite compiles the real `AppModule`, where `PrismaModule` is `@Global()` and the token genuinely resolves.
- **A flat mock** → would not intercept the calls a real violation makes. **Avoided:** `buildNoWritesPrismaMock()` models the **delegate shape** (`actor`, `registration`, `cropsOnActors`, `actorAuditLog`, each with 13 spied methods), and the camelCase names were verified against real call sites.

#### A coverage boundary, stated plainly rather than left implied

The Leader asked whether the validation-failure test's staying green during the red proof indicated a gap. **The Reviewer's answer: yes, and it is structural.** `@IsIn(CONTACT_CATEGORIES)` makes the global pipe reject before `ContactController` — and therefore before `ContactService` — ever runs, so an injected Prisma call there is unreachable.

**Plainly: DC-4's validation-failure test has no gate over `ContactService`.** What it does gate is narrower but real — the code that *does* execute on a 400: `RequestContextMiddleware`, the throttle guard, the payload cap, the global pipe and the exception filter. If a future audit-logging exception filter began querying Prisma, this catches it. FR-7 is satisfied on that path structurally, because no service code runs there to violate it.

#### The disclosed flake — investigated, not waved through

The Implementer reported one non-reproducing flake on a pre-existing `registrations` 429-isolation test (B28) — **in the same file T-8 edited**, which is why it warranted the check. The Reviewer found **no shared-state mechanism**: B28 compiles its own `AppModule` with its own DI container, so `ThrottlerStorageService` instances are distinct; the new block is declared after B28 and its `Logger` spies are `beforeEach`-scoped inside its own describe; Jest's per-file module registry rules out cross-file sharing.

The residual mechanism is **timing, not state**: B28 drives 21 sequential requests inside a 60 s window, so a process stall lets early hits expire before the 21st arrives. T-8 adds two `AppModule`-compiling suites and therefore adds load — **it can make a pre-existing window-dependent assertion trip more often; it does not create the fragility.** The Leader's quiet-tree run (64/815, zero failures) is the confirming re-run. Recorded as a known load-sensitive test.

**ADVISORY (recorded; none gate):**

1. **A trap for whoever adds a fifth test.** The new `pii-boundary` block issues exactly 4 requests against the 5/60 s limit and — unlike `contact-no-writes.e2e.spec.ts` — does **not** clear `ThrottlerStorage` between tests. Deterministic today; a fifth test would `429` and fail for a reason unrelated to PII. Adding the same `afterEach` clear would make the two T-8 suites consistent and remove the trap.
2. **A narrowing worth recording rather than assuming absent:** DC-4 stubs `AdminRecipientResolver` and `MailService`, so a Prisma query introduced *inside the resolver* would be invisible to FR-7's only gate. Low risk today — that file imports only `@nestjs/common` and the Cognito SDK — and the stubs are unavoidable, since the real resolver calls Cognito.
3. No `429` path in the NFR-1 block; `design.md` §10's "any response, error or log line" reads slightly wider than what is asserted. Exposure minimal — the 429 envelope is fixed and the middleware line carries no fixture value.
4. `PRISMA_DELEGATE_METHODS`'s docblock claims "every method Prisma generates" but omits `findUniqueOrThrow`, `findFirstOrThrow`, `createManyAndReturn`. Not a hole: a call to a missing method hits `undefined` and surfaces as a loud 500, failing the status assertion rather than passing silently. The sentence is imprecise, not the gate.
### T-9 — Contact form component and API client · **PASS** (2 attempts)

| Field | Value |
|---|---|
| Date | 2026-08-28 · Implementer attempts **2** — attempt 1 FAIL, attempt 2 PASS · Reviewer `STATUS: PASS` (+ 2 ADVISORY) |
| Requirements covered | FR-2, FR-5, NFR-3, NFR-4, NFR-6, NFR-7 · `design.md` §5.1 |

**Files:** `frontend/lib/api/contact.ts` + test · `frontend/components/contact/ContactForm.tsx` + test (all new).

**Frontend baseline, established by the Leader before the spawn** (none existed for this package): **88 suites / 1357 tests**; lint emits **3 pre-existing `<img>` warnings** in admin test files. *(The Leader's first reading said "one" — a truncated `tail -4`. The Implementer's count of three was correct and the Leader's baseline was the wrong one.)*

**Verification after rework — Leader-measured on a quiet tree:** **90 suites / 1379 tests**, lint clean of new warnings.

#### The anti-pattern was avoided — which was the point of the brief

The nearest precedent, `OtpVerificationStep.classifySendError`, returns `err.message || GENERIC` for every non-400/429; combined with `apiFetch` setting `message` to `HTTP <status> <statusText>` on a non-JSON body, copying it renders **"HTTP 502 Bad Gateway"** into the form — the exposure FR-5 forbids. The brief warned that the exemplar contains the anti-pattern.

`extractFieldErrors` has three exits and **none reads `err.message`**; it partitions on `Array.isArray(err.details) && err.details.length > 0`, never on `err.status`. The Reviewer confirmed both holes the design warned about are real and both fall to the constant: `BodyShapeValidationPipe` emits `details: []`, and `apiFetch` leaves `details` undefined on a non-JSON body. `429` and amendment 3's `500` are covered by the same status-blind branch.

#### Attempt 1 — `STATUS: FAIL`: the fourth comment asserting behaviour the code did not perform

`ContactForm.tsx` documented, in a file-header comment **and** an inline comment, that it moves focus to the success panel so a screen-reader user is told the outcome after the form unmounts. **It did not.** No `useEffect` was imported, `successRef.current` was never read, and `tabIndex={-1}` on the panel had no consumer — it existed only as a target for an effect that did not exist. On success the form unmounted with the focused submit button inside it and focus fell to `<body>`.

**The exemplar the file itself cites does the opposite.** `StatusLookupForm.tsx` (T21-A1) carries the effect *and* a comment recording why: a prior defect where "a result did not announce at all and left focus wherever it was — on the just-removed submit button, which drops it to `<body>` once the form is gone."

**The Implementer copied the panel's structure and the rationale comment, and left the mechanism behind.** No test asserted focus, so the claim was **unfalsifiable as well as untrue** — a reviewer asking only "do the tests pass?" would have let it through.

#### Attempt 2 — the fix, with the red observed

```
● ContactForm › successful submission › moves focus onto the success panel (T9-A1)
    expect(element).toHaveFocus()
    Expected element with focus: <div ... role="status" ...>
    Received element with focus: <body>...
```

That is the `<body>`-focus defect itself, observed. Restored from backup with an empty `diff`, then green. The Reviewer verified the effect is structurally identical to the exemplar — guard for guard, dep for dep — and that `tabIndex={-1}` is now **load-bearing**: a `<div>` without it is not a valid focus target, so `.focus()` would silently no-op.

#### One advisory folded into the rework, declared as an exception

The Reviewer found a **vacuous assertion**: `queryByLabelText(/website/i, …)` matched nothing, because the honeypot's label reads "Leave this field blank" — it **would have passed against a fully visible, tabbable honeypot**. Advisories neither gate nor grow scope, and that rule is not relaxed generally; this one was included because it was **a gate that could not fail, inside the test file the rework already opened**. Retargeted at the real label; the Reviewer confirmed it is now genuinely failable (`queryByLabelText` is not accessibility-tree filtered, so neither `aria-hidden` nor `sr-only` suppresses it — only the `input:not([tabindex="-1"])` selector does). The other three advisories were explicitly excluded and confirmed **not** implemented.

#### An operational rule the Leader did not have

The Implementer disclosed that `react-doctor` "reported no changed source files against `main` (git scope/diff quirk on untracked new files)" and did not chase it. The Reviewer's adjudication:

> *"It is **both**: an honest limitation, correctly declared, **and** a mandated skill that effectively did not run. `git diff main` cannot see untracked files, so the tool's 'no changed source files' is a true report of a no-op, not a clean pass. The Leader should treat 'skill reported no files' as an **unrun skill, never as a pass**."*

It then **substituted the skipped skill's work by hand** — verifying every hook is declared above the conditional return (no conditional-hook hazard), the dependency array is complete, `successRef` is correctly omitted as a stable ref, no cleanup is needed, and the effect sets no state so it cannot loop — and said so rather than leaving the gap silent.

**Mitigation for future frontend tasks:** `git add -N` restores diff visibility for untracked files. Committing T-9 achieves the same for T-10.

**ADVISORY (recorded):** two dangling identifiers in `ContactForm.tsx`'s header — **KZ-008 instances 5 and 6 in this spec**, of a lesser class than the FAIL because they misname a correct performer rather than assert absent behaviour. Line 29 cites `classifySubmitError`, which lives in `OtpVerificationStep.tsx`, not here (the function is `extractFieldErrors`) — sharpened by line 22 telling the reader "this is the one part a Reviewer will re-derive line by line" and then pointing at a symbol that is not in the file. Line 71 cites `handleSuccess`, which does not exist; the clear is inline in `handleSubmit`. Both describe behaviour the code genuinely performs. · The retargeted honeypot assertion is now redundant with an adjacent `tabIndex` check — acceptable, since the defect was vacuity, not duplication.
### T-10 — Pages, navigation and entry points · **PASS on the automatable scope · DC-9 OWED · task remains `[~]`**

| Field | Value |
|---|---|
| Date | 2026-08-28 · Implementer attempts **1** · Reviewer `STATUS: PASS` (+ 4 ADVISORY) |
| Requirements covered | FR-1, FR-6, NFR-3, NFR-4, NFR-5, DC-11 · **DC-9 not covered — manual gate, unperformed** |

**Files:** `app/(public)/contact/page.tsx`, `app/(public)/privacy/page.tsx` + a11y tests, `components/shell/Footer.test.tsx` (new) · `Header.tsx` + test, `Footer.tsx`, About page + test, `ClosingCTA.tsx` + test, `RestrictedContactPanel.tsx`, `ProfileView.test.tsx` (modified).

**Verification — Leader-measured on a quiet tree:** **93 suites / 1399 tests** (baseline 90 / 1379); `out/contact/index.html` and `out/privacy/index.html` both present on disk; lint clean of new output. The Reviewer reconstructed the +20 exactly (13 new + 7 added to modified suites) and confirmed zero `.skip`/`.only`/`.todo` repo-wide.

#### DC-9 was declared owed, not smuggled

The brief told the Implementer it could not discharge this gate and must not pretend to. It reported: *"I did not perform the rendered capture at 375/768/1440. No browser or Playwright binary is available… I am not claiming it looks fine — this is an owed, unverified gap."*

The Reviewer verified that claim rather than accepting it: it grepped `375|1440|768|crowd|wrap|visual|capture|DC-9` across every `.tsx` and found **no visual-conformance assertion anywhere** — every hit is either a pre-existing class or an explicit disclaimer (`Footer.test.tsx`: *"not asserting layout/visual density (that is DC-9's manual gate, out of jsdom's reach)"*). **This is the opposite of the KZ-008 pattern this spec has produced six times.**

#### The nav finding — the Implementer was right, and understated it

It computed ~725 px of nav content against ~720 px of container width at `md` and returned it as a placement question rather than shortening a label. The Reviewer sanity-checked the arithmetic against the actual classes and found the figure correct **but incomplete**: it omitted the two non-shrinkable siblings.

| Component | Estimated min-content at `md` |
|---|---|
| Nav (7 entries, `gap-6`, `px-1`/`px-3`, Inter `text-sm`) | ≈ 740 px |
| Brand lockup (`shrink-0`, `sm:h-10` + descriptor) | ≈ 368 px |
| `AuthSlot` ("Staff sign-in", `whitespace-nowrap`) | ≈ 109 px |
| Two `gap-4` | 32 px |
| **Row total** | **≈ 1 250 px against 720 px available** |

**Two consequences that reframe the decision:**

1. The crowding threshold is not `md` — it is **≈ 1 300 px viewport**, so the header is over budget across most of the `md`–`lg`–`xl` band.
2. **With six entries the row already demanded ≈ 1 163 px.** This is a **pre-existing overflow that Contact deepens by ≈ 87 px, not one it creates.**

That independently vindicates the Implementer's refusal to shorten a label: relabelling or dropping Contact does not bring the row inside budget. The real levers are the desktop-nav breakpoint (`md` → `lg`), the brand descriptor, or moving an entry off the bar.

**A caution the Reviewer stated and the Leader endorses:** *"These are estimates derived from class inspection, not measurements — they sharpen DC-9's question, they do not discharge it."* And they sit oddly against the fact that the site is deployed and no one has reported a broken header, which is itself evidence the glyph estimates may run high. **The capture settles it; the arithmetic only says where to look.**

#### `react-doctor` ran this time, and one of its findings is wrong

Committing T-9 restored diff visibility (the operational rule from that task's review: *"skill reported no files" is an unrun skill, never a pass*). It scanned 13 changed files, scored 86/100, and raised two findings — **both in `ContactForm.tsx`, T-9's file, which T-10 was forbidden to touch. The Implementer flagged rather than fixed them, which was correct.**

- **"Missing accessible label" on the honeypot — the tool is wrong on the association.** `fieldId` is a `useCallback` over `useId()`, so a static linter cannot match a computed `htmlFor` to a computed `id`; the same dynamic pattern serves all six real fields. The input does lack an accessible *name in the a11y tree*, but only because the wrapper is `aria-hidden="true"` — **required** by FR-8 and asserted by T-9's own test. **"Fixing" it with an `aria-label` would re-expose the trap.** T-9's Reviewer was right; no follow-up.
- **`nextjs-no-a-element` on `<a href="/privacy">` — real, minor, worth a follow-up.** It is the **only** bare internal `<a href="/…">` in the entire frontend, so it is a genuine consistency defect and costs a full document reload. It is **not** broken in production: `infra/30-frontend/template.yaml`'s CloudFront viewer-request function rewrites extensionless `/privacy` → `/privacy/index.html` — which is exactly the `trailingSlash: true` mismatch that would otherwise bite, since `next/link` emits `/privacy/` while a bare `<a>` emits `/privacy`.

**ADVISORY (recorded):**

1. **DC-9 remains owed. T-10 must not flip to `[x]` until the 375/768/1440 capture is taken at the HITL pause.** This entry records a PASS on the automatable scope only.
2. The nav-crowding finding goes to the owner with the corrected numbers above.
3. **KZ-008 instance 7, and this one is in a test comment.** `Header.test.tsx:288` claims *"A second, divergent list would either drop the mobile occurrence or duplicate it further; either way this count would no longer be exactly 2."* **Not true** — replacing the drawer's `NAV_LINKS.map` with a verbatim hardcoded array keeps the count at exactly 2 and the test green. The requirement (both renderings, correct href) *is* genuinely proven; the structural "no second list" clause was discharged by the Reviewer's inspection, not by that assertion. Either soften the comment or assert `NAV_LINKS.length * 2` occurrences after opening the drawer.
4. Follow-up on T-9's file: convert `ContactForm.tsx:557`'s bare `<a>` to `next/link`.

### T-11 — IAM, environment, and baseline-document sync · **PASS on the automatable scope · SAM VALIDATE UNVERIFIABLE · task remains `[~]`**

**Implementer:** T2 (`sonnet`), effort medium, skills `aws-serverless` + `software-architect`.

**Delivered as specified.** `cognito-idp:ListUsersInGroup` appended to the existing action-scoped Cognito statement in `infra/20-backend/template.yaml` (twelfth action; the list is not alphabetical, so thematic order was matched rather than an alphabetical order invented), scoped to the same imported user-pool ARN. `CONTACT_FALLBACK_RECIPIENT` added to `Environment.Variables` as a literal, matching the idiom of its neighbours `MAIL_TRANSPORT` and `MAIL_SENDER_ADDRESS` — which are literals, not CloudFormation `Parameter`s. TRD §4 gained the `POST /api/v1/contact` row; TRD §13 gained QA-13, worded from `requirements.md` NFR-1 rather than paraphrased. `docs/ux-ui/design.md` §2 gained `/contact` and `/privacy` and had the stale `/directory/[id]` corrected to `/profile?id=`; §4 gained both screen rows; §5's nav model was re-derived from the actual `NAV_LINKS` array, correcting the pre-existing staleness on Dashboard and About.

**`CONTACT_FALLBACK_RECIPIENT`'s value was inferred, not specified.** No spec document states it. The Implementer set it to `j.cadavid@cgiar.org` and documented the reasoning inline: under the SES sandbox (`design.md` §7.2) only a verified identity can receive mail, and that address is the only identity this template verifies. A fallback recipient that cannot receive mail is not a fallback. The inference is sound and is recorded here so the owner can override it when ATP-58 lands the dedicated address.

#### Why this task does not close

**`./infra/scripts/validate.sh` did not run: `sam: command not found` for all three stacks.** The AWS SAM CLI is not installed on this machine, so `--profile IBD-DEV` credential resolution was never reached. The Implementer did not edit the script and did not drop the profile flag — both correct. The done-when clause *"SAM validate passes with `--profile IBD-DEV`"* is therefore **unverified, and is not claimed**. T-11 stays `[~]` for the same reason T-10 does: an unevidenced clause is an open clause (KZ-001).

**What was verified instead, and what that does and does not prove.** All three templates were parsed with `js-yaml` under a schema extended with the CloudFormation short tags (`!Ref`, `!Sub`, `!GetAtt`, `!ImportValue`, …); all three parse clean, and `ListUsersInGroup` and `CONTACT_FALLBACK_RECIPIENT` are both present in the parsed tree of `20-backend`. This rules out the dominant failure mode of a hand edit — broken indentation or syntax — and satisfies the done-when's *"confirm the action is present in the rendered template, not merely that validate passed"*. It does **not** substitute for `sam validate`, which additionally checks SAM resource semantics. Recorded as the weaker evidence it is.

#### Leader-initiated scope extension — the local environment did not work as documented

`backend/.env.example` was rewritten from a single `DATABASE_URL` line into a grouped, code-derived checklist (owner-authorized: the owner has never run this project locally). Deriving it from `process.env.` across `backend/src` surfaced three defects in the documented local route, none of them introduced by this spec, all of them directly in the path of the owner's request:

| # | Defect | Fix |
|---|---|---|
| 1 | **Port collision.** `main.ts` defaults to `PORT ?? 3000` — the same port as the Next.js dev server. Whichever process starts second fails to bind. `docs/infrastructure.md` §6 asserted "API on `:3001`, **per `backend/.env.example`**" while that file said nothing about a port — an assertion sourced to an artifact that did not bear it (KZ-008), in the constitutional baseline. | `PORT=3001` now set, uncommented, in `backend/.env.example`, which makes §6's claim true at its cited source. |
| 2 | **No CORS anywhere in the backend.** Frontend `:3000` → API `:3001` is cross-origin; the browser blocks every call. The documented primary route could not actually exercise the app. | `app.enableCors({ origin: process.env.LOCAL_CORS_ORIGIN ?? 'http://localhost:3000', credentials: true })` in **`main.ts` only**. Verified first that `lambda.ts` bootstraps independently and never imports `main.ts`, so the deployed surface is unchanged: production is same-origin behind CloudFront and must stay that way. §6 records the asymmetry and why `lambda.ts` must not mirror it. |
| 3 | **`NEXT_PUBLIC_API_BASE_URL` shipped empty**, and `client.ts` throws on first call when unset — so a fresh `cp` of the example produced a frontend that could not reach any API. | Defaulted to `http://localhost:3001`, with the build-time-inlining caveat noted. |

`main.ts` is the only `backend/src/` file touched. It has no test coverage and no importer other than the `start` script.

**Verification after the extension:** `npx eslint "{src,test}/**/*.ts" --quiet` clean · `npm run build` clean · `npm test -- --silent` **64 suites / 815 tests, all green**.

**No Reviewer was dispatched.** Deliberate, and recorded rather than omitted. T-11 is configuration and documentation; the one code change is a four-line local-only bootstrap edit on a file no test or deployed path imports, verified by parse, lint, build and the full suite. The owner had explicitly challenged this spec's process cost as disproportionate to the feature, and an adversarial review round here would have been ceremony. The residual risk is accepted at Leader level and named here: **`sam validate` remains owed**, and it is the check most likely to catch anything a YAML parse cannot.

## T-10 — DC-9 closure · 2026-08-31 · **the gate FAILED, was fixed, and is now closed on measured evidence**

DC-9 was the one clause in this spec no automated check could reach, held open since T-10's review. The owner captured it and it **failed**: at 768×681 the header did not merely crowd, it forced a horizontal scrollbar on the whole page.

`tasks.md` T-10 instructed that a crowded nav **stop and return to the owner as a placement question**, and forbade resolving it by shortening a label or dropping an entry. That is what happened — the owner made the call. No label was shortened.

### The measurement, which contradicted the Leader's own estimate

Prior rounds reasoned about this bar from class-inspection arithmetic. That arithmetic was directionally right and **quantitatively wrong**, and its error changed the diagnosis. Chromium was driven over the DevTools protocol (`Runtime.evaluate` against a running dev server) to read `scrollWidth`/`clientWidth` directly.

| viewport | row min-content | available | page overflow |
|---|---|---|---|
| 375 | 343 | 343 | none |
| 768 | **1270** | 720 | **+526px** |
| 1024 | **1270** | 960 | **+278px** |
| 1280 | **1270** | 1216 | **+22px** |
| 1440 | 1270 | 1216 | none — *spills into the gutter instead* |

Two findings the estimate could not have produced:

1. **The header was broken at every width ≥768, not just at `md`.** It still overflowed at 1280. At 1440 there is no scrollbar only because the surplus escapes into the centred container's outer margin — the row is still wider than its container.
2. **Deferring the descriptor to a wider breakpoint is impossible, not merely undesirable.** The container is `max-w-7xl`, so usable width is **permanently capped at 1216px** and does not grow with the viewport. With the descriptor the row needs 1209px — a 7px margin at *any* screen size. The Leader had proposed "show it only on wide screens" to the owner; the measurement withdrew that option. The owner's original instinct — remove it — was correct.

### Owner decision and what was changed

Owner chose: drop **Home**, keep **About**, full bar from `lg`. Applied to `Header.tsx` only:

| Change | Rationale |
|---|---|
| `Home` removed from `NAV_LINKS` | The brand lockup already links `/` and its `aria-label` names it as home — the entry duplicated an adjacent control. Removing it from the array keeps the one-source invariant T-10's tests assert; it leaves the mobile drawer too, where the always-visible logo still serves. |
| Brand descriptor removed outright | ~196px against a 1216px ceiling; no breakpoint can hold it (above). Logo carries identity, `aria-label` carries the name — no visual or assistive-tech loss. |
| Desktop bar `md:` → `lg:` (nav, auth slot, hamburger, drawer) | 768–1023 uses the existing, already-tested hamburger. |
| `gap-6` → `gap-4`, `xl:gap-6` · `lg:px-8` → `xl:px-8` · logo `lg:h-8 xl:h-10` | Recovers ~92px precisely in the 1024–1279 band where the row is tightest, leaving the ≥1280 presentation unchanged. |
| `ml-1 xl:ml-2` on the primary CTA | Separates the action from the plain links, which the tightened gap had flattened. Costs 4px of the 45px slack. |

### Result — measured, not asserted

| viewport | row needs | available | **slack** |
|---|---|---|---|
| 1024 (tightest) | 935 | 976 | **41px** |
| 1280+ | 1015 | 1216 | **201px** |

No horizontal overflow at 375 / 414 / 768 / 1023 / 1024 / 1180 / 1280 / 1440 / 1920, verified on `/`, `/contact`, `/privacy`, `/about` and `/directory`. Rendered captures taken at 375 / 768 / 1024 / 1440 and inspected: mobile and tablet show logo + hamburger; 1024 and 1440 show the full bar with even spacing and no wrap.

### Tests added, and an explicit statement of what they do not prove

Three regression tests in `Header.test.tsx`. **jsdom performs no layout and cannot detect overflow**, so none of them proves the header fits — they pin the three inputs whose measured effect is recorded above, so a silent revert fails in CI instead of shipping. This is stated in the test file itself rather than left for a reader to infer (KZ-008).

Their discrimination was demonstrated, not assumed (KZ-002): reverting the breakpoint tokens and re-adding `Home` was applied to a scratch copy and **2 of the 3 tests failed**; the third did not, correctly, because that revert did not touch the descriptor.

### Verification

Frontend `npm run lint` — 3 warnings, all pre-existing `no-img-element` in admin test files, unrelated and unchanged. `npm test -- --silent` — **93 suites / 1402 tests green** (1399 + the 3 added). `npm run build` — clean; `out/contact/index.html` and `out/privacy/index.html` emitted.

**`docs/ux-ui/design.md` §5 was re-corrected.** T-11 had synced it to the seven-entry bar hours earlier; this change invalidated that sync the same day. §5 now records the composition, the `lg` breakpoint, the 1216px ceiling, and a standing instruction to measure before adding a nav entry — the ceiling is fixed and the bar was already over budget at six entries without anyone noticing.

**DC-9 is closed. T-10 is `[x]`.**

#### Method note — how this was measured, and why it is not a repo dependency

No Playwright package is installed and none was added. The Playwright **browser cache** already existed on this machine, and Node 26 ships a native `WebSocket`, so a ~40-line client drove the cached `headless_shell` over the DevTools protocol directly from the scratchpad. Nothing was installed, and no repo file or verification command depends on it — `CLAUDE.md` requires every command to remain runnable by a teammate without these tools, and that holds. A teammate reproduces this the ordinary way: open the page and resize.

**This should have been done in round 1.** Four review rounds reasoned about this bar from class inspection and produced a number that was wrong by 46px and a diagnosis that missed the 1216px ceiling entirely — the single fact that determined the fix. The measurement took minutes and was available the whole time.

## Closing follow-ups · 2026-08-31 · owner confirmed the responsive fix

The owner verified the header fix in a browser: responsive behaviour is correct. Two recorded follow-ups were closed in the same pass, both small and both ours:

| Item | Resolution |
|---|---|
| `ContactForm.tsx`'s privacy link was a bare `<a href="/privacy">` | Converted to `next/link`. Under `output: 'export'` a bare anchor triggers a **full document reload** instead of a client-side transition — correct destination, wrong navigation. Recorded during T-9 and deferred; closed now. |
| `CONTACT_FALLBACK_RECIPIENT` shipped commented-out in `backend/.env.example` | Uncommented with a placeholder. With no Cognito credentials the group lookup always fails and `resolve()` falls through to `getFallback()`, whose throw sits **outside** the `try` — so a fresh local checkout got a **500 on every contact submission**. Same class as the three local-environment defects closed in T-11: the documented path did not run. |

Verification: frontend lint 3 pre-existing warnings, **93 suites / 1402 tests green**, build clean, both routes emitted.

### Spec state at close

T-1…T-10 `[x]`. **T-11 `[~]`** — every deliverable is in place and verified; the single owed clause is `sam validate --profile IBD-DEV`, which needs the SAM CLI and credentials neither of which exist on this machine. It is not blocked on work, only on access.

### Standing owner decisions, carried forward — neither is a task

- **OD-1 — SES sandbox.** The account can deliver only to addresses verified in SES. Adding someone to the Cognito `admin` group does **not** verify them, so a new admin silently becomes an unreachable recipient. Either request SES production access once, or verify each administrator address. The owner is raising this with the team.
- **OD-2 — interim sender.** Mail still originates from `j.cadavid@cgiar.org`; the dedicated address is **ATP-58**. Whoever owns that mailbox receives replies that bypass `Reply-To`.

## T-11 — closure · 2026-08-31 · **`sam validate` ran; T-11 is `[x]`**

The owed clause was never blocked on work or on credentials — it was blocked on a missing binary. The AWS SAM CLI was installed (`brew install aws-sam-cli`, v1.165.0) and `./infra/scripts/validate.sh` ran with `--profile IBD-DEV --region eu-west-1`, the form the constitution requires.

| Stack | Result |
|---|---|
| `10-data-auth` | **PASS** — valid SAM template |
| `20-backend` | **FAIL** — `W2531`, EOL Lambda runtime (below) |
| `30-frontend` | **PASS** — valid SAM template |

### The 20-backend failure is pre-existing and is not T-11's

```
W2531: Runtime 'nodejs20.x' was deprecated on '2026-04-30'.
       Creation disabled '2027-02-01', update disabled '2027-03-03'.
```

`--lint` promotes this to a non-zero exit, so the whole script reports failure.

**Demonstrated, not asserted.** The same template was extracted at `12b52ef^` — the commit *before* T-11 touched it — and linted identically. The finding sets were diffed and are **identical**: T-11 introduced no new finding, and the failure reproduces with T-11's edits reverted. T-11's two additions (`ListUsersInGroup`, `CONTACT_FALLBACK_RECIPIENT`) are structurally valid SAM; `sam validate` confirms what the earlier CFN-tag-aware YAML parse could only suggest.

**Adjudication.** Holding T-11 open on a defect it did not cause, cannot fix within its scope, and which predates it would make the checkbox a hostage rather than a record. T-11 is `[x]`. The runtime deprecation is a real, dated obligation and is recorded below as its own item, not folded into this spec.

### New standing issue — the validate gate is red for everyone

`./infra/scripts/validate.sh` is the constitution's pre-deploy gate (`CLAUDE.md`, verification table). **It now exits non-zero on every run**, for every future task, until the runtime is bumped. A gate that always fails stops being a gate: the next person to see red will learn to ignore it, and the real finding underneath it will be ignored too.

This is not hypothetical urgency — AWS disables **creation** on 2027-02-01 and **updates** on 2027-03-03. After the latter, the existing function can no longer be updated at all: no deploy, no rollback, no hotfix.

Bumping `nodejs20.x` → `nodejs24.x` is a one-line template change, but it is a **deployment-affecting** change that must be exercised against the deployed stack, and it belongs to nobody's spec. Raised to the owner rather than slipped into this one.

### Live verification performed the same day, against real AWS

Two links of the contact chain had only ever been exercised against a mocked SES and a mocked directory. Both were run through the project's **own compiled code**, not through generic CLI commands:

| Link | Result |
|---|---|
| `AdminRecipientResolver.resolve()` against the live `admin` group | **✅** returned the three real administrators, **without** falling through to `CONTACT_FALLBACK_RECIPIENT` |
| `SesMailTransport.send()` with the real contact template | **✅** accepted by SES; `SentLast24Hours` moved 0 → 1 |

SES account state was measured, not inferred: `Max24HourSend: 200`, `MaxSendRate: 1.0` — the sandbox defaults. All three administrator addresses were verified in SES the same day. Recorded as **ATP-59**, because the constraint is structural: adding an administrator in the panel does not verify them in SES, so the next admin added silently breaks delivery for all of them.

### Latent coupling found while testing — recorded, not fixed

The first live resolver run **fell back to `CONTACT_FALLBACK_RECIPIENT`** and the reason was invisible: `AdminRecipientResolver.resolve()` catches every exception with a bare `catch`. Surfacing it showed:

```
Missing required Cognito env var COGNITO_CLIENT_ID
```

`getCognitoAdminClient()` needs only `region`, but destructures it out of `getCognitoConfig()`, which demands `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` **and** `AWS_REGION` together. So the contact form's recipient resolution has a hard dependency on a variable that `ListUsersInGroup` never uses.

**Not a defect today** — `infra/20-backend/template.yaml` does set `COGNITO_CLIENT_ID` (added long before this spec, by `changes/auth-wiring` in `0a41406`, for JWT audience verification in `jwt-verifier.ts`). But the failure mode is bad: a deployment missing it would route every contact message to the fallback address, permanently and silently, while the panel showed a healthy admin group. That is exactly what was observed locally before the variable was supplied.

Left as-is. Narrowing `getCognitoAdminClient()` to read `AWS_REGION` directly is a one-line change in `backend/src/users/cognito-admin.client.ts` that touches the auth module and belongs to whoever owns it, not to a contact-form spec.
