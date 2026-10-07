# Judgment Day — design.md (consent-request-email)

| Field | Value |
|---|---|
| Target | `design.md` (draft), judged against `requirements.md` and `proposal.md` |
| Commit | `342390a` |
| Mode | judgment_day: two blind read-only judges, run in parallel |
| Judges | A on `sonnet`, B on `fable`. The author was `opus` (author ≠ auditor). |
| Round | 2 (final fix round applied) |
| State | **APPROVED** (terminal, 2026-10-05) |

## Frozen ledger (round 1)

### Confirmed by both judges, both SEVERE (auto-fix eligible)

| ID | Judges | Finding | Evidence (as run) |
|---|---|---|---|
| C-1 | A-1, B-9 | The §11 count line says 26 premises / 22 verified. The table has 27 rows / 23 verified. | `grep -oE '^\| P-[0-9]+' design.md \| sort -u \| wc -l` → 27 |
| C-2 | A-2, B-6 | §5.2's worst case (10 s + 3 s ≈ 13 s) breaches NFR-6's "never exceeds 12 s". It also omits `MAIL_LOCK_WAIT_TIMEOUT_MS` (200 ms), which `mail-timing.ts` declares **additive**. | `backend/src/mail/mail-timing.ts` `MAIL_LOCK_WAIT_TIMEOUT_MS` docblock; `requirements.md` NFR-6 |
| C-3 | A-3, B-8 | P-16 is **contradicted**, not open. `ActorForm.buildDto` always sends `consentMethod` (edit included), and `AdminActorUpdateDto` is `PartialType(AdminActorCreateDto)`. Under DD-9, every PATCH on an `EMAIL_LINK` actor would therefore `400`. Its impact is High, not Low. | `frontend/components/admin/ActorForm.tsx` `buildDto`; `consent-provenance.policy.ts` docblock ("ActorForm … **always** does"); `dto/admin-actor-update.dto.ts` |

### Reported by both judges, severity split (A SEVERE / B WARNING or SUGGESTION)

| ID | Judges | Finding |
|---|---|---|
| S-1 | A-4, B-17 | There is no ledger row or mechanism for `ActorAuditLog.traderId` being NOT NULL. Consent audit rows (dispatch, respond, document confirm) need a `traderId`, but `ConsentRequest` and `ConsentDocument` snapshot `traderName` only. A deleted-actor race on document confirm has no defined behaviour. |
| S-2 | A-5, B-22 | There is no row stating that `ConsentRequestsModule` relies on `RegistrationsModule`'s single global `ThrottlerModule.forRoot` (the `ContactModule` pattern), and must not register it again. |
| S-3 | A-6, B-12 | The DD-9 consumer walk misses the hand-coded frontend lists. `ActorsTable.consentMethodLabel` is a non-total `switch` with default "Not recorded", so an `EMAIL_LINK` actor would silently show "Not recorded". `ActorsTable.test.tsx` pins a literal list of 5 values. `ActorForm` `CONSENT_METHOD_OPTIONS`, `actors/page.tsx` filter options and `AcknowledgeDialog` options also hand-code the list. |

### Single-judge SEVERE (suspect — not auto-fixed)

