# Validation Report — Legal Notices & Approved Consent Copy

- Spec path: `docs/specs/legal/legal-notices-and-consent-copy/`
- Date: 2026-09-15 · Branch `feat/legal-notices`
- Method: **three independent T3 validators run in parallel**, each read-only, each scoped to one dimension and each instructed not to defer to the Leader's framing. This is KZ-012's recorded countermeasure — the one that worked was *structural*, not procedural.

---

## Verdict

| Dimension | Result |
|---|---|
| **The shipped product** | ✅ **PASS** |
| **The spec and the audit trail** | ❌ **FAIL** |

**The code is sound. The paperwork describing it is substantially false.**

All three validators converged on the same shape independently: no PII boundary violated, no static-export violation, no stack substitution, the legal text fidelity **independently recomputed** (a validator recounted Privacy 16 headings + 61 bullets = 77 and Terms 17 + 63 = 80 and matched the reported figures), the append-only invariant genuinely structural, the tripwire correctly inverted and the retention guard correctly not. **Roughly twenty false or stale statements** were found across `requirements.md`, `design.md`, `tasks.md`, `execution.md`, `docs/ux-ui/design.md` and four code comments.

**Not one finding is a defect an Implementer introduced.** Every one is in Leader-authored text — the surface KZ-011 names, where every AKILI gate asks *does the code match the spec* and nothing asks whether the spec is **true**.

---

## Findings, by severity

### Blocking — must be fixed before merge

| # | Finding | Found by |
|---|---|---|
| **B-1** | **`docs/ux-ui/design.md` still asserts the withdrawn premise at four sites.** §2 lines 43 and 45–49, §4 rows 134 and 135 describe `/terms` and `/privacy` as *"placeholder copy pending Legal (T-8)"*, `/privacy` as *"covering contact-form data handling only"* with its limitation clause *"retained until T-8"*, and *"no cookie content"* — all false. **T-10 ran before T-8/T-9 and nobody re-opened it.** This is the constitutional baseline: it trains every future agent and no test touches it. | all three |
| **B-2** | **T-10 is checkboxed without evidence.** `tasks.md:118` is `[x]`; `execution.md:286` states *"This task stays `[~]`, not `[x]`… Marking it complete would be an unfalsifiable completion."* No entry records the deferred half closing. This is the non-recoverable direction the root guide names — and it is **what let B-1 survive**: the ledger read closed over an open task. | 1, 2, 3 |
| **B-3** | **A constitutional-baseline edit shipped with no record and no Reviewer.** ADR-013's amendment is in `main` (commit `9a27af1`) with no `execution.md` entry. `execution.md:319` still says it is *"not amended … and that is still true today"* — both halves now false. | 1, 3 |
| **B-4** | **`docs/ux-ui/design.md:135` miscounts the contact-channel facts as four and attributes Legal's text to engineering** — D-9 says three are engineering-authored and fact 1 is discharged by Legal's own *"Information We Collect"*. A count contradicting a sibling document's prose (KZ-005). | 3 |

### Serious — unowned clauses and false decisions

| # | Finding | Found by |
|---|---|---|
| **S-1** | **Two requirement clauses are owned by no task and guarded by no test.** FR-3 scenario 3's *"THEN it names the GA4 cookies as the only cookies this site sets"* — deleting that entire section reddens nothing. FR-6's *"AND IT MUST reuse `FOOTER_LINK_CLASSES`"* — `Footer.test.tsx` has **zero** className assertions. `tasks.md`'s own Coverage-closure section claims every clause is owned by exactly one task. **That claim is false.** | 1 |
| **S-2** | **D-9 is false about placement, and `privacy.ts`'s own header is false about itself.** D-9 says the engineering facts sit *"after Legal's block"*; they sit **between** Legal's Cookies and Contact Us sections. The module header still describes *"three sections after 'Changes to this Privacy Policy'"* — shipped as one section with three sub-blocks, before it. The product-owner-directed restructure exists **only as a code comment**. | 2, 3 |
| **S-3** | **D-10 contradicts defect class 8's only stated mitigation.** §8 and `design.md` §9 both promise the two NFR-4 findings go back to Legal *"before the text is frozen"*. D-10 records they were not asked, and `privacy.ts` ships `v1.0`. The one substitute named for the spec's only ungated defect class was not performed, and the spec still asserts it will be. | 2 |
| **S-4** | **D-14 is contradicted by its own file.** `terms.ts:15-19` states the `15. ` prefix was *"reproduced exactly, number included"*; line 394 drops it per D-14. Two mutually exclusive accounts in the one file whose entire claim to trust is transcription fidelity. | 2, 3 |
| **S-5** | **D-5's forward hedge is false.** *"A future Swahili edition enters as `v2.0-en`/`v2.0-sw` with no redesign"* — `deriveCurrentEdition` returns the **last** element, so appending both makes Swahili the only served edition. Concurrent locales need a selection mechanism. The no-locale-field half is correct. | 2 |
| **S-6** | **D-7's justification is false at HEAD.** Its reason is *"Legal's text supplies its own contact block"* — every contact block in all three documents is blank or `Insert …`. The decision not to link `/contact` leaves a data subject told to contact nothing. | 2 |

