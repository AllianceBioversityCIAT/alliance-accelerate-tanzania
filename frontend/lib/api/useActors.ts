'use client';

/**
 * useActors hook — design.md §8, DD-6, NFR-5.
 *
 * Client-side hook: fetches actors on mount and whenever the query changes.
 * Never throws — data is null when getActors() fails (DD-6 graceful fallback).
 * Guards against setting state after unmount (React strict-mode / navigation safe).
 * `error` is true when getActors() resolves to null (distinguishes error from
 * in-flight loading where data is also null).
 *
 * Usage (inside a 'use client' component):
 *   const { data, loading, error } = useActors({ crop: 'sorghum', region: 'Dodoma' });
 *   if (loading) return <Skeleton />;
 *   if (error)   return <ErrorState />;
 *   return <ActorList actors={data!.data} />;
 */

import { useEffect, useState } from 'react';
import { getActors, type ActorsQuery, type PublicActorList } from './actors';

export interface UseActorsResult {
  data: PublicActorList | null;
  loading: boolean;
  error: boolean;
}

export function useActors(query?: ActorsQuery): UseActorsResult {
  const [data, setData]       = useState<PublicActorList | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError]     = useState<boolean>(false);

  // Serialize the query object so it can be used as an effect dependency
  // without triggering on every render when the caller passes an inline literal.
  const queryKey = JSON.stringify(query ?? null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(false);

    getActors(query).then((result) => {
      if (!cancelled) {
        setData(result);
        setLoading(false);
        setError(result === null);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  return { data, loading, error };
}
