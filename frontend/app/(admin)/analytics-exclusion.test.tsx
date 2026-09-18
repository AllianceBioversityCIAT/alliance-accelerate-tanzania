// @sdd-spec enhancement/usage-analytics (T-5)
/**
 * analytics-exclusion.test.tsx — the FR-5 admin-exclusion gate
 * (requirements.md FR-5 both scenarios + `BUT` + `AND IT MUST`;
 * design.md §5.1, DD-3; tasks.md T-5).
 *
 * This is the single highest-consequence assertion in the spec: FR-5's
 * guarantee that administrative usage cannot pollute public analytics
 * rests entirely on this file.
 *
 * ── Clause sweep (tasks.md T-5 brief) ─────────────────────────────────────
 *  1. An (admin) route renders no GA script element
 *     → 'renders no GA4 script element even with a granted consent record…'
 *  2. An (admin) route renders no consent banner
 *     → 'renders no consent banner even with a granted consent record…'
 *  3. Both hold WITH a granted record present in storage
 *     → both tests above seed real localStorage via writeConsent('granted')
 *       in beforeEach, and the first test in the describe block asserts
 *       readConsent() actually resolved to 'granted' before rendering, so a
 *       seed that silently failed to take could not produce a false pass.
 *  4. The admin shell genuinely rendered when 1–3 were asserted (anti-vacuity)
 *     → 'renders the real admin shell (anti-vacuity, KZ-002)…' — asserts the
 *       sidebar nav (getByRole('navigation', {name: /admin navigation/i})),
 *       the main region, and the page's own child content, all under a
 *       genuine ADMIN_SESSION (not a denied/redirected one).
 *  5. The root layout contains no analytics reference
 *     → 'app/layout.tsx contains no reference to the analytics integration'
 *       — a source-level sweep, not a render, per the established
 *       GoogleAnalytics.test.tsx / ConsentBanner.test.tsx convention.
 *  6. The exclusion mechanism is layout placement, not a pathname allowlist
 *     → '(public)/layout.tsx mounts the provider unconditionally…' — source
 *       sweep proving PublicLayout is not even a 'use client' component and
 *       contains no `usePathname`/pathname reference, so it cannot possibly
 *       gate the mount on the current route.
 *  7. The gate is proven to fail when the provider moves to the root layout
 *     → NOT an assertion in this file — this is the mandated deliberate-
 *       failure PROBE, executed by hand once this file is green: the
 *       provider is temporarily added to `app/layout.tsx`, the full suite is
 *       re-run UNFILTERED, and the verbatim failing output (clause 5's
 *       source-sweep test turning red, and only that test) is pasted into
 *       execution.md, before the probe is reverted. See execution.md T-5.
 *  8. A (public) route DOES mount provider + banner + script (the converse)
 *     → 'PublicLayout — the converse' describe block below: one test proves
 *       the GA4 script mounts once a granted record is seeded, a second
 *       proves the banner renders when no record is stored. Without this,
 *       "absent everywhere" (a provider wired nowhere at all) would pass
 *       every assertion above identically to a correctly-scoped exclusion.
 *  9. The sticky-footer flex column is preserved
 *     → 'preserves the existing sticky-footer flex column…' — asserts the
 *       wrapping div's className, and that Header/<main>/Footer are still
 *       siblings in that order, unchanged by the ConsentProvider wrap.
 *
 * ── Why this file lives under app/(admin)/ but also imports PublicLayout ──
 * The task names this exact path (`frontend/app/(admin)/analytics-exclusion
 * .test.tsx`) as the one new test file. Clause 8's converse coverage and
 * clause 9's structural-preservation check are folded in here rather than
 * split into a second file, since both are load-bearing to the same FR-5
 * gate: a suite that only ever asserts absence cannot distinguish a working
 * exclusion from a provider that renders nowhere at all.
 *
 * ── Harness pattern ────────────────────────────────────────────────────────
 * Mirrors `frontend/app/(admin)/layout.test.tsx` (the task's named exemplar):
 * mocks `next/navigation` (useRouter, usePathname) and `next/image`, and
 * drives a real `SessionContext.Provider` with an ADMIN_SESSION so
 * `RequireRole` actually renders the shell rather than redirecting.
 * `GoogleAnalytics.test.tsx`'s script-element query/cleanup pattern and
 * `ConsentBanner.test.tsx`'s `getByRole('region', {name: 'Cookie consent'})`
 * query are reused for consistency across the spec's test files.
 */

