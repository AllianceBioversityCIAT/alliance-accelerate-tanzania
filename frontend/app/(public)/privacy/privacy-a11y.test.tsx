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

    const operatorIdentity = screen.getByText(/is an online platform operated by the international center for tropical agriculture/i);
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
    expect(screen.getByText(/effective date: 30 september 2026/i)).toBeInTheDocument();
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

describe('/privacy page — the Nairobi IT access disclosure', () => {
  // A data-access disclosure, not decoration: it tells a data subject that
  // staff in a third country (Kenya) may reach their information. It sits in
  // "Who is Responsible for the Registry?" because it qualifies the
  // responsible-entity statement — not in "International Storage and
  // Access", which is about hosting, nor in "Sharing of Information", since
  // CIAT's own IT team is not a third party.
  it('discloses the access, its limits, and that responsibility does not move', () => {
    renderPrivacyPage();

    const region = screen.getByRole('region', { name: 'Who is Responsible for the Registry?' });
    const text = region.textContent ?? '';

    // Who, and for what.
    expect(text).toMatch(/nairobi-based it team may access information stored in the registry/i);
    expect(text).toMatch(/technical maintenance, security, troubleshooting, and operational support/i);
    // The limits — purpose limitation and the safeguards.
    expect(text).toMatch(/limited to personnel who require it for these purposes/i);
    expect(text).toMatch(/confidentiality, security, and data protection requirements/i);
    // And that it does not move the responsible entity.
    expect(text).toMatch(/does not change the role of CIAT’s Tanzania office/i);
  });

  it('states the arrangement in the present tense, not as a future promise', () => {
    renderPrivacyPage();

    const region = screen.getByRole('region', { name: 'Who is Responsible for the Registry?' });
    const text = region.textContent ?? '';

    // A policy describes what governs now. "will be limited"/"will be
    // subject" reads as a commitment still outstanding — the same weakness
    // removed from CIAT's "Users will be provided with appropriate notice".
    expect(text).not.toMatch(/will be limited to personnel/i);
    expect(text).not.toMatch(/will be subject to appropriate/i);
  });
});

