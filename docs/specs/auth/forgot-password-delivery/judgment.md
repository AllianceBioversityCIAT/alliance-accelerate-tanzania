# Judgment Day — `design.md`

| Field | Value |
|---|---|
| Target | `docs/specs/auth/forgot-password-delivery/design.md` (immutable at judgment time) |
| Mode | Blind dual review, two judges in parallel, neither seeing the other |
| Round | 1 |
| Date | 2026-09-22 |
| Judges | Two independent `opus` contexts, adversarially framed, both told the author is a suspect source |
| ⚠️ Deviation | The skill prefers judges on a model **different** from the author. Both judges and the author ran on `opus` — the registry's T3 Auditor and T1 Architect both map there, and dropping a judge to a lower tier would have weakened the read more than the shared model weakens independence. Independence here is structural (separate contexts, adversarial brief, no sight of each other), not model-diverse. **Recorded as a known weakening.** |

## Verdict

**JUDGMENT: ESCALATED ⚠️**

Not because the judges contradict each other — they agree, closely and independently. Escalated because **the confirmed findings are not patchable**: the design's load-bearing decision is not implementable as written, and several severe findings are consequences of the chosen route rather than of how it was described.

---

## Confirmed by BOTH judges (fix-eligible under the skill's rule)

| # | Finding | Judge A | Judge B |
|---|---|---|---|
| **C-1** | **DD-3 and DD-2 are mutually exclusive.** The awaited RPC reply requires an `id` + `reply_to` on the envelope; `buildMicroserviceEnvelope` — the artifact DD-2 mandates reusing — emits no `id` **by contract**, and its docblock plus `enhancement/email-notification-microservice` FR-2 both record that omission as deliberate. FR-4 and NFR-2 both rest on DD-3. | F1 SEVERE | F2 SEVERE |
| **C-2** | **"The frontend reset flow has no branch on user-not-found" is FALSE.** `frontend/lib/auth/auth-client.ts:251` is exactly that branch, under a comment reading *"Do not reveal non-existence on the request path (NFR-4)"*. Asserted twice, both times marked *verified*. DD-4's safety argument and §9's "no component changes" both rest on it. | F2 SEVERE | F1 SEVERE |
| **C-3** | **DD-4 does not deliver FR-4.** With `PreventUserExistenceErrors: ENABLED`, an unknown address gets a **simulated success**; a real address whose send fails gets an **error**. Opposite outcomes — different copy, different step, different ARIA region. And DD-3 opens a **multi-second timing oracle** (KMS + AMQP + a per-message CLARISA HTTP call + SMTP) that the repo's own `mail-timing.ts` response-floor machinery exists to close and **cannot** close here, because Cognito owns the response. | F3 SEVERE | F4 SEVERE |
| **C-4** | **The failure signal DD-3 depends on does not exist in the described form.** `mailer.service.ts:84-95` **catches** every SMTP failure and *resolves* with `{description:'Error sending email', status:500}`. Over RMQ that is an ordinary successful reply. Only invalid-recipient and auth rejection actually throw. An implementer awaiting the reply and treating non-rejection as success ships D-6 verbatim — the defect DD-3 exists to prevent. | W2 | F3 SEVERE |
| **C-5** | **FR-5's central clause has no mechanism, and the rollback does not restore prior behaviour.** CloudFormation composes `UpdateUserPool` from the *template*, not the live pool, so every live setting absent from `10-data-auth/template.yaml` resets. The design identifies one divergence (`EmailConfiguration`) and treats it as the side effect. Rollback lands on `COGNITO_DEFAULT`, **worse** than the pre-spec state. `proposal.md` R-1's throwaway-pool rehearsal is dropped without comment. | F8 SEVERE + W4 | F5 SEVERE |
| **C-6** | **FR-2's raise breaks a shipped admin path.** `users.service.ts::update()` issues `AdminUpdateUserAttributes` against an auto-verified pool, which can emit `CustomEmailSender_VerifyUserAttribute` — the live edge `proposal.md` §2.3 already named. Under DD-6 that raises and the admin's email edit **fails**. The design never enumerates the handled `triggerSource` set. | F5 SEVERE | F7 |
| **C-7** | **Cognito's trigger ceiling and retry are unmentioned, and NFR-6's latency budget is recorded nowhere.** The awaited round trip must fit inside a non-configurable Cognito response timeout, on top of an existing publish-only budget of 3.2 s. On timeout Cognito **retries** — so the failure mode is *duplicate codes plus an error message*, not the clean failure DD-3's table claims. NFR-6 requires the budget in `design.md`; DD-7 points at a file in a **different deployable**. | F6 SEVERE | F8 + F9 |
| **C-8** | **DD-1's chosen stack cannot reach the configuration the function needs.** The broker URL, API key, queue name, sender identity and `PUBLIC_APP_BASE_URL` all live in `20-backend`, which deploys **after** `10-data-auth` and therefore cannot be imported from it. §8's table has no row for any of them. DD-1's own mitigation — *"put anything likely to change where it can be changed without a `10-data-auth` deploy"* — becomes unreachable the moment the function lives there. | F4 SEVERE | F12 |
| **C-9** | **NFR-4's closed grant set grants nobody the right to encrypt.** `lambda:InvokeFunction` is a Lambda resource policy, not a KMS grant — so §8's *"three grants and no more"* leaves Cognito unable to encrypt the code the whole mechanism depends on. Lands squarely in D-4, the defect class `requirements.md` §8 records as having **no automated gate** and a live precedent. | F7 SEVERE | F20 |
| **C-10** | **FR-1's "rather than publish" has no mechanism.** The design detects a bad recipient *at the microservice, after publishing* — which is the D-6 shape with a better error report attached, not the pre-publish guard the scenario demands. | W3 | F11 |
| **C-11** | **`10-data-auth` cannot host a Lambda today.** No `Transform: AWS::Serverless-2016-10-31`, no build step — `deploy.sh` deploys it from source with no `sam build`, in deliberate contrast to the backend. Adding a function with native dependencies is a toolchain change absent from the budget. | W5 | F16 |
| **C-12** | **Budget is unreachable from the design's own text.** Both judges enumerated 11+ deliverables against the stated 7 tasks. Judge A additionally found the parent spec budgets this same phase at **4 tasks / ~230 LOC**, and that §11's "same tripwire" comparison is against a different unit (ATP-71's 2 *per phase* vs this design's 2 *per task*). | S1 | F15 + F17 |
| **C-13** | **NFR-5's literal text is absent.** It requires documentation to state that `DEPLOY_INFRA` **defaults to `false`**. The design says "`DEPLOY_INFRA`-gated" and "`DEPLOY_INFRA=true` build" — what to run, not what NFR-5 requires stated. D-8's only control is that sentence. | W6 | F21 |
| **C-14** | **DD-1's rejection of Options B and C is thinner than the table implies.** The cycle itself is real and verified. But the dismissal of a parameter-passed ARN is unsound: `20-backend` already takes `DataAuthStackName` as exactly such a hand-maintained string, and `deploy.sh` already resolves cross-stack values from stack outputs. The conclusion may still be right; the argument is not the reason. | F4 (part) | F18 |

