# Requirements — Legal Notices & Approved Consent Copy

- Spec path: `docs/specs/legal/legal-notices-and-consent-copy/`
- Status: Draft
- Author / Date: Daniela Gómez · 2026-09-15
- Depth: **Standard**
- Jira: ATP-54 (subtask of ATP-49). Related stories: ATP-44 (Public About Section), ATP-48 (Actor Registration and Digital Consent)
- Related: `docs/prd.md` (OQ-4 retention), `docs/ux-ui/design.md` §2 (IA), §4 (Screen Inventory), §7 (Tokens) · `docs/trd/trd.md` §12.5 (ADR-011, ADR-013) · `docs/specs/archive/2026-08-06-actors--public-self-registration/` (origin of OQ-1)

---

## 1. Summary

The consent mechanism is built, versioned and enforced server-side; **only the prose is placeholder.** `backend/src/registrations/consent-policy.ts` serves four sections whose bodies read `[PLACEHOLDER TEXT — pending legal review, OQ-1]` under the version `v1.0-placeholder`. Separately, the platform publishes one narrow privacy notice and no Terms of Use.

This spec does three things:

1. **Restructures** the consent policy from *"the current version's text"* into an **append-only registry of versions**, so the text any applicant accepted stays retrievable and the append-only invariant becomes structural rather than a comment.
2. **Publishes three separate public legal documents** — Cookie Notice (`/cookies`, new), Terms of Use (`/terms`, new), Privacy Policy (`/privacy`, same URL, content replaced) — and re-routes the three inbound links that today all point at `/privacy`.
3. **Records the governance decision** on registrations accepted under the placeholder version.

It closes the open edge ADR-013 records against itself: *"The consent-policy text is still `[PLACEHOLDER TEXT — pending legal review, OQ-1]` and `CONSENT_POLICY_VERSION` was deliberately not bumped past `'v1.0-placeholder'` … a real open edge, not an oversight."*

### Correcting the ticket

ATP-54's description is an AI-drafted brief and two of its claims are false against the tree. Recorded here so the spec is not built on them:

| ATP-54 claims | Verified state |
|---|---|
| *"there is no Privacy Policy or Terms of Use page at all — no route under `frontend/app/(public)/` and no link in the layout or footer"* | **False for privacy.** `frontend/app/(public)/privacy/page.tsx` exists, has an a11y test, and is linked from `Footer.tsx`, `ContactForm.tsx` and `ConsentBanner.tsx`. Its scope is deliberately narrow (contact form + analytics cookies) and the page says so. |
| *"no Terms of Use"* | **True.** Case-insensitive search over `frontend/app`, `frontend/components`, `frontend/lib` returns no `/terms` route and no Terms link. |

ATP-54 also omits a trap: `registrations.controller.spec.ts` asserts `expect(section.body).toContain('PLACEHOLDER')` — an **inverted tripwire** that turns red the moment approved copy lands. It is doing its job; it must be inverted in the same change, not discovered in CI. FR-2 owns it.

---

## 2. Requirement Numbering & Writing Standards

Functional `FR-n`, non-functional `NFR-n`, closed decisions `D-n`. RFC 2119 keywords. Citations anchor to **symbols and unique literals**, never `file:line` (KZ-009).

---

## 3. Closed Decisions (settled before this spec; recorded, not re-opened)

