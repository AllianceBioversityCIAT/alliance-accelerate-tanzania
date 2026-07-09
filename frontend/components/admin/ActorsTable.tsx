// @sdd-spec admin/bulk-actor-operations (T-6) + admin/actor-crud-audit (T-9)
'use client';

/**
 * ActorsTable — selectable admin actor list.
 *
 * Layout:
 *   - md+: <table> with columns: Trader, Region, Type, Consent, Phone, Email,
 *     Market, Actions.
 *   - mobile (<md): stacked cards, one per actor.
 *
 * Selection:
 *   - Row checkboxes let an Admin select individual actors.
 *   - A select-all checkbox in the table header selects all actors on the
 *     current page (FR-2).
 *   - The count of selected actors is shown above the table/cards.
 *
 * Row actions (T-9):
 *   - Edit   → link to `/admin/actors/edit?id=<actor.id>`.
 *   - Delete → typed ConfirmDialog; calls `deleteActor(id, token)` and then
 *     `onDelete(actor)` so the parent can refetch/show a result.
 *
 * Consent status badge (FR-9):
 *   - GRANTED  → published/green
 *   - DENIED   → hidden/red
 *   - UNKNOWN  → neutral/gray
 *
 * Accessibility (WCAG 2.1 AA / system-design §10):
 *   - <table> with <th scope="col">, <caption> for screen readers.
 *   - Every checkbox has a unique, descriptive aria-label.
 *   - Action buttons/links have unique aria-labels per actor.
 *   - Visible focus rings on all interactive elements.
 *   - Keyboard-operable controls.
 *
 * Tokens only; no hardcoded colors/geometry.
 */

import { useState, useCallback } from 'react';
import Link from 'next/link';