| ID | Judge | Finding | Leader settlement |
|---|---|---|---|
| B-1 | B | `toPublicDetail` gates `gps` on `GRANTED` (`publicGps` → `isPublic`). The consent preview of an `UNKNOWN` actor would therefore omit coordinates that **will** be published after accept. P-13 omits the gate. **Judges contradicted:** A said the projection has no consent gating. | **Re-run by the Leader:** `pii-consent.policy.ts` `publicGps` → `if (!isPublic(actor)) return null`; `isPublic` = `consentStatus === GRANTED`. **B is right, A is wrong.** P-13 is contradicted in part. |
| B-2 | B | Dispatch step 5 writes `SENT` without a compare-and-set on `SENDING`. A row superseded while it was being sent comes back as live `SENT`, which bypasses D-20 and FR-12. | Not re-run (design logic). Reading §5.2 and §5.5 together confirms the gap. |
| B-3 | B | `FAILED` is outside the supersession set, and Retry re-queues without re-checking eligibility. A withdrawn or deleted actor could therefore receive a live link. | As B-2 |
| B-4 | B | The "open request" blocking set excludes `QUEUED`, `SENDING` and `FAILED`, so two enqueues before dispatch duplicate emails and tokens. | As B-2 |
| B-5 | B | §5.4 says "DTO validation first". Any token-shape rule in the DTO would make a **malformed** token `400` while an unknown one `404`s, breaking FR-11 and NFR-2. | As B-2 |
| B-7 | B | FR-13's "AND IT MUST be shown by a test asserting the columns are written only by …" has no design mechanism. | `grep -n -i "written only\|immutab" design.md` → 0 |

### WARNING / SUGGESTION (info)

- A-7 / B-19: P-14 is settleable now and **confirmed**. serverless-http sets `req.ip` as an own property from `requestContext.http.sourceIp` (`lib/request.js`, `lib/provider/aws/create-request.js`).
- A-8: DD-13 attributes the "only public path" sentence to ADR-013. It lives in TRD §4's `GET /actors/:id` row.
- A-9: `email-layout.ts` `link()` prints the href as visible text, so the token appears in the email body. This amplifies R-2 but opens no new channel.
- A-10: the CAS via `updateMany().count` and `createMany` inside `$transaction` have production precedent but no ledger rows.
- B-10: dependency-injection topology. `ActorsModule` exports nothing, and the `adminList` where-clause is inline, not a function. `ActorsAdminService` calling into `ConsentRequestsModule` risks a provider cycle.
- B-11: the §6 "segment count differs" justification is false (`:id/history`). Routing still works.
- B-13: FR-3's "MUST NOT appear when GRANTED" has no stated gate on `SendConsentPrompt`.
- B-14: FR-1's "no 'signing'/'signature'" assertion is not named in §7.2.
- B-15: Retry `{ batchId }` vs `{ batchId? }`; `SENDING` is missing from FR-13's status list and the label map.
- B-16: supersession would overwrite derived-`EXPIRED` `SENT` rows.
- B-18: there is no row for the absent CloudFront CSP that the direct browser→S3 POST depends on.
- B-20: the P-19 `localstack` grep returns 1 hit (design.md itself), not 0.
- B-21: on a versioned bucket, the lifecycle should also expire delete markers.

## Premise Ledger verdicts (merged)

| Verdict | Rows |
|---|---|
| Confirmed by both judges | P-1–P-8, P-10–P-12, P-15 (incomplete — S-3), P-17, P-19–P-26 |
| **Contradicted** | **P-13** (B-1, settled by the Leader), **P-16** (C-3) |
| Settled → confirmed | P-14 (A-7, B-19) |
| Not re-run (external) | P-9 (live broker), P-18 (A could not reach the `.docx`; B re-ran the hash, confirmed), P-27 (moot under DD-5) |
| Missing rows | `ActorAuditLog.traderId` NOT NULL (S-1); global `ThrottlerModule` (S-2); absent CSP (B-18); CAS / `createMany` precedent (A-10); DI topology (B-10) |

## Round 1 correction (user-approved: "Fix all and Re-judge")

Every finding above was applied to `design.md` and `requirements.md`. That covers the confirmed, split-severity and single-judge items plus the warnings.

## Scoped re-judgment 1

| Judge | Result |
|---|---|
| A | All 23 scoped items RESOLVED. No fix-caused defects. It also confirmed the `@IsIn` override semantics in `@nestjs/mapped-types` and `class-validator`, and the S3 lifecycle constraint. |
| B | All items RESOLVED, but the fixes caused new findings: |