| ID | Decision | Why |
|---|---|---|
| **D-1** | **Legal copy lives in version-controlled code.** Not a DB table, not an admin-editable CRUD. | (a) Legal text is a release artifact, not user data — it changes ~annually and each change is a signed legal event; git supplies the who/when/diff audit trail a DB row does not. (b) `Registration.consentPolicyVersion` is a pointer whose target MUST stay retrievable and immutable forever — free in code, requiring an append-only table plus UPDATE-locking plus per-environment seed choreography in a DB. (c) An admin CRUD would let a `staff` user silently alter the text people already legally accepted — a liability, not a feature. (d) DD-7 of the originating spec already makes this module the single source of truth. |
| **D-2** | **Three separate public documents**, plus the consent policy which is **not a page**. | Each changes for a different reason and has a different audience. See the artifact table in §5. |
| **D-3** | **`/privacy` keeps its URL.** The Privacy Policy replaces its content in place. | Static export (ADR-002) offers no cheap redirects. Reusing the URL breaks zero inbound links. |
| **D-4** | **`/cookies` is the factual inventory; `/privacy` §Cookies is the legal commitment.** Legal's cookie section is carried verbatim into `/privacy` and ends with a link to the Cookie Notice. | Legal's own sentence *"Users will be provided with appropriate notice to manage cookie preferences"* promises a mechanism, and an interactive island cannot live inside a document Legal re-issues. Adding or removing an analytics tool must be a table edit, not a legal approval round. |
| **D-5** | **OQ-1 resolved: English only.** No i18n is built. | No i18n exists in the repo. Zero-cost hedge: the version registry is already a list, so a future Swahili edition enters as `v2.0-en`/`v2.0-sw` with no redesign. **No speculative `locale` field is added.** |
| **D-6** | **Versions are `v1.0`, `v2.0`, …** Dates live inside each text. Only the consent policy carries a version in the database. | Terms and Privacy are never accepted by anyone, so they need a visible version and date, not acceptance machinery. |
| **D-7** | **Contact details live inside the legal prose**, not as a link to `/contact`. `ContactForm.tsx` is not modified. | Legal's text supplies its own contact block. |
| **D-9** | **The contact-channel facts stay on `/privacy`, authored by engineering, not by Legal.** Legal's *"Information We Collect"* covers what a contact submission collects; the three remaining facts — who receives it, that it is relayed and not stored, that submitting is not consent to publish — are placed as a short section after Legal's block. | Resolves OQ-A (2026-09-15). The approved policy covers the collection half; the other three are system behaviour, not legal commitment, so asking Legal to author them would be asking the wrong party. Carrying the four superseded sections in wholesale was rejected: three of them are now redundant with Legal's text. |
| **D-10** | **`/privacy` does not name Google. The recipient disclosure lives only on `/cookies`.** Legal's Cookies section is carried verbatim, unamended, including its *"does not use cookies to collect personal information"* sentence. | Resolves OQ-B (2026-09-15). D-4's division applied consistently: the policy states the commitment, the notice states the fact. The site as a whole discloses the recipient and the IP-derived geolocation on `/cookies`, which is where the consent banner sends every visitor it asks for consent. **Recorded as an accepted divergence, not a reconciled one** — Legal's sentence and `/cookies`' inventory are in tension, and the resolution is placement, not amendment. |
| **D-11** | **The pre-existing IA drift is repaired in passing.** `docs/ux-ui/design.md` §2 and §4 omit `/about` and `/forgot-password`, both of which ship. | Resolves OQ-C (2026-09-15). The same block is already being edited by T-10, and a route map that omits shipped routes is what sends agents looking for files that exist at a different path — the exact failure the A-92 correction note in that block already records. |
| **D-12** | **Legal's sixth bullet in the consent document's §Consent is carried as a trailing paragraph, not as a bullet.** The clause is *"I understand that CIAT may retain this consent and related records for compliance, audit, legal, and operational purposes…"*. | **Decided by the product owner on 2026-09-15, after the deviation was caught in review and escalated.** Recorded as a decision because it is not a neutral formatting choice: the list is introduced by *"I expressly and voluntarily consent to:"*, so as Legal marked it the retention clause is an **object of consent**, and as carried it is a separate statement of **understanding**. Supporting evidence is grammatical — Legal's fourth bullet ends `; and` and the fifth ends with a full stop, closing the enumeration, while the sixth is a complete sentence beginning *"I understand that…"* that does not read as an object of *"I consent to:"*. It has the shape of a Word list-continuation artifact. **Engineering did not make this call** — the alternative (restore the bullet; zero engineering judgment on a legal document) was offered and declined. The deviation is disclosed in the edition's own doc comment beside the Consent Statement omission, so the module's account of itself stays true. Worth raising with Legal alongside the duplicated *"Submit a complaint…"* sentence. |
| **D-13** | **`GET /registrations/consent-policy` gains an `acceptanceStatement` field.** The response becomes `{version, sections, acceptanceStatement}`. | Decided by the Leader at T-9, 2026-09-15. Legal's consent document ends with the paragraph a person ticks a box to accept, and that paragraph is **not** a policy section — it is the acceptance control's label. Once it lives in `consent-policy.ts`, the frontend has no way to reach it: it does not import `backend/src`. The two options were to hand-copy Legal's sentence into `ConsentPolicyDisclosure.tsx`, or to carry it on the wire. **Hand-copying was rejected**: it produces two divergent copies of the exact words a person legally accepts, which is the failure DD-7 and D-1 exist to prevent — and unlike the version string, nothing would ever 400 to reveal the divergence. The response-key-set assertion reddened on this change, which is the contract-change alarm working, not an obstacle; it was updated with the reason recorded beside it. **`PII_ALLOWLIST` and the role-aware serializer are untouched** — the added field is public policy text, carries no actor data, and the endpoint was already fully public. |
| **D-14** | **The `15. ` prefix is dropped from Terms of Use §Contact Information.** Legal's source types that one heading as *"15. Contact Information"*; every other heading in the document is unnumbered. | Instructed by the product owner, 2026-09-15. Recorded rather than applied silently because it **is** an edit to Legal's text, and this spec has already reverted one unratified edit of the same class (the curly-quote conversion, caught in T-8 review). The difference is authorization, not size. It is typographic, not substantive: there is no numbering scheme to break — no headings 1–14 exist — so the prefix is an artifact of drafting rather than a reference anyone could cite. A future reader diffing the delivered file against Legal's will find this note and the one in `terms.ts` instead of an unexplained difference. |
| **D-8 (governance)** | **Zero registrations were accepted under `v1.0-placeholder`** — public self-registration has never been released to production. **No re-consent flow is required and no follow-up ticket is opened.** `v1.0-placeholder` is nevertheless **retained** in the known-version set. | This is ATP-54's *"a documented decision exists for registrations accepted under the placeholder version"* acceptance criterion, discharged. Retention is unconditional: the append-only rule is never suspended, even when the set it protects is empty, because a rule with an exception is not an invariant. |

