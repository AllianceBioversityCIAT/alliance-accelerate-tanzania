// @sdd-spec admin/user-management (T-9)
'use client';

/**
 * UsersTable — displays admin users.
 *
 * Layout:
 *   - md+: <table> with columns: Email, Status, Enabled, Roles, Created, Actions.
 *   - mobile (<md): stacked cards, one per user.
 *
 * Per-row actions (each opens the relevant dialog in the parent page via callbacks):
 *   - Edit             → opens EditUserDialog
 *   - Change role      → inline RoleSelect + confirm
 *   - Reset password   → opens ConfirmDialog
 *   - Delete           → opens ConfirmDialog
 *
 * "Change role" is handled inline in this component: it shows a RoleSelect and
 * a small "Apply" button per row; on apply it calls setUserRole and invokes
 * onMutated so the parent refetches. Inline errors surface below the row select.
 *
 * Accessibility (WCAG 2.1 AA / §10):
 *   - <table> with role="table", <th scope="col">, <caption> for screen readers.
 *   - Button aria-labels include the user email for uniqueness (no generic "Edit").
 *   - aria-busy on table body during in-flight refetch.
 *   - Role chips are presentational; status/enabled are text-based.
 */

import { useState, useCallback } from 'react';
import { setUserRole, type AdminUser } from '@/lib/api/users';
import { RoleSelect, type RoleValue } from './RoleSelect';
import { AuthFailureError } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UsersTableProps {
  users: AdminUser[];
  token: string;
  loading?: boolean;
  /** Called after any mutation completes (role change) so parent can refetch. */
  onMutated: () => void;
  onEdit:          (user: AdminUser) => void;
  onDelete:        (user: AdminUser) => void;
  onResetPassword: (user: AdminUser) => void;
  onAuthFailure:   () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day:   '2-digit',
      month: 'short',
      year:  'numeric',
    });
  } catch {
    return iso;
  }
}

function roleLabel(user: AdminUser): string {
  if (user.roles.length === 0) return 'Public';
  return user.roles.map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(', ');
}

function currentRoleValue(user: AdminUser): RoleValue {
  if (user.roles.includes('admin')) return 'admin';
  if (user.roles.includes('staff')) return 'staff';
  return 'none';
}

// ---------------------------------------------------------------------------
// RoleCells — per-row inline role-change state
// ---------------------------------------------------------------------------

interface RoleCellProps {
  user: AdminUser;
  token: string;
  onMutated: () => void;
  onAuthFailure: () => void;
}

