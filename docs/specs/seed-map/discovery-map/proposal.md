# Proposal — Discovery Map + canonical Actor data model (from Partner Profile dataset)

## 1. Document Control

| Field | Value |
|---|---|
| Spec path | `seed-map/discovery-map` |
| Type | Feature (map UI) + foundational data-model finalization |
| Status | Draft — awaiting approval |
| Author / Date | JuanCode / 2026-06-23 |
| Source dataset | `Partner Profile 14.4.2026.xlsx` / `.csv` (436 rows, 18 cols) — **not committed (PII)** |
| Constitutional refs | detailed-design §3 (Actor model), §4 (API), §8 (PII/RBAC); system-design §4/§5/§7; prd.md |
| Legal gate | **Yes** — PII/consent classification can change the model (user-flagged) |

## 2. Intent

Build the **Discovery Map** (the screen in the mockup): an interactive Leaflet map of Tanzania plotting seed-system actors, with a left-rail filterable directory, role-colored pins, an actor detail popup, and privacy zones for non-consented actors. To do this correctly we must first **finalize the canonical Actor data model from the real Partner Profile dataset** — reconciling it with detailed-design §3, the map's needs, and (critically) the legal office's PII/consent rules, which may still change the model.

## 3. Problem / Current Behavior

- There is **no Discovery Map** yet and **no backend** — the home page already consumes `GET /api/v1/metrics`, which is not implemented. The map needs real Actors data (API + DB + import) that does not exist.
- detailed-design §3 defines an Actor model "derived from the existing field dataset," but it was written before the real file was profiled. Profiling the actual `Partner Profile 14.4.2026` data reveals **gaps and tensions** the map design must resolve (below).
- The mockup shows capabilities the **source data does not contain** (crops per actor; a 5-role taxonomy) and privacy behavior the data model does not yet encode (consent, protected GPS zones).

### What the real dataset actually contains (436 rows, profiled — PII redacted)

| Source column | Fill | Notes for the model |
|---|---|---|
| `Trader_id` | 421/436 | Numeric business key (e.g. 1036). 15 rows blank → import must skip/quarantine. Maps to `traderId @unique`. |
| `Trader_name` | 436 (377 distinct) | Often a **person/business name** → personal data candidate. |
| `Region` | 436 (14 distinct) | **Messy:** mostly 10 real regions (Mbeya 70, Kagera 56, Dodoma 47…) plus dirty values (`Arusha/Dodoma`, `Kusini Unguja Region`, singletons) → needs canonicalization. |
| `District` | 434 (34 distinct) | Filter/search. |
| `Trader/processor type` | 435 (**only 2 values**) | `Informal trader/retailer` (255), `Large offtaker` (180). **Does NOT match the mockup's 5-role legend** (Seed Company / Cooperative / NGO / Offtaker / Research Institute). |
| `Sex` | 436 (Male/Female) | Personal attribute → PII candidate. |
| `Position` | 436 | `Owner` (364) / `Manager/Employee` / `Family member` → personal/relational → PII candidate. |
| `Market location` | 436 (153 distinct) | Free text; can pinpoint an individual → PII candidate. |
| `Capacity (volume in t)` | 420 | Decimal (7.5 … 120+). Map/filter on ranges. |
| `Technical support required` | 206 (sparse) | Free text. |
| `phone` | 435 | **PII** (already gated). |
| `Email` | **0** | Empty in this dataset; still PII in schema. |
| `gpslatitude/longitude/altitude/accuracy` | 421/436 | Plottable; 15 rows have no GPS → list-only. Accuracy ~5 m. |
| `Unnamed: 0`, `Unnamed: 1` | — | Spreadsheet artifacts → drop. |
| **(no crop column)** | — | **The source has NO crop field**, yet the map filters/colors by crop. |

## 4. Proposed Outcome

1. A **finalized, legal-gated Actor data model** that exactly maps the real dataset (reconciling detailed-design §3), with explicit, *versioned* handling of: actor-type taxonomy, region canonicalization, the crop gap, a **consent** field, an expanded **PII set**, and a **public-GPS privacy strategy** for non-consented actors.
2. A **Discovery Map** screen consuming a read-only public Actors API: Tanzania Leaflet map, role-colored pins, left-rail filterable list (crop / actor role / region), actor popup ("View Profile"), legend, and **privacy zones** (jittered/aggregated location, "no consent" protected areas as in the mockup).
3. Public responses expose **no PII** (server-enforced role-aware serializer), with exact GPS withheld for actors lacking consent.

## 5. Scope

- Profile-confirmed **Actor schema finalization** (Prisma) + normalization rules (region, traderType, sex) + import dedupe/quarantine on `traderId`.
- A **consent model** + **public-GPS strategy** + **PII allowlist expansion** — drafted as the *recommended* default, explicitly marked provisional pending legal sign-off.
- The **Discovery Map** frontend (Leaflet, static-export-safe) + the **public read API** it needs (`GET /api/v1/actors` with filters; actor detail) — at least enough of `ActorsModule` to serve the map.
- Map ↔ list interaction, filters, legend, privacy zones, empty/loading/error states, a11y (non-map fallback = the list), responsive.

## 6. Non-Goals

- Admin CRUD, auth implementation (Cognito), CSV export, and the full Directory page (separate specs).
- Committing the Partner Profile file or any PII into the repo (import reads from a controlled source).
- Final legal determination of PII/consent — this proposal *drafts* it; legal ratifies it.
- Inventing crop associations not present in source data (see OQ-1).

## 7. Affected Users, Systems, And Specs

