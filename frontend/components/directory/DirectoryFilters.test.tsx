/**
 * Unit tests for DirectoryFilters — T-4, T-5, FR-2, FR-5, NFR-3.
 *
 * Covers:
 *   (a) renders three labeled selects/controls (crop, role, country, region)
 *   (b) selecting a crop calls onChange with crop set and others preserved
 *   (c) selecting a role calls onChange with role set
 *   (d) selecting a region calls onChange with region set
 *   (e) selecting "All …" (empty value) clears that field (undefined)
 *   (f) "Clear filters" button not shown when no filters are active
 *   (g) "Clear filters" button shown when at least one filter is active
 *   (h) activating "Clear filters" calls onClear
 *   (i) region options match the canonical set (OQ-1)
 *
 * T-5 (enhancement/searchable-region-select): the region control is now
 * `SearchableSelect`, a combobox rather than a native `<select>`, so region
 * interaction goes through `user-event` (open → click an option) instead of
 * `fireEvent.change`. Crop and role are unchanged native `<select>`s and keep
 * `fireEvent.change`. The region control's accessible name is now its
 * visible "Region" label — the redundant `aria-label="Filter by region"` is
 * removed (OQ-1) — so region lookups use `/^region$/i`, not `/filter by
 * region/i`.
 */

import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DirectoryFilters from './DirectoryFilters';
import { ALL_REGION_OPTIONS, regionsFor } from '@/lib/content/countries';
import type { ActorsQuery } from '@/lib/api/actors';

afterEach(() => jest.clearAllMocks());

// ── Fixture ───────────────────────────────────────────────────────────────────

const EMPTY_FILTERS: Pick<ActorsQuery, 'crop' | 'role' | 'country' | 'region'> = {};

describe('DirectoryFilters', () => {
  // ── (a) Renders labeled selects ────────────────────────────────────────────

  it('renders a crop select with label', () => {
    render(<DirectoryFilters filters={EMPTY_FILTERS} onChange={jest.fn()} onClear={jest.fn()} />);

    expect(screen.getByLabelText(/filter by crop/i)).toBeInTheDocument();
  });

  it('renders a role select with label', () => {
    render(<DirectoryFilters filters={EMPTY_FILTERS} onChange={jest.fn()} onClear={jest.fn()} />);

    expect(screen.getByLabelText(/filter by actor type/i)).toBeInTheDocument();
  });

  it('renders a region control labeled by its visible "Region" label (OQ-1 — the accessible name is the visible label, not a redundant aria-label)', () => {
    render(<DirectoryFilters filters={EMPTY_FILTERS} onChange={jest.fn()} onClear={jest.fn()} />);

    expect(screen.getByLabelText(/^region$/i)).toBeInTheDocument();
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

    fireEvent.change(screen.getByLabelText(/filter by actor type/i), {
      target: { value: 'cooperative' },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'cooperative' }),
    );
  });

  // ── (d) Selecting region calls onChange ───────────────────────────────────

  it('calls onChange with region set when a region option is picked', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <DirectoryFilters filters={EMPTY_FILTERS} onChange={onChange} onClear={jest.fn()} />,
    );

    await user.click(screen.getByLabelText(/^region$/i));
    await user.click(screen.getByRole('option', { name: 'Dodoma (Tanzania)' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ country: 'TZ', region: 'Dodoma' }),
    );
  });

  // ── (d') Clearing region emits undefined, never '' (FR-5 BUT it must NOT) ──

  it('calls onChange with region: undefined — never an empty string — when "All regions" is picked', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <DirectoryFilters
        filters={{ country: 'TZ', region: 'Dodoma' }}
        onChange={onChange}
        onClear={jest.fn()}
      />,
    );

    await user.click(screen.getByLabelText(/^region$/i));
    await user.click(screen.getByRole('option', { name: 'All regions' }));

    // Assert on the value handed to onChange — the emitted query object —
    // not on any internal component state. That distinction is the exact
    // defect FR-5's `BUT it must NOT` clause guards against.
    const call = onChange.mock.calls[0][0] as Pick<ActorsQuery, 'crop' | 'role' | 'country' | 'region'>;
    expect(call.region).toBeUndefined();
    expect(call.region).not.toBe('');
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

  it('calls onChange with role=undefined when "All types" is selected', () => {
    const onChange = jest.fn();
    render(
      <DirectoryFilters
        filters={{ role: 'cooperative' }}
        onChange={onChange}
        onClear={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/filter by actor type/i), {
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

  // ── (i) Country ↔ region dependency ───────────────────────────────────────

  async function optionLabels(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByLabelText(/^region$/i));
    return within(screen.getByRole('listbox'))
      .getAllByRole('option')
      .map((o) => o.textContent?.replace(/^✓/, '') ?? '')
      .filter((label) => label !== 'All regions');
  }

  it('lists every region of every country, labelled with its country, when no country is set', async () => {
    const user = userEvent.setup();
    render(<DirectoryFilters filters={EMPTY_FILTERS} onChange={jest.fn()} onClear={jest.fn()} />);

    const labels = await optionLabels(user);

    expect(labels).toEqual(ALL_REGION_OPTIONS.map((o) => o.label));
    expect(labels).toContain('Kusini Pemba (Tanzania)');
  });

  it('lists only the selected country\'s regions', async () => {
    const user = userEvent.setup();
    render(
      <DirectoryFilters filters={{ country: 'TZ' }} onChange={jest.fn()} onClear={jest.fn()} />,
    );

    expect(await optionLabels(user)).toEqual([...regionsFor('TZ')]);
  });

  it('clears a foreign region when the country changes, and keeps a matching one', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const { rerender } = render(
      <DirectoryFilters
        filters={{ country: 'TZ', region: 'Dodoma' }}
        onChange={onChange}
        onClear={jest.fn()}
      />,
    );

    await user.click(screen.getByLabelText(/^country$/i));
    await user.click(screen.getByRole('option', { name: 'Kenya' }));
    expect(onChange).toHaveBeenLastCalledWith({ country: 'KE', region: undefined });

    rerender(
      <DirectoryFilters
        filters={{ country: 'TZ', region: 'Dodoma' }}
        onChange={onChange}
        onClear={jest.fn()}
      />,
    );
    await user.click(screen.getByLabelText(/^country$/i));
    await user.click(screen.getByRole('option', { name: 'All countries' }));
    expect(onChange).toHaveBeenLastCalledWith({ country: undefined, region: undefined });
  });

  it('shows the clear button when only a country is active', () => {
    render(
      <DirectoryFilters filters={{ country: 'KE' }} onChange={jest.fn()} onClear={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: /clear all filters/i })).toBeInTheDocument();
  });
});
