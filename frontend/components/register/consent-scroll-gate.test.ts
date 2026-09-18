/**
 * Unit tests for hasReachedScrollEnd() — T-18 (FR-3 s2, DD-8, DC-17).
 *
 * This is the "covered half" DC-17 describes: the predicate is a pure
 * function over injected `{scrollTop, clientHeight, scrollHeight}` metrics,
 * so every branch below is provable without a browser or any DOM layout.
 * What it does NOT and cannot prove — that a real browser reports these
 * exact numbers at the moment an applicant has actually scrolled a real
 * policy to its end — is recorded as a human check in
 * `ConsentPolicyDisclosure.tsx` and is not asserted anywhere in this file.
 */

import { hasReachedScrollEnd, type ScrollEndMetrics } from './consent-scroll-gate';

describe('hasReachedScrollEnd()', () => {
  // ── Content shorter than (or equal to) its container — DD-8's named edge case ──
  it('reports true when content is strictly shorter than its container', () => {
    const metrics: ScrollEndMetrics = { scrollTop: 0, clientHeight: 300, scrollHeight: 150 };
    expect(hasReachedScrollEnd(metrics)).toBe(true);
  });

  it('reports true when content exactly fills its container (scrollHeight === clientHeight)', () => {
    const metrics: ScrollEndMetrics = { scrollTop: 0, clientHeight: 300, scrollHeight: 300 };
    expect(hasReachedScrollEnd(metrics)).toBe(true);
  });

  it('reports true for all-zero metrics (the degenerate jsdom case), since 0 <= 0', () => {
    const metrics: ScrollEndMetrics = { scrollTop: 0, clientHeight: 0, scrollHeight: 0 };
    expect(hasReachedScrollEnd(metrics)).toBe(true);
  });

  it('does NOT require scrollTop to have moved for short content — the trap inline logic falls into', () => {
    // scrollTop stays 0 forever for genuinely short content: there is
    // nothing to scroll. A naive check requiring scrollTop > 0 before
    // considering the gate satisfied would strand this case disabled
    // permanently — this is the exact regression DD-8 guards against.
    const metrics: ScrollEndMetrics = { scrollTop: 0, clientHeight: 500, scrollHeight: 80 };
    expect(hasReachedScrollEnd(metrics)).toBe(true);
  });

  // ── Genuinely scrollable content — not yet at the end ──────────────────────
  it('reports false at the top of long content', () => {
    const metrics: ScrollEndMetrics = { scrollTop: 0, clientHeight: 300, scrollHeight: 1200 };
    expect(hasReachedScrollEnd(metrics)).toBe(false);
  });

  it('reports false partway through long content', () => {
    const metrics: ScrollEndMetrics = { scrollTop: 500, clientHeight: 300, scrollHeight: 1200 };
    expect(hasReachedScrollEnd(metrics)).toBe(false);
  });

  it('reports false when a few pixels remain below the tolerance threshold', () => {
    // scrollTop(895) + clientHeight(300) = 1195, short of scrollHeight(1200)
    // by 5px — outside the 1px tolerance.
    const metrics: ScrollEndMetrics = { scrollTop: 895, clientHeight: 300, scrollHeight: 1200 };
    expect(hasReachedScrollEnd(metrics)).toBe(false);
  });

  // ── Genuinely scrollable content — at or past the end ───────────────────────
  it('reports true at the exact end (scrollTop + clientHeight === scrollHeight)', () => {
    const metrics: ScrollEndMetrics = { scrollTop: 900, clientHeight: 300, scrollHeight: 1200 };
    expect(hasReachedScrollEnd(metrics)).toBe(true);
  });

  it('reports true within the sub-pixel tolerance of the end', () => {
    // scrollTop(899.4) + clientHeight(300) = 1199.4, 0.6px short of 1200 —
    // within the 1px tolerance for fractional/zoomed layouts.
    const metrics: ScrollEndMetrics = { scrollTop: 899.4, clientHeight: 300, scrollHeight: 1200 };
    expect(hasReachedScrollEnd(metrics)).toBe(true);
  });

  it('reports true past the end (browser rubber-band overscroll)', () => {
    const metrics: ScrollEndMetrics = { scrollTop: 950, clientHeight: 300, scrollHeight: 1200 };
    expect(hasReachedScrollEnd(metrics)).toBe(true);
  });
});
