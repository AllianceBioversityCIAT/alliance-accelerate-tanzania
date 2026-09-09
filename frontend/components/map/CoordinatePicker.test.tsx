/**
 * Unit tests for CoordinatePicker — T-4, FR-4, FR-7 sc. 1-2, FR-1 sc. 1
 * ("never one alone"), NFR-2.
 *
 * Filter: `CoordinatePicker` (matches both this file and, unless excluded,
 * `CoordinatePickerMap.tsx` — that file has no test suite of its own, so
 * `npm test -- CoordinatePicker` runs only this file in practice).
 *
 * `next/dynamic` is mocked (ActorMap.test.tsx's precedent) so
 * `CoordinatePickerMap` — which imports `leaflet` — is never actually
 * resolved in jsdom. The mock records every props object it receives in
 * `receivedProps`, so a test can inspect exactly what the wrapper handed
 * down without needing the real shell to render anything.
 *
 * Covers:
 *   - FR-7 sc. 1: shell absent while closed, reveal control present in the
 *     SAME assertion (an absence check alone cannot fail if the component
 *     threw — KZ-002)
 *   - FR-7 sc. 2: shell present after reveal, receiving current lat/lng
 *   - FR-4 sc. 1: clear writes ('', '') in one call
 *   - FR-4 sc. 2: clear is disabled (present, not absent) when both fields
 *     are blank, and enabled for a half-filled pair
 *   - FR-1 sc. 1 / DD-2: the stub's prop object carries a single `onChange`
 *     — no `onLatitudeChange`/`onLongitudeChange` pair exists to write one
 *     field alone
 *   - NFR-2: jest-axe clean in both the closed and open states; reveal and
 *     clear both have accessible names
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import CoordinatePicker from './CoordinatePicker';
import type { CoordinatePickerMapProps } from './CoordinatePickerMap';

expect.extend(toHaveNoViolations);

// ── Module mocks ──────────────────────────────────────────────────────────────

// Recording stub (task brief's "recording stub" requirement): captures every
// props object CoordinatePickerMap would have received, without ever
// importing the real (Leaflet-backed) module.
let receivedProps: CoordinatePickerMapProps | null = null;

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: (
    importFn: () => Promise<{ default: React.ComponentType<CoordinatePickerMapProps> }>,
    _options?: unknown,
  ) => {
    void importFn;
    const MockCoordinatePickerMap = (props: CoordinatePickerMapProps) => {
      receivedProps = props;
      return <div data-testid="coordinate-picker-map-mock" />;
    };
    MockCoordinatePickerMap.displayName = 'MockCoordinatePickerMap';
    return MockCoordinatePickerMap;
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const noop = () => undefined;

beforeEach(() => {
  receivedProps = null;
});

async function openPicker() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /show map/i }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CoordinatePicker', () => {
  // ── FR-7 sc. 1: closed by default ─────────────────────────────────────────

  it('does not render the shell while closed, and shows a labelled reveal control', () => {
    render(<CoordinatePicker latitude="" longitude="" onChange={noop} />);

    // Both halves of the same assertion, per the task's disqualifier: an
    // absence check alone would also pass if the component threw or
    // rendered nothing at all.
    expect(screen.queryByTestId('coordinate-picker-map-mock')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show map to set location/i })).toBeInTheDocument();
    expect(receivedProps).toBeNull();
  });

  it('honours initiallyOpen to seed the open state', () => {
    render(
      <CoordinatePicker latitude="-6.37" longitude="34.89" onChange={noop} initiallyOpen />,
    );

    expect(screen.getByTestId('coordinate-picker-map-mock')).toBeInTheDocument();
    expect(receivedProps).not.toBeNull();
  });

  // ── FR-7 sc. 2: reveal mounts the shell with current values ──────────────

  it('renders the shell after the reveal control is activated, passing current coordinates', async () => {
    render(<CoordinatePicker latitude="-6.5" longitude="35.1" onChange={noop} />);

    expect(screen.queryByTestId('coordinate-picker-map-mock')).not.toBeInTheDocument();

    await openPicker();

    expect(screen.getByTestId('coordinate-picker-map-mock')).toBeInTheDocument();
    expect(receivedProps).not.toBeNull();
    expect(receivedProps!.latitude).toBe('-6.5');
    expect(receivedProps!.longitude).toBe('35.1');
  });

  it('passes the disabled flag through to the shell once open', () => {
    // initiallyOpen, not the reveal control: the reveal control is itself
    // disabled while the form submits, so it cannot be used to reach this
    // state interactively.
    render(<CoordinatePicker latitude="1" longitude="2" onChange={noop} initiallyOpen disabled />);

    expect(receivedProps!.disabled).toBe(true);
  });

  // ── FR-1 sc. 1 / DD-2: single write path, never one field alone ──────────

  it('exposes exactly one write path to the shell — no per-axis callback exists', async () => {
    render(<CoordinatePicker latitude="-6.5" longitude="35.1" onChange={noop} />);
    await openPicker();

    expect(receivedProps).not.toBeNull();
    expect(Object.keys(receivedProps!).sort()).toEqual(
      ['disabled', 'latitude', 'longitude', 'onChange'].sort(),
    );
    expect(typeof receivedProps!.onChange).toBe('function');
  });

  it('forwards a single onChange the shell can call with both values together', async () => {
    const onChange = jest.fn();
    render(<CoordinatePicker latitude="" longitude="" onChange={onChange} />);
    await openPicker();

    // Simulate the shell reporting a drag/click — the wrapper does not
    // intercept or split this call.
    receivedProps!.onChange('-6.17', '35.74');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('-6.17', '35.74');
  });

  // ── FR-4 sc. 1: clear writes both fields blank in one call ───────────────

  it('clear writes both fields to blank in a single call', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<CoordinatePicker latitude="-6.17" longitude="35.74" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /clear location/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('', '');
  });

  // ── FR-4 sc. 2: disabled, not absent, with nothing to clear ──────────────

  it('disables the clear control when both fields are already blank', () => {
    render(<CoordinatePicker latitude="" longitude="" onChange={noop} />);

    const clearButton = screen.getByRole('button', { name: /clear location/i });
    expect(clearButton).toBeInTheDocument();
    expect(clearButton).toBeDisabled();
  });

  it('enables the clear control for a half-filled pair', () => {
    render(<CoordinatePicker latitude="-6.17" longitude="" onChange={noop} />);

    expect(screen.getByRole('button', { name: /clear location/i })).toBeEnabled();
  });

  it('enables the clear control once a full pair is placed', () => {
    render(<CoordinatePicker latitude="-6.17" longitude="35.74" onChange={noop} />);

    expect(screen.getByRole('button', { name: /clear location/i })).toBeEnabled();
  });

  // ── NFR-2: accessible names + axe ─────────────────────────────────────────

  it('has no jest-axe violations while closed', async () => {
    const { container } = render(<CoordinatePicker latitude="" longitude="" onChange={noop} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no jest-axe violations while open', async () => {
    const { container } = render(
      <CoordinatePicker latitude="-6.17" longitude="35.74" onChange={noop} initiallyOpen />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
