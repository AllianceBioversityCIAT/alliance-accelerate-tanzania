import Header from '@/components/shell/Header';
import Footer from '@/components/shell/Footer';

// PublicShell — wraps all public routes (FR-1).
// Route group `(public)` does not affect URL paths.
// max-w-7xl container is applied inside Header/Footer; <main> here is the
// full-bleed content region — individual pages control their own containers
// (per System Design §6: "map and admin tables may go full-bleed within their region").

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Sticky footer: the shell is a full-height column and <main> takes the
  // slack, so the footer sits at the bottom of the viewport on SHORT pages
  // instead of riding up under the content. Without this it only looked
  // right on pages tall enough to overflow — the registration flow's OTP and
  // receipt steps are deliberately short, which is where it showed.
  // `flex-1` on <main> (not a min-height on the footer) keeps <main> the
  // full-bleed region this shell already promises, so pages that manage
  // their own containers are unaffected.
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
