# Validation Report — Admin Registration Review Queue

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `docs/specs/admin/registration-review-queue/` |
| Validated | 2026-09-02 |
| Branch | `registration-review` |
| Phase | `/akili-validate` (T3 Auditor) |
| Verdict | **Archive-ready** — the FAIL, the integration blocker and all four code WARNs are closed (2026-09-02). Remaining WARNs are accepted and ticketed |
| Method | Leader ran Phases 1–3 (measurement) inline on a quiet tree; Phases 4–6 delegated to three independent read-only auditors, findings spot-verified at source by the Leader before acceptance |

**Independence note.** The code was authored by Implementers (T2) and audited during execution by Reviewers (T3), so `author ≠ auditor` holds for the implementation. The spec's amendments to `docs/trd/trd.md`, `docs/ux-ui/design.md`, `tasks.md` and `execution.md` were written by the orchestrating Leader — the same role writing this report. Those amendments were therefore delegated to an independent auditor with an explicit instruction to treat them as unverified. **The single FAIL in this report was found by that auditor, in the Leader's own writing.** This is the structural reason the delegation was not collapsed.

**Known limitation.** The `akili-reviewer` wrapper is read-only and exposes no `skill` tool, so the Phase-5 auditor could not load the five assigned stack skills (`nestjs-expert`, `api-design-principles`, `error-handling-patterns`, `vercel-react-best-practices`, `tailwind-design-system`). It audited against the constitution documents directly. This is a wrapper gap, not an auditor failure, and it is recorded for `/akili-archive`'s Kaizen pass.

## 2. Summary

The delivered behaviour is sound. The two release gates the constitution names explicitly — the PII boundary and admin authorization — are not merely green but structurally sound: literal-pick projections throughout, a type discipline under which the DD-18 adjacency mistake is a compile error rather than a runtime leak, and a bidirectional route-totality assertion a sixth route cannot slip past. Requirement coverage carries **no FAIL**: all 23 scenarios across FR-9…FR-14, FR-16 and 10 NFRs are owned by a named task, have code evidence, and have automated test evidence for their main assertion.

The findings cluster in three places, none of them the product's behaviour:

1. **One documentary FAIL** — `design.md` §7.1 names an analytics-exclusion gate that does not exist as stated, and self-certifies as *"verified … rather than assumed"*.
2. **Sweep debt** — five obligations accepted during execution (DEC-1's fourth item, DC-36's indexing, the budget figures, the `tsc` gate caveat, a `trd.md` §2 sentence) were never swept into the documents that assert them. All are KZ-004's shape.
3. **Clause-level test gaps** — five negative constraints or strict validations are currently held by inspection, a mock artifact, or a mutation that reddens nothing.

Plus one **integration blocker** that is not a defect of this spec at all: the branch is 10 commits behind `main` and would conflict on the two baseline documents this spec amended.

## 3. Task Completion — PASS

| Check | Result |
|---|---|
| Tasks `[x]` | 16 / 16 |
| Tasks `[ ]` or `[~]` | 0 |
| Execution evidence per task | Present — `execution.md`, 2,393 lines, verbatim Reviewer verdicts |
| Evidence-before-checkbox ordering | Honoured throughout |

**WARN — commit tagging.** Five commits carry no `[SPEC:…]` prefix, against the root `CLAUDE.md` convention: `a0d9e22`, `98ba46d`, `e6380a8`, `71781bd`, `e486e8a`. All five are the DC-16 human-check remediations and all are recorded in `execution.md`, so the audit trail is intact; only the commit-log traceability is degraded.

**WARN — stale HITL instruction, now frozen into the record.** `tasks.md:350` directs the human reviewer to check the `PENDING_REVIEW` chip as `bg-border text-muted` at ≈4.45:1. T-14 moved that vocabulary to `frontend/lib/content/registration-status.ts:43`, where it reads `bg-surface-alt text-warning`; the cited pairing exists on neither new screen. The instruction also understates coverage: all three producible statuses are gated automatically by `frontend/lib/contrast.test.ts:314,364`.

