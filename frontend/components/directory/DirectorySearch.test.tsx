/**
 * Unit tests for DirectorySearch — T-4, FR-3, NFR-3.
 *
 * Covers:
 *   (a) renders a labeled text input
 *   (b) onSearch is NOT called immediately on mount (debounce pending)
 *   (c) onSearch is called with the typed value after debounce delay (fake timers)
 *   (d) onSearch is NOT called while the user is still typing (debounce hold)
 *   (e) syncs draft from value prop when prop changes externally (clear-all)
 *   (f) onSearch fires with '' when the field is cleared
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import DirectorySearch from './DirectorySearch';

// Use fake timers for debounce testing.
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('DirectorySearch', () => {
  // ── (a) Renders labeled input ──────────────────────────────────────────────

  it('renders a text input with an accessible label', () => {
    const onSearch = jest.fn();
    render(<DirectorySearch value="" onSearch={onSearch} />);

    const input = screen.getByRole('searchbox', { name: /search organizations/i });
    expect(input).toBeInTheDocument();
  });

  it('renders the label element', () => {
    render(<DirectorySearch value="" onSearch={jest.fn()} />);

    expect(screen.getByText(/search/i)).toBeInTheDocument();
  });

  // ── (b) onSearch NOT called immediately ────────────────────────────────────

  it('does not call onSearch immediately on mount', () => {
    const onSearch = jest.fn();
    render(<DirectorySearch value="" onSearch={onSearch} />);

    // No time advanced yet — debounce pending.
    expect(onSearch).not.toHaveBeenCalled();
  });

  // ── (c) onSearch fires after debounce delay ────────────────────────────────

  it('calls onSearch with typed value after 400ms debounce', () => {
    const onSearch = jest.fn();
    render(<DirectorySearch value="" onSearch={onSearch} />);

    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'mbeya' } });

    // Should not fire yet.
    expect(onSearch).not.toHaveBeenCalled();

    // Advance past debounce threshold.
    act(() => jest.advanceTimersByTime(400));

    expect(onSearch).toHaveBeenCalledWith('mbeya');
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  // ── (d) Debounce holds while typing ───────────────────────────────────────

  it('does not call onSearch mid-typing (debounce hold)', () => {
    const onSearch = jest.fn();
    render(<DirectorySearch value="" onSearch={onSearch} />);

    const input = screen.getByRole('searchbox');

    fireEvent.change(input, { target: { value: 'm' } });
    act(() => jest.advanceTimersByTime(200));
    expect(onSearch).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'mb' } });
    act(() => jest.advanceTimersByTime(200));
    expect(onSearch).not.toHaveBeenCalled();

    // Only fires after 400ms of no further changes.
    act(() => jest.advanceTimersByTime(200));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('mb');
  });

  // ── (e) Syncs draft from value prop on external reset ──────────────────────

  it('syncs the draft to the value prop when it changes externally', () => {
    const onSearch = jest.fn();
    const { rerender } = render(<DirectorySearch value="mbeya" onSearch={onSearch} />);

    const input = screen.getByRole('searchbox');
    expect(input).toHaveValue('mbeya');

    // Simulate external clear (e.g. clear-all sets value to '').
    rerender(<DirectorySearch value="" onSearch={onSearch} />);
    act(() => jest.runOnlyPendingTimers());

    expect(input).toHaveValue('');
  });

  // ── (f) onSearch fires '' on clear ────────────────────────────────────────

  it('calls onSearch with an empty string when the field is cleared', () => {
    const onSearch = jest.fn();
    render(<DirectorySearch value="mbeya" onSearch={onSearch} />);

    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: '' } });

    act(() => jest.advanceTimersByTime(400));

    expect(onSearch).toHaveBeenCalledWith('');
  });
});
