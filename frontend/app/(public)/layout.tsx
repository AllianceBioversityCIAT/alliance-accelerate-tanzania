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
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