**Verification owed on D-8.** The claim "zero registrations" is a claim about a running system and is therefore load-bearing (KZ-011). It is recorded here as **stated by the product owner on 2026-09-15**, not as a measured value. FR-9 owns confirming it, and names the disconfirming input.

---

## 4. System Context & Scope

**In scope:** `backend/src/registrations/consent-policy.ts` and its tests · three public routes and their content modules · `Footer.tsx` · `ConsentBanner.tsx`'s link target · the IA and Screen Inventory blocks of `docs/ux-ui/design.md` · an ADR in `docs/trd/trd.md`.

**Out of scope (explicit non-goals):**

- Any Prisma schema or migration change. `Registration.consentPolicyVersion` stays a plain `String`.
- ~~Any change to the shape of `GET /registrations/consent-policy`.~~ **Superseded at T-9 by D-13** — the response gained an `acceptanceStatement` field so the checkbox label and the policy text come from one source. The bullet is kept rather than deleted because its first half is still the record of what **T-1's refactor** did not do: the registry rewrite moved nothing on the wire. The widening is a separate, argued decision taken later, not a consequence of the refactor. *(Swept 2026-09-15: FR-1 scenario 3 and `design.md` §1/§3 were updated when D-13 was taken and this non-goal was missed, leaving the document briefly forbidding and authorizing the same change — KZ-004, the withdrawn premise surviving at a site the correction did not cite.)*
- Any re-consent flow, notification, or applicant email (D-8).
- i18n or translation infrastructure (D-5).
- Admin UI for rendering historical policy versions. The registry *enables* it; building it is not this spec.
- `ContactForm.tsx`, the contact relay, or `/contact` (D-7).
- Rewriting Legal's supplied prose. Engineering places the text; it does not author or edit it.

---

## 5. The four artifacts

| Artifact | Lives in | Audience | Accepted by anyone? | Version recorded in DB? |
|---|---|---|---|---|
| Cookie Notice | `/cookies` (**new**) | any visitor | yes — via the consent banner's accept/reject | no |
| Terms of Use | `/terms` (**new**) | any visitor | no | no |
| Privacy Policy | `/privacy` (**content replaced**) | any visitor | no | no |
| **Consent policy** | `backend/src/registrations/consent-policy.ts`, served over `GET /registrations/consent-policy` | **only an applicant registering an organisation** | **yes** — behind a scroll gate | **yes** — `Registration.consentPolicyVersion` |

Only the fourth row needs versioning machinery. Conflating it with the first three is the modelling error ATP-54's description invites.

### Inbound link re-routing

Three call sites link to `/privacy` today. Each wants a different destination:

