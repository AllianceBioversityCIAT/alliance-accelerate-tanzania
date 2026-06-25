/**
 * Jest manual mock for '@gsap/react'.
 *
 * useGSAP() runs the callback once inside a useEffect so that component-level
 * side effects (ref assignment, context setup) still execute during RTL renders,
 * but no real GSAP animation is triggered.  A try/catch guards against any
 * animation call that slips through to the mock gsap object.
 *
 * contextSafe is an identity pass-through so wrapped callbacks are still callable.
 */

import { useEffect } from 'react';

export function useGSAP(
  cb: (() => void | (() => void)) | undefined,
  _deps?: unknown,
): { contextSafe: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown } {
  useEffect(() => {
    if (typeof cb !== 'function') return;
    let cleanup: (() => void) | undefined;
    try {
      const result = cb();
      if (typeof result === 'function') cleanup = result;
    } catch {
      // Swallow any real GSAP calls that weren't caught by the gsap mock
    }
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    contextSafe: (fn: (...args: unknown[]) => unknown) => fn,
  };
}

export default useGSAP;
