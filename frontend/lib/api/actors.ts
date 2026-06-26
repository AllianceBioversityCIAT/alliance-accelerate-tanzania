/**
 * Actors API contract + getter — design.md §5, §6, DD-2, DD-6.
 *
 * Types mirror the exact PublicActor contract (no PII fields).
 * getActors() NEVER throws — returns null on any failure (DD-6 / NFR-5: resilient null-on-failure).
 * Components that consume getActors() render an empty/error state when data is null.
 */

import { apiGet } from './client';

// ── Types (design.md §5, DD-2 — PII-safe public shape) ────────────────────

export interface PublicActor {
  id: string;
  traderName: string;
  region: string;
  district?: string | null;
  traderType:
    | 'seed_company'
    | 'cooperative'
    | 'ngo'
    | 'offtaker'
    | 'research_institute'
    | 'informal_trader';
  capacityTons?: number | null;
  crops: ('sorghum' | 'common_bean' | 'groundnut')[];
  gps?: { lat: number; long: number } | null;
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
 * Fetch a single public-safe actor by id from the API.
 *
 * Returns a typed PublicActor on success, or null on ANY failure — including
 * a 404 when the id is absent or not consented (null-on-failure, NFR-7).
 * `apiGet` throws on any non-OK response, so a 404 surfaces here as a caught
 * error and is collapsed to null, just like network/parse failures.
 * The component layer renders a graceful not-found/error state when data is null.
 */
export async function getActor(id: string): Promise<PublicActor | null> {
  try {
    return await apiGet<PublicActor>(`/api/v1/actors/${id}`);
  } catch {
    // Intentionally swallow all errors, including 404 (NFR-7).
    return null;
  }
}
