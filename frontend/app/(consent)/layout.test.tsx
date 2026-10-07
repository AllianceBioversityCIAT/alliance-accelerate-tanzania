/**
 * (consent) layout test — actors/consent-intake/consent-request-email T-8,
 * NFR-11, DD-5.
 *
 * Asserts on the layout that ACTUALLY GOVERNS the consent page, not on a
 * hard-coded import: it finds `consent/page.tsx` under `app/`, walks up to
 * the nearest `layout.tsx` below the root, renders that, and checks the tree
 * holds no `ConsentProvider`, `ConsentBanner` or `GoogleAnalytics`. Moving
 * the page into `(public)/` therefore makes it resolve `(public)/layout.tsx`
 * — which mounts all three — and this test goes red (the mutation NFR-11
 * names). The analytics components are replaced by marker stubs so presence
 * is observable without loading GA.
 */

import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('@/components/shell/Header', () => ({
  __esModule: true,
  default: () => <header data-testid="header" />,
}));
jest.mock('@/components/shell/Footer', () => ({
  __esModule: true,
  default: () => <footer data-testid="footer" />,
}));
jest.mock('@/lib/analytics/ConsentProvider', () => ({
  ConsentProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="consent-provider">{children}</div>
  ),
  useConsentContext: () => ({ showBanner: false }),
}));
jest.mock('@/components/analytics/ConsentBanner', () => ({
  ConsentBanner: () => <div data-testid="consent-banner" />,
}));
jest.mock('@/components/analytics/GoogleAnalytics', () => ({
  GoogleAnalytics: () => <div data-testid="google-analytics" />,
}));

const APP_DIR = path.resolve(__dirname, '..');

/** Finds `<app>/**\/consent/page.tsx` (the route this layout must govern). */
function findConsentPage(dir: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'consent' && fs.existsSync(path.join(full, 'page.tsx'))) {
        return path.join(full, 'page.tsx');
      }
      const nested = findConsentPage(full);
      if (nested) return nested;
    }
  }
  return null;
}

/** Nearest ancestor `layout.tsx` strictly below the root layout. */
function governingLayout(pagePath: string): string {
  let dir = path.dirname(pagePath);
  while (dir !== APP_DIR) {
    const candidate = path.join(dir, 'layout.tsx');
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error('consent page has no route-group layout below the root');
}

const pagePath = findConsentPage(APP_DIR) as string;
const layoutPath = governingLayout(pagePath);

describe('the layout governing /consent/ (NFR-11, DD-5)', () => {
  it('lives in the (consent) route group', () => {
    expect(pagePath).toContain(`${path.sep}(consent)${path.sep}`);
  });

  it('renders Header, main and Footer and NO ConsentProvider, ConsentBanner or GoogleAnalytics', () => {
    const Layout = require(layoutPath).default as React.ComponentType<{ children: React.ReactNode }>;
    render(
      <Layout>
        <p>page body</p>
      </Layout>,
    );

    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('page body');

    expect(screen.queryByTestId('consent-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('consent-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('google-analytics')).not.toBeInTheDocument();
  });

  it('keeps the token page out of search indexes', () => {
    const { metadata } = require(layoutPath) as { metadata?: { robots?: unknown } };
    expect(metadata?.robots).toEqual({ index: false, follow: false });
  });
});
