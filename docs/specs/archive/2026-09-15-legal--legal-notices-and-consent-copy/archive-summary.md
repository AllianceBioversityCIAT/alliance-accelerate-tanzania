# Archive Summary — Legal Notices & Approved Consent Copy

| Field | Value |
|---|---|
| Original spec path | `docs/specs/legal/legal-notices-and-consent-copy/` |
| Archived | 2026-09-15 |
| Jira | ATP-54 (subtask of ATP-49) |
| Branch | `feat/legal-notices` (12 commits, unmerged at archive time) |
| Final status | **Done** — 10/10 tasks `[x]`, validated, two non-code items open |

## Outcome

CIAT's approved Privacy Policy, Terms of Use and consent text ship. The consent policy became an **append-only registry of editions**, so `Registration.consentPolicyVersion` now resolves to the exact text a person accepted, forever. Three public legal pages exist where one narrow notice did. This closed the open edge ADR-013 had recorded against itself since 2026-09-08.

## Requirements delivered

| ID | Delivered |
|---|---|
| FR-1 | Append-only registry; `CONSENT_POLICY_VERSION` and the known-version set derived, not hand-written |
| FR-2 | Approved copy as edition `v1.0`; placeholder edition retained; tripwire inverted |
| FR-3 | `/cookies` — factual inventory, Google named as recipient, four GA4 signals, withdrawal asymmetry, consent control |
| FR-4 | `/terms` — approved text, no acceptance control |
| FR-5 | `/privacy` — approved text at the same URL; Legal's Cookies section verbatim; three engineering contact facts retained |
| FR-6 | Footer links five destinations |
| FR-7 | One `LegalDocument` contract and renderer, extended to carry Legal's own structure |
| FR-8 | `docs/ux-ui/design.md` §2/§4 synced; ADR-014 added; ADR-011 and ADR-013 amended in consequences only |
| FR-9 | Governance decision D-8 recorded with its basis and its disconfirming input named |

## Files changed

~3,567 net code LOC across 28 files — 1,705 of it Legal's prose and the content-contract types. Backend: `registrations/consent-policy.ts` and its specs, the controller's response contract. Frontend: `lib/content/legal/` (contract, three documents, inventory helper), `components/legal/`, three routes, the footer, the consent banner, the registration disclosure. Docs: `docs/ux-ui/design.md`, `docs/trd/trd.md`.

## Test evidence

frontend **116 suites / 1737 tests** · backend **76 suites / 1106 tests** · `tsc --noEmit`, lint and static export clean. No `test-report.md` — `/akili-test` was deliberately skipped; every task demonstrated its own falsifiers by mutating and observing red, and the two independent fidelity audits recomputed the text reconciliations by hand.

## Validation

`validation-report.md` — **three independent T3 validators run in parallel**, each scoped to one dimension and each told not to defer to the Leader's framing. All three returned FAIL. **The product passed; the spec and the ledger did not** — ~20 false statements, none of them in an Implementer's work. All blocking and serious findings remediated; the report's Archive Readiness section is now READY.

## Open, and deliberately not blockers on the code

1. **`/terms` and `/privacy` are not publishable** until CIAT fills the fields outstanding in its own delivered texts (`Insert Date`, `Insert CIAT Legal Entity`, blank contact blocks). A per-document inventory test pins the exact set; an empty list is the publishability signal. Marked in `docs/ux-ui/design.md` §4.
2. **D-10 vs. defect class 8** — the spec promised the two NFR-4 cookie findings would go back to Legal before the text was frozen. They did not, and it is frozen at `v1.0`. `/privacy` publishes four cookie purposes that FR-3 forbids `/cookies` from claiming, and neither document tells a reader which governs.
3. **Contrast ratios were never measured.** A real-browser `axe` run closes it.
4. **Re-verify ADR-014 is free on unmerged branches before merging.** It was allocated from this spec branch, which decides who pays a collision, not whether one exists.

## Historical notes

Fourteen decisions (D-1..D-14) were recorded, six of them mid-flight. Two are edits to Legal's own text, both authorized by the product owner and both recorded precisely so a future reader diffing against Legal's next edition finds the authorization instead of an unexplained difference: **D-12** (a bullet carried as a trailing paragraph, which moves record retention from an object of consent to a statement of understanding) and **D-14** (a `15. ` heading prefix dropped). A third edit of the same class — 12 double-quoted terms converted to curly — was caught in review as **unratified** and reverted. The difference was authorization, not size.

**D-13** widened a public API contract so the consent checkbox's label and the policy text come from one source; hand-copying Legal's sentence into the component would have produced two divergent copies of the words a person legally accepts, with nothing that would ever 400 to reveal the divergence.
