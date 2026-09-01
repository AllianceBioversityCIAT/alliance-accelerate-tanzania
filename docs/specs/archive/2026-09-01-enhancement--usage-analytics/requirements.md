# Requirements — Baseline Usage Analytics (GA4) + Cookie Consent

- Spec path: `docs/specs/enhancement/usage-analytics/`
- Status: Draft
- Author / Date: Daniela Gómez / 2026-08-31
- Depth: **Standard**
- Related: Jira **ATP-62** · `docs/prd.md` §4–5 · `docs/ux-ui/design.md` §7, §8, §10, §11 · `docs/trd/trd.md` §6, §8, §13 (QA-4, QA-11, QA-13), ADR-002
- Upstream intent: **ATP-62 is the approved source of what and why.** `/akili-propose` was deliberately skipped; this document converts ATP-62's five acceptance criteria into testable requirements and adds nothing to its scope.

## 1. Summary

The public registry currently has **no usage measurement of any kind** and no fallback telemetry: `infra/` configures no CloudFront or API Gateway access logging, and the backend's structured request logging is applied only to `ContactController` and `RegistrationsController` (opted in per-module via `MiddlewareConsumer.forRoutes`, never `forRoutes('*')`), so no public directory, profile, or map request is recorded anywhere. This spec installs Google Analytics 4 with **default measurement only**, gated behind an explicit cookie-consent choice, mounted so that administrative routes structurally cannot load it.

It advances no PRD success metric directly — `docs/prd.md` §4's six metrics are all measurable from the database, the API, or a performance test. Its justification is narrower and non-recoverable: **analytics has no backfill.** Every other item in this spec could be added later at identical cost; the launch period itself cannot be reconstructed once it has passed.

`docs/prd.md` §5 places *"Advanced analytics dashboards / BI"* out of scope for v1. This spec stays deliberately inside that boundary — see §6.

## 2. Requirement Numbering & Writing Standards

- Functional requirements are `FR-1…`; non-functional `NFR-1…`. Numbering is local to this spec.
- Citations anchor to **symbols, unique literal strings, or section titles**, never bare `file:line` (KZ-009).
- Figures in this document are cross-checked against its prose (KZ-005). The counts asserted here: **4** collected signals, **0** custom events, **2** consent choices, **3** rendered-capture widths.

## 3. Functional Requirements

### FR-1: Analytics does not load or transmit before consent is granted

- **Description:** No Google Analytics script, request, or cookie MUST exist in the page before the visitor has explicitly granted consent. The gate is **non-injection** — the GA4 script element is not added to the document at all until consent is granted.
- **Rationale / Source:** ATP-62 AC "no collection before consent is granted"; `docs/ux-ui/design.md` §1 principle 3 (trust through restraint).
- **Acceptance criteria:**
  - GIVEN a first-time visitor with no stored consent record, WHEN any `(public)` route mounts, THEN no script element whose `src` points at a Google analytics host exists in the document, AND no `gtag`/`dataLayer` global is created.
  - GIVEN that same visitor, WHEN they grant consent, THEN the GA4 script is injected exactly once and a page view is recorded for the route they are on.
  - GIVEN a visitor who has granted consent, WHEN they navigate within the app, THEN the script is **not** injected a second time.
  - BUT it must NOT inject the script in a "denied" or "pending" state on the assumption that a later consent signal will suppress transmission.
  - AND IT MUST create no analytics cookie before the grant.
- **PII/RBAC impact:** `Public` role only. No PII. Extends `docs/trd/trd.md` §8's boundary to the client.

### FR-2: Consent banner presents a symmetric, non-blocking choice