| ID | Severity | Finding | Round-2 fix |
|---|---|---|---|
| RB-2 | **SEVERE** (single judge; the Leader traced it in `ActorsAdminService.update` and `isConsentProvenanceSatisfied`) | The C-3 update rule ("refuse a change to `EMAIL_LINK`") lets an admin re-grant an `EMAIL_LINK` → `DENIED` actor while keeping `EMAIL_LINK`. That is admin-asserted consent labelled as the actor's act. `bulkSetConsent`'s preserve branch has the same hole. | `update` refuses any transition into `GRANTED` whose effective method is `EMAIL_LINK`. Bulk unlock treats a stored `EMAIL_LINK` as a missing method. The form swaps the read-only field back to the assertable select on a status change. FR-10 gains the clause, and the defect-class gate gains the test. |
| RB-1 | WARNING | §5.4 still called P-14 `UNVERIFIED`. | Rewritten as confirmed. |
| RB-3 | WARNING | The second lifecycle rule would fail CloudFormation, and S3 already auto-cleans markers when `Days` is set. §7.4 was not updated. | One rule, with `AbortIncompleteMultipartUpload` added; §5.6 and §7.4 aligned. |
| RB-4 | WARNING | 11.7 s omitted the pre-send DB steps, and the budget-check position was ambiguous. | Budget 7.5 s, checked before the claim. Worst case 7.5 + 0.3 + 3.2 + 0.5 = 11.5 s. DD-1 updated to match. |
| RB-5 | WARNING | The §5.8 sweep's method list omitted the owner of the stale-claim and claim-time writes; `enqueue` had a second supersede implementation. | `dispatch` owns those writes, and `enqueue` calls `supersedePendingFor`. The list is now four methods. |
| RB-6 | WARNING | Preview equality needs `CROPS_INCLUDE`. | Stated in §5.4. |

## Scoped re-judgment 2 (final)

| Judge | RB-1…RB-6 | Fix-caused SEVERE |
|---|---|---|
| A (`sonnet`) | All RESOLVED | None |
| B (`fable`) | All RESOLVED | None |

**Residual WARNINGs (info, not auto-fixed).** Both judges independently reported the first item.

| ID | Finding |
|---|---|
| FB-2 (also A §2) | On an actor already `GRANTED` + `EMAIL_LINK`, with the status unchanged, an admin can still overwrite `consentObtainedAt` / `consentReference`, or relabel the method. Neither §5.7 rule matches. This predates round 2. |
| FB-1 | The bulk "treat `EMAIL_LINK` as missing" rule is not scoped by status. An already-`GRANTED` + `EMAIL_LINK` row inside a bulk unlock gets relabelled. |
| FB-3 | FR-10's "leave an actor `GRANTED` with `EMAIL_LINK`" contradicts the intentional unchanged re-send; it should read "move into … or write". |
| FB-4 | §5.7's form-swap prose ("moves away from the stored `GRANTED`") vs the table ("a status change"). |
| FB-5 | DD-9 and §4.3 state only the first update rule. |
| FB-6 | `ConsentRequestsModule` also imports `ConsentSupersessionModule`; this is not stated. |
| FB-7 | The RB-3 justification sentence is doubtful: a marker-only rule is valid. The one-rule decision stands. |
| FB-8 | NFR-6's measure (budget + one send bound) is below the design's 11.5 s worst case. |
| (B, out of scope) | FR-13 names "send, dispatch, respond and supersede"; §5.8's owners are dispatch, retry, supersedePendingFor and respond. |

JUDGMENT: APPROVED ✅. Two fix rounds were used, and no SEVERE finding remains. The residual WARNINGs are offered to the user as a Phase-2 Adjust, outside the judgment lineage.

**Disposition of the residual WARNINGs (Phase-2 Adjust, 2026-10-05).** The product owner chose "Adjust, then Continue" with link evidence read-only. FB-1…FB-8 and the FR-13 wording were applied to `design.md` §3, §4.3, §5.6, §5.7 and DD-9, and to `requirements.md` FR-10, FR-13, NFR-6 and the defect-class table. This is outside the judgment lineage, which stays APPROVED.
