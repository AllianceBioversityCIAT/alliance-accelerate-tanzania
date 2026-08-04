// @sdd-spec admin/bulk-actor-operations (T-6) + admin/actor-crud-audit (T-9)
'use client';

/**
 * ActorsTable — selectable admin actor list.
 *
 * Layout:
 *   - lg+: <table> with columns: Trader, Region, Type, Source, Consent,
 *     Phone, Email, Market, Actions. All columns render — none are
 *     dropped — wrapped in `overflow-x-auto` so the full row scrolls
 *     horizontally at this breakpoint and up when it overflows the
 *     viewport (design.md §9, `registration-source-and-consent` FR-6).
 *     The checkbox and Trader columns are `sticky left-*` within that
 *     scroll container (FR-6's small-screen scenario, T-8 scope
 *     correction 2026-08-04) — together they are what lets an admin
 *     select *and* identify a row after scrolling right to read Consent
 *     on the nine-column, sidebar-narrowed `lg` layout.
 *
 *     **The breakpoint is `lg`, not `md`** (T-8 scope correction
 *     2026-08-04, second pass) — a live D-h visual check measured the
 *     scroll container at `md` (768px viewport) at only ~494px once the
 *     persistent sidebar and content padding are subtracted, leaving ~94px
 *     to scroll eight non-frozen columns through even with the Trader
 *     clamp in place; Consent rendered as unreadable fragments
 *     ("lished", "ecorded — no ev"). At `lg` (1024px) the container is
 *     ~718px and the sticky columns do their job.
 *   - below lg: the table is `hidden` and stacked cards render instead, one
 *     per actor, carrying the same Source badge and consent-method caption
 *     as the table's Consent column — including at `md`, which now gets
 *     the card treatment rather than a cramped table.
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
 * Source + Consent-method (registration-source-and-consent T-8, FR-1/FR-2/FR-9):
 *   - Source chip: TEAM_MANAGED (neutral) vs SELF_REGISTERED (primary-toned).
 *   - Consent column pairs the existing status chip with a method caption
 *     ("Signed form", "Portal checkbox", "Not recorded", ...). A `GRANTED`
 *     actor whose method is still `NOT_RECORDED` is the legacy,
 *     unevidenced-consent case FR-9 exists to surface — its caption renders
 *     in the warning token instead of muted AND carries an explicit text
 *     qualifier ("Not recorded — no evidence") so the flag is not
 *     color-only (WCAG 1.4.1); it is also enumerable via the
 *     consentStatus+consentMethod filter.
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
// Sticky first column (FR-6 small-screen scenario, T-8 scope correction)
// ---------------------------------------------------------------------------

/**
 * The checkbox column's width and the Trader column's left offset must be
 * the same physical distance (3rem/48px) for the two sticky columns to sit
 * flush against each other with no gap or overlap. Centralized here as
 * `CHECKBOX_COL_WIDTH_CLASS` / `TRADER_COL_LEFT_CLASS` rather than left as
 * four independent literals, so a reviewer changing one sees the other.
 *
 * These stay separate string constants rather than one computed value:
 * Tailwind's compiler extracts classes by scanning source for complete,
 * literal class-name strings. A template literal like `` `left-${n}` ``
 * would not be found by that scan, so the class would render in the DOM
 * with **no matching CSS rule** — a silent failure strictly worse than the
 * prose-only coupling this fixes. Both are standard Tailwind scale values
 * (no arbitrary `[…]` geometry, NFR-8). `ActorsTable.test.tsx` asserts
 * both classes together on the checkbox cells as the enforcement backstop
 * dynamic derivation can't safely provide here.
 *
 * Sticky cells need their own opaque background: a transparent `td`/`th`
 * lets non-sticky columns show through underneath as they scroll past.
 * The header row's ambient background is `bg-surface-alt` (on `<thead>`),
 * the body row's is `bg-surface` (on `<tbody>`) with `hover:bg-surface-alt`
 * currently applied to the `<tr>` itself — a transparent `td` inherits
 * that through the row, but an opaque sticky `td` cannot, so the hover
 * state is re-declared here via the `group`/`group-hover` pattern (the
 * `<tr>` carries `group`). There is no separate "selected row" background
 * in this table today (checkbox-checked is the only selection cue), so
 * there is no third state to replicate. `transition-colors` is repeated
 * on the sticky cells (rather than relying solely on the `<tr>`'s copy) so
 * their `group-hover` repaint fades in step with the rest of the row
 * instead of snapping instantly.
 *
 * No z-index is added: `position: sticky` makes these `td`/`th` elements
 * "positioned", and per the CSS painting order, in-flow non-positioned
 * siblings (the scrolling columns) always paint *before* — i.e. underneath
 * — positioned siblings at the default stack level, regardless of DOM
 * order. That already puts the sticky columns visually on top. There is
 * no sticky header here to create a second, vertical stacking need.
 *
 * The sticky/scrollable boundary is marked with `shadow-sticky-edge` (an
 * inset box-shadow, `tailwind.config.ts`), **not** `border-r`. A live
 * D-h visual check (2026-08-04) confirmed the border regression: under
 * `border-collapse`, a cell border belongs to the table's border grid, not
 * the cell's own paint — so it stays put at its original table position
 * while the sticky cell scrolls past it, and the boundary visibly detaches
 * once the table scrolls. An inset shadow is painted by the cell itself, so
 * it travels with the sticky offset instead.
 */
