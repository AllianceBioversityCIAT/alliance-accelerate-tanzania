// Button — reusable token-driven CTA primitive (T-4).
// Renders as a Next.js <Link> when `href` is provided, otherwise as a <button>.
// No 'use client' needed: no state or browser-only APIs used here.
//
// Usage examples:
//   <Button variant="primary" href="/map">Explore the Map</Button>
//   <Button variant="secondary" href="/directory">Browse Directory</Button>
//   <Button variant="primary" onClick={handleSave}>Save</Button>

import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Variant = 'primary' | 'secondary';

interface SharedProps {
  variant?: Variant;
  className?: string;
  children: ReactNode;
}

type ButtonAsLink = SharedProps & { href: string } & Omit<
    ComponentPropsWithoutRef<typeof Link>,
    'href' | 'className' | 'children'
  >;

type ButtonAsButton = SharedProps & { href?: never } & Omit<
    ComponentPropsWithoutRef<'button'>,
    'className' | 'children'
  >;

type ButtonProps = ButtonAsLink | ButtonAsButton;

// ---------------------------------------------------------------------------
// Style maps — token-only, no raw hex (NFR-4)
// ---------------------------------------------------------------------------

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: [
    'bg-primary text-primary-fg',
    // Hover: use the primary-hover token (#680000) — maroon needs a darker hex, not an opacity wash.
    'hover:bg-primary-hover',
    'border border-transparent',
  ].join(' '),
  secondary: [
    'bg-surface text-fg',
    'border border-border',
    'hover:bg-restricted',
  ].join(' '),
};

const BASE_CLASSES = [
  // Layout & spacing
  'inline-flex items-center gap-2 px-5 py-2.5',
  // Typography
  'text-sm font-medium leading-none',
  // Geometry (tokens)
  'rounded-md',
  // Transitions — respect prefers-reduced-motion
  'transition-colors motion-reduce:transition-none',
  // Focus ring using the primary token
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
  // Prevent text wrapping in tight layouts
  'whitespace-nowrap',
].join(' ');

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Button(props: ButtonProps) {
  const { variant = 'primary', className = '', children } = props;
  const classes = [BASE_CLASSES, VARIANT_CLASSES[variant], className].filter(Boolean).join(' ');

  if ('href' in props && props.href !== undefined) {
    // Destructure only the link-specific spread rest
    const { href, variant: _v, className: _c, children: _ch, ...linkRest } = props as ButtonAsLink;
    return (
      <Link href={href} className={classes} {...linkRest}>
        {children}
      </Link>
    );
  }

  // Render as <button>
  const { variant: _v, className: _c, children: _ch, href: _h, ...buttonRest } = props as ButtonAsButton & { href?: never };
  return (
    <button type="button" className={classes} {...buttonRest}>
      {children}
    </button>
  );
}
