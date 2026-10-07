'use client';

/**
 * ConsentTextScrollGate — the scroll-gated consent text + acceptance checkbox,
 * extracted from `ConsentPolicyDisclosure` (actors/consent-intake/
 * consent-request-email T-8, design.md §7.3, P-23). Behaviour-preserving: the
 * markup, ids, aria wiring and the one-way gate are the ones the registration
 * form shipped with; only the fetch stayed behind in `ConsentPolicyDisclosure`.
 *
 * It owns the scroll gate (`consent-scroll-gate.ts` `hasReachedScrollEnd`,
 * DD-8) and nothing else: `checked`/`onChange`/`error` are controlled props.
 * The checkbox is `disabled` until the region has been scrolled to its end —
 * or never needed scrolling. That is the UX affordance; the server enforces
 * acceptance independently.
 *
 * `sections === null` means "no text to show yet" (loading, or `loadFailed`):
 * the gate stays closed. `renderBody` lets a caller render a section body
 * richer than the default `whitespace-pre-line` paragraph (the admin-consent
 * edition's `- ` bullets and `**bold**`); omitted, the registration form's
 * rendering is unchanged.
 *
 * Human check (DC-17): jsdom has no layout, so the real scroll behaviour is a
 * browser check — see `ConsentPolicyDisclosure.tsx`'s header.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { hasReachedScrollEnd, type ScrollEndMetrics } from './consent-scroll-gate';

export interface ConsentTextContactEntry {
  label: string;
  value: string;
}

export interface ConsentTextSection {
  heading: string;
  body: string;
  contact?: ConsentTextContactEntry[];
  bodyAfter?: string;
}

export interface ConsentTextScrollGateProps {
  /** Heading above the region (an `<h2>`). */
  title: string;
  /** Edition/version shown beside the title as `v<version>`, when known. */
  version?: string;
  /** The text to read; `null` while loading or after a load failure. */
  sections: ConsentTextSection[] | null;
  loadFailed?: boolean;
  /** Shown while `sections` is null and nothing failed. */
  loadingText?: string;
  /** Shown (role=alert) when `loadFailed`. */
  failureText?: string;
  /** The checkbox label. */
  acceptanceStatement: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Inline validation message from the parent, if any. */
  error?: string;
  /** Disables the checkbox regardless of the gate (e.g. while submitting). */
  disabled?: boolean;
  /** Custom section-body renderer; default is the pre-line paragraph. */
  renderBody?: (body: string) => ReactNode;
}

export default function ConsentTextScrollGate({
  title,
  version,
  sections,
  loadFailed = false,
  loadingText = 'Loading policy…',
  failureText = "We couldn't load the consent policy. Please refresh the page and try again.",
  acceptanceStatement,
  checked,
  onChange,
  error,
  disabled = false,
  renderBody,
}: Readonly<ConsentTextScrollGateProps>) {
  const [reachedEnd, setReachedEnd] = useState(false);

  const scrollRef = useRef<HTMLElement | null>(null);

  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const checkboxId = `${baseId}-checkbox`;
  const progressId = `${baseId}-progress`;
  const errorId = `${baseId}-error`;

  // The gate is one-way: once the predicate reports the end has been
  // reached, it stays reached even if the reader scrolls back up.
  const evaluateScrollPosition = useCallback((metrics: ScrollEndMetrics) => {
    if (hasReachedScrollEnd(metrics)) setReachedEnd(true);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    evaluateScrollPosition({
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
    });
  }, [evaluateScrollPosition]);

  // A short text never fires a scroll event, so check geometry once the real
  // sections have rendered (DD-8's "content shorter than its container"
  // case). Gated on `sections` being present: checking before they exist
  // would measure an empty container and falsely report "fits".
  useEffect(() => {
    if (!sections) return;
    const el = scrollRef.current;
    if (!el) return;
    evaluateScrollPosition({
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
    });
  }, [sections, evaluateScrollPosition]);

  const totalSections = sections?.length ?? 0;
  const sectionsLabel = `${totalSections} section${totalSections === 1 ? '' : 's'}`;
  const progressText = reachedEnd
    ? `You have reached the end of the policy (${sectionsLabel}).`
    : `Keep scrolling — ${sectionsLabel} to review before you can accept.`;

  const describedBy = [progressId, error ? errorId : ''].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-3">
      {/* h2 under the page's h1 (T18-A7); section headings below are h3. */}
      <h2 id={headingId} className="text-sm font-semibold text-fg">
        {title}
        {version && <span className="ml-2 font-normal text-muted">v{version}</span>}
      </h2>

      {/* The focusable scroll region: keyboard users Tab to it and reach the
          end with Arrow/Page/End. */}
      <section
        ref={scrollRef}
        tabIndex={0}
        aria-labelledby={headingId}
        onScroll={handleScroll}
        className={[
          'max-h-64 overflow-y-auto rounded-md border border-border bg-surface p-4',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        ].join(' ')}
      >
        {loadFailed && (
          <p role="alert" className="text-sm text-danger">
            {failureText}
          </p>
        )}
        {!sections && !loadFailed && <p className="text-sm text-muted">{loadingText}</p>}
        {sections?.map((section) => (
          <section key={section.heading} className="mb-4 last:mb-0">
            <h3 className="text-sm font-semibold text-fg">{section.heading}</h3>
            {/* `whitespace-pre-line` is LOAD-BEARING, not styling: each
                `section.body` carries Legal's own line breaks and `- ` bullet
                markers inside one string; under `white-space: normal` they
                collapse into a run-on block (measured 280px/14 lines vs
                440px/22 correct at 375px). jsdom applies no CSS, so only a
                rendered check can prove it (KZ-002). */}
            {renderBody ? (
              renderBody(section.body)
            ) : (
              <p className="mt-1 whitespace-pre-line text-sm text-muted">{section.body}</p>
            )}
            {section.contact && section.contact.length > 0 && (
              <dl className="mt-2 text-sm text-muted">
                {section.contact.map((entry) => (
                  <div key={entry.label} className="flex flex-wrap gap-x-1">
                    <dt className="font-semibold text-fg">{entry.label}:</dt>
                    <dd>{entry.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {section.bodyAfter && (
              <p className="mt-2 whitespace-pre-line text-sm text-muted">{section.bodyAfter}</p>
            )}
          </section>
        ))}
      </section>

      <p id={progressId} aria-live="polite" className="text-xs text-muted">
        {progressText}
      </p>

      <div className="flex items-start gap-2">
        <input
          id={checkboxId}
          type="checkbox"
          checked={checked}
          disabled={!reachedEnd || disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={describedBy}
          className={[
            'mt-0.5 h-4 w-4 rounded border-border text-primary',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
          ].join(' ')}
        />
        <label htmlFor={checkboxId} className="text-sm font-semibold text-fg">
          {acceptanceStatement}
        </label>
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
