# Proposal — Public Profile Disclosure

> **The short version.** Consent (`consentStatus = GRANTED`) stops being a switch that unlocks *exact GPS only* and becomes the switch that unlocks *everything the actor supplied*. The always-locked "Contact & Commercial Data" panel is replaced by the actual data. `PII_ALLOWLIST` empties. This inverts a policy currently enforced in **five** deliberate layers **[corrected 2026-09-04: six — `docs/specs/general-setup/requirements.md` also asserts it; see `requirements.md` §2.1]**, so the change is small in code and large in coherence.

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `actors/public-profile-disclosure` |
| Slug | `public-profile-disclosure` — **derived from free-text argument** (conversation on removing the restricted contact panel) |
| Proposal date | 2026-09-03 |
| Author | AKILI on behalf of Daniela Gómez |
| **Type** | **Change** |
| **Approval Mode** | **gated** (no end-to-end mandate given) |
| Status | **Approved** 2026-09-04 by Daniela Gómez (Option A; OQ-2 resolved: publish `otherCrops`) |
| Branch | `public-profile` |
| **Amended after approval** | **2026-09-04 — OQ-5 resolved (Daniela Gómez): the contact block is excluded from the public CSV.** Supersedes the CSV parts of §4, §5.2, §9, §12 R-1, and §13 below, which are annotated in place and kept for the record. The binding statement is `requirements.md` FR-7 / NFR-6. |
| Depends on | none |
| Parallel-safe | **no** — touches `common/pii-consent.policy.ts`, `common/role-aware.serializer.ts`, the `Actor` schema, and the release-gate suite; any concurrent spec reading those will conflict |
| Source | Conversation with Daniela Gómez, 2026-09-03 (decisions §5 below are hers, already settled) |

## 2. Intent

**The fields an actor fills in — on the public registration form, or in the team's Excel workbook — are the fields that appear on their public profile.** Nothing an actor supplied is withheld once consent is on file. Consent remains binary and admin-controlled: a `GRANTED` actor is fully visible, a non-`GRANTED` actor is absent from every public surface, exactly as today.

## 3. Problem / Current Behavior

