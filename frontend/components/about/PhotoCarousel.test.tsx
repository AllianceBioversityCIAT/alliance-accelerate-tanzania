import { render, screen, fireEvent, act } from '@testing-library/react';
import PhotoCarousel from './PhotoCarousel';

const PHOTOS = [
  { src: '/a.jpg', alt: 'Photo A' },
  { src: '/b.jpg', alt: 'Photo B' },
  { src: '/c.jpg', alt: 'Photo C' },
];

function visibleAlt() {
  // Inactive slides are aria-hidden, so only the active image is in the a11y tree.
  return screen.getByRole('img').getAttribute('alt');
}

describe('PhotoCarousel', () => {
  it('shows the first photo and exposes only it to assistive tech', () => {
    render(<PhotoCarousel photos={PHOTOS} label="Field photos" />);
    expect(screen.getByRole('region', { name: 'Field photos' })).toBeInTheDocument();
    expect(visibleAlt()).toBe('Photo A');
  });

  it('next/previous move through the photos and wrap around', () => {
    render(<PhotoCarousel photos={PHOTOS} label="Field photos" />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous photo' }));
    expect(visibleAlt()).toBe('Photo C');
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(visibleAlt()).toBe('Photo A');
  });

  it('a dot jumps to its photo and is marked current', () => {
    render(<PhotoCarousel photos={PHOTOS} label="Field photos" />);
    const dot = screen.getByRole('button', { name: 'Show photo 2 of 3' });
    fireEvent.click(dot);
    expect(visibleAlt()).toBe('Photo B');
    expect(dot).toHaveAttribute('aria-current', 'true');
  });

  it('renders no controls for a single photo', () => {
    render(<PhotoCarousel photos={PHOTOS.slice(0, 1)} label="Field photos" />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  describe('autoplay', () => {
    const original = window.matchMedia;
    beforeEach(() => {
      jest.useFakeTimers();
      // Simulate a visitor with no reduced-motion preference.
      window.matchMedia = ((query: string) =>
        ({ ...original(query), matches: true })) as typeof window.matchMedia;
    });
    afterEach(() => {
      jest.useRealTimers();
      window.matchMedia = original;
    });

    const tick = () => act(() => { jest.advanceTimersByTime(3000); });

    it('advances on its own every 6 seconds', () => {
      render(<PhotoCarousel photos={PHOTOS} label="Field photos" />);
      tick();
      expect(visibleAlt()).toBe('Photo B');
      tick();
      expect(visibleAlt()).toBe('Photo C');
    });

    it('the pause button stops it and play resumes it', () => {
      render(<PhotoCarousel photos={PHOTOS} label="Field photos" />);
      fireEvent.click(screen.getByRole('button', { name: 'Pause slideshow' }));
      tick();
      expect(visibleAlt()).toBe('Photo A');
      fireEvent.click(screen.getByRole('button', { name: 'Play slideshow' }));
      tick();
      expect(visibleAlt()).toBe('Photo B');
    });

    it('pauses while hovered', () => {
      render(<PhotoCarousel photos={PHOTOS} label="Field photos" />);
      const region = screen.getByRole('region', { name: 'Field photos' });
      fireEvent.mouseEnter(region);
      tick();
      expect(visibleAlt()).toBe('Photo A');
      fireEvent.mouseLeave(region);
      tick();
      expect(visibleAlt()).toBe('Photo B');
    });

    it('pauses while keyboard focus is inside, and Play resumes it', () => {
      render(<PhotoCarousel photos={PHOTOS} label="Field photos" />);
      const pause = screen.getByRole('button', { name: 'Pause slideshow' });
      act(() => { screen.getByRole('button', { name: 'Next photo' }).focus(); });
      tick();
      expect(visibleAlt()).toBe('Photo A');
      fireEvent.click(pause); // pause
      fireEvent.click(screen.getByRole('button', { name: 'Play slideshow' }));
      tick();
      expect(visibleAlt()).toBe('Photo B');
    });

    it('does not autoplay under reduced motion and shows no pause button', () => {
      window.matchMedia = original; // polyfill reports matches:false
      render(<PhotoCarousel photos={PHOTOS} label="Field photos" />);
      tick();
      expect(visibleAlt()).toBe('Photo A');
      expect(screen.queryByRole('button', { name: /slideshow/ })).not.toBeInTheDocument();
    });
  });
});
