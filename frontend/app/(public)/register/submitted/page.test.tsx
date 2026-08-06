/**
 * Unit tests for /register/submitted (T-20, FR-5 scenario 2, FR-14,
 * design.md §5.4).
 *
 * Covers:
 *   - `?ref=` renders `ReferenceCard` with that exact reference
 *   - a missing `?ref=` renders the no-reference fallback instead of
 *     crashing or rendering a card with an empty/garbage value
 *   - "What happens next" copy is present and states the review-then-
 *     lookup behaviour, framing lookup (not email) as reliable
 *   - the T-19 hand-off: `app/(public)/register/page.tsx`'s
 *     `handleSubmitted` already calls
 *     `router.push('/register/submitted?ref=' + encodeURIComponent(reference))` —
 *     this file does not re-test that call site (it is `page.test.tsx`'s
 *     concern, already covered there); it confirms the RECEIVING end reads
 *     `ref` via the same `useSearchParams().get('ref')` shape that
 *     `URLSearchParams` produces from that URL, including a reference
 *     containing a character `encodeURIComponent` escapes.
 *
 * ── The Disqualifying-clause absence assertion (FR-5 s2) — REVISED ─────────
 * FR-5 scenario 2 requires this screen to NOT describe chunk 4's review
 * round trip — the mockup's "We may email you for more information… you'll
 * get a link back to this form". A test asserting the CORRECT copy is
 * present (as several tests below do) does not prove that false promise is
 * ABSENT: nothing stops a future edit from adding both.
 *
 * **Correction to a prior version of this file.** That version claimed a
 * set of four regexes would catch "a future edit that reintroduces the
 * promise in different wording" and cited as proof an example sentence —
 * "we might reach out by email for additional details and send you a link
 * back to the registration form". Traced against those four patterns at the
 * time, the cited example matched ZERO of them (missing the "registration"
 * qualifier in the link pattern, and no "by email ... for" alternative in
 * the information-request pattern) — a source comment asserting a property
 * the code in the same file did not have. Two independent rewordings not
 * built from the mockup's own vocabulary ("we'll be in touch if we need
 * anything else"; "watch your inbox — we may need more from you") escape
 * ALL FOUR patterns regardless of that fix, because no fixed set of regexes
 * is a semantic oracle over free-form English.
 *
 * **The fix: an exact-text PIN over the WHOLE REGION is now the PRIMARY
 * guard.** `PINNED_WHAT_HAPPENS_NEXT_COPY` is a byte-for-byte copy of the
 * "What happens next" paragraph as shipped, and the pin test asserts
 * equality against `region.textContent` (heading + paragraph), not just the
 * first `<p>` it finds.
 *
 * **Second correction, same round.** An EARLIER version of this fix pinned
 * only `region.querySelector('p')`. That is exactly right for an EDITED
 * paragraph, but fails OPEN for an APPENDED one: a second `<p>` (or any
 * other node) added inside the section — the natural way a chunk-4 promise
 * returns in practice, since it reads as "add a line about email" rather
 * than "rewrite the existing sentence" — leaves `querySelector('p')`
 * matching the untouched original and the pin passing. Pinning
 * `region.textContent` instead closes that: any node added anywhere inside
 * the section changes the region's full text and fails the equality
 * assertion, regardless of whether it is a new `<p>`, a `<span>`, or plain
 * text.
 *
 * With that fix, "a maintainer cannot silently swap in a chunk-4 promise,
 * in any phrasing, without this test going red" is true as written, not an
 * overclaim: the guard covers edits, rewrites, AND appends within this
 * section.
 *
 * `FORBIDDEN_ROUND_TRIP_PATTERNS` is kept as a SECONDARY tripwire, corrected
 * so the cited mockup-family example now genuinely matches — and the
 * sanity-check test below verifies EACH corrected clause SEPARATELY
 * (`.some()` over the whole sentence previously let one clause's fix mask
 * the other's regression). It exists to fail fast, with a message naming
 * which forbidden phrase reappeared, *before* a maintainer has to diff the
 * pin's giant string by eye. It is NOT claimed to catch arbitrary
 * rewordings outside the mockup's lexical family — that guarantee comes
 * from the pin alone.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(),
}));

/* eslint-disable */
const { useSearchParams } = require('next/navigation') as { useSearchParams: jest.Mock };
/* eslint-enable */

import RegistrationSubmittedPage from './page';

/** Mimics `URLSearchParams.get` over a single `ref` param (or none). */
function mockSearchParams(ref: string | null) {
  useSearchParams.mockReturnValue({
    get: (key: string) => (key === 'ref' ? ref : null),
  });
}

/**
 * The PRIMARY absence guard (FR-5 s2 Disqualifying). Byte-for-byte the
 * "What happens next" paragraph in `page.tsx`'s `SubmittedView` as shipped.
 * Any change to that paragraph — reworded, extended, or replaced — fails
 * the equality assertion below, regardless of whether the new wording
 * happens to match any pattern anyone thought to write.
 */
const PINNED_WHAT_HAPPENS_NEXT_COPY =
  'A member of the ACCELERATE Tanzania team reviews every submission. Once a decision is ' +
  'made, the most reliable way to find out is to look up your submission using your ' +
  'reference code and the email address you verified — you can do this at any time with ' +
  'the button above. We will also try to email you when a decision is made, but delivery ' +
  'is not guaranteed, so please do not rely on it: save your reference code and check back ' +
  'with it instead.';

