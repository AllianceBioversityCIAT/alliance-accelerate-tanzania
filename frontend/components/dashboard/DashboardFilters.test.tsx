/**
 * Unit tests for DashboardFilters — T-10, FR-2, FR-3, NFR-4, design.md §5.3.
 *
 * Filter: `DashboardFilters` (matched via filename).
 *
 * Covers:
 *   (a) Changing the crop select calls onChange with { crop: <slug>, page: 1 } merged.
 *   (b) Entering a Min capacity calls onChange with capacityMin set as a number.
 *   (c) Every control has an associated accessible label (queried by label text).
 *   (d) Clearing capacity resets both capacityMin and capacityMax to undefined.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DashboardFilters from './DashboardFilters';
import type { ActorsQuery } from '@/lib/api/actors';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMPTY_FILTERS: ActorsQuery = {};

const FILTERS_WITH_CAPACITY: ActorsQuery = {
  capacityMin: 50,
  capacityMax: 200,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Renders DashboardFilters with the given filters and returns a Jest mock
 * function pre-wired as the onChange handler.
 */
function setup(filters: ActorsQuery = EMPTY_FILTERS) {
  const onChange = jest.fn();
  render(<DashboardFilters filters={filters} onChange={onChange} />);
  return { onChange };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DashboardFilters', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  // ── (a) Crop select ──────────────────────────────────────────────────────

  describe('(a) crop select', () => {
    it('calls onChange with { crop: slug, page: 1 } merged when a crop is selected', () => {
      const { onChange } = setup({ region: 'Arusha', page: 3 });

      const cropSelect = screen.getByLabelText('Filter by crop');
      fireEvent.change(cropSelect, { target: { value: 'sorghum' } });

      expect(onChange).toHaveBeenCalledTimes(1);
      const nextQuery: ActorsQuery = onChange.mock.calls[0][0];
      // Crop slug set
      expect(nextQuery.crop).toBe('sorghum');
      // Page reset to 1
      expect(nextQuery.page).toBe(1);
      // Pre-existing filters preserved
      expect(nextQuery.region).toBe('Arusha');
    });

    it('clears crop (undefined) when "All crops" is selected', () => {
      const { onChange } = setup({ crop: 'groundnut' });

      const cropSelect = screen.getByLabelText('Filter by crop');
      fireEvent.change(cropSelect, { target: { value: '' } });

      expect(onChange).toHaveBeenCalledTimes(1);
      const nextQuery: ActorsQuery = onChange.mock.calls[0][0];
      expect(nextQuery.crop).toBeUndefined();
      expect(nextQuery.page).toBe(1);
    });

    it('calls onChange with common_bean slug', () => {
      const { onChange } = setup();

      fireEvent.change(screen.getByLabelText('Filter by crop'), {
        target: { value: 'common_bean' },
      });

      expect(onChange.mock.calls[0][0].crop).toBe('common_bean');
    });
  });

  // ── (b) Min capacity input ───────────────────────────────────────────────

  describe('(b) min capacity input', () => {
    it('calls onChange with capacityMin as a number when the min input changes', () => {
      const { onChange } = setup();

      const minInput = screen.getByLabelText('Min capacity (t)');
      fireEvent.change(minInput, { target: { value: '100' } });

      expect(onChange).toHaveBeenCalledTimes(1);
      const nextQuery: ActorsQuery = onChange.mock.calls[0][0];
      expect(nextQuery.capacityMin).toBe(100);
      expect(typeof nextQuery.capacityMin).toBe('number');
      expect(nextQuery.page).toBe(1);
    });

    it('emits capacityMin as undefined for an empty min input', () => {
      const { onChange } = setup({ capacityMin: 50 });

      fireEvent.change(screen.getByLabelText('Min capacity (t)'), {
        target: { value: '' },
      });

      expect(onChange.mock.calls[0][0].capacityMin).toBeUndefined();
    });

    it('treats negative min input as undefined', () => {
      const { onChange } = setup();

      fireEvent.change(screen.getByLabelText('Min capacity (t)'), {
        target: { value: '-10' },
      });

      expect(onChange.mock.calls[0][0].capacityMin).toBeUndefined();
    });

    it('emits capacityMax as a number when the max input changes', () => {
      const { onChange } = setup();

      fireEvent.change(screen.getByLabelText('Max capacity (t)'), {
        target: { value: '500' },
      });

      expect(onChange.mock.calls[0][0].capacityMax).toBe(500);
      expect(onChange.mock.calls[0][0].page).toBe(1);
    });
  });

  // ── (c) Accessible labels ────────────────────────────────────────────────

  describe('(c) every control has an accessible label', () => {
    beforeEach(() => {
      setup();
    });

    it('has an accessible label for the crop select', () => {
      expect(screen.getByLabelText('Filter by crop')).toBeInTheDocument();
    });

    it('has an accessible label for the region select', () => {
      expect(screen.getByLabelText('Filter by region')).toBeInTheDocument();
    });

    it('has an accessible label for the district input', () => {
      expect(screen.getByLabelText('Filter by district')).toBeInTheDocument();
    });

    it('has an accessible label for the actor type select', () => {
      expect(screen.getByLabelText('Filter by actor type')).toBeInTheDocument();
    });

    it('has an accessible label for the search input', () => {
      expect(screen.getByLabelText('Search actors by name')).toBeInTheDocument();
    });

    it('has an accessible label for the min capacity input', () => {
      expect(screen.getByLabelText('Min capacity (t)')).toBeInTheDocument();
    });

    it('has an accessible label for the max capacity input', () => {
      expect(screen.getByLabelText('Max capacity (t)')).toBeInTheDocument();
    });
  });

  // ── (d) Clear capacity ───────────────────────────────────────────────────

  describe('(d) clearing capacity resets to undefined', () => {
    it('renders the Clear button when both capacity fields have values', () => {
      setup(FILTERS_WITH_CAPACITY);
      expect(screen.getByRole('button', { name: 'Clear capacity range' })).toBeInTheDocument();
    });

    it('calls onChange with capacityMin and capacityMax both undefined when Clear is clicked', () => {
      const { onChange } = setup(FILTERS_WITH_CAPACITY);

      const clearBtn = screen.getByRole('button', { name: 'Clear capacity range' });
      fireEvent.click(clearBtn);

      expect(onChange).toHaveBeenCalledTimes(1);
      const nextQuery: ActorsQuery = onChange.mock.calls[0][0];
      expect(nextQuery.capacityMin).toBeUndefined();
      expect(nextQuery.capacityMax).toBeUndefined();
      expect(nextQuery.page).toBe(1);
    });

    it('does not render the Clear button when no capacity filters are set', () => {
      setup(EMPTY_FILTERS);
      expect(screen.queryByRole('button', { name: 'Clear capacity range' })).not.toBeInTheDocument();
    });

    it('renders the Clear button when only capacityMin is set', () => {
      setup({ capacityMin: 100 });
      expect(screen.getByRole('button', { name: 'Clear capacity range' })).toBeInTheDocument();
    });

    it('renders the Clear button when only capacityMax is set', () => {
      setup({ capacityMax: 500 });
      expect(screen.getByRole('button', { name: 'Clear capacity range' })).toBeInTheDocument();
    });
  });

  // ── Additional integration ───────────────────────────────────────────────

  describe('additional filter integration', () => {
    it('calls onChange with region set and page reset when region is selected', () => {
      const { onChange } = setup({ page: 5 });

      fireEvent.change(screen.getByLabelText('Filter by region'), {
        target: { value: 'Dodoma' },
      });

      expect(onChange.mock.calls[0][0].region).toBe('Dodoma');
      expect(onChange.mock.calls[0][0].page).toBe(1);
    });

    it('calls onChange with role set and page reset when actor type is selected', () => {
      const { onChange } = setup();

      fireEvent.change(screen.getByLabelText('Filter by actor type'), {
        target: { value: 'cooperative' },
      });

      expect(onChange.mock.calls[0][0].role).toBe('cooperative');
      expect(onChange.mock.calls[0][0].page).toBe(1);
    });

    it('calls onChange with search set when search input changes', () => {
      const { onChange } = setup();

      fireEvent.change(screen.getByLabelText('Search actors by name'), {
        target: { value: 'TARI' },
      });

      expect(onChange.mock.calls[0][0].search).toBe('TARI');
      expect(onChange.mock.calls[0][0].page).toBe(1);
    });

    it('clears search to undefined for empty search input', () => {
      const { onChange } = setup({ search: 'TARI' });

      fireEvent.change(screen.getByLabelText('Search actors by name'), {
        target: { value: '' },
      });

      expect(onChange.mock.calls[0][0].search).toBeUndefined();
    });

    it('calls onChange with district set when district input changes', () => {
      const { onChange } = setup();

      fireEvent.change(screen.getByLabelText('Filter by district'), {
        target: { value: 'Moshi' },
      });

      expect(onChange.mock.calls[0][0].district).toBe('Moshi');
      expect(onChange.mock.calls[0][0].page).toBe(1);
    });

    it('clears role to undefined when "All types" is selected', () => {
      const { onChange } = setup({ role: 'ngo' });

      fireEvent.change(screen.getByLabelText('Filter by actor type'), {
        target: { value: '' },
      });

      expect(onChange.mock.calls[0][0].role).toBeUndefined();
    });
  });
});
