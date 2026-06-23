/**
 * Unit tests for FilterControls — T-4, FR-4, NFR-3.
 *
 * Filter: `FilterControls` (matched via filename).
 *
 * Covers:
 *   (a) region select change calls onChange with { region: 'Mbeya', page: 1 }
 *   (b) "All regions" selection clears region (undefined) and resets page to 1
 *   (c) crop select uses slug value ('sorghum') not display name
 *   (d) role select uses traderType slug value
 *   (e) existing filter fields are preserved when one changes
 *   (f) "All crops" clears the crop field (undefined) and resets page
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterControls from './FilterControls';
import type { ActorsQuery } from '@/lib/api/actors';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderControls(
  filters: ActorsQuery = {},
  onChange = jest.fn(),
) {
  return { onChange, ...render(<FilterControls filters={filters} onChange={onChange} />) };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FilterControls', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── (a) Region select → onChange with { region, page: 1 } ────────────────

  it('calls onChange with { region: "Mbeya", page: 1 } when Mbeya is selected', () => {
    const onChange = jest.fn();
    render(<FilterControls filters={{}} onChange={onChange} />);

    const regionSelect = screen.getByLabelText(/filter by region/i);
    fireEvent.change(regionSelect, { target: { value: 'Mbeya' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ region: 'Mbeya', page: 1 });
  });

  // ── (b) "All regions" clears region (undefined) and resets page ───────────

  it('calls onChange with region=undefined when "All regions" is selected', () => {
    const onChange = jest.fn();
    // Start with region already set to verify it is cleared.
    render(<FilterControls filters={{ region: 'Mbeya' }} onChange={onChange} />);

    const regionSelect = screen.getByLabelText(/filter by region/i);
    // Selecting the empty option ("All regions") sends value=''.
    fireEvent.change(regionSelect, { target: { value: '' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const call = onChange.mock.calls[0][0] as ActorsQuery;
    expect(call.region).toBeUndefined();
    expect(call.page).toBe(1);
  });

  // ── (c) Crop select uses slug value ──────────────────────────────────────

  it('calls onChange with crop slug "sorghum" when Sorghum is selected', () => {
    const onChange = jest.fn();
    render(<FilterControls filters={{}} onChange={onChange} />);

    const cropSelect = screen.getByLabelText(/filter by crop/i);
    fireEvent.change(cropSelect, { target: { value: 'sorghum' } });

    expect(onChange).toHaveBeenCalledWith({ crop: 'sorghum', page: 1 });
  });

  it('calls onChange with crop slug "common_bean" when Common Bean is selected', () => {
    const onChange = jest.fn();
    render(<FilterControls filters={{}} onChange={onChange} />);

    const cropSelect = screen.getByLabelText(/filter by crop/i);
    fireEvent.change(cropSelect, { target: { value: 'common_bean' } });

    expect(onChange).toHaveBeenCalledWith({ crop: 'common_bean', page: 1 });
  });

  // ── (d) Role select uses traderType slug ──────────────────────────────────

  it('calls onChange with role slug when a role is selected', () => {
    const onChange = jest.fn();
    render(<FilterControls filters={{}} onChange={onChange} />);

    const roleSelect = screen.getByLabelText(/filter by actor role/i);
    fireEvent.change(roleSelect, { target: { value: 'cooperative' } });

    expect(onChange).toHaveBeenCalledWith({ role: 'cooperative', page: 1 });
  });

  // ── (e) Existing filter fields are preserved when one changes ─────────────

  it('preserves existing crop filter when region changes', () => {
    const onChange = jest.fn();
    render(<FilterControls filters={{ crop: 'sorghum' }} onChange={onChange} />);

    const regionSelect = screen.getByLabelText(/filter by region/i);
    fireEvent.change(regionSelect, { target: { value: 'Arusha' } });

    expect(onChange).toHaveBeenCalledWith({
      crop: 'sorghum',
      region: 'Arusha',
      page: 1,
    });
  });

  // ── (f) "All crops" clears crop field (undefined) ─────────────────────────

  it('calls onChange with crop=undefined when "All crops" is selected', () => {
    const onChange = jest.fn();
    render(<FilterControls filters={{ crop: 'sorghum', region: 'Mbeya' }} onChange={onChange} />);

    const cropSelect = screen.getByLabelText(/filter by crop/i);
    fireEvent.change(cropSelect, { target: { value: '' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const call = onChange.mock.calls[0][0] as ActorsQuery;
    expect(call.crop).toBeUndefined();
    // Existing region preserved.
    expect(call.region).toBe('Mbeya');
    expect(call.page).toBe(1);
  });

  // ── Label association (NFR-3) ─────────────────────────────────────────────

  it('renders all three labeled selects (crop, role, region)', () => {
    render(<FilterControls filters={{}} onChange={jest.fn()} />);

    // Each select is findable via its aria-label / associated label.
    expect(screen.getByLabelText(/filter by crop/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter by actor role/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter by region/i)).toBeInTheDocument();
  });
});
