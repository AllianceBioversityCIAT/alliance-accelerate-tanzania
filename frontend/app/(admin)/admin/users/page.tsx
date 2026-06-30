// @sdd-spec admin/user-management (T-9)
'use client';

/**
 * /admin/users — User management console (Admin only).
 *
 * Static-export safe: 'use client'; no SSR / route handlers.
 * Auth guard: the (admin) layout already wraps this in <RequireRole allow={['Admin']}>;
 * we additionally guard API calls to never execute without a token (belt + suspenders).
 *
 * States:
 *   loading   — skeleton rows while listUsers is in-flight.
 *   error     — error banner + retry button; AuthFailureError routes to /login.
 *   empty     — friendly empty state ("No users yet").
 *   populated — UsersTable with pagination (Load more if paginationToken present).
 *
 * Dialogs:
 *   CreateUserDialog  — new user form (email + role).
 *   EditUserDialog    — edit email / enabled state.
 *   ConfirmDialog     — delete user / reset password (destructive confirms).
 *
 * Success affordance: a transient success banner (aria-live="polite") shown for
 * 3 s after any successful mutation before auto-dismissing.
 *
 * Tokens only; WCAG 2.1 AA.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { getSession } from '@/lib/auth/auth-client';
import {
  listUsers,
  deleteUser,
  resetUserPassword,
  type AdminUser,
  type ListUsersResult,
} from '@/lib/api/users';
import { AuthFailureError } from '@/lib/api/client';

import { UsersTable }       from '@/components/admin/UsersTable';
import { CreateUserDialog } from '@/components/admin/CreateUserDialog';
import { EditUserDialog }   from '@/components/admin/EditUserDialog';
import { ConfirmDialog }    from '@/components/admin/ConfirmDialog';
import Skeleton             from '@/components/ui/Skeleton';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_LIMIT = 60; // Cognito per-page cap (design.md §3 ListUsersQueryDto @Max(60))

// ---------------------------------------------------------------------------
// Skeleton loading rows (table layout mimic)
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <div role="status" aria-label="Loading users" className="flex flex-col gap-3">
      {/* Desktop skeleton */}
      <div className="hidden md:block rounded-md border border-border overflow-hidden">
        <div className="bg-surface-alt px-4 py-3 flex gap-4">
          <Skeleton className="h-3 w-44 rounded-sm" />
          <Skeleton className="h-3 w-28 rounded-sm" />
          <Skeleton className="h-3 w-14 rounded-sm" />
          <Skeleton className="h-3 w-28 rounded-sm" />
          <Skeleton className="h-3 w-20 rounded-sm" />
          <Skeleton className="h-3 w-28 rounded-sm" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="border-t border-border px-4 py-3 flex gap-4 items-center"
          >
            <Skeleton className="h-4 w-44 rounded-sm" />
            <Skeleton className="h-4 w-28 rounded-sm" />
            <Skeleton className="h-5 w-10 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-20 rounded-sm" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-12 rounded-md" />
              <Skeleton className="h-6 w-16 rounded-md" />
              <Skeleton className="h-6 w-14 rounded-md" />
            </div>
          </div>
        ))}
      </div>
      {/* Mobile skeleton */}
      <div className="flex flex-col gap-3 md:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-md border border-border p-4 flex flex-col gap-3">
            <Skeleton className="h-4 w-3/4 rounded-sm" />
            <Skeleton className="h-3 w-1/2 rounded-sm" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <div className="flex gap-2">
              <Skeleton className="h-7 w-12 rounded-md" />
              <Skeleton className="h-7 w-20 rounded-md" />
              <Skeleton className="h-7 w-14 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function UsersPage() {
  const router = useRouter();

  // ── Data state ────────────────────────────────────────────────────────────

  const [token,           setToken]           = useState<string | null>(null);
  const [users,           setUsers]           = useState<AdminUser[]>([]);
  const [paginationToken, setPaginationToken] = useState<string | undefined>();
  const [loading,         setLoading]         = useState(true);
  const [loadingMore,     setLoadingMore]     = useState(false);
  const [error,           setError]           = useState<string | undefined>();

  // ── Success banner ────────────────────────────────────────────────────────

  const [successMsg, setSuccessMsg] = useState<string | undefined>();
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSuccess = useCallback((msg: string) => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setSuccessMsg(msg);
    successTimerRef.current = setTimeout(() => setSuccessMsg(undefined), 3000);
  }, []);

  // ── Dialog state ──────────────────────────────────────────────────────────

  const [createOpen,      setCreateOpen]      = useState(false);
  const [editUser,        setEditUser]        = useState<AdminUser | null>(null);
  const [deleteUser_,     setDeleteUser]      = useState<AdminUser | null>(null);
  const [resetUser,       setResetUser]       = useState<AdminUser | null>(null);

  // Confirm dialog in-flight / error (for delete + reset)
  const [confirmLoading,  setConfirmLoading]  = useState(false);
  const [confirmError,    setConfirmError]    = useState<string | undefined>();

  // ── Auth failure → /login ─────────────────────────────────────────────────

  const handleAuthFailure = useCallback(() => {
    router.push('/login');
  }, [router]);

  // ── Fetch helpers ─────────────────────────────────────────────────────────

  const fetchUsers = useCallback(
    async (tok: string, cursorToken?: string, append = false) => {
      try {
        const result: ListUsersResult = await listUsers(
          { limit: PAGE_LIMIT, ...(cursorToken ? { paginationToken: cursorToken } : {}) },
          tok
        );
        if (append) {
          setUsers((prev) => [...prev, ...result.users]);
        } else {
          setUsers(result.users);
        }
        setPaginationToken(result.paginationToken);
      } catch (caught: unknown) {
        if (caught instanceof AuthFailureError) {
          handleAuthFailure();
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Failed to load users.');
      }
    },
    [handleAuthFailure]
  );

  // ── On mount: resolve token then load users ────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(undefined);

      const session = await getSession();
      if (cancelled) return;

      if (!session) {
        // No session — layout's RequireRole already redirects; guard here too.
        handleAuthFailure();
        return;
      }

      setToken(session.accessToken);
      await fetchUsers(session.accessToken);

      if (!cancelled) setLoading(false);
    }

    void init();
    return () => { cancelled = true; };
  // fetchUsers is stable (useCallback with [handleAuthFailure])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Retry ─────────────────────────────────────────────────────────────────

  const handleRetry = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(undefined);
    await fetchUsers(token);
    setLoading(false);
  }, [token, fetchUsers]);

  // ── Load more ─────────────────────────────────────────────────────────────

  const handleLoadMore = useCallback(async () => {
    if (!token || !paginationToken) return;
    setLoadingMore(true);
    await fetchUsers(token, paginationToken, true);
    setLoadingMore(false);
  }, [token, paginationToken, fetchUsers]);

  // ── Refetch after mutation ─────────────────────────────────────────────────

  const refetch = useCallback(async () => {
    if (!token) return;
    await fetchUsers(token);
  }, [token, fetchUsers]);

  // ── Handlers for dialogs ──────────────────────────────────────────────────

  // Create success
  const handleCreateSuccess = useCallback(async () => {
    setCreateOpen(false);
    await refetch();
    showSuccess('User created successfully.');
  }, [refetch, showSuccess]);

  // Edit success
  const handleEditSuccess = useCallback(async () => {
    setEditUser(null);
    await refetch();
    showSuccess('User updated successfully.');
  }, [refetch, showSuccess]);

  // Delete confirm
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteUser_ || !token) return;
    setConfirmError(undefined);
    setConfirmLoading(true);
    try {
      await deleteUser(deleteUser_.id, token);
      setDeleteUser(null);
      await refetch();
      showSuccess('User deleted.');
    } catch (caught: unknown) {
      if (caught instanceof AuthFailureError) {
        handleAuthFailure();
        return;
      }
      setConfirmError(caught instanceof Error ? caught.message : 'Failed to delete user.');
    } finally {
      setConfirmLoading(false);
    }
  }, [deleteUser_, token, refetch, showSuccess, handleAuthFailure]);

  // Reset password confirm
  const handleResetConfirm = useCallback(async () => {
    if (!resetUser || !token) return;
    setConfirmError(undefined);
    setConfirmLoading(true);
    try {
      await resetUserPassword(resetUser.id, token);
      setResetUser(null);
      showSuccess('Password reset email sent.');
    } catch (caught: unknown) {
      if (caught instanceof AuthFailureError) {
        handleAuthFailure();
        return;
      }
      setConfirmError(caught instanceof Error ? caught.message : 'Failed to reset password.');
    } finally {
      setConfirmLoading(false);
    }
  }, [resetUser, token, showSuccess, handleAuthFailure]);

  // Clear confirm error when dialogs close
  const handleDeleteCancel = useCallback(() => {
    setDeleteUser(null);
    setConfirmError(undefined);
  }, []);

  const handleResetCancel = useCallback(() => {
    setResetUser(null);
    setConfirmError(undefined);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">

      {/* ── Page heading + create action ──────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-fg">
            User management
          </h1>
          <p className="mt-1 text-sm text-muted">
            Manage Cognito users, roles, and account access.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          disabled={loading || !token}
          className={[
            'inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg',
            'transition-colors hover:bg-primary-hover',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'whitespace-nowrap self-start sm:self-auto',
          ].join(' ')}
        >
          + Create user
        </button>
      </div>

      {/* ── Success banner ────────────────────────────────────────────────── */}
      {successMsg && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md bg-highlight/20 border border-highlight/40 px-4 py-3 text-sm font-medium text-success"
        >
          {successMsg}
        </div>
      )}

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {error && !loading && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex flex-col gap-3 rounded-md border border-danger/30 bg-danger/10 px-4 py-4"
        >
          <p className="text-sm font-semibold text-danger">
            Could not load users
          </p>
          <p className="text-sm text-muted">{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className={[
              'self-start rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg',
              'transition-colors hover:bg-surface-alt',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            ].join(' ')}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Loading state ─────────────────────────────────────────────────── */}
      {loading && <TableSkeleton />}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!loading && !error && users.length === 0 && (
        <div
          aria-live="polite"
          className={[
            'flex flex-col items-center gap-3 rounded-md border border-border',
            'bg-surface py-16 px-4 text-center',
          ].join(' ')}
        >
          <p className="text-base font-semibold text-fg">No users yet</p>
          <p className="text-sm text-muted">
            Create the first user with the button above.
          </p>
        </div>
      )}

      {/* ── Populated state ───────────────────────────────────────────────── */}
      {!loading && !error && users.length > 0 && token && (
        <>
          <UsersTable
            users={users}
            token={token}
            loading={loading}
            onMutated={refetch}
            onEdit={(u) => setEditUser(u)}
            onDelete={(u) => { setConfirmError(undefined); setDeleteUser(u); }}
            onResetPassword={(u) => { setConfirmError(undefined); setResetUser(u); }}
            onAuthFailure={handleAuthFailure}
          />

          {/* Load more */}
          {paginationToken && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                aria-busy={loadingMore}
                className={[
                  'rounded-md border border-border bg-surface px-5 py-2 text-sm font-medium text-fg',
                  'transition-colors hover:bg-surface-alt',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                ].join(' ')}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Dialogs ───────────────────────────────────────────────────────── */}

      {token && (
        <CreateUserDialog
          open={createOpen}
          token={token}
          onSuccess={handleCreateSuccess}
          onCancel={() => setCreateOpen(false)}
        />
      )}

      {token && (
        <EditUserDialog
          open={!!editUser}
          user={editUser}
          token={token}
          onSuccess={handleEditSuccess}
          onCancel={() => setEditUser(null)}
        />
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteUser_}
        title={`Delete ${deleteUser_?.email ?? 'user'}?`}
        description="This will permanently delete the Cognito account. This action cannot be undone."
        confirmLabel="Delete user"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        loading={confirmLoading}
        error={confirmError}
      />

      {/* Reset password confirm */}
      <ConfirmDialog
        open={!!resetUser}
        title={`Reset password for ${resetUser?.email ?? 'user'}?`}
        description="Cognito will email a password-reset link to the user. No plaintext password is generated."
        confirmLabel="Send reset email"
        onConfirm={handleResetConfirm}
        onCancel={handleResetCancel}
        loading={confirmLoading}
        error={confirmError}
      />
    </div>
  );
}
