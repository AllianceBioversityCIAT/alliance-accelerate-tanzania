'use client';

/**
 * useMetrics hook — design.md §8, DD-3, NFR-5.
 *
 * Client-side hook: fetches metrics on mount, returns loading state and data.
 * Never throws — data is null when getMetrics() fails (DD-3 graceful fallback).
 * Guards against setting state after unmount (React strict-mode / navigation safe).
 *
 * Usage (inside a 'use client' component):
 *   const { data, loading } = useMetrics();
 *   if (loading) return <Skeleton />;
 *   return <MetricsBand data={data} />;
 */

import { useEffect, useState } from 'react';
import { getMetrics, type Metrics } from './metrics';

export interface UseMetricsResult {
  data: Metrics | null;
  loading: boolean;
}

export function useMetrics(): UseMetricsResult {
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    getMetrics().then((result) => {
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading };
}
