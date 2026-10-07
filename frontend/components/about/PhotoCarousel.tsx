'use client';

// PhotoCarousel — photo carousel for the About page "The challenge" section.
//
// Auto-advances every AUTOPLAY_MS with a visible pause/play control (WCAG 2.2.2);
// hover or keyboard focus inside also pauses it. Autoplay starts only once
// matchMedia confirms no reduced-motion preference (same gate as AboutStrip), so
// SSR, tests and reduced-motion users get a manual carousel. All slides stay in
// the DOM and crossfade; inactive ones are aria-hidden. Tokens only (NFR-4).

import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { GalleryPhoto } from '@/lib/content/about-gallery';

interface PhotoCarouselProps {
  photos: readonly GalleryPhoto[];
  /** Accessible name for the carousel region. */
  label: string;
}

const AUTOPLAY_MS = 3000;

const NAV_BUTTON =
  'absolute top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-fg shadow-md opacity-90 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';

function isFocusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true; // selector unsupported — fall back to pausing on any focus
  }
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d={
          direction === 'left'
            ? 'M12.79 5.23a.75.75 0 0 1-.02 1.06L8.83 10l3.94 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z'
            : 'M7.21 14.77a.75.75 0 0 1 .02-1.06L11.17 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z'
        }
      />
    </svg>
  );
}

export default function PhotoCarousel({ photos, label }: PhotoCarouselProps) {
  const [index, setIndex] = useState(0);
  const [motionOk, setMotionOk] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const count = photos.length;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: no-preference)');
    setMotionOk(mq.matches);
    const handleChange = (e: MediaQueryListEvent) => setMotionOk(e.matches);
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const canAutoplay = motionOk && count > 1;
  const running = canAutoplay && playing && !hovered && !focused;

  // Keyed on `index` so a manual move restarts the full interval.
  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => window.clearTimeout(t);
  }, [running, index, count]);

  if (count === 0) return null;

  const go = (next: number) => setIndex((next + count) % count);

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // Keyboard focus only: a mouse click also focuses a button, which would
      // otherwise leave the carousel paused until the visitor clicks elsewhere.
      onFocus={(e) => {
        if (isFocusVisible(e.target)) setFocused(true);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div
        aria-live={running ? 'off' : 'polite'}
        className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-surface-alt shadow-md"
      >
        {photos.map((photo, i) => (
          <div
            key={photo.src}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
            aria-hidden={i !== index}
            className={[
              'absolute inset-0 motion-safe:transition-opacity motion-safe:duration-500',
              i === index ? 'opacity-100' : 'opacity-0',
            ].join(' ')}
          >
            <Image
              src={photo.src}
              alt={photo.alt}
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        ))}

        {count > 1 && (
          <>
            <button type="button" onClick={() => go(index - 1)} aria-label="Previous photo" className={`${NAV_BUTTON} left-3`}>
              <Chevron direction="left" />
            </button>
            <button type="button" onClick={() => go(index + 1)} aria-label="Next photo" className={`${NAV_BUTTON} right-3`}>
              <Chevron direction="right" />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="mt-4 flex items-center justify-center gap-1">
          {canAutoplay && (
            <button
              type="button"
              onClick={() => {
                // Play is an explicit request, so it overrides the focus pause.
                if (!playing) setFocused(false);
                setPlaying(!playing);
              }}
              aria-label={playing ? 'Pause slideshow' : 'Play slideshow'}
              className="mr-2 flex h-6 w-6 items-center justify-center rounded-full text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                {playing ? (
                  <path d="M5.75 3a.75.75 0 0 0-.75.75v12.5c0 .41.34.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75A.75.75 0 0 0 7.25 3h-1.5Zm7 0a.75.75 0 0 0-.75.75v12.5c0 .41.34.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75a.75.75 0 0 0-.75-.75h-1.5Z" />
                ) : (
                  <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.34-5.89a1.5 1.5 0 0 0 0-2.54L6.3 2.84Z" />
                )}
              </svg>
            </button>
          )}
          {photos.map((photo, i) => (
            <button
              key={photo.src}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show photo ${i + 1} of ${count}`}
              aria-current={i === index ? 'true' : undefined}
              className="flex h-6 w-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span
                className={[
                  'block h-2.5 rounded-full motion-safe:transition-all',
                  i === index ? 'w-6 bg-primary' : 'w-2.5 bg-border',
                ].join(' ')}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
