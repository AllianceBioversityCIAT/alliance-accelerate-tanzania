/**
 * Automated accessibility + content tests for the /privacy page — T-10,
 * FR-6, DC-11.
 *
 * This route is FR-6's link target: before this task, `/privacy` did not
 * exist and `ContactForm.tsx`'s (T-9, PASSED) privacy-acknowledgement link
 * went nowhere. DC-11 requires a test asserting "the link resolves to a
 * page that exists" — the strongest form of that assertion Jest can make
 * without an HTTP server is that this page's own module resolves, renders,
 * and carries the content design.md §5.2 requires (what is collected, who
 * receives it, that it is relayed and not stored, and that submitting is
 * not consent to publish). The complementary static-export half of that
 * proof (NFR-5) is `npm run build` itself: under output: 'export' it fails
 * loudly on any static-export violation and emits `out/privacy/index.html`
 * under `trailingSlash: true`. No committed check asserts that file — the
 * build is the gate, and no test here proves emission.
 *
 * PrivacyPage the module is a pure static server component: no hooks, no
 * data fetching, no useSearchParams. As of T-6, though, the tree this file
 * renders is no longer purely static — see the note below the T-6 marker.
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

jest.mock('next/navigation', () => ({
  usePathname: jest.fn().mockReturnValue('/privacy'),
}));

import PrivacyPage from './page';
import { ConsentProvider } from '@/lib/analytics/ConsentProvider';
import { ConsentBanner } from '@/components/analytics/ConsentBanner';
import { readConsent } from '@/lib/analytics/consent-storage';

function renderPrivacyPage() {
  return render(
    <main>
      <PrivacyPage />
    </main>
  );
}

// T-6 additions below (FR-6, design.md §5.6/§8.1, DD-4/DD-5). This task is
// purely additive to this file (tasks.md T-6's disqualifier): the six
// pre-existing `it(` blocks — in the `axe accessibility` and `content per
// design.md §5.2` describes further down — are untouched and still use the
// unchanged `renderPrivacyPage()` helper. Above this line, two things
// changed: the imports (the RTL import widened to `fireEvent, within`, the
// three new analytics imports, and the `next/navigation` stub — a guard,
// not a requirement: removing it and rerunning this suite left it green),
// and this file's header docblock, whose closing paragraph now records
// that the rendered tree is no longer purely static (T-6, item 3).
//
// The six pre-existing `it(` blocks render `PrivacyPage` with no
// `ConsentProvider`, so `ConsentChoiceControl` (inside the new analytics
// section) falls back to `ConsentProvider.tsx`'s `DEFAULT_CONTEXT` — a safe,
// inert value (`loading: false`, `consent: 'undecided'`, a no-op
// `setConsent`) that renders the control's markup without needing a real
// provider. That is sufficient for the axe/heading/content checks above,
// but proving the control actually changes the *stored* choice, and that
// the banner reacts to it with no reload (DD-4), needs a real provider —
// hence the separate helper below, used only by the new tests.
function renderWithProvider() {
  return render(
    <ConsentProvider>
      <ConsentBanner />
      <main>
        <PrivacyPage />
      </main>
    </ConsentProvider>
  );
}

describe('/privacy page — analytics disclosure per design.md §5.6 (FR-6, T-6)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('has no axe violations with a real ConsentProvider mounted (WCAG 2.1 AA)', async () => {
    const { container } = renderWithProvider();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  it('names the 4 collected signals (FR-4/FR-6)', () => {
    renderPrivacyPage();

    const section = screen.getByRole('heading', { name: /analytics cookies/i }).closest('section');
    expect(section).not.toBeNull();
    const scoped = within(section as HTMLElement);

    expect(scoped.getByText(/page views/i)).toBeInTheDocument();
    expect(scoped.getByText(/sessions/i)).toBeInTheDocument();
    expect(scoped.getByText(/geographic origin at country, region, and city level/i)).toBeInTheDocument();
    expect(scoped.getByText(/device and browser category/i)).toBeInTheDocument();
  });

  it('names Google as the recipient of analytics data', () => {
    renderPrivacyPage();

    const section = screen.getByRole('heading', { name: /analytics cookies/i }).closest('section');
    expect(within(section as HTMLElement).getByText(/sent to\s*google/i)).toBeInTheDocument();
  });

  it('states analytics cookies are set only after consent', () => {
    renderPrivacyPage();

    expect(screen.getByText(/analytics cookies are set only after you consent/i)).toBeInTheDocument();
  });

  it('states the route to change a prior choice, and renders the change-choice control', () => {
    renderPrivacyPage();

    expect(screen.getByText(/change this choice at any time.*using the control below/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accept analytics cookies/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject analytics cookies/i })).toBeInTheDocument();
  });

  it('re-scopes the opening sentence to an enumerated two-item set, and still states what it does not cover (FR-6 BUT, design.md §8.1)', () => {
    renderPrivacyPage();

    const scopeSentence = screen.getByText(/this notice covers two things/i);
    expect(scopeSentence).toBeInTheDocument();
    expect(scopeSentence.textContent).toMatch(/contact form/i);
    expect(scopeSentence.textContent).toMatch(/analytics cookies/i);
    // still explicitly out of scope — the limitation is re-scoped, not deleted.
    expect(scopeSentence.textContent).toMatch(/organisation registration/i);
    expect(scopeSentence.textContent).toMatch(/public directory/i);
  });

  it('leaves the "not consent to publish" section’s own text untouched', () => {
    renderPrivacyPage();

    // Same string the pre-existing test above asserts — proves this task
    // added a new section without touching this one's content.
    expect(
      screen.getByText(/not consent to publish any organisation.s information/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not change the consent status,\s*contact visibility/i)
    ).toBeInTheDocument();
  });

  it('lets a visitor change their stored consent choice, and the banner reacts with no reload (DD-4)', () => {
    renderWithProvider();

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

    // The control can also change an already-decided choice (the "route to
    // change a prior choice" FR-6 requires) — still no reload, still no
    // banner, since `denied` is not `undecided` either.
    expect(readConsent()).toBe('denied');
    expect(screen.queryByRole('region', { name: /cookie consent/i })).not.toBeInTheDocument();
  });
});

describe('/privacy page — withdrawal timing and cookie-removal disclosure (F-2, T-11)', () => {
  it('states rejecting takes effect from the next page load, and accepting takes effect immediately', () => {
    renderPrivacyPage();

    const timingParagraph = screen.getByText(/takes effect from your next page load, not immediately/i);
    expect(timingParagraph).toBeInTheDocument();
    // Rejecting is deferred...
    expect(timingParagraph.textContent).toMatch(
      /rejecting analytics here takes effect from your next page load, not immediately/i
    );
    // ...but accepting is not — pins the direction the T-11 rework fixed.
    expect(timingParagraph.textContent).toMatch(/accepting takes effect immediately/i);
  });

  it('states plainly that cookies already set are not removed by this site', () => {
    renderPrivacyPage();

    expect(
      screen.getByText(/does not remove\s*any analytics cookies already set/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/this site does not delete cookies itself/i)).toBeInTheDocument();
  });

  // Attempt-3 addition: the rider's cutoff, corrected against next/script's
  // actual behaviour (design.md §5.2's asymmetry table, "corrected
  // 2026-09-01") — already-loaded analytics survives a client-side route
  // change (every in-site link is next/link; no document reload occurs)
  // and stops only on the next real page load, not "until you navigate
  // away". This is the only sentence in the analytics paragraph that had no
  // assertion pinning it; this closes that gap.
  it('states the rider accurately: already-loaded analytics survives moving between pages and stops only on the next page load', () => {
    renderPrivacyPage();

    const rider = screen.getByText(/analytics already loaded keeps running for the rest of this visit/i);
    expect(rider).toBeInTheDocument();
    expect(rider.textContent).toMatch(/including as you move between pages/i);
    expect(rider.textContent).toMatch(/stops the next time you load the site/i);
    // Guards against regressing to the attempt-2 wording this task replaced.
    expect(rider.textContent).not.toMatch(/until you navigate away/i);
  });
});

describe('/privacy page — axe accessibility (T-10, NFR-3)', () => {
  it('has no axe violations (WCAG 2.1 AA compliance)', async () => {
    const { container } = renderPrivacyPage();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  it('has exactly one h1', () => {
    renderPrivacyPage();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('/privacy page — content per design.md §5.2 (FR-6)', () => {
  it('states what a submission collects', () => {
    renderPrivacyPage();

    expect(
      screen.getByRole('heading', { name: /what a submission collects/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/name, email address/i)).toBeInTheDocument();
  });

  it('states who receives it', () => {
    renderPrivacyPage();

    expect(screen.getByRole('heading', { name: /who receives it/i })).toBeInTheDocument();
    expect(screen.getByText(/accelerate tanzania programme team/i)).toBeInTheDocument();
  });

  it('states messages are relayed by email and NOT stored by the platform', () => {
    renderPrivacyPage();

    expect(screen.getByText(/relayed by email and is not stored/i)).toBeInTheDocument();
  });

  it('states submitting is NOT consent to publish anything', () => {
    renderPrivacyPage();

    expect(
      screen.getByText(/not consent to publish any organisation.s information/i)
    ).toBeInTheDocument();
  });
});
