import '@testing-library/jest-dom';

/**
 * window.matchMedia polyfill — jsdom does not implement matchMedia.
 * Returns `matches: false` for every query (treated as "no reduced-motion / desktop")
 * so any direct matchMedia() call in component or hook code doesn't throw (NFR-5).
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList =>
    ({
      matches:             false,
      media:               query,
      addEventListener:    () => {},
      removeEventListener: () => {},
      addListener:         () => {},    // deprecated but some libs still call it
      removeListener:      () => {},    // deprecated
      dispatchEvent:       () => false,
    } as unknown as MediaQueryList),
});
