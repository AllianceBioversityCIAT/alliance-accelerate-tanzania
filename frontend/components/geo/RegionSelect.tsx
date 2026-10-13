'use client';

import { useMemo } from 'react';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import {
  ALL_REGION_OPTIONS,
  regionOptionsFor,
  regionOptionValue,
  withRegionOption,
  type GeoFilter,
} from '@/lib/content/countries';

export interface RegionSelectProps {
  id: string;
  country: string;
  region: string;
  /** Region picked; `country` is the region's country (already set, or inferred from the all-regions list). */
  onChange: (next: { country: string; region: string }) => void;
  /** Filter use: renders a clear entry with this label. Omit for required form fields. */
  clearLabel?: string;
  /** Form use: disable until a country is chosen. Filters leave this off and offer every region instead. */
  requireCountry?: boolean;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}

export default function RegionSelect({
  id,
  country,
  region,
  onChange,
  clearLabel,
  requireCountry = false,
  placeholder,
  disabled: externallyDisabled = false,
  invalid,
  describedBy,
}: Readonly<RegionSelectProps>) {
  const options = useMemo(
    () => (country ? regionOptionsFor(country) : ALL_REGION_OPTIONS),
    [country],
  );
  const geo: GeoFilter = { country: country || undefined, region: region || undefined };
  const value = country ? region : regionOptionValue(geo);

  function handleChange(next: string) {
    if (country) {
      onChange({ country, region: next });
      return;
    }
    const picked = withRegionOption<GeoFilter>({}, next);
    onChange({ country: picked.country ?? '', region: picked.region ?? '' });
  }

  const needsCountry = requireCountry && !country;
  const disabled = externallyDisabled || needsCountry;

  return (
    <SearchableSelect
      id={id}
      value={value}
      onChange={handleChange}
      options={options as { value: string; label: string }[]}
      clearOptionLabel={clearLabel}
      placeholder={needsCountry ? 'Select a country first' : (placeholder ?? clearLabel ?? 'Select a region')}
      disabled={disabled}
      invalid={invalid}
      describedBy={describedBy}
    />
  );
}
