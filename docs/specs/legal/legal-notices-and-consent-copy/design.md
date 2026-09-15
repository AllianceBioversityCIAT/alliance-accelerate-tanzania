# Design — Legal Notices & Approved Consent Copy

- Spec path: `docs/specs/legal/legal-notices-and-consent-copy/`
- Status: Draft
- Traces requirements: FR-1..FR-9, NFR-1..NFR-5 from this spec's `requirements.md`

---

## 1. Approach Overview

Three separable pieces of work, joined only by the subject matter:

1. **Backend — a data-shape change with no contract change *at T-1*.** `consent-policy.ts` turns its single current edition into an ordered registry of editions and derives its two public constants from it. `RegistrationsController` and `RegistrationsService` are untouched by the refactor; the served response is byte-compatible across it. *(T-9 later widened the response with `acceptanceStatement` — a separate, argued decision, D-13, not a consequence of the refactor.)*
2. **Frontend — one content contract, three pages.** A `LegalDocument` type plus one renderer under `frontend/lib/content/legal/`; three route modules that supply a document and render it. Pure static server components, no new client islands — `ConsentChoiceControl`, the one island involved, **moves** from `/privacy` to `/cookies` unchanged.
3. **Documentation — a truth repair.** Two baseline files assert, in present tense, a state this spec removes.

No Prisma change, no migration, no new endpoint, no AWS resource, no environment variable.

---

## 2. Data Model Changes

**None.** `Registration.consentPolicyVersion` stays `String`. The registry is a code-level structure; the database continues to store only the version pointer.

This is the deliberate boundary of D-1: the database holds *which* edition was accepted, the repository holds *what that edition said*, and neither duplicates the other. The rejected alternative — snapshotting the full consent prose into `Registration.payload` at submission time — is what some jurisdictions ask for, but it writes kilobytes per row to answer a question an append-only registry already answers, and it makes every row's evidence independently corruptible rather than centrally auditable.

---

## 3. API Surface & Contracts

| Endpoint | Change |
|---|---|
| `GET /api/v1/registrations/consent-policy` | **Unchanged by T-1's refactor** — same keys, same types across it. **Widened at T-9 (D-13)** to `{version, sections, acceptanceStatement}`: the acceptance paragraph is the checkbox's label and the frontend cannot import it from the backend, so carrying it on the wire is what stops two divergent copies of the words a person legally accepts. Values also change at T-9 (approved sections, `version: 'v1.0'`). |
| `POST /api/v1/registrations` | **Unchanged.** The consent gate still calls `isKnownConsentPolicyVersion`; only how that function obtains its set changes. |

No endpoint is added to serve a *historical* edition. The registry makes per-version retrieval possible for server-side consumers (a future admin review screen imports the module directly); exposing it over HTTP is not required by any requirement here and is out of scope.

**Contract-preservation is a named gate, not an assumption** — FR-1's third scenario, defect class 4.

---

## 4. Backend Design

### 4.1 The registry shape

`consent-policy.ts` exposes:

- A `ConsentPolicyEdition` interface — `version`, `issuedAt`, and the existing ordered `ConsentPolicySection[]`.
- `CONSENT_POLICY_EDITIONS` — a `readonly` ordered list, **oldest first**, which is the module's single source of truth.
- `CONSENT_POLICY_VERSION` — derived: the final edition's version.
- `KNOWN_CONSENT_POLICY_VERSIONS` — derived: every edition's version, in issuance order.
- A lookup by version, returning an edition or `undefined`.
- `isVersionKnown` and `isKnownConsentPolicyVersion` — **kept exactly as they are.**

### 4.2 What is deliberately preserved

`isVersionKnown(versions, version)` stays parameterized. The module's existing comment explains why at length and the reasoning still holds: with a one-element known set, *"is in the known set"* and *"equals the current version"* agree on every input, so a test written against the wrapper alone cannot distinguish a real set-membership check from a narrower, wrong one. Taking the array as a parameter is what lets a test construct a synthetic multi-entry set and prove set semantics.

