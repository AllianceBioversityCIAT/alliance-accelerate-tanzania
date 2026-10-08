'use client';

import CountrySelect from '@/components/geo/CountrySelect';
import RegionSelect from '@/components/geo/RegionSelect';
import { withCountry } from '@/lib/content/countries';

export interface CountryRegionFiltersProps {
  country: string | undefined;
  region: string | undefined;
  /** Both fields, so a country change can clear a region that no longer fits. */
  onChange: (next: { country: string | undefined; region: string | undefined }) => void;
  disabled?: boolean;
}

const LABEL_CLASS = 'text-sm font-medium text-fg';

/** Country + Region filter cells for the admin list pages; render inside their filter grid. */
export function CountryRegionFilters({
  country,
  region,
  onChange,
  disabled = false,
}: Readonly<CountryRegionFiltersProps>) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-country" className={LABEL_CLASS}>
          Country
        </label>
        <CountrySelect
          id="filter-country"
          value={country ?? ''}
          disabled={disabled}
          clearLabel="All countries"
          onChange={(value) => {
            const next = withCountry({ country, region }, value || undefined);
            onChange({ country: next.country, region: next.region });
          }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-region" className={LABEL_CLASS}>
          Region
        </label>
        <RegionSelect
          id="filter-region"
          country={country ?? ''}
          region={region ?? ''}
          disabled={disabled}
          clearLabel="All regions"
          onChange={(next) =>
            onChange({ country: next.country || undefined, region: next.region || undefined })
          }
        />
      </div>
    </>
  );
}