## 4. File Existence — PASS

| Expectation | Result |
|---|---|
| Two new admin routes exported | `out/admin/registrations/index.html`, `out/admin/registrations/review/index.html` |
| No `[param]` segment introduced | Confirmed — query-param pattern inside `<Suspense>` |
| Throwaway DC-16 harness removed | `frontend/app/dc16-check/**` absent from tree and build |
| `infra/` touched by this spec | No |

**Note (benign).** `design.md` §3 schedules the e2e specs at `backend/src/registrations/admin-registrations.e2e.spec.ts`; they ship at `backend/src/test/`, matching the repo's existing `src/test/admin-actors*.e2e.spec.ts` convention. Recorded verbatim in `execution.md:1000,1164`.

## 5. Build Integrity

| Gate | Result |
|---|---|
| `backend` `npx eslint "{src,test}/**/*.ts" --quiet` | **PASS** (exit 0) |
| `backend` `npm run build` | **PASS** |
| `backend` `npm test -- --silent` | **PASS — 988/988, 75 suites** (quiet run, 7.9 s) |
| `backend` `npx tsc --noEmit` | **PASS** |
| `backend` `npm run test:e2e -- --silent` | **BROKEN — cannot execute** |
| `frontend` `npx tsc --noEmit` | **FAIL** — 1 error (pre-existing, A-73) |
| `frontend` `npm run lint` | **PASS** (pre-existing `<img>` warnings only) |
| `frontend` `npm test -- --silent` | **PASS — 1610/1610, 108 suites** |
| `frontend` `npm run build` | **PASS** — static export, both new routes present |
| `infra` `./infra/scripts/validate.sh` | **N/A** — this spec touched no infra |

### 5.1 A-93 quantified

The same backend suite, with no change to the tree, produced **14 failures in 72.6 s** and then **988/988 in 7.9 s**. A 9× swing in wall-clock, every failure timeout-shaped, every failure inside `backend/test/admin-actors.e2e.spec.ts`. No `registrations/` suite failed in either run. This is load-induced flakiness in a file this spec never touched.

### 5.2 A documented gate that cannot fail

`npm run test:e2e` runs `jest --config ./test/jest-e2e.json`; that file does not exist. The root `CLAUDE.md` verification table lists this command as the backend e2e gate. Coverage is not lost — all 16 `.e2e.spec.ts` files run under `npm test` — but a gate that cannot execute cannot fail, which is KZ-002 in the constitutional baseline itself.

### 5.3 Environment boot smoke — partial

The local contract in `docs/infrastructure.md` §6 was exercised as far as the database: MySQL reachable, 14 actors, `Registration` at 0 rows. The full admin flow could **not** be smoke-tested end to end because `COGNITO_USER_POOL_ID` / `COGNITO_CLIENT_ID` are deliberately commented out in `backend/.env` (a 2026-08-31 mail-delivery test) and absent from `frontend/.env.local`; without them `getCognitoConfig()` throws via `required()` and every authenticated request yields 401. Recorded as a WARN on evidence, not on behaviour.

## 6. Requirement Coverage — no FAIL

23 scenarios audited at clause granularity, including every `BUT it must NOT` and `AND IT MUST` limb. Full table in the Phase-4 audit. Strongest work in the spec: the DC-23 projection gate, the DC-31 three-candidate dismissal gate, the DC-32 public-lookup sweep, the FR-9 403-indistinguishability test (`res.text` byte equality, not just `res.body`), and the NFR-1 bidirectional totality assertion. All are genuinely falsifiable.

Eight clause-level WARNs:

| # | Requirement | Clause | Why it is a WARN |
|---|---|---|---|
| W1 | FR-11 s1 | `BUT it must NOT prevent approval` | `tasks.md:98`'s named mutation reddens nothing: detection reads the **outer** prisma mock while approve's call-count assertions are on the **`tx`** delegate set. Frontend fixture has `duplicateCandidates: []`, so disabling Approve on candidates reddens no test |
| W2 | FR-12 | `AND IT MUST be impossible by construction, not a read-then-check` | Code is correct; no assertion pins the `where` shape. Dropping `status` from the predicate is caught only because both mocks happen to implement `updateMany` with a status comparison — gated by a mock artifact, not a stated assertion |
| W3 | NFR-8 | *"a line is emitted for an admin **adjudication** route, and PII fixture values are absent from it"* | Delivered test drives `GET /admin/registrations` (the queue read, not approve/reject) and asserts no PII absence. Structurally safe — `StructuredLogLine` is a closed six-field object — but the stated measure is not met |
| W4 | FR-9 s2 | `AND IT MUST keep filter, **sort** and page state in the URL` | The word `sort` is silently dropped between `requirements.md:125` and `tasks.md:189`. No test asserts the `sort` push; stripping it from `page.tsx:499` leaves the whole suite green while the sort control stops being shareable |
| W5 | FR-9 s5 | `BUT it must NOT introduce per-item role gating on NavItem` | Code conforms exactly; the claimed assertion does not exist — it lives only in `AdminSidebar.test.tsx`'s JSDoc. Held by inspection |
| W6 | NFR-9 | *"server rejects above it"* | `@Max(MAX_PAGE_SIZE)` is correct and **never exercised**. The one test naming the cap calls the service directly, bypassing the pipe, and asserts the service's own `Math.min`. Delete `@Max` and it stays green |
| W7 | FR-16 s1 | `AND IT MUST fail loudly … for a future unknown action` | `tasks.md:227` maps this to a frontend-only `Record`-member removal. A backend-only enum addition still renders an unstyled badge with a clean `tsc`. Already self-disclosed in NFR-11 and DC-36 — flagged so the clause↔mutation mismatch is visible |
| W8 | NFR-5 | jest-axe on both screens | `review/page.test.tsx` carries no axe assertion. The panel it renders is axe-tested, so residual risk is page chrome only |

## 7. Linting & Code Quality

Lint and token conformance are clean. A grep for `#[0-9a-f]{3,8}`, `rgb(`, `rgba(`, `hsl(`, `bg-[`, `text-[`, `border-[`, `ring-[`, `shadow-[` across all seven new components and both pages returns **no matches**. Every token resolves in `frontend/tailwind.config.ts`; `bg-warning/10`, `border-warning/30`, `border-danger/30` are the sanctioned opacity-modifier precedent; `max-w-56` is on the spacing scale.

### 7.1 Code WARNs

| # | Finding | Evidence | Severity |
|---|---|---|---|
| C1 | **`dismissDuplicate` is a non-transactional read-modify-write on a JSON array — concurrent dismissals lose updates, contradicting the method's own DC-31 docblock.** It is the one write in the module that abandons the compare-and-set discipline the rest of the spec is built on. Reachable from the shipped UI: `disabled={isDismissing}` disables only the in-flight candidate's own button | `admin-registrations.service.ts:574` `findUnique` → `:596` array built in JS → `:606` `update` with the whole array. No `$transaction`, no predicate on the old value. Docblock at `:527-532` claims *"dismissing one candidate can never suppress a previously-dismissed one"* — it rules out the wrong failure mode. UI: `DuplicateWarningCard.tsx:133,152` | WARN |
| C2 | **A failed post-mutation refresh destroys the confirmation of the system's only irreversible action.** After a successful approve, a refresh failure replaces the entire view — including the `role="status"` "approved and published" banner — with *"Could not load the requested registration."* | `review/page.tsx:239` `if (error \|\| !detail)` → `:246` `<NotFoundState …>`; erased banner at `RegistrationDetailPanel.tsx:515-522`. Recorded as the unfixed second half of A-87 | WARN |
| C3 | **The queue row under-reports a saturated duplicate count, and the two surfaces contradict each other.** Detection caps at 5, so the count is `min(open, 5)`. The detail card renders `5+`; the queue row renders the bare number, so 9 candidates read as "5 possible duplicates". A-35's fix landed on the detail card, but FR-11 scenario 1 specifies the **queue flag** | `RegistrationsTable.tsx:170` `{count} possible …` vs `DuplicateWarningCard.tsx:83` `if (count >= CANDIDATE_CAP) return \`${CANDIDATE_CAP}+\`;`. Backend JSDoc at `admin-registrations.service.ts:109` also omits the cap | WARN |
| C4 | **`sanitizeRegistrationId`'s comment claims a narrower guard than the regex implements** — doc says lowercase-only, pattern carries the `i` flag. Harmless in effect (MySQL CI collation), but it is a guard whose stated tightness a future reader will trust | `review/page.tsx:72-74` vs `:77` `const SAFE_ID_PATTERN = /^[a-z0-9]+$/i;` | WARN |

