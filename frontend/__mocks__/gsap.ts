/**
 * Jest manual mock for 'gsap'.
 *
 * All GSAP methods are no-op jest.fns returning chainable stubs so components
 * that call gsap.from(), gsap.to(), etc. inside useGSAP() don't throw in jsdom.
 * Wired via moduleNameMapper in jest.config.ts (node_modules mocks require this).
 *
 * The mock intentionally does NOT perform any animation — FR-8 / NFR-5:
 * components must render their final, visible DOM without GSAP running.
 */

/** Minimal chainable tween stub returned by gsap tween methods. */
const tweenStub = {
  kill:     jest.fn(),
  pause:    jest.fn(),
  play:     jest.fn(),
  reverse:  jest.fn(),
  progress: jest.fn(),
  then:     jest.fn(),
};

/** Minimal chainable timeline stub. */
const timelineStub = {
  ...tweenStub,
  to:     jest.fn().mockReturnThis(),
  from:   jest.fn().mockReturnThis(),
  fromTo: jest.fn().mockReturnThis(),
  set:    jest.fn().mockReturnThis(),
  add:    jest.fn().mockReturnThis(),
};

const gsapMock = {
  to:             jest.fn().mockReturnValue(tweenStub),
  from:           jest.fn().mockReturnValue(tweenStub),
  fromTo:         jest.fn().mockReturnValue(tweenStub),
  set:            jest.fn().mockReturnValue(tweenStub),
  timeline:       jest.fn().mockReturnValue(timelineStub),
  registerPlugin: jest.fn(),
  /** matchMedia() no-op: add() never fires the callback in tests so elements stay at natural state. */
  matchMedia: jest.fn().mockReturnValue({
    add:    jest.fn(),
    revert: jest.fn(),
  }),
  utils: {
    clamp:    jest.fn((min: number, max: number, v: number) => Math.min(Math.max(v, min), max)),
    mapRange: jest.fn(),
    toArray:  jest.fn().mockReturnValue([]),
    wrap:     jest.fn(),
  },
  context: jest.fn().mockReturnValue({
    add:    jest.fn(),
    revert: jest.fn(),
    kill:   jest.fn(),
  }),
  defaults: jest.fn(),
  ticker:   { add: jest.fn(), remove: jest.fn() },
};

export { gsapMock as gsap };
export default gsapMock;
