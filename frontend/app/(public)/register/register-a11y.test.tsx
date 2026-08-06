/**
 * Whole-page accessibility suite for `/register` (T-22, NFR-5, QA-11, DC-16).
 *
 * `RegistrationForm.test.tsx`, `ConsentPolicyDisclosure.test.tsx`, and
 * `OtpVerificationStep.test.tsx` each already run `jest-axe` on their OWN
 * isolated render. That is not what T18-A7 needs closed: heading-order is a
 * COMPOSITION property — `ConsentPolicyDisclosure`'s heading is only ever
 * wrong relative to the page's own `<h1>`, and a component-level axe run
 * structurally cannot see a violation that only exists once components are
 * combined ("each component's own axe run passes because [it] is first *in
 * isolation*"). This file renders the ACTUAL composed `RegisterPage` — the
 * same tree a browser paints — for every reachable state, so composition
 * defects (T18-A7) and cross-component gaps (T19-A4) have somewhere to be
 * caught that the per-component suites cannot reach by construction.
 *
 * States covered, one axe run each:
 *   1. The `form` step, clean.
 *   2. The `form` step with the three-field validation-error case shown.
 *   3. The `otp` step, ready-to-enter-code state.
 *   4. The `otp` step's BLOCKING-ISSUE screen (T19-A4) — this state has
 *      never been through `axe` before this file. `OtpVerificationStep.
 *      test.tsx` proves the blocking-issue's CONTROL FLOW (which field, what
 *      copy) but does not run `axe` over it, and no page-level test reaches
 *      it either — a green result here is new evidence, not a repeat of
 *      existing coverage.
 *
 * Mocks: `@/lib/api/registrations` (resolves `getConsentPolicy` with a real,
 * multi-section fixture so ConsentPolicyDisclosure renders actual content —
 * not "Loading policy…" — for every axe run below, per `frontend/CLAUDE.md`
 * "page tests mock the `lib/api/*` module"); `next/navigation`'s `useRouter`
 * (RegisterPage's own `onSubmitted` hand-off, never reached by these tests).
 *
 * ── What this file does NOT and cannot prove (the Done-when's required
 * comment — DC-16) ───────────────────────────────────────────────────────
 * `jest-axe`'s `color-contrast` rule reports `incomplete` under jsdom (no
 * real layout engine, no computed style resolution against a stylesheet),
 * and `toHaveNoViolations` does not fail a suite on `incomplete` — a green
 * result below says NOTHING about contrast. The same absence-of-layout
 * means jsdom cannot evaluate real TAB ORDER (only that elements are
 * individually reachable, via `tabIndex`/native focusability — not the
 * sequence a real browser would produce) or FOCUS VISIBILITY (whether the
 * `focus-visible:ring-2` Tailwind utilities actually paint a visible
 * indicator — jsdom has no rendering pipeline to inspect). Chunk 1 already
 * accepted this exact gap as its NFR-5 WARN; recording any of the three as
 * covered here would be a second KZ-002 recurrence. All three route to the
 * DC-16 HITL human check, on a real browser render of `/register`, against
 * `docs/ux-ui/design.md` §7's contrast guidance — per KZ-003, that check is
 * NOT deferrable on "needs an authenticated session": this page renders for
 * an anonymous visitor with no auth, session, or backend required.
 *
 * The consent scroll-gate's real geometry (DC-17 — "does the checkbox
 * actually stay disabled until the real end of the real policy text, in a
 * real browser") is also out of this file's reach for the same reason:
 * jsdom performs no layout, so `scrollTop`/`clientHeight`/`scrollHeight`
 * are fabricated inputs regardless of what a test injects. That is covered
 * separately by `consent-scroll-gate.test.ts`'s predicate unit tests plus
 * its own DC-17 human check — restated here only so a reader of this file
 * does not assume the scroll gate is this suite's business too.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

// ---------------------------------------------------------------------------
// Module mocks — hoisted before dynamic imports resolve
// ---------------------------------------------------------------------------

const mockRouterPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

const mockGetConsentPolicy = jest.fn();
const mockRequestVerificationCode = jest.fn();
const mockSubmitRegistration = jest.fn();

jest.mock('@/lib/api/registrations', () => ({
  getConsentPolicy: (...args: unknown[]) => mockGetConsentPolicy(...args),
  requestVerificationCode: (...args: unknown[]) => mockRequestVerificationCode(...args),
  submitRegistration: (...args: unknown[]) => mockSubmitRegistration(...args),
}));

import RegisterPage from './page';
import { ApiError } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Fixtures — a real, multi-section policy so ConsentPolicyDisclosure renders
// actual content (not its loading state) in every composed render below.
// ---------------------------------------------------------------------------

const POLICY = {
  version: 'v2.1-a11y-fixture',
  sections: [
    { heading: 'What we collect', body: 'We collect your organisation, contact, and location details.' },
    { heading: 'Why we collect it', body: 'To operate the public seed-system registry.' },
    { heading: 'How it is published', body: 'Only after an Admin approves your submission.' },
    { heading: 'Your rights', body: 'You may contact the ACCELERATE team about your data at any time.' },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetConsentPolicy.mockResolvedValue(POLICY);
  mockRequestVerificationCode.mockResolvedValue(undefined);
});

/** Fills every REQUIRED field with a valid value — mirrors page.test.tsx's helper. */
function fillMinimalValidForm() {
  fireEvent.change(screen.getByLabelText(/organisation name/i), {
    target: { value: 'Kilimanjaro Seed Co-op' },
  });
  fireEvent.change(screen.getByLabelText(/^trader type/i), { target: { value: 'seed_company' } });
  fireEvent.change(screen.getByLabelText(/^region/i), { target: { value: 'Arusha' } });
  fireEvent.click(screen.getByLabelText(/^sorghum/i));
  fireEvent.change(screen.getByLabelText(/capacity \(tons\)/i), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText(/contact person/i), { target: { value: 'Jane Doe' } });
  fireEvent.change(screen.getByLabelText(/^phone/i), { target: { value: '+255700000000' } });
  fireEvent.change(screen.getByLabelText(/^email/i), {
    target: { value: 'jane@kilimanjaroseed.co.tz' },
  });
}