The registry **will** make production's set multi-entry once T-9 appends the approved edition — it still carries exactly one today — which **weakens rather than removes** the argument for the seam *(tense corrected 2026-09-15: this originally read "makes … for the first time" in the present tense and was inherited verbatim into a code comment, where it contradicted five correct "exactly ONE edition today" statements in the same file — including the premise the latent-gate note rests on)*: the seam is what makes the property testable independent of how many editions have shipped. Removing it would be a reversion; it is not proposed.

### 4.3 Reversion challenge (Step 2.3)

Two design decisions remove behavior that currently ships. Each was challenged with one question — *what does removing this break?*

| Reversion | What breaks | Resolution |
|---|---|---|
| **`/privacy` stops carrying cookie content and the consent-change control** | (a) `ConsentBanner`'s link target test reddens. (b) **ADR-011's consequences state that city-level geography is something "the `/privacy` notice must state"** — moving it makes an accepted ADR's text false. (c) The originating spec's FR-6 requires the contact-acknowledgement link's target to describe what the contact form collects; if the approved Privacy Policy does not cover that, a delivered requirement silently regresses. | (a) is in scope and owned by T-6. (b) **was not in the original plan and is now FR-8's responsibility** — found by running this challenge, not by the forward file sweep. (c) **resolved (D-9)**: Legal's *"Information We Collect"* covers the collection half; the other three facts — recipient, relayed-not-stored, not-consent-to-publish — are engineering-authored, because they describe this system rather than commit to anything. Asking Legal to author them would be asking the wrong party. |
| **`/privacy` loses its self-limiting scope statement** | Nothing, *provided* the replacement genuinely covers registration and directory data. If it does not, deleting the limitation over-promises to exactly the visitor it protected — which is the reasoning the originating spec recorded when it chose to re-scope rather than delete. | The limitation is removed **only** as part of landing the approved policy (T-8), never as part of the scaffolding task (T-5). Ordering enforces it. |

---

## 5. Frontend Design

### 5.1 The content contract

```
frontend/lib/content/legal/
  types.ts        LegalDocument, LegalSection
  cookies.ts      the Cookie Notice document (authored by engineering — factual inventory)
  terms.ts        Terms of Use (Legal's text, placed verbatim)
  privacy.ts      Privacy Policy (Legal's text, placed verbatim)
```

A `LegalDocument` carries a title, a version, an effective date, an optional lede, and ordered sections; a `LegalSection` carries a heading, paragraphs, and an optional bullet list. That shape is sufficient for Legal's supplied structure — headings, prose, and bulleted enumerations — and deliberately does not model arbitrary rich text. If a delivered text needs something the shape cannot express, the shape is extended once, in one place, rather than each page inventing markup.

`components/legal/LegalDocumentView.tsx` renders it: `h1` + version/date stamp, then `section` elements with `aria-labelledby`, matching the heading hierarchy and token classes the current `/privacy` page already uses.

**Why data and not MDX.** MDX is not configured in this project, and adding a compiler toolchain to render three documents whose structure is headings-paragraphs-bullets buys expressiveness nothing here needs. **Why data and not inline JSX** — the current `/privacy` page is the counter-example: ~100 lines of markup interleaved with prose, where a copy change is a component edit and three such pages would drift apart by construction.

### 5.2 Routes

| Route | Composition |
|---|---|
| `/cookies` | `LegalDocumentView` + the `ConsentChoiceControl` island, placed in a designated slot after the document body |
| `/terms` | `LegalDocumentView` only |
| `/privacy` | `LegalDocumentView` only |

All three are static server components. The single `'use client'` boundary in this spec is `ConsentChoiceControl`, which moves unmodified — it already exists, already has tests, and its storage module already documents that it is exposed for exactly this purpose.

**Static-export compliance (NFR-1, ADR-002):** no `useSearchParams` outside a `Suspense` boundary, no dynamic segments, no route handlers. `npm run build` is the gate for those three and fails loudly on each.