- **Description:** A consent banner MUST offer exactly **two** explicit choices — accept and reject — of equivalent prominence and equivalent interaction cost. It MUST NOT block reading or interacting with the page beneath it.
- **Rationale / Source:** ATP-62 AC "cookie/privacy disclosure in place"; `docs/prd.md` persona *Public visitor*; `docs/ux-ui/design.md` §1 principle 1 (*"No login wall in front of public data"*).
- **Acceptance criteria:**
  - GIVEN no stored consent record, WHEN a `(public)` route renders, THEN the banner is present and both an accept control and a reject control are reachable by keyboard.
  - GIVEN the banner is displayed, WHEN the visitor ignores it entirely, THEN every link, control, and region of the underlying page remains operable and reachable by keyboard.
  - BUT it must NOT be a modal dialog, MUST NOT trap focus, and MUST NOT render a backdrop that intercepts pointer events.
  - BUT it must NOT make rejecting harder than accepting — no extra click, no submenu, no "manage preferences" indirection on the reject path.
  - AND IT MUST expose the banner to assistive technology as a labelled landmark region, not as `role="dialog"` or `role="alertdialog"`.
  - AND IT MUST link to `/privacy` from within the banner.

### FR-3: The consent choice persists, is versioned, and tolerates unavailable storage

- **Description:** The visitor's choice MUST survive reload and navigation, MUST be recorded against a policy version so a future disclosure change can re-prompt, and MUST degrade safely when web storage is unavailable or throws.
- **Rationale / Source:** ATP-62 AC "cookie/privacy disclosure"; ADR-002 (static export — no server-side session exists to hold this).
- **Acceptance criteria:**
  - GIVEN a visitor who has chosen either option, WHEN they reload or navigate to another `(public)` route, THEN the banner does not reappear and the recorded choice is honoured.
  - GIVEN a stored record written against an **older** policy version, WHEN a `(public)` route renders, THEN the banner is shown again and the stale record is not treated as consent.
  - GIVEN a browser where web storage access throws (private-mode restrictions), WHEN a `(public)` route renders, THEN the page renders normally, the banner is shown, and no uncaught error reaches the console.
  - BUT it must NOT treat "no readable record" as consent — absence of a record is always treated as **not granted**.
  - AND IT MUST record rejection as durably as acceptance, so a rejecting visitor is not re-prompted on every page.

### FR-4: GA4 default measurement only — no custom events, parameters, or dimensions

- **Description:** The integration MUST rely exclusively on GA4's automatic collection, yielding these **4** signals: page views, sessions, geographic origin at GA4's default granularity, and device/browser category. No custom event, custom parameter, custom dimension, or user property MUST be sent.
- **Rationale / Source:** ATP-62 AC "no custom events, parameters, or dimensions are sent"; ATP-62's PII position.
- **Acceptance criteria:**
  - GIVEN consent has been granted, WHEN the visitor uses the directory, filters, the map, a profile, or the contact form, THEN no call transmits a custom event name, an actor identifier, or a search string.
  - BUT it must NOT send a directory search term under any parameter — a visitor may type an email address or phone number into the search field, which would place a `PII_ALLOWLIST`-class value in an outbound request.
  - AND IT MUST leave the geographic aggregation at GA4's default; no custom geographic configuration is introduced, because no aggregation level has been approved (see §8 OQ-1).
  - AND IT MUST NOT assert an upper bound on geographic precision anywhere in visitor-facing copy. **Corrected 2026-08-31 at the T-6 gate:** this document previously described GA4's default as "country/region reporting", which is **incomplete** — GA4's default geographic dimensions also derive **City** from the visitor's IP address. The error originated here, was faithfully transcribed into `/privacy`, and became an affirmative false claim there ("nothing more precise"). A privacy notice that *understates* collection is the wrong direction to err.
- **PII/RBAC impact:** This requirement **is** the PII mitigation, not an omission from it. GA4's automatic events do not read page content or record the DOM, so default measurement carries no actor or requester data. Adding custom events is what would create exposure.

### FR-5: Administrative routes structurally cannot load analytics