function RoleCell({ user, token, onMutated, onAuthFailure }: RoleCellProps) {
  const [editing,      setEditing]      = useState(false);
  const [selected,     setSelected]     = useState<RoleValue>(currentRoleValue(user));
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | undefined>();

  const handleApply = useCallback(async () => {
    setError(undefined);
    setLoading(true);
    try {
      await setUserRole(user.id, { role: selected }, token);
      setEditing(false);
      onMutated();
    } catch (caught: unknown) {
      if (caught instanceof AuthFailureError) {
        onAuthFailure();
        return;
      }
      setError(caught instanceof Error ? caught.message : 'Failed to update role.');
    } finally {
      setLoading(false);
    }
  }, [user.id, selected, token, onMutated, onAuthFailure]);

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {/* Role chip(s) */}
        {user.roles.length === 0 ? (
          <span className="inline-flex items-center rounded-full bg-border px-2 py-0.5 text-xs text-muted">
            Public
          </span>
        ) : (
          user.roles.map((r) => (
            <span
              key={r}
              className="inline-flex items-center rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary"
            >
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </span>
          ))
        )}
        <button
          type="button"
          onClick={() => { setSelected(currentRoleValue(user)); setEditing(true); }}
          aria-label={`Change role for ${user.email}`}
          className={[
            'ml-1 rounded-md border border-border bg-surface px-2 py-0.5 text-xs text-muted',
            'transition-colors hover:bg-surface-alt hover:text-fg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
          ].join(' ')}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <RoleSelect
          id={`role-select-${user.id}`}
          value={selected}
          onChange={setSelected}
          disabled={loading}
          showLabel={false}
          aria-label={`New role for ${user.email}`}
        />
        <button
          type="button"
          onClick={handleApply}
          disabled={loading}
          aria-busy={loading}
          aria-label={`Apply role change for ${user.email}`}
          className={[
            'shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg',
            'transition-colors hover:bg-primary-hover',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
            'disabled:cursor-not-allowed disabled:opacity-50',
          ].join(' ')}
        >
          {loading ? '…' : 'Apply'}
        </button>
        <button
          type="button"
          onClick={() => { setEditing(false); setError(undefined); }}
          disabled={loading}
          aria-label="Cancel role change"
          className={[
            'shrink-0 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-muted',
            'transition-colors hover:bg-surface-alt',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
            'disabled:cursor-not-allowed disabled:opacity-50',
          ].join(' ')}
        >
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">{error}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row actions (shared between table and card views)
// ---------------------------------------------------------------------------

interface RowActionsProps {
  user: AdminUser;
  onEdit: () => void;
  onDelete: () => void;
  onResetPassword: () => void;
}

function RowActions({ user, onEdit, onDelete, onResetPassword }: RowActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${user.email}`}
        className={[
          'rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg',
          'transition-colors hover:bg-surface-alt',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
        ].join(' ')}
      >
        Edit
      </button>
      <button
        type="button"
        onClick={onResetPassword}
        aria-label={`Reset password for ${user.email}`}
        className={[
          'rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg',
          'transition-colors hover:bg-surface-alt',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
        ].join(' ')}
      >
        Reset pwd
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${user.email}`}
        className={[
          'rounded-md border border-danger/30 bg-surface px-2.5 py-1 text-xs font-medium text-danger',
          'transition-colors hover:bg-danger/10',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-1',
        ].join(' ')}
      >
        Delete
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile card
// ---------------------------------------------------------------------------

function UserCard({
  user,
  token,
  onMutated,
  onEdit,
  onDelete,
  onResetPassword,
  onAuthFailure,
}: {
  user: AdminUser;
  token: string;
  onMutated: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onResetPassword: () => void;
  onAuthFailure: () => void;
}) {
  return (
    <article
      aria-label={user.email}
      className="rounded-md border border-border bg-surface p-4 shadow-sm flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{user.email}</p>
          <p className="text-xs text-muted mt-0.5">{user.status}</p>
        </div>
        <span
          className={[
            'shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
            user.enabled
              ? 'bg-highlight/20 text-success'
              : 'bg-border text-muted',
          ].join(' ')}
        >
          {user.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      <RoleCell
        user={user}
        token={token}
        onMutated={onMutated}
        onAuthFailure={onAuthFailure}
      />

      <p className="text-xs text-muted">Created {formatDate(user.createdAt)}</p>

      <RowActions
        user={user}
        onEdit={onEdit}
        onDelete={onDelete}
        onResetPassword={onResetPassword}
      />
    </article>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UsersTable({
  users,
  token,
  loading = false,
  onMutated,
  onEdit,
  onDelete,
  onResetPassword,
  onAuthFailure,
}: UsersTableProps) {
  return (
    <>
      {/* ── Desktop table (md+) ─────────────────────────────────────────────── */}
      <div className="hidden md:block overflow-x-auto rounded-md border border-border">
        <table
          className="min-w-full divide-y divide-border text-sm"
          aria-label="Users"
        >
          <caption className="sr-only">
            List of system users with their status, roles, and management actions.
          </caption>
          <thead className="bg-surface-alt">
            <tr>
              {[
                'Email',
                'Status',
                'Enabled',
                'Roles',
                'Created',
                'Actions',
              ].map((col) => (
                <th
                  key={col}
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody
            className="divide-y divide-border bg-surface"
            aria-busy={loading}
          >
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-surface-alt transition-colors">

                {/* Email */}
                <td className="px-4 py-3 font-medium text-fg max-w-xs truncate">
                  {user.email}
                </td>

                {/* Status */}
                <td className="px-4 py-3 text-muted whitespace-nowrap">
                  {user.status}
                </td>

                {/* Enabled */}
                <td className="px-4 py-3">
                  <span
                    className={[
                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                      user.enabled
                        ? 'bg-highlight/20 text-success'
                        : 'bg-border text-muted',
                    ].join(' ')}
                  >
                    {user.enabled ? 'Yes' : 'No'}
                  </span>
                </td>

                {/* Roles — inline role change */}
                <td className="px-4 py-3 min-w-[200px]">
                  <RoleCell
                    user={user}
                    token={token}
                    onMutated={onMutated}
                    onAuthFailure={onAuthFailure}
                  />
                </td>

                {/* Created */}
                <td className="px-4 py-3 text-muted whitespace-nowrap">
                  {formatDate(user.createdAt)}
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  <RowActions
                    user={user}
                    onEdit={() => onEdit(user)}
                    onDelete={() => onDelete(user)}
                    onResetPassword={() => onResetPassword(user)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile cards (<md) ──────────────────────────────────────────────── */}
      <div
        className="flex flex-col gap-3 md:hidden"
        role="list"
        aria-label="Users"
        aria-busy={loading}
      >
        {users.map((user) => (
          <div key={user.id} role="listitem">
            <UserCard
              user={user}
              token={token}
              onMutated={onMutated}
              onEdit={() => onEdit(user)}
              onDelete={() => onDelete(user)}
              onResetPassword={() => onResetPassword(user)}
              onAuthFailure={onAuthFailure}
            />
          </div>
        ))}
      </div>
    </>
  );
}

// Re-export for convenience; page uses roleLabel to build aria strings.
export { roleLabel };
