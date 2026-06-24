# Proposal — Actor Directory + Profile (and the path to the Admin/Validation console)

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `actors/directory` |
| Type | Feature (frontend directory + profile) — first phase of a 3-part vision |
| Status | Draft — awaiting approval |
| Author / Date | JuanCode / 2026-06-24 |
| Source | 4 mockups: (1) Actor Directory, (2) Profile — consent verified, (3) Profile — consent pending, (4) Data Maintenance & Validation console |
| Constitutional refs | prd.md (US-1, US-4, US-5, US-8; features 1/2/4/5; AC-1/AC-2); detailed-design §3 (Actor), §4 (API), §8 (RBAC/PII); system-design §4/§5/§7 |
| Consumes | archived `seed-map/actor-data-model` (`GET /api/v1/actors` list + detail, role-aware serializer, consent gating); resolves the `seed-map/discovery-map` `/directory` placeholder (DD-5/OQ-1) |

## 2. Intent

Build the **Actor Directory** and **Actor Profile** screens (mockups 1–3): a searchable, filterable, paginated directory of seed-system actors and a standardized profile page per actor, with **consent- and role-gated** sensitive data (contact/commercial info unlocked only when an actor has verified consent, locked otherwise). This is the natural next screen after the Discovery Map — its popups already link "View Profile → `/directory`". The mockups also reveal an authenticated **Admin "Data Maintenance & Validation" console** (mockup 4) and a logged-in user (Amina Mushi, *Data Officer*) — i.e. the full vision pulls in **Cognito auth, RBAC, write/edit APIs, and a consent-verification/publish workflow**. This proposal recommends delivering the **public directory + profile first** and treating the **authenticated admin console (+ auth wiring)** as a clearly-separated follow-up.

## 3. Problem / Current Behavior

- The Discovery Map ships with a **dead-end placeholder**: actor popups and "View Profile" link to `/directory`, which does not exist yet.
- There is **no directory and no profile page** — the only public surfaces are the home page and the map. PRD US-1 ("browse a paginated directory… search by name/region/crop… without seeing phone/email") is unmet.
- The backend already serves what a public directory/profile needs: `GET /api/v1/actors` (paginated, filterable list) and `GET /api/v1/actors/:id` (detail), both PII-safe and consent-gated by the role-aware serializer. **No public UI consumes the detail endpoint yet.**
- The mockups show capabilities that **do not exist**: an authenticated session (login), role-aware PII unlock, a **consent-verification** state machine (Verified / Pending / Demo), an editable record form with a **validation checklist**, "**Trigger Consent Request Workflow**", and "**Approve & Publish to Central Hub**". These require **Cognito auth + RBAC + write endpoints + a consent workflow** — none of which are built (auth was deferred; the import/write paths are legal-gated).

## 4. Proposed Outcome

**Phase 1 (this spec — `actors/directory`):** the **public, read-only** Directory + Profile.
1. **`/directory`** — search (name/region/crop) + crop/role/region filters + paginated card grid (mockup 1), consuming the existing `getActors` client. Page size 20 (PRD OQ-5).
2. **`/directory/[id]`** (or `/actors/[id]`) — a standardized **Actor Profile** page (mockups 2/3): geographic location, market activity (crops), operational capacity, and a **"Contact & Commercial Data" panel that is consent-gated** — for the public, sensitive contact/commercial data is **never shown** (locked state with a clear "consent/restricted" message), exactly mirroring the mockup-3 "locked" treatment. Consent-verified actors still show only the PII-safe projection to the public.
3. Resolves the map's `/directory` placeholder — popups deep-link to a real profile.

**Phase 2 (recommended follow-up spec(s)):** the **authenticated** experience — Cognito sign-in, `Staff`/`Admin` RBAC, role+consent-based **PII unlock** on profiles (mockup 2 "Unlocked … verified consent on file"), and the **Data Maintenance & Validation console** (mockup 4): editable record form + validation checklist + consent verification + "Trigger Consent Request Workflow" + "Approve & Publish". This is the legal-gated, write-capable surface and is intentionally **out of scope here**.