### 7.2 4R advisory sweep (advisory only — drives no verdict)

| Lens | Finding |
|---|---|
| Reliability | **The activity trail renders UTC timestamps with no timezone designator** (`ActivityTrail.tsx:51-58` — `timeZone: 'UTC'` with no `timeZoneName`), so a reviewer in EAT misreads every entry by three hours. `ConsentRecordCard.tsx:70-71` gets it right on the same data. FR-10's timezone clause is scoped to consent, so no requirement is violated — the inconsistency is the defect |
| Resilience | **`dismissDuplicate` has no status precondition**, so `DUPLICATE_DISMISSED` can be appended after `ADJUDICATED`, and the UI invites it: `DecisionPanel` hides approve/reject once the row leaves `PENDING_REVIEW`, but `onDismiss` is passed unconditionally |
| Observability | A dropped notification is detectable only by human log correlation. The Lambda-freeze trap is genuinely closed (`lambda.ts:50`) and a failure emits two lines, but there is **no CloudWatch metric filter or alarm** anywhere in `infra/` and no persisted marker on `Registration` — from the database an operator cannot tell an approved applicant was never notified |
| Risk | A-28's deadline passed without the decision it asked for: `q` has no `@MaxLength` and its LIKE metacharacters are unescaped (`?q=%` matches every row), and `page` has no `@Max`. Admin-only, so not exploitable — an unmade decision, not a hole. T-12 has since wired a live search box to `q` |
| Readability | `aria-live` regions mounted together with their content announce unreliably; affects the two queue empty states and the approval confirmation. `role="alert"` uses are fine |
| Readability | `RejectDialog.tsx:270` carries `aria-live="polite"` on text that never changes — a presence without a behaviour |
| Resilience | Neither dialog restores focus to its trigger on close, nor hides background content from AT. **Pre-existing shared pattern** across `AcknowledgeDialog`/`ConfirmDialog` and three archived call sites — not this spec's drift |
| Readability | `pii-boundary.spec.ts:1183-1188`'s MailService override is asymmetric and its stated reason is false (*"the DI graph still needs the method to exist"* — untrue of `useValue`); `sendRejection` was consequently never added |

### 7.3 Audit-trail integrity

The `A-nn` advisory sequence in `execution.md` is **not complete**: `A-14`, `A-21`–`A-24`, `A-48`–`A-56`, `A-60`, `A-67`, `A-68`, `A-74`, `A-75`, `A-80` have no table row. Either they were allocated in review reports never folded into the trail, or the numbering skipped. Worth knowing before the record is frozen. Confirmed still open at source: **A-83, A-84, A-86, A-88, A-89, A-62**. **A-31 cannot be confirmed as written** — it cites `backend/src/common/request-context.middleware.ts`, which does not exist (the real path is `backend/src/logging/`), and the quoted text is absent from `backend/src`.

## 8. Design Conformance

Every constitutional amendment this spec made was verified true against shipped code: `trd.md` §4's five endpoint entries, the `zero rows ⇒ 409 / 404` split (on **both** approve and reject), §8's adjudication-authority paragraph, §12.5's ADR-012 (status `Accepted`, all four sub-claims true), §13's B3 resolution, and `docs/ux-ui/design.md` §2/§4/§5 — including the sidebar parenthetical, which matches `AdminSidebar.tsx:18-22` byte for byte. Delivered behaviour stays inside the approved scope and non-goals; nothing in scope was silently dropped.