/** Waits for the real, fetched consent policy to replace the "Loading policy…" placeholder. */
async function waitForPolicyLoaded() {
  await screen.findByText(POLICY.sections[0].heading);
}

async function acceptConsent() {
  await waitForPolicyLoaded();
  const checkbox = screen.getByLabelText(
    'I have read and accept the Data Protection & Participant Consent Policy.',
  );
  // Reviewer correction 3 — the prior comment here had the mechanism
  // backwards. This checkbox is ALREADY enabled by the time
  // `waitForPolicyLoaded()` resolves: `ConsentPolicyDisclosure`'s own
  // post-load effect calls `hasReachedScrollEnd({scrollTop:0,
  // clientHeight:0, scrollHeight:0})` — jsdom's real, unfabricated geometry,
  // since it performs no layout — and the predicate's own
  // `scrollHeight <= clientHeight` branch (`consent-scroll-gate.ts`, the
  // "content shorter than its container" case) reads `0 <= 0` as true. This
  // is DC-17's exact gap: jsdom cannot exercise the real, human-scrolling
  // gate at all, so nothing here proves the gate DOES gate — it merely
  // reaches the already-enabled state so the tests below it can proceed.
  // The `fireEvent.scroll` call with fabricated metrics is INERT — the
  // checkbox is enabled before it runs — and is kept only because a `region`
  // lookup by this name is otherwise unused here; it does not represent a
  // real scroll-driven transition in this environment.
  const region = screen.getByRole('region', { name: /data protection/i });
  expect(region).toBeInTheDocument();
  await waitFor(() => expect(checkbox).toBeEnabled());
  fireEvent.click(checkbox);
}

async function advanceToOtpStep() {
  fillMinimalValidForm();
  await acceptConsent();
  fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));
  await screen.findByLabelText(/verification code/i);
}

// ---------------------------------------------------------------------------
// 1 & 2 — the `form` step
// ---------------------------------------------------------------------------

