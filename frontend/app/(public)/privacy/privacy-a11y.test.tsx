/**
 * Automated accessibility + content tests for the /privacy page — T-5,
 * FR-5, D-3, design.md §4.3, §5.2.
 *
 * REWRITTEN at T-5 (was T-10/T-6/T-11 of a superseded plan). `/privacy`
 * keeps its URL (D-3) but is now rendered through the shared
 * `LegalDocumentView` against `PRIVACY_POLICY`, and its cookie content and
 * `ConsentChoiceControl` island have LEFT this page — they now live on
 * `/cookies` (T-4). This file's cookie-related assertions moved with
 * them: every assertion this rewrite removed was checked against
 * `frontend/app/(public)/cookies/cookies-a11y.test.tsx` first, per the
 * T-5 task brief's "BEFORE deleting any assertion" instruction. Two gaps
 * were found doing that and are reported (not silently fixed — both
 * files this task does not own):
 *
 *  1. The previous "banner reacts with no reload (DD-4)" test rendered
 *     `ConsentProvider` + `ConsentBanner` + the page together to prove the
 *     banner disappears immediately when `ConsentChoiceControl` changes
 *     the stored choice. `cookies-a11y.test.tsx`'s equivalent test
 *     ("lets a visitor change their stored consent choice") checks
 *     `readConsent()` but does not render `ConsentBanner` alongside, so
 *     it does not re-assert banner reactivity. `ConsentBanner.test.tsx`
 *     asserts `setConsent` is called under a mocked context, not through
 *     a real `ConsentChoiceControl` + `ConsentProvider` integration. No
 *     currently-owned file re-proves this integration.
 *  2. The previous "states the rider accurately" test asserted the
 *     specific phrases "including as you move between pages" and "stops
 *     the next time you load the site" (plus a negative guard against
 *     "until you navigate away"). `cookies-a11y.test.tsx`'s asymmetry
 *     test (d) matches on `/rejecting takes effect from your next page
 *     load/i` and `/accepting takes effect immediately/i` only — the
 *     rider's finer phrasing (and the negative guard) has no equivalent
 *     assertion there, even though the identical sentence now lives in
 *     `cookies.ts`'s "Changing your choice" section.
 *
 * Neither gap is fixed by this task: both `cookies/` files are out of
 * scope here (T-5 task brief hard constraint 3; owned by T-4/T-6).
 *
 * NOT covered here (NFR-2, NFR-5): jsdom has no layout engine and
 * evaluates neither contrast nor rendered legibility — human check
 * routed to T-10's HITL pause.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

import PrivacyPage from './page';

function renderPrivacyPage() {
  return render(
    <main>
      <PrivacyPage />
    </main>
  );
}

describe('/privacy page — axe accessibility (NFR-2)', () => {
  it('has no axe violations (WCAG 2.1 AA)', async () => {
    const { container } = renderPrivacyPage();
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  it('has exactly one h1', () => {
    renderPrivacyPage();

    expect(screen.getAllByRole('heading', { level: 1, name: /privacy policy/i })).toHaveLength(1);
  });
});

describe('/privacy page — no client island (T-5 hard constraint 1)', () => {
  it('renders no interactive control at all — the consent-change island has moved to /cookies', () => {
    renderPrivacyPage();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('/privacy page — placeholder status (T-5, pending Legal)', () => {
  it('makes the placeholder status unmistakable — the marker is visible on the page', () => {
    renderPrivacyPage();

    const bodyText = document.body.textContent ?? '';
    expect(bodyText).toMatch(/\[PLACEHOLDER TEXT — pending legal review\]/);
  });
});

describe('/privacy page — scope statement (FR-5, design.md §4.3 "Explicitly NOT owned here")', () => {
  // DEMONSTRATED FALSIFIER (mandatory, tasks.md T-5): deleting the
  // limitation clause from privacy.ts's lede must redden this assertion.
  // Run with the clause removed, observe red, then revert — see the
  // Implementer's report for the failing output.
  it('RETAINS the limitation clause — this notice does not cover registration or directory data', () => {
    renderPrivacyPage();

    const lede = screen.getByText(/this notice covers/i);
    expect(lede.textContent).toMatch(/organisation registration/i);
    expect(lede.textContent).toMatch(/public directory/i);
  });

  it('describes one subject — the contact form — and points to the Cookie Notice for cookies', () => {
    renderPrivacyPage();

    const lede = screen.getByText(/this notice covers/i);
    expect(lede.textContent).toMatch(/contact form/i);
    expect(lede.textContent).toMatch(/cookie notice/i);
    // The old "covers two things … and the analytics cookies this site
    // sets" framing is corrected, not merely relocated — it must not
    // survive as a claim that this page itself covers cookies.
    expect(lede.textContent).not.toMatch(/covers two things/i);
  });
});

describe('/privacy page — the four contact-channel facts (FR-5, D-9), asserted independently', () => {
  // Each assertion below is independent by construction: deleting any one
  // sentence from privacy.ts must redden exactly one of these four and
  // leave the other three green (T-5 task brief falsifier 2).

  it('(1) states what a submission collects', () => {
    renderPrivacyPage();

    expect(
      screen.getByRole('heading', { name: /what a submission collects/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/name, email address/i)).toBeInTheDocument();
  });

  it('(2) states who receives it', () => {
    renderPrivacyPage();

    expect(screen.getByRole('heading', { name: /who receives it/i })).toBeInTheDocument();
    expect(screen.getByText(/accelerate tanzania programme team/i)).toBeInTheDocument();
  });

  it('(3) states messages are relayed by email and NOT stored by the platform', () => {
    renderPrivacyPage();

    expect(screen.getByText(/relayed by email and is not stored/i)).toBeInTheDocument();
  });

  it('(4) states submitting is NOT consent to publish anything', () => {
    renderPrivacyPage();

    expect(
      screen.getByText(/not consent to publish any organisation.s information/i)
    ).toBeInTheDocument();
  });
});
