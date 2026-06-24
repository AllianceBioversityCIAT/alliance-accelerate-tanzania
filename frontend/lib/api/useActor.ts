'use client';

/**
 * useActor hook — design.md §5, NFR-7.
 *
 * Client-side hook: fetches a single actor on mount and whenever the id changes.
 * Never throws — data is null when getActor() fails or the actor is not found
 * (NFR-7 graceful fallback). Guards against setting state after unmount
 * (React strict-mode / navigation safe). `error` is true when getActor()
 * resolves to null (distinguishes a real failure/404 from in-flight loading
 * where data is also null).
 *
 * Usage (inside a 'use client' component):
 *   const { data, loading, error } = useActor(id);
 *   if (loading) return <Skeleton />;
 *   if (error)   return <NotFound />;
 *   return <Profile actor={data!} />;
 */

import { useEffect, useState } from 'react';
import { getActor, type PublicActor } from './actors';

export interface UseActorResult {
  data: PublicActor | null;
  loading: boolean;
  error: boolean;
}

export function useActor(id: string): UseActorResult {
  const [data, setData]       = useState<PublicActor | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError]     = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(false);

    getActor(id).then((result) => {
      if (!cancelled) {
        setData(result);
        setLoading(false);
        setError(result === null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return { data, loading, error };
}
