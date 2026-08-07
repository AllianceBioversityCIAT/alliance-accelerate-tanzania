// @sdd-spec enhancement/searchable-region-select (T-2)
'use client';

/**
 * SearchableSelect — a hand-built type-to-filter combobox primitive.
 *
 * FR-1 (filter), FR-2 (keyboard), FR-3 (canonical value fidelity), FR-6 (live
 * region) — design.md §5.1–§5.3, §5.7, DD-1..DD-4. No headless UI dependency
 * exists in this repo (DD-1), so this is built directly against the WAI-ARIA
 * 1.2 combobox-with-listbox-popup pattern.
 *
 * **This task renders the popup inline** (plainly `absolute`-positioned).
 * T-3 replaces it with a `createPortal` + fixed-position + reflow-on-scroll
 * mechanism (design.md §5.5, DD-5) — everything else here is final.
 *
 * The component is generic: it has no knowledge of "region" or any other
 * domain, with **three** region-word literals as the exceptions, not one.
 * The `noMatchLabel` default below is caller-overridable, specified verbatim
 * by design.md §5.1's prop table. The other two — the live region's
 * `1 region available` / `<n> regions available` strings (FR-6, below) —
 * are **not** overridable: design.md §5.3 mandates them verbatim, which is
 * why they are hardcoded rather than parameterised. A caller adopting this
 * primitive for a non-region domain (e.g. crop or trader-type) inherits
 * these two strings as-is; widening them into a prop is out of this task's
 * scope.
 *
 * ---------------------------------------------------------------------------
 * State model (design.md §5.2) — the entire FR-3 correctness argument:
 *   - `value` (prop, caller-owned) — the only thing ever passed to `onChange`.
 *   - `searchText` (this component) — what the user has typed. NEVER emitted.
 *     Reset to `''` on every open and every commit.
 *   - `isOpen` + `activeIndex` (this component) — popup visibility and the
 *     `aria-activedescendant` target.
 * The input's displayed text is DERIVED, never a third piece of state: open
 * → `searchText`; closed → the committed value's label, or the placeholder.
 * `onChange` is called from exactly two places in this file — a pointer
 * commit (`commitOption` from an option's `onClick`) and a keyboard commit
 * (the `Enter` case below) — both passing an option's `value`, never typed
 * text. That is what makes "the emitted value is always canonical" auditable
 * by reading two call sites rather than reasoning about every interaction
 * path (paste, autofill, blur, Tab, Escape — none of them call `onChange`).
 *
 * ---------------------------------------------------------------------------
 * Pointer commit vs. blur (JD-8, design.md §5.2) — the KZ-007 interaction:
 * FR-2 requires blur to close-and-revert. DD-4 keeps DOM focus on the input
 * permanently, which means a `mousedown` on an option would normally blur
 * the input BEFORE the `click` that commits it — destroying the popup (and
 * the option under the pointer) before the commit lands. The popup's own
 * `mousedown`/`pointerdown` handler below calls `preventDefault()`, which
 * stops the browser from shifting focus at all, so no blur fires for a
 * pointer commit and `onClick` runs normally. Reverting-on-blur therefore
 * only ever fires for genuine focus departures — Tab, Escape (which closes
 * via keydown, never via blur), and clicks outside the control — exactly
 * the set FR-2 intends. No document-level "click outside" listener is
 * needed: because focus never leaves the input except through one of those
 * three paths, the plain `onBlur` handler already covers "outside click".
 *
 * ---------------------------------------------------------------------------
 * ARIA contract (FR-2, FR-6, design.md §5.3):
 *   - `<input role="combobox">` — `aria-expanded`, `aria-controls` (only set
 *     while a listbox is actually rendered), `aria-autocomplete="list"`,
 *     `aria-activedescendant` (the active `<li role="option">`'s id).
 *   - `<ul role="listbox"><li role="option" aria-selected>` — rendered
 *     whenever open. In the "no match" state its one child is a static,
 *     `aria-disabled` `role="option"` row instead of the selectable list —
 *     never a commit target, never the active descendant — because an
 *     empty listbox would itself be an ARIA violation (a listbox must own
 *     at least one option child).
 *   - A separate, visually-hidden `aria-live="polite"` region (never
 *     `assertive` — FR-6 is a status message) emits exactly `No regions
 *     match` / `1 region available` / `<n> regions available`, and is
 *     distinct from the visible no-match paragraph (design.md §5.3). It is
 *     re-rendered on every filter change but, because identical strings
 *     produce no DOM mutation, only an actual count change ever produces a
 *     new announcement in a real browser — no debounce or effect required.
 *
 * **Documented deviation from the APG pattern (JD-11):** the WAI-ARIA APG's
 * *editable* combobox reserves `Home`/`End` for caret movement inside the
 * text input. FR-2 assigns them to first/last option instead, so a user
 * cannot use `Home`/`End` to move the cursor while the popup is open. This
 * stands: FR-2 is approved, typed queries here are short, and jumping to
 * the ends of a 31-item list is the more valuable binding. An undocumented
 * divergence from a named pattern would be the KZ-008 shape, so it is
 * recorded here.
 *
 * **What the `jest-axe` runs in this file's test suite can and cannot
 * prove:** they check structural ARIA rules only. `color-contrast` returns
 * `incomplete` under jsdom (no layout engine) and `toHaveNoViolations` does
 * not fail on `incomplete` — so a green axe run here says nothing about
 * whether `bg-primary-soft`/`text-fg` is actually legible (D5, requirements
 * §4.1). That is T-6's manual browser pass, not this component's tests.
 */

