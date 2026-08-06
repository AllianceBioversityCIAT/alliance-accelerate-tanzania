/**
 * Whole-page accessibility suite for `/register/submitted` (T-22, NFR-5,
 * QA-11, DC-16).
 *
 * Unlike `RegistrationForm`/`ConsentPolicyDisclosure`/`OtpVerificationStep`,
 * neither `ReferenceCard.test.tsx` nor `submitted/page.test.tsx` (T-20) runs
 * `jest-axe` at all — this file is the FIRST axe coverage this screen gets,
 * over the actual composed `RegistrationSubmittedPage` (heading + copy +
 * `ReferenceCard` + the "What happens next" region), for both reachable
 * states: a present `?ref=` and a missing one.
 *
 * Mocks: `next/navigation`'s `useSearchParams`, mirroring `page.test.tsx`'s
 * own mock exactly (`frontend/CLAUDE.md`: "page tests mock the `lib/api/*`
 * module" — this page makes no API call at all, per its own file header, so
 * the only seam to mock is the search-params hook it reads `ref` from).
 *
 * ── What this file does NOT and cannot prove (DC-16) ───────────────────────
 * Same jsdom ceiling as `register-a11y.test.tsx`: `color-contrast` reports
 * `incomplete` and does not fail `toHaveNoViolations`; real tab ORDER and
 * focus VISIBILITY need a layout engine jsdom does not have. All three route
 * to the DC-16 human check on a real browser render of `/register/submitted`
 * — not deferrable on auth (KZ-003): this screen renders from a `?ref=` query
 * param alone, no session, no backend call.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(),
}));

/* eslint-disable */
const { useSearchParams } = require('next/navigation') as { useSearchParams: jest.Mock };
/* eslint-enable */

import RegistrationSubmittedPage from './page';

const REFERENCE = 'REG-2026-0184';

/** Mimics `URLSearchParams.get` over a single `ref` param (or none) — mirrors `page.test.tsx`. */
function mockSearchParams(ref: string | null) {
  useSearchParams.mockReturnValue({
    get: (key: string) => (key === 'ref' ? ref : null),
  });
}

/** Installs a stubbed `navigator.clipboard.writeText` — mirrors `ReferenceCard.test.tsx`. */
function stubClipboard(writeText: jest.Mock | undefined) {
  const original = (navigator as { clipboard?: Clipboard }).clipboard;
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  });
  return () => {
    Object.defineProperty(navigator, 'clipboard', { value: original, configurable: true });
  };
}

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Present ?ref= — the applicant-flow state
// ---------------------------------------------------------------------------

describe('/register/submitted — receipt state (?ref= present), whole-page axe', () => {
  it('has no jest-axe violations', async () => {
    mockSearchParams(REFERENCE);
    const restore = stubClipboard(jest.fn().mockResolvedValue(undefined));
    const { container } = render(<RegistrationSubmittedPage />);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
    restore();
  });

  it('has no jest-axe violations after the copy action fires ("Copied" state + live-region text)', async () => {
    mockSearchParams(REFERENCE);
    const restore = stubClipboard(jest.fn().mockResolvedValue(undefined));
    const { container } = render(<RegistrationSubmittedPage />);

    const { fireEvent, waitFor } = await import('@testing-library/react');
    fireEvent.click(screen.getByRole('button', { name: /copy reference code/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^copied$/i })).toBeInTheDocument());

    const results = await axe(container);
    expect(results).toHaveNoViolations();
    restore();
  });

  it('exactly one h1 ("Submission received") followed by the "What happens next" h2 — no level skipped', () => {
    mockSearchParams(REFERENCE);
    render(<RegistrationSubmittedPage />);

    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(/submission received/i);

    const h2 = screen.getByRole('heading', { level: 2, name: /what happens next/i });
    expect(h2).toBeInTheDocument();
  });

  it('labelled controls: the copy button, the reference text, and the status link all have accessible names', () => {
    mockSearchParams(REFERENCE);
    render(<RegistrationSubmittedPage />);

    expect(screen.getByRole('button', { name: /copy reference code/i })).toBeInTheDocument();
    expect(screen.getByText(REFERENCE)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /check the status of your submission/i }),
    ).toHaveAttribute('href', '/register/status');
  });

  it('keyboard operability: the copy button and the status link are focusable', () => {
    mockSearchParams(REFERENCE);
    render(<RegistrationSubmittedPage />);

    const copyButton = screen.getByRole('button', { name: /copy reference code/i });
    copyButton.focus();
    expect(copyButton).toHaveFocus();

    const statusLink = screen.getByRole('link', { name: /check the status of your submission/i });
    statusLink.focus();
    expect(statusLink).toHaveFocus();
  });

  it('the clipboard-copy feedback announces via a live region (mirrors the pattern already proven in ReferenceCard.test.tsx, over the composed page)', async () => {
    mockSearchParams(REFERENCE);
    const restore = stubClipboard(jest.fn().mockResolvedValue(undefined));
    render(<RegistrationSubmittedPage />);

    const { fireEvent, waitFor } = await import('@testing-library/react');
    fireEvent.click(screen.getByRole('button', { name: /copy reference code/i }));

    await waitFor(() =>
      expect(screen.getByText(/reference code copied to clipboard/i)).toBeInTheDocument(),
    );
    const liveRegion = screen.getByText(/reference code copied to clipboard/i);
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    restore();
  });
});

// ---------------------------------------------------------------------------
// Missing ?ref= — the fallback state
// ---------------------------------------------------------------------------

describe('/register/submitted — no-reference fallback state, whole-page axe', () => {
  it('has no jest-axe violations', async () => {
    mockSearchParams(null);
    const { container } = render(<RegistrationSubmittedPage />);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('offers a keyboard-focusable, labelled way forward (the status-lookup link)', () => {
    mockSearchParams(null);
    render(<RegistrationSubmittedPage />);

    const link = screen.getByRole('link', { name: /look up a submission/i });
    expect(link).toHaveAttribute('href', '/register/status');
    link.focus();
    expect(link).toHaveFocus();
  });
});