import fs from 'fs';
import path from 'path';

import React from 'react';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock next/navigation — needed by AdminLayout (useRouter, usePathname) and,
// when rendering PublicLayout, by Header (usePathname for nav active state).
// ---------------------------------------------------------------------------

const mockRouterReplace = jest.fn();
const mockRouterPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace, push: mockRouterPush }),
  usePathname: () => '/admin/users',
}));

// ---------------------------------------------------------------------------
// Mock next/image — AdminLayout renders an <Image> brand logo.
// ---------------------------------------------------------------------------

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, ...rest }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line jsx-a11y/alt-text
    <img alt={alt} {...rest} />
  ),
}));

// ---------------------------------------------------------------------------
// Mock useSession / useAuth — consumed by AdminLayout's top-bar user slot
// and by PublicLayout's Header. Public routes must render correctly with no
// session provider mounted at all (Header/useSession already degrades to
// the Public default outside a real SessionProvider — see useSession.ts) so
// no mock is required there; this mock only matters for the admin tests.
// ---------------------------------------------------------------------------

const mockUseSession = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/auth/useSession', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({
    signOut: mockSignOut,
    signIn: jest.fn(),
    refresh: jest.fn(),
    loading: false,
  }),
}));

// ---------------------------------------------------------------------------
// Real SessionContext — RequireRole reads useSessionContext() directly.
// ---------------------------------------------------------------------------

import { SessionContext } from '@/lib/auth/SessionProvider';
import type { SessionContextValue } from '@/lib/auth/SessionProvider';
import type { Session } from '@/lib/auth/useSession';

const ADMIN_SESSION: Session = {
  role: 'Admin',
  user: { name: 'Alice', role: 'Admin' },
};

function renderWithSession(ui: React.ReactElement, session: Session) {
  const value: SessionContextValue = {
    session,
    loading: false,
    signIn: async () => ({ status: 'error', message: '' }),
    signOut: async () => {},
    refresh: async () => {},
  };
  return render(
    <SessionContext.Provider value={value}>{ui}</SessionContext.Provider>,
  );
}

// ---------------------------------------------------------------------------
// Real consent storage — clause 3 requires an actual granted record, not an
// injected context value (T-2's review: "injecting context past storage"
// would not exercise the real read path this exclusion depends on).
// ---------------------------------------------------------------------------

import { readConsent, writeConsent, clearConsent } from '@/lib/analytics/consent-storage';

// ---------------------------------------------------------------------------
// Import components under test (after all mocks).
// ---------------------------------------------------------------------------

import AdminLayout from './layout';
import PublicLayout from '../(public)/layout';

// ---------------------------------------------------------------------------
// GA4 script helpers — mirrors GoogleAnalytics.test.tsx.
// ---------------------------------------------------------------------------

const GA_SCRIPT_ID = 'ga4-gtag-js';

function queryGaScripts(): NodeListOf<HTMLScriptElement> {
  return document.querySelectorAll<HTMLScriptElement>(`script#${GA_SCRIPT_ID}`);
}

function vendorGlobals(): { gtag: unknown; dataLayer: unknown } {
  const w = window as unknown as { gtag?: unknown; dataLayer?: unknown };
  return { gtag: w.gtag, dataLayer: w.dataLayer };
}

const ORIGINAL_GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

function resetGaEnvAndGlobals() {
  queryGaScripts().forEach((el) => el.remove());
  delete (window as unknown as { gtag?: unknown }).gtag;
  delete (window as unknown as { dataLayer?: unknown }).dataLayer;
  if (ORIGINAL_GA_ID === undefined) {
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  } else {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = ORIGINAL_GA_ID;
  }
}

// ---------------------------------------------------------------------------
// Source-sweep helpers (clauses 5, 6) — reads a layout file's own source
// rather than its rendered output. Mirrors GoogleAnalytics.test.tsx's
// FR-4 sweep and ConsentBanner.test.tsx's `readComponentSource`.
// ---------------------------------------------------------------------------

function readSource(...segments: string[]): string {
  return fs.readFileSync(path.join(__dirname, ...segments), 'utf8');
}

