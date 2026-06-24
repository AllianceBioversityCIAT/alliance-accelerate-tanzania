// RestrictedContactPanel — always-locked Contact & Commercial Data panel (FR-6, NFR-1).
// Server-renderable: no hooks, no 'use client'.
//
// For the Public role, contact and commercial data is ALWAYS restricted (FR-6).
// This panel renders the locked state unconditionally — no PII fields, no
// contact inputs. The unlocked variant is Phase 2 (authenticated staff/admin).
//
// PII contract (NFR-1): this component MUST NOT reference or render phone,
// email, or any commercial/contact field. The type it receives is purposely void
// of those fields (PublicActor has no PII). The panel is a signpost only.
//
// Token-driven: no raw hex (NFR-4). Uses `bg-restricted` (--color-restricted-bg)
// and `text-muted` for the locked surface, `border-border` for the outline.

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Always-locked Contact & Commercial Data panel for the Public role (FR-6).
 *
 * Renders a clearly-styled restricted card with:
 *   • Lock icon (aria-hidden — decorative)
 *   • "Contact & Commercial Data" heading
 *   • Clear copy explaining the data requires consent / authorization
 *
 * Must contain NO actual contact fields. Tokens only.
 */
export default function RestrictedContactPanel() {
  return (
    <section aria-labelledby="restricted-contact-heading" className="mb-6">
      <h2
        id="restricted-contact-heading"
        className="mb-3 text-base font-semibold text-fg"
      >
        Contact &amp; Commercial Data
      </h2>

      {/* Restricted card — bg-restricted token from §7 (--color-restricted-bg) */}
      <div
        className="flex flex-col gap-3 rounded-md border border-border bg-restricted px-5 py-5"
        role="region"
        aria-label="Contact and commercial data — restricted"
      >
        {/* Lock affordance + heading row */}
        <div className="flex items-center gap-2">
          {/* Lock icon — SVG inline, aria-hidden (decorative; heading conveys meaning) */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5 flex-shrink-0 text-muted"
            aria-hidden="true"
            focusable="false"
          >
            <path
              fillRule="evenodd"
              d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Zm-5 4a1 1 0 1 1 2 0v1.5a1 1 0 1 1-2 0V13Z"
              clipRule="evenodd"
            />
          </svg>

          <p className="text-sm font-semibold text-fg">
            Restricted — Authorization Required
          </p>
        </div>

        {/* Explanatory copy — no PII fields */}
        <p className="text-sm text-muted leading-relaxed">
          Contact details and commercial information for this organization are
          consent-gated and available only to authorized users. Access to this
          data requires actor consent and staff or admin authorization (Phase 2).
        </p>

        <p className="text-xs text-muted">
          If you represent this organization and wish to update your consent
          status, please contact the ACCELERATE Tanzania programme team.
        </p>
      </div>
    </section>
  );
}
