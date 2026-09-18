/**
 * Unit tests for FilterControls — T-4, T-5, FR-4, FR-5, NFR-3.
 *
 * Filter: `FilterControls` (matched via filename).
 *
 * Covers:
 *   (a) region option pick calls onChange with { region: 'Mbeya', page: 1 }
 *   (b) "All regions" selection clears region (undefined) and resets page to 1
 *   (c) crop select uses slug value ('sorghum') not display name
 *   (d) role select uses traderType slug value
 *   (e) existing filter fields are preserved when one changes
 *   (f) "All crops" clears the crop field (undefined) and resets page
 *   (g) dynamic `regions` subset renders exactly that subset; falls back to
 *       all 31 when undefined/empty
 *   (h) the surrounding role="group" is preserved
 *
 * T-5 (enhancement/searchable-region-select): the region control is now
 * `SearchableSelect`, a combobox rather than a native `<select>`, so region
 * interaction goes through `user-event` (open → click an option) instead of
 * `fireEvent.change`. Crop and role are unchanged native `<select>`s and keep
 * `fireEvent.change`. The region control's accessible name is now its
 * visible "Region" label — the redundant `aria-label="Filter by region"` is
 * removed (OQ-1, JD-4) — so region lookups use `/^region$/i`, not
 * `/filter by region/i`.
 */

import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterControls from './FilterControls';
import type { ActorsQuery } from '@/lib/api/actors';
import { REGIONS } from '@/lib/content/regions';

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

  // ── (a) Region option pick → onChange with { region, page: 1 } ───────────

  it('calls onChange with { region: "Mbeya", page: 1 } when Mbeya is picked', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<FilterControls filters={{}} onChange={onChange} />);

    await user.click(screen.getByLabelText(/^region$/i));
    await user.click(screen.getByRole('option', { name: 'Mbeya' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ region: 'Mbeya', page: 1 });
  });

  // ── (b) "All regions" clears region (undefined) and resets page ───────────

  it('calls onChange with region: undefined — never an empty string — and page: 1 when "All regions" is picked (FR-5 BUT it must NOT)', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    // Start with region already set to verify it is cleared.
    render(<FilterControls filters={{ region: 'Mbeya' }} onChange={onChange} />);

    await user.click(screen.getByLabelText(/^region$/i));
    await user.click(screen.getByRole('option', { name: 'All regions' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    // Assert on the value handed to onChange — the emitted query object —
    // not on any internal component state. That distinction is the exact
    // defect FR-5's `BUT it must NOT` clause guards against.
    const call = onChange.mock.calls[0][0] as ActorsQuery;
    expect(call.region).toBeUndefined();
    expect(call.region).not.toBe('');
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

  it('preserves existing crop filter when region changes', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<FilterControls filters={{ crop: 'sorghum' }} onChange={onChange} />);

    await user.click(screen.getByLabelText(/^region$/i));
    await user.click(screen.getByRole('option', { name: 'Arusha' }));

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

  it('renders all three labeled controls (crop, role, region)', () => {
    render(<FilterControls filters={{}} onChange={jest.fn()} />);

    // Crop/role keep their aria-label; region's accessible name is now its
    // visible "Region" label (OQ-1 — the redundant aria-label is removed).
    expect(screen.getByLabelText(/filter by crop/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter by actor role/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^region$/i)).toBeInTheDocument();
  });

  // ── (g) Dynamic region subset (FR-5 "Dynamic option subset") ─────────────

  // These three scope the option query to the region listbox via `within` —
  // a bare `screen.getAllByRole('option')` also picks up the crop/role
  // native <select>s' <option> elements, which carry the same implicit ARIA
  // role, so an unscoped query over-collects. Also strips a leading "✓":
  // `filters.region` defaults to `''` here, which matches the clear entry's
  // own value, so the clear entry renders checked.

  it('lists exactly the provided regions subset, not all 31, when regions is non-empty', async () => {
    const user = userEvent.setup();
    render(<FilterControls filters={{}} onChange={jest.fn()} regions={['Mbeya', 'Dodoma']} />);

    await user.click(screen.getByLabelText(/^region$/i));

    const optionLabels = within(screen.getByRole('listbox'))
      .getAllByRole('option')
      .map((o) => o.textContent?.replace(/^✓/, '') ?? '')
      .filter((label) => label !== 'All regions');

    expect(optionLabels).toEqual(['Mbeya', 'Dodoma']);
  });

  it('falls back to all 31 canonical regions when regions is undefined', async () => {
    const user = userEvent.setup();
    render(<FilterControls filters={{}} onChange={jest.fn()} />);

    await user.click(screen.getByLabelText(/^region$/i));

    const optionLabels = within(screen.getByRole('listbox'))
      .getAllByRole('option')
      .map((o) => o.textContent?.replace(/^✓/, '') ?? '')
      .filter((label) => label !== 'All regions');

    expect(optionLabels).toEqual(REGIONS);
  });

  it('falls back to all 31 canonical regions when regions is an empty array', async () => {
    const user = userEvent.setup();
    render(<FilterControls filters={{}} onChange={jest.fn()} regions={[]} />);

    await user.click(screen.getByLabelText(/^region$/i));

    const optionLabels = within(screen.getByRole('listbox'))
      .getAllByRole('option')
      .map((o) => o.textContent?.replace(/^✓/, '') ?? '')
      .filter((label) => label !== 'All regions');

    expect(optionLabels).toEqual(REGIONS);
  });

  // ── (h) Surrounding role="group" preserved ────────────────────────────────

  it('keeps the surrounding role="group" wrapper', () => {
    render(<FilterControls filters={{}} onChange={jest.fn()} />);

    expect(screen.getByRole('group', { name: /filter actors/i })).toBeInTheDocument();
  });
});
