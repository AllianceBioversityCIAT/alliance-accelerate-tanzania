# Validation Report — General contact form

- Spec path: `docs/specs/contact/contact-channels/`
- Date: 2026-08-31
- Tier: T3 Auditor — an independent read-only agent, fresh context, **not the author** of the documents or the code
- Jira: [ATP-42](https://cgiarmel.atlassian.net/browse/ATP-42)

## 1. Recommendation

**PASS — safe to archive with `/akili-archive contact/contact-channels`.**

No behavioural defect, no PII leak, and no gate that cannot fail. Every finding raised was **documentation**, and every one has been remediated (§5). Two open items are `WARN`, both accurately described in the documents rather than papered over, and neither blocks archiving.

## 2. How this validation was run, and its one deviation

The audit was performed by a T3 agent with read-only tools, given the spec and told the code is the truth and every document is a claim about it. **Author ≠ auditor** was honoured: the agent had no part in writing the spec or the implementation.

One known documentation defect — the phantom `DD-6` — was **deliberately withheld** from the brief as a calibration probe. The auditor found it independently, *and* found a second instance in a document the Leader had not checked. Its remaining findings were therefore applied rather than re-litigated.

**Deviation from the command, recorded rather than hidden:** this report was assembled by the Leader from the auditor's structured findings, after remediation. The audit itself was independent; this write-up is not. A reader wanting the unmediated audit should read `execution.md`'s `/akili-validate` section, which records the findings as received.

## 3. Requirement conformance

| ID | Result | Evidence |
|---|---|---|
| FR-1 | **PASS** | `Header.test.tsx` "Contact entry" block (1 occurrence collapsed, exactly 2 with drawer open, href pinned); `contact-a11y.test.tsx`; `Footer.test.tsx`; `about-a11y.test.tsx`; `ClosingCTA.test.tsx`. Page under `app/(public)/contact/`, no role gate |
| FR-2 | **PASS** | `contact.e2e.spec.ts` "delivers ONE message addressed to every resolved admin recipient" (deep equality + `toHaveBeenCalledTimes(1)`); missing / over-long / empty-string suites; `CONTACT_CATEGORIES` + `@IsIn` + off-list `400`; `ContactForm.test.tsx` "offers exactly the eight fixed categories" |
| FR-3 | **PASS** | `admin-recipient.resolver.spec.ts` — `NextToken` pagination exhausted, `staff` never queried, both fallback sub-cases, `logDegradation` asserted address-free. **Additionally proven live**: the compiled resolver returned the three real administrators from Cognito without touching the fallback |
| FR-4 | **PASS**¹ | `reply-to.util.spec.ts` (one case per quoting trigger, 200-char non-ASCII split, explicit *does-not*-fall-back case); `contact.template.spec.ts`; `ses-mail.transport.spec.ts`. **Additionally proven live**: SES accepted a real send composed by `SesMailTransport` |
| FR-5 | **PASS** | e2e `502` no-leak; `ContactForm.test.tsx` renders `SUBMIT_FAILURE_MESSAGE` for `400`-with-empty-`details`, `502` and network rejection, with `queryByText(/502/)` asserted absent; values-preserved test |
| FR-6 | **PASS** | `@Equals(true)`; e2e `privacyAcknowledged:false` → `400` with `details[].field`; `/privacy` route exists with its own test; `contact-no-writes.e2e.spec.ts` |
| FR-7 | **PASS**² | `contact-no-writes.e2e.spec.ts` — real `AppModule`, delegate-shaped mock, four paths, **demonstrated red before green** |
| FR-8 | **PASS** | e2e honeypot ×3 (filled / 10 KB / empty string) + throttle test asserting dispatch count 1…5 then 5 |
| NFR-1 | **PASS** | `pii-boundary.spec.ts` T-8 block — `Logger.prototype` spy over `log`/`warn`/`error`, sweeps fixture **values** not key names, anti-vacuity guard asserts the spy captured ≥1 call, **demonstrated red** with the recipient address visible in captured log text |
| NFR-2 | **PASS** | `@Throttle({default:{limit:5,ttl:60_000}})` verified against the installed throttler version; `CAPPED_PATH_PREFIXES` + `413` assertion. *The requirement text itself was wrong and is corrected — see F-4* |
| NFR-3 | **PASS** | `jest-axe` over `/contact`, `/privacy` and `ContactForm` (clean and error-visible states); focus-move test. Structural only, as DC-7 states |
| NFR-4 | **PASS** | No hex, `rgb(`, `bg-[` or `text-[` anywhere in the new components; re-verified during audit |
| NFR-5 | **WARN** | Property holds and `next build` enforces it under `output: 'export'`; both routes emitted. **No committed assertion exists** on `out/contact/index.html` / `out/privacy/index.html`. The requirement previously *claimed* one — corrected to describe the real mechanism rather than inventing a gate at validation time |
| NFR-6 | **WARN** | Holds by construction — no analytics call exists in `frontend/components/contact/`, re-verified. **Nothing guards a future addition**; `tasks.md` previously overclaimed an assertion here and now states the gap |
| NFR-7 | **PASS** | e2e `details[].field` assertions; `extractFieldErrors` partition |
| NFR-8 | **PASS** | Cache tests discriminate at a 1 ms boundary — `now+59_000` → 1 call, `now+60_001` → 2 |

¹ FR-4's clause *"MUST keep the existing registration OTP and receipt messages working unchanged"* holds for content, recipients and delivery, but `From` **does** change for those messages — authorized by DD-5, anticipated by R-1, and flagged to the owner in T-1. Not a defect; recorded so the clause is not read literally.
² With the two narrowings `execution.md` already states: `AdminRecipientResolver` is stubbed, and the validation-failure path has no gate over `ContactService` because `@IsIn` rejects upstream.

## 4. Defect-class and task conformance

**DC-1…DC-11: all PASS.** A failing input was constructed for every class. DC-1, DC-4 and DC-5 were **observed red**. DC-9 has no automated gate by design — it was captured by the owner, **failed**, was returned to the owner as a placement question per T-10's own instruction, fixed, and re-measured (41px slack at 1024, 201px at 1280+). DC-8 is accepted risk, named in `design.md` §7.2 and tracked as ATP-59.

**T-1…T-10: PASS.** Each `[x]` is backed by falsifiable evidence in `execution.md`, including three tasks reopened after passing and re-verified.

**T-11: WARN.** Its Done-when says *"SAM validate passes"*; `20-backend` exits non-zero on `W2531` (EOL `nodejs20.x` runtime). The same template at `12b52ef^` lints identically — T-11 introduced nothing — so the checkbox rests on a recorded adjudication rather than the literal clause. Visible and honest. Tracked as **ATP-60**.

## 5. Findings and remediation

All ten were documentation. All are remediated in `6ac690b`.

| # | Finding | Severity | Status |
|---|---|---|---|
| F-1 | `docs/infrastructure.md` §6 asserted CloudFront proxies `/api`, making the deployed API same-origin. False — one S3 origin, no `/api` behaviour; API Gateway owns CORS. Contradicted §3 and §4 of its own document | **FAIL** (constitutional baseline) | Corrected |
| F-2 | `docs/trd/trd.md` §4 said *"Always `202`, empty body"*; shipped contract is `202`/`400`/`413`/`429`/`502`/`500` | **FAIL** (constitutional baseline) | Corrected |
| F-3 | Phantom `DD-6` in `requirements.md` §7 and `proposal.md` §5, **inverting** the accepted risk | FAIL | Corrected |
| F-4 | `requirements.md` NFR-2 still demanded stripping in *"every submitted field"*; Decision B exempted `message` | FAIL | Corrected |
| F-5 | `design.md` §5.2, OQ-2, OD-3 and a `Header.tsx` comment described the pre-DC-9 bar | WARN | Corrected |
| F-6 | NFR-5 claimed a build assertion that does not exist | WARN | Reworded to reality |
| F-7 | `tasks.md` claimed T-9 asserts analytics absence; it does not | WARN | Reworded |
| F-8 | `docs/ux-ui/design.md` carried pre-CTA-margin DC-9 figures against `execution.md`'s final ones — one measurement, two published numbers (KZ-005) | WARN | Aligned |
| F-9 | QA-13 described a spy over `MailService.dispatch` lines that never run | WARN | Reworded |
| F-10 | Dangling `§3.2`/`§1.1` refs; stale docblocks ("folding", `ReplyToAddresses`-as-header); `classifySubmitError` and `handleSuccess` named in `ContactForm.tsx` but non-existent | WARN | Corrected |

**Deliberately not changed:** `judgment.md` (frozen record — its citations were accurate against the revisions then under review); `§3.1` references belonging to other specs; `execution.md`'s historical rows.

## 6. Verification at validation time

Backend `npx eslint "{src,test}/**/*.ts" --quiet` clean · **64 suites / 815 tests**. Frontend lint 3 pre-existing `no-img-element` warnings in admin test files · **93 suites / 1402 tests** · `npm run build` clean · `out/contact/index.html` and `out/privacy/index.html` emitted. `sam validate` — `10-data-auth` PASS, `30-frontend` PASS, `20-backend` FAIL on the pre-existing `W2531`.

> One backend run failed a single test before two green runs. **Its identity was not captured** and it did not reproduce. Consistent with the `registrations` 429-isolation flake already recorded in this spec, but **not verified as such** — recorded as an unidentified non-reproducing failure rather than assigned to a convenient known cause.

## 7. Carried forward — none blocks archiving

| Item | Where |
|---|---|
| SES production access; a new admin silently breaks delivery for all | **ATP-59** |
| EOL `nodejs20.x` runtime; the pre-deploy gate is red for every task | **ATP-60** |
| Dedicated sender address | **ATP-58** |
| `getCognitoAdminClient()` demands `COGNITO_CLIENT_ID` for a value `ListUsersInGroup` never uses; a deployment missing it routes all contact mail to the fallback, silently | `execution.md` — belongs to the auth module |
| `/akili-test` not run; tests were authored during execution by the Implementers, so **author ≠ tester was not honoured** | §8 below |

## 8. Accepted gap — `/akili-test` was not run

Test authoring happened inside `/akili-execute`: T-7 and T-8 were wholly test tasks, and T-9/T-10 carried their own. Every diff was audited by a Reviewer on a **different model** than the Implementer, so author ≠ reviewer held throughout. **Author ≠ tester did not** — the agent that wrote a unit generally wrote its tests.

What a separate `/akili-test` pass would add is tests written from `requirements.md` by someone who has not read the implementation, which catches clauses an author's tests were unconsciously shaped around. Its expected yield here is low: this validation already traced every FR/NFR to evidence at clause granularity, constructed a failing input for all eleven defect classes, and confirmed three gates red. The requirement-to-test matrix that `test-report.md` would carry is §3 of this document.

**Recorded as an accepted gap, not as coverage.** If the owner wants that assurance, the high-value scope is narrow: a Tester writing from `requirements.md` alone, forbidden from reading `backend/src/contact/` and `frontend/components/contact/`.
