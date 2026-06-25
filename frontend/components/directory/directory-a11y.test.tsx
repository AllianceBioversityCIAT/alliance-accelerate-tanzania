/**
 * Automated accessibility tests for DirectoryView — T-7, NFR-3.
 *
 * Uses jest-axe to assert WCAG 2.1 AA compliance against the full rendered
 * DirectoryView composition: heading + search/filters + result count + actor
 * card grid + pagination controls.
 *
 * Mocks:
 *   - @/lib/api/useActors   — controls hook state without network calls
 *     (same pattern as DirectoryView.test.tsx).
 *   - next/navigation        — useSearchParams + useRouter used by DirectoryView
 *     and all sub-components.
 *
 * Cases exercised:
 *   (1) Results state   — useActors returns a populated actor list.
 *   (2) Loading state   — useActors returns loading=true / data=null.
 *   (3) Error state     — useActors returns error=true / data=null.
 *   (4) Empty state     — useActors returns data.total=0 / data=[].
 *   (5) Multi-page      — total > pageSize so pagination nav renders.
 * All must pass axe with toHaveNoViolations().
 *
 * Also asserts (NFR-3):
 *   - Search input is labeled and keyboard-reachable (role="searchbox").
 *   - Filter selects are labeled (aria-label present).
 *   - ResultCount region has aria-live="polite" (announced on update).
 *
 * Also asserts (NFR-1 / FR-1):
 *   - No "phone" or "email" substring appears in rendered Directory cards.
 *
 * Also asserts (NFR-6):
 *   - The actor card grid container carries the 1→2→3 responsive Tailwind classes.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

// Extend jest-dom expect with jest-axe matcher.
expect.extend(toHaveNoViolations);

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import DirectoryView from './DirectoryView';
import type { PublicActor, PublicActorList } from '@/lib/api/actors';

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before dynamic imports resolve
// ---------------------------------------------------------------------------

// useActors — controls hook state for each test scenario.
jest.mock('@/lib/api/useActors', () => ({
  useActors: jest.fn(),
}));

// next/navigation — useSearchParams + useRouter consumed by DirectoryView.
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => new URLSearchParams()),
  useRouter: jest.fn(() => ({ replace: jest.fn() })),
}));

/* eslint-disable */
const { useActors } = require('@/lib/api/useActors') as {
  useActors: jest.Mock;
};
/* eslint-enable */

// ---------------------------------------------------------------------------
// Fixtures — consented actors with no PII (no phone/email)
// ---------------------------------------------------------------------------

const ACTOR_A: PublicActor = {
  id: 'actor-1',
  traderName: 'Dodoma Seeds Ltd',
  region: 'Dodoma',
  district: 'Dodoma Urban',
  traderType: 'seed_company',
  capacityTons: 500,
  crops: ['sorghum'],
  gps: { lat: -6.17, long: 35.74 },
};

const ACTOR_B: PublicActor = {
  id: 'actor-2',
  traderName: 'Mbeya Cooperative',
  region: 'Mbeya',
  district: null,
  traderType: 'cooperative',
  capacityTons: null,
  crops: ['common_bean', 'groundnut'],
  gps: null,
};

const ACTOR_LIST: PublicActorList = {
  data: [ACTOR_A, ACTOR_B],
  page: 1,
  pageSize: 20,
  total: 2,
};

const EMPTY_LIST: PublicActorList = {
  data: [],
  page: 1,
  pageSize: 20,
  total: 0,
};

/** total > pageSize so DirectoryPagination renders. */
const MULTI_PAGE_LIST: PublicActorList = {
  data: [ACTOR_A],
  page: 1,
  pageSize: 20,
  total: 25,
};

// ---------------------------------------------------------------------------
// Helper — render DirectoryView inside a <main> landmark so axe can
// evaluate the document structure (landmark + heading hierarchy).
// ---------------------------------------------------------------------------