describe('/register — form step, whole-page axe (T-22, NFR-5, QA-11)', () => {
  it('has no jest-axe violations on the clean initial render', async () => {
    const { container } = render(<RegisterPage />);
    await waitForPolicyLoaded();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no jest-axe violations with the validation-error summary shown', async () => {
    const { container } = render(<RegisterPage />);
    await waitForPolicyLoaded();
    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));
    await screen.findByTestId('error-summary');

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('T18-A7: exactly one h1, and the consent heading is the immediately-following h2 — no level is skipped', async () => {
    render(<RegisterPage />);
    await waitForPolicyLoaded();

    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(/register your organisation/i);

    // Composition-level: this is exactly what a component-in-isolation axe
    // run cannot see — ConsentPolicyDisclosure's own heading level is only
    // wrong relative to a page it is not rendered inside of in its own test.
    const consentHeading = screen.getByRole('heading', {
      level: 2,
      name: /data protection.*consent policy/i,
    });
    expect(consentHeading).toBeInTheDocument();
    // Reviewer correction 1: this only checks the h2 is not the FIRST
    // heading in document order (satisfied by the h1 alone — an h3 inserted
    // ahead of the h2 would still pass this line). It is NOT what gates
    // "no level is skipped anywhere" — the axe run in the preceding `it`
    // blocks (with `heading-order`, one of the `cat.semantics` rules,
    // enabled by default) is what actually gates that property, over this
    // same composed page. This assertion is a narrower, explicit pin: the
    // consent heading specifically sits after the page's own h1, not before
    // it — useful as a fast, readable failure if that ordering regresses,
    // but not the source of the heading-order guarantee.
    const allHeadings = screen.getAllByRole('heading');
    const h2Index = allHeadings.indexOf(consentHeading);
    expect(h2Index).toBeGreaterThan(0);
  });

  it('keyboard operability: every fieldset control and the consent region are individually focusable', async () => {
    render(<RegisterPage />);
    await waitForPolicyLoaded();

    // Text/number/select controls are natively focusable; explicitly assert
    // a representative one from each fieldset plus the crops checkboxes and
    // the consent scroll region (tabIndex={0}) all accept focus — this is
    // the jsdom-provable half of "keyboard reachable" (DC-16 draws the line
    // at real TAB SEQUENCE, which jsdom cannot reproduce without a layout
    // engine; this asserts individual reachability, not the browser's order).
    const focusables = [
      screen.getByLabelText(/organisation name/i),
      screen.getByLabelText(/^trader type/i),
      screen.getByLabelText(/^region/i),
      screen.getByLabelText(/^sorghum/i),
      screen.getByLabelText(/capacity \(tons\)/i),
      screen.getByLabelText(/^phone/i),
      screen.getByLabelText(/^email/i),
      screen.getByRole('region', { name: /data protection/i }),
    ];
    focusables.forEach((el) => {
      el.focus();
      expect(el).toHaveFocus();
    });
  });

  it('labelled controls: every form input has an accessible name', async () => {
    render(<RegisterPage />);
    await waitForPolicyLoaded();

    // Reviewer correction 2: this enumerates a FIXED allowlist of today's
    // fields — `getByLabelText` throws if any NAMED entry here loses its
    // accessible name, but a future field ADDED without a <label>/htmlFor
    // pairing is simply absent from this list and does not fail it. The
    // control that actually catches a future unlabelled field is axe's
    // `label` rule, evaluated over this same composed page in the axe `it`
    // blocks above (`cat.forms` is enabled by default, unlike `cat.color`).
    // This test's job is narrower: pinning that TODAY's known field set
    // resolves correctly, as a fast, readable failure if any of them
    // regresses.
    for (const name of [
      /organisation name/i,
      /^trader type/i,
      /^region/i,
      /district/i,
      /market location/i,
      /gps latitude/i,
      /gps longitude/i,
      /^sorghum/i,
      /common bean/i,
      /groundnut/i,
      /other crop/i,
      /capacity \(tons\)/i,
      /contact person/i,
      /^position/i,
      /^sex/i,
      /^phone/i,
      /^email/i,
    ]) {
      expect(screen.getByLabelText(name)).toBeInTheDocument();
    }
    expect(
      screen.getByLabelText('I have read and accept the Data Protection & Participant Consent Policy.'),
    ).toBeInTheDocument();
  });

  it('aria-describedby errors + live-region announcement: the summary is assertive, and phone/crops each resolve to a live error element', async () => {
    render(<RegisterPage />);
    await waitForPolicyLoaded();
    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));

    const summary = await screen.findByTestId('error-summary');
    expect(summary).toHaveAttribute('role', 'alert');
    expect(summary).toHaveAttribute('aria-live', 'assertive');

    const phone = screen.getByLabelText(/^phone/i);
    const phoneDescribedBy = phone.getAttribute('aria-describedby');
    expect(phoneDescribedBy).toBeTruthy();
    expect(document.getElementById(phoneDescribedBy!.split(' ')[0])).toHaveTextContent(
      'Phone is required.',
    );

    // T17-A1: the crops error is now associated at EACH checkbox, not only
    // the group — a quick-nav/summary-link user who jumps straight to a
    // control gets the association regardless of which checkbox they land
    // on, not only on group entry.
    const sorghum = screen.getByLabelText(/^sorghum/i);
    expect(sorghum).toHaveAttribute('aria-invalid', 'true');
    const cropsDescribedBy = sorghum.getAttribute('aria-describedby');
    expect(cropsDescribedBy).toBeTruthy();
    expect(document.getElementById(cropsDescribedBy!)).toHaveTextContent('Select at least one crop.');
  });

  it('T17-A2: PII inputs carry an autoComplete token (WCAG 2.1 AA SC 1.3.5)', async () => {
    render(<RegisterPage />);
    await waitForPolicyLoaded();

    expect(screen.getByLabelText(/organisation name/i)).toHaveAttribute('autoComplete', 'organization');
    expect(screen.getByLabelText(/contact person/i)).toHaveAttribute('autoComplete', 'name');
    expect(screen.getByLabelText(/^phone/i)).toHaveAttribute('autoComplete', 'tel');
    expect(screen.getByLabelText(/^email/i)).toHaveAttribute('autoComplete', 'email');
  });

  it('T17-A3: the crops group is a valid fragment-navigation focus target (tabIndex={-1}) and its id matches the summary anchor', async () => {
    render(<RegisterPage />);
    await waitForPolicyLoaded();
    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));

    const summary = await screen.findByTestId('error-summary');
    const cropsLink = within(summary)
      .getAllByRole('link')
      .find((link) => link.getAttribute('href')?.includes('crops'));
    expect(cropsLink).toBeDefined();

    const targetId = cropsLink!.getAttribute('href')!.slice(1);
    const target = document.getElementById(targetId);
    expect(target).not.toBeNull();
    expect(target).toHaveAttribute('tabindex', '-1');
    // A fragment target with tabIndex={-1} is a real, focusable landing
    // point — jsdom does not simulate `:target` navigation-triggered focus,
    // so this asserts the PRECONDITION (the target CAN receive focus), which
    // is the jsdom-provable half of "fragment navigation takes focus".
    target!.focus();
    expect(target).toHaveFocus();
  });
});

