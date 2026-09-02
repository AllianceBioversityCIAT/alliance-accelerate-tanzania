# Tasks — Registration Review Queue & Approve-to-Publish

- Spec path: `docs/specs/admin/registration-review-queue/`
- Status: **Approved 2026-09-01 — in execution**
- Traces: `requirements.md` FR-9…FR-14, FR-16 · `design.md` §4–§9, DD-15…DD-23
- Depth: **Full** · Approval Mode: **gated**, relaxed to **pause-per-phase** by the user 2026-09-01 (HALT / Pivot / budget tripwire / FATAL_FAIL still stop immediately)
- Design reviewed: `judgment.md` — **APPROVED**, 1 fix round used, 1 remaining
- Commits: `[SPEC:admin/registration-review-queue] <message>`

---

## Budget (from `design.md` §11 — these are tripwires, not targets)

| Signal | Budget | Halt above |
|---|---:|---:|
| Tasks | 16 | **16** |
| LOC | ~8,200 | **~9,200** |
| **Review rounds** — one Reviewer engagement on one task attempt, **PASS or FAIL** | ~35 | **35** |

**Rework rounds (FAIL → retry cycles) are a different metric and carry no tripwire.** Do not count one and report the other; that conflation is Judgment Day finding A1.

**Re-measure the running LOC and review-round totals at the close of T-4, T-8, T-12 and T-16** — not only when someone remembers. A breach that is never measured disarms the tripwire retroactively (`usage-analytics`, *"the tripwire fired correctly twice and was then forgotten"*).

---

## How a task brief is written here (L-3 — adopt from attempt 1, not attempt 3)

`enhancement/usage-analytics` measured this directly: tasks framed as *"fix the named clause"* took 3 attempts each and produced whack-a-mole; tasks framed as **sweep every clause** from attempt 1 took 1–2, and one Implementer caught a vacuity trap before review for the first time in that spec.

So every task below carries three fields beyond the template's, and the Implementer owes all three:

| Field | What it demands |
|---|---|
| **Verify** | The exact command. Smallest verifying command, never a full-suite run when a pattern will do. |
| **Falsifying input** | **The concrete change that makes this check report FAIL.** If you cannot name one, the check is not evidence however green it reports — say so and the task needs a different check. |
| **Disqualifying** | What makes a *green* result worthless. An inconclusive verification is a legitimate outcome and must be reportable as one; never collapse it into a pass because the command exited `0`. |

**Clause sweep, from attempt 1.** For **every** `BUT it must NOT` and `AND IT MUST` clause in the scenarios a task traces: either name the concrete mutation that reddens a specific named test, **or** record it as an unevaluable gap with its structural reason. **No third option** — "structurally covered" is accepted only as a declared gap.

---

## Phase A — Foundation (must be green before any route exists)

- [x] **T-1 Widen `ActorAuditAction` with the two adjudication members** (deps: none)
      Scope: `schema.prisma` enum + one migration. No service or route changes.
      Traces: FR-16, `design.md` §4.1–4.2
      Files: `backend/prisma/schema.prisma`, `backend/prisma/migrations/<ts>_add_registration_audit_actions/`
      Skills: `nestjs-expert` · Effort: **max** (migration, correctness-critical)
      Verify: `cd backend && npx prisma migrate dev --name add_registration_audit_actions && npm run build`
      Falsifying input: remove one enum member from `schema.prisma` after generating → `npm run build` fails on the generated client's union.
      Disqualifying: **the emitted SQL is read from disk before the task closes.** It MUST contain `ALTER TABLE \`ActorAuditLog\` MODIFY \`action\` ENUM(...)` and MUST NOT contain `DROP`, a data `UPDATE`, or a narrowed column. A done-criterion demanding "no `MODIFY`" would FAIL a correct migration — see `design.md` §4.2. A drift or reset prompt against the shared dev RDS is **abort-and-report**, never answered.
      Done when: migration applies, generated client carries eight members, emitted SQL matches the disclosure above, existing audit suite green.

