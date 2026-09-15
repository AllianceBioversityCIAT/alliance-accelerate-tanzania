/**
 * Automated accessibility + content tests for the /cookies page — T-4,
 * FR-3, design.md §5.2, §5.3. Extended at legal/legal-notices-and-consent-
 * copy T-6 (FR-6) — the consent banner now re-routes here, and this file
 * closes the two coverage gaps `privacy-a11y.test.tsx`'s header docblock
 * recorded when T-5 moved the cookie content off `/privacy`:
 *
 *  1. Banner reactivity (DD-4) — see the "banner reacts to a stored-choice
 *     change, with no reload" describe block below. Renders a real
 *     `ConsentProvider` + `ConsentBanner` alongside this page (mirroring
 *     the old `/privacy` test's `renderWithProvider`) and proves the
 *     banner disappears immediately when `ConsentChoiceControl` changes
 *     the stored choice — not merely that `readConsent()` changed.
 *  2. The withdrawal rider's finer phrasing — see clause (d) below, which
 *     now also asserts the exact phrases "including as you move between
 *     pages" and "stops the next time you load the site", plus a negative
 *     guard against "until you navigate away" (a subtly wrong description
 *     of the behaviour the old `/privacy` test guarded against regressing
 *     to).
 *
 * `/cookies` is the consent banner's disclosure destination as of T-6.
 * The six clauses below (a)-(f) are asserted independently, one `it`
 * block each, so losing any single clause reddens exactly one named
 * test rather than a combined check masking which fact went missing
 * (see the task brief's "each is a separate assertion" instruction).
 *
 * NOT covered here (NFR-2, NFR-5): jsdom has no layout engine and
 * evaluates neither contrast nor rendered legibility. A passing suite
 * says nothing about whether the tokens used read as legible text at
 * any real viewport — that is the human check routed to T-10's HITL
 * pause, same as LegalDocumentView.test.tsx and privacy-a11y.test.tsx
 * already record.
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

jest.mock('next/navigation', () => ({
  usePathname: jest.fn().mockReturnValue('/cookies'),
}));

import CookiesPage from './page';
import { ConsentProvider } from '@/lib/analytics/ConsentProvider';
import { ConsentBanner } from '@/components/analytics/ConsentBanner';
import { readConsent } from '@/lib/analytics/consent-storage';

function renderCookiesPage() {
  return render(
    <main>
      <CookiesPage />
    </main>
  );
}

// The page's one 'use client' island (ConsentChoiceControl) reads
// useConsentContext(). Without a real provider it falls back to
// ConsentProvider.tsx's DEFAULT_CONTEXT — an inert value (loading:
// false, consent: 'undecided', a no-op setConsent) sufficient for the
// axe/heading/content assertions below, but not for proving the
// control actually changes the *stored* choice, which needs a real
// provider (mirrors privacy-a11y.test.tsx's renderWithProvider()).
function renderWithProvider() {
  return render(
    <ConsentProvider>
      <main>
        <CookiesPage />
      </main>
    </ConsentProvider>
  );
}

// Gap 1 (T-6): mirrors the old `/privacy` test's `renderWithProvider`,
// which additionally mounted `ConsentBanner` as a sibling consumer of the
// same `ConsentProvider` so banner reactivity (DD-4) could be proven, not
// merely `readConsent()`'s stored value.
function renderWithProviderAndBanner() {
  return render(
    <ConsentProvider>
      <ConsentBanner />
      <main>
        <CookiesPage />
      </main>
    </ConsentProvider>
  );
}

describe('/cookies page — accessibility (NFR-2)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('has no axe violations with a real ConsentProvider mounted (WCAG 2.1 AA)', async () => {
    const { container } = renderWithProvider();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  it('has exactly one h1', () => {
    renderCookiesPage();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('/cookies page — FR-3 content clauses (each a separate, independently-failing assertion)', () => {
  // (a) Google Analytics is the tool, Google is the third-party recipient.
  it('(a) names Google Analytics as the tool and Google as the third-party recipient', () => {
    renderCookiesPage();

    const section = screen
      .getByRole('heading', { name: /what cookies this site sets/i })
      .closest('section');
    expect(section).not.toBeNull();
    const scoped = within(section as HTMLElement);

    expect(scoped.getByText(/google analytics/i)).toBeInTheDocument();
    expect(scoped.getByText(/sent to google/i)).toBeInTheDocument();
  });

  // (b) All four GA4 signals, with city-level geography stated explicitly
  // (ADR-011 — understating this granularity was a real defect).
  it('(b) lists all four GA4 signals, including geography at country, region AND city level', () => {
    renderCookiesPage();

    const section = screen
      .getByRole('heading', { name: /what information is collected/i })
      .closest('section');
    expect(section).not.toBeNull();
    const scoped = within(section as HTMLElement);

    expect(scoped.getByText(/page views/i)).toBeInTheDocument();
    expect(scoped.getByText(/sessions/i)).toBeInTheDocument();
    expect(
      scoped.getByText(/geographic origin at country, region, and city level/i)
    ).toBeInTheDocument();
    expect(scoped.getByText(/device and browser category/i)).toBeInTheDocument();
  });

  // (c) No analytics cookie is set before consent is granted.
  it('(c) states no analytics cookie is set before consent is granted', () => {
    renderCookiesPage();

    expect(screen.getByText(/no analytics cookie is set before you consent/i)).toBeInTheDocument();
  });

  // (d) The withdrawal asymmetry: accepting is immediate, rejecting is
  // deferred to the next page load. Also carries the rider's finer
  // phrasing and its negative guard (T-6 gap 2, restored from the old
  // `/privacy` test): already-loaded analytics survives a client-side
  // route change and stops only on the next real page load — never
  // "until you navigate away", which would be a subtly wrong description
  // of the behaviour.
  it('(d) discloses the withdrawal asymmetry — accepting immediate, rejecting deferred — with the rider stated precisely', () => {
    renderCookiesPage();

    const asymmetry = screen.getByText(/rejecting takes effect from your next page load/i);
    expect(asymmetry).toBeInTheDocument();
    expect(asymmetry.textContent).toMatch(/accepting takes effect immediately/i);
    expect(asymmetry.textContent).toMatch(/including as you move between pages/i);
    expect(asymmetry.textContent).toMatch(/stops the next time you load the site/i);
    // Guards against regressing to a subtly wrong description of the
    // behaviour — the rider states the cutoff is the next page load, not
    // the act of navigating within the site.
    expect(asymmetry.textContent).not.toMatch(/until you navigate away/i);
  });

  // (e) This site does not itself delete cookies already set.
  it('(e) states this site does not itself delete cookies already set', () => {
    renderCookiesPage();

    expect(
      screen.getByText(/does not remove\s*any analytics cookies already set/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/this site does not delete cookies itself/i)).toBeInTheDocument();
  });

  // (f) NEGATIVE — the module must NOT claim cookies are used for
  // session/administrator authentication, fraud/unauthorized-access
  // detection, performance/reliability, or troubleshooting/maintenance.
  // NFR-4's verified inventory: the only cookies this site sets are
  // GA4's; the consent choice and Cognito session tokens live in
  // localStorage; the backend emits no Set-Cookie. Rather than assert a
  // *negation* sentence is present (which would itself have to contain
  // the forbidden words, making a keyword-absence check unusable — see
  // cookies.ts's header comment), the content module simply never
  // mentions these purposes: each of the four is asserted absent from
  // the rendered page, independently, so a mutation re-introducing any
  // one of them reddens its own line without the other three moving.
  it('(f) does NOT claim cookies are used for session/administrator authentication', () => {
    renderCookiesPage();
    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toMatch(/authenticat/i);
  });

  it('(f) does NOT claim cookies are used for fraud or unauthorized-access detection', () => {
    renderCookiesPage();
    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toMatch(/fraud/i);
  });

  it('(f) does NOT claim cookies are used for performance or reliability', () => {
    renderCookiesPage();
    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toMatch(/\bperformance\b/i);
    expect(bodyText).not.toMatch(/\breliab/i);
  });

  it('(f) does NOT claim cookies are used for troubleshooting or maintenance', () => {
    renderCookiesPage();
    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toMatch(/troubleshoot/i);
    expect(bodyText).not.toMatch(/maintenance/i);
  });

  // (g) THE EXCLUSIVE CLAIM (FR-3 third scenario: "THEN it names the GA4
  // cookies as the only cookies this site sets"). Distinct from (f): (f)
  // proves the page never mentions the forbidden purposes; this proves the
  // page makes the affirmative, exclusive claim that GA4's cookies are the
  // ONLY ones this site sets. Before this test, nothing asserted this
  // sentence at all — the keyword-absence checks in (f) are satisfied
  // MORE thoroughly by deleting the "What this notice covers" section
  // than by keeping it, so a deletion reddened nothing.
  // FALSIFIER (mandatory): delete the "What this notice covers" section
  // from cookies.ts — see the Implementer's report for the failing output.
  it('(g) names the GA4 cookies as the only cookies this site sets', () => {
    renderCookiesPage();

    const section = screen
      .getByRole('heading', { name: /what this notice covers/i })
      .closest('section');
    expect(section).not.toBeNull();
    const scoped = within(section as HTMLElement);

    expect(
      scoped.getByText(/are the only cookies this site sets/i)
    ).toBeInTheDocument();
  });
});

describe('/cookies page — the consent-change control (FR-3 second scenario)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the control inside the document flow, after "Changing your choice"', () => {
    renderCookiesPage();

    const changingSection = screen
      .getByRole('heading', { name: /changing your choice/i })
      .closest('section');
    expect(changingSection).not.toBeNull();

    // The control is a sibling immediately after the section, per
    // LegalDocumentView's slot contract — not appended at the end of the
    // whole document.
    const slotSibling = changingSection!.nextElementSibling;
    expect(slotSibling).not.toBeNull();
    expect(
      within(slotSibling as HTMLElement).getByRole('button', { name: /accept analytics cookies/i })
    ).toBeInTheDocument();
  });

  it('lets a visitor change their stored consent choice', () => {
    renderWithProvider();

    expect(readConsent()).toBe('undecided');

    fireEvent.click(screen.getByRole('button', { name: /accept analytics cookies/i }));
    expect(readConsent()).toBe('granted');

    fireEvent.click(screen.getByRole('button', { name: /reject analytics cookies/i }));
    expect(readConsent()).toBe('denied');
  });
});

// ---------------------------------------------------------------------------
// Gap 1 (T-6, DD-4): restores the banner-reactivity proof the old
// `/privacy` test carried before T-5 moved the cookie content and its
// change-choice control here. Mounts a real `ConsentProvider` +
// `ConsentBanner` alongside this page — not the mocked context
// `ConsentBanner.test.tsx` uses — so the assertion exercises the actual
// provider wiring between `ConsentChoiceControl` and `ConsentBanner`.
// ---------------------------------------------------------------------------

describe('/cookies page — banner reacts to a stored-choice change, with no reload (DD-4, T-6 gap 1)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('lets a visitor change their stored consent choice, and the banner reacts immediately — no reload', () => {
    renderWithProviderAndBanner();

    // No stored record yet: FR-3's "absence is not consent" resolves to
    // `undecided`, so the banner (mounted alongside, as it is in the real
    // (public) layout) is visible.
    expect(screen.getByRole('region', { name: /cookie consent/i })).toBeInTheDocument();
    expect(readConsent()).toBe('undecided');

    fireEvent.click(screen.getByRole('button', { name: /accept analytics cookies/i }));

    // The stored choice changed...
    expect(readConsent()).toBe('granted');
    // ...and the banner — a sibling consumer of the same ConsentProvider,
    // not re-rendered via any reload — reacted immediately.
    expect(screen.queryByRole('region', { name: /cookie consent/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reject analytics cookies/i }));

    // The control can also change an already-decided choice — still no
    // reload, still no banner, since `denied` is not `undecided` either.
    expect(readConsent()).toBe('denied');
    expect(screen.queryByRole('region', { name: /cookie consent/i })).not.toBeInTheDocument();
  });
});
