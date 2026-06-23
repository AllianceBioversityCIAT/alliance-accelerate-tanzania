// Footer is a server component — no 'use client' needed.
// Dark surface: bg-fg (near-black #1C1F1A) + text-bg (warm off-white #FAFAF7)
// — an intentional light-on-dark inversion using the two existing semantic tokens.
// No raw hex values are used; all colors reference token utilities (NFR-4).

export default function Footer() {
  return (
    <footer className="bg-fg text-bg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">

          {/* Brand mark + name */}
          <div className="flex items-center gap-2.5">
            {/* Circular brand mark — pure CSS, matches header */}
            <span
              aria-hidden="true"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg font-bold text-xs select-none"
            >
              A
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-sm font-bold tracking-widest uppercase text-primary">
                ACCELERATE
              </span>
              <span className="text-xs font-medium tracking-wider uppercase opacity-70">
                Tanzania
              </span>
            </span>
          </div>

          {/* Governance note */}
          <p className="text-xs opacity-60 max-w-md text-right sm:text-right">
            A seed-system registry for institutional partners and agribusinesses
            &middot; Data governed under participant consent.
          </p>

        </div>
      </div>
    </footer>
  );
}