### 8.1 FAIL — `design.md` §7.1 names a gate that does not exist, and self-certifies as verified

`design.md:281` asserts:

> `enhancement/usage-analytics` … implements admin exclusion as **layout placement, not a pathname allowlist** — **its gate asserts the admin layout contains no `usePathname` reference.** … **No task, no test change.** Verified against `app/(admin)/analytics-exclusion.test.tsx` rather than assumed.

Both halves of the gate claim are false:

- The cited file's only `usePathname` sweep is over the **public** layout — `analytics-exclusion.test.tsx:351-353` reads `('..', '(public)', 'layout.tsx')` and asserts `not.toMatch(/usePathname/)`. No assertion anywhere in that file reads the admin layout's source.
- The admin layout is the **opposite** of what §7.1 asserts: `frontend/app/(admin)/layout.tsx:29` `import { usePathname } from 'next/navigation';` and `:77` `const pathname = usePathname();`, used to close the mobile menu on navigation.

Aggravated by `design.md:509`, which cites this exact claim as an instance of the usage-analytics L-1 lesson (*"nothing verifies the spec is true"*) having been applied.

**The conclusion §7.1 draws is nonetheless correct.** Exclusion genuinely is by layout placement — the provider is mounted only in `(public)/layout.tsx`, proven by the root-layout source sweep at `:330-339` plus the admin-render absence tests at `:276-318` — so a new `(admin)` route needs no task and no test change. The defect is documentary, not behavioural. But it is the exact class this run shipped four times, and archiving would freeze a false claim that presents itself as verified.

### 8.2 Sweep-debt WARNs (all KZ-004's shape)

| # | Finding |
|---|---|
| D1 | **DEC-1's fourth binding item was never discharged.** `execution.md:420` bound T-16 to record that `logRegistrationApprove` sets `acknowledged: true`. The code does (`actor-audit.service.ts:417-418`); `design.md` §6.7 still describes that row as *"identical in shape to `logCreate`'s"* and a grep for `acknowledged` across `design.md` and `trd.md` finds only the unrelated phrase "human-acknowledged". T-16's own "Files amended" line omits §6.7 |
| D2 | **`trd.md:61` understates its own protection in a falsifiable sentence** — *"no test asserts the admin controller stays inside this module"*. `pii-boundary.spec.ts:1209` derives routes from `RegistrationsModule` and `:1552-1554` compares bidirectionally, so moving the controller out fails by name. The deliberation at `execution.md:2179` is sound about the **risk** (a route added *elsewhere* is invisible to both sides) but does not rescue the unqualified **sentence** |
| D3 | **DC-36 exists in `requirements.md` §8 and in no index.** `requirements.md:576` and `design.md:529` both close their ungated-defect lists without it |
| D4 | **`design.md` §11's budget figures are falsified by this spec's own `execution.md`** — §11 still concludes *"~8,200 LOC over 16 tasks"* and names ~9,200 as the halt, while `execution.md:2189` records **13,310**, 62% over. The process was intact (measured at cadence, escalated at T-12, adjudicated by the user); the unpointered figure is the finding, since §11 is the spec's most-read sizing statement |
| D5 | **The stated type gate is baseline-red and only `execution.md` says so.** `requirements.md:415` (DC-27) and `design.md:326` both name `npx tsc --noEmit`. `execution.md:1563` records that its exit status *"carries zero information"* in this checkout and substituted an error-set diff. Neither authority document records the substitution |

## 9. Test Evidence Summary

No `test-report.md` exists — `/akili-test` was never run, so coverage was verified directly. Counts: **backend 75 suites / 988 tests**, **frontend 108 suites / 1,610 tests**, all green on quiet runs. No `PRODUCT_BUG` and no red-kept test anywhere in the trail.

The evidence is strong where it is falsifiable and the spec is unusually honest about where it is not — DC-6, DC-24 and NFR-11 each carry an explicit declared-gap statement rather than a manufactured assertion. The five clause gaps in §6 are the residue: constraints whose named mutation does not redden anything (W1, W4), or which are held by a mock artifact (W2) or by inspection (W5, W6).

