# Requirements — Admin Bulk Actor Operations

- Spec path: docs/specs/admin/bulk-actor-operations/
- Status: Draft
- Author / Date: SDD (Leader) — 2026-07-01
- Related: docs/prd.md (Admin bulk capabilities, US-6/US-7); docs/system-design/design.md §2 (IA `/admin/actors`), §5 (admin shell), §8 (PII/consent), §10 (a11y); docs/detailed-design/detailed-design.md §4 (actor write endpoints), §8 (RBAC/consent); proposal.md; archived `2026-07-01-admin--user-management` (reusable admin foundation)

## 1. Summary

The second admin module: an Admin-only `/admin/actors` console to manage the actor registry in bulk. An Admin views **all** actors (any consent status, with PII), selects many, and applies a bulk **lock/unlock** (set `consentStatus` to control public visibility) or **delete**. Because unlocking publishes an actor's PII + GPS, unlock requires a typed consent acknowledgement. This introduces the first actor write endpoints and reuses the admin foundation from `admin/user-management` (shell, guards, `apiFetch`, `ConfirmDialog`, CORS). It advances the PRD's Admin bulk capabilities and the system-design `/admin/actors` IA.

## 2. Requirement Numbering & Writing Standards

- Functional: `FR-1…`; non-functional: `NFR-1…`. Atomic, testable, traceable to design + tasks.
- MUST / SHOULD / MAY per RFC 2119.
- RBAC roles: `Public` / `Staff` / `Admin` (Cognito groups). PII = `phone`, `email`, `sex`, `position`, `marketLocation`, `technicalSupport` (`pii-consent.policy.ts`). AWS commands use `--profile IBD-DEV`.

## 3. Glossary

- **Actor** — a seed-system registry record (`Actor` Prisma model): trader/company/cooperative with location, crops, capacity, PII, GPS, and a `consentStatus`.
- **`consentStatus`** — `GRANTED | DENIED | UNKNOWN` (default `UNKNOWN`). **Only `GRANTED` is publicly visible.** The sole gate for public directory/map/metrics visibility — there is no separate lock/publish flag.
- **Lock / Unlock** — Lock = set `consentStatus` to `DENIED` (hide from public); Unlock = set to `GRANTED` (publish to public).
- **Bulk operation** — a single request applying one change to many selected actor ids, transactionally, returning a per-id result.
- **Admin surface** — the Admin-gated `/admin/actors` UI + its `/api/v1/actors/...` Admin routes; the only place PII of non-consented actors is exposed.

## 4. System Context & Scope

**In scope:** an Admin-only list of all actors (any consent status, PII visible); bulk set-consent (lock/unlock) and bulk delete endpoints (transactional, per-item result); a typed consent acknowledgement on unlock; the `/admin/actors` selectable table + bulk-action bar; activation of the Actors sidebar item.

**Out of scope (see §9).**

## 5. Stakeholders / Personas

- **Admin operator** — curates the registry: publishes (unlocks) consented actors, hides (locks) or removes bad/duplicate records. Primary user.
- **Public / Staff** — unaffected; still see only consented actors via the unchanged public API.
- **Compliance reviewer** — relies on the consent acknowledgement + strict Admin gating of PII.

## 6. Functional Requirements

### FR-1: Admin actor list (all consent statuses, PII)
- **Description:** The system SHALL provide an Admin-only endpoint returning **all** actors regardless of `consentStatus` (incl. `DENIED`/`UNKNOWN`), with PII fields and `consentStatus` included, paginated (page size bounded, `@Max(100)` convention) and filterable by region, trader type, and consent status. The existing public `GET /api/v1/actors` MUST remain consent-gated and unchanged.
- **Rationale / Source:** proposal §4/§5; system-design §2 (`/admin/actors`); PRD Admin CRUD.
- **Acceptance (Given/When/Then):**
  - GIVEN an authenticated Admin, WHEN they request the admin actor list, THEN actors of every consent status are returned with PII + `consentStatus`, paginated.
  - GIVEN a Staff or Public/anonymous caller, WHEN they request the admin list, THEN 403 (Staff) / 401 (unauthenticated).
  - GIVEN the public `GET /api/v1/actors`, WHEN called, THEN it still returns only `GRANTED` actors with PII hidden (unchanged).
- **PII/RBAC:** Admin only; returns PII — any non-Admin access is a release blocker.

### FR-2: Multi-select
- **Description:** The `/admin/actors` table SHALL let an Admin select individual rows and "select all on the current page", and SHALL show the count of selected actors. Bulk actions operate on the current selection.
- **Acceptance:**
  - GIVEN the admin actor table, WHEN an Admin selects rows, THEN a bulk-action bar appears showing the selected count.
- **PII/RBAC:** Admin only.

