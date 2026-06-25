/**
 * Tests for useReveal hook and <Reveal> component (T-2).
 *
 * GSAP is fully mocked via moduleNameMapper (jest.config.ts):
 *   gsap.from / gsap.matchMedia / ScrollTrigger.batch → no-ops
 *   useGSAP → runs callback once inside useEffect (no real animation)
 *
 * Test goals (FR-8 / NFR-5):
 *  1. Children are present and visible in the DOM even though GSAP is mocked.
 *  2. No throw on mount or unmount (cleanup-safe).
 *  3. Hook wires into the matchMedia / gsap mock path without error.
 *  4. <Reveal> component passes through `as`, className, and children correctly.
 *  5. Custom RevealOptions (y, stagger, start, once) are accepted without error.
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { gsap } from '../gsap-setup';
import { useReveal, Reveal } from '../useReveal';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal consumer component that uses the useReveal hook directly. */
function HookConsumer({
  options = {},
}: {
  options?: Parameters<typeof useReveal>[0];
}) {
  const ref = useReveal<HTMLDivElement>(options);
  return (
    <div ref={ref} data-testid="container">
      <p data-testid="child-1">Seed actor one</p>
      <p data-testid="child-2">Seed actor two</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Children visible with GSAP mocked (FR-8)
// ---------------------------------------------------------------------------

describe('useReveal — children visibility with mocked GSAP', () => {
  it('renders children into the DOM', () => {
    render(<HookConsumer />);
    expect(screen.getByTestId('child-1')).toBeInTheDocument();
    expect(screen.getByTestId('child-2')).toBeInTheDocument();
  });

  it('children are visible (not hidden)', () => {
    render(<HookConsumer />);
    const child1 = screen.getByTestId('child-1');
    const child2 = screen.getByTestId('child-2');
    // GSAP is mocked — no `autoAlpha:0` / `visibility:hidden` is applied.
    expect(child1).toBeVisible();
    expect(child2).toBeVisible();
  });

  it('container scope ref is attached (element exists)', () => {
    render(<HookConsumer />);
    expect(screen.getByTestId('container')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. Mount / unmount safety (cleanup-safe)
// ---------------------------------------------------------------------------

describe('useReveal — mount and unmount safety', () => {
  it('does not throw on mount', () => {
    expect(() => render(<HookConsumer />)).not.toThrow();
  });

  it('does not throw on unmount', () => {
    const { unmount } = render(<HookConsumer />);
    expect(() => unmount()).not.toThrow();
  });

  it('can remount after unmount without error', () => {
    const { unmount } = render(<HookConsumer />);
    unmount();
    expect(() => render(<HookConsumer />)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. GSAP mock interaction — matchMedia path is called (FR-7 gate)
// ---------------------------------------------------------------------------

describe('useReveal — GSAP mock integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls gsap.matchMedia() to create the reduced-motion gate', async () => {
    await act(async () => {
      render(<HookConsumer />);
    });
    // The hook calls matchMedia once per mount to establish the no-preference gate.
    expect((gsap.matchMedia as jest.Mock)).toHaveBeenCalled();
  });

  it('calls mm.add with the no-preference media query string', async () => {
    const addMock = jest.fn();
    (gsap.matchMedia as jest.Mock).mockReturnValueOnce({
      add:    addMock,
      revert: jest.fn(),
    });

    await act(async () => {
      render(<HookConsumer />);
    });

    expect(addMock).toHaveBeenCalledWith(
      '(prefers-reduced-motion: no-preference)',
      expect.any(Function),
    );
  });

  it('does not call gsap.from directly (animation is gated inside matchMedia.add)', async () => {
    // gsap.matchMedia().add is a no-op in the mock so its callback never fires.
    // gsap.from must therefore NOT be called in the standard test run.
    jest.clearAllMocks();
    await act(async () => {
      render(<HookConsumer />);
    });
    expect((gsap.from as jest.Mock)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4. Custom RevealOptions are accepted without error
// ---------------------------------------------------------------------------

describe('useReveal — custom options', () => {
  it('accepts custom y offset without error', () => {
    expect(() => render(<HookConsumer options={{ y: 40 }} />)).not.toThrow();
  });

  it('accepts custom stagger without error', () => {
    expect(() => render(<HookConsumer options={{ stagger: 0.15 }} />)).not.toThrow();
  });

  it('accepts custom start string without error', () => {
    expect(() => render(<HookConsumer options={{ start: 'top 75%' }} />)).not.toThrow();
  });

  it('accepts once:false without error', () => {
    expect(() => render(<HookConsumer options={{ once: false }} />)).not.toThrow();
  });

  it('accepts custom targets selector without error', () => {
    expect(() =>
      render(<HookConsumer options={{ targets: '.card' }} />),
    ).not.toThrow();
  });

  it('accepts all options combined without error', () => {
    expect(() =>
      render(
        <HookConsumer
          options={{ y: 32, stagger: 0.1, start: 'top 80%', once: true, targets: ':scope > li' }}
        />,
      ),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 5. <Reveal> wrapper component
// ---------------------------------------------------------------------------

describe('<Reveal> component', () => {
  it('renders children inside the default div wrapper', () => {
    render(
      <Reveal>
        <span data-testid="reveal-child">Groundnut</span>
      </Reveal>,
    );
    expect(screen.getByTestId('reveal-child')).toBeInTheDocument();
    expect(screen.getByTestId('reveal-child')).toBeVisible();
  });

  it('renders as a custom element when as prop is provided', () => {
    const { container } = render(
      <Reveal as="section" data-testid="reveal-section">
        <p>Sorghum</p>
      </Reveal>,
    );
    // The outermost element should be a <section>, not a <div>.
    const section = container.querySelector('section');
    expect(section).not.toBeNull();
    expect(section?.tagName.toLowerCase()).toBe('section');
  });

  it('forwards className to the wrapper element', () => {
    const { container } = render(
      <Reveal className="py-16 bg-white">
        <p>Common bean</p>
      </Reveal>,
    );
    const wrapper = container.firstElementChild;
    expect(wrapper?.classList.contains('py-16')).toBe(true);
    expect(wrapper?.classList.contains('bg-white')).toBe(true);
  });

  it('passes RevealOptions (y, stagger, start, once) without error', () => {
    expect(() =>
      render(
        <Reveal y={32} stagger={0.12} start="top 80%" once={true}>
          <span>Actor</span>
        </Reveal>,
      ),
    ).not.toThrow();
  });

  it('does not throw on unmount', () => {
    const { unmount } = render(
      <Reveal as="ul">
        <li>Item</li>
      </Reveal>,
    );
    expect(() => unmount()).not.toThrow();
  });

  it('renders multiple children as siblings', () => {
    render(
      <Reveal>
        <div data-testid="a">A</div>
        <div data-testid="b">B</div>
        <div data-testid="c">C</div>
      </Reveal>,
    );
    expect(screen.getByTestId('a')).toBeVisible();
    expect(screen.getByTestId('b')).toBeVisible();
    expect(screen.getByTestId('c')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 6. Single-element (no stagger) variant
// ---------------------------------------------------------------------------

describe('useReveal — single-element reveal (no stagger)', () => {
  it('renders a single child visibly with stagger:0', () => {
    function SingleReveal() {
      const ref = useReveal<HTMLDivElement>({ stagger: 0 });
      return (
        <div ref={ref}>
          <h2 data-testid="headline">Tanzania Seed Registry</h2>
        </div>
      );
    }
    render(<SingleReveal />);
    expect(screen.getByTestId('headline')).toBeVisible();
  });
});