describe('/privacy page — the Cookies and Analytics section (CIAT-requested expansion)', () => {
  // This section is the ONE part of CIAT's Privacy Policy that is not carried
  // verbatim, and D-10 is superseded here. D-10 held that /privacy must not
  // name Google — that the recipient disclosure belonged only on /cookies.
  // CIAT then asked, against this very section, to "confirm whether the
  // platform uses any analytics, tracking, advertising, or third-party
  // monitoring tools" and said the section "will need to be expanded to
  // describe the specific technologies, purposes, data collected, retention
  // periods, and any applicable consent requirements". Naming Google is now
  // required by the document's own author, so the old assertion is inverted
  // rather than deleted — a reader of this file should find the reversal and
  // its reason, not a silently missing test.
  it('names Google Analytics 4 as the technology and Google as the recipient (supersedes D-10)', () => {
    renderPrivacyPage();

    const region = screen.getByRole('region', { name: 'Cookies and Analytics' });
    const text = region.textContent ?? '';

    expect(text).toMatch(/google analytics 4/i);
    expect(text).toMatch(/recipient: google/i);
  });

  it('states the single actual purpose and denies the four CIAT originally listed', () => {
    renderPrivacyPage();

    const region = screen.getByRole('region', { name: 'Cookies and Analytics' });
    const text = region.textContent ?? '';

    // The one purpose that occurs.
    expect(text).toMatch(/aggregated and non-identifiable statistics/i);
    // CIAT's original opening named operation, security, functionality and
    // performance. None of them uses a cookie here, and the section now says
    // so explicitly rather than leaving the reader with the wider claim.
    expect(text).toMatch(
      /stores none for authentication, security, fraud prevention or performance purposes/i,
    );
  });

  it('carries the four disclosures CIAT asked for: technology, data, recipient, retention', () => {
    renderPrivacyPage();

    const region = screen.getByRole('region', { name: 'Cookies and Analytics' });
    const items = Array.from(region.querySelectorAll('li')).map((el) => el.textContent ?? '');

    // The policy states what the cookies DO; their literal names live on
    // /cookies, where a reader who wants to verify them in the browser will
    // look. A name informs nobody on its own — `_ga_*` is glob notation.
    expect(
      items.some((i) => /cookies stored: two cookies set by google analytics/i.test(i)),
    ).toBe(true);
    expect(
      items.some((i) => /without identifying the person using it/i.test(i)),
    ).toBe(true);
    expect(items.some((i) => /information collected:/i.test(i))).toBe(true);
    expect(items.some((i) => /recipient:/i.test(i))).toBe(true);
    expect(items.some((i) => /retention:/i.test(i))).toBe(true);
  });

  it('keeps the geographic granularity at city level, never softened to region or country', () => {
    renderPrivacyPage();

    const region = screen.getByRole('region', { name: 'Cookies and Analytics' });

    // ADR-011 records understating this as a real defect caught in review.
    expect(region.textContent ?? '').toMatch(/country, region and city level/i);
  });

  it('states that no custom event, identifier or parameter reaches Google', () => {
    renderPrivacyPage();

    const region = screen.getByRole('region', { name: 'Cookies and Analytics' });
    const text = region.textContent ?? '';

    expect(text).toMatch(/transmits no custom events, identifiers or parameters/i);
    expect(text).toMatch(/no organisation record, profile identifier or search term is sent/i);
  });

  it('keeps the three sentences carried verbatim from CIAT', () => {
    renderPrivacyPage();

    const region = screen.getByRole('region', { name: 'Cookies and Analytics' });
    const text = region.textContent ?? '';

    expect(text).toContain(
      'Cookies are small text files that are stored on a user’s device when visiting a website.',
    );
    expect(text).toContain(
      'Users may also manage or disable cookies through their browser settings.',
    );
    expect(text).toContain(
      'For additional information regarding the technologies used by the Registry, users may ' +
        'contact CIAT using the contact details provided in this Privacy Policy.',
    );
  });

  it('reverses CIAT\u2019s claim that disabling cookies degrades the Registry', () => {
    renderPrivacyPage();

    const region = screen.getByRole('region', { name: 'Cookies and Analytics' });
    const text = region.textContent ?? '';

    // CIAT's source said disabling "may affect the availability or
    // functionality of some features". Nothing here depends on a cookie.
    expect(text).toMatch(/does not affect its availability or functionality/i);
    expect(text).not.toMatch(/may affect the availability or functionality/i);
  });

  it('closes with an engineering-authored pointer link to /cookies (D-4), not a consent-change control', () => {
    renderPrivacyPage();

    const region = screen.getByRole('region', { name: 'Cookies and Analytics' });
    const link = within(region).getByRole('link', { name: /cookie notice/i });
    expect(link).toHaveAttribute('href', '/cookies');

    // D-4 still holds on this half: the control lives only on /cookies.
    expect(within(region).queryByRole('button')).not.toBeInTheDocument();
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
  it('renders Contact person/Email/Address/Telephone as a description list with CIAT\'s supplied values', () => {
    renderPrivacyPage();

    const region = screen.getByRole('region', { name: 'Contact Us' });
    const dl = region.querySelector('dl')!;
    expect(dl).toBeInTheDocument();
    const dts = Array.from(dl.querySelectorAll('dt')).map((el) => el.textContent);
    expect(dts).toEqual(['Contact person:', 'Email:', 'Address:', 'Telephone:']);
    // CIAT supplied these on 2026-09-25. The two fields still outstanding on
    // this document are in the "Who is Responsible for the Registry?" prose,
    // not here — see privacy.test.ts's inventory.
    const dds = Array.from(dl.querySelectorAll('dd')).map((el) => el.textContent);
    expect(dds).toEqual([
      'Sylvia Kalemera',
      'S.Kalemera@cgiar.org',
      'Tanzania Agricultural Research Institute (TARI), Selian Centre, Dodoma Road, Arusha, Tanzania',
      '+255 768 508 976',
    ]);
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