- [x] **T-2 Two additive `ActorAuditService` methods with pinned `changes` envelopes** (deps: T-1)
      Scope: `logRegistrationApprove` (full actor snapshot, `logCreate`'s shape) and `logRegistrationReject` (snapshot-shaped over reference, organisation name, structured reason). No existing signature changes.
      Traces: FR-16, FR-12 (audit clause), FR-13 (audit clause), `design.md` §6.7, DD-6
      Files: `backend/src/actors/actor-audit.service.ts`, `.spec.ts`
      Skills: `nestjs-expert`, `tdd` · Effort: **high**
      Verify: `cd backend && npm test -- --silent actor-audit`
      Falsifying input: change `logRegistrationApprove` to emit a bare object satisfying neither `isDiff` nor `isSnapshot` → the envelope-shape assertion fails.
      Disqualifying: a green run proves nothing if the **existing** audit tests were modified. The 606-line suite must pass **untouched** — `git diff` on `actor-audit.service.spec.ts` must show additions only.
      Done when: both methods write inside the caller's `tx`, envelopes match §6.7's table, existing suite green with additions only.

- [x] **T-3 `FIXTURE_MAP` gains an access discriminant — no new routes** (deps: none)
      Scope: add `access: 'public' | 'admin'` to every existing entry; branch the scan loop on it; **the missing-entry branch keeps `throw`ing, never `continue`s**. Document the admin-entry contract for T-4…T-9 to follow.
      Traces: NFR-1, `design.md` DD-16, R-10
      Files: `backend/src/test/pii-boundary.spec.ts`
      Skills: `nestjs-expert`, `error-handling-patterns` · Effort: **xhigh** (release gate)
      Verify: `cd backend && npm test -- --silent pii-boundary`
      Falsifying input: change the missing-entry branch from `throw` to `continue`, add a route with no entry → the suite goes green when it must not. Restore and confirm it reddens.
      Disqualifying: **this task is worthless unless it runs in isolation, before any route is added.** If the suite is first run after T-4, a failure cannot be attributed between the discriminant edit and the new routes (R-10). The intermediate green run is the deliverable, not a formality.
      Done when: 1,642-line suite green with only the discriminant added; every existing assertion unchanged in meaning; the `throw` branch proven still reachable.

---

## Phase B — Backend read surface

- [x] **T-4 `AdminRegistrationsController` + module wiring + `GET /admin/registrations`** (deps: T-1, T-3)
      Scope: the controller with class-level `@UseGuards(JwtAuthGuard, RolesGuard) @Roles('Admin')`; register in `RegistrationsModule.controllers`; **extend `configure()`'s `forRoutes(...)` to the new controller**; the paginated list with `status`/`q`/`region`/`traderType`/`sort`/`page`/`pageSize`, oldest-first default, `pageSize` capped. Its `FIXTURE_MAP` entry.
      Traces: FR-9 scenarios 1, 2, 3, 4 · NFR-8, NFR-9 · `design.md` §5, §6.1, DD-15, DD-19
      Files: `backend/src/registrations/admin-registrations.controller.ts` + `.spec.ts`, `admin-registrations.service.ts` + `.spec.ts`, `dto/admin-registration-list-query.dto.ts`, `registrations.module.ts`, `backend/src/test/pii-boundary.spec.ts`
      Skills: `nestjs-expert`, `api-design-principles` · Effort: **high**
      Verify: `cd backend && npm test -- --silent admin-registrations && npm test -- --silent pii-boundary`
      Falsifying input: **for `forRoutes` specifically** — revert `configure()` to name only `RegistrationsController` → the log-line assertion must fail. **If it still passes, the assertion is checking registration rather than emission and is not evidence** (DC-29).
      Disqualifying: a green `pii-boundary` here proves the route has *an* entry, not a correct one. Absent the T-9 discrimination proof, treat this as a presence assertion and say so in the report.
      Clause sweep: FR-9's `BUT it must NOT` leak existence via `403` → **REASSIGNED TO T-6 on 2026-09-01** (`execution.md` T-4, *Spec correction*): the mutation presupposes a route taking an id, and `GET /admin/registrations` is a collection route with no `:id` — the clause has no referent here. Re-homed to T-6, the first `:id` route, so it cannot evaporate. FR-9's `AND IT MUST NOT rely on the client guard` → the endpoint test issues a raw HTTP call with no frontend involved, so the client guard is structurally absent from the harness — **declared as satisfied by construction, not by assertion.**
      Done when: five-route controller registered (four still absent), list returns the envelope, `Staff` → `403`, anonymous → `401`, one structured log line per request with no PII, `pii-boundary` green.
      **Re-measure the budget at this task's close.**

- [x] **T-5 `DuplicateDetectionService` + `duplicateCandidateCount` on list rows** (deps: T-4)
      Scope: normalized phone / lowercased email / normalized name equality + GPS bounding box; **one narrow `Actor` fetch per request, matched in memory** — never one detection pass per row; capped and ordered by match strength; dismissed candidates filtered out.
      Traces: FR-11 scenario 1 (queue flag limb) · NFR-9 · `design.md` §6.5, DD-20, DC-35
      Files: `backend/src/registrations/duplicate-detection.service.ts` + `.spec.ts`, `admin-registrations.service.ts`
      Skills: `nestjs-expert`, `tdd` · Effort: **xhigh**
      Verify: `cd backend && npm test -- --silent duplicate-detection`
      Falsifying input: give the fixture an actor matching only on a normalized-away difference (spacing in the phone) → detection must still match; break the normalizer and it must redden.
      Disqualifying: **assert the query count, not just the results.** A test that only checks the returned counts passes identically whether the service issues one fetch or twenty — the DD-20 decision would be silently reverted. Assert the Prisma mock received **exactly one** `actor.findMany` for a multi-row page.
      Clause sweep: FR-11's `BUT it must NOT prevent approval / pre-select rejection` → detection returns data only and is called from no write path; mutation: have `approve` consult detection → the approve test's call-count assertion reddens.
      Done when: matching correct across all four attributes, one fetch per page proven by call count, dismissed candidates excluded.

- [x] **T-6 `GET /admin/registrations/:id` + admin and activity-trail serializers** (deps: T-5)
      Scope: full payload, consent record, duplicate candidates, derived activity trail. `ConsentRecordCard`'s data shape carries the timezone-explicit instant and the *recorded-at-submission* qualifier. Its `FIXTURE_MAP` entry.
      Traces: FR-10 scenarios 1, 2, 3 · `design.md` §6.6, §7.3
      Files: `serializers/admin-registration.serializer.ts` + `.spec.ts`, `serializers/activity-trail.serializer.ts` + `.spec.ts`, controller/service, `pii-boundary.spec.ts`
      Skills: `nestjs-expert`, `api-design-principles` · Effort: **high**
      Verify: `cd backend && npm test -- --silent admin-registration.serializer && npm test -- --silent activity-trail`
      Falsifying input: add a `duplicateCheckedAt` field to the trail → the "no fabricated timestamp" assertion must redden. It is the clause most likely to be re-added by a well-meaning later edit.
      Disqualifying: the trail test is worthless if it asserts only that events *appear*. It must assert the trail is a **pure function of stored fields** — same input row, same output, and **no field in the output that has no source column**.
      Clause sweep: **FR-9's `403`-indistinguishability clause, reassigned here from T-4 on 2026-09-01** → this is the first route taking an `:id`, so the mutation is finally expressible: assert a real id and an invented id yield a **byte-identical `403` body** for a `Staff` caller, and that no `404` is returned before the guard runs. (DD-22's honest `404` is for the *authenticated Admin*; the uniformity requirement stops at the auth boundary.) FR-10's `BUT it must NOT claim a duplicate check occurred at a particular time` → mutation above. FR-10's `AND IT MUST be derived from fields the registration already stores` → assert output field-by-field against source columns. FR-10's *review context* marking is a **frontend** concern → owned by T-13, declared here as split, not discharged.
      Done when: every payload field present, trail derived and order-stable, no fabricated timestamp, `404` for unknown id, `403` for `Staff`.