### Operational — the finding with the largest real-world consequence

| # | Finding |
|---|---|
| **O-1** | **`/terms` and `/privacy` publish unfilled Legal fields, and no gate can see them.** The pages render *"Effective **Insert Date**"*, *"Insert CIAT Legal Entity"*, *"Insert Email"*, and four blank contact lines. Defect class 1's tripwire matches only the literal word `placeholder`, so it is **structurally blind** to Legal's own placeholder idiom — and `privacy-a11y.test.tsx:102` *pins* `/effective insert date/i` as satisfying FR-5's visible-effective-date clause. The gate certifies the defect. This was a deliberate product-owner instruction (treat Legal's unfilled fields as ordinary text) and is correct as a code decision; what is missing is that **nothing marks these two pages as not-yet-publishable.** |

### Ledger integrity

| # | Finding |
|---|---|
| **L-1** | **`execution.md`'s Document Control describes a different run than the one it records.** It says *"Phase A only … T-8 and T-9 are not attempted"* and *"Reviewer on T-1 and T-10 only"*; the same file records T-8 and T-9 Reviewer PASSes. `tasks.md:8` carries the same false roster. |
| **L-2** | **T-9's entry is headed PASS (attempt 2) while its body describes an attempt-2 Reviewer FAIL** and a subsequent Leader fix. As written, the PASS is not attributable to a re-reviewed attempt. |
| **L-3** | **The budget was breached ~5× and never escalated in the ledger.** Declared ~700 net LOC and ~4 review rounds; measured **3,567 net code LOC** (1,705 of it Legal's prose and types) and **9 review rounds**. The only budget check recorded predates T-9 tripling `consent-policy.ts`. It *was* escalated to the user verbally; it was never written down, which is what the tripwire requires. |
| **L-4** | **An unlogged visual rework.** `max-w-prose` removed from every element, container widened, `text-justify hyphens-auto` added — attributed in a code comment to a product-owner request, appearing in **no task, requirement, or execution entry**, and landing in exactly the area (defect class 9 / NFR-5) with no automated gate and a human check never performed. |

### Residue — four false comments this spec authored

`cookies/page.tsx:3-5` (*"banner still points at `/privacy` until T-6"*) · `terms.ts:15-19` (S-4) · `privacy.ts:8-12` (S-2) · `ConsentPolicyDisclosure.tsx:24-29` (*"the backend today serves four"* — it serves nine). The T-10 sweep fixed **seven** sites of this exact class and missed these four.

### Stale prose (lower severity)

`requirements.md` §1 summary is present-tense about a state that no longer exists · §9's *"Blocking … minor details outstanding"* · `tasks.md`'s *"Eligible now: T-1, T-2, T-7"* with every box checked · `design.md` §4.2's *"it still carries exactly one today"* — **the same sentence corrected once already at T-1, gone stale again at T-9, with the code comment swept and the design document left behind** · `design.md` §5.1 states the pre-extension `LegalSection` shape as fact · both documents still `Status: Draft`.

---

## What no validator could establish

All three were read-only and ran nothing. Every suite total, falsifier redden, and the headless-Chrome measurement remains the authoring agent's account (`author == auditor` on execution — KZ-012). One reported figure **does not reconcile**: T-8 and T-9 both report 114 suites / 1733 tests, yet T-9 added a guard test; a net-zero delta requires a removal nothing records.

Fidelity against Legal's `.docx` sources is unverifiable from the repo — the sources live outside it. The internal reconciliations match.

ADR-014's freedom on unmerged branches must be **re-checked immediately before merge**; no validator could run `git log --all`.

---

## Archive readiness

**NOT READY.** Four blocking findings, six serious, and the ledger cannot presently be trusted as an account of the run.

The remediation is almost entirely documentation. The product does not need reopening.
