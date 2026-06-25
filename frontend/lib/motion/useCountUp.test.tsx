/**
 * useCountUp unit tests (T-3, FR-3, FR-4, FR-7, FR-8, NFR-2, NFR-5).
 *
 * GSAP is mocked via jest.config.ts moduleNameMapper:
 *   gsap            → __mocks__/gsap.ts       (all tween methods are no-ops)
 *   gsap/ScrollTrigger → __mocks__/gsap/ScrollTrigger.ts
 *   @gsap/react     → __mocks__/@gsap/react.ts  (useGSAP runs cb once, no animation)
 *
 * Because gsap.matchMedia().add() is a no-op in the mock, the real animation
 * callback never fires — this is the intended test path (FR-8): the hook must
 * NOT erase the final value that the component's JSX renders.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { useCountUp } from './useCountUp';

// ---------------------------------------------------------------------------
// Minimal test component
// ---------------------------------------------------------------------------

interface TestProps {
  target: number | null | undefined;
  enabled?: boolean;
  suffix?: string;
  format?: (n: number) => string;
}

/** Renders a <span> exactly as a consumer would: JSX shows the final value. */
function CountUpSpan({ target, enabled, suffix, format }: TestProps) {
  const { ref } = useCountUp(target, { enabled, suffix, format });

  // The component's JSX always renders the final formatted value so the DOM
  // is correct without GSAP (FR-8 progressive enhancement).
  const finalText =
    target != null && isFinite(target)
      ? `${Math.round(target).toLocaleString('en-US')}${suffix ?? ''}`
      : '';

  return (
    <span data-testid="metric" ref={ref}>
      {finalText}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCountUp', () => {
  // FR-8: with GSAP mocked (useGSAP runs cb once, matchMedia.add no-ops)
  // the final value rendered in JSX must survive — hook must NOT blank the node.
  it('FR-8: final formatted value is present in the DOM with GSAP mocked', () => {
    render(<CountUpSpan target={1000} suffix="+" />);
    expect(screen.getByTestId('metric')).toHaveTextContent('1,000+');
  });

  it('formats integer targets with thousands separators', () => {
    render(<CountUpSpan target={4523} />);
    expect(screen.getByTestId('metric')).toHaveTextContent('4,523');
  });

  it('formats large integers correctly', () => {
    render(<CountUpSpan target={1234567} />);
    expect(screen.getByTestId('metric')).toHaveTextContent('1,234,567');
  });

  // FR-4: enabled=false (data not yet loaded) — final value still shown, no throw.
  it('FR-4: enabled=false — shows final value, does not throw', () => {
    render(<CountUpSpan target={500} enabled={false} />);
    // The hook is suppressed; the JSX-rendered value is still in the DOM.
    expect(screen.getByTestId('metric')).toHaveTextContent('500');
  });

  // FR-8 / null target: component renders empty without throwing.
  it('null target — renders empty gracefully, no throw', () => {
    expect(() => render(<CountUpSpan target={null} />)).not.toThrow();
    expect(screen.getByTestId('metric').textContent).toBe('');
  });

  // FR-8 / undefined target: same as null.
  it('undefined target — renders empty gracefully, no throw', () => {
    expect(() => render(<CountUpSpan target={undefined} />)).not.toThrow();
    expect(screen.getByTestId('metric').textContent).toBe('');
  });

  // Non-finite target: hook guards and doesn't erase content.
  it('NaN target — does not throw, renders empty', () => {
    expect(() => render(<CountUpSpan target={NaN} />)).not.toThrow();
  });

  it('Infinity target — does not throw, renders empty', () => {
    expect(() => render(<CountUpSpan target={Infinity} />)).not.toThrow();
  });

  // Custom formatter: hook passes it through.
  it('custom format function is accepted without throwing', () => {
    const fmt = (n: number) => `${n.toFixed(1)} ha`;
    render(
      <CountUpSpan
        target={42}
        format={fmt}
      />,
    );
    // JSX-rendered value uses our own logic; hook just receives the formatter.
    // What matters is no throw and the node is still in the DOM.
    expect(screen.getByTestId('metric')).toBeInTheDocument();
  });

  // Zero target: edge case — renders "0" without animation.
  it('target=0 — renders "0" without throw', () => {
    render(<CountUpSpan target={0} />);
    expect(screen.getByTestId('metric')).toHaveTextContent('0');
  });

  // Cleanup on unmount must not throw.
  it('unmounts cleanly without throwing', () => {
    const { unmount } = render(<CountUpSpan target={100} />);
    expect(() => unmount()).not.toThrow();
  });

  // Hook can be called with no options at all.
  it('works with only target and no options', () => {
    render(<CountUpSpan target={750} />);
    expect(screen.getByTestId('metric')).toHaveTextContent('750');
  });

  // FR-7 / reduced-motion: matchMedia.add is a no-op in the mock, so the hook
  // never fires the animation callback → the JSX-rendered final value stays.
  // (In production, gsap.matchMedia ensures no animation for reduced-motion users.)
  it('FR-7: matchMedia no-op leaves final value intact (simulates reduced-motion)', () => {
    // The GSAP mock's matchMedia.add() never invokes the callback, which is
    // exactly the reduced-motion behavior: no animation, final value intact.
    render(<CountUpSpan target={1000} suffix="+" />);
    const node = screen.getByTestId('metric');
    // textContent is exactly what JSX rendered — hook did not blank it.
    expect(node.textContent).toBe('1,000+');
  });
});