### FR-3: Bulk set consent (lock / unlock)
- **Description:** The system SHALL provide an Admin-only endpoint to set `consentStatus` to `GRANTED` (unlock) or `DENIED` (lock) for a set of actor ids in one transactional request, returning a per-id result (updated / not-found / failed). The change MUST take effect on public reads immediately.
- **Rationale / Source:** proposal §4; the "bulk lock" ask.
- **Acceptance:**
  - GIVEN an Admin and a set of ids, WHEN they bulk-unlock, THEN each existing id's `consentStatus` becomes `GRANTED` and those actors appear in the public directory/map/metrics; a per-id result is returned.
  - GIVEN a bulk-lock, WHEN applied, THEN the ids become `DENIED` and disappear from public reads.
  - GIVEN an unknown id in the set, WHEN applied, THEN that id is reported not-found and the rest still succeed (per-item result); the operation is transactional per the design's integrity rule.
  - GIVEN a `consentStatus` value other than `GRANTED`/`DENIED`, WHEN submitted, THEN 400.
- **PII/RBAC:** Admin only. Drives public PII/GPS exposure — see FR-4.

### FR-4: Consent acknowledgement on unlock
- **Description:** Because unlocking publishes an actor's PII + GPS, the unlock action SHALL require an explicit **typed acknowledgement** (Admin confirms consent is on file for the selected actors) before the request is sent; the acknowledgement MUST be recorded with the action (who + when). Locking and delete do not require this acknowledgement (they reduce exposure) but delete requires its own confirmation (FR-5).
- **Rationale / Source:** proposal §11 (OQ-3 resolved); consent policy is provisional pending legal sign-off.
- **Acceptance:**
  - GIVEN an Admin unlocking actors, WHEN they open the confirm, THEN they MUST type the acknowledgement phrase before the unlock button enables; the recorded action notes the acting Admin + timestamp.
  - GIVEN the acknowledgement is not provided, WHEN they attempt unlock, THEN the action is blocked.
- **PII/RBAC:** Admin only; consent safeguard.

### FR-5: Bulk delete
- **Description:** The system SHALL provide an Admin-only endpoint to permanently delete a set of actor ids in one transactional request (cascading their crop links), returning a per-id result. The UI SHALL require a typed confirmation showing the affected count before deleting.
- **Rationale / Source:** proposal §4; PRD ("delete in bulk" is Admin-only).
- **Acceptance:**
  - GIVEN an Admin and a set of ids, WHEN they confirm bulk delete, THEN those actors (and their `CropsOnActors` links) are removed and a per-id result is returned; deleted actors no longer appear in any read.
  - GIVEN a Staff/Public caller, WHEN they call bulk delete, THEN 403/401.
- **PII/RBAC:** Admin only; irreversible.

### FR-6: Server-side Admin RBAC
- **Description:** Every new admin actor route (list, bulk consent, bulk delete) MUST require an authenticated Admin, enforced server-side via `JwtAuthGuard` + `RolesGuard` + `@Roles('Admin')` — never client-only.
- **Acceptance:**
  - GIVEN any new admin actor route, WHEN called without a token → 401; by Staff/Public → 403; by Admin → allowed.
- **PII/RBAC:** Core gate; any gap is a release blocker.

### FR-7: PII containment & public read unchanged
- **Description:** PII (and non-consented actors) MUST be exposed only through the Admin-gated routes/serializer; the public `GET /api/v1/actors[/:id]` behavior (consent-gated, PII-hidden) MUST be unchanged and covered by the existing PII-boundary tests. Admin responses MUST be built via an explicit Admin serializer, and admin routes MUST NOT be publicly cacheable.
- **Acceptance:**
  - GIVEN the public API after this change, WHEN inspected, THEN it returns only `GRANTED` actors with no PII (existing `pii-boundary.spec.ts` still passes).
  - GIVEN an Admin list response, WHEN inspected, THEN PII + consent are present only there.
- **PII/RBAC:** Defense in depth; mirrors the role-aware serializer pattern.

### FR-8: Bounded batch size
- **Description:** The bulk endpoints SHALL validate the `ids` array (non-empty, unique, each a valid id) and cap the batch size at a bounded maximum (to finalize in design, ~≤500). Over-limit requests → 400.
- **Acceptance:**
  - GIVEN a bulk request with more than the cap, WHEN submitted, THEN 400 with a clear message.
  - GIVEN an empty/invalid ids array, WHEN submitted, THEN 400.
- **PII/RBAC:** Admin only; protects the single Lambda invocation.

### FR-9: `/admin/actors` console
- **Description:** The frontend SHALL provide an Admin-gated `/admin/actors` page in the `(admin)` shell (activating the Actors sidebar item) with: a selectable table (all actors, consent status shown, PII visible), search/filter (region, type, consent), a bulk-action bar (Unlock · Lock · Delete) shown on selection, count-confirmations (typed acknowledgement on unlock, typed confirm on delete), and loading/disabled/error/empty/result-summary states (N updated, M failed).
- **Acceptance:**
  - GIVEN an Admin, WHEN they open `/admin/actors`, THEN all actors render with selection + filters.
  - GIVEN a non-Admin, WHEN they navigate there, THEN redirect to `/login` (client guard) AND the API independently rejects (FR-6).
  - GIVEN a completed bulk action, WHEN it returns, THEN a result summary is shown and the table refreshes.