const CHECKBOX_COL_WIDTH_CLASS = 'w-12';
const TRADER_COL_LEFT_CLASS = 'left-12';

const STICKY_CHECKBOX_TH = 'sticky left-0 bg-surface-alt';
const STICKY_TRADER_TH = `sticky ${TRADER_COL_LEFT_CLASS} bg-surface-alt shadow-sticky-edge`;
const STICKY_CHECKBOX_TD = 'sticky left-0 bg-surface group-hover:bg-surface-alt transition-colors';
const STICKY_TRADER_TD = [
  'sticky',
  TRADER_COL_LEFT_CLASS,
  'bg-surface group-hover:bg-surface-alt transition-colors',
  'shadow-sticky-edge',
].join(' ');

/**
 * Width clamp for the rendered Trader name — deliberately on an inner
 * `<span>`, never on the `<td>` itself.
 *
 * `max-w-xs` on a table cell is a no-op once the cell is `whitespace-nowrap`
 * (which `truncate` itself sets): under `nowrap`, a cell's min-content width
 * equals its max-content width — the full unwrapped string — and
 * css-tables-3's column measure only applies `max-width` inside
 * `min(max-width, max-content)`, a term that's floored by min-content.
 * `max(FULL, 320px)` = `FULL`. The column resolves to the full name's width
 * regardless of the clamp, nothing overflows, `overflow:hidden` never clips,
 * and no ellipsis renders — a clamp that looks correct and does nothing.
 *
 * A block-level child obeys a different rule: CSS sizing clamps a
 * **non-table** block box's min-content *contribution* by its own
 * `max-width`, so the `<span>` contributes `min(320px, FULL)` = 320px, the
 * `<td>`'s min-content becomes `320px + padding`, the column resolves to
 * that, and the nowrap text genuinely overflows the 320px span — real
 * ellipsis. Same pattern the mobile card already uses successfully
 * (`<p className="truncate">` inside `<div className="min-w-0 flex-1">`,
 * below). Trader is a pre-existing column, not one of FR-6's "new columns",
 * so its MUST-NOT-truncate clause doesn't cover it — worst case this caps
 * the frozen (checkbox + Trader) pair at ~400px instead of an unbounded
 * cooperative legal name eating the scroll container's budget. The table
 * only renders at `lg`+ (measured ~718px container at `lg 1024`; a live
 * D-h check found `md` left too little room even with this clamp, which is
 * why the breakpoint moved — see the layout doc comment at the top of this
 * file).
 */
const TRADER_NAME_CLAMP_CLASS = 'block max-w-xs truncate';

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

/** Source chip label (registration-source-and-consent FR-1). */
function sourceLabel(source: string): string {
  switch (source) {
    case 'SELF_REGISTERED':
      return 'Self-registered';
    default:
      return 'Team-managed';
  }
}

/** Source chip tokens — neutral for the curated track, primary for self-registration. */
function sourceBadgeClasses(source: string): string {
  switch (source) {
    case 'SELF_REGISTERED':
      return 'bg-primary-soft text-primary';
    default:
      return 'bg-border text-muted';
  }
}

/** Consent-method caption text (registration-source-and-consent FR-2). */
function consentMethodLabel(method: string): string {
  switch (method) {
    case 'PORTAL_CHECKBOX':
      return 'Portal checkbox';
    case 'SIGNED_FORM':
      return 'Signed form';
    case 'EMAIL':
      return 'Email';
    case 'VERBAL_FIELD':
      return 'Verbal (field)';
    default:
      return 'Not recorded';
  }
}

/**
 * FR-9 — a `GRANTED` actor whose consent method is still `NOT_RECORDED` is
 * the legacy, unevidenced-grant case this spec exists to surface (the
 * migration deliberately never backfills it). Flagged with the warning
 * token rather than the neutral muted caption.
 */