- **Description:** The GA4 integration MUST be mounted in the `(public)` route group's layout, so that `(admin)` routes cannot load it by construction. The root `app/layout.tsx` MUST remain free of the analytics integration.
- **Rationale / Source:** ATP-62 AC "administrative routes are excluded from collection, covered by a test". Staff and admins curate records daily; counting them as public engagement materially distorts reported figures.
- **Acceptance criteria:**
  - GIVEN an `(admin)` route, WHEN it renders with a granted consent record present in storage, THEN no GA4 script element and no consent banner are rendered.
  - GIVEN the root layout, WHEN inspected, THEN it contains no reference to the analytics integration.
  - BUT it must NOT achieve the exclusion with a runtime pathname test as the primary mechanism — a pathname allowlist is a filter that a future route can fall through; layout placement is structural containment. This mirrors the reasoning recorded in ADR-010 for the registration payload.
  - AND IT MUST be covered by a test that is **proven to fail** when the integration is moved to the root layout (KZ-002, recurrence ×3).

### FR-6: The privacy notice discloses analytics cookies and the transfer to Google

- **Description:** `/privacy` MUST disclose that the site sets analytics cookies subject to consent, what is collected, that data is transmitted to Google, and how a visitor changes or withdraws a previous choice. Its existing contact-form scope MUST be preserved.
- **Rationale / Source:** ATP-62 AC "cookie/privacy disclosure is in place"; the page today opens by stating it *covers the contact form only* and names no cookies or third parties.
- **Acceptance criteria:**
  - GIVEN the `/privacy` page, WHEN rendered, THEN it names analytics cookies, the 4 collected signals, Google as recipient, and the route to change a prior choice.
  - GIVEN the page's existing sections, WHEN the disclosure is added, THEN the contact-form sections and every assertion in the existing `/privacy` accessibility and content test continue to pass.
  - BUT it must NOT continue to assert a contact-form-only scope once analytics is disclosed — the opening scope sentence is now false and MUST be corrected, not appended to (KZ-004: a correction is not applied while the superseded claim survives elsewhere).
  - AND IT MUST leave the "not consent to publish" section semantically intact; visitor analytics consent and actor publication consent are unrelated and MUST NOT be conflated.
- **Verified precondition:** the existing `/privacy` content test asserts the **four** content sections (*what a submission collects*, *who receives it*, *relayed by email and not stored*, *not consent to publish*) and does **not** assert the opening scope sentence. Correcting that sentence therefore breaks no existing assertion, and this requirement is **purely additive** to that test file. No existing assertion may be relaxed to satisfy FR-6.

### FR-7: An analytics provider failure cannot degrade or block the registry

- **Description:** Unavailability, blocking, or error of the analytics provider MUST leave every registry function intact.
- **Rationale / Source:** ATP-62 AC "an analytics outage does not interrupt the registry"; extends `docs/trd/trd.md` QA-4 (*"Frontend availability is decoupled from API health"*) to the third-party script.
- **Acceptance criteria:**
  - GIVEN consent has been granted, WHEN the GA4 script fails to load (network failure, DNS block, or ad-blocker), THEN the page renders completely, no error surface is shown to the visitor, and no uncaught error reaches the console.
  - GIVEN the script has failed, WHEN the visitor navigates and interacts, THEN no interaction path throws on a missing analytics global.
  - BUT it must NOT load the script in a way that delays first render or blocks parsing.
  - AND IT MUST NOT retry in a loop that could itself become a failure mode.

## 4. Non-Functional Requirements