## 5. Scope (Phase 1)

- `/directory` route in the existing `(public)` shell: search input, crop/role/region selects, "N organizations found", responsive card grid, pagination.
- `/directory/[id]` profile route: header (name, role badge, region·district, consent badge), geographic location, market activity (crop chips/varieties), operational capacity (capacity tons; other stats only if the public contract exposes them), and the **locked** Contact & Commercial panel for the public.
- Reuse the deployed `GET /api/v1/actors` (list + detail). Add a typed `getActor(id)` to the existing `lib/api/actors.ts` if the detail client isn't there yet.
- Token-driven (System Design §7); a11y (labeled controls, keyboard, focus); responsive; loading/empty/error states (consistent with the map/home patterns); no PII in any public response or the DOM.

## 6. Non-Goals (Phase 1)

- **Authentication / Cognito sign-in**, sessions, the user menu (mockup 4 top-right), and any `Staff`/`Admin` surface — **Phase 2**.
- **Role/consent-based PII unlock** (mockup 2 "Unlocked" contact data) — requires auth; Phase 2.
- The **Data Maintenance & Validation console** (mockup 4): record editing, validation checklist, **consent verification**, **Trigger Consent Request Workflow**, **Approve & Publish to Central Hub** — Phase 2 (write API + consent state machine + legal gate).
- Any **write/CRUD** endpoints, CSV import/export, user management.
- The "DEMO / Verified / Pending" preview toggle (a demo affordance tied to the authenticated profile).

## 7. Affected Users, Systems, And Specs

- **Users:** Public visitors (browse/search/inspect, no PII) now; Staff/Admin (PII unlock + validation) in Phase 2.
- **Constitutional docs:** realizes PRD features 1–2 and US-1 now (features 4–5, US-4/5/8 in Phase 2); upholds detailed-design §8 PII/RBAC and the consent model.
- **Code:** new `frontend/app/(public)/directory/` (+ `[id]`) routes and `components/directory/*`; reuses `lib/api/actors.ts`, `lib/content/{roles,crops,regions}`, `RoleBadge`, the shell, §7 tokens. Backend: consumes the existing `/api/v1/actors` (a small `findOne` shape check may be needed; no new endpoints expected for Phase 1).
- **Specs:** builds on archived `seed-map/actor-data-model`; resolves `seed-map/discovery-map` DD-5/OQ-1; **spawns** a recommended Phase-2 spec (working name `admin/data-validation` or `actors/admin-console`) and depends on a future **auth-wiring** spec (Cognito Hosted UI / token handling) that `seed-map/actor-data-model` and the infra Cognito resources deferred.

## 8. Requirement Delta Preview

### ADDED (Phase 1)
- Public `/directory` — searchable (name/region/crop), filterable (crop/role/region), paginated (20/page) card grid over `GET /api/v1/actors`.
- Public `/directory/[id]` — Actor Profile page; consent-gated **locked** Contact & Commercial panel for the public (no PII).
- `getActor(id)` typed client (if not already present) returning the PII-safe detail or null.

### MODIFIED
- `seed-map/discovery-map` DD-5: "View Profile → `/directory`" placeholder becomes a **real** profile deep-link (`/directory/[id]`).

### DEFERRED (Phase 2, separate spec)
- Cognito auth + `Staff`/`Admin` RBAC; role+consent PII unlock on profiles.
- Data Maintenance & Validation console: edit form, validation checklist, consent verification, consent-request workflow, approve & publish.

## 9. Approach Options

**Option A — Phased: public Directory+Profile now, Admin/auth as a follow-up (Recommended).** Ship the unauthenticated directory + profile on the already-deployed public API; spec the auth + admin console separately. *Pros:* immediate visible value, resolves the dead `/directory` link, zero new backend/auth, small blast radius, keeps the legal-gated write/consent workflow isolated. *Cons:* the "unlocked PII" and admin screens wait for Phase 2.

