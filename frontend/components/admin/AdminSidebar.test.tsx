// @sdd-spec admin/registration-review-queue (T-12)
/**
 * Unit tests for AdminSidebar's new Registrations entry (FR-9 scenario 5).
 *
 * Covers:
 *   - A "Registrations" link is present and points at /admin/registrations.
 *   - `NavItem`'s shape is unchanged: this suite renders every entry through
 *     the SAME code path (no `role` prop, no per-item gating branch) —
 *     `AdminSidebar.tsx`'s only gating is the `enabled` boolean it already
 *     had. There is no server- or role-aware behaviour to assert here
 *     because none was added: the shell's `RequireRole allow={['Admin']}` in
 *     `app/(admin)/layout.tsx` is what keeps Staff from ever rendering this
 *     component at all (FR-9 scenario 5's "inherit the shell's gate"
 *     clause) — a claim about a file this test does not exercise, so it is
 *     not re-asserted here.
 *   - **R17** — the negative constraint above previously lived ONLY in this
 *     doc comment; nothing reddened if `NavItem` grew a per-item `role`
 *     field. `NavItem` is a file-private, erased-at-runtime interface (not
 *     exported, and this project's Jest transform does not type-check), so
 *     the only seam that can observe its shape is the source text itself —
 *     the same "token grep" convention `RegistrationDetailPanel.test.tsx`'s
 *     import-identity check already uses for an equally un-importable
 *     constraint.
 */

import fs from 'fs';
import path from 'path';

import React from 'react';
import { render, screen } from '@testing-library/react';

const mockUsePathname = jest.fn(() => '/admin/registrations');

jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

import { AdminSidebar } from './AdminSidebar';

describe('AdminSidebar — Registrations entry', () => {
  it('renders a Registrations link to /admin/registrations', () => {
    render(<AdminSidebar />);
    const link = screen.getByRole('link', { name: 'Registrations' });
    expect(link).toHaveAttribute('href', '/admin/registrations');
  });

  it('marks Registrations as the active item when the route matches', () => {
    mockUsePathname.mockReturnValue('/admin/registrations');
    render(<AdminSidebar />);
    expect(screen.getByRole('link', { name: 'Registrations' })).toHaveAttribute('aria-current', 'page');
  });

  it('still renders Users and Actors unchanged alongside the new entry', () => {
    render(<AdminSidebar />);
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/admin/users');
    expect(screen.getByRole('link', { name: 'Actors' })).toHaveAttribute('href', '/admin/actors');
  });

  // R17 — FR-9 scenario 5's "BUT it must NOT introduce per-item role gating
  // on NavItem, whose shape is { label, href, enabled }" was previously
  // asserted only in this file's JSDoc, never by any test. A real `role`
  // field added to the interface must redden this.
  it('R17 — NavItem\'s shape stays exactly { label, href, enabled } — no per-item role field', () => {
    const source = fs.readFileSync(path.join(__dirname, 'AdminSidebar.tsx'), 'utf8');
    const match = source.match(/interface NavItem \{([^}]*)\}/);
    expect(match).not.toBeNull();

    const fields = (match as RegExpMatchArray)[1]
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/;$/, ''));

    expect(fields).toEqual(['label: string', 'href: string', 'enabled: boolean']);
  });
});