- [x] **T-7 `POST /admin/registrations/:id/dismiss-duplicate`** (deps: T-6)
      Scope: per-candidate dismissal appended to `duplicateDismissals` with dismisser and instant; validation that the candidate exists; its `FIXTURE_MAP` entry.
      Traces: FR-11 scenario 2 · `design.md` §4.3
      Files: `dto/registration-dismiss-duplicate.dto.ts`, controller/service + specs, `pii-boundary.spec.ts`
      Skills: `nestjs-expert` · Effort: **medium**
      Verify: `cd backend && npm test -- --silent dismiss-duplicate`
      **Carried forward from T-6's review (`execution.md` A-37):** `DUPLICATE_DISMISSED.occurredAt` is read back raw from this JSON column and sorted with `localeCompare`, so it is the only trail event whose wire format is not guaranteed `Z`-suffixed ISO-8601. **You are the writer** — emit `new Date().toISOString()`, never an offset-bearing instant (`…+03:00`), or the trail mis-orders that event lexicographically and its format diverges from the other four.
      Falsifying input: make the handler overwrite `duplicateDismissals` instead of appending → the three-candidate test must redden showing the other two suppressed (DC-31).
      Disqualifying: a single-candidate fixture cannot detect row-level-vs-per-candidate behaviour — **both shapes pass it.** The test needs **at least three** candidates with exactly one dismissed.
      Clause sweep: FR-11's `BUT it must NOT be row-level` → the three-candidate mutation above. `AND IT MUST record who dismissed it and when` → assert both fields present and sourced from the resolved acting admin, never the request body.
      Done when: one of three dismissed, other two still returned after reload, dismisser recorded server-side.

---

## Phase C — Adjudication (the irreversible surface)