import { deleteActor, type AdminActor } from '@/lib/api/actors-admin';
import { AuthFailureError } from '@/lib/api/client';
import { roleLabel, type TraderType } from '@/lib/content/roles';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActorsTableProps {
  /** Actors currently visible on this page. */
  actors: AdminActor[];
  /** Set of selected actor ids. */
  selectedIds: Set<string>;
  /** Toggle selection for a single actor. */
  onToggle: (id: string) => void;
  /** Toggle selection for every actor on the current page. */
  onToggleAll: () => void;
  /** Bearer token for the row delete API call. */
  token: string;
  /** Called after a row is successfully deleted so the parent can refetch. */
  onDelete: (actor: AdminActor) => void;
  /** Optional callback when the Edit action is activated (the link still navigates). */
  onEdit?: (actor: AdminActor) => void;
  /** Optional callback for auth failures during row delete. */
  onAuthFailure?: () => void;
  /** Optional row click handler (e.g. open detail/edit in a future task). */
  onRowClick?: (actor: AdminActor) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function consentBadgeClasses(status: string): string {
  switch (status) {
    case 'GRANTED':
      return 'bg-highlight-tint text-success';
    case 'DENIED':
      return 'bg-danger-soft text-danger';
    default:
      return 'bg-border text-muted';
  }
}

function consentLabel(status: string): string {
  switch (status) {
    case 'GRANTED':
      return 'Published';
    case 'DENIED':
      return 'Hidden';
    default:
      return 'Unknown';
  }
}

function formatPhone(phone: string | null): string {
  return phone ?? '—';
}

function formatEmail(email: string | null): string {
  return email ?? '—';
}

function formatMarket(location: string | null): string {
  return location ?? '—';
}

// ---------------------------------------------------------------------------
// Consent badge
// ---------------------------------------------------------------------------

function ConsentBadge({ status }: { status: string }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        consentBadgeClasses(status),
      ].join(' ')}
    >
      {consentLabel(status)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Row actions (shared between table and card views)
// ---------------------------------------------------------------------------

function RowActions({
  actor,
  onEdit,
  onDelete,
}: {
  actor: AdminActor;
  onEdit?: (actor: AdminActor) => void;
  onDelete: (actor: AdminActor) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/admin/actors/edit?id=${actor.id}`}
        onClick={(e) => {
          e.stopPropagation();
          onEdit?.(actor);
        }}
        aria-label={`Edit ${actor.traderName}`}
        className={[
          'rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg',
          'transition-colors hover:bg-surface-alt',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
        ].join(' ')}
      >
        Edit
      </Link>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(actor);
        }}
        aria-label={`Delete ${actor.traderName}`}
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

function ActorCard({
  actor,
  selected,
  onToggle,
  onRowClick,
  onEdit,
  onDelete,
}: {
  actor: AdminActor;
  selected: boolean;
  onToggle: (id: string) => void;
  onRowClick?: (actor: AdminActor) => void;
  onEdit?: (actor: AdminActor) => void;
  onDelete: (actor: AdminActor) => void;
}) {
  const handleRowClick = () => {
    if (onRowClick) onRowClick(actor);
  };

  return (
    <article
      aria-label={actor.traderName}
      className={[
        'rounded-md border bg-surface p-4 shadow-sm flex flex-col gap-3',
        'transition-colors',
        onRowClick ? 'cursor-pointer hover:bg-surface-alt' : '',
      ].join(' ')}
      onClick={onRowClick ? handleRowClick : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{actor.traderName}</p>
          <p className="text-xs text-muted mt-0.5">{roleLabel(actor.traderType as TraderType)}</p>
        </div>
        <ConsentBadge status={actor.consentStatus} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-muted">Region</dt>
          <dd className="font-medium text-fg">{actor.region}</dd>
        </div>
        <div>
          <dt className="text-muted">Market</dt>
          <dd className="font-medium text-fg">{formatMarket(actor.marketLocation)}</dd>
        </div>
        <div>
          <dt className="text-muted">Phone</dt>
          <dd className="font-medium text-fg">{formatPhone(actor.phone)}</dd>
        </div>
        <div>
          <dt className="text-muted">Email</dt>
          <dd className="font-medium text-fg break-words">{formatEmail(actor.email)}</dd>
        </div>
      </dl>

      <div className="flex items-center gap-2 pt-1">
        <input
          type="checkbox"
          id={`select-actor-${actor.id}`}
          checked={selected}
          onChange={() => onToggle(actor.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${actor.traderName}`}
          className={[
            'h-4 w-4 rounded border-border text-primary',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          ].join(' ')}
        />
        <label
          htmlFor={`select-actor-${actor.id}`}
          className="text-xs text-muted cursor-pointer"
        >
          Select
        </label>
      </div>

      <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
        <RowActions actor={actor} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ActorsTable({
  actors,
  selectedIds,
  onToggle,
  onToggleAll,
  token,
  onDelete,
  onEdit,
  onAuthFailure,
  onRowClick,
}: ActorsTableProps) {
  const allSelected = actors.length > 0 && actors.every((a) => selectedIds.has(a.id));
  const someSelected = actors.some((a) => selectedIds.has(a.id)) && !allSelected;
  const selectedCount = selectedIds.size;

  // ── Row-delete dialog state ───────────────────────────────────────────────

  const [actorToDelete, setActorToDelete] = useState<AdminActor | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>();

  const openDelete = useCallback((actor: AdminActor) => {
    setDeleteError(undefined);
    setActorToDelete(actor);
  }, []);

  const closeDelete = useCallback(() => {
    setActorToDelete(null);
    setDeleteError(undefined);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!actorToDelete) return;

    setDeleting(true);
    setDeleteError(undefined);

    try {
      await deleteActor(actorToDelete.id, token);
      onDelete(actorToDelete);
      closeDelete();
    } catch (caught: unknown) {
      if (caught instanceof AuthFailureError) {
        onAuthFailure?.();
        closeDelete();
        return;
      }
      setDeleteError(caught instanceof Error ? caught.message : 'Failed to delete actor.');
    } finally {
      setDeleting(false);
    }
  }, [actorToDelete, token, onDelete, onAuthFailure, closeDelete]);

  return (
    <div className="flex flex-col gap-3">
      {/* Selected count (FR-2) */}
      <div
        className="text-sm text-muted"
        aria-live="polite"
        aria-atomic="true"
      >
        {selectedCount === 0
          ? 'No actors selected'
          : `${selectedCount} actor${selectedCount === 1 ? '' : 's'} selected`}
      </div>

      {/* ── Desktop table (md+) ───────────────────────────────────────────── */}
      <div className="hidden md:block overflow-x-auto rounded-md border border-border">
        <table
          className="min-w-full divide-y divide-border text-sm"
          aria-label="Actors"
        >
          <caption className="sr-only">
            List of registry actors with consent status and contact details.
          </caption>
          <thead className="bg-surface-alt">
            <tr>
              <th scope="col" className="px-4 py-3 w-12">
                <input
                  type="checkbox"
                  id="select-all-actors"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={onToggleAll}
                  aria-label="Select all actors on this page"
                  className={[
                    'h-4 w-4 rounded border-border text-primary',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  ].join(' ')}
                />
              </th>
              {[
                'Trader',
                'Region',
                'Type',
                'Consent',
                'Phone',
                'Email',
                'Market location',
                'Actions',
              ].map((col) => (
                <th
                  key={col}
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {actors.map((actor) => {
              const selected = selectedIds.has(actor.id);
              return (
                <tr
                  key={actor.id}
                  className={[
                    'hover:bg-surface-alt transition-colors',
                    onRowClick ? 'cursor-pointer' : '',
                  ].join(' ')}
                  onClick={onRowClick ? () => onRowClick(actor) : undefined}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      id={`select-actor-${actor.id}`}
                      checked={selected}
                      onChange={() => onToggle(actor.id)}
                      aria-label={`Select ${actor.traderName}`}
                      className={[
                        'h-4 w-4 rounded border-border text-primary',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                      ].join(' ')}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-fg whitespace-nowrap">
                    {actor.traderName}
                  </td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">{actor.region}</td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">
                    {roleLabel(actor.traderType as TraderType)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <ConsentBadge status={actor.consentStatus} />
                  </td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">
                    {formatPhone(actor.phone)}
                  </td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">
                    {formatEmail(actor.email)}
                  </td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">
                    {formatMarket(actor.marketLocation)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <RowActions
                      actor={actor}
                      onEdit={onEdit}
                      onDelete={openDelete}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Mobile cards (<md) ─────────────────────────────────────────────── */}
      <div
        className="flex flex-col gap-3 md:hidden"
        role="list"
        aria-label="Actors"
      >
        {actors.map((actor) => (
          <div key={actor.id} role="listitem">
            <ActorCard
              actor={actor}
              selected={selectedIds.has(actor.id)}
              onToggle={onToggle}
              onRowClick={onRowClick}
              onEdit={onEdit}
              onDelete={openDelete}
            />
          </div>
        ))}
      </div>

      {/* ── Row-delete confirmation dialog ─────────────────────────────────── */}
      <ConfirmDialog
        open={actorToDelete !== null}
        title={`Delete ${actorToDelete?.traderName ?? 'actor'}?`}
        description="This actor and their crop links will be permanently removed. This action cannot be undone."
        acknowledgementText={actorToDelete ? `delete ${actorToDelete.traderName}` : undefined}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={closeDelete}
        loading={deleting}
        error={deleteError}
      />
    </div>
  );
}
