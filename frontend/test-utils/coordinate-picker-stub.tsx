/**
 * Shared recording stub for `components/map/CoordinatePicker`.
 *
 * Both form suites (`ActorForm.test.tsx`, `RegistrationForm.test.tsx`) mock the
 * picker so neither pulls Leaflet into jsdom — jsdom has no layout engine, so a
 * real map there could only produce assertions that cannot fail.
 *
 * It lives here rather than being written twice because the two copies must
 * track `CoordinatePickerProps` in lockstep: a prop added to the real component
 * and to only one stub gives one suite silent blindness to it. The T-6 review
 * flagged exactly that divergence risk while the copies were still identical.
 *
 * The stub renders one button firing the single write path — `onChange(lat, lng)`
 * — so a test can simulate "the pin was placed" without a map.
 */
import React from 'react';

export interface CoordinatePickerStubProps {
  latitude: string;
  longitude: string;
  onChange: (lat: string, lng: string) => void;
  initiallyOpen?: boolean;
  disabled?: boolean;
  describedBy?: string;
}

/** The coordinates the stub's button writes. Arbitrary, but in range and distinct per axis. */
export const STUB_PLACED_LAT = '-6.5';
export const STUB_PLACED_LNG = '39.0';

/**
 * Builds the module shape `jest.mock` expects. Call it from inside the factory
 * via `require` — the factory is hoisted above imports, so a top-level import
 * of this helper would not be initialised in time.
 */
export function coordinatePickerStub(capture: (props: CoordinatePickerStubProps) => void) {
  return {
    __esModule: true,
    default: (props: CoordinatePickerStubProps) => {
      capture(props);
      return (
        <button
          type="button"
          aria-label="mock place pin"
          disabled={props.disabled}
          onClick={() => props.onChange(STUB_PLACED_LAT, STUB_PLACED_LNG)}
        >
          mock place pin
        </button>
      );
    },
  };
}