| # | Today | Consequence |
|---|---|---|
| P-1 | The profile renders `RestrictedContactPanel`, an **unconditionally** locked card. Its own header says the unlocked variant is "Phase 2". | Every visitor sees a lock on every profile. There is no path, for any role, that ever unlocks it — Phase 2 was never built. |
| P-2 | `toPublic` in `common/role-aware.serializer.ts` builds `PublicActor` by explicit pick of 8 fields. `phone`, `email`, `sex`, `position`, `marketLocation`, `technicalSupport` are declared in `PII_ALLOWLIST` and never emitted. | Deleting the panel would leave an empty profile section. The data is not withheld by the UI — **the API never sends it**. |
| P-3 | `contactPerson` is **required** on the public registration form (`RegistrationPayloadDto`) and is **discarded at approval** — no `Actor` column exists for it. Same for `otherCrops`. | The registry asks every applicant for a mandatory field it then throws away. The central rule of §2 is unsatisfiable without a migration. |
| P-4 | The import template (`TEMPLATE_COLUMNS`, `TEMPLATE_VERSION = 'v2'`) has **no** `contactPerson` or `otherCrops` column. | "The Excel has the same columns as the form" is false today, in both directions. |
| P-5 | The prohibition is asserted in **six** places that must agree *(corrected 2026-09-04 — the sixth is `docs/specs/general-setup/requirements.md`'s closing Conventions reminder)*: the serializer's allowlist, the policy module, `src/test/pii-boundary.spec.ts` (a **release gate**), the constitutional docs (`CLAUDE.md`, `docs/prd.md`, `docs/trd/trd.md`), and the UX blueprint (`docs/ux-ui/design.md` principle 3, DD-2, the `--color-restricted-bg` token, the "PII block" component). | A partial change leaves the system self-contradictory, and the next `/akili-audit` reverts it as drift. |

## 4. Proposed Outcome

A visitor opening a `GRANTED` actor's profile sees every field that actor supplied — organisation, type, region, district, contact person, position, market location, sex, capacity, crops, phone, email, coordinates. ~~and can export the same fields from the public dashboard CSV~~ **[superseded 2026-09-04: the CSV excludes the contact block — see `requirements.md` FR-7].** A non-`GRANTED` actor remains invisible everywhere, unchanged.

## 5. Scope

### 5.1 Field disposition (settled — do not re-litigate in specify)

| Field | Column exists | Public today | Public after | Note |
|---|:---:|:---:|:---:|---|
| `traderName`, `traderType`, `region`, `district`, `crops`, `capacityTons` | yes | yes | yes | unchanged |
| `gpsLatitude` / `gpsLongitude` | yes | consent-gated | consent-gated | unchanged — stays behind `publicGps` |
| `phone`, `email`, `sex`, `position`, `marketLocation` | yes | **no** | **yes** | leave `PII_ALLOWLIST` |
| `contactPerson` | **no** | no | **yes** | **migration** — required on the form today, discarded at approval |
| `otherCrops` | **no** | no | **yes** | **migration** — actor-declared free text (confirmed 2026-09-04, OQ-2) |
| `technicalSupport` | yes | no | **no** | moves `PII_ALLOWLIST` → `NEVER_PUBLIC_FIELDS` |
| `traderId`, `gpsAltitude`, `gpsAccuracy`, `registrationSource`, `consentMethod`, `consentObtainedAt`, `consentReference` | yes | no | **no** | unchanged in `NEVER_PUBLIC_FIELDS` |

**Why `technicalSupport` is excluded.** The TRD names it *"Technical support required"* — it is a **needs assessment written by field staff about the actor**, not something the actor declared, and it is unreviewed free text that can incidentally carry personal data. It fails the rule in §2 ("what the actor supplied"). It is not reclassified as non-sensitive; it moves to `NEVER_PUBLIC_FIELDS` with that reason recorded. Publishing it later means adding it to the form as an optional field and publishing only what actors declare from then on — **out of scope here**.

### 5.2 Work in scope

| Area | Change |
|---|---|
| **Schema** | Add `contactPerson` and `otherCrops` to `Actor` (+ Prisma migration). Extend `AdminActor`/`toAdminActor`, the admin actor DTOs, and the approval projection. |
| **Approval path** | Reverse the DD-18 barrier in `AdminRegistrationsService.approve` / `RegistrationApprovalPayload` **explicitly and in writing** — the type omits `contactPerson`/`otherCrops` on purpose today; the reversal must replace that rationale, never silently delete it. `position` still reads only from `payload.position`. |
| **Import template** | Add both columns to `TEMPLATE_COLUMNS`; bump `TEMPLATE_VERSION` `v2` → `v3`; regenerate the workbook; extend the parser. |
| **Admin form** | Add both fields to `ActorForm`. |
| **PII policy** | Empty `PII_ALLOWLIST`; move `technicalSupport` into `NEVER_PUBLIC_FIELDS`; extend `PublicActor` + `toPublic`. ~~extend the Prisma `select` in `ActorsService`~~ **[corrected 2026-09-04: there is no `select` — the service uses `include: CROPS_INCLUDE` and fetches every column; the serializer is the sole gate. See `requirements.md` §2.1.]** |
| **Release gate** | Invert `src/test/pii-boundary.spec.ts` for the now-public fields: assert **presence** when `GRANTED`, **absence** when not. `NEVER_PUBLIC_FIELDS` assertions stay as-is. |
| **Public profile** | Replace `RestrictedContactPanel` with a real contact section, using the existing `ProfileLocation` `<dl>` pattern and §7 tokens. |
| **Public CSV** | Extend `PUBLIC_COLUMNS` in `frontend/lib/dashboard/csv.ts` **to the export set only — never the contact block (amended 2026-09-04, OQ-5: the contact block was dropped from the CSV; this clause is the surviving rule, not the superseded one)**; rewrite its "never add phone/email" header comment to state the new reason. |
| **Docs** | `CLAUDE.md` hard constraint · `docs/prd.md` (US-1, AC-1, AC-6, persona table, the "0 PII fields exposed" success metric) · `docs/trd/trd.md` (both PII-set statements, ADR-003, QA-1, the `/actors` endpoint rows) · `docs/ux-ui/design.md` (principle 3, DD-2, the PII-block component entry, and the fate of `--color-restricted-bg`). |

### 5.3 Rendering rule

Every field's label/row is **always** rendered; an empty value shows `—`. This preserves the current `district`/`capacityTons` behaviour and requires no new conditional logic. (Explicit user decision — hiding empty rows was considered and rejected as not worth the complexity.)

## 6. Non-Goals

- **Directory cards and map popups** — contact data does not appear there. Visitors open the profile to see it.
- **Consent policy text.** It stays the `[PLACEHOLDER — pending legal review]` content in `consent-policy.ts`. `CONSENT_POLICY_VERSION` is **not** bumped and existing `GRANTED` actors are **not** re-consented. Legal will deliver the wording separately.
- **Publishing `technicalSupport`**, and adding it to the registration form.
- **Any change to who is visible.** The consent gate, the Prisma `WHERE` pin, and the admin's show/hide control are untouched.
- Retention, deletion, or takedown workflow for published contact data (PRD OQ-4, still open).

## 7. Affected Users, Systems, And Specs

| Actor / System | Effect |
|---|---|
| Public visitor | Sees contact and commercial data on `GRANTED` profiles, one at a time. **Cannot bulk-export the contact block (amended 2026-09-04 — this is the rule that now holds).** |
| Registered actor | Everything they submitted becomes public once an admin grants consent. |
| Admin / Staff | Two new editable fields; must re-download the v3 import template. |
| `backend/src/common` | `pii-consent.policy.ts`, `role-aware.serializer.ts`, `template-columns.ts` |
| `backend/src/actors` | `actors.service.ts`, `admin-actor.serializer.ts`, `dto/*` |
| `backend/src/registrations` | `admin-registrations.service.ts` (approval projection) |
| `backend/prisma` | schema + migration |
| `frontend` | `components/profile/*`, `lib/api/actors.ts`, `lib/dashboard/csv.ts`, `components/admin/ActorForm.tsx` |
| Archived specs | `actors/registration-source-and-consent`, `actors/public-self-registration`, `admin/registration-review-queue`, `import-export/partner-profile-onboarding` — frozen records whose PII assertions this change supersedes. **Do not edit them**; the superseding decision lives here and in the TRD. |

## 8. Visual Reference

- **Source:** None — no Figma or mockup supplied.
- **Location:** n/a
- **Notes:** The visual precedent already exists in-repo: `ProfileLocation` renders a labelled `<dl>` grid on `bg-surface-alt` with `border-border`, and the new contact section reuses it verbatim. The only genuinely new visual decision is whether `--color-restricted-bg` retains a purpose once nothing is restricted. A mockup is available on request but judged low value for a section that copies an existing pattern.

## 9. Requirement Delta Preview

### ADDED

- `Actor` carries `contactPerson` and `otherCrops`; both are written on registration approval and on Excel import.
- The public actor contract (`GET /api/v1/actors/:id`, `GET /api/v1/actors`) includes `phone`, `email`, `sex`, `position`, `marketLocation`, `contactPerson`, `otherCrops` for `GRANTED` actors.
- The public dashboard CSV exports those columns **minus the contact block (amended 2026-09-04, OQ-5 — the exclusion is current, not superseded)**.
- The import template carries `Contact Person` and `Other Crops` at `TEMPLATE_VERSION = 'v3'`.

### MODIFIED

- `PII_ALLOWLIST` becomes empty; `technicalSupport` relocates to `NEVER_PUBLIC_FIELDS`.
- `src/test/pii-boundary.spec.ts` asserts presence-when-`GRANTED` for the newly public fields instead of unconditional absence.
- PRD AC-1 / AC-6, the "0 PII fields exposed" success metric, US-1, the persona table, TRD ADR-003 and QA-1, and the `CLAUDE.md` hard constraint are restated around consent rather than around field identity.
- `docs/ux-ui/design.md` principle 3 and DD-2 ("PII shows as an explicit Restricted chip") no longer describe the actor profile.

### REMOVED

- `RestrictedContactPanel` and the always-locked state it renders.
- The DD-18 compile-time barrier that made publishing `contactPerson` a type error.

## 10. Approach Options

| Option | What it is | Cost | Verdict |
|---|---|---|---|
| **A — Single coherent change** | All five layers move together in one spec: migration, template v3, policy inversion, gate inversion, UI, docs. | ~4 days | **Recommended.** The layers are cross-referencing; splitting them leaves the repo asserting contradictory things about itself between merges. |
| **B — Phased (columns first, migration later)** | Chunk 1 publishes only fields that already have columns (no migration, no template bump, ~2 days). Chunk 2 adds `contactPerson`/`otherCrops`. | ~2 + ~2 days | Viable if you need value sooner. But chunk 1 ships a registry that still discards a **mandatory** form field, so §2's rule stays unmet and the docs must be edited twice. Choose only if schedule pressure is real. |
| **C — Consent tiers** | Introduce a per-field or per-tier consent model (basic / full disclosure) instead of one binary flag. | ~2 weeks+ | **Rejected.** No one asked for per-field consent, there is no UI to collect it, and it multiplies the state the release gate must prove. Revisit only if legal returns a tiered policy. |

## 11. Recommended Approach

**Option A**, executed in this dependency order so the tree is never internally inconsistent for long:

1. **Migration + approval path + template v3** (the only irreversible piece; do it first, alone, so a rollback point exists).
2. **Policy + serializer + Prisma select.**
3. **Release-gate inversion** — before any UI work, so the boundary is proven before it is exposed.
4. **Profile panel + public CSV.**
5. **Constitutional docs, all five documents in one commit** so no reviewer ever sees half a policy.

The `tdd` skill is warranted on steps 2 and 3 (a PII boundary is exactly the correctness-critical, business-rule work it is meant for) and is pure overhead on steps 1, 4, and 5.

## 12. Risks, Dependencies, And Open Questions

| # | Risk | Mitigation |
|---|---|---|
| **R-1** | **The public CSV becomes a bulk contact-extraction surface** — one click yields every published phone and email in the filtered view, for 1,000+ actors. This is a materially different exposure from showing one contact on one profile, and it is the single largest consequence of this change. | **RESOLVED 2026-09-04 — mitigation (b) adopted:** the contact block is omitted from the CSV while staying on the profile. The one-click bulk path is closed; the residual scripted-pagination path is stated in `requirements.md` NFR-6 and deliberately not pre-solved. |
| **R-2** | **The inverted release gate stops being a gate.** A suite rewritten to assert presence can pass while the consent filter is broken. **KZ-002 ×4** — a gate that cannot fail is not a gate. | The inverted suite must be shown to **redden** when the `consentStatus: GRANTED` pin is removed from the Prisma `WHERE`, demonstrated against the pre-change state, not argued. Non-`GRANTED` absence assertions are the half that must stay strongest. |
| **R-3** | **Five-layer incoherence.** A partial merge leaves code and constitution contradicting each other, and the next `/akili-audit` reverts the change as drift. | Docs land in the same spec, in one commit (step 5). The `docs/ux-ui/design.md` layer is the one most easily forgotten — it was missed in the initial scoping of this very proposal. |
| **R-4** | **DD-18's rationale is deleted rather than replaced.** **KZ-008** — an assertion about an artefact is a defect when the artefact no longer bears it. | The reversal rewrites the comment in `AdminRegistrationsService.approve` to record that publishing `contactPerson` is now intended, by whom, and when — and keeps the narrower guard that `position` never falls back to `contactPerson`. |
| **R-5** | **Template v3 invalidates workbooks already downloaded** by the Tanzania team; stale-template detection will start rejecting them. | Deliberate and detectable, not silent. Needs an operational note for the team and a check of the stale-template error copy. |
| **R-6** | **Consent text does not yet describe what is published.** The `[PLACEHOLDER]` policy's own *"How it is published"* section is unwritten, and existing `GRANTED` actors consented under it. | **Accepted risk, user decision, owner = programme/legal.** Recorded here so it is a known open item and not a discovery. Legal's wording will need a `CONSENT_POLICY_VERSION` bump in a later change. |
| **R-7** | Excel-imported `email` is unverified free text, while self-registered `email` is OTP-verified. Publishing both equally publishes unverified addresses. | Low severity; note it in requirements. No mitigation proposed in this scope. |

### Open Questions

| # | Question | Recommendation |
|---|---|---|
| **OQ-1** | `PII_ALLOWLIST` becomes empty. Keep it as an empty documented constant, or delete it? | **Keep it, empty, with a comment.** It is the designated one-edit point if legal ever re-restricts a field, and `pii-boundary.spec.ts` iterates the union of both constants. Deleting it removes the seam this whole design was built around. |
| **OQ-2** | ~~Publish `otherCrops`, or store it without publishing?~~ **RESOLVED 2026-09-04 (Daniela Gómez): publish.** | **Publish.** It is actor-declared free text about their own operation, so it passes the §2 rule — unlike `technicalSupport`. No longer open; §5.1's "confirm, OQ-2" note is discharged. |
| **OQ-3** | Actors already imported from Excel have no `contactPerson` (the column does not exist yet). | Renders as `—` until re-imported. Acceptable under §5.3. No backfill proposed. |
| **OQ-4** | Does `--color-restricted-bg` survive, and do design.md's principle 3 / DD-2 keep any subject once the profile no longer restricts anything? | Decide during specify; the token may still serve the admin console. Do not delete a token that other surfaces reference. |

## 13. Success Criteria

- [ ] An anonymous `GET /api/v1/actors/:id` for a `GRANTED` actor returns every field in §5.1's "Public after = yes" column, and none of the "no" column.
- [ ] The same request for an `UNKNOWN` or `DENIED` actor returns `404`, and no public path emits any field of that actor — proven over HTTP.
- [ ] The inverted `pii-boundary.spec.ts` **fails** when the `consentStatus = GRANTED` pin is removed (gate demonstrated, per KZ-002).
- [ ] A public registration submitted end-to-end and approved shows its `contactPerson` on the resulting public profile.
- [ ] A row imported from the v3 template with `Contact Person` populated shows that value on the public profile.
- [ ] The public dashboard CSV contains the **export set** and no `NEVER_PUBLIC_FIELDS` member **and no member of the contact block (amended 2026-09-04)**.
- [ ] `CLAUDE.md`, `docs/prd.md`, `docs/trd/trd.md`, and `docs/ux-ui/design.md` contain **zero** surviving statements that phone/email are withheld from `Public`.
- [ ] `cd backend && npm test -- --silent`, `cd frontend && npm test -- --silent`, and both builds pass.

## 14. Next Step

```text
/akili-specify actors/public-profile-disclosure
```