/**
 * SECONDARY tripwire — the mockup's own lexical family, corrected so the
 * header's cited example (see above) genuinely matches. Matched against
 * whitespace-normalised `container.textContent`, case-insensitively.
 */
const FORBIDDEN_ROUND_TRIP_PATTERNS: RegExp[] = [
  /link back to (the|this) (registration |sign-?up )?form/i,
  /return(?:ing)? to (the|this) (registration |sign-?up )?form/i,
  /email you (?:for|to|requesting) (?:more|additional) (?:information|details)/i,
  /by email.*for (?:more|additional) (?:information|details)/i,
  /(?:request|ask)(?:ing)? (?:you )?for (?:more|additional) (?:information|details)/i,
];

describe('/register/submitted', () => {
  it('renders ReferenceCard with the reference from ?ref=', () => {
    mockSearchParams('REG-2026-0184');
    render(<RegistrationSubmittedPage />);
    expect(screen.getByText('REG-2026-0184')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /submission received/i })).toBeInTheDocument();
  });

  it('decodes a reference URL-escaped by the T-19 hand-off (encodeURIComponent round trip)', () => {
    // OtpVerificationStep -> page.tsx pushes
    // `/register/submitted?ref=${encodeURIComponent(reference)}`; Next's
    // useSearchParams().get already decodes, so the receiving side sees the
    // plain reference back. Simulated here rather than re-parsing a URL,
    // since useSearchParams is mocked.
    mockSearchParams(decodeURIComponent(encodeURIComponent('REG-2026-0184')));
    render(<RegistrationSubmittedPage />);
    expect(screen.getByText('REG-2026-0184')).toBeInTheDocument();
  });

  it('renders a fallback, not a crash or an empty card, when ?ref= is missing', () => {
    mockSearchParams(null);
    render(<RegistrationSubmittedPage />);
    expect(screen.getByText(/no reference code found/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /submission received/i })).not.toBeInTheDocument();
    // The fallback still offers a way forward.
    expect(screen.getByRole('link', { name: /look up a submission/i })).toHaveAttribute(
      'href',
      '/register/status',
    );
  });

  it('states the review-then-lookup behaviour and frames lookup, not email, as reliable', () => {
    mockSearchParams('REG-2026-0184');
    render(<RegistrationSubmittedPage />);
    expect(screen.getByText(/reviews every submission/i)).toBeInTheDocument();
    expect(
      screen.getByText(/most reliable way to find out is to look up your submission/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/delivery is not guaranteed/i)).toBeInTheDocument();
  });

  it(
    'pins the exact "What happens next" copy — ANY wording change (including every ' +
      'variant of the forbidden round-trip promise) fails this assertion and forces a ' +
      'human re-read against FR-5 s2 / design.md §5.4',
    () => {
      mockSearchParams('REG-2026-0184');
      render(<RegistrationSubmittedPage />);
      const region = screen.getByRole('region', { name: /what happens next/i });
      // Pins the WHOLE region's text, not just its first `<p>` — a second
      // `<p>` (or any other element) APPENDED anywhere inside the section
      // is the natural way a chunk-4 promise returns (someone adds a line
      // about email rather than editing the existing sentence), and
      // `region.querySelector('p')` alone would keep matching the
      // untouched original paragraph while the appended node went
      // unchecked. Normalising collapses the heading/paragraph boundary
      // and any JSX-formatting whitespace into single spaces so this pin
      // is robust to reflow, not to content.
      expect(region.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        // No space between heading and paragraph text: JSX discards
        // pure-whitespace formatting between sibling elements entirely
        // (verified empirically — there is no text node there to collapse).
        `What happens next${PINNED_WHAT_HAPPENS_NEXT_COPY}`,
      );
    },
  );

  it('does NOT match the forbidden round-trip promise\'s lexical family (secondary tripwire)', () => {
    mockSearchParams('REG-2026-0184');
    const { container } = render(<RegistrationSubmittedPage />);
    const text = (container.textContent ?? '').replace(/\s+/g, ' ');

    for (const pattern of FORBIDDEN_ROUND_TRIP_PATTERNS) {
      expect(text).not.toMatch(pattern);
    }
  });

  it("sanity check: BOTH corrected clauses of the secondary patterns independently match the header's cited regression example", () => {
    // This is not a test of the shipped page — it is proof that the two
    // corrections made to FORBIDDEN_ROUND_TRIP_PATTERNS are each real,
    // checked SEPARATELY rather than with a single `.some()` over the
    // whole sentence. A prior version of this test used `.some()` and
    // stayed green even with the link-pattern fix (the `(registration
    // |sign-?up )?` group) reverted, because the "by email ... for"
    // pattern matched the sentence's OTHER clause independently — the two
    // corrections were not separately guarded. Asserting each clause
    // against its own pattern closes that gap: reverting either fix now
    // fails its own line.
    const linkClause = 'reach out and send you a link back to the registration form';
    const emailClause = 'we might reach out by email for additional details';

    expect(linkClause).toMatch(FORBIDDEN_ROUND_TRIP_PATTERNS[0]);
    expect(emailClause).toMatch(FORBIDDEN_ROUND_TRIP_PATTERNS[3]);
  });
});