**What the build does NOT catch — measured during T-4, not assumed.** A `'use client'` page module using a plain hook such as `useState` builds and exports **successfully**: Next.js prerenders it to static HTML and hydrates it on the client. So the project's server-component preference for these pages is a **design rule enforced by review**, not by the build. Stating otherwise would have left the rule with a gate that cannot see its own violation — the exact shape KZ-002 names.

### 5.3 The consent-change slot

`ConsentChoiceControl` must sit *inside* the cookie document's flow, not bolted below it, or the page reads as a policy with an unrelated widget appended. `LegalDocumentView` therefore accepts an optional slot rendered after a named section, so the Cookie Notice can place the control immediately under its "Changing your choice" section while Terms and Privacy pass nothing and render identically to each other.

### 5.4 Token discipline (NFR-3)

Tokens from `docs/ux-ui/design.md` §7 only. **One project-specific trap is called out explicitly because it fails silently:** opacity modifiers on semantic tokens (`text-fg/80`, `border-bg/15`) emit no CSS under this project's Tailwind configuration. Use an `opacity-*` utility instead. This is not a style preference — a page written with `text-muted/70` renders with no opacity at all and every test still passes.

---

## 6. Security & RBAC

No role, guard, serializer, or PII surface is touched. All three pages are `Public` and carry no actor data. The consent registry governs *evidence about* consent, not personal data — `Registration.consentPolicyVersion` remains inside ADR-010's structural containment and is never part of a public response.

No new field with disclosure implications is introduced, so `backend/src/common/pii-consent.policy.ts` is not modified.

---

## 7. Infrastructure / Deployment

None. No SAM template change, no new resource, no `--profile IBD-DEV` operation. The frontend deploys through the existing pipeline; `infra/scripts/deploy-frontend.sh` reads `AWS_PROFILE` and parses no flags.

---

## 8. Decision Records

### Decision: Legal copy is version-controlled code, not database rows and not admin-editable

- **Context.** ATP-54 requires replacing placeholder consent text and publishing legal documents. The storage medium was genuinely open: TypeScript constants, a database table, or an admin CRUD.
- **Options considered.** (1) Code, versioned in git. (2) A `LegalDocument`/`ConsentPolicy` table with an append-only constraint. (3) Admin-editable CRUD over that table.
- **Decision.** Option 1. See D-1 in `requirements.md` for the full argument.
- **Consequences.** A legal text change requires a deploy — acceptable at an annual change rate, and the deploy is a static export plus a Lambda update, not a migration. Non-engineers cannot edit legal copy directly; every change goes through a pull request, which is the intended property, not a limitation. Option 3 is rejected permanently, not deferred: the ability for a `staff` user to alter accepted consent text is a liability no UI convenience offsets.
- **ADR allocation.** Candidate **ADR-014**, verified free on `main` and on all four unmerged branches on 2026-09-15 (max observed: ADR-013). Per the root guide's concurrency protocol the number is allocated **at apply time on the default branch**, never from this branch — the check above establishes it is currently free, not that it is reserved.

### Decision: Cookie disclosure is split — commitment on `/privacy`, inventory on `/cookies`

- **Context.** Legal's Privacy Policy contains a Cookies section written prospectively (*"may use"*) that enumerates six purposes, of which one is true of this site today (NFR-4), and which never names Google as the third-party recipient.
- **Decision.** Carry Legal's section verbatim on `/privacy` as the policy commitment; publish the factual inventory and the consent control on `/cookies`; link the former to the latter.
- **Consequences.** Two documents mention cookies, which a reader could find redundant — mitigated by the explicit onward link and by each document's distinct framing. Adding or removing an analytics tool becomes a `/cookies` edit rather than a legal approval round. The divergence between Legal's six purposes and the actual one is **recorded, not silently reconciled** — and, per **D-10**, not carried back to Legal either: `/privacy` keeps Legal's text unamended and `/cookies` carries the recipient and IP-geolocation disclosure alone. The consent banner sends every visitor it asks for consent to `/cookies`, so the disclosure sits on the path that needs it. The tension between Legal's *"does not use cookies to collect personal information"* and `/cookies`' IP-derived geolocation is resolved by **placement, not amendment**, and is an accepted divergence rather than a closed one.

