# Archive Summary — Public Profile Disclosure

## 1 · Document Control

| Field | Value |
|---|---|
| Original spec path | `docs/specs/actors/public-profile-disclosure/` |
| Archived as | `docs/specs/archive/2026-09-08-actors--public-profile-disclosure/` |
| Archive date | 2026-09-08 |
| Depth | Full |
| Branch | `public-profile` (24 commits ahead of `main`, not yet merged) |
| Final status | **Complete — validated PASS, not yet merged or deployed** |
| Decided by | Daniela Gómez |

## 2 · What changed

Consent stopped being a GPS switch and became the disclosure boundary.

Before, `consentStatus = GRANTED` unlocked exact coordinates and nothing else; a visitor on an actor's profile met a panel reading *"Restricted — sign in to view"*. Now `GRANTED` unlocks **every field the actor supplied** — but asymmetrically, and that asymmetry is the spec's central design act:

| Path | Projection | Carries the contact block? |
|---|---|---|
| `GET /api/v1/actors` | `toPublicListItem` — 10 keys | **No** |
| `GET /api/v1/actors/:id` | `toPublicDetail` — 15 keys | Yes, for a `GRANTED` actor |

Because the map, the dashboard and the CSV are all built from the list response, bulk contact harvesting became **structurally impossible** rather than policy-forbidden. That asymmetry was not in the original proposal — it replaced an earlier plan to narrow only the CSV, which Judgment Day showed was inert, since the dashboard and map already load every actor into the browser.

## 3 · Requirements delivered

20/20 tasks closed, each with a Reviewer PASS recorded in `execution.md`.

| Requirement | Delivered |
|---|---|
| FR-1 · Detail discloses the published set | `toPublicDetail`; unsupplied fields serialise as `null`, never omitted |
| FR-2 · Non-consenting actors leave no trace | Consent pinned in the Prisma `WHERE`; a non-`GRANTED` detail request 404s **byte-identically** to a missing id |
| FR-3 · `technicalSupport` never public | In `NEVER_PUBLIC_FIELDS` for its own reason — unreviewed staff text, never the actor's declaration — and retained in the Admin projection |
| FR-4 · Self-registration publishes what it collects | `contactPerson`/`otherCrops` carried through approval; five standing tests kill the `position` adjacency trap |
| FR-5 · Excel template matches the form | Template v3, both columns appended; existing positions and required flags untouched |
| FR-6 · Real contact section replaces the locked panel | `ProfileContact`, seven always-rendered rows, em-dash on absence |
| FR-7 · Export omits the contact block | `PUBLIC_COLUMNS` = 8, contact block unnameable on the input type |
| FR-8 · No surviving contradiction | 16 constitutional documents in one commit (`611e8dfcc`) |
| FR-9 · The list is the bulk boundary | Absence asserted by **key and by value**, on every request shape |
| NFR-1…NFR-6 | Server-enforced, single policy module, gate shown able to fail |
| NFR-7 | Two members open and owned by legal; the third is **empty** — see §7 |

## 4 · Files changed

| Category | Net |
|---|---|
| Deliverable code (backend, frontend, infra scripts) | **+2,228** |
| Constitutional documents | +8 |
| This spec's own audit trail | +2,660 |

`design.md` §16's band was **1,700–2,400 net LOC**. Code landed inside it, with a 20th task added mid-flight on user approval. Three documents had asserted *~2,080* and **none of them had measured it** — validation measured it.

**Schema:** migration `20260904142128_add_contact_person_other_crops`, additive only — `contactPerson VARCHAR(191) NULL`, `otherCrops VARCHAR(300) NULL`.

**Deleted:** `frontend/components/profile/RestrictedContactPanel.tsx`, and the admin `ReviewContextBadge` with its backing set.

## 5 · Test evidence

| Gate | Result |
|---|---|
| backend (`--runInBand`) | **1061 / 1061** |
| frontend | **1637+ / 1637+** |
| `tsc --noEmit` | clean |
| lint (backend + frontend) | clean |
| frontend build (static export) | OK — every route prerendered, so the no-SSR constraint holds |

`pii-boundary.spec.ts` — the release gate — went from 25 to **34** tests and was **shown able to fail**: removing the consent pin from the Prisma `WHERE` reddens it, and the demonstration is recorded rather than asserted.

**No `test-report.md` exists**, and its absence is accepted: `/akili-validate` verified coverage directly at scenario and clause granularity rather than reusing a report.

**Human verification (T-19):** D-8 — rendered contrast, spacing and responsive behaviour — was closed by **Daniela reviewing the screen**, because no harness in this repo can evaluate it. `jsdom` computes no colour, `axe` returns *incomplete* for contrast, and `contrast.test.ts` is arithmetic over CSS constants. Citing any of them as a contrast pass would have been the KZ-002 pattern; the entry cites all three only as refusals.

## 6 · Validation summary

**PASS**, by four independent read-only auditors, each on a dimension the others did not touch. The Leader orchestrated all 20 tasks and audited nothing.

