/**
 * Metrics API contract + getter — design.md §5, §6, DD-3.
 *
 * Types mirror the exact contract from design.md §5.
 * getMetrics() NEVER throws — returns null on any failure (DD-3: graceful fallback).
 * Components that consume getMetrics() render "—" or a skeleton when data is null.
 */

import { apiGet } from './client';

// ── Types (design.md §5 — exact shape, do not mutate) ──────────────────────

export interface CropMetric {
  slug: 'sorghum' | 'common_bean' | 'groundnut';
  mappedActors: number;
}

export interface Metrics {
  actorsMapped: number;
  cropsTracked: number;
  regionsCovered: number;
  actorTypes: number;
  crops: CropMetric[];
}

// ── Getter ──────────────────────────────────────────────────────────────────

/**
 * Fetch aggregate metrics from the public endpoint.
 *
 * Returns a typed Metrics object on success, or null on ANY failure
 * (missing env var, network error, non-OK response, parse error).
 * This is the DD-3 contract: callers never need their own try/catch.
 */
export async function getMetrics(): Promise<Metrics | null> {
  try {
    return await apiGet<Metrics>('/api/v1/metrics');
  } catch {
    // Intentionally swallow all errors (DD-3 / NFR-5).
    // The component layer renders a graceful fallback when data is null.
    return null;
  }
}