## Reported by ONE judge — recorded as suspect, NOT auto-fixed

| # | Finding | Judge |
|---|---|---|
| S-1 | `PreventUserExistenceErrors` is a property of **`UpdateUserPoolClient`**, not `UpdateUserPool` — so §7's stated reason for its in-scope-ness ("this spec is already performing the *one* dangerous pool update") is wrong, and there are **two** dangerous full-parameter updates, not one. The app client holds `ExplicitAuthFlows`; resetting those breaks sign-in for everyone. | B (F6) |
| S-2 | §6's Cognito error-propagation claim is presented as verified, but its two evidence rows are both about the **microservice** — neither is the Cognito fact the section turns on. Uncited, against a proposal that set the citation standard. | A (W1) |
| S-3 | The **email body itself has no owner**. Once the trigger is active, `VerificationMessageTemplate`'s 34 lines of branded HTML go inert and the function must author subject and body. No budget line, no reference to the `*.template.ts` convention. FR-1's link clause and FR-3's code shape are properties *of that body*. | A (W7) |
| S-4 | NFR-1's "never in any error payload" has no mechanism. The backend's version is an enforced sanitized-error hierarchy built because *"amqplib errors routinely carry the full connection string"*, gated by QA-13 with a leaking mutation probe. DD-3 introduces a **new** throw path and mandates no equivalent. | B (F13) |
| S-5 | `proposal.md` §14.4's success criterion — correct `trd.md` §12.1's account of the pool's mailer — appears in **neither** `requirements.md` nor `design.md`. The false text is live at `trd.md:288`. | B (F14) |
| S-6 | §10 conflates the blast radius of the *function* with that of the *deploy*: the same build updates `10-data-auth`'s RDS instance, its security group and its secrets. | A (S2) |
| S-7 | FR-4's *"an action they can take"* is unmet under §9's "no component changes" — a thrown trigger error reaches the default branch, yielding *"Something went wrong. Please try again."* to a user for whom retrying is not an action. | B (F19) |

## Contradictions between judges

**None.** Where both looked at the same thing they reached the same conclusion, differing only in severity label (C-4 and C-6). That agreement is the corroboration mechanism, and it held.

## Corrections applied this round

**None.** The skill permits correcting severe findings confirmed by both judges, after asking. This lineage is escalated **before** round one, because the confirmed set is not a list of fixes — see below.

## Why this is escalated rather than corrected

Three of the confirmed findings are not defects *in how the design was written*. They are consequences of the **route** it chose:

- **C-1** — the awaited reply needs machinery the repo deliberately built itself not to have.
- **C-7** — the Cognito trigger ceiling bounds the whole design from outside, and its retry turns the timeout path into duplicate codes.
- **C-8 / C-11** — the trigger must live where the pool lives, and that stack has neither the configuration nor the toolchain the function needs.

Patching the prose leaves all three intact. And they are **specific to Option A** — the route `proposal.md` §12 recommended, over Option B, **on my own reasoning**. That recommendation now looks wrong, and the honest next step is to re-open it rather than to repair a design built on it.