## 10. Agent Guide / Constitution Impact

`execution.md` records no `## Constitution Impact` block, and no module boundary moved: the new code lives inside the existing `RegistrationsModule` and the existing `frontend/components/admin/` surface. `backend/CLAUDE.md` and `frontend/CLAUDE.md` are both present and indexed in the root `## Module Guides`. No guide drift attributable to this spec.

**Integration blocker (not a spec defect).** The branch is **10 commits behind `main`**, and `git merge-tree` reports a real conflict in `docs/trd/trd.md` and `docs/ux-ui/design.md` — the two baseline documents this spec amended. `main`'s `b17f9c6` (usage-analytics kaizen sync) added analytics and consent rows to the same §2/§4/§5 tables where this spec added registration rows. **Both sets are correct and both must survive**; the risk is a resolution that takes one side wholesale. Archiving before this is integrated would freeze a spec whose baseline amendments are not yet in `main`.

Also on `main` and absent here: `9ff8869 fix(infra): widen the Lambda's SES resource to identity/* — the narrow ARN denied every send`.

## 11. Remediation

### Must close before archive

| # | Item | Cost |
|---|---|---|
| R1 | **§8.1's FAIL** — restate `design.md` §7.1 to describe the gates that exist (root-layout source sweep + public-layout pathname sweep + admin-render absence tests) and drop the admin-layout `usePathname` claim. Apply correction closure: sweep forward for the superseded wording and backward from `design.md:509`, which cites it | 1 edit + sweep |
| R2 | **The `main` divergence** — rebase or merge, resolving the two baseline documents additively so neither side's table rows are lost | Manual, ~20 min |
| R3 | **`tasks.md:350`'s stale HITL instruction** — repoint it at `bg-surface-alt text-warning` and note the automated `contrast.test.ts` coverage, so the frozen record does not direct a future reviewer at a pairing that no longer exists | 1 edit |

### Should close before archive (code)

| # | Item | Cost |
|---|---|---|
| R4 | **C1 — `dismissDuplicate`'s lost update.** Wrap read and write in one `$transaction`, or make it a conditional write (`updateMany` with the pre-read array as predicate → zero rows ⇒ re-read and retry). UI mitigation meanwhile: `disabled={dismissingId !== null}` | Small |
| R5 | **C2 — the failed-refresh wipe.** Route refresh failures to the panel's own `announcementError` and keep `detail`, or gate the whole-view `NotFoundState` on the initial load only | Small |
| R6 | **C3 — the queue's uncapped count.** Export `candidateCountLabel` from a shared module so the two surfaces cannot drift; amend the backend JSDoc to `min(open, 5)` | Small |
| R7 | **C4 — `SAFE_ID_PATTERN`.** Drop the `i` flag, or amend the comment to say case-insensitive-by-design and why | Trivial |

### Should close before archive (documents)

| # | Item |
|---|---|
| R8 | D1 — record `acknowledged: true` in `design.md` §6.7 |
| R9 | D2 — narrow `trd.md:61` to the risk it actually names |
| R10 | D3 — add DC-36 to both indexes |
| R11 | D4 — point `design.md` §11 at the recorded 13,310 and the user's adjudication |
| R12 | D5 — record the `tsc` substitution in DC-27 and `design.md` §7.5 |

### Test gaps worth closing (cheap, and they close real holes)

| # | Item |
|---|---|
| R13 | W6 — one supertest `?pageSize=101` expecting 400. Closes a constraint that is currently green if deleted |
| R14 | W1 — `expect(prisma.actor.findMany).not.toHaveBeenCalled()` in the approve happy path, plus one frontend render with two open candidates asserting Approve stays enabled |
| R15 | W2 — pin the `updateMany` `where` shape with `toHaveBeenCalledWith`, so the clause stops depending on a mock artifact |
| R16 | W4 — assert the `sort` URL push, and restore the dropped word in `tasks.md:189` |
| R17 | W5 — assert `NavItem`'s shape instead of claiming it in a JSDoc |

