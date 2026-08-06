/**
 * consent-scroll-gate.ts — pure end-detection predicate for
 * `ConsentPolicyDisclosure` (T-18, `design.md` §5.2, DD-8, DC-17).
 *
 * jsdom performs no layout: every element's `scrollTop`, `clientHeight`, and
 * `scrollHeight` read back as `0` there, so a DOM-level test asking "did the
 * checkbox enable at the real end of the real policy text" would assert
 * against three zeroes and pass on a control that enables instantly or never
 * (DC-17). Extracting the decision into a pure function over **injected**
 * metrics is what makes the LOGIC provable without a browser. The
 * PRESENTATION — that a real browser actually reports these numbers at the
 * moment the user has genuinely scrolled to the end — is a separate, human
 * check; see the "Human check" note in `ConsentPolicyDisclosure.tsx`.
 */

/** The three DOM scroll metrics this predicate decides over (DD-8). */
export interface ScrollEndMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

/**
 * Sub-pixel slack for the "at the bottom" comparison. Real browsers can
 * report fractional scroll metrics (subpixel rendering, OS-level zoom) that
 * leave `scrollTop + clientHeight` a hair short of `scrollHeight` even when
 * the user is visually at the end — an exact `>=` with no tolerance would
 * strand a real user one pixel short of a control that never enables.
 */
const END_TOLERANCE_PX = 1;

/**
 * True once the scrollable region has been scrolled to its end — or was
 * never scrollable to begin with.
 *
 * The content-shorter-than-container case is its OWN branch, not folded
 * into the arithmetic below. `scrollHeight <= clientHeight` means the whole
 * policy is already visible and `scrollTop` will never move off `0` no
 * matter how the applicant interacts with the region. Inline logic that
 * reads "`scrollTop` is still `0`" as "hasn't finished reading" traps every
 * applicant shown a short policy behind a control that can never enable —
 * exactly the edge case `design.md` §5.2 and DD-8 call out as the one a
 * naive inline check gets wrong.
 */
export function hasReachedScrollEnd(metrics: ScrollEndMetrics): boolean {
  const { scrollTop, clientHeight, scrollHeight } = metrics;

  if (scrollHeight <= clientHeight) return true;

  return scrollTop + clientHeight >= scrollHeight - END_TOLERANCE_PX;
}