**7 FAIL-level defects found, all closed**, each verified in the tree rather than accepted from a report:

| Defect | Note |
|---|---|
| `AUDITABLE_FIELDS` not extended | **This spec opened an audit hole.** Measured: the set was complete on `main`; T-2 added two admin-editable columns and left it. Since `logUpdate` returns `null` on an empty diff, an edit changing only `contactPerson` wrote **no audit row at all** — a third party's name, publicly disclosed, erasable without trace |
| TRD §3 self-contradiction | §3 was true before; T-1 added the columns and T-17 rewrote only the surrounding prose |
| `design.md:102` survivor | Still called both fields *"non-publishable … review-only context"* — instance **seventeen** of the dominant defect, and the phrasing matched none of three prior sweep vocabularies |
| FR-4 import derive guard | **Passed with the defect present** — the row it ran against had every derive-source empty too |
| FR-9 circumvention clause | No test varied the request shape |
| FR-6 em-dash assertion | Covered 5 of the 7 rendered rows |
| `execution.md` T-19 claim | The Leader's own false claim about `seed-data.ts` |

**11 advisories, all closed.** The sharpest: all three policy field-set constants have **zero runtime consumers**. What actually withholds a field is not naming it in `toPublicListItem`/`toPublicDetail` — and the `general-setup/` templates, which bind every future spec, named neither projection.

**Two of the seven were findings the Leader had wrongly routed out of the spec**, re-classified by an auditor.

## 7 · Accepted warnings and follow-ups

None of these blocks the archive; none is silently dropped.

| Item | Owner |
|---|---|
| **R-1 · Intermittent backend failure.** `contact.e2e.spec.ts` fails intermittently in a full run, 23/23 in isolation ×3. The suite owns a rate limiter and the throttle counter survives across files, so a request the test expects validation to reject with 400 is rejected by the limiter with 429. **Survives `--runInBand`** — proven after the script fix: 1061 clean, then 1 failed. Not this spec's. | `docs/specs/bugfix/flaky-frontend-suite` (Draft) — its non-goal *"Backend test stability — not observed to have this problem"* is now **falsified** by this evidence |
| **ATP-68** (Jira, under ATP-49) — three TRD rows document routes no controller implements, and QA-6's map-performance tactic describes an approach the project deliberately abandoned when `bugfix--map-loads-all-actors` shipped (PR #20) | filed |
| **NFR-7, two members** — the consent-policy text is still `[PLACEHOLDER TEXT — pending legal review]` with `CONSENT_POLICY_VERSION` deliberately un-bumped; the email-purpose gap is unresolved | programme / legal |
| **`frontend/.env.example` omits the Cognito variables**, so a fresh checkout following the documented local-environment contract **cannot sign in as admin** at all | separate finding |

**NFR-7's third member is closed, and the closure changes what T-20 accomplished.** Whether applicants who registered under the old *"will not be published"* notice could have their `contactPerson` published, or had to be re-consulted, was escalated across three tasks. On 2026-09-07 Daniela confirmed **nobody has registered and the application has not been delivered**. The subject set is empty — so T-20 corrected a false notice to a data subject **before it was ever shown to one**, rather than after.

## 8 · Historical notes

**The dominant defect, seventeen instances:** *a claim written without re-reading the artefact it claims about.* **Not one was caught by a suite. All seventeen were caught by reading.** Instances 13 and 14 landed inside the diff whose job was closing the first twelve; instance 16 attributed to ADR-003 a premise it never held, refutable from a cell two lines above it in the same table; instance 17 was the Leader's, inside the validation that was hunting for it.

The countermeasure that worked every time was **mechanical, never attitudinal**: open the file, grep your own diff, run the mutation, let the compiler name the set, and check the **polarity** separately from the **name** — a right name with a wrong direction is still the defect.

**Three tasks needed three attempts** (T-16, T-17, T-20), and in two of those the defect was in the **task text the Leader had written**, not the Implementer's work. T-17's `Verify` was a grep over six fixed paths in a task whose requirement was repo-wide; T-20's `Done-when` presupposed a relabelled badge that could not be made true.

**What T-17's third sweep found that nothing else would have:** four `.agents/*` persona contracts that, left alone, instructed the next agent to revert this spec — `.agents/reviewer.md` made serialising `phone`/`email` to `Public` an automatic FAIL — and a deploy smoke gate that would have **failed against correct code** on the key `sex`. No test in this repository covers `infra/scripts/`.

**What worked and is worth repeating:** four independent auditors, each with one dimension and an explicit instruction not to defer to the Leader's framing. They produced the two re-classifications above, and twice corrected the Leader directly — once on a wording the Leader had specified, once on a claim the Leader had relayed from another reader without opening the artefact.

**Recorded against the Leader, for the retrospective rather than the record:** two findings routed out on a **scope** argument where a **correctness** argument was required, and three invalid measurements — one manufacturing 21 phantom failures, one contaminating the evidence for the only open finding.