### Defer as tickets (pre-existing, not this spec's)

`A-73` (frontend `tsc` red on `main`, one line) · `A-93` (`admin-actors.e2e.spec.ts` load flakiness, quantified in §5.1) · `npm run test:e2e` pointing at a missing config (§5.2) · `A-92` (IA drift in `docs/ux-ui/design.md` §2) · the §7.2 advisories, of which the **activity-trail timezone designator** and the **missing CloudWatch alarm** are the two with real operational weight · `A-28`'s unmade decision on `q`/`page` bounds · the `akili-reviewer` wrapper's missing `skill` tool (§1) · the incomplete `A-nn` sequence (§7.3) · the two ungated `bg-border text-muted` pairings that become reachable in chunk 4 — a live trap for `admin/registration-info-requests`.

## 11a. Remediation Status — 2026-09-02

Everything the user scoped as "blockers + code" is closed. Detail in `execution.md`
§"Post-validation remediation".

| # | Item | Status |
|---|---|---|
| R1 | `design.md` §7.1's false gate claim | **Closed.** Restated over the three gates that exist; correction closure applied forward and backward (§13 cited the claim as a lesson applied — it now records that the lesson's instance became its counter-example) |
| R2 | 10 commits behind `main`, conflicting baselines | **Closed.** `docs/ux-ui/design.md` auto-merged additively. `trd.md` was **not** an additive conflict: both branches had allocated **ADR-011 to different decisions**. `main` is the trunk and its ADR-011 is deployed and cited from an archived spec, so this spec's decision became **ADR-012**; 14 citations swept forward, backward grep confirms only `main`'s row and the frozen archived citation survive as ADR-011 |
| R3 | Stale DC-16 HITL instruction | **Closed.** Repointed at the chip that exists, with its automated coverage named; records the live chunk-4 trap (the two unreachable statuses still carry the ungated pairing) |
| R4 | `dismissDuplicate` lost update | **Closed.** Bounded-retry compare-and-set. **Verified against live MySQL**, not only mocks — `equals: <stale value>` matches 0 rows, which is what closes the race |
| R5 | Failed refresh destroyed the approval confirmation | **Closed after three attempts and a HALT.** Behaviour correct from attempt 2; attempts 1–3 each shipped a false comment claim, and the loop was closed by user-authorised deletion rather than another rewrite |
| R6 | Queue under-reported saturated duplicates | **Closed.** Shared label module; backend JSDoc corrected to `min(open, 5)` |
| R7 | `SAFE_ID_PATTERN` comment/regex mismatch | **Closed.** `i` flag dropped |

### Second batch — R8–R17, A-73 and the dead e2e gate (2026-09-02)

Closed after the user challenged the first batch's scoping: ten of these were
one-line or one-edit items filed as "accepted debt", and a ticket costs more to carry
than any of them cost to fix.

| # | Item | Status |
|---|---|---|
| R8 | `design.md` §6.7 silent on `acknowledged: true` | **Closed** — DEC-1's fourth binding item, finally discharged |
| R9 | `trd.md` §2 understated its own protection | **Closed** — narrowed to the risk that is real (a route on a *different* module) |
| R10 | DC-36 in no index | **Closed** — added to both |
| R11 | `design.md` §11's budget figures | **Closed** — estimate annotated in-cell, not silently rewritten |
| R12 | The `tsc` gate documented as if it worked | **Closed** — the disarming and T-15's error-set substitution now recorded in both authorities |
| R13 | `@Max(MAX_PAGE_SIZE)` never exercised | **Closed** — supertest at `?pageSize=101`; reddens at `expected 400, got 200` with `@Max` removed |
| R14 | "must NOT prevent approval" ungated | **Closed** — both sides; the frontend fixture now carries two open candidates |
| R15 | The `where` shape gated by a mock artifact | **Closed** — pinned on approve **and reject**, which was found equally unpinned |
| R16 | The `sort` URL push unasserted | **Closed** — `region` and `traderType` were equally unasserted; all three now pinned, and `tasks.md`'s dropped word restored |
| R17 | `NavItem`'s shape held by a JSDoc | **Closed** — source-text assertion (the interface is file-private and SWC-erased) |
| A-73 | `tsc --noEmit` red on `main` | **Closed.** `npx tsc --noEmit` now exits **0** — which re-arms the type gate R12 documents as disarmed |
| — | `npm run test:e2e` pointing at a missing config | **Closed** — script and `CLAUDE.md` row removed together. The 16 `*.e2e.spec.ts` files already run under `npm test` |