- [x] **T-8 `POST /admin/registrations/:id/approve` — the transaction** (deps: T-2, T-6)
      Scope: compare-and-set → derive `traderId` (`SR-<year>-<seq>`, DD-23) → literal-pick projection → provenance assertion → `actor.create` (`P2002` → `409` naming the key) → `cropsOnActors.createMany` → audit → `publishedActorId`. Server-side acknowledgement re-validation. **Notification dispatched after commit, never inside.** Its `FIXTURE_MAP` entry.
      Traces: FR-12 scenarios 1–6 · FR-14 scenario 1 · NFR-2, NFR-3 · `design.md` §6.2, §6.3, DD-17, DD-18, DD-23
      Files: `admin-registrations.service.ts` + `.spec.ts`, `dto/registration-approve.dto.ts`, `admin-registrations.e2e.spec.ts`, mail template, `pii-boundary.spec.ts`
      Skills: `nestjs-expert`, `tdd`, `error-handling-patterns` · Effort: **max** (PII boundary, consent, transaction)
      Verify: `cd backend && npm test -- --silent admin-registrations && npm test -- --silent pii-boundary`
      Falsifying input: map `contactPerson` onto `Actor.position` → the DC-23 by-value sweep must redden **naming the column**. Run this mutation and record the output verbatim; it is the single most valuable falsification in the spec.
      Disqualifying: **the projection gate must assert fixture _values_ absent from _every_ column, never field names.** A field-name assertion passes after a rename and proves nothing. And a green atomicity test is **not** proof of rollback — the harness mocks Prisma and `$transaction` is a pass-through (DC-24). Report atomicity as *structurally asserted*, never as *rollback proven*.
      **Carried forward from T-7's review (`execution.md` A-42):** every full-suite run already emits `A worker process has failed to exit gracefully … improper teardown`, and three app-booting suites have shown intermittent, non-reproducing failures under load. **You add `admin-registrations.e2e.spec.ts`, another app-booting suite.** Ensure a matching `close()` for every app you boot, and if you see an intermittent failure, re-run on a quiet tree before reporting it — two workers have already lost time to measurements taken beside their own mutation.
      **Carried forward from T-5's review (`execution.md` A-33, A-34):** (1) **self-match** — `publishedActorId` is absent from `list()`'s `select:` and the queue applies no default status filter, so once this task sets `publishedActorId` every approved row will match the actor it itself created and report `duplicateCandidateCount >= 1`. Add the field to `select:` and exclude it in `matchOne`. (2) creating `admin-registrations.e2e.spec.ts` makes true a citation in `admin-registrations.service.ts` that is currently ahead of reality (KZ-008) — confirm it.
      Clause sweep: `BUT contactPerson must NOT land on position` → mutation above. `AND IT MUST leave technicalSupport/gpsAltitude/gpsAccuracy null` → assert null by value. `AND IT MUST satisfy chunk 1's invariant` → the call is present but **cannot return false** on this path (§6.2's honesty note) — **declared an unevaluable gap, not a gate.** `BUT the gate must NOT be client-only` → craft a request with a misspelled acknowledgement → `400`. Double approval → second call returns `409` and `actor.create` was invoked exactly once.
      Done when: all six scenarios pass, the `contactPerson` mutation reddens by name with output recorded, `409` on both meanings distinguishable by message, notification dispatched post-commit.
      **Re-measure the budget at this task's close.**

- [x] **T-9 `POST /admin/registrations/:id/reject` + `rejection-reasons.ts`** (deps: T-2, T-6)
      Scope: frozen reason list incl. *"Duplicate of an existing registry record"*; optional applicant-facing note; same compare-and-set; audit; post-commit notification. Its `FIXTURE_MAP` entry.
      Traces: FR-11 scenario 3 · FR-13 scenarios 1, 2 · FR-14 scenarios 1, 2 · `design.md` §6.4
      Files: `rejection-reasons.ts` + `.spec.ts`, `dto/registration-reject.dto.ts`, service/controller + specs, mail template, `pii-boundary.spec.ts`
      Skills: `nestjs-expert`, `api-design-principles` · Effort: **high**
      Verify: `cd backend && npm test -- --silent reject && npm test -- --silent registrations-lookup`
      **Carried forward from T-8's review (`execution.md` A-55):** `mail.service.spec.ts` covers `sendReceipt`/`sendVerificationCode` including the NFR-8 *no address in the log line* assertions, but `sendApproval` has none. FR-14 scenario 2's logging clause is **your** trace — add `kind=approval` and `kind=rejection` log assertions when you land the rejection template.
      Falsifying input: make the public lookup serializer include `rejectionReason` → the lookup assertion must redden (DC-32). The reason code is admin-only; only the note is applicant-facing.
      Disqualifying: a green reject test that never exercises 3a's **public lookup** has not shown the note reaches the applicant. FR-13 scenario 2 spans two modules and must be asserted end-to-end with the **no-op mail transport selected**, or NFR-10 is unproven.
      Clause sweep: `BUT it must NOT create an Actor / publish any field / alter the consent record` → assert zero `actor.create` calls and the consent columns byte-identical before and after. `AND IT MUST make the reason mandatory` → omit it → `400`. `AND IT MUST work with email delivery disabled` → run the lookup assertion under the no-op transport.
      Done when: rejection terminal, note readable via public lookup with mail disabled, reason code absent from that response, no actor created.

- [x] **T-10 PII release gate — discrimination proof and the by-value admin sweep** (deps: T-4, T-6, T-7, T-8, T-9)
      Scope: assert, for all five admin routes, that an anonymous caller gets `401` and a `Staff` caller `403`, and that **neither body contains any fixture value**. Then prove the gate discriminates.
      Traces: NFR-1 (release gate), FR-9 scenario 3 · `design.md` DD-15, DD-16, DC-28
      Files: `backend/src/test/pii-boundary.spec.ts`
      Skills: `nestjs-expert`, `error-handling-patterns` · Effort: **xhigh**
      Verify: `cd backend && npm test -- --silent pii-boundary`
      **Carried forward from T-8's review (`execution.md` A-53):** **no test proves an Admin-authenticated `GET /admin/registrations` 200 body is PII-clean over HTTP.** T-8's e2e issues no `GET` at all, and this file's own contract forbids an Admin-authenticated builder in `FIXTURE_MAP` — so that claim rests only on T-5's unit assertion. A 3-line authenticated `GET` in `admin-registrations.e2e.spec.ts` asserting `res.text` carries no `submitterEmail`/payload PII is the cheapest place in the repo to close a real coverage hole.
      Falsifying input: **two probes, both required, both removed afterward** — (1) a throwaway `@Get` on `AdminRegistrationsController` with no `FIXTURE_MAP` entry; (2) a throwaway **second controller** registered in `RegistrationsModule.controllers` with one uncovered route. Each must fail the totality assertion **naming the exact route**. This is the pair 3a's T-13 ran; repeating it here is what proves the module-scoped derivation still holds with a second controller genuinely present.
      Disqualifying: **record both probe outputs verbatim in `execution.md`.** A summary of a discrimination probe is not the probe — and a permanent throwaway route would itself become an uncovered path, the opposite of what this gate is for. `git diff` must confirm both probes removed.
      Done when: bidirectional totality green over the widened set, five admin routes asserted by value on `401`/`403`, both probes run, output recorded verbatim, probes removed.

---

## Phase D — Frontend

- [x] **T-11 `lib/api/registrations-admin.ts` — typed client** (deps: T-4, T-6, T-7, T-8, T-9)
      Scope: typed calls for all five endpoints; exact string-literal unions mirroring the backend; `pageSize` clamped at 100 client-side; `ApiError.details` mapped for field errors.
      Traces: FR-9…FR-13 (wire contracts) · NFR-11 · `frontend/CLAUDE.md` API conventions
      Files: `frontend/lib/api/registrations-admin.ts` + `.test.ts`
      Skills: `vercel-react-best-practices` · Effort: **medium**
      Verify: `cd frontend && npm test -- --silent registrations-admin && npx tsc --noEmit`
      **Carried forward from T-8's review (`execution.md` A-60):** `POST /:id/approve` returns **200**, not 201 (module convention; the e2e pins it with `.expect(200)`). Type the client accordingly.
      **Carried forward from T-7's review:** `POST /:id/dismiss-duplicate` returns only `{ registration: { id, reference, status } }`, **not** `AdminRegistrationDetail` — the write path deliberately omits the detection call. Type the client to the actual response; the refreshed candidate list arrives on the next `GET /:id`.
      Falsifying input: widen a status union to `string` → `tsc --noEmit` must fail at a consumer. **`npm test` alone cannot catch this** — `next/jest` uses SWC and type-checks nothing.
      Disqualifying: tests that assert against mocks only. `frontend/CLAUDE.md` records mock-vs-live drift shipping bugs; assert real wire shapes — URL, method, body, error mapping.
      Done when: five calls typed, unions exact, `tsc --noEmit` clean, wire shapes asserted.

- [x] **T-12 Queue page + `RegistrationsTable` + sidebar entry** (deps: T-11)
      Scope: `/admin/registrations`, URL-synced state, oldest-first, dual table/card rendering, sticky reference column with opaque background and `shadow-sticky-edge`, three segments only, empty-state discrimination. One `NAV_ITEMS` entry.
      Traces: FR-9 scenarios 1, 2, 4, 5 · NFR-5, NFR-6, NFR-7 · `design.md` §7.2, §7.6
      Files: `app/(admin)/admin/registrations/page.tsx` + test, `components/admin/RegistrationsTable.tsx` + test, `components/admin/AdminSidebar.tsx`
      Skills: `tailwind-design-system`, `shadcn-ui`, `react-doctor`, `frontend-design` · Effort: **high**
      Verify: `cd frontend && npm test -- --silent RegistrationsTable && npm test -- --silent 'registrations/page' && npm run build`
      Falsifying input: add an `AWAITING_APPLICANT` segment → the absence assertion must redden.
      Disqualifying: **the `md`/`lg` breakpoint is not decided by this document and must not be decided by reasoning.** Measure the scrollable strip at `md` in a real browser and record the number, as `ActorsTable`'s `lg` split was measured (~94px). A breakpoint chosen from argument is `usage-analytics` L-1 defect #4 repeating. Separately: jsdom cannot evaluate contrast, focus order, or focus visibility — a green `jest-axe` says nothing about them (DC-16).
      Clause sweep: `BUT it must NOT present a segment for AWAITING_APPLICANT/WITHDRAWN` and `AND IT MUST NOT present a "No email" flag` → both are **absence** assertions, which is the direction that matters; both can only prove absence and that is recorded. `AND IT MUST keep filter and page state in the URL` → assert `router` receives the synced query. `AND IT MUST inherit the shell's gate` → `NavItem` gains no role field; assert its shape is unchanged.
      Done when: both render modes correct, segments limited to three, empty states distinguished, breakpoint **measured and recorded**, sidebar entry present, build green.
      **Re-measure the budget at this task's close.**

- [x] **T-13 Detail page + `RegistrationDetailPanel`, `ConsentRecordCard`, `ActivityTrail`, `DuplicateWarningCard` (display)** (deps: T-11)
      Scope: `/admin/registrations/review?id=` via `useSearchParams()` inside `<Suspense>`; reference in the header; submitted-details table with the two non-publishable fields **explicitly marked as review context**; location card; consent card with explicit timezone and the *recorded-at-submission* label; trail; duplicate warning (read-only here).
      Traces: FR-10 scenarios 1, 2, 3 · FR-11 scenario 1 · NFR-5, NFR-6, NFR-7 · `design.md` §7.1, §7.3
      Files: `app/(admin)/admin/registrations/review/page.tsx` + test, `components/admin/RegistrationDetailPanel.tsx`, `ConsentRecordCard.tsx`, `ActivityTrail.tsx`, `DuplicateWarningCard.tsx` + tests
      Skills: `tailwind-design-system`, `shadcn-ui`, `react-doctor`, `frontend-design` · Effort: **high**
      Verify: `cd frontend && npm test -- --silent RegistrationDetailPanel && npm test -- --silent ConsentRecordCard && npm run build`
      Falsifying input: remove the review-context marking from `contactPerson` → the assertion must redden. A reviewer misled into thinking that field publishes is the human half of DC-23.
      Disqualifying: a build that succeeds proves static-export conformance only if the route is genuinely static — a `[id]` segment or un-Suspensed `useSearchParams()` fails the build, so **a green build here is real evidence** for NFR-7 (unusually — most gates in this spec are weaker than they look; this one is not).
      Clause sweep: FR-10's `AND IT MUST show the reference code` → assert present in the header. `AND IT MUST render the timestamp in a form that names its timezone` → assert the rendered string contains a timezone designator. `AND IT MUST label it recorded-at-submission` → assert the qualifier text. `BUT it must NOT be a writable log` → assert `ActivityTrail` renders no form control.
      Done when: all fields rendered, review-context marked, timezone and qualifier present, trail read-only, build green.

- [ ] **T-14 Decision surfaces — approve via `AcknowledgeDialog`, `RejectDialog`, dismissal wiring** (deps: T-12, T-13)
      Scope: approve behind `AcknowledgeDialog` with `acknowledgementText = "I confirm consent is on file"`, body naming the policy version and acceptance date and stating what publication does; `RejectDialog` with required reason select, optional note, irreversibility notice; per-candidate dismiss action; `aria-live` result announcement.
      Traces: FR-11 scenario 2 (UI limb), FR-12 scenario 3, FR-13 scenario 1 (UI limb) · NFR-5, NFR-6 · `design.md` §7.4
      Files: `components/admin/RejectDialog.tsx` + test, approve wiring in `RegistrationDetailPanel.tsx`, `DuplicateWarningCard.tsx`
      Skills: `shadcn-ui`, `tailwind-design-system`, `react-doctor` · Effort: **high**
      Verify: `cd frontend && npm test -- --silent RejectDialog && npm test -- --silent RegistrationDetailPanel && npm run lint`
      **Carried forward from T-13's review (`execution.md` A-78, A-80):** you reopen `RegistrationDetailPanel.tsx`, so close two things while you are there — (a) `statusLabel`/`statusBadgeClasses` are **byte-equivalent copies** of the same functions in `RegistrationsTable.tsx`; extract a shared module (the `lib/content/roles.ts` precedent) so the queue's and the detail's status vocabulary cannot drift, and make it exhaustive rather than `default:`-terminated; (b) that panel's test asserts values for only **7 of 14** payload fields — `traderType`, `sex`, `region`, `crops`, `capacityTons` render but are unasserted, so a dropped row among those would not redden.
      **Carried forward from T-11's review (`execution.md` A-71):** build `RejectDialog`'s reason labels as a **total `Record<RejectionReasonCode, string>`** — the same pattern T-15 uses for `actionBadgeClasses`. `RejectionReasonCode` is a closed union but has no exhaustive consumer, so a future widening to `string` would go undetected; a total `Record` converts that gap into a compile error for free.
      **Carried forward from T-9's review (`execution.md` A-62):** the rejection reason list is served over **no endpoint** — `design.md` §5 has five and none returns it. Your reason `<select>` will hand-copy five code/label pairs across the module boundary with **nothing gating the drift**. Import the codes from the backend's closed `RejectionReasonCode` union if the build allows it; otherwise state plainly in the component that the list is duplicated and must be kept in step with `backend/src/registrations/rejection-reasons.ts`.
      Falsifying input: use `ConfirmDialog` for approve → assert the approve path renders `AcknowledgeDialog`'s typed input; the swap must redden. `ConfirmDialog` also hardcodes `bg-danger`, so a token grep for `danger` on the publish action is a second, independent signal.
      Disqualifying: the client gate is **UX only** — a green dialog test says nothing about server-side re-validation, which T-8 owns. Do not report this task as covering FR-12's `BUT the gate must NOT be client-only`; that clause is T-8's.
      Clause sweep: FR-12's `AND IT MUST name the policy version and acceptance date` → assert both appear in the dialog body sourced from the fetched record, not hardcoded. FR-13's `AND the interface states that rejection cannot be undone` → assert the notice text. `AND IT MUST make the reason mandatory` → assert submit disabled with no reason.
      Done when: approve gated by the typed acknowledgement, reject collects a mandatory structured reason, dismissal per candidate, `danger` used for rejection only, lint green.

- [ ] **T-15 Audit-action taxonomy end-to-end (FR-16)** (deps: T-1)
      Scope: widen `AuditEntry['action']` to eight; convert `actionBadgeClasses` to a total `Record`; add a `REGISTRATION_APPROVE` case to `SnapshotDetails`'s summary switch, which **keeps its `default`** (its domain is a subset of the union — `design.md` §7.5).
      Traces: FR-16 scenarios 1, 2 · NFR-11 · `design.md` DD-21
      Files: `frontend/lib/api/actors-admin.ts`, `frontend/components/admin/ActorHistoryPanel.tsx` + test
      Skills: `vercel-react-best-practices`, `react-doctor` · Effort: **high**
      Verify: `cd frontend && npx tsc --noEmit && npm test -- --silent ActorHistoryPanel`
      **⚠️ CARRIED FORWARD FROM T-11'S REVIEW (`execution.md`) — YOUR `tsc` GATE IS CURRENTLY VACUOUS.** `npx tsc --noEmit` **already exits non-zero** on this checkout: there is one pre-existing error, `app/(admin)/admin/actors/page.test.tsx(45,64) TS2556`, introduced by `0158dc0` (a prior spec). So *"remove a `Record` member → `tsc --noEmit` must fail"* reports failure **before and after** the mutation and proves nothing. **Use an error-set diff instead:** (1) `npx tsc --noEmit 2>&1 | sort > /tmp/tsc-before.txt` and record it verbatim; (2) apply the mutation, re-run to `/tmp/tsc-after.txt`, `diff`; (3) **the gate is that the diff is non-empty AND the new error names the expected file and code** — `TS2741`/`TS2739` "Property `<MEMBER>` is missing in type…" in `ActorHistoryPanel.tsx` — assert the error's **content**, since an unrelated new error would pass a bare non-empty check; (4) the post-change error set must equal the baseline **exactly**. Apply the same discipline to the pre-change `IMPORT` run: quote the jest failure verbatim. **Do NOT fix the baseline error** — it belongs in its own bugfix task and folding it in would contaminate the diff your gate is measured against.
      Falsifying input: **run the new test against the pre-change code**, where `IMPORT` is missing from both the union and the map. It MUST fail there. A gate that cannot fail is not a gate (KZ-002, third recurrence) — and this drift is live in the repo today, so the pre-change state is available for free. Then remove one member from the `Record` → `tsc --noEmit` must fail.
      Disqualifying: `npm test` alone **cannot** catch a missing `Record` member — SWC type-checks nothing. A report citing only `npm test` has not verified NFR-11. Also: the existing 362-line `ActorHistoryPanel.test.tsx` must stay green untouched; a change in rendered output for the five pre-existing actions means the `Record` values diverged from the `switch` arms.
      Clause sweep: FR-16's `BUT it must NOT be true that the union omits IMPORT` → the pre-change run. `AND IT MUST fail loudly for a future unknown action` → the `Record`-member removal. `BUT a REGISTRATION_REJECT row must NOT appear in any actor's history` → **declared an unevaluable gap in the UI layer**: the row is written with `actorId` = a registration id and the read path filters on `actorId`, so no UI can render it; assert it backend-side in T-2's persistence test instead.
      Done when: eight members everywhere, pre-change run recorded as failing, `tsc --noEmit` clean, existing panel suite green untouched.

---

## Phase E — Constitutional

- [ ] **T-16 Amend the baseline documents** (deps: T-10, T-14, T-15)
      **Carried forward from T-10's review (`execution.md` A-67, A-68):** (1) **the release gate is module-scoped by construction** — a registrations route added to a *different* module is invisible to a derivation rooted at `MODULE_METADATA.CONTROLLERS`, and the suite would go green while those routes shipped uncovered. Today the only defence is DD-15's placement decision and a module JSDoc; **no test enforces it.** Since §2/§4 are being amended anyway, that constraint belongs in the TRD, not only in a test-file comment. (2) `pii-boundary.spec.ts`'s scan-loop `it` title still routes readers to `execution.md → T-13`; the current-generation probe pair lives under **T-10** and supersedes it.
      Scope: TRD §2 (module responsibility), §4 (+5 endpoints), §8 (adjudication authority), §12.5 (**ADR-011**, drafted in `design.md` §9), §13 (QA-3, and resolve B3 — either widen QA-12's actor text to cover admin-gated PII routes or cite QA-3 alone). `docs/ux-ui/design.md` §2 IA (+2 routes), §4 screen inventory (+2 screens), §5 admin shell nav.
      Traces: `requirements.md` §4.2 · `design.md` §9 ADR-011 · `judgment.md` B3
      Files: `docs/trd/trd.md`, `docs/ux-ui/design.md`
      Skills: `software-architect`, `cognitive-doc-design` · Effort: **medium**
      Verify: manual review at the HITL pause — **there is no command.** Say so; do not invent one.
      Falsifying input: **none exists.** Documentary conformance has no automated gate in this repo, and claiming one would be the false-gate pattern this spec repeatedly refuses. This task's evidence is a human read.
      Disqualifying: an amendment asserting something the code does not do is a defect (KZ-008). Re-resolve every factual claim against the shipped code **at the moment of writing**, and again before archive.
      Done when: all sections amended, ADR-011 entered with status `Accepted`, B3 resolved one way or the other and the choice recorded.
      **Re-measure the budget at this task's close.**

---

## PR Strategy — five, and the boundaries are principled

Confirmed 2026-09-01. ~8,200 LOC in one PR is unreviewable; these cuts sum to the design budget exactly.

| PR | Tasks | LOC | Why this boundary |
|---|---|---:|---|
| **1** | T-1…T-3 | ~600 | Small, unblocks everything, and **the gate discriminant must land alone** — R-10 |
| **2** | T-4…T-7 | ~1,500 | Admin read surface; no irreversible write anywhere in it |
| **3** | **T-8…T-10** | ~1,900 | **The irreversible write plus its release-gate proof. Review this one hardest — isolating it is the point.** |
| **4** | T-11…T-13 | ~2,400 | Frontend read surface |
| **5** | T-14…T-16 | ~1,800 | Decision surfaces, the audit fix, constitutional amendments |

Descriptions follow `cognitive-doc-design` review-empathy rules: what to review first, what is explicitly out of scope, and links to the previous and next PR in the chain. **PR 3's description must state in its opening line that it contains the system's only path from private data to public record.**

**T-15 can be lifted out and shipped early.** It depends only on T-1, shares no file with any other task, and closes a defect live in the repo today (`AuditEntry['action']` omits `IMPORT`; `actionBadgeClasses` has no `default` and returns `undefined`). If this spec stalls for any reason, that fix should not stall with it.

## Dependency Graph

Edges, so the Leader can pick the next eligible task without re-reading the briefs. **A task is eligible when its status is `[ ]`/`[~]` and every dependency is `[x]`.** Ties broken by document order.

```
T-1  → T-2, T-4, T-15
T-2  → T-8, T-9
T-3  → T-4
T-4  → T-5, T-10, T-11
T-5  → T-6
T-6  → T-7, T-8, T-9, T-10, T-11
T-7  → T-10, T-11
T-8  → T-10, T-11
T-9  → T-10, T-11
T-10 → T-16
T-11 → T-12, T-13
T-12 → T-14
T-13 → T-14
T-14 → T-16
T-15 → T-16
```

**Roots (startable immediately):** T-1, T-3.
**Verified acyclic**, all 16 reachable.

**Parallelisable:** T-3 alongside T-1 and T-2 · T-15 any time after T-1 · T-8 and T-9 concurrently after T-6 · T-10 and T-11 concurrently once the five routes exist · T-12 and T-13 concurrently after T-11.

> **T-15 is the one genuinely free win.** It depends only on T-1 and touches files nothing else in this spec touches, so it can run alongside any backend task — and it closes a defect that is **live in the repo today**, independently of whether the rest of this spec ships.

## Coverage Closure — scenario and clause granularity (KZ-001)

**Requirement-ID presence is not closure.** Every scenario below is owned by a named task; clauses that span tasks are **split explicitly**, never discharged by citing a sibling requirement.

| FR | Scenario | Owner |
|---|---|---|
| FR-9 | Queue lists and segments by status | T-4 (data) + **T-12** (segments, "No email" absence) |
| FR-9 | Sorted oldest-first by default | T-4 (default) + **T-12** (URL sync) |
| FR-9 | Only Admin reaches it | T-4 (401/403) + **T-10** (by-value sweep, all five routes) |
| FR-9 | Page beyond the result set | T-4 (envelope) + **T-12** (empty-state discrimination) |
| FR-9 | Reachable from the admin shell | T-12 |
| FR-10 | Full payload is shown for review | T-6 (data) + **T-13** (review-context marking) |
| FR-10 | Consent record is legible | T-6 (shape) + **T-13** (timezone + recorded-at-submission label) |
| FR-10 | Activity trail is derived, not authored | T-6 (derivation, no fabricated timestamp) + **T-13** (read-only rendering) |
| FR-11 | Candidate match is surfaced with context | T-5 (detection, queue count) + **T-13** (warning card) |
| FR-11 | Dismissal is per candidate and it persists | T-7 (persistence, 3-candidate proof) + **T-14** (action wiring) |
| FR-11 | Duplicate is a first-class rejection reason | T-9 |
| FR-12 | Approval publishes with correct provenance | T-8 |
| FR-12 | The publishable subset is exactly this | T-8 |
| FR-12 | The acknowledgement gate is real | T-8 (**server-side**) + T-14 (**client**, UX only — explicitly not the gate) |
| FR-12 | Atomicity under failure | T-8 — **structurally asserted only**; real rollback is DC-24, an accepted gap |
| FR-12 | Double approval is refused | T-8 |
| FR-12 | The generated natural key does not collide | T-8 (DD-23 derivation, eight prefixes, `P2002` → `409`) |
| FR-13 | Rejection is terminal for this chunk | T-9 (backend) + **T-14** (irreversibility notice) |
| FR-13 | The note reaches the applicant | T-9 — end-to-end through 3a's public lookup, mail disabled |
| FR-14 | A send failure does not roll back an adjudication | T-8, T-9 |
| FR-14 | The whole outcome path works with email disabled | T-9 |
| FR-16 | The live drift is closed, not merely avoided | T-15 |
| FR-16 | An approval is visible in its actor's history | T-15 (render) + T-2 (`REGISTRATION_REJECT` persistence — its UI limb is a **declared gap**) |

**23 scenarios, 23 owned.** Nine are split across two tasks; each split is named above and repeated in the owning tasks' clause sweeps.

| NFR | Owner |
|---|---|
| NFR-1 release gate | T-3, T-10 |
| NFR-2 consent integrity | T-8 |
| NFR-3 atomicity (honest measure) | T-8 |
| NFR-5 accessibility | T-12, T-13, T-14 — **contrast/focus order/focus visibility routed to the DC-16 human check** |
| NFR-6 tokens | T-12, T-13, T-14 |
| NFR-7 static export | T-13 (build is real evidence here) |
| NFR-8 observability | T-4 (`forRoutes`, emission asserted) |
| NFR-9 queue performance | T-4 (pagination/index shape) — **index usage is DC-25, unprovable, declared** |
| NFR-10 email independence | T-9 |
| NFR-11 type fidelity | T-11, T-15 |

---

## Not covered by any task — declared, not discharged

Repeated here so no reader mistakes silence for coverage.

| # | Gap | Substitute |
|---|---|---|
| **DC-16** | Contrast, focus order, focus visibility on both new screens. **Specific number from T-12's review:** the `PENDING_REVIEW` chip (`bg-border text-muted`, 12px) computes to **≈4.45:1**, marginally under the 4.5:1 AA floor for small text, and no gate sees it (`border` is not one of `contrast.test.ts`'s nine grounds). Repo-wide pre-existing — byte-identical in `ActorsTable`, `UsersTable`, `ImportPreviewTable`, `AdminSidebar`. **Check this pairing specifically.** | **Human check at the Phase-3 HITL pause**, real browser. `jest-axe` disables `cat.color` entirely. KZ-003: these components take plain props — **never defer this on auth grounds.** |
| **DC-24** | Real transaction rollback | Structural assertion only. A DB-backed harness would close it; out of scope. |
| **DC-25** | Queue index *usage* | `where`/`orderBy` shape asserted; `EXPLAIN` needs real MySQL. |
| **DC-33** | The reviewer's judgement | Ungateable. Procedural substitutes only (typed acknowledgement, full payload, duplicate warning, audit). |
| **DC-34** | Duplicate-detection recall | A known duplicate is gated; "no duplicate is ever missed" is not. |
| **DC-35** | Detection cost beyond ~1,300 actors | Revisit trigger recorded; not optimised. |
| — | `REGISTRATION_REJECT` row rendering | No UI can display it; persistence gated backend-side, rendering unobservable. |
| — | Email deliverability | Inherited DC-18. NFR-10 makes email non-load-bearing instead. |

---

## Execution Conventions

- Commits: `[SPEC:admin/registration-review-queue] <message>`.
- **Evidence before checkbox:** append the `execution.md` entry with the Reviewer's PASS **first**, then flip `tasks.md` to `[x]`, then commit. Checkbox-without-evidence is an unfalsifiable completion.
- A task failing review 3× stays `[~]` and escalates.
- Reviewer model **must differ** from the Implementer's (`author ≠ auditor`).
- **Execution-shaped evidence must be re-run, not read** (`usage-analytics` L-2): T-10's two probes, T-15's pre-change failing run, T-12's breakpoint measurement, T-3's intermediate green run. A Reviewer reading source can only audit the *account* of these. Record verbatim output in `execution.md`, or assign a Tester on a different model.
- `backend`'s `npm run lint` runs `eslint --fix` and **mutates files** — verify diffs with `npx eslint "{src,test}/**/*.ts" --quiet` instead.
- Never run a measurement command while a delegated agent is active.
