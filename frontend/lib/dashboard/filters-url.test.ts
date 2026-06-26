/**
 * Unit tests for encodeFilters / decodeFilters — T-2
 * Traces: FR-2, NFR-7, design.md §5.3
 *
 * Covers:
 *   (a) encode→decode identity for a full filter set (all handled fields)
 *   (b) empty / undefined fields are omitted from URLSearchParams
 *   (c) invalid numeric param (capacityMin=abc) decodes to undefined without throwing
 *   (d) capacityMin of 0 is preserved (0 is a valid finite number)
 */

import { encodeFilters, decodeFilters } from './filters-url';
import type { ActorsQuery } from '@/lib/api/actors';

// ---------------------------------------------------------------------------
// (a) Encode → decode identity for a full filter set
// ---------------------------------------------------------------------------

describe('encodeFilters / decodeFilters round-trip', () => {
  it('round-trips a full filter set back to the original object', () => {
    const q: ActorsQuery = {
      crop: 'sorghum',
      role: 'seed_company',
      region: 'Dodoma',
      district: 'Dodoma Urban',
      search: 'green',
      capacityMin: 10,
      capacityMax: 500,
    };

    const result = decodeFilters(encodeFilters(q));
    expect(result).toEqual(q);
  });

  it('round-trips a partial filter set (only some fields set)', () => {
    const q: ActorsQuery = {
      crop: 'common_bean',
      capacityMax: 200,
    };

    const result = decodeFilters(encodeFilters(q));
    expect(result).toEqual(q);
  });
});

// ---------------------------------------------------------------------------
// (b) Empty / undefined fields are omitted from URLSearchParams
// ---------------------------------------------------------------------------

describe('encodeFilters — omits empty / undefined fields', () => {
  it('produces empty URLSearchParams when the query is empty', () => {
    const params = encodeFilters({});
    expect(params.toString()).toBe('');
  });

  it('omits string fields that are empty strings', () => {
    const q: ActorsQuery = { crop: '', role: 'ngo', region: '' };
    const params = encodeFilters(q);

    expect(params.has('crop')).toBe(false);
    expect(params.has('region')).toBe(false);
    expect(params.get('role')).toBe('ngo');
  });

  it('omits string fields that are undefined', () => {
    const q: ActorsQuery = { search: undefined, district: 'Mwanza' };
    const params = encodeFilters(q);

    expect(params.has('search')).toBe(false);
    expect(params.get('district')).toBe('Mwanza');
  });

  it('omits number fields that are undefined', () => {
    const q: ActorsQuery = { capacityMin: undefined, capacityMax: 100 };
    const params = encodeFilters(q);

    expect(params.has('capacityMin')).toBe(false);
    expect(params.get('capacityMax')).toBe('100');
  });

  it('does NOT encode page or pageSize even when provided', () => {
    const q: ActorsQuery = { page: 2, pageSize: 20, crop: 'groundnut' };
    const params = encodeFilters(q);

    expect(params.has('page')).toBe(false);
    expect(params.has('pageSize')).toBe(false);
    expect(params.get('crop')).toBe('groundnut');
  });
});

// ---------------------------------------------------------------------------
// (c) Invalid numeric param decodes to undefined without throwing
// ---------------------------------------------------------------------------

describe('decodeFilters — resilience to garbage numeric input', () => {
  it('decodes capacityMin=abc to undefined without throwing', () => {
    const params = new URLSearchParams('capacityMin=abc');
    let result: ActorsQuery | undefined;

    expect(() => {
      result = decodeFilters(params);
    }).not.toThrow();

    expect(result!.capacityMin).toBeUndefined();
  });

  it('decodes capacityMax=NaN to undefined without throwing', () => {
    const params = new URLSearchParams('capacityMax=NaN');
    const result = decodeFilters(params);

    expect(result.capacityMax).toBeUndefined();
  });

  it('decodes capacityMin=Infinity to undefined (non-finite)', () => {
    const params = new URLSearchParams('capacityMin=Infinity');
    const result = decodeFilters(params);

    expect(result.capacityMin).toBeUndefined();
  });

  it('leaves other valid fields intact when one numeric field is garbage', () => {
    const params = new URLSearchParams('capacityMin=abc&crop=sorghum&capacityMax=50');
    const result = decodeFilters(params);

    expect(result.capacityMin).toBeUndefined();
    expect(result.crop).toBe('sorghum');
    expect(result.capacityMax).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// (d) capacityMin of 0 is preserved (0 is a valid finite number)
// ---------------------------------------------------------------------------

describe('decodeFilters — zero is a valid capacityMin / capacityMax', () => {
  it('preserves capacityMin=0 through encode → decode', () => {
    const q: ActorsQuery = { capacityMin: 0 };
    const result = decodeFilters(encodeFilters(q));

    expect(result.capacityMin).toBe(0);
  });

  it('encodes capacityMin=0 as a URL param (must not be omitted)', () => {
    const params = encodeFilters({ capacityMin: 0 });
    expect(params.has('capacityMin')).toBe(true);
    expect(params.get('capacityMin')).toBe('0');
  });

  it('decodes a raw URLSearchParams with capacityMin=0 to the number 0', () => {
    const params = new URLSearchParams('capacityMin=0');
    const result = decodeFilters(params);

    expect(result.capacityMin).toBe(0);
  });
});