// ---------------------------------------------------------------------------
// 3 — the `otp` step, ready state
// ---------------------------------------------------------------------------

describe('/register — otp step (ready), whole-page axe', () => {
  it('has no jest-axe violations once the code UI is ready', async () => {
    const { container } = render(<RegisterPage />);
    await waitForPolicyLoaded();
    await advanceToOtpStep();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('the code input is labelled, keyboard-focusable, and its resend/submit actions are reachable', async () => {
    render(<RegisterPage />);
    await waitForPolicyLoaded();
    await advanceToOtpStep();

    const codeInput = screen.getByLabelText(/verification code/i);
    codeInput.focus();
    expect(codeInput).toHaveFocus();
    expect(screen.getByRole('button', { name: /resend code/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /verify and submit/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4 — the `otp` step's BLOCKING-ISSUE screen (T19-A4) — new coverage
// ---------------------------------------------------------------------------

describe('/register — otp step, blocking-issue screen (T19-A4, new coverage)', () => {
  it('has no jest-axe violations on the blocking-issue markup — UNCHECKED before this suite', async () => {
    mockSubmitRegistration.mockRejectedValue(
      new ApiError(400, 'Bad Request', [{ field: 'email', message: 'email must be an email' }]),
    );
    const { container } = render(<RegisterPage />);
    await waitForPolicyLoaded();
    await advanceToOtpStep();

    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify and submit/i }));

    await screen.findByText(/couldn't verify your email address/i);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('T19-A4: focus moves onto the blocking-issue alert when it replaces the code-entry subtree, instead of dropping to <body>', async () => {
    mockSubmitRegistration.mockRejectedValue(
      new ApiError(400, 'Bad Request', [{ field: 'email', message: 'email must be an email' }]),
    );
    render(<RegisterPage />);
    await waitForPolicyLoaded();
    await advanceToOtpStep();

    // The element about to unmount (the submit button) starts focused —
    // this is the concrete "the focused button unmounts" scenario T19-A4
    // names. It is `disabled` (and therefore unfocusable) until a 6-digit
    // code is entered, so the code must be filled in first.
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: '123456' } });
    const submitButton = screen.getByRole('button', { name: /verify and submit/i });
    submitButton.focus();
    expect(submitButton).toHaveFocus();

    fireEvent.click(submitButton);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/couldn't verify your email address/i);
    await waitFor(() => expect(alert).toHaveFocus());
    // Never <body> — the regression T19-A4 exists to prevent.
    expect(document.activeElement).not.toBe(document.body);
  });
});
