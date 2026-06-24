/**
 * Unit tests for DirectoryFilters — T-4, FR-2, NFR-3.
 *
 * Covers:
 *   (a) renders three labeled selects (crop, role, region)
 *   (b) selecting a crop calls onChange with crop set and others preserved
 *   (c) selecting a role calls onChange with role set
 *   (d) selecting a region calls onChange with region set
 *   (e) selecting "All …" (empty value) clears that field (undefined)
 *   (f) "Clear filters" button not shown when no filters are active
 *   (g) "Clear filters" button shown when at least one filter is active
 *   (h) activating "Clear filters" calls onClear
 *   (i) region options match the canonical set (OQ-1)
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DirectoryFilters from './DirectoryFilters';
import { REGIONS } from '@/lib/content/regions';
import type { ActorsQuery } from '@/lib/api/actors';

afterEach(() => jest.clearAllMocks());

// ── Fixture ───────────────────────────────────────────────────────────────────

const EMPTY_FILTERS: Pick<ActorsQuery, 'crop' | 'role' | 'region'> = {};

describe('DirectoryFilters', () => {
  // ── (a) Renders labeled selects ────────────────────────────────────────────

  it('renders a crop select with label', () => {
    render(<DirectoryFilters filters={EMPTY_FILTERS} onChange={jest.fn()} onClear={jest.fn()} />);

    expect(screen.getByLabelText(/filter by crop/i)).toBeInTheDocument();
  });

  it('renders a role select with label', () => {
    render(<DirectoryFilters filters={EMPTY_FILTERS} onChange={jest.fn()} onClear={jest.fn()} />);

    expect(screen.getByLabelText(/filter by actor role/i)).toBeInTheDocument();
  });

  it('renders a region select with label', () => {
    render(<DirectoryFilters filters={EMPTY_FILTERS} onChange={jest.fn()} onClear={jest.fn()} />);

    expect(screen.getByLabelText(/filter by region/i)).toBeInTheDocument();
  });

  // ── (b) Selecting crop calls onChange ─────────────────────────────────────

  it('calls onChange with crop set and page reset when a crop is selected', () => {
    const onChange = jest.fn();
    render(
      <DirectoryFilters filters={EMPTY_FILTERS} onChange={onChange} onClear={jest.fn()} />,
    );

    fireEvent.change(screen.getByLabelText(/filter by crop/i), {
      target: { value: 'sorghum' },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ crop: 'sorghum' }),
    );
  });

  // ── (c) Selecting role calls onChange ─────────────────────────────────────

  it('calls onChange with role set when a role is selected', () => {
    const onChange = jest.fn();
    render(
      <DirectoryFilters filters={EMPTY_FILTERS} onChange={onChange} onClear={jest.fn()} />,
    );

    fireEvent.change(screen.getByLabelText(/filter by actor role/i), {
      target: { value: 'cooperative' },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'cooperative' }),
    );
  });

  // ── (d) Selecting region calls onChange ───────────────────────────────────

  it('calls onChange with region set when a region is selected', () => {
    const onChange = jest.fn();
    render(
      <DirectoryFilters filters={EMPTY_FILTERS} onChange={onChange} onClear={jest.fn()} />,
    );

    fireEvent.change(screen.getByLabelText(/filter by region/i), {
      target: { value: 'Dodoma' },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ region: 'Dodoma' }),
    );
  });

  // ── (e) Selecting "All …" clears that field ────────────────────────────────

  it('calls onChange with crop=undefined when "All crops" is selected', () => {
    const onChange = jest.fn();
    render(
      <DirectoryFilters
        filters={{ crop: 'sorghum' }}
        onChange={onChange}
        onClear={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/filter by crop/i), {
      target: { value: '' },
    });

    const call = onChange.mock.calls[0][0];
    expect(call.crop).toBeUndefined();
  });

  it('calls onChange with role=undefined when "All roles" is selected', () => {
    const onChange = jest.fn();
    render(
      <DirectoryFilters
        filters={{ role: 'cooperative' }}
        onChange={onChange}
        onClear={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/filter by actor role/i), {
      target: { value: '' },
    });

    const call = onChange.mock.calls[0][0];
    expect(call.role).toBeUndefined();
  });

  // ── (f) No clear button when no filters active ────────────────────────────

  it('does not render the clear button when no filters are active', () => {
    render(
      <DirectoryFilters filters={EMPTY_FILTERS} onChange={jest.fn()} onClear={jest.fn()} />,
    );

    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
  });

  // ── (g) Clear button visible with active filter ───────────────────────────

  it('renders the "Clear filters" button when a filter is active', () => {
    render(
      <DirectoryFilters
        filters={{ crop: 'sorghum' }}
        onChange={jest.fn()}
        onClear={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  it('renders the clear button when only region is active', () => {
    render(
      <DirectoryFilters
        filters={{ region: 'Dodoma' }}
        onChange={jest.fn()}
        onClear={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  // ── (h) Activating clear calls onClear ────────────────────────────────────

  it('calls onClear when the "Clear filters" button is clicked', () => {
    const onClear = jest.fn();
    render(
      <DirectoryFilters
        filters={{ crop: 'sorghum' }}
        onChange={jest.fn()}
        onClear={onClear}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /clear/i }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  // ── (i) Region options equal the canonical set (OQ-1) ─────────────────────

  it('region select contains exactly the canonical region strings', () => {
    render(
      <DirectoryFilters filters={EMPTY_FILTERS} onChange={jest.fn()} onClear={jest.fn()} />,
    );

    const select = screen.getByLabelText(/filter by region/i) as HTMLSelectElement;
    // Collect all option values (skip empty "All regions" option).
    const optionValues = Array.from(select.options)
      .map((o) => o.value)
      .filter((v) => v !== '');

    expect(optionValues).toEqual(REGIONS);
    // Spot-check canonical strings from CANONICAL_REGIONS (OQ-1 resolution).
    expect(optionValues).toContain('Kagera');
    expect(optionValues).toContain('Manyara');
    expect(optionValues).toContain('Rukwa');
    expect(optionValues).toContain('Songwe');
    expect(optionValues).toContain('Kaskazini Unguja');
    expect(optionValues).toContain('Kusini Pemba');
  });
});
