'use client';

import { Field } from '@/components/forms/Field';
import CountrySelect from './CountrySelect';
import RegionSelect from './RegionSelect';

type GeoField = 'country' | 'region';

export interface CountryRegionFieldsProps {
  /** The form's id for a field, so labels, hints and errors keep their ids. */
  idFor: (field: GeoField) => string;
  country: string;
  region: string;
  errors: Partial<Record<GeoField, string>>;
  disabled: boolean;
  onChange: (field: GeoField, value: string) => void;
}

/** The required Country and Region fields of an actor form; Region waits for a country. */
export default function CountryRegionFields({
  idFor,
  country,
  region,
  errors,
  disabled,
  onChange,
}: CountryRegionFieldsProps) {
  const countryId = idFor('country');
  const regionId = idFor('region');
  return (
    <>
      <Field id={countryId} label="Country" error={errors.country} required>
        <CountrySelect
          id={countryId}
          value={country}
          onChange={(next) => onChange('country', next)}
          disabled={disabled}
          invalid={!!errors.country}
          describedBy={errors.country ? `${countryId}-error` : undefined}
        />
      </Field>
      <Field
        id={regionId}
        label="Region"
        error={errors.region}
        required
        hint={country ? undefined : 'Choose a country first to see its regions.'}
      >
        <RegionSelect
          id={regionId}
          country={country}
          region={region}
          onChange={({ region: next }) => onChange('region', next)}
          requireCountry
          disabled={disabled}
          invalid={!!errors.region}
          describedBy={
            [country ? '' : `${regionId}-hint`, errors.region ? `${regionId}-error` : ''].filter(Boolean).join(' ') ||
            undefined
          }
        />
      </Field>
    </>
  );
}
