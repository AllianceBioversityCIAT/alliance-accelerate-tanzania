'use client';

// DirectorySearch — debounced free-text search input for the Actor Directory.
//
// FR-3: input is debounced ≤400ms before calling onSearch; does not fire
// on every keystroke. Combines with active filters; caller resets page to 1.
//
// NFR-3: labeled control with aria-label; keyboard-operable.
// NFR-4: token-driven classes only — no raw hex.

import { useEffect, useRef, useState } from 'react';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DirectorySearchProps {
  /** Current active search term (controlled — mirrors URL param). */
  value: string;
  /**
   * Called (debounced ≤400ms) when the user finishes typing a new term.
   * An empty string signals "clear search".
   */
  onSearch: (term: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Debounced text input that drives the directory `search` query param.
 * Maintains internal draft state so the input stays responsive while the
 * debounce timer is pending; the parent is only notified after the delay.
 */
export default function DirectorySearch({ value, onSearch }: DirectorySearchProps) {
  // Internal draft: tracks what the user has typed; syncs from prop on external
  // resets (e.g. "clear filters" clears the URL → value prop → draft).
  const [draft, setDraft] = useState(value);

  // Sync draft when the controlled value changes externally (e.g. clear-all).
  // Avoid re-sync on every render by checking equality first.
  const prevValueRef = useRef(value);
  useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      setDraft(value);
    }
  }, [value]);

  // Debounce: fire onSearch 400ms after the user stops typing (FR-3).
  useEffect(() => {
    const id = setTimeout(() => {
      onSearch(draft);
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor="directory-search"
        className="block text-xs font-medium uppercase tracking-wide text-muted"
      >
        Search
      </label>
      <input
        id="directory-search"
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Search by name, region, or district…"
        className={[
          'w-full rounded-md border border-border bg-surface px-3 py-2',
          'text-sm text-fg placeholder:text-muted shadow-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        ].join(' ')}
        aria-label="Search organizations by name, region, or district"
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}
