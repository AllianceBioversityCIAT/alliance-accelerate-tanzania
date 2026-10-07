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
 *   - ATP-80: "Use my current location" writes both values in one call and
 *     opens the map; each failure (unsupported, denied, unavailable, timeout)
 *     shows its own message and writes nothing
 */

import React, { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
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
      ['disabled', 'latitude', 'longitude', 'onChange', 'onOutsideBounds'].sort(),
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

// ── ATP-80: "Use my current location" ───────────────────────────────────────

type SuccessCb = (position: { coords: { latitude: number; longitude: number; accuracy: number } }) => void;
type ErrorCb = (error: { code: number }) => void;

describe('CoordinatePicker — use my current location (ATP-80)', () => {
  let getCurrentPosition: jest.Mock;
  const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, 'geolocation');

  function installGeolocation(value: unknown) {
    Object.defineProperty(navigator, 'geolocation', { value, configurable: true });
  }

  beforeEach(() => {
    getCurrentPosition = jest.fn();
    installGeolocation({ getCurrentPosition });
  });

  afterEach(() => {
    if (originalGeolocation) {
      Object.defineProperty(navigator, 'geolocation', originalGeolocation);
    } else {
      delete (navigator as { geolocation?: unknown }).geolocation;
    }
  });

  // Controlled host, as both forms are: the picker holds no coordinate state.
  function Host({ onChange = noop }: { onChange?: (lat: string, lng: string) => void }) {
    const [coords, setCoords] = useState({ lat: '', lng: '' });
    return (
      <>
        <CoordinatePicker
          latitude={coords.lat}
          longitude={coords.lng}
          onChange={(lat, lng) => {
            onChange(lat, lng);
            setCoords({ lat, lng });
          }}
        />
        <button type="button" onClick={() => setCoords({ lat: '-7', lng: '36' })}>
          type manually
        </button>
      </>
    );
  }

  async function clickLocate() {
    await userEvent.setup().click(screen.getByRole('button', { name: /use my current location/i }));
  }

  function lastCallbacks(): { success: SuccessCb; error: ErrorCb; options: PositionOptions } {
    const [success, error, options] = getCurrentPosition.mock.calls.at(-1);
    return { success, error, options };
  }

  it('asks for a fresh high-accuracy fix', async () => {
    render(<Host />);
    await clickLocate();

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(lastCallbacks().options).toEqual(
      expect.objectContaining({ enableHighAccuracy: true, maximumAge: 0 }),
    );
  });

  it('refuses a device location outside Africa: nothing is set and the reason is shown', async () => {
    const onChange = jest.fn();
    render(<Host onChange={onChange} />);
    await clickLocate();
    act(() => lastCallbacks().success({ coords: { latitude: 4.711, longitude: -74.07, accuracy: 10 } }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/outside Africa, so it was not used/i);
  });

  it('shows why a map click outside Africa was not set, and clears it once the fields change', async () => {
    render(<Host />);
    await openPicker();
    act(() => receivedProps!.onOutsideBounds!());
    expect(screen.getByRole('alert')).toHaveTextContent(/must be in Africa/i);

    await userEvent.setup().click(screen.getByRole('button', { name: 'type manually' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a busy, disabled control while waiting for the device', async () => {
    render(<Host />);
    await clickLocate();

    expect(screen.getByRole('button', { name: /finding your location/i })).toBeDisabled();
  });

  it('writes both coordinates in one call, opens the map and states the accuracy', async () => {
    const onChange = jest.fn();
    render(<Host onChange={onChange} />);
    expect(screen.queryByTestId('coordinate-picker-map-mock')).not.toBeInTheDocument();

    await clickLocate();
    act(() =>
      lastCallbacks().success({ coords: { latitude: -6.123456, longitude: 35.74, accuracy: 18.4 } }),
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('-6.12346', '35.74000');
    expect(screen.getByTestId('coordinate-picker-map-mock')).toBeInTheDocument();
    expect(receivedProps!.latitude).toBe('-6.12346');
    expect(screen.getByRole('status')).toHaveTextContent(/accurate to about 18 m/i);
    expect(screen.getByRole('button', { name: /use my current location/i })).toBeEnabled();
  });

  it('drops the confirmation once the coordinates are changed by hand', async () => {
    render(<Host />);
    await clickLocate();
    act(() => lastCallbacks().success({ coords: { latitude: -6.1, longitude: 35.7, accuracy: 10 } }));
    expect(screen.getByRole('status')).toHaveTextContent(/location set from your device/i);

    await userEvent.setup().click(screen.getByRole('button', { name: 'type manually' }));

    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it.each([
    [1, /location access is blocked.*browser settings/i],
    [2, /could not be found.*location services/i],
    [3, /took too long/i],
  ])('error code %i shows its message, writes nothing and keeps the map closed', async (code, text) => {
    const onChange = jest.fn();
    render(<Host onChange={onChange} />);
    await clickLocate();
    act(() => lastCallbacks().error({ code }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(text);
    expect(alert).toHaveTextContent(/enter the coordinates above or pick the point on the map/i);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId('coordinate-picker-map-mock')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /use my current location/i })).toBeEnabled();
  });

  it('says so when the browser has no geolocation at all', async () => {
    delete (navigator as { geolocation?: unknown }).geolocation;
    installGeolocation(undefined);
    render(<Host />);
    await clickLocate();

    expect(screen.getByRole('alert')).toHaveTextContent(/cannot share your location/i);
  });

  it('is disabled while the form submits', () => {
    render(<CoordinatePicker latitude="" longitude="" onChange={noop} disabled />);

    expect(screen.getByRole('button', { name: /use my current location/i })).toBeDisabled();
  });

  it('has no jest-axe violations with an error showing', async () => {
    const { container } = render(<Host />);
    await clickLocate();
    act(() => lastCallbacks().error({ code: 1 }));

    expect(await axe(container)).toHaveNoViolations();
  });
});