**Option B — One big spec covering all 4 mockups.** Directory + profile + auth + admin console + consent workflow in one. *Pros:* one thread to the full vision. *Cons:* couples public read to Cognito auth, RBAC, write APIs, and a legal-gated consent state machine; very large; the auth/write/legal surface dominates and stalls the quick public win.

**Option C — Public directory only (no profile page).** Just the list. *Pros:* smallest. *Cons:* leaves the map's "View Profile" link still dead; profile is the higher-value half.

## 10. Recommended Approach

**Option A.** The directory + profile is the smallest safe path that (a) resolves the Discovery Map's `/directory` placeholder, (b) satisfies PRD US-1 and the Actor Profiles Module on the **already-deployed** public API with no new auth or backend, and (c) keeps the **authenticated, legal-gated** admin/consent-workflow surface — which genuinely needs Cognito wiring, RBAC, write endpoints, and a consent state machine — in its own spec where the legal gate can be managed. Recommend immediately following this with an **auth-wiring** spec (Cognito Hosted UI + token/role plumbing — the piece deferred by the infra Cognito provisioning), then the **admin/data-validation** console spec.

## 11. Risks, Dependencies, And Open Questions

- **OQ-1 (profile fields vs public contract):** mockup-2 shows contact, indicative pricing, revenue band, distribution outlets, districts reached. The public `PublicActor` contract today has **none** of these (PII-safe subset only). Phase 1 renders only what the public contract exposes; the rich/commercial fields are **authenticated-only** (Phase 2) and may require backend model/serializer additions.
- **OQ-2 (consent display for public):** the public `/actors` currently returns **GRANTED-only** actors. Should the public directory therefore show *only* consented actors (so mockup-3's "pending" card is an **authenticated** view), or should it list non-consented actors with a locked profile? Recommend: public lists consented only; the "pending/locked" treatment is Phase 2 (authenticated).
- **OQ-3 (route shape):** `/directory` + `/directory/[id]` vs `/actors/[id]`. The map links to `/directory?actor=:id` today (DD-5). Pick one and update the map link.
- **OQ-4 (search backend):** does `GET /api/v1/actors` support a free-text `search` across name/region/district/crop (AC-2, p95<1s), or only the crop/role/region filters? May need a backend `search` param (small add) or client-side refine within a page.
- **Dependency:** Phase 2 needs the **auth-wiring** spec (Cognito Hosted UI/JWT/role plumbing) that infra provisioned the pool/client/groups for but did not wire into the app.
- **Static export:** all new routes must remain static-export-safe (no SSR/route handlers); detail pages are client-rendered against the API (same pattern as the map), or pre-rendered per id only if the id set is known at build (it isn't) — so client-render.
- **Legal gate:** the consent-verification + publish workflow (mockup 4) is the legal-office-gated surface flagged since the seed-map proposal — must stay behind Phase 2 and the gate.

## 12. Success Criteria (Phase 1)

- `/directory` lists actors from the live API with working search + crop/role/region filters + pagination (20/page), an accurate "N found" count, and graceful loading/empty/error states.
- `/directory/[id]` renders a PII-safe Actor Profile; the Contact & Commercial panel shows the **locked** state for the public; **no `phone`/`email`/other PII** appears in any response or the DOM.
- The Discovery Map's "View Profile" links resolve to a real profile page.
- Token-driven, accessible, responsive, static-export-safe; consistent with the home/map patterns.
- A clear, approved Phase-2 plan exists for auth + the admin/validation console (separate spec).

## 13. Next Step

```text
/sdd-specify actors/directory
```
> Recommended: keep this spec to the **public Directory + Profile**; open a separate **auth-wiring** spec and an **admin/data-validation** spec for the authenticated console (mockup 4) — see §10.
