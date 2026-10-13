'use client';

import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { COUNTRY_OPTIONS } from '@/lib/content/countries';

export interface CountrySelectProps {
  id: string;
  /** ISO 3166-1 alpha-2 code, or '' when none is chosen. */
  value: string;
  onChange: (code: string) => void;
  /** Filter use: renders a clear entry with this label. Omit for required form fields. */
  clearLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}

export default function CountrySelect({
  id,
  value,
  onChange,
  clearLabel,
  placeholder,
  disabled,
  invalid,
  describedBy,
}: Readonly<CountrySelectProps>) {
  return (
    <SearchableSelect
      id={id}
      value={value}
      onChange={onChange}
      options={COUNTRY_OPTIONS}
      clearOptionLabel={clearLabel}
      placeholder={placeholder ?? clearLabel ?? 'Select a country'}
      disabled={disabled}
      invalid={invalid}
      describedBy={describedBy}
      noMatchLabel="No countries match"
      itemNoun="country"
      itemNounPlural="countries"
    />
  );
}
