# Archive Summary — General contact form

## 1. Document Control

| Field | Value |
|---|---|
| Original spec path | `docs/specs/contact/contact-channels/` |
| Archived to | `docs/specs/archive/2026-08-31-contact--contact-channels/` |
| Archive date | 2026-08-31 |
| Approval mode | gated |
| Jira | [ATP-42](https://cgiarmel.atlassian.net/browse/ATP-42) |
| Branch | `contact-section` — **not merged, not pushed at archive time** (§9) |
| Kaizen entry | `docs/specs/kaizen/contact--contact-channels.md` |

## 2. Final Status

**Complete. 11 of 11 tasks `[x]`. Validation: PASS — safe to archive.**

The registry has a public `/contact` page whose submissions arrive as one email in the inboxes of every current member of the Cognito `admin` group, with `Reply-To` set to the requester so the conversation continues in ordinary email. **Nothing is persisted** — no inquiry entity, no status lifecycle, no administrative inbox.

## 3. Requirements Delivered

| ID | Delivered |
|---|---|
| FR-1 | Public `/contact` page, reached from the top nav, footer, About, home, and `RestrictedContactPanel` — whose "contact the programme team" instruction had pointed nowhere since it was written |
| FR-2 | Submission accepted and delivered as one message to every resolved recipient; eight fixed categories enforced server-side |
| FR-3 | Recipients resolved **live from the Cognito `admin` group** behind a 60s cache, with a configured fallback. Adding or removing an admin changes who receives contact mail with no redeploy |
| FR-4 | Fixed registry display name in `From`, requester in `Reply-To` (RFC 5322 quoting, RFC 2047 encoding), server-generated subject |
| FR-5 | Send failures surface to the visitor rather than reporting false success |
| FR-6 | Mandatory privacy acknowledgement and a `/privacy` page as its link target |
| FR-7 | Zero database writes, gated by an e2e test over the real `AppModule` |
| FR-8 | Honeypot and per-IP rate limiting (5 / 60s) |
| NFR-1…NFR-8 | PII boundary (release gate), rate limiting, accessibility, design tokens, static export, no analytics, field-level errors, bounded cache |

**Descoped by the owner mid-spec:** the actor-scoped contact channel (**ATP-28**), which returns to the backlog as its own spec and can reuse everything this one built. `proposal.md` §2.1 records why the cut removed disproportionately more risk than cost.

## 4. Files Changed Summary

**59 files, +7,148 / −55**, across 11 commits (`19bffbf` → `fe0c38f`).

| Area | What |
|---|---|
| `backend/src/contact/` | New module: controller, service, DTO, frozen category list, `AdminRecipientResolver` (paginated Cognito read + 60s cache + lazy fallback), `composeReplyTo` utility, e2e suites |
| `backend/src/mail/` | `MailMessage.to` widened to `string \| string[]`, `replyTo` added; `SesMailTransport` sends `ReplyToAddresses` and a display-name `Source` with a double-wrapping guard; one new `MailService` method; one template carrying a mandatory provenance line |
| `backend/src/common/` | `isRegistrationsPath` generalized to `isCappedPath` over `CAPPED_PATH_PREFIXES` |
| `backend/src/test/` | `pii-boundary.spec.ts` extended — the release gate |
| `backend/src/main.ts` | Local-only CORS (`lambda.ts` untouched — see §10) |
| `frontend/` | `/contact` and `/privacy` pages, `ContactForm`, API client, and every entry point; `Header` nav restructured (§10) |
| `infra/` | `cognito-idp:ListUsersInGroup` grant, `CONTACT_FALLBACK_RECIPIENT`, and a developer IAM policy for local real-email testing |
| `docs/` | TRD §4 + §13 (QA-13), ux-ui §2/§4/§5, infrastructure §6 |

## 5. Test Evidence Summary

| Suite | Result |
|---|---|
| Backend | **64 suites / 815 tests** green · `npx eslint --quiet` clean · `npm run build` clean |
| Frontend | **93 suites / 1402 tests** green · `npm run build` clean · `out/contact/index.html` and `out/privacy/index.html` emitted |
| `sam validate` | `10-data-auth` PASS · `30-frontend` PASS · `20-backend` FAIL on pre-existing `W2531` (ATP-60) |

**Three gates were demonstrated red before green** rather than asserted: DC-4 (zero writes), DC-5, and NFR-1's PII boundary — whose red run showed the actual `MessageRejected` leak with the recipient address verbatim in the captured log.

**Verified live against real AWS**, through the project's own compiled code rather than generic CLI calls:

| Link | Result |
|---|---|
| `AdminRecipientResolver.resolve()` against the live `admin` group | Returned the three real administrators **without** touching the fallback |
| `SesMailTransport.send()` with the real template | Accepted by SES; the account send counter moved 0 → 1 |

`/akili-test` was **not** run — see §9.

## 6. Validation Summary

`validation-report.md`, T3 auditor, read-only, fresh context, **not the author**. Verdict **PASS**.

No behavioural defect, no PII leak, and no gate that cannot fail — a failing input was constructed for all eleven defect classes. **All ten findings were documentation**, and all are remediated. Two sat in constitutional baselines (`docs/infrastructure.md` asserting a CloudFront topology that does not exist; `docs/trd/trd.md` describing the endpoint as *"Always 202"*).

One known defect was deliberately withheld from the auditor's brief as a calibration probe. It found that one independently **and** a second instance the Leader had missed, which is why its remaining findings were applied rather than re-litigated.

## 7. Accepted Warnings And Follow-Ups

| Item | Where |
|---|---|
| **SES production access.** The account is in sandbox — measured, not inferred (200/day, 1/sec). All three current administrators were verified by hand. A **new** administrator added from the panel is not verified in SES and silently breaks delivery **for all of them** | **ATP-59** |
| **EOL `nodejs20.x` runtime.** The pre-deploy validate gate is red on every run; AWS disables function *updates* on 2027-03-03 | **ATP-60** |
| Dedicated sender address (mail still originates from `j.cadavid@cgiar.org`) | **ATP-58** |
| Actor-scoped contact channel | **ATP-28** |
| NFR-5 — no committed assertion on the emitted static pages; `next build` enforces the property | `validation-report.md` §3 |
| NFR-6 — no analytics by construction; nothing guards a future addition | `validation-report.md` §3 |
| T-11 — Done-when literally unmet; the checkbox rests on a recorded adjudication | `validation-report.md` §4 |
| `/akili-test` not run; *author ≠ tester* was not honoured | `validation-report.md` §8 |
| `getCognitoAdminClient()` demands `COGNITO_CLIENT_ID` for a value `ListUsersInGroup` never uses; a deployment missing it routes all contact mail to the fallback, silently | `execution.md` — auth module |

## 8. Historical Notes

**This spec cost far more than the feature warranted, and the record should say so.** Four rounds of adversarial review ran on the *design document* before a line of code existed; rounds 2–4 largely repaired defects introduced by round 1's repairs. The round-4 escalation's root cause was **fire-and-forget dispatch — a mechanism this spec had introduced itself**, to close a timing oracle on an endpoint the owner had already cut. Removing it dissolved seven findings at once and made the design shorter.

Three tasks (T-2, T-3, T-5) were reopened *after* passing, each because a Leader decision amended the design underneath them. The Implementer→Reviewer loop was efficient by comparison: most tasks passed first time.

**Every specification defect was found by someone other than its author.** The Leader wrote these documents and found none of the eight defects the execution loop surfaced, nor the ten the validation surfaced. That is the strongest evidence in this spec for *author ≠ auditor*, and it is why `/akili-validate` was delegated rather than self-performed.

Two findings deserve to survive archiving:

- **DC-9's manual gate earned its keep.** It was the one clause no automated check could reach. It **failed** — and revealed that the header had been overflowing at *every* width ≥768 since before this spec, a pre-existing defect nobody had noticed. Four review rounds had reasoned about that bar from CSS class inspection and produced a number wrong by 46px, missing the `max-w-7xl` ceiling that determined the fix. One browser measurement replaced all of it.
- **T-11 shipped without a Reviewer by deliberate decision, and that is exactly where the worst validation finding landed** — a false deployment topology in a constitutional baseline. Risk had been assessed by diff size rather than blast radius.

Both are carried into `docs/specs/kaizen/contact--contact-channels.md` as lessons, alongside three recurrences (KZ-004, KZ-008, KZ-005) whose already-`Applied` standardizations did not prevent them.

## 9. State At Archive — Not Yet Merged

At archive time the work is **11 commits on `contact-section`, unpushed, with no pull request, unmerged, and undeployed.** Archiving freezes the *spec record*; it does not ship the feature. The remaining sequence is push → PR → review → merge → deploy, and the deploy step needs credentials the owner did not have during this cycle.

## 10. Decisions A Future Reader Should Not Re-Litigate

| Decision | Why |
|---|---|
| One message to many recipients, **not** one per recipient | Keeps the shared `To:` header so administrators see who else received an inquiry and can coordinate; avoids N sequential sends at the sandbox's 1/sec. The all-or-nothing failure is **loud**, which is correct while the cause is a missing verification. Fan-out would hide an unverified admin. See ATP-59 |
| `From` is the registry, never the requester | SES sends only from verified identities; SPF/DKIM/DMARC would treat a requester `From` as spoofing. `Reply-To` delivers the intended behaviour without it |
| Subject is fixed and carries no requester text | Free text in a header permits header injection. The visitor's own subject renders in the body |
| CORS in `main.ts` only, never `lambda.ts` | API Gateway owns CORS in the deployed stack (`20-backend`'s `CorsConfiguration`, locked to the CloudFront origin). The API is **not** same-origin — an earlier claim in `docs/infrastructure.md` said otherwise and was corrected at validation |
| No `Home` nav entry, no brand descriptor | The brand lockup is the home link; the descriptor cost ~196px of a permanently-capped 1216px row |
