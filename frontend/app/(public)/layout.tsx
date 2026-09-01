// @sdd-spec enhancement/usage-analytics (T-5, T-10)
import { ConsentProvider } from '@/lib/analytics/ConsentProvider';
import { ConsentBanner } from '@/components/analytics/ConsentBanner';
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics';
import { PublicShellFrame } from '@/components/shell/PublicShellFrame';

// PublicShell — wraps all public routes (FR-1).
// Route group `(public)` does not affect URL paths.
// max-w-7xl container is applied inside Header/Footer; <main> (inside
// PublicShellFrame) is the full-bleed content region — individual pages
// control their own containers (per System Design §6: "map and admin
// tables may go full-bleed within their region").

// FR-5 / DD-3: ConsentProvider (and, through it, the GA4 script and the
// consent banner) is mounted HERE — in the `(public)` route group's layout
// — and nowhere else. `app/layout.tsx` (the root layout, shared by every
// route group including `(admin)`) is deliberately left untouched, so an
// `(admin)` route cannot reach any of this by construction: there is no
// pathname check to fall through, because the component tree itself never
// contains the provider on that branch (design.md §5.1, DD-3).

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The flex column (sticky footer + FR-2 scenario 2 banner-clearance) now
  // lives in PublicShellFrame — it needs `showBanner` client state to
  // reserve space for ConsentBanner, which this layout (a server component)
  // cannot read directly. See PublicShellFrame.tsx for the mechanism.
  return (
    <ConsentProvider>
      <PublicShellFrame>{children}</PublicShellFrame>
      <ConsentBanner />
      <GoogleAnalytics />
    </ConsentProvider>
  );
}
