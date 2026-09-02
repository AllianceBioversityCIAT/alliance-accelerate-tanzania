/**
 * Labeled `<select>` filter primitive shared by the admin list pages
 * (`app/(admin)/admin/actors/page.tsx`, `app/(admin)/admin/registrations/page.tsx`).
 * Extracted from two byte-identical copies (jscpd-flagged duplication) — no
 * behavioral change from either original.
 */

export interface FilterSelectProps {
  id: string;
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = 'All',
}: Readonly<FilterSelectProps>) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        disabled={disabled}
        aria-label={label}
        className={[
          'block w-full rounded-md border bg-surface px-3 py-2 text-sm text-fg',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'border-border',
        ].join(' ')}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