/** Strips comments so prose (which necessarily discusses the very thing a
 *  sweep forbids, in order to explain why it's absent — e.g. this file's own
 *  file-level comment on `(public)/layout.tsx` explaining there is no
 *  pathname check) cannot false-positive a source sweep. Mirrors
 *  GoogleAnalytics.test.tsx's and ConsentBanner.test.tsx's `codeOnly`. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

// =============================================================================
// Clauses 1–4 — an (admin) route, with a real Admin session, renders no GA4
// script and no consent banner, even with a granted consent record present.
// =============================================================================

describe('AdminLayout — FR-5 admin-exclusion gate (scenario 1, AND IT MUST)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue(ADMIN_SESSION);
    // Clause 3: a REAL granted record, written through the same storage
    // module ConsentProvider reads from — not a context value injected past
    // storage (forward pointer carried from T-2's review).
    writeConsent('granted');
    // NOTE: NEXT_PUBLIC_GA_MEASUREMENT_ID is deliberately NOT set here, and
    // is instead set per-test to a DISTINCT value immediately before each
    // render. `next/script` keeps a module-level `ScriptCache` keyed by
    // `src` that persists for this file's lifetime (see
    // GoogleAnalytics.test.tsx's file header) — a SHARED id across tests in
    // this block would mean a defect that mounted the script in one test
    // (e.g. the anti-vacuity render) "used up" the cache entry for that
    // `src`, silently suppressing the DOM append on a LATER test that
    // asserts absence — masking the very defect this block exists to catch.
    // Verified empirically: with a shared id, the mutation probe below
    // (wiring ConsentProvider/GoogleAnalytics into AdminLayout) reddened
    // this block's script-absence test only when run in isolation (`-t`)
    // and PASSED it when run as part of the full file, because the
    // preceding anti-vacuity test had already primed ScriptCache for that
    // `src`. Distinct ids per test close that gap.
  });

  afterEach(() => {
    clearConsent();
    resetGaEnvAndGlobals();
  });

  function renderAdmin() {
    return renderWithSession(
      <AdminLayout>
        <div data-testid="admin-page-content">Admin page content</div>
      </AdminLayout>,
      ADMIN_SESSION,
    );
  }

  it('seeds a real granted consent record before every test in this block (sanity, clause 3)', () => {
    expect(readConsent()).toBe('granted');
  });

  it('renders the real admin shell (anti-vacuity, KZ-002) — sidebar nav, main region and page content are present', () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-ADMIN-SHELL-PROBE';
    renderAdmin();

    expect(
      screen.getByRole('navigation', { name: /admin navigation/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByTestId('admin-page-content')).toBeInTheDocument();
    // Proves the shell rendered because the role check passed, not because
    // a redirect merely hadn't fired yet.
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('renders no GA4 script element even with a granted consent record present in storage (clauses 1, 3)', () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-ADMIN-SCRIPT-PROBE';
    renderAdmin();

    expect(queryGaScripts()).toHaveLength(0);
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(vendorGlobals()).toEqual({ gtag: undefined, dataLayer: undefined });
  });

  it('renders no consent banner even with a granted consent record present in storage (clauses 2, 3)', () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-ADMIN-BANNER-PROBE';
    renderAdmin();

    expect(
      screen.queryByRole('region', { name: 'Cookie consent' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/we use cookies/i)).not.toBeInTheDocument();
  });

  // ── Supplementary — closes a real vacuity gap this block's own mutation
  //    probe found (execution.md T-5): the test immediately above seeds
  //    'granted' storage, per FR-5's literal acceptance criterion. But
  //    ConsentBanner (T-4) only ever attempts to render while
  //    `showBanner` — true ONLY when consent === 'undecided' — so under a
  //    'granted' record the banner would stay absent regardless of WHERE
  //    it is mounted. Verified empirically: wiring
  //    ConsentProvider+ConsentBanner+GoogleAnalytics directly into
  //    AdminLayout as a mutation probe reddened the script test above, but
  //    did NOT redden the banner test above — the granted-storage
  //    precondition made it structurally incapable of failing on the
  //    banner axis. This test uses 'undecided' storage instead — the only
  //    state where a real ConsentBanner would actually attempt to render —
  //    so a banner wired into the admin tree has somewhere to be caught.
  it('renders no consent banner when no prior choice is stored either (undecided — the only state a real banner would attempt to show)', () => {
    clearConsent();
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-ADMIN-BANNER-UNDECIDED-PROBE';
    renderAdmin();

    expect(
      screen.queryByRole('region', { name: 'Cookie consent' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/we use cookies/i)).not.toBeInTheDocument();
  });
});

// =============================================================================
// Clause 5 — the root layout contains no reference to the analytics
// integration. Source-level, not a render: RootLayout wires a real
// SessionProvider (Amplify config + async session resolution), which is out
// of scope to drive here — the property FR-5 actually needs ("no reference
// exists") is exactly what a source sweep proves, and it is what the
// mandated deliberate-failure probe (clause 7) is run against.
// =============================================================================

describe('Root layout (app/layout.tsx) — FR-5 scenario 2', () => {
  it('contains no reference to the analytics integration', () => {
    const source = codeOnly(readSource('..', 'layout.tsx'));

    expect(source).not.toMatch(/ConsentProvider/);
    expect(source).not.toMatch(/ConsentBanner/);
    expect(source).not.toMatch(/GoogleAnalytics/);
    expect(source).not.toMatch(/analytics/i);
  });
});

// =============================================================================
// Clause 6 — the exclusion mechanism is layout placement, not a pathname
// allowlist. Proven structurally: PublicLayout is not even a 'use client'
// component and contains no usePathname/pathname reference of any kind, so
// there is no runtime check it could use to conditionally gate the mount —
// the provider's presence in the tree is unconditional by construction.
// =============================================================================

describe('(public)/layout.tsx — FR-5 BUT: layout placement, not a pathname allowlist', () => {
  it('mounts the provider unconditionally — no pathname check gates it', () => {
    const source = codeOnly(readSource('..', '(public)', 'layout.tsx'));

    expect(source).not.toMatch(/usePathname/);
    expect(source).not.toMatch(/pathname/i);
    expect(source).not.toMatch(/'use client'/);
  });
});

// =============================================================================
// Clause 8 — the converse. A (public) route DOES mount the provider, the
// banner and the script: without this, a provider wired into nothing (or
// left in a dead branch) would pass every absence assertion above just as
// well as a correctly-scoped exclusion.
// =============================================================================

describe('PublicLayout — the converse: (public) routes DO mount the analytics stack', () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({ role: 'Public', user: null });
  });

  afterEach(() => {
    clearConsent();
    resetGaEnvAndGlobals();
  });

  it('mounts exactly one GA4 script element once a granted consent record is present', () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-PUBLIC-CONVERSE';
    writeConsent('granted');

    render(
      <PublicLayout>
        <div data-testid="public-page-content">Public page content</div>
      </PublicLayout>,
    );

    expect(queryGaScripts()).toHaveLength(1);
    expect(screen.getByTestId('public-page-content')).toBeInTheDocument();
  });

  it('renders the consent banner when no prior choice is stored', () => {
    clearConsent();

    render(
      <PublicLayout>
        <div data-testid="public-page-content">Public page content</div>
      </PublicLayout>,
    );

    expect(
      screen.getByRole('region', { name: 'Cookie consent' }),
    ).toBeInTheDocument();
  });
});

// =============================================================================
// Clause 9 — the sticky-footer flex column is preserved. The ConsentProvider
// wrap must not disturb the existing shell structure or classes.
// =============================================================================

describe('PublicLayout — sticky-footer flex column preserved', () => {
  afterEach(() => {
    clearConsent();
  });

  it('preserves the existing sticky-footer flex column and element order', () => {
    clearConsent();

    const { container } = render(
      <PublicLayout>
        <div data-testid="public-page-content">Public page content</div>
      </PublicLayout>,
    );

    const shell = container.querySelector('.flex.min-h-screen.flex-col');
    expect(shell).not.toBeNull();

    const main = shell!.querySelector(':scope > main');
    expect(main).not.toBeNull();
    expect(main).toHaveClass('flex-1');
    expect(main).toContainElement(screen.getByTestId('public-page-content'));

    // Header, then <main>, then Footer — unchanged sibling order inside the
    // flex column (Footer renders a <footer> landmark; Header a <header>).
    const children = Array.from(shell!.children).map((el) => el.tagName);
    expect(children).toEqual(['HEADER', 'MAIN', 'FOOTER']);
  });
});