- **PII/RBAC:** Admin only; UI gate is convenience, the API (FR-6) is authoritative.

## 7. Non-Functional Requirements

- **NFR-1 (Security / least privilege):** Admin-only server-side on all new routes; PII/non-consented actors only in the admin surface; no new AWS IAM (actor writes hit MySQL via Prisma); inputs validated via DTOs. Any violation is a FAIL.
- **NFR-2 (Static export preserved):** admin pages `'use client'`; no SSR/route handlers; API is the authoritative guard.
- **NFR-3 (Accessibility — WCAG 2.1 AA):** selectable table + dialogs keyboard-operable, labeled controls, visible focus, live-region results; design tokens only.
- **NFR-4 (Transactional integrity & errors):** each bulk operation is atomic per the design's integrity rule (no partial corruption, AC-5 spirit); per-item result reporting; correct HTTP codes (400/403/404); no secret/PII in logs.
- **NFR-5 (Tests):** backend unit/e2e cover RBAC (401/403/2xx), bulk consent (public visibility flips), bulk delete (cascade), batch bounds, and that the public read + PII boundary are unchanged. Frontend tests cover the gated page, selection, and the confirm/acknowledgement gating. `npm test` (backend + frontend) green.
- **NFR-6 (Performance):** admin list paginated (`@Max(100)`); bulk batch bounded; a full-registry bulk (~436, target 1,000+) completes within one Lambda invocation.

## 8. Data & Schema Impact

**No schema change** — bulk operations write the existing `Actor.consentStatus` and delete `Actor` rows (cascading `CropsOnActors`). No new columns/tables. No new PII fields; the `PII_ALLOWLIST` is unchanged. (The consent acknowledgement is recorded at the action/audit level, not as an actor column — see design.)

## 9. Out of Scope

- **Bulk field-edit** (region/crop reassignment) — deferred follow-on. [OQ-1]
- **Single-actor create/edit** (`/admin/actors/new`, `/[id]/edit`) — separate sibling spec. [OQ-2]
- **CSV bulk import** — separate `admin/import` spec (existing `ImportModule`, legal-gated).
- **CSV export** — separate `admin/export` spec.
- **A new lock/publish column** — v1 uses `consentStatus`.
- **Undo/soft-delete/restore** — delete is permanent in v1.

## 10. Dependencies & Assumptions

- Reuses the admin foundation (archived `admin/user-management`): `(admin)` shell, `RequireRole`, `apiFetch` (Bearer), `@Roles('Admin')` guard stack, `ConfirmDialog`, admin table pattern, `ValidationPipe`.
- Reuses `actors` module + `pii-consent.policy.ts` + role-aware serializer; extends with admin routes/serializer.
- **No infra change** — CORS already allows `POST/PATCH/DELETE`; actor writes are DB-only (no new IAM). Deploy uses `--profile IBD-DEV`.

## 11. Open Questions

Resolved at proposal approval:
- **OQ-1 → Lock/unlock + delete** (bulk field-edit deferred).
- **OQ-2 → Bulk-only** (single CRUD split to a sibling spec).
- **OQ-3 → Typed acknowledgement** on unlock.

For design confirmation:
- **OQ-4:** exact batch-size cap (default ~≤500) and whether the consent acknowledgement is persisted to an audit log now or just recorded in the action response/logs (audit-log persistence was deferred in user-management OQ-3).

## 12. Requirement ID Index

| ID | Title | Type |
|---|---|---|
| FR-1 | Admin actor list (all statuses, PII) | Functional |
| FR-2 | Multi-select | Functional |
| FR-3 | Bulk set consent (lock/unlock) | Functional |
| FR-4 | Consent acknowledgement on unlock | Functional |
| FR-5 | Bulk delete | Functional |
| FR-6 | Server-side Admin RBAC | Functional |
| FR-7 | PII containment & public read unchanged | Functional |
| FR-8 | Bounded batch size | Functional |
| FR-9 | `/admin/actors` console | Functional |
| NFR-1 | Security / least privilege | Non-functional |
| NFR-2 | Static export preserved | Non-functional |
| NFR-3 | Accessibility (WCAG 2.1 AA) | Non-functional |
| NFR-4 | Transactional integrity & errors | Non-functional |
| NFR-5 | Test coverage | Non-functional |
| NFR-6 | Performance / pagination | Non-functional |

---
**Conventions reminder:** roles `Public`/`Staff`/`Admin`; PII server-side protection; static export (no SSR); AWS `--profile IBD-DEV`; consent (`GRANTED`) is the public-visibility gate.
