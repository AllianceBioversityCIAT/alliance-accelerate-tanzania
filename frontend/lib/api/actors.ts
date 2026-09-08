/**
 * Actors API contract + getters — design.md §5, §6, §9, DD-2, DD-6.
 *
 * T-13 (`actors/public-profile-disclosure`, design.md §9 DD-6) splits the
 * single PublicActor shape into two, mirroring the backend's
 * `PublicActorListItem` / `PublicActorDetail` split in
 * `backend/src/common/role-aware.serializer.ts`:
 *
 *   - {@link PublicActorListItem} — the LIST set (`GET /api/v1/actors`,
 *     FR-9). `PublicActor` is kept as an ALIAS for it so the directory, map,
 *     dashboard, and CSV — the 45 existing consumers — compile unchanged
 *     AND structurally lose the ability to name a contact field.
 *   - {@link PublicActorDetail} — the PUBLISHED set (`GET
 *     /api/v1/actors/:id`, FR-1): the list set plus the contact block
 *     (`contactPerson`, `position`, `phone`, `email`, `marketLocation`).
 *     Consumed ONLY by {@link getActor} / `useActor` and the profile.
 *
 * getActors()/getActor() NEVER throw — return null on any failure (DD-6 /
 * NFR-5: resilient null-on-failure). Components that consume them render an
 * empty/error state when data is null.
 */

import { apiGet } from './client';

// ── Types (design.md §5, §9, DD-2, DD-6 — role-aware public shapes: the
// list set is PII-safe; the detail set additionally discloses the contact
// block for a GRANTED actor, per consent, not blanket exposure) ─────────

/**
 * The LIST set — what `GET /api/v1/actors` returns, and therefore all the
 * directory, map, dashboard, and CSV can ever carry (FR-9). `sex` and
 * `otherCrops` are members here, not in the contact block — see design.md
 * §12 DD-6 / requirements.md's glossary for why that is not inferable from
 * UI or schema adjacency.
 */
export interface PublicActorListItem {
  id: string;
  traderName: string;
  region: string;
  // `district`, `capacityTons`, and `gps` are PRE-EXISTING divergences from
  // the backend's required-nullable declarations (role-aware.serializer.ts
  // always emits `null` rather than omitting these fields) — they predate
  // T-13 and are NOT yet swept to match. `sex` and `otherCrops` below are
  // the correct convention going forward: required, `| null`, mirroring the
  // backend exactly. Do not use the optional-key shape above as a model for
  // new fields.
  district?: string | null;
  traderType:
    | 'seed_company'
    | 'cooperative'
    | 'ngo'
    | 'offtaker'
    | 'research_institute'
    | 'informal_trader'
    | 'humanitarian'
    | 'digital_service_provider'
    | 'qds_producer'
    | 'bulk_buyer';
  capacityTons?: number | null;
  crops: ('sorghum' | 'common_bean' | 'groundnut')[];
  gps?: { lat: number; long: number } | null;
  // Required and `| null` here, mirroring the backend's
  // `PublicActorListItem` exactly (role-aware.serializer.ts §FR-1: the field
  // is never omitted, so the frontend contract must not say it may be
  // absent). See design.md §12 DD-6 / requirements.md's glossary for why
  // `sex` and `otherCrops` are members of the LIST set and not the contact
  // block.
  sex: string | null;
  otherCrops: string | null;
}

/**
 * `PublicActor` is an ALIAS for the list set (DD-6) — load-bearing, not
 * laziness. The 45 existing consumers keep compiling against this name
 * unchanged, and because the alias resolves to the list shape, none of them
 * can name a contact-block field: `actor.phone` is a compile error anywhere
 * this alias is used.
 */
export type PublicActor = PublicActorListItem;

/**
 * The PUBLISHED set — what `GET /api/v1/actors/:id` returns for a `GRANTED`
 * actor (FR-1): the list set plus the contact block. Never returned by the
 * list path (FR-9). Consumed only by {@link getActor} / `useActor` and the
 * profile — never widen a list-typed consumer to this shape.
 */
export interface PublicActorDetail extends PublicActorListItem {
  contactPerson: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
  marketLocation: string | null;
}

export interface ActorsQuery {
  crop?: string;
  role?: string;
  region?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  capacityMin?: number;
  capacityMax?: number;
  district?: string;
}

export interface PublicActorList {
  data: PublicActor[];
  page: number;
  pageSize: number;
  total: number;
}

// ── Getter ──────────────────────────────────────────────────────────────────

/**
 * Fetch a paginated, filtered list of public-safe actors from the API.
 *
 * Builds a querystring from any defined fields in `query`; undefined/null
 * fields are omitted so the endpoint receives only the filters provided.
 *
 * Returns a typed PublicActorList on success, or null on ANY failure
 * (missing env var, network error, non-OK response, parse error).
 * This is the DD-6 / NFR-5 contract: callers never need their own try/catch.
 */
export async function getActors(query?: ActorsQuery): Promise<PublicActorList | null> {
  try {
    // Build querystring from defined fields only (omit undefined/null)
    const params = new URLSearchParams();
    if (query) {
      if (query.crop      != null) params.set('crop',     query.crop);
      if (query.role      != null) params.set('role',     query.role);
      if (query.region    != null) params.set('region',   query.region);
      if (query.search    != null) params.set('search',   query.search);
      if (query.page        != null) params.set('page',        String(query.page));
      if (query.pageSize    != null) params.set('pageSize',    String(query.pageSize));
      if (query.capacityMin != null) params.set('capacityMin', String(query.capacityMin));
      if (query.capacityMax != null) params.set('capacityMax', String(query.capacityMax));
      if (query.district    != null) params.set('district',    query.district);
    }
    const qs = params.toString();
    const path = qs ? `/api/v1/actors?${qs}` : '/api/v1/actors';

    return await apiGet<PublicActorList>(path);
  } catch {
    // Intentionally swallow all errors (DD-6 / NFR-5).
    // The component layer renders a graceful empty/error state when data is null.
    return null;
  }
}

/**
 * Fetch a single actor by id from the API — public detail read, disclosing
 * the contact block only when that actor consented (`GRANTED`).
 *
 * Returns a typed PublicActorDetail on success — the published set,
 * including the contact block (FR-1, DD-6) — or null on ANY failure,
 * including a 404 when the id is absent or not consented (null-on-failure,
 * NFR-7). `apiGet` throws on any non-OK response, so a 404 surfaces here as
 * a caught error and is collapsed to null, just like network/parse
 * failures. The component layer renders a graceful not-found/error state
 * when data is null.
 */
export async function getActor(id: string): Promise<PublicActorDetail | null> {
  try {
    return await apiGet<PublicActorDetail>(`/api/v1/actors/${id}`);
  } catch {
    // Intentionally swallow all errors, including 404 (NFR-7).
    return null;
  }
}
