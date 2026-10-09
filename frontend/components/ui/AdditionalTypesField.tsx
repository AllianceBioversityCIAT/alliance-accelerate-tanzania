'use client';

// "Other actor types" checkbox group, shared by the public registration form
// and the admin actor form. The main type is never offered (it is hidden, not
// merely disabled, so the set can never contain it).

import { ROLES } from '@/lib/content/roles';

export interface AdditionalTypesFieldProps {
  /** Unique prefix for ids (the host form's `useId()`). */
  baseId: string;
  /** The currently selected main type; excluded from the choices. */
  mainType: string;
  selected: string[];
  onToggle: (type: string) => void;
  disabled?: boolean;
  error?: string;
  /** id of the group element — lets an error-summary anchor resolve. */
  groupId?: string;
}

export default function AdditionalTypesField({
  baseId,
  mainType,
  selected,
  onToggle,
  disabled,
  error,
  groupId,
}: Readonly<AdditionalTypesFieldProps>) {
  const labelId = `${baseId}-additional-types-label`;
  const hintId = `${baseId}-additional-types-hint`;
  const errorId = `${baseId}-additional-types-error`;
  const describedBy = [hintId, error ? errorId : ''].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-sm font-medium text-fg">
        Other actor types
      </span>
      <p id={hintId} className="text-xs text-muted">
        Optional. Select any other roles this organisation plays besides its main type.
      </p>
      {/* Semantic-only fieldset (no border/legend box): its implicit role is "group". */}
      <fieldset
        id={groupId}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        tabIndex={-1}
        className="m-0 flex min-w-0 flex-wrap gap-x-4 gap-y-2 border-0 p-0"
      >
        {Object.entries(ROLES)
          .filter(([value]) => value !== mainType)
          .map(([value, meta]) => {
            const id = `${baseId}-additional-type-${value}`;
            return (
              <div key={value} className="flex items-center gap-2">
                <input
                  id={id}
                  type="checkbox"
                  value={value}
                  checked={selected.includes(value)}
                  onChange={() => onToggle(value)}
                  disabled={disabled}
                  aria-invalid={error ? 'true' : undefined}
                  className="h-4 w-4 rounded border-border text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                />
                <label htmlFor={id} className="text-sm text-fg">
                  {meta.label}
                </label>
              </div>
            );
          })}
      </fieldset>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
