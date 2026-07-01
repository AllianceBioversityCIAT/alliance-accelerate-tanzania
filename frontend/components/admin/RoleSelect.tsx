// @sdd-spec admin/user-management (T-9)
'use client';

/**
 * RoleSelect — constrained role selector (admin / staff / none).
 *
 * Used by CreateUserDialog (initial role assignment) and inline "Change role"
 * action in UsersTable (via setUserRole). Token-only styling; fully labeled for
 * screen readers; keyboard-operable.
 *
 * WCAG 2.1 AA: associated <label>, visible focus ring, aria-describedby for
 * hint text.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RoleValue = 'admin' | 'staff' | 'none';

interface RoleSelectProps {
  /** Current value. */
  value: RoleValue;
  /** Called with the new value when the user changes the selection. */
  onChange: (value: RoleValue) => void;
  /** Unique id used to link the <label> and optional error/hint. */
  id?: string;
  /** Extra accessible label (overrides rendered label when supplied). */
  'aria-label'?: string;
  /** Disable the select while a request is in-flight. */
  disabled?: boolean;
  /** Error message to display and link via aria-describedby. */
  error?: string;
  /** Show the visible <label> element (default: true). */
  showLabel?: boolean;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const ROLE_OPTIONS: { value: RoleValue; label: string }[] = [
  { value: 'none',  label: 'No role (Public)' },
  { value: 'staff', label: 'Staff'             },
  { value: 'admin', label: 'Admin'             },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RoleSelect({
  value,
  onChange,
  id = 'role-select',
  'aria-label': ariaLabel,
  disabled = false,
  error,
  showLabel = true,
}: RoleSelectProps) {
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="flex flex-col gap-1">
      {showLabel && (
        <label
          htmlFor={id}
          className="text-sm font-medium text-fg"
        >
          Role
        </label>
      )}

      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as RoleValue)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={errorId}
        aria-invalid={!!error}
        className={[
          'block w-full rounded-md border bg-surface px-3 py-2 text-sm text-fg',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error ? 'border-danger' : 'border-border',
        ].join(' ')}
      >
        {ROLE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-xs text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}