### Decision: No HTTP endpoint for historical editions

- **Context.** The registry makes any edition retrievable by version.
- **Decision.** Server-side consumers import the module. No route is added.
- **Consequences.** A future admin screen rendering "the text this applicant accepted" is a frontend + controller addition at that time. Adding the route now would be an unused public surface, and every public surface is a thing to secure and test.

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **The approved text asserts something untrue about the system** (defect class 8 — no automated gate) | NFR-4's audit is performed against the tree and its two findings go back to Legal at the HITL pause. Engineering does not verify Legal's legal claims; that limitation is recorded as accepted risk, not silently absorbed. |
| **The version bump is applied to one export and not the other** | Structurally impossible after FR-1 — both are derived. This is the refactor's main safety argument, and defect class 3 is the test that proves the derivation is real. |
| **The tripwire is deleted rather than inverted** when the copy lands | FR-2's scenario requires inversion explicitly. A deleted guard and a passing guard look identical in a green run — which is precisely how a gate stops being one. |
| **Long legal documents render badly** (defect class 9) | jsdom cannot evaluate it. Human check at the HITL pause, mobile and desktop. Recorded as a gap, not counted as coverage. |
| **A baseline document keeps asserting the placeholder state** | FR-8 sweeps the *withdrawn premise*, not just the changed literal (KZ-004). Two known sites: ADR-013's consequences and ADR-011's `/privacy` clause — the second found by the Step 2.3 challenge, not by grepping for a value. |
| **Concurrent branch collision** | Checked: PR #72's file set is disjoint and its deferred CSP keeps GA4 loading. No other open PR. |

---

## 10. Test Plan Outline

| Requirement | Coverage |
|---|---|
| FR-1 | `consent-policy.spec.ts` — multi-entry set semantics (retained), derivation of both exports, lookup by version, superseded prose still present. `registrations.controller.spec.ts` — response key set and values pinned. |
| FR-2 | Inverted tripwire over the **current** edition's headings and bodies; acceptance of `v1.0-placeholder` after the bump. |
| FR-3 | `/cookies` content assertions — Google named, four signals, city-level granularity, asymmetry, pre-consent absence; `ConsentChoiceControl` present and functional. |
| FR-4, FR-5 | Page renders the document with version and date; `/terms` carries no acceptance control; `/privacy` retains the contact-form disclosure (pending OQ-A). |
| FR-6 | Footer link targets — five assertions, one per destination. |
| FR-7 | Renderer contract test; a11y across all three pages. |
| FR-8 | No automated gate — Reviewer reads the diff against the baseline files (blast-radius rule). |
| FR-9 | Recorded in `execution.md` with its disconfirming input named. |

**Every gate must be demonstrated to fail before it is trusted** (KZ-002 ×6). Each task carries its falsifying mutation; a task reporting green without having reddened its own gate has produced a result that looks like evidence.

---

## 11. Budget (Step 2.4 — tripwire for `/akili-execute`)

| Metric | Expected |
|---|---|
| Tasks | **10** |
| Net LOC | **~700** (backend ~140, frontend content + pages ~380, tests ~140, docs ~40) |
| Review rounds | **~4 total** — 2 on T-1 (the registry), 1 each on T-6 and T-9 |

Exceeding any of these is information, not failure — the Leader **stops and escalates** rather than continuing silently.

**PR strategy — two PRs, split on the Legal blocker, not on layer.**

- **PR 1 — mechanism and inventory** (T-1..T-7, T-10): the registry refactor, the content contract, `/cookies` complete, footer, banner re-route, scaffolded `/terms` and `/privacy` with the placeholder marker retained, IA and ADR updates. Reviewable and mergeable today. ~550 LOC.
- **PR 2 — approved copy** (T-8, T-9): paste the three texts, bump to `v1.0`, invert the tripwire, record the governance decision. Blocked on Legal. ~150 LOC and mostly prose.

Splitting on layer instead (backend PR / frontend PR) would leave both PRs half-blocked. The blocker is the real seam.
