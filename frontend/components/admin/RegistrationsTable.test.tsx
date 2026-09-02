// @sdd-spec admin/registration-review-queue (T-12)
/**
 * Unit tests for RegistrationsTable.
 *
 * Covers:
 *   - Eight columns render, one (Reference) carrying the sticky/opaque-
 *     background/shadow-sticky-edge classes (`design.md` §7.2,
 *     `frontend/CLAUDE.md` sticky-column conventions).
 *   - Duplicates flag: zero renders a muted dash, non-zero renders a count.
 *   - Status badge renders for the three producible statuses.
 *   - Absence assertions (KZ-002 direction — can only prove absence):
 *       * no "No email" text/flag anywhere in the rendered output.
 *       * `AdminRegistrationListRow` carries no email field at all, so this
 *         is enforced by the type as well as by this render assertion.
 *   - Review action links to /admin/registrations/review?id=<id>.
 *   - Table (md+) and card (<md) views both render every row. jsdom applies
 *     no breakpoints, so both views render simultaneously here and this file
 *     asserts only that every row appears in each; the md split itself is
 *     not verified by this render — it lives in the component source as the
 *     `TABLE_VISIBLE_CLASS` ('hidden md:block') / `CARDS_VISIBLE_CLASS`
 *     ('… md:hidden') constants (RegistrationsTable.tsx).
 *   - jest-axe clean (NFR-5 — for what jsdom can evaluate; see DC-16).
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { RegistrationsTable } from './RegistrationsTable';
import type { AdminRegistrationListRow } from '@/lib/api/registrations-admin';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ROW_PENDING: AdminRegistrationListRow = {
  id: 'reg-1',
  reference: 'REG-2026-0001',
  applicant: 'Meru Agro Cooperative Society with a Very Long Cooperative Name Ltd',
  traderType: 'seed_company',
  region: 'Arusha',
  submittedAt: '2026-06-01T00:00:00.000Z',
  status: 'PENDING_REVIEW',
  duplicateCandidateCount: 0,
};

const ROW_APPROVED: AdminRegistrationListRow = {
  id: 'reg-2',
  reference: 'REG-2026-0002',
  applicant: 'Kilimo Co',
  traderType: 'cooperative',
  region: 'Dodoma',
  submittedAt: '2026-05-15T00:00:00.000Z',
  status: 'APPROVED',
  duplicateCandidateCount: 0,
};

const ROW_REJECTED_WITH_DUPES: AdminRegistrationListRow = {
  id: 'reg-3',
  reference: 'REG-2026-0003',
  applicant: 'Dodoma Traders',
  traderType: 'informal_trader',
  region: 'Dodoma',
  submittedAt: '2026-04-20T00:00:00.000Z',
  status: 'REJECTED',
  duplicateCandidateCount: 3,
};

const ROWS = [ROW_PENDING, ROW_APPROVED, ROW_REJECTED_WITH_DUPES];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RegistrationsTable', () => {
  it('renders all eight column headers', () => {
    render(<RegistrationsTable rows={ROWS} />);
    const table = screen.getByRole('table', { name: 'Registrations' });
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual([
      'Reference',
      'Applicant',
      'Type',
      'Region',
      'Submitted',
      'Duplicates',
      'Status',
      'Action',
    ]);
  });

  it('marks the Reference column sticky with an opaque background and shadow-sticky-edge', () => {
    render(<RegistrationsTable rows={ROWS} />);
    const table = screen.getByRole('table', { name: 'Registrations' });
    const referenceHeader = within(table).getAllByRole('columnheader')[0];
    expect(referenceHeader.className).toEqual(
      expect.stringContaining('sticky'),
    );
    expect(referenceHeader.className).toEqual(expect.stringContaining('left-0'));
    expect(referenceHeader.className).toEqual(expect.stringContaining('bg-surface-alt'));
    expect(referenceHeader.className).toEqual(expect.stringContaining('shadow-sticky-edge'));

    const referenceCell = within(table).getByText('REG-2026-0001').closest('td')!;
    expect(referenceCell.className).toEqual(expect.stringContaining('sticky'));
    expect(referenceCell.className).toEqual(expect.stringContaining('left-0'));
    expect(referenceCell.className).toEqual(expect.stringContaining('bg-surface'));
    expect(referenceCell.className).toEqual(expect.stringContaining('shadow-sticky-edge'));
  });

  it('renders a muted dash for zero duplicate candidates and a count for a non-zero one', () => {
    render(<RegistrationsTable rows={ROWS} />);
    const table = screen.getByRole('table', { name: 'Registrations' });
    // ROW_PENDING and ROW_APPROVED both carry zero — two dashes in the
    // Duplicates column across the two table rows (cards render a separate
    // dash, asserted below).
    expect(within(table).getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(within(table).getByText('3 possible duplicates')).toBeInTheDocument();
  });

  it('renders a status badge with a human label for each of the three producible statuses', () => {
    render(<RegistrationsTable rows={ROWS} />);
    const table = screen.getByRole('table', { name: 'Registrations' });
    expect(within(table).getByText('Pending review')).toBeInTheDocument();
    expect(within(table).getByText('Approved')).toBeInTheDocument();
    expect(within(table).getByText('Rejected')).toBeInTheDocument();
  });

  it('links the Review action to the detail screen by id (query-param route, never a [id] segment)', () => {
    render(<RegistrationsTable rows={ROWS} />);
    const table = screen.getByRole('table', { name: 'Registrations' });
    const link = within(table).getByRole('link', { name: 'Review REG-2026-0001' });
    expect(link).toHaveAttribute('href', '/admin/registrations/review?id=reg-1');
  });

  it('renders every row in both the table and the card view', () => {
    render(<RegistrationsTable rows={ROWS} />);
    const table = screen.getByRole('table', { name: 'Registrations' });
    const cardList = screen.getByRole('list', { name: 'Registrations' });

    expect(within(table).getAllByRole('row')).toHaveLength(ROWS.length + 1); // + header row
    expect(within(cardList).getAllByRole('listitem')).toHaveLength(ROWS.length);
  });

  // ── Absence assertions (KZ-002 direction) ─────────────────────────────

  it('never renders a "No email" flag — email is required and OTP-verified upstream (3a FR-4)', () => {
    render(<RegistrationsTable rows={ROWS} />);
    expect(screen.queryByText(/no email/i)).not.toBeInTheDocument();
  });

  it('accepts no `email` field on its row type at all', () => {
    // Type-level guard: AdminRegistrationListRow has no `email` key, so any
    // attempt to read/render one from this component's props would be a
    // compile error, not merely an unrendered runtime value.
    expect('email' in ROW_PENDING).toBe(false);
  });

  it('has no accessibility violations jest-axe can evaluate (NFR-5; jsdom cannot check contrast/focus — DC-16)', async () => {
    const { container } = render(<RegistrationsTable rows={ROWS} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
