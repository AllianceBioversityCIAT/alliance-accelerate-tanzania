/**
 * Jest manual mock for 'gsap/ScrollTrigger'.
 *
 * ScrollTrigger methods are no-ops; batch() returns an empty array.
 * Wired via moduleNameMapper in jest.config.ts.
 */

const ScrollTriggerMock = {
  batch:    jest.fn().mockReturnValue([]),
  refresh:  jest.fn(),
  register: jest.fn(),
  getAll:   jest.fn().mockReturnValue([]),
  getById:  jest.fn().mockReturnValue(null),
  create:   jest.fn().mockReturnValue({ kill: jest.fn() }),
  kill:     jest.fn(),
};

export { ScrollTriggerMock as ScrollTrigger };
export default ScrollTriggerMock;
