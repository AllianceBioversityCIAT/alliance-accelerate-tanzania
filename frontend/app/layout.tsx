import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

// Configure Inter with a CSS variable so that --font-sans (globals.css) can
// reference it as `var(--font-inter)`. This keeps next/font's optimised
// loading (subset, display:swap, no flash) while making --font-sans the single
// authoritative token for font-family across all components (font-token fix).
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'ACCELERATE Tanzania Seed Registry',
  description: 'Public seed trader and processor registry for Tanzania — ACCELERATE programme.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Apply `inter.variable` (adds --font-inter CSS var) to <html>, NOT
  // `inter.className` on <body>. The body's font-family is controlled solely
  // by `body { font-family: var(--font-sans); }` in globals.css, where
  // --font-sans is defined as `var(--font-inter), "Inter", system-ui, sans-serif`.
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