import { useCallback, useMemo, useState } from 'react';

import { matchesQuery } from '@/lib/text/fold-search';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchableSelectOption {
  value: string;
  label: string;
}

export interface SearchableSelectProps {
  /** DOM id for the input — the caller's `<label htmlFor>` / error-summary anchor target. */
  id: string;
  /** The committed canonical value, or `''`. Controlled — never held internally. */
  value: string;
  /** Fired only on a commit (pointer or `Enter`), never while typing. */
  onChange: (value: string) => void;
  /** `{ value, label }` pairs — the caller passes `REGIONS` or a dynamic subset. */
  options: SearchableSelectOption[];
  /** When set, renders a first option that commits `''` (e.g. "All regions"). Omitted = no clear affordance. */
  clearOptionLabel?: string;
  /** Closed-state text shown when `value` is `''` (native `placeholder`). */
  placeholder?: string;
  disabled?: boolean;
  /** Sets `aria-invalid="true"` + `border-danger`. Renders no message — the caller owns that (DD-3). */
  invalid?: boolean;
  describedBy?: string;
  labelledBy?: string;
  /** Copy for the empty-filter state; also the live region's zero-count text (design.md §5.3). */
  noMatchLabel?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DEFAULT_NO_MATCH_LABEL = 'No regions match';

export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  clearOptionLabel,
  placeholder,
  disabled = false,
  invalid = false,
  describedBy,
  labelledBy,
  noMatchLabel = DEFAULT_NO_MATCH_LABEL,
}: SearchableSelectProps) {
  const [searchText, setSearchText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const listboxId = `${id}-listbox`;

  // Memoized so `handleKeyDown` below (which depends on `renderedOptions`)
  // doesn't get a new identity every render — NFR-4 still holds: this is a
  // single O(n) scan at n≤31, just not re-run when unrelated state changes.
  const matchedOptions = useMemo(
    () => options.filter((opt) => matchesQuery(opt.label, searchText)),
    [options, searchText],
  );
  const isNoMatch = matchedOptions.length === 0;
  // The clear entry rides the same commit path as any other option (see the
  // doc header's "exactly two call sites" note) — it is simply prepended.
  // Hidden entirely in the no-match state: FR-1 says the message "replaces
  // the option list", which this reads as the whole list, clear entry
  // included, rather than leaving a lone clear row behind it.
  const renderedOptions: SearchableSelectOption[] = useMemo(
    () =>
      isNoMatch
        ? []
        : clearOptionLabel !== undefined
          ? [{ value: '', label: clearOptionLabel }, ...matchedOptions]
          : matchedOptions,
    [isNoMatch, clearOptionLabel, matchedOptions],
  );

  const committedLabel = options.find((opt) => opt.value === value)?.label ?? '';
  const displayValue = isOpen ? searchText : committedLabel;

  // FR-6 — written fresh on every render, but an unchanged region count
  // produces byte-identical text, which is why no extra "only on change"
  // bookkeeping is needed: a real AT does not re-announce a live region
  // whose text content did not actually change. This test suite can only
  // prove the text is idempotent across same-count states, not that any AT
  // stays silent (KZ-002, D8).
  const liveMessage = !isOpen
    ? ''
    : isNoMatch
      ? noMatchLabel
      : matchedOptions.length === 1
        ? '1 region available'
        : `${matchedOptions.length} regions available`;

  const closeAndReset = useCallback(() => {
    setIsOpen(false);
    setSearchText('');
    setActiveIndex(-1);
  }, []);

  const commitOption = useCallback(
    (option: SearchableSelectOption) => {
      onChange(option.value);
      closeAndReset();
    },
    [onChange, closeAndReset],
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      // Covers typing, paste, and autofill alike — all three fire the same
      // native `input` event, and none of them ever reach `onChange` (FR-3).
      //
      // While closed, the DOM input still displays the *committed* label
      // (DD-4/JD-8 deliberately keep focus there after a commit — see the
      // header doc's pointer-commit note), so `event.target.value` at the
      // moment this first fires is "<label><whatever was just typed>", not
      // the search text alone. Reading it wholesale would filter against
      // that concatenation and could wrongly show "no match" against a
      // fully valid list. Read the *inserted* text instead, via the native
      // `InputEvent.data` — the standard way to distinguish "what changed"
      // from "the field's full contents" — and fall back to the full value
      // only when `data` is unavailable. That fallback is exactly what
      // already made the paste and autofill paths correct (paste reports
      // the pasted string as `data`; simulated autofill's plain `change`
      // event has no `data` at all), so neither regresses. Once `isOpen` is
      // already true the field's displayed text *is* `searchText`, so the
      // two are equivalent and the full-value path is used directly.
      const nextSearchText = isOpen
        ? event.target.value
        : ((event.nativeEvent as InputEvent).data ?? event.target.value);
      setSearchText(nextSearchText);
      setActiveIndex(0);
      setIsOpen(true);
    },
    [disabled, isOpen],
  );

  const handleClick = useCallback(() => {
    if (disabled || isOpen) return;
    setIsOpen(true);
    setSearchText('');
    setActiveIndex(0);
  }, [disabled, isOpen]);

  const handleBlur = useCallback(() => {
    // JD-8: this never fires for a pointer commit — the popup's own
    // mousedown/pointerdown handler prevents the blur that would otherwise
    // precede the click. Genuine departures (Tab, click outside) land here.
    closeAndReset();
  }, [closeAndReset]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (disabled) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
            setSearchText('');
            setActiveIndex(0);
          } else {
            setActiveIndex((idx) => Math.min(idx + 1, renderedOptions.length - 1));
          }
          break;

        case 'ArrowUp':
          if (isOpen) {
            event.preventDefault();
            setActiveIndex((idx) => Math.max(idx - 1, 0));
          }
          break;

        case 'Home':
          if (isOpen) {
            event.preventDefault();
            setActiveIndex(0);
          }
          break;

        case 'End':
          if (isOpen) {
            event.preventDefault();
            setActiveIndex(renderedOptions.length - 1);
          }
          break;

        case 'Enter': {
          // Never let this control submit the surrounding form, open or not.
          event.preventDefault();
          if (!isOpen) break;
          const option = renderedOptions[activeIndex];
          if (option) {
            onChange(option.value);
            closeAndReset();
          }
          break;
        }

        case 'Escape':
          // A second Escape (already closed) is deliberately not intercepted.
          if (isOpen) {
            event.preventDefault();
            closeAndReset();
          }
          break;

        case 'Tab':
          // Deliberately not intercepted (FR-2's explicit BUT) — the popup
          // closes via the blur this same keypress triggers, and focus
          // proceeds to the next control in document order untouched.
          break;

        default:
          break;
      }
    },
    [disabled, isOpen, activeIndex, renderedOptions, onChange, closeAndReset],
  );

  const preventPointerBlur = useCallback((event: React.SyntheticEvent) => {
    event.preventDefault();
  }, []);

  const inputClasses = [
    'block w-full rounded-md border bg-surface px-3 py-2 text-sm text-fg',
    'placeholder:text-muted',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-50',
    invalid ? 'border-danger' : 'border-border',
  ].join(' ');

  // NFR-5 — the transition + motion-reduce tokens are present on every
  // mount (design.md §5.7). Proving the interpolation is actually
  // suppressed for reduced-motion users needs a real layout engine and is
  // out of jsdom's reach; this class is the gated hook T-3's portal (which
  // owns the popup's actual mount/unmount lifecycle) transitions against.
  const popupClasses = [
    'absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-md',
    'transition-opacity duration-fast ease-out motion-reduce:transition-none',
  ].join(' ');

  const activeOption = isOpen ? renderedOptions[activeIndex] : undefined;

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        value={displayValue}
        placeholder={placeholder}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={
          activeOption ? `${id}-option-${activeIndex}` : undefined
        }
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={describedBy}
        aria-labelledby={labelledBy}
        onChange={handleChange}
        onClick={handleClick}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={inputClasses}
      />

      {isOpen && (
        <div
          onMouseDown={preventPointerBlur}
          onPointerDown={preventPointerBlur}
          className={popupClasses}
        >
          <ul id={listboxId} role="listbox" className="py-1">
            {isNoMatch ? (
              // A listbox must own at least one option child (axe
              // aria-required-children) — an empty listbox here would be
              // its own ARIA violation, not merely an empty state. This row
              // is non-interactive (aria-disabled, no onClick) and excluded
              // from `renderedOptions`, so it can never become the active
              // descendant or a commit target; it exists purely so the
              // "no match" state stays structurally valid while replacing
              // every real option (FR-1's "message replaces the option list").
              <li
                role="option"
                aria-disabled="true"
                aria-selected="false"
                className="px-3 py-2 text-sm text-muted"
              >
                {noMatchLabel}
              </li>
            ) : (
              renderedOptions.map((option, idx) => (
                <li
                  key={option.value}
                  id={`${id}-option-${idx}`}
                  role="option"
                  aria-selected={option.value === value}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => commitOption(option)}
                  className={[
                    'flex min-h-11 cursor-pointer items-center px-3 text-sm', // min-h-11 = 44px touch target (WCAG 2.5.8, design.md §9)
                    idx === activeIndex ? 'bg-primary-soft text-fg' : 'text-fg',
                  ].join(' ')}
                >
                  {option.value === value && (
                    <span aria-hidden="true" className="mr-2 text-primary">
                      ✓
                    </span>
                  )}
                  {option.label}
                </li>
              ))
            )}
          </ul>

        </div>
      )}

      {/* FR-6 — separate from the visible no-match paragraph above (design.md §5.3). */}
      <span aria-live="polite" className="sr-only">
        {liveMessage}
      </span>
    </div>
  );
}
