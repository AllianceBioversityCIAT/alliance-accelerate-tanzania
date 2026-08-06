# Archive Summary — Public Self-Registration (chunk 3a)

## Document Control
| | |
|---|---|
| Original spec path | `docs/specs/actors/public-self-registration/` |
| Archive date | 2026-08-06 |
| Final status | **Complete — 23 of 23 tasks `[x]`** |
| Execution | `/akili-execute`, Leader → Implementer → Reviewer |

## Final Status
23/23 tasks closed with a Reviewer `PASS` recorded in `execution.md` before each checkbox. **11 rework rounds**, ~50 Reviewer lens reports, one HALT at the 3-attempt ceiling (T-7) resolved by a user-authorised bounded fourth attempt.

**Verification at close:** backend **57 suites / 675 tests**; frontend **85 suites / 1151 tests, 23 static pages**; lint and build clean in both. Measured by the Leader in a quiet window, not taken from worker reports.

## Requirements Delivered
FR-1…FR-8, FR-14, FR-15 across 25 scenarios, per `tasks.md`'s Coverage Closure table. Four public endpoints (`consent-policy`, `verify`, `registrations`, `lookup`), three public screens (`/register`, `/register/submitted`, `/register/status`), and the extended `pii-boundary.spec.ts` release gate.

**Three FR-* scenarios straddle the 3a/3b boundary** and are explicitly split in the Coverage table rather than discharged: FR-3's review display, FR-4's publication, FR-14's adjudication rollback.

## Files Changed Summary
- **Backend:** `registrations/**` (controller, service, DTOs, serializer, OTP, reference allocator, throttle guard, `429` filter), `mail/**`, `logging/**`, `common/payload-cap.config.ts`, both entrypoints, `test/pii-boundary.spec.ts`.
- **Prisma:** **six** new schema objects — `RegistrationStatus`, `Registration`, `EmailVerification`, `EmailSendBudget`, `RegistrationSequence`, `RegistrationLookupAttempt` — across **four** additive migrations, each Leader-verified from disk as a single `CREATE TABLE` with no `DROP`/`MODIFY`/`ALTER`/`UPDATE`.
- **Frontend:** `components/register/**`, `app/(public)/register/**` (three routes), `lib/api/registrations.ts`, `lib/content/roles.ts`, `components/shell/Header.tsx`, `components/home/LandingCTA.tsx`.
- **Docs:** PRD §5/§6/§7, TRD §2/§3.1/§4/§8/§12.5/§13, `docs/ux-ui/design.md` §2/§4/§5.

## Test Evidence Summary
**No separate `test-report.md` — `/akili-test` was not run as a phase, and this is recorded rather than implied.** Evidence lives in `execution.md`: every task carries a Reviewer verdict, and the Disqualifying clauses were the operative gates. The strongest artefacts:
- **T-13's release gate** — route set derived from `@Module` metadata, a **bidirectional** total fixture map, and a throwaway-route proof re-run against the shipped code (both the same-controller and the second-controller probes, recorded verbatim).
- **T-7's V-1…V-6**, including V-1a's counter surviving a rejection, proven structurally rather than by a mock.
- **T-22's a11y suites** over genuinely composed pages, with contrast, focus order and focus visibility recorded as **not** provable under jsdom and routed to the DC-16 human check.

## Validation Summary
**No `validation-report.md` — `/akili-validate` was not run.** Accepted at archive, with the reason stated: every task passed an independent Reviewer against its Disqualifying clause, and the release gate is itself a validation artefact. **A reader should treat that as weaker than a validation pass, not equivalent.**

## Accepted Warnings and Follow-Ups
| ID | Item | Status |
|---|---|---|
| **T3-A1** | `MAIL_TRANSPORT`, `MAIL_SENDER_ADDRESS`, `OTP_HMAC_SECRET` appear in **no SAM template**, and `infra/20-backend/template.yaml` has no `ses:SendEmail` policy. **`getOtpHmacSecret()` throws inside `hashCode`, so `POST /verify` returns `500` in a deployed environment.** No task in T-1…T-23 owns that file. | **OPEN — blocks a functional deploy** |
| **T11-A1** | `RegistrationLookupAttempt.ip` stores a plaintext IP (personal data). Remedy costed: an HMAC is a **value transform, not a schema change**, and domain separation (`HMAC(OTP_HMAC_SECRET, "lookup-ip:" + ip)`) avoids a fourth secret. | Open, user decision |
| — | **Four tables hold personal data with no retention policy** (`Registration.submitterEmail`, `EmailVerification.email`, `EmailSendBudget.email`, `RegistrationLookupAttempt.ip`); pruning full-scans on three of them. §6.4's accepted risk, now materially larger. | Accepted, recorded |
| — | `(admin)/admin/actors/**` test flake, **measured**: 32/32 green in 2.3 s isolated vs 29.3 s under full load — a 13× slowdown; CPU starvation, not logic. Belongs to a feature this spec does not own. | Follow-up spec recommended as **blocking** for the next frontend-heavy chunk |
| **T23-A1** | `requirements.md` §10 still says *"Three new schema objects"* against the six built. | Spec-side staleness, recorded |
| — | Lingering `@nestjs/throttler` timers force-exit a Jest worker on full backend runs. | Pre-existing, carried |

## Historical Notes
**What the review layer caught that no gate would have** — each would have shipped with a green suite:
- **T-6:** `POST /API/V1/REGISTRATIONS` bypassed the payload cap entirely, because the matcher was case-sensitive and Express's router is not. The spec named two traps on this matcher; **the case axis appears in no document.**
- **T-7:** the send cap was check-then-act; its first replacement released a MySQL advisory lock **before** `COMMIT`, so the race survived.
- **T-8:** an interpolated `err.message` would have written the applicant's address to CloudWatch on the SES error that, under this repo's documented sandbox config, **is the expected one**.
- **T-8:** T-5's throttler silently `429`'d six requests **inside T-8's own evidence**, because the timing helpers asserted no status.
- **T-11 — the sharpest.** L-1 and L-4 were each implemented correctly and the **set** was broken: the L-4 reset was keyed on the caller, not the reference, so an attacker holding any valid pair (obtainable by self-registering — this module's own purpose) zeroed their counter every ninth guess. 10/hour became ~1,080/hour. **No test could have found it; there was no defect in any single constraint.**

**Four Leader errors are recorded as such**, not smoothed over: a scope guard that created the gap it was meant to prevent (L-ERR-2); a flake signature mis-stated three times (L-ERR-3); a remediation instruction whose **both halves** would have silently disabled the send cap (L-ERR-4); and a task count over-reported for two waves. **Three of the four were caught by an Implementer declining to let an instruction pass unexamined — none by a gate.**

**A recurring documentary defect, three times:** a constraints-not-mechanism section answered with a new schema object, migration updated, `design.md` §2 not — **the C-10 disclosure failure `A-4` names, recurring inside the spec that names it.** Corrected each time as a separate Leader action, only ever prompted by a Reviewer.