| ID | Requirement | Measure |
|---|---|---|
| **NFR-1** | The banner meets WCAG 2.1 AA structural accessibility. | `jest-axe` reports zero violations; both controls keyboard-reachable with a visible focus ring; the region carries an accessible name. Consistent with `docs/trd/trd.md` QA-11. |
| **NFR-2** | Every banner style resolves through a token in `docs/ux-ui/design.md` §7. | No hex, no `rgb()`, no arbitrary Tailwind values. Reviewer greps for violations per `frontend/CLAUDE.md`. |
| **NFR-3** | Any banner entrance motion is disabled under `prefers-reduced-motion`. | Motion gated per `docs/ux-ui/design.md` § *Reduced-motion rule* (WCAG 2.3.3); static final state delivered immediately. |
| **NFR-4** | Text and control contrast in the banner meets AA. | The banner's body/heading pairs (`fg`→`surface`, `muted`→`surface`) are **already asserted** in `frontend/lib/contrast.test.ts`'s REACHABLE matrix, so reusing them satisfies this by construction. The accept button's `primary-fg`→`primary` pair is **unasserted across the whole app today** — an inherited gap this spec records rather than introduces (§4.1). **Not** covered by `jest-axe`. |
| **NFR-5** | The banner does not occlude content or break layout at **3** widths: 375 / 768 / 1440. | Rendered capture at each width, including `/map`. **No automated gate exists** — see §4.1. |
| **NFR-6** | The static export shape is preserved. | `cd frontend && npm run build` succeeds under `output: 'export'`; no SSR, route handler, or dynamic segment introduced (ADR-002). |
| **NFR-7** | No PII reaches the analytics provider. | Satisfied structurally by FR-4 (zero custom events). Asserted as the absence of any custom-event call, not as a payload filter. |

### 4.1 Defect classes and the gate that catches each

Named before the verification commands were chosen, so that a green gate cannot stand in for coverage of a defect it cannot see.

| Defect class this spec can produce | Gate that catches it | Automated? |
|---|---|---|
| GA4 loads or sets a cookie before consent | Component test asserting no analytics script element and no `gtag`/`dataLayer` global pre-choice | Yes |
| GA4 loads on an `(admin)` route | Test asserting absence, **proven to fail** when the integration is moved to the root layout | Yes |
| A custom event / actor id / search string is transmitted | Test asserting the only calls are config/consent; plus a source-level check for custom-event call sites | Yes |
| Consent choice lost, or absence read as consent | Component tests over storage present / stale-version / throwing | Yes |
| Provider outage breaks a page | Test driving the script's error path | Yes |
| Static-export violation | `npm run build` | Yes |
| Banner structural a11y (labels, roles, keyboard) | `jest-axe` | Yes |
| **Banner text/control contrast** | **`jest-axe` cannot evaluate this** — its `color-contrast` rule needs a paint engine jsdom does not provide and is skipped without failing (`docs/trd/trd.md` QA-11). Substitute: `frontend/lib/contrast.test.ts`'s computed-ratio matrix. Verified while drafting: `fg`→`surface` and `muted`→`surface` are already in its REACHABLE set, so the banner's text is covered by reusing those tokens. **`primary-fg`→`primary` is absent from both the INKS and GROUNDS lists** — every primary button in the app is already unasserted for contrast. This spec inherits that gap; closing it app-wide is a separate change, and the banner MUST NOT be the pretext for widening scope into it | Substituted — partly inherited |
| **Banner occludes content; overlaps `MapLegend` on `/map`; breaks layout at 375/768/1440** | **No automated gate exists.** jsdom evaluates no layout, and `frontend/CLAUDE.md` records that lint, contrast and build have all passed green on a change that broke the `/register` grid. Substitute: **rendered capture at 375 / 768 / 1440, including `/map`**, reviewed at the HITL pause before merge | Substituted — human/rendered |
| Real GA4 property receives no data despite a green suite | **Unmeasurable in this repo.** No test can prove a live Google property is ingesting. Recorded as an accepted risk: first-load verification against the real property is a post-deploy manual step, not a spec gate | Accepted risk |

## 5. Data & Schema Impact

**None.** No Prisma model, field, migration, or API contract changes. No new PII field, so no `PII_ALLOWLIST` change (`docs/trd/trd.md` §8). The only persisted state is the visitor's own consent record in their browser.

## 6. Out of Scope

Recorded in ATP-62 as **"will not be built"** — deliberately *not* deferred to a follow-up ticket. A later reader must not mistake these for oversights:

| Excluded | Why |
|---|---|
| Microsoft Clarity, or any session replay | Contributes no acceptance criterion here, and DOM recording would capture contact-form content and the `phone`/`email` fields that admin views legitimately render — the largest PII risk of any option considered. |
| The six custom events (directory searches, filter usage, map interactions, actor profile views, contact-form initiation, contact-form completion) | Disproportionate to `docs/prd.md` §5, and each one reintroduces the FR-4 exposure this spec exists to avoid. |
| A documented event-name catalogue | Nothing to catalogue with zero custom events. |
| A broad analytics-payload privacy test suite | Reduced to FR-4's absence assertion plus FR-5's admin-exclusion gate. |
| A granular preference centre (per-category toggles) | Only one consent category exists. Two symmetric choices (FR-2) is the whole decision surface. |
| Server-side or log-based analytics; CloudFront/API Gateway access logging | Real gaps, but a different change in a different package (`infra/`). Named here only so the §1 finding is not read as in-scope. |
| A Content-Security-Policy | `infra/` defines none today, so nothing blocks the script. Adding one is out of scope; §7 records the coupling. |

## 7. Dependencies & Assumptions

- **A GA4 property and measurement ID must exist** before the integration can be verified against live data. **Confirmed available 2026-08-31**; its home is settled (§8 OQ-2). The build must still work with the variable unset (FR-7) — that tolerance is what makes the echoed deploy-summary line necessary, since an absent ID otherwise ships silently.
- The measurement ID is a **build-time** `NEXT_PUBLIC_*` variable — Next.js inlines these at `next build`, so changing it requires a rebuild and redeploy, exactly as `NEXT_PUBLIC_API_BASE_URL` already does.
- Deploy remains `AWS_PROFILE=IBD-DEV ./infra/scripts/deploy-frontend.sh` — that script reads `AWS_PROFILE` and parses no flags.
- **Assumption:** the banner is the agreed mechanism, confirmed 2026-08-31. GA4 consent mode is the mechanism *underneath* it, never an alternative to it: without a banner there is no path from denied to granted, so nothing would ever be collected.
- **Concurrency:** checked per the root guide before drafting — `origin/main`, `origin/actor-register`, and `origin/fix/registration-otp-mail-and-footer` are all ancestors of this branch, so no other branch is concurrently editing the layouts or `/privacy` (KZ-010).
- Adding a CSP later will require allowing the Google analytics hosts; this spec introduces the coupling without introducing the policy.

## 8. Open Questions

| ID | Question | Blocking? |
|---|---|---|
| **OQ-1** | No geographic aggregation level has been approved. FR-4 pins GA4's default rather than inventing one. **Restated 2026-08-31:** that default is country, region **and city** (city derived from IP), not country/region as this document first said. Does the programme need it coarser? | Not blocking. The disposition is unchanged — leaving GA4 at its default remains the honest floor, and GA4 exposes no granular collection-level geographic control. But the **fact** is now stated correctly, and the programme may want to weigh city-level derivation explicitly rather than inherit it from a mis-description. |
| **OQ-2** | ~~Where does the measurement ID live?~~ **Resolved 2026-08-31: committed default in `infra/scripts/deploy-frontend.sh`, overridable via `GA_MEASUREMENT_ID`, and echoed in the pre-build config summary.** Rationale in `tasks.md` T-7. The ID exists and is held by the reporter. | **No longer blocking.** |
| **OQ-3** | Should the banner's reject choice suppress re-prompting permanently, or expire after a defined period? FR-3 requires durable rejection; it does not set an expiry. | No — durable is the conservative default. |
| **OQ-4** | Where does a visitor change a prior choice? FR-6 requires `/privacy` to state the route; the control's placement is a design decision. | No — resolved in `design.md`. |

---
**Conventions reminder:** RBAC roles are `Public` / `Staff` / `Admin`; PII = `phone`, `email` (+ the `PII_ALLOWLIST` set in `docs/trd/trd.md` §8). All AWS commands use `--profile IBD-DEV`.