function renderDirectory() {
  return render(
    <main>
      <DirectoryView />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DirectoryView — axe accessibility', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── (1) Results state ─────────────────────────────────────────────────────

  it('has no axe violations in the results state (data present)', async () => {
    useActors.mockReturnValue({ data: ACTOR_LIST, loading: false, error: false });

    const { container } = renderDirectory();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  // ── (2) Loading state ─────────────────────────────────────────────────────

  it('has no axe violations in the loading state', async () => {
    useActors.mockReturnValue({ data: null, loading: true, error: false });

    const { container } = renderDirectory();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  // ── (3) Error state ───────────────────────────────────────────────────────

  it('has no axe violations in the error state', async () => {
    useActors.mockReturnValue({ data: null, loading: false, error: true });

    const { container } = renderDirectory();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  // ── (4) Empty state ───────────────────────────────────────────────────────

  it('has no axe violations in the empty state (zero results)', async () => {
    useActors.mockReturnValue({ data: EMPTY_LIST, loading: false, error: false });

    const { container } = renderDirectory();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  // ── (5) Multi-page state (pagination nav renders) ─────────────────────────

  it('has no axe violations when pagination controls are visible', async () => {
    useActors.mockReturnValue({ data: MULTI_PAGE_LIST, loading: false, error: false });

    const { container } = renderDirectory();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------
// Keyboard / focus / ARIA assertions (NFR-3)
// ---------------------------------------------------------------------------

describe('DirectoryView — keyboard, focus, and ARIA', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders a labeled search input (role=searchbox) — keyboard-reachable', () => {
    useActors.mockReturnValue({ data: ACTOR_LIST, loading: false, error: false });
    renderDirectory();

    // DirectorySearch renders <input type="search"> with aria-label
    const searchInput = screen.getByRole('searchbox', { name: /search organizations/i });
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).not.toHaveAttribute('tabindex', '-1');
  });

  it('renders labeled crop, role, and region filter selects', () => {
    useActors.mockReturnValue({ data: ACTOR_LIST, loading: false, error: false });
    renderDirectory();

    // DirectoryFilters: three selects with aria-label attributes (NFR-3)
    expect(screen.getByLabelText(/filter by crop/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter by actor role/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter by region/i)).toBeInTheDocument();
  });

  it('exposes ResultCount in an aria-live="polite" region (NFR-3)', () => {
    useActors.mockReturnValue({ data: ACTOR_LIST, loading: false, error: false });
    renderDirectory();

    // ResultCount renders a <p aria-live="polite" aria-atomic="true">
    const liveRegion = screen.getByText('2 organizations found');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
  });

  it('renders pagination buttons with accessible names when multi-page', () => {
    useActors.mockReturnValue({ data: MULTI_PAGE_LIST, loading: false, error: false });
    renderDirectory();

    expect(
      screen.getByRole('button', { name: /previous page/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /next page/i }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// PII-omission assertions — no phone/email in the rendered Directory (NFR-1)
// ---------------------------------------------------------------------------

describe('DirectoryView — PII omission (NFR-1 / FR-1)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders no "phone" substring in actor cards (results state)', () => {
    useActors.mockReturnValue({ data: ACTOR_LIST, loading: false, error: false });
    renderDirectory();

    expect(screen.queryByText(/phone/i)).not.toBeInTheDocument();
  });

  it('renders no "email" substring in actor cards (results state)', () => {
    useActors.mockReturnValue({ data: ACTOR_LIST, loading: false, error: false });
    renderDirectory();

    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
  });

  it('renders no "phone" or "email" in the loading state', () => {
    useActors.mockReturnValue({ data: null, loading: true, error: false });
    renderDirectory();

    expect(screen.queryByText(/phone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
  });

  it('renders no "phone" or "email" in the error state', () => {
    useActors.mockReturnValue({ data: null, loading: false, error: true });
    renderDirectory();

    expect(screen.queryByText(/phone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Responsive grid class assertions (NFR-6)
// ---------------------------------------------------------------------------

describe('DirectoryView — responsive grid classes (NFR-6)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the actor grid with 1→2→3 responsive Tailwind column classes', () => {
    useActors.mockReturnValue({ data: ACTOR_LIST, loading: false, error: false });
    renderDirectory();

    // The actor <ul> in the results state carries all three breakpoint classes.
    const grid = screen.getByRole('list', { name: /actor directory/i });
    expect(grid).toHaveClass('grid-cols-1');
    expect(grid).toHaveClass('sm:grid-cols-2');
    expect(grid).toHaveClass('lg:grid-cols-3');
  });
});

// ---------------------------------------------------------------------------
// NFR-1 / FR-7: Reduced-motion / GSAP-mocked final-state assertions
//
// DirectoryView uses useReveal (stagger grid entrance) and a useGSAP re-reveal
// on query change — both gated on prefers-reduced-motion via gsap.matchMedia.
// The GSAP mock makes matchMedia.add() a no-op, so no animation callback fires.
// This is exactly the FR-7 reduced-motion path: all actor cards must be visible
// immediately in their final state without any GSAP run (FR-8 progressive
// enhancement). The assertions below make that contract explicit.
// ---------------------------------------------------------------------------

describe('DirectoryView — reduced-motion / GSAP-mocked final-state (NFR-1, FR-6, FR-7, FR-8)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('FR-7/FR-6/FR-8: actor cards are immediately visible in the reduced-motion (GSAP-mocked) path', () => {
    // GSAP mock: useReveal and re-reveal useGSAP both call matchMedia.add which
    // is a no-op — the stagger animation never fires. Cards must render in their
    // final visible state (FR-8 progressive enhancement, FR-7 reduced-motion).
    useActors.mockReturnValue({ data: ACTOR_LIST, loading: false, error: false });
    renderDirectory();

    // Both actor cards must be visible without the stagger entrance running.
    expect(screen.getByText('Dodoma Seeds Ltd')).toBeVisible();
    expect(screen.getByText('Mbeya Cooperative')).toBeVisible();
  });

  it('FR-7/FR-8: directory heading and search are immediately visible in the reduced-motion path', () => {
    useActors.mockReturnValue({ data: ACTOR_LIST, loading: false, error: false });
    renderDirectory();

    // Page heading and search bar must be visible without motion.
    expect(screen.getByRole('heading', { name: /actor directory/i })).toBeVisible();
    expect(screen.getByRole('searchbox', { name: /search organizations/i })).toBeVisible();
  });
});
