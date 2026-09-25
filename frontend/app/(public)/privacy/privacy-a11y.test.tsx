/**
 * Automated accessibility + content tests for the /privacy page — T-5
 * scaffold, T-8 approved-copy landing (FR-5, D-3, D-9, D-10, design.md
 * §4.3, §5.2).
 *
 * `/privacy` keeps its URL (D-3) and renders through the shared
 * `LegalDocumentView` against `PRIVACY_POLICY`. As of T-8, that document
 * is the Privacy Policy text approved by the Alliance/CIAT legal owners,
 * plus a short engineering-authored section carrying facts 2–4 of the
 * contact-form obligation (D-9 — see privacy.ts's module doc). Cookie
 * content and the `ConsentChoiceControl` island stay off this page — they
 * live on `/cookies` (T-4); Legal's own "Cookies" section is carried
 * verbatim into this page and closes with a pointer link to `/cookies`
 * (D-4), asserted below.
 *
 * REMOVED AT T-8 (design.md §4.3 reversion challenge, requirements.md FR-5
 * "BUT it must NOT retain the previous page's self-limiting statement"):
 * the lede's clause stating this notice does not describe registration or
 * public-directory data. The approved Privacy Policy DOES describe that
 * (its "Public Nature of the Registry" and related sections), so the
 * clause became false and is deleted along with its retention assertion
 * here (the former "RETAINS the limitation clause" test, and the adjacent
 * "describes one subject" test that asserted the same retired
 * engineering-authored lede framing — both were specific to the T-5
 * scaffold's own lede, which Legal's real lede replaces wholesale).
 *
 * NOT covered here (NFR-2, NFR-5): jsdom has no layout engine and
 * evaluates neither contrast nor rendered legibility — human check
 * routed to T-10's HITL pause.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
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

describe('/privacy page — the lede is Legal\'s two source paragraphs, not one merged string (T-8 rework, FR-5)', () => {
  // DEMONSTRATED FALSIFIER (mandatory): collapsing PRIVACY_POLICY's `lede`
  // back into a single string must redden this assertion. Run with `lede`
  // collapsed to one string, observe red, then revert — see the
  // Implementer's report for the failing output.
  it('renders the operator-identity paragraph and the "what this policy explains" paragraph separately', () => {
    renderPrivacyPage();

    const operatorIdentity = screen.getByText(/is an online platform operated by insert ciat legal entity/i);
    const explains = screen.getByText(/this privacy policy explains how we collect/i);

    expect(operatorIdentity.tagName).toBe('P');
    expect(explains.tagName).toBe('P');
    // Two DISTINCT <p> elements — proves the two source paragraphs were
    // not merged into one.
    expect(operatorIdentity).not.toBe(explains);
  });
});

describe('/privacy page — approved-copy status (T-8)', () => {
  it('carries no placeholder marker — the approved text has landed', () => {
    renderPrivacyPage();

    const bodyText = document.body.textContent ?? '';
    expect(bodyText.toLowerCase()).not.toMatch(/placeholder/);
  });

  it('renders a visible version identifier and effective date', () => {
    renderPrivacyPage();

    expect(screen.getByText(/version v1\.0/i)).toBeInTheDocument();
    expect(screen.getByText(/effective date: insert date/i)).toBeInTheDocument();
  });

  // DEMONSTRATED FALSIFIER (mandatory, tasks.md T-8): the previous page's
  // self-limiting scope statement — "does not describe how the registry
  // handles data collected through organisation registration or shown in
  // the public directory" — is REMOVED at this task (FR-5 "BUT it must
  // NOT retain..."), because the approved policy now describes exactly
  // that. This asserts the withdrawn clause is genuinely gone, not merely
  // unasserted.
  it('does NOT retain the previous page’s self-limiting scope statement', () => {
    renderPrivacyPage();

    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toMatch(/does not describe how the registry handles data/i);
  });
});

describe('/privacy page — Legal’s Cookies section (FR-5 scenario (b), D-4, D-10)', () => {
  // DEMONSTRATED FALSIFIER (mandatory, tasks.md T-8): editing one word of
  // Legal's Cookies section in privacy.ts must redden this assertion. Run
  // with one word changed, observe red, then revert — see the
  // Implementer's report for the failing output. This test hardcodes its
  // own independent copy of Legal's exact wording (not imported from
  // privacy.ts), so an edit to the source is genuinely caught rather than
  // trivially agreeing with itself.
  it('is carried verbatim and unamended — every paragraph/bullet text matches Legal’s source exactly, in order', () => {
    renderPrivacyPage();

    const region = screen.getByRole('region', { name: 'Cookies' });
    // Only the <p>/<li> elements that came from Legal's own blocks — the
    // engineering pointer paragraph (asserted separately below) is the
    // LAST <p>, deliberately excluded here by slicing it off, so this
    // comparison is scoped to Legal's words only.
    const allParagraphsAndItems = Array.from(region.querySelectorAll('p, li')).map(
      (el) => el.textContent,
    );
    const actual = allParagraphsAndItems.slice(0, -1); // drop the trailing pointer <p>

    // This is this test's OWN independent copy of Legal's exact wording
    // (not imported from privacy.ts) — an edit to the source is genuinely
    // caught, rather than the test trivially agreeing with itself.
    const expectedLegalText = [
      'The Registry may use cookies and similar technologies to support the operation, security, functionality, and performance of the platform.',
      'Cookies are small text files that are stored on a user’s device when visiting a website. These technologies may be used to:',
      'Enable and maintain essential platform functionality;',
      'Authenticate administrator sessions and maintain secure access to administrative features;',
      'Improve the performance and reliability of the Registry;',
      'Detect and prevent unauthorized access, fraud, or misuse;',
      'Generate aggregated and non-identifiable statistics regarding the use of the Registry; and',
      'Support troubleshooting, maintenance, and security monitoring activities.',
      'Users will be provided with appropriate notice to manage cookie preferences.',
      'Users may also manage or disable cookies through their browser settings. Please note that disabling certain cookies may affect the availability or functionality of some features of the Registry.',
      'The Registry does not use cookies to collect personal information beyond what is reasonably necessary for the purposes described in this Privacy Policy.',
      'For additional information regarding the technologies used by the Registry, users may contact CIAT using the contact details provided in this Privacy Policy.',
    ];

    expect(actual).toEqual(expectedLegalText);
  });

  it('closes with an engineering-authored pointer link to /cookies (D-4), not a consent-change control', () => {
    renderPrivacyPage();

    const region = screen.getByRole('region', { name: 'Cookies' });
    const link = within(region).getByRole('link', { name: /cookie notice/i });
    expect(link).toHaveAttribute('href', '/cookies');

    // D-4: the consent-change control lives only on /cookies, never here.
    expect(within(region).queryByRole('button')).not.toBeInTheDocument();
  });

  it('does NOT name Google as recipient (D-10) — that disclosure lives only on /cookies', () => {
    renderPrivacyPage();

    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toMatch(/google/i);
  });
});

describe('/privacy page — labelled sub-blocks (T-8, "How We Collect Information")', () => {
  it('renders Self-registration, Administrator-managed registration and Platform operation as sub-blocks', () => {
    renderPrivacyPage();

    const region = screen.getByRole('region', { name: 'How We Collect Information' });
    expect(within(region).getByText('Self-registration').tagName).toBe('H3');
    expect(within(region).getByText('Administrator-managed registration').tagName).toBe('H3');
    expect(within(region).getByText('Platform operation').tagName).toBe('H3');
    expect(
      within(region).getByText(/actors may submit their own information directly/i),
    ).toBeInTheDocument();
  });
});

describe('/privacy page — the closing Contact Us block (T-8, contact description list)', () => {
  it('renders Contact/Email/Address/Telephone as a description list, blank values reproduced as-is', () => {
    renderPrivacyPage();

    const region = screen.getByRole('region', { name: 'Contact Us' });
    const dl = region.querySelector('dl')!;
    expect(dl).toBeInTheDocument();
    const dts = Array.from(dl.querySelectorAll('dt')).map((el) => el.textContent);
    expect(dts).toEqual(['Contact:', 'Email:', 'Address:', 'Telephone:']);
    // Legal's source left every value on this block blank — reproduced,
    // not invented.
    const dds = Array.from(dl.querySelectorAll('dd')).map((el) => el.textContent);
    expect(dds).toEqual(['', '', '', '']);
  });
});

describe('/privacy page — the four contact-channel facts (FR-5, D-9), asserted independently', () => {
  // Each assertion below is independent by construction: deleting any one
  // sentence from privacy.ts must redden exactly one of these four and
  // leave the other three green (T-8 task brief falsifier (1)).
  //
  // Part 1 is now discharged by LEGAL's own "Information We Collect"
  // section (D-9, requirements.md FR-5 scenario) rather than by a
  // dedicated engineering section — the T-5 scaffold's "What a submission
  // collects" section is superseded by Legal's text and no longer exists
  // as a separate heading.

  it('(1) states what a submission collects, via Legal’s "Information We Collect" section', () => {
    renderPrivacyPage();

    expect(
      screen.getByRole('heading', { name: /information we collect/i })
    ).toBeInTheDocument();
    // This regex is coupled to Legal's own bullet wording in
    // `privacy.ts`, not to engineering copy — a future Legal edition that
    // rewords this bullet WILL redden this test even though nothing
    // engineering owns changed. The correct response when that happens is
    // to re-point this assertion at the new wording (confirm the D-9
    // obligation is still discharged), never to loosen the regex to keep
    // it passing.
    expect(
      screen.getByText(/information submitted through communications with registry administrators/i),
    ).toBeInTheDocument();
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