| Call site (anchor) | Today | After |
|---|---|---|
| `ConsentBanner.tsx` — the banner's policy link | `/privacy` | **`/cookies`** |
| `ContactForm.tsx` — the privacy-acknowledgement checkbox label | `/privacy` | **`/privacy`** (unchanged) |
| `Footer.tsx` — `FOOTER_LINK_CLASSES` nav row | `/privacy` only | **all three** |

---

## 6. Functional Requirements

### FR-1: Consent policy is an append-only registry of versions

- **Description:** `consent-policy.ts` SHALL expose an ordered list of policy editions, each carrying its own `version`, an issue date, and its own ordered `sections`. `CONSENT_POLICY_VERSION` and `KNOWN_CONSENT_POLICY_VERSIONS` SHALL be **derived** from that list, never maintained as independent literals.
- **Rationale:** D-1. Today a version bump erases the superseded edition's prose from `HEAD` while rows in the database still point at it, which makes `consentPolicyVersion` a pointer into nothing. Deriving the two exported constants also removes the class of defect where a bump updates one and forgets the other.
- **PII/RBAC impact:** None directly. The served content is public by construction; no actor data is involved. The requirement protects *evidence about* consent, not personal data.

#### Scenario: A superseded edition stays served-acceptable

- GIVEN the registry contains more than one edition
- WHEN `isKnownConsentPolicyVersion` is called with the version of a **non-final** edition
- THEN it returns `true`
- AND `CONSENT_POLICY_VERSION` equals the version of the **final** edition
- BUT it must NOT return `true` for a version absent from the registry
- AND IT MUST derive both exports from the registry, such that adding an edition updates both without either being edited by hand

#### Scenario: The prose of a superseded edition survives a bump

- GIVEN an edition has been superseded by a later one
- WHEN the module is read at `HEAD`
- THEN the superseded edition's `sections` are still present in full
- AND IT MUST be possible to obtain that edition's sections by its version string alone, without consulting git history

#### Scenario: The public endpoint's contract does not move

- GIVEN a client of `GET /registrations/consent-policy`
- WHEN the registry refactor lands
- THEN the response body's shape is byte-compatible with the pre-refactor shape — the same keys, the same types, the current edition's sections and version
- BUT it must NOT gain a field, lose a field, rename a field, or begin serving a non-current edition

> **Scope of this scenario — it constrains the T-1 refactor, and only that.** It says a *data-shape change* must not become a *contract* change: the registry could have been built in a way that moved the wire, and it was not. **T-9 later widened the contract deliberately under D-13**, which does not violate this scenario — the refactor still moved nothing, and the later addition is a separate, argued decision rather than a side effect of it. A future reader finding a third key in the response should check D-13 before reading it as drift.

---

### FR-2: Approved consent copy replaces the placeholder, under a real version

- **Description:** The four placeholder sections SHALL be replaced by the consent text supplied by the Alliance/CIAT legal owners, entered as a **new edition** appended to the registry with version `v1.0`. The placeholder edition SHALL be retained in the registry.
- **Rationale:** ATP-54's primary acceptance criterion; closes ADR-013's recorded open edge.
- **Blocked by:** delivery of the approved text (see §9).

#### Scenario: No placeholder marker survives

- GIVEN the approved copy has been entered
- WHEN `consent-policy.ts` and its served response are searched case-insensitively for `placeholder`
- THEN the only occurrences are the retained historical edition's own `version` string and section bodies
- AND the **current** edition contains no occurrence in any heading or body
- BUT it must NOT be achieved by deleting the historical edition
- AND IT MUST invert the existing tripwire in the same change: the assertion `expect(section.body).toContain('PLACEHOLDER')` SHALL become an assertion that the **current** edition's headings and bodies contain no such marker, so the guard keeps pointing at the live risk instead of being deleted

#### Scenario: In-flight submissions do not break

- GIVEN the version has been bumped to `v1.0`
- WHEN a submission arrives asserting `policyVersion: 'v1.0-placeholder'`
- THEN it is accepted, not rejected with `400`
- AND IT MUST remain true that no version is ever removed from the known set

---

### FR-3: Cookie Notice at `/cookies`

- **Description:** A new public page SHALL describe the cookies this site actually sets, name **Google Analytics** and **Google** as the third-party recipient, enumerate the four GA4 signals, state the withdrawal asymmetry, and host the control that changes a stored consent choice.
- **Rationale:** D-4. The consent banner asks a visitor to agree to something specific; its "learn more" destination must describe that specific thing, including who receives the data. A consent whose disclosure page never names the recipient is not informed consent.

