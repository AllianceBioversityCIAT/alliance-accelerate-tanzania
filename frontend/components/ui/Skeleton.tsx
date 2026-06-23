// Skeleton — reusable loading placeholder primitive (T-6).
// Server component: no 'use client' needed — purely presentational, no hooks.
//
// Token-driven: bg-border provides a neutral mid-tone placeholder surface
// that reads clearly on both bg-bg (light pages) and bg-fg (dark MetricsBand).
// Pulse animation is suppressed via motion-reduce:animate-none for users who
// prefer reduced motion (a11y / WCAG 2.3 §2.3.3 criterion).
//
// aria-hidden="true": skeletons are decorative loading indicators — screen
// readers should announce the real content when it arrives, not the placeholder.
//
// Usage:
//   <Skeleton className="h-8 w-24 rounded-md" />
//   <Skeleton className="h-4 w-full rounded-sm" />

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkeletonProps {
  /** Tailwind utility classes to control size, shape, and any overrides. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      // bg-border: token-driven neutral placeholder — no raw hex (NFR-4).
      // animate-pulse: subtle breathe effect; motion-reduce:animate-none
      // respects the OS preference for reduced motion (a11y).
      className={[
        'bg-border animate-pulse motion-reduce:animate-none rounded-sm',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      // Decorative: do not announce to assistive technology.
      aria-hidden="true"
      role="presentation"
    />
  );
}
