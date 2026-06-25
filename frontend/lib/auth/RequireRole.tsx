'use client';

/**
 * RequireRole — auth-wiring spec, design.md §5.
 *
 * Client-side route guard that renders children only when the current session
 * role is in the `allow` list, redirecting to `redirectTo` otherwise.
 *
 * Rules (FR-2 / FR-6):
 *   - Admin ≥ Staff: Admin satisfies an allow:['Staff'] requirement.
 *   - While the session is still resolving (loading=true) render nothing — do
 *     NOT redirect prematurely (NFR-7).
 *   - Once resolved: allowed → render children; disallowed → replace history
 *     with redirectTo via next/navigation (client-only, static-export safe).
 *
 * Static export (NFR-2): client-only; no SSR/route-handler; router.replace()
 * fires in an effect so the component never blocks prerender.
 *
 * Usage (seed for future admin pages — no protected page ships in T-6):
 *   <RequireRole allow={['Admin']}>
 *     <AdminDashboard />
 *   </RequireRole>
 *
 *   <RequireRole allow={['Staff', 'Admin']} redirectTo="/unauthorized">
 *     <StaffPanel />
 *   </RequireRole>
 */

import { useEffect }      from 'react';
import { useRouter }      from 'next/navigation';

import { useSessionContext } from './SessionProvider';
import type { Role }         from './useSession';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RequireRoleProps {
  /** Roles that are allowed to view children. */
  allow: Array<'Staff' | 'Admin'>;
  children: React.ReactNode;
  /** Where to redirect when the role check fails. Defaults to '/login'. */
  redirectTo?: string;
}

// ---------------------------------------------------------------------------
// Role check helper
// ---------------------------------------------------------------------------

/**
 * Returns true when `role` satisfies the `allow` list.
 * Admin ≥ Staff: an Admin user satisfies any requirement that includes 'Staff'.
 */
function isAllowed(role: Role, allow: Array<'Staff' | 'Admin'>): boolean {
  if (allow.includes(role as 'Staff' | 'Admin')) return true;
  // Admin satisfies a Staff-only requirement
  if (role === 'Admin' && allow.includes('Staff')) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RequireRole({
  allow,
  children,
  redirectTo = '/login',
}: RequireRoleProps) {
  const { session, loading } = useSessionContext();
  const router               = useRouter();

  const allowed = !loading && isAllowed(session.role, allow);
  const denied  = !loading && !isAllowed(session.role, allow);

  useEffect(() => {
    if (denied) {
      router.replace(redirectTo);
    }
  }, [denied, redirectTo, router]);

  // While loading, render nothing to avoid a flash or premature redirect.
  if (loading) return null;

  // Render children only when the role check passes.
  if (allowed) return <>{children}</>;

  // Redirect is in-flight; render nothing in the meantime.
  return null;
}
