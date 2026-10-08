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
 *   (g) no country → every region of every country, labelled `Region (Country)`;
 *       a country → only its regions; picking a region sets its country;
 *       changing the country clears a region that no longer fits
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
import { ALL_REGION_OPTIONS, regionsFor } from '@/lib/content/countries';

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

  it('calls onChange with { region: "Mbeya", page: 1 } when Mbeya is picked within its country', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<FilterControls filters={{ country: 'TZ' }} onChange={onChange} />);

    await user.click(screen.getByLabelText(/^region$/i));
    await user.click(screen.getByRole('option', { name: 'Mbeya' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ country: 'TZ', region: 'Mbeya', page: 1 });
  });

  // ── (b) "All regions" clears region (undefined) and resets page ───────────

  it('calls onChange with region: undefined — never an empty string — and page: 1 when "All regions" is picked (FR-5 BUT it must NOT)', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    // Start with region already set to verify it is cleared.
    render(<FilterControls filters={{ country: 'TZ', region: 'Mbeya' }} onChange={onChange} />);

    await user.click(screen.getByLabelText(/^region$/i));
    await user.click(screen.getByRole('option', { name: 'All regions' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    // Assert on the value handed to onChange — the emitted query object —
    // not on any internal component state. That distinction is the exact
    // defect FR-5's `BUT it must NOT` clause guards against.
    const call = onChange.mock.calls[0][0] as ActorsQuery;
    expect(call.region).toBeUndefined();
    expect(call.region).not.toBe('');
    expect(call.country).toBe('TZ');
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

    const roleSelect = screen.getByLabelText(/filter by actor type/i);
    fireEvent.change(roleSelect, { target: { value: 'cooperative' } });

    expect(onChange).toHaveBeenCalledWith({ role: 'cooperative', page: 1 });
  });

  // ── (e) Existing filter fields are preserved when one changes ─────────────

  it('preserves existing crop filter when region changes', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<FilterControls filters={{ crop: 'sorghum' }} onChange={onChange} />);

    await user.click(screen.getByLabelText(/^region$/i));
    await user.click(screen.getByRole('option', { name: 'Arusha (Tanzania)' }));

    expect(onChange).toHaveBeenCalledWith({
      crop: 'sorghum',
      region: 'Arusha',
      country: 'TZ',
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

  it('renders all four labeled controls (crop, role, country, region)', () => {
    render(<FilterControls filters={{}} onChange={jest.fn()} />);

    // Crop/role keep their aria-label; region's accessible name is now its
    // visible "Region" label (OQ-1 — the redundant aria-label is removed).
    expect(screen.getByLabelText(/filter by crop/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter by actor type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^country$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^region$/i)).toBeInTheDocument();
  });

  // ── (g) Country ↔ region dependency ───────────────────────────────────────

  // Scoped to the open listbox: a bare `getAllByRole('option')` also collects
  // the crop/role native <select>s' <option> elements.
  async function openedOptionLabels(user: ReturnType<typeof userEvent.setup>, label: RegExp) {
    await user.click(screen.getByLabelText(label));
    return within(screen.getByRole('listbox'))
      .getAllByRole('option')
      .map((o) => o.textContent?.replace(/^✓/, '') ?? '');
  }

  it('offers every region of every country, labelled with its country, when no country is set', async () => {
    const user = userEvent.setup();
    render(<FilterControls filters={{}} onChange={jest.fn()} />);

    const labels = (await openedOptionLabels(user, /^region$/i)).filter((l) => l !== 'All regions');

    expect(labels).toEqual(ALL_REGION_OPTIONS.map((o) => o.label));
    expect(labels).toContain('Northern (Ghana)');
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('offers only the selected country\'s regions when a country is set', async () => {
    const user = userEvent.setup();
    render(<FilterControls filters={{ country: 'KE' }} onChange={jest.fn()} />);

    const labels = (await openedOptionLabels(user, /^region$/i)).filter((l) => l !== 'All regions');

    expect(labels).toEqual([...regionsFor('KE')]);
  });

  it('sets the region\'s country when a region is picked while no country is selected', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<FilterControls filters={{}} onChange={onChange} />);

    await user.click(screen.getByLabelText(/^region$/i));
    await user.click(screen.getByRole('option', { name: 'Nakuru (Kenya)' }));

    expect(onChange).toHaveBeenCalledWith({ country: 'KE', region: 'Nakuru', page: 1 });
  });

  it('clears a region that does not belong to the newly chosen country', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<FilterControls filters={{ country: 'TZ', region: 'Mbeya' }} onChange={onChange} />);

    await user.click(screen.getByLabelText(/^country$/i));
    await user.click(screen.getByRole('option', { name: 'Kenya' }));

    expect(onChange).toHaveBeenCalledWith({ country: 'KE', region: undefined, page: 1 });
  });

  it('clears both country and region with "All countries"', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<FilterControls filters={{ country: 'TZ', region: 'Mbeya' }} onChange={onChange} />);

    await user.click(screen.getByLabelText(/^country$/i));
    await user.click(screen.getByRole('option', { name: 'All countries' }));

    expect(onChange).toHaveBeenCalledWith({ country: undefined, region: undefined, page: 1 });
  });

  // ── (h) Surrounding role="group" preserved ────────────────────────────────

  it('keeps the surrounding role="group" wrapper', () => {
    render(<FilterControls filters={{}} onChange={jest.fn()} />);

    expect(screen.getByRole('group', { name: /filter actors/i })).toBeInTheDocument();
  });
});
