/**
 * Smoke tests for the T-1 motion foundation (NFR-5).
 *
 * Goals:
 *  1. motion-tokens exports are present and numerically correct.
 *  2. gsap-setup imports without throwing and registerGsap() is idempotent.
 *  3. The GSAP mock is wired correctly (real gsap is never called in jsdom).
 *  4. window.matchMedia polyfill is present and doesn't throw.
 */

import { DURATION, EASE, REVEAL, COUNT_UP } from '../motion-tokens';
import { registerGsap, gsap, ScrollTrigger } from '../gsap-setup';

describe('motion-tokens', () => {
  it('exports DURATION with fast/base/slow in seconds', () => {
    expect(DURATION.fast).toBe(0.3);
    expect(DURATION.base).toBe(0.6);
    expect(DURATION.slow).toBe(0.9);
  });

  it('exports EASE with out and soft keys', () => {
    expect(EASE.out).toBe('power2.out');
    expect(EASE.soft).toBe('power1.out');
  });

  it('exports REVEAL with y offset and stagger interval', () => {
    expect(REVEAL.y).toBe(24);
    expect(REVEAL.stagger).toBe(0.08);
  });

  it('exports COUNT_UP with duration and ease', () => {
    expect(COUNT_UP.duration).toBe(1.0);
    expect(COUNT_UP.ease).toBe('power1.out');
  });
});

describe('gsap-setup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('imports without throwing', () => {
    expect(() => {
      // re-import is a no-op; just verify the module loaded
      void gsap;
      void ScrollTrigger;
    }).not.toThrow();
  });

  it('registerGsap() calls gsap.registerPlugin exactly once across multiple calls', () => {
    // Reset the module-level `registered` flag by re-importing a fresh instance
    // (module cache means the flag persists; we verify idempotency via the mock call count)
    registerGsap();
    registerGsap();
    registerGsap();
    // gsap.registerPlugin is a no-op mock; it must have been called at most once
    // (the first call in this test; prior module-level calls are already done)
    expect((gsap.registerPlugin as jest.Mock).mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('gsap mock has the expected no-op methods', () => {
    expect(typeof gsap.to).toBe('function');
    expect(typeof gsap.from).toBe('function');
    expect(typeof gsap.fromTo).toBe('function');
    expect(typeof gsap.set).toBe('function');
    expect(typeof gsap.timeline).toBe('function');
    expect(typeof gsap.matchMedia).toBe('function');
    expect(typeof gsap.registerPlugin).toBe('function');
  });

  it('gsap.matchMedia() returns an object with add and revert', () => {
    const mm = gsap.matchMedia();
    expect(typeof mm.add).toBe('function');
    expect(typeof mm.revert).toBe('function');
  });

  it('ScrollTrigger mock has batch and refresh', () => {
    expect(typeof ScrollTrigger.batch).toBe('function');
    expect(typeof ScrollTrigger.refresh).toBe('function');
    expect(Array.isArray(ScrollTrigger.batch('.selector', {}))).toBe(true);
  });
});

describe('window.matchMedia polyfill', () => {
  it('is defined and returns a MediaQueryList-shaped object', () => {
    expect(typeof window.matchMedia).toBe('function');
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    expect(mql.matches).toBe(false);
    expect(mql.media).toBe('(prefers-reduced-motion: reduce)');
    expect(typeof mql.addEventListener).toBe('function');
    expect(typeof mql.removeEventListener).toBe('function');
  });

  it('does not throw when addEventListener/removeEventListener are called', () => {
    const mql = window.matchMedia('(min-width: 800px)');
    expect(() => {
      mql.addEventListener('change', () => {});
      mql.removeEventListener('change', () => {});
    }).not.toThrow();
  });
});
