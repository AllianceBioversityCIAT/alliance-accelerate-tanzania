'use client';

/**
 * useMetrics hook — design.md §8, DD-3, NFR-5.
 *
 * Client-side hook: fetches metrics on mount, returns loading state and data.
 * Never throws — data is null when getMetrics() fails (DD-3 graceful fallback).
 * Guards against setting state after unmount (React strict-mode / navigation safe).
 * `error` is true when getMetrics() resolves to null (distinguishes a failed
 * fetch from in-flight loading, where data is also null). Mirrors useActors
 * (ATP-50) — the API always returns numeric aggregates, zeros included, so a
 * null result after loading can only mean the request failed, never "no data".
 *
 * Usage (inside a 'use client' component — MetricsBand calls this hook itself
 * rather than receiving the result as props):
 *   const { data, loading, error } = useMetrics();
 *   if (loading) return <Skeleton />;
 *   if (error)   return <ErrorState />;
 *   return <Figures metrics={data!} />;
 */

import { useEffect, useState } from 'react';
import { getMetrics, type Metrics } from './metrics';

export interface UseMetricsResult {
  data: Metrics | null;
  loading: boolean;
  error: boolean;
}

export function useMetrics(): UseMetricsResult {
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    getMetrics().then((result) => {
      if (!cancelled) {
        setData(result);
        setLoading(false);
        setError(result === null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}