#### Scenario: The banner's link resolves to the cookie inventory

- GIVEN a visitor reading the consent banner
- WHEN they follow its policy link
- THEN they reach `/cookies`
- AND the page names Google Analytics and Google as recipient
- AND the page lists all four signals: page views, sessions, approximate geography at **country, region and city** level derived from IP, and device/browser category
- BUT it must NOT understate the geographic granularity — ADR-011 records that understating it was a real defect caught in review
- AND IT MUST state that no analytics cookie is set before consent is granted

#### Scenario: A visitor changes a prior choice

- GIVEN a visitor with a stored consent choice
- WHEN they use the control on `/cookies`
- THEN the stored choice changes
- AND the page discloses that accepting applies immediately while rejecting applies from the next page load
- AND IT MUST disclose that the site does not itself delete cookies already set

#### Scenario: The inventory describes this site, not a generic one

- GIVEN the verified inventory (§7, NFR-4)
- WHEN `/cookies` enumerates what is set
- THEN it names the GA4 cookies as the only cookies this site sets
- AND IT MUST NOT claim cookies are used for session authentication, fraud detection, performance, or troubleshooting — none of which this site uses cookies for

---

### FR-4: Terms of Use at `/terms`

- **Description:** A new public page SHALL publish the approved Terms of Use, with a visible version and effective date.
- **Blocked by:** delivery of the approved text.

#### Scenario: Reachable and self-identifying

- GIVEN any visitor
- WHEN they reach `/terms` from the footer
- THEN the approved Terms render with a visible version identifier and effective date
- BUT it must NOT present any acceptance control, checkbox, or "I agree" affordance — nobody accepts this document (D-6)

---

### FR-5: Privacy Policy at `/privacy`

- **Description:** `/privacy` SHALL serve the approved Privacy Policy at its existing URL. Legal's cookie section is carried **verbatim** and closes with a link to `/cookies`.
- **Blocked by:** delivery of the approved text.

#### Scenario: The URL keeps working for its existing referrer