- **Users:** Public visitors (map browse, no PII); Staff/Admin (later, richer view).
- **Constitutional docs:** detailed-design §3 (Actor model — will be refined), §4 (Actors API), §8 (PII set + RBAC); system-design §7 tokens / map legend.
- **Code:** new `frontend/` map route + Leaflet components; new NestJS `ActorsModule` (+ import) + Prisma schema + DB. First real backend in the project.
- **Specs:** depends on a backend bootstrap (none exists yet); relates to a future `import-export` and `actors/directory` spec.

## 8. Requirement Delta Preview

### ADDED
- Discovery Map screen (map + filterable list + pins + popup + legend + privacy zones).
- Public `GET /api/v1/actors` (filterable, PII-stripped, consent-aware GPS).
- Actor **`consentStatus`** field + **public-GPS** derivation (jitter/round/hide) for non-consented actors.
- Region canonicalization + traderType normalization rules; import quarantine for incomplete rows.

### MODIFIED
- detailed-design §3 Actor model: confirmed against real columns; PII set likely **expands** beyond `{phone, email}` (candidates: `sex`, `position`, `marketLocation`, exact GPS, possibly `traderName`) pending legal.
- detailed-design traderType: from free string toward a **canonical taxonomy** reconciling the 2 source values with the broader role legend.

### REMOVED / DEFERRED
- Per-actor **crop** association on the map is **blocked** until a crop source is decided (OQ-1) — crop filter/legend may be deferred or seeded.

## 9. Approach Options

**Option A — Two-spec phased split (Recommended).**
Spec A1 = *Actor data model + consent/PII policy + import* (foundational, legal-gated, backend). Spec A2 = *Discovery Map UI* consuming the API. The map UI is designed/built against a stable contract while the legal-sensitive model is ratified in parallel; real PII data only goes live after legal clears. *Pros:* unblocks UI work, isolates the legal gate, smallest risky surface per spec. *Cons:* two specs to track.

**Option B — Single combined spec.**
Model + API + map in one. *Pros:* one thread. *Cons:* couples the legal-gated model to UI delivery; a legal change late forces rework across the whole spec; large blast radius.

**Option C — UI-first with mock data.**
Build the map against seeded/mock actors now; wire the real model/API later. *Pros:* fastest visible progress. *Cons:* risks baking in assumptions the real data/legal rules contradict (crop gap, consent, GPS privacy) — exactly the tensions profiling surfaced.

## 10. Recommended Approach

**Option A (phased split).** The user's core concern — "the model can change based on legal office recommendations" — is best contained by making the **data model + consent/PII its own foundational spec** with a *versioned, provisional* schema and a single PII allowlist the serializer reads, so a legal change is a localized edit, not a cross-feature rewrite. The Discovery Map spec then builds on the agreed contract. Recommend seeding the map with **consented/sample data** until legal ratifies, so UI progress is real but no un-cleared PII is ever exposed.

## 11. Risks, Dependencies, And Open Questions

- **No backend exists** — this is the project's first API + DB + import. Dependency: a minimal NestJS/Prisma/Lambda bootstrap (per detailed-design) must precede or be folded into Spec A1.
- **OQ-1 (crop source) — blocking for the crop filter:** the source file has **no crop column**. Where do per-actor crops come from (a second dataset? actor self-declaration? inference)? Until answered, the map's crop filter/legend is unbacked. (PRD OQ-1.)
- **OQ-2 (actor-type taxonomy):** reconcile the 2 real values (`Informal trader/retailer`, `Large offtaker`) with the mockup's 5-role legend. Is the legend aspirational, or does `traderType` need a canonical enum this dataset only partially fills?
- **OQ-3 (consent — legal-gated):** there is **no consent field** in the source. Default to *no-consent / not-public*? How is consent captured and stored? This governs whether an actor appears on the public map at all (mockup shows "Privacy zone — no consent").
- **OQ-4 (PII classification — legal-gated):** beyond `phone`/`email`, do `sex`, `position`, `marketLocation`, exact GPS, and `traderName` count as protected PII for public exposure? This sets the public projection and the PII allowlist.
- **OQ-5 (public-GPS strategy — legal-gated):** for non/unknown-consent actors, jitter, round to district centroid, or hide exact GPS (the mockup shows protected zones)? Precision vs re-identification.
- **OQ-6 (region canonicalization):** adopt the official Tanzania region list and map dirty values (`Arusha/Dodoma`, `Kusini Unguja Region`, singletons)?
- **Data quality:** 15 rows missing `Trader_id`+GPS → import quarantine; 15 actors un-plottable (list-only).
- **Static export:** Leaflet must run client-side only (no SSR) to preserve NFR-1; tiles from an allowed provider.

## 12. Success Criteria

- A finalized Prisma Actor schema that round-trips the real dataset (import of 436 rows with documented quarantine of incomplete ones), with normalization rules captured.
- A **single PII allowlist** + role-aware serializer such that **no public response exposes** any PII field or exact GPS for non-consented actors (server-enforced, tested).
- Discovery Map renders consented actors as role-colored pins on a Tanzania Leaflet map with a working filterable list, popup, legend, and privacy zones; non-map fallback (list) is accessible; static export still passes.
- Every PII/consent/GPS decision is recorded as a *versioned, legal-ratifiable* choice — a legal change updates the model in one place.

## 13. Next Step

```text
/sdd-specify seed-map/discovery-map
```
> Recommended: split into `seed-map/actor-data-model` (foundational, legal-gated) and `seed-map/discovery-map` (UI) at specify time — see §10.
