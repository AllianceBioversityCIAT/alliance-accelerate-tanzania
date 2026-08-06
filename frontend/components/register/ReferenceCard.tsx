'use client';

/**
 * ReferenceCard — the applicant's reference code, presented as selectable
 * text with a copy action, a save-this instruction, and a route to the
 * status lookup (T-20, FR-5 scenario 2, design.md §5.4).
 *
 * "Selectable text, never an image or a canvas" (FR-5 s2) is satisfied
 * structurally, not by a test-only trick: `reference` is rendered as the
 * text content of a `<p>`/`<span>` node below. There is no `<img>` or
 * `<canvas>` anywhere in this file, so the property holds by construction —
 * `ReferenceCard.test.tsx` asserts the text renders via `getByText` (which
 * only matches real DOM text nodes) and separately asserts zero `<img>`/
 * `<canvas>` elements exist, so a future edit that swaps the text node for a
 * rendered/rasterised reference (an `<img>`, a `<canvas>`, a background-image
 * span) turns that assertion red.
 *
 * The copy action mirrors `components/admin/CredentialHandoff.tsx`'s
 * clipboard pattern exactly (guarded `navigator.clipboard?.writeText`,
 * `aria-live` feedback, no persistence/logging of the copied value).
 *
 * ── The jsdom clipboard boundary (KZ-002) ──────────────────────────────────
 * jsdom does not implement the Clipboard API — `navigator.clipboard` is
 * `undefined` there. `ReferenceCard.test.tsx` stubs it to prove the CALLING
 * CONTRACT: on a resolved `writeText`, this component flips to "Copied" and
 * announces it via the live region, and resets afterward. That is a real
 * behavioural proof of THIS component's logic. What it does NOT and CANNOT
 * prove — because the stub is asserted to have been called, not that text
 * actually reached a real system clipboard — is that `navigator.clipboard`
 * exists in every deployed browser or that the OS clipboard is actually
 * written. The `typeof navigator === 'undefined' || !navigator.clipboard?.writeText`
 * guard exists for exactly that gap: on an unsupported/insecure-context
 * browser, `handleCopy` is a silent no-op and the reference code remains
 * selectable text in the DOM as the fallback copy path — never a hard
 * failure. See `ReferenceCard.test.tsx`'s header for the same note recorded
 * against the test.
 *
 * Tokens only (NFR-6) — zero hex literals.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import Button from '@/components/ui/Button';

export interface ReferenceCardProps {
  /** The applicant-facing reference code, e.g. `REG-2026-0184`. */
  reference: string;
}

export default function ReferenceCard({ reference }: ReferenceCardProps) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reviewer follow-up: the 2s reset timer must not fire after this
  // component has unmounted (e.g. a fast navigation to /register/status).
  // Harmless under React 18's setState-on-unmounted-component behaviour, but
  // clearing it is one line and avoids a dangling timer outliving its owner.
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    // Guard for environments without the clipboard API (older browsers,
    // non-secure contexts, and jsdom) — see file header. The reference code
    // stays selectable in the DOM regardless, so nothing is lost by a no-op
    // here; there is no error state to render.
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write denied — leave the value visible for manual
      // selection; no logging (the reference is not PII, but there is
      // nothing useful to log about a permission denial either).
      setCopied(false);
    }
  }, [reference]);

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border bg-surface p-6">
      <div>
        <p className="text-sm font-medium text-muted">Your reference code</p>
        {/*
          Plain text node — selectable by default, reachable by assistive
          technology, and copyable even if the button above fails (FR-5 s2
          "must NOT ... be an image or a canvas"). `select-all` is a
          user-select behaviour utility, not a colour/geometry/duration
          token, so it is exempt from the NFR-6 token grep the same way
          `whitespace-nowrap` and `break-all` are elsewhere in this codebase.
        */}
        <p className="mt-1 select-all break-all font-mono text-2xl font-bold tracking-wide text-fg">
          {reference}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleCopy}
          className={[
            'rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg',
            'transition-colors motion-reduce:transition-none hover:bg-surface-alt',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          ].join(' ')}
        >
          {copied ? 'Copied' : 'Copy reference code'}
        </button>
        {/* Feedback for assistive tech — the button label already conveys it visually. */}
        <span aria-live="polite" className="sr-only">
          {copied ? 'Reference code copied to clipboard' : ''}
        </span>
      </div>

      <p className="text-sm text-fg">
        <span className="font-semibold">Save this reference code.</span> Write it down, take a
        screenshot, or copy it somewhere safe. You will need it, together with the email address
        you verified, to check your submission&apos;s status.
      </p>

      {/*
        Reviewer follow-up (T-21): `/register/status` (T-21) does NOT accept
        a `?ref=` prefill — its own doc comment records that as a deliberate
        choice, since the email must be typed regardless and a partially
        prefilled form is not simpler than an empty one. This label was
        originally "Check status with this reference", which promised a
        destination that would carry the reference forward; it does not, so
        the label was reworded to stop implying that. If `/register/status`
        ever gains a `?ref=` prefill, this label can revert to naming "this
        reference" specifically — that would be the deliberate signal to do
        so, not an oversight to fix independently.
      */}
      <Button href="/register/status" variant="secondary" className="self-start">
        Check the status of your submission
      </Button>
    </div>
  );
}