- GIVEN `ContactForm.tsx`'s privacy-acknowledgement link
- WHEN a visitor follows it
- THEN they reach `/privacy` and it renders the approved Privacy Policy
- AND IT MUST still discharge the four-part obligation the previous notice carried (the originating spec's FR-6): what a contact-form submission collects, who receives it, that messages are relayed by email and **not stored** by the platform, and that submitting is **not consent to publish** anything
- AND IT MUST do so via the split D-9 records — Legal's *"Information We Collect"* discharges the first part; the remaining three are carried in a short engineering-authored section, because they are facts about this system rather than legal commitments
- BUT it must NOT be treated as discharged by the page merely existing, nor by the collection list alone
- BUT it must NOT retain the previous page's self-limiting statement that it does not cover registration or directory data, which the approved policy makes false

#### Scenario: Cookies are stated once as commitment and once as fact

- GIVEN the approved Privacy Policy's Cookies section
- WHEN it renders on `/privacy`
- THEN Legal's wording appears unedited
- AND it links onward to `/cookies`
- BUT it must NOT host the consent-change control, which lives only on `/cookies` (D-4)

---

### FR-6: The footer links all three documents

#### Scenario: Three destinations, one row

- GIVEN any public page
- WHEN the footer renders
- THEN it links About, Contact, Cookie Notice, Privacy Policy and Terms of Use, each to its own route
- AND IT MUST reuse the existing `FOOTER_LINK_CLASSES` treatment so the row stays visually uniform
- BUT it must NOT introduce a second, divergent link list — the footer nav is the single source for these links, mirroring the `NAV_LINKS` convention `docs/ux-ui/design.md` §5 sets for the header

---

### FR-7: Legal documents share one rendering contract

- **Description:** The three documents' copy SHALL live as structured data under `frontend/lib/content/legal/`, rendered by one shared component against a shared `LegalDocument` type carrying title, version, effective date and ordered sections of paragraphs and optional bullet lists.
- **Rationale:** Three long documents that must look structurally identical and carry a uniform version/date stamp. Keeping ~hundreds of lines of legal prose out of page components is the point; a future translation being a sibling file is a by-product, not the justification (D-5).

#### Scenario: Structural uniformity

- GIVEN the three legal documents
- WHEN each renders
- THEN each presents its version and effective date in the same position and format
- AND each uses the heading hierarchy and token classes of the others
- BUT it must NOT hardcode colors or geometry — `docs/ux-ui/design.md` §7 tokens only
- AND IT MUST NOT use a token opacity modifier such as `text-fg/80`: those emit no CSS in this project's Tailwind configuration and fail silently. Use an `opacity-*` utility instead.

---

### FR-8: The baseline documents describe what shipped

- **Description:** `docs/ux-ui/design.md` §2 (IA) and §4 (Screen Inventory) SHALL list `/cookies` and `/terms` and describe `/privacy`'s new scope. `docs/trd/trd.md` SHALL carry an ADR recording D-1, and ADR-013's consequence paragraph SHALL be updated where it asserts the text is still placeholder.
- **Rationale:** Blast-radius rule — these files train every future agent and no test covers them. ADR-013 currently states as present-tense fact something this spec makes false (KZ-004: sweep the withdrawn premise, not just the changed value).

#### Scenario: No baseline document still asserts the placeholder state

- GIVEN FR-2 has landed
- WHEN the baseline documents are searched for the withdrawn premise — the claim that the consent text is placeholder and the version deliberately un-bumped
- THEN every occurrence has been updated or explicitly marked historical
- AND IT MUST include ADR-013's consequences paragraph, which states it in present tense
- BUT it must NOT rewrite ADR-013's decision text itself; an accepted ADR is amended in its consequences or superseded, never silently edited

---

### FR-9: The governance decision is recorded against a confirmed count

- **Description:** D-8 SHALL be written into this spec's `execution.md` together with the evidence that produced it.

#### Scenario: The count is confirmed before the decision is frozen

- GIVEN D-8 claims zero acceptances under `v1.0-placeholder`
- WHEN the decision is recorded
- THEN it cites either a query result against the environments holding real traffic, or an explicit statement that no such environment exists because the feature never shipped
- AND IT MUST name the disconfirming input: **any row in `Registration` whose `consentPolicyVersion` is `v1.0-placeholder` and which was created by a real applicant**. One such row falsifies D-8 and re-opens the governance question as its own ticket.
- BUT it must NOT count development or staging fixture rows as acceptances

---

## 7. Non-Functional Requirements

| ID | Requirement | Measure |
|---|---|---|
| **NFR-1** | Every new page is a static server component compatible with `output: 'export'` | `cd frontend && npm run build` succeeds and emits `out/cookies/index.html` and `out/terms/index.html` |
| **NFR-2** | WCAG 2.1 AA on all three pages | `jest-axe` reports zero violations, **plus** the human check NFR-5 names — jsdom evaluates neither contrast nor layout |
| **NFR-3** | Token discipline | No hex literals and no raw geometry in the new components; `docs/ux-ui/design.md` §7 tokens only |
| **NFR-4** | The cookie inventory matches reality | Verified against the tree, not reasoned: see the audit below |
| **NFR-5** | Rendered legibility of three long documents | Human review at the HITL pause — see §8 |

### NFR-4 — the verified cookie inventory

Measured against the tree on 2026-09-15, not inferred:

| Mechanism | What it actually uses |
|---|---|
| Analytics (GA4) | **Cookies** (`_ga`, `_ga_*`), set only after consent |
| The visitor's consent choice | **`localStorage`**, deliberately — the originating design records that a cookie would ride on every API request under static export |
| Cognito session tokens | **`localStorage`** (Amplify's web default) |
| Backend responses | No `Set-Cookie` on any route |

**Consequence for FR-3:** of the six cookie purposes Legal's draft enumerates, exactly one — aggregated, non-identifiable statistics — is true of this site today. Legal's text says *"may use"*, which is standard prospective drafting and is not incorrect; `/cookies` nonetheless describes the present, which is why the two documents are separate (D-4).

---

## 8. Defect classes and their gates

Named first, then mapped — a gate blind to the defect class this spec most often produces is not a gate (KZ-002, KZ-011).

| # | Defect class | Gate | Can it fail? (falsifying input) |
|---|---|---|---|
| 1 | Placeholder copy reaches production | The inverted tripwire (FR-2) | Re-insert `[PLACEHOLDER]` into a current-edition body → red |
| 2 | Append-only invariant broken — a version silently dropped | A test asserting a **non-final** registry entry is still accepted (FR-1) | Remove the superseded edition from the registry → red |
| 3 | The two exports drift apart on a bump | Derivation test: adding an edition updates both | Re-introduce a hand-written literal for either export → red |
| 4 | Endpoint contract moves during the refactor | Controller test pinning the response key set and values (FR-1) | Add or rename a key in the response → red |
| 5 | A re-routed link points at a page that does not exist | Route-target assertions in the banner/footer tests **plus** `npm run build` under `output: 'export'` | Point the banner at `/cookie` → the assertion reddens; delete the page → the build fails |
| 6 | New pages break static export | `npm run build` | Add `useSearchParams()` without a `Suspense` boundary, a route handler, or a dynamic segment → build fails. **Corrected 2026-09-15 during T-4:** this row originally named `'use client'` + `useState`, which was **measured and does not fail** — Next.js prerenders such a page to static HTML and hydrates it client-side, so `output: 'export'` accepts it. The gate is real; the falsifier named for it was not. |
| 7 | a11y regression | `jest-axe` | Remove a heading's accessible name → red |
| 8 | **Legal text is inaccurate about this system** | ⚠️ **No automated gate exists.** | — |
| 9 | **Contrast, layout and rendered legibility of long documents** | ⚠️ **jsdom structurally cannot evaluate these.** | — |

**Class 8 — substituted, not automated.** No test can tell a plausible-but-false legal sentence from a true one; `/cookies` asserting six cookie purposes would pass every gate above. The substitute is twofold: NFR-4's audit is performed against the tree and written into the spec, and the two findings it produced (Legal's section does not name Google as recipient; its *"does not use cookies to collect personal information"* is contestable given IP-derived geolocation) go back to Legal at the HITL pause before the text is frozen. **Recorded as an accepted risk for Terms and Privacy:** engineering places that prose and does not verify its legal claims.

**Class 9 — substituted by human review.** A rendered check of the three pages at the HITL pause, at mobile and desktop widths. Not counted as automated coverage.

---

## 9. Dependencies & Assumptions

- **Blocking for FR-2, FR-4, FR-5:** the approved texts from the Alliance/CIAT legal owners. Confirmed as nearly final on 2026-09-15; minor details outstanding. Every other requirement is independently executable, and the task order in `tasks.md` reflects that.
- **Non-blocking:** PR #72 (`chore/security-headers`, ATP-33) is open awaiting validation. Verified disjoint — it touches `backend/src/common/security-headers.config.*`, `lambda.ts`, `main.ts`, `docs/infrastructure.md`, `infra/30-frontend/template.yaml`, none of which this spec touches. Verified semantically compatible: it **defers** CSP (so GA4 keeps loading) and **does not** set `Permissions-Policy: geolocation=()`. Merge order is free.
- No AWS resource, environment variable, or `--profile IBD-DEV` operation is required by this spec.

---

## 10. Open Questions

**All three resolved 2026-09-15.** Retained with their resolutions rather than deleted, so the spec records what was asked and why it was settled that way.

| ID | Question | Resolution |
|---|---|---|
| **OQ-A** | Does the approved Privacy Policy cover what the contact form collects? | **Resolved → D-9.** Partly: Legal's *"Information We Collect"* covers the collection half via *"Information submitted through communications with Registry administrators"*. The other three parts of the obligation are carried in a short engineering-authored section. |
| **OQ-B** | Will Legal amend the Cookies section to name Google as recipient? | **Resolved → D-10.** Not asked. `/privacy` carries Legal's text verbatim; `/cookies` carries the recipient disclosure alone. The divergence is accepted and recorded. |
| **OQ-C** | Repair the `/about` and `/forgot-password` IA drift in passing? | **Resolved → D-11.** Yes. T-10 owns it. |

## 11. Requirement ID Index

| ID | Title | Blocked by Legal? |
|---|---|---|
| FR-1 | Consent policy is an append-only registry of versions | no |
| FR-2 | Approved consent copy replaces the placeholder, under a real version | **yes** |
| FR-3 | Cookie Notice at `/cookies` | no |
| FR-4 | Terms of Use at `/terms` | **yes** |
| FR-5 | Privacy Policy at `/privacy` | **yes** |
| FR-6 | The footer links all three documents | no |
| FR-7 | Legal documents share one rendering contract | no |
| FR-8 | The baseline documents describe what shipped | partly |
| FR-9 | The governance decision is recorded against a confirmed count | no |
| NFR-1..5 | Static export · a11y · tokens · inventory accuracy · legibility | no |