**One FAIL in this batch, and it was the Leader's.** R11's note asserted that the LOC
tripwire "was re-measured at the mandated cadence" and that "nothing about the process
failed". `execution.md` records LOC measurements at **T-12 and T-16 only** — the
mandated cadence is T-4/T-8/T-12/T-16 — and the final one was outstanding until a
Reviewer flagged it. By the first measurement the total was already ~10,256, over the
halt. So the tripwire caught the breach **late**, and eight tasks of drift went
unmeasured. Corrected; the sixth instance in this run of a correction introducing a
fresh false claim, and the one written while correcting other authors' false claims.

**Still open, accepted and ticketed** — none blocks archive:

| Item | Why deferred |
|---|---|
| **A-93** — `admin-actors.e2e.spec.ts` load-induced timeouts | Genuine investigation, not a one-line fix. **Reproduced three times**, the last by running a build and a suite in one command: 8 failures at 36.8 s, then 990/990 in 6.3 s alone |
| **A-94 (new)** — `app/(admin)/admin/actors/import/page.test.tsx` › *"renders nothing when the report carries no breakdown"* fails roughly **1 run in 8** | Found during this batch's verification. Pre-existing: last touched by `import-export/partner-profile-onboarding`, untouched by this spec. A frontend sibling to A-93 |
| **A-28** — `q` has no `@MaxLength` and unescaped LIKE metacharacters; `page` has no `@Max` | Needs a product decision on bounds, not a fix. Admin-only, so not exploitable |
| **A-92** — IA drift in `docs/ux-ui/design.md` §2 | Belongs to the actors/import surface, not this spec |
| §7.2 advisories · the chunk-4 contrast trap · the `akili-reviewer` wrapper's missing `skill` tool · the incomplete `A-nn` sequence | Recorded above; none is a defect in shipped behaviour |

### The finding worth carrying into `/akili-archive`

**Corrections fail more often than the code they correct — five times in this run.**
T-8's docblock inverted causality while fixing a defect; the Leader's own `jest-axe`
"correction" flagged a true statement as false; T-16 shipped two false claims inside
the anti-false-claim task; R5 attempt 2 replaced a false invariant with a false
mechanism; R5 attempt 3 introduced a new false causal claim in the paragraph whose
purpose was correcting false claims.

The pattern has a shape worth naming as a Kaizen lesson: **the patch is a
higher-defect-density surface than the diff it patches, and review attention is
allocated the other way round.** Its practical corollary is the one the user chose at
the HALT: where a correction can be made by *deleting* the false text rather than
replacing it, deletion is the lower-risk correction — it cannot introduce a sixth
instance.

## 12. Archive Readiness Recommendation

**Ready.** Both blockers are closed and all four code WARNs are remediated with
independent review at every step.

- **R1** — the audit trail no longer contains a false claim that certifies itself as
  verified.
- **R2** — the baseline amendments are integrated with `main`, and the ADR id
  collision is resolved in the direction that preserves an already-frozen citation.

The two release gates the constitution names — the PII boundary and admin
authorization — were the strongest work in the spec before remediation and are
untouched by it. Requirement coverage carries no FAIL. Final gates: backend
**990/990**, frontend **1614/1614**, static export **27/27**, `tsc` error set unchanged.

The remaining WARNs are recorded above with owners and cost, and the run's most
valuable output is arguably not any single fix but the correction-density finding in
§11a, which belongs in `docs/specs/kaizen-log.md`.

```text
/akili-archive admin/registration-review-queue
```