function isUnevidencedGrant(consentStatus: string, consentMethod: string): boolean {
  return consentStatus === 'GRANTED' && consentMethod === 'NOT_RECORDED';
}

function consentMethodClasses(consentStatus: string, consentMethod: string): string {
  return isUnevidencedGrant(consentStatus, consentMethod) ? 'text-warning' : 'text-muted';
}

/**
 * Caption text for the consent-method cell. The warning *color* alone
 * (`consentMethodClasses` above) is not perceivable to color-blind users or
 * screen-reader users — WCAG 1.4.1 requires the flag not depend on color as
 * the only visual/textual cue. The unevidenced-grant case therefore carries
 * an explicit qualifier in the text itself, not just a different token
 * (T-8 rework, "FR-9 flag is emphasis-only" fold-in).
 */
function consentMethodCaptionText(consentStatus: string, consentMethod: string): string {
  const label = consentMethodLabel(consentMethod);
  return isUnevidencedGrant(consentStatus, consentMethod) ? `${label} — no evidence` : label;
}

// ---------------------------------------------------------------------------
// Source / Consent badges
// ---------------------------------------------------------------------------

function SourceBadge({ source }: { source: string }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        sourceBadgeClasses(source),
      ].join(' ')}
    >
      {sourceLabel(source)}
    </span>
  );
}

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

/** Status chip + method caption, stacked (design.md §5 — "status chip + method caption"). */
function ConsentCell({
  consentStatus,
  consentMethod,
}: {
  consentStatus: string;
  consentMethod: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <ConsentBadge status={consentStatus} />
      <span className={['text-xs', consentMethodClasses(consentStatus, consentMethod)].join(' ')}>
        {consentMethodCaptionText(consentStatus, consentMethod)}
      </span>
    </div>
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
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            <SourceBadge source={actor.registrationSource} />
            <ConsentBadge status={actor.consentStatus} />
          </div>
          <span
            className={[
              'text-xs',
              consentMethodClasses(actor.consentStatus, actor.consentMethod),
            ].join(' ')}
          >
            {consentMethodCaptionText(actor.consentStatus, actor.consentMethod)}
          </span>
        </div>
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

      {/* ── Desktop table (lg+) ───────────────────────────────────────────── */}
      <div className="hidden lg:block overflow-x-auto rounded-md border border-border">
        <table
          className="min-w-full divide-y divide-border text-sm"
          aria-label="Actors"
        >
          <caption className="sr-only">
            List of registry actors with registration source, consent status, and contact details.
          </caption>
          <thead className="bg-surface-alt">
            <tr>
              <th
                scope="col"
                className={['px-4 py-3', CHECKBOX_COL_WIDTH_CLASS, STICKY_CHECKBOX_TH].join(' ')}
              >
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
                'Source',
                'Consent',
                'Phone',
                'Email',
                'Market location',
                'Actions',
              ].map((col) => (
                <th
                  key={col}
                  scope="col"
                  className={[
                    'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted whitespace-nowrap',
                    col === 'Trader' ? STICKY_TRADER_TH : '',
                  ].join(' ')}
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
                    'group hover:bg-surface-alt transition-colors',
                    onRowClick ? 'cursor-pointer' : '',
                  ].join(' ')}
                  onClick={onRowClick ? () => onRowClick(actor) : undefined}
                >
                  <td
                    className={['px-4 py-3', CHECKBOX_COL_WIDTH_CLASS, STICKY_CHECKBOX_TD].join(' ')}
                    onClick={(e) => e.stopPropagation()}
                  >
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
                  <td
                    className={['px-4 py-3 font-medium text-fg', STICKY_TRADER_TD].join(' ')}
                    // Visual affordance only — not an accessibility measure.
                    // `title` is not keyboard-reachable and is inconsistently
                    // exposed to assistive tech; screen readers already read
                    // the full name below regardless of visual truncation,
                    // since the text content itself is never shortened.
                    title={actor.traderName}
                  >
                    <span className={TRADER_NAME_CLAMP_CLASS}>{actor.traderName}</span>
                  </td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">{actor.region}</td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">
                    {roleLabel(actor.traderType as TraderType)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <SourceBadge source={actor.registrationSource} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <ConsentCell
                      consentStatus={actor.consentStatus}
                      consentMethod={actor.consentMethod}
                    />
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

      {/* ── Mobile/tablet cards (<lg) ──────────────────────────────────────── */}
      <div
        className="flex flex-col gap-3 lg:hidden"
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
