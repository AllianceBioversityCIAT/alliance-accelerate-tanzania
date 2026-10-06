// @sdd-spec admin/actor-crud-audit (T-8)
// @sdd-spec enhancement/searchable-region-select (T-7)
/**
 * Unit tests for ActorForm.
 *
 * Covers:
 *   - create mode renders all form sections and required fields
 *   - client validation: required fields, email format, GPS bounds, capacity >= 0
 *   - edit mode prefills values from initialValues
 *   - AcknowledgeDialog gates submits that set consentStatus to GRANTED
 *   - server 400 field errors map inline via aria-describedby
 *   - (T-6) Trader ID has no input on create and is read-only on edit; the
 *     required set mirrors the shared intake contract (FR-1, NFR-1 frontend
 *     half); a 409 carrying `duplicateCandidates` opens
 *     `DuplicateConfirmDialog`, which resubmits the UNION of every id
 *     confirmed across however many 409 rounds occur (FR-3)
 *   - successful submit calls onSuccess
 *   - AuthFailureError triggers onAuthFailure
 *   - jest-axe clean in create mode and with the FR-3 inline errors shown (NFR-5)
 *   - (T-7) the Region field is the `SearchableSelect` primitive: `aria-invalid`
 *     present-when-errored/absent-when-clean, `aria-describedby` → `#<id>-error`,
 *     the required asterisk, `disabled` while `loading`, "Region is required."
 *     inline, and payload fidelity — every clause `tasks.md` T-7 owns for this
 *     field, named individually
 *   - (T-5) CoordinatePicker adoption: edit mode passes the actor's GPS
 *     coordinates and `initiallyOpen` through to the picker, and placing the
 *     pin (via the recording stub's `onChange`) resolves a half-filled
 *     latitude/longitude pair by writing both fields
 *
 * Region selection (T-7): mirrors RegistrationForm.test.tsx's T-4 rewrite.
 * `SearchableSelect` never commits from typing (FR-3) — `fireEvent.change` on
 * its input only edits the in-progress search text, never `values.region`.
 * Every place this file used to select a region via `fireEvent.change(...,
 * { target: { value: 'Iringa' } })` (the native-`<select>` shape) now drives
 * the real commit path with `@testing-library/user-event`: open the control,
 * then click the option. `selectRegion` centralizes it.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(),
}));

jest.mock('@/lib/api/actors-admin', () => ({
  createActor: jest.fn(),
  updateActor: jest.fn(),
}));

// T-11 — the create form embeds `ConsentDocumentField`, which asks the API
// whether uploads are configured. `uploadConsentDocument` is mocked ONLY so a
// test can assert the form never attempts an upload itself (the page does,
// after the actor exists).
jest.mock('@/lib/api/consent-requests-admin', () => ({
  ...jest.requireActual('@/lib/api/consent-requests-admin'),
  getConsentDocumentStatus: jest.fn(),
  uploadConsentDocument: jest.fn(),
}));

/**
 * Recording stub for CoordinatePicker (T-5), mirroring the mock shape
 * CoordinatePicker.test.tsx uses for its own Leaflet shell: capture every
 * props object the real component would have received, and expose a single
 * button that fires the ONE write path (`onChange(lat, lng)`) so a test can
 * simulate "the pin was placed" without ever pulling Leaflet into this suite.
 */
let receivedCoordinatePickerProps: CoordinatePickerStubProps | null = null;

jest.mock('@/components/map/CoordinatePicker', () =>
  require('@/test-utils/coordinate-picker-stub').coordinatePickerStub(
    (props: CoordinatePickerStubProps) => {
      receivedCoordinatePickerProps = props;
    },
  ),
);

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import React from 'react';
import type { CoordinatePickerStubProps } from '@/test-utils/coordinate-picker-stub';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import ActorForm from './ActorForm';
import { FRONTEND_INTAKE_REQUIRED_FIELDS } from '@/lib/content/intake-required-fields';
import { createActor, updateActor } from '@/lib/api/actors-admin';
import { getConsentDocumentStatus, uploadConsentDocument } from '@/lib/api/consent-requests-admin';
import { ApiError, AuthFailureError } from '@/lib/api/client';
import type { AdminActor, AdminActorCreateResult, DuplicateCandidate } from '@/lib/api/actors-admin';

// Extend jest-dom expect with the jest-axe matcher (NFR-5).
expect.extend(toHaveNoViolations);

// ---------------------------------------------------------------------------
// Constants & fixtures
// ---------------------------------------------------------------------------

const TOKEN = 'test-access-token';

const ADMIN_ACTOR: AdminActor = {
  id: 'actor-cuid-001',
  traderId: 'T-001',
  traderName: 'Mbeya Seeds Ltd',
  region: 'Mbeya',
  district: 'Mbeya Urban',
  traderType: 'seed_company',
  sex: 'F',
  position: 'Manager',
  marketLocation: 'Mbeya Central Market',
  capacityTons: 500,
  technicalSupport: 'extension_officer',
  phone: '+255123456789',
  email: 'info@mbeyaseeds.example',
  contactPerson: 'Grace Mwangi',
  otherCrops: 'Sunflower',
  gpsLatitude: -8.9,
  gpsLongitude: 33.46,
  gpsAltitude: null,
  gpsAccuracy: null,
  consentStatus: 'UNKNOWN',
  // T-9 — the real-world default: every actor's provenance starts here.
  registrationSource: 'TEAM_MANAGED',
  consentMethod: 'NOT_RECORDED',
  consentObtainedAt: null,
  consentReference: null,
  crops: ['sorghum', 'common_bean'],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-06-01T00:00:00.000Z',
};

const ACKNOWLEDGEMENT_TEXT = 'I confirm consent is on file';

/** `createActor`'s 201 response envelope (T-6) — the created actor plus `duplicateWarnings`. */
const CREATE_RESULT: AdminActorCreateResult = {
  ...ADMIN_ACTOR,
  duplicateWarnings: [],
};

const STRONG_CANDIDATE: DuplicateCandidate = {
  actorId: 'actor-existing-001',
  traderId: 'TM-2026-0001',
  traderName: 'Kilimo Traders',
  matchedOn: ['email'],
};

const OTHER_STRONG_CANDIDATE: DuplicateCandidate = {
  actorId: 'actor-existing-002',
  traderId: 'TM-2026-0002',
  traderName: 'Songwe Agro',
  matchedOn: ['phone'],
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function renderForm(props: Partial<React.ComponentProps<typeof ActorForm>> = {}) {
  const onSuccess = jest.fn();
  const onAuthFailure = jest.fn();
  const result = render(
    <ActorForm
      mode="create"
      token={TOKEN}
      onSuccess={onSuccess}
      onAuthFailure={onAuthFailure}
      {...props}
    />,
  );
  return { ...result, onSuccess, onAuthFailure };
}

/**
 * Commits a region on the `SearchableSelect` combobox (T-7) via the real
 * pointer-commit path — open, then click the option — never
 * `fireEvent.change`, which only edits the in-progress search text and
 * never reaches `onChange` (FR-3). Mirrors RegistrationForm.test.tsx's T-4
 * `selectRegion` helper.
 */
async function selectRegion(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByLabelText(/^region/i));
  await user.click(screen.getByRole('option', { name: label }));
}

/**
 * Fills every field the shared intake contract requires (FR-1), plus the
 * pre-existing identity fields — so tests that are not themselves about the
 * required set can submit successfully. T-6: Trader ID is no longer one of
 * these fields (there is no input for it in create mode, FR-2).
 */
async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.change(screen.getByLabelText(/trader name/i), { target: { value: 'Iringa Cooperative' } });
  await selectRegion(user, 'Iringa');
  fireEvent.change(screen.getByLabelText(/trader type/i), { target: { value: 'cooperative' } });
  fireEvent.change(screen.getByLabelText(/consent status/i), { target: { value: 'UNKNOWN' } });
  fireEvent.change(screen.getByLabelText(/contact person/i), { target: { value: 'Asha Mwinyi' } });
  fireEvent.click(screen.getByLabelText('Sorghum'));
  fireEvent.change(screen.getByLabelText(/capacity/i), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '+255700000000' } });
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'asha@example.com' } });
}

function submitForm() {
  fireEvent.click(screen.getByRole('button', { name: /create actor|save changes/i }));
}

/**
 * T-9 — selects GRANTED plus the minimum provenance the FR-3 client guard
 * requires, so tests that exercise the (unrelated) AcknowledgeDialog gating
 * reach the dialog rather than being blocked by the new inline validation.
 */
function grantConsentWithProvenance() {
  fireEvent.change(screen.getByLabelText(/consent status/i), { target: { value: 'GRANTED' } });
  fireEvent.change(screen.getByLabelText(/consent method/i), { target: { value: 'SIGNED_FORM' } });
  fireEvent.change(screen.getByLabelText(/consent obtained/i), { target: { value: '2026-01-15' } });
}

function getFieldError(name: RegExp) {
  const input = screen.getByLabelText(name) as HTMLElement;
  if (!input) return null;
  const describedBy = input.getAttribute('aria-describedby');
  if (!describedBy) return null;
  return document.getElementById(describedBy);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.resetAllMocks();
  receivedCoordinatePickerProps = null;
  jest.mocked(getConsentDocumentStatus).mockResolvedValue({ enabled: true });
  process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('ActorForm — rendering', () => {
  it('renders create mode with all sections', () => {
    renderForm();

    expect(screen.getByText('Identity')).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.getByText('Capacity & support')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(screen.getByText('Crops')).toBeInTheDocument();
    expect(screen.getByText('Consent & provenance')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Create actor' })).toBeInTheDocument();
  });

  it('renders edit mode with Save changes and prefills values', () => {
    renderForm({ mode: 'edit', initialValues: ADMIN_ACTOR });

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();

    expect(screen.getByLabelText(/trader id/i)).toHaveValue(ADMIN_ACTOR.traderId);
    expect(screen.getByLabelText(/trader name/i)).toHaveValue(ADMIN_ACTOR.traderName);
    expect(screen.getByLabelText(/region/i)).toHaveValue(ADMIN_ACTOR.region);
    expect(screen.getByLabelText(/trader type/i)).toHaveValue(ADMIN_ACTOR.traderType);
    expect(screen.getByLabelText(/sex/i)).toHaveValue(ADMIN_ACTOR.sex);
    expect(screen.getByLabelText(/position/i)).toHaveValue(ADMIN_ACTOR.position);
    expect(screen.getByLabelText(/district/i)).toHaveValue(ADMIN_ACTOR.district);
    expect(screen.getByLabelText(/market location/i)).toHaveValue(ADMIN_ACTOR.marketLocation);
    expect(screen.getByLabelText(/gps latitude/i)).toHaveValue(ADMIN_ACTOR.gpsLatitude);
    expect(screen.getByLabelText(/gps longitude/i)).toHaveValue(ADMIN_ACTOR.gpsLongitude);
    expect(screen.getByLabelText(/capacity/i)).toHaveValue(ADMIN_ACTOR.capacityTons);
    expect(screen.getByLabelText(/technical support/i)).toHaveValue(ADMIN_ACTOR.technicalSupport);
    expect(screen.getByLabelText(/phone/i)).toHaveValue(ADMIN_ACTOR.phone);
    expect(screen.getByLabelText(/email/i)).toHaveValue(ADMIN_ACTOR.email);
    expect(screen.getByLabelText(/contact person/i)).toHaveValue(ADMIN_ACTOR.contactPerson);
    expect(screen.getByLabelText(/other crop/i)).toHaveValue(ADMIN_ACTOR.otherCrops);
    expect(screen.getByLabelText(/consent status/i)).toHaveValue(ADMIN_ACTOR.consentStatus);
    expect(screen.getByLabelText(/registration source/i)).toHaveValue(ADMIN_ACTOR.registrationSource);
    expect(screen.getByLabelText(/consent method/i)).toHaveValue(ADMIN_ACTOR.consentMethod);
    expect(screen.getByLabelText(/consent obtained/i)).toHaveValue('');
    expect(screen.getByLabelText(/consent reference/i)).toHaveValue('');

    expect(screen.getByLabelText('Sorghum')).toBeChecked();
    expect(screen.getByLabelText('Common bean')).toBeChecked();
    expect(screen.getByLabelText('Groundnut')).not.toBeChecked();
  });
});

// ---------------------------------------------------------------------------
// Client validation
// ---------------------------------------------------------------------------

describe('ActorForm — client validation', () => {
  it('shows required-field errors when submitting an empty create form', () => {
    renderForm();
    submitForm();

    expect(getFieldError(/trader name/i)?.textContent).toMatch(/required/i);
    expect(getFieldError(/region/i)?.textContent).toMatch(/required/i);
    expect(getFieldError(/trader type/i)?.textContent).toMatch(/required/i);
    expect(getFieldError(/consent status/i)?.textContent).toMatch(/required/i);
  });

  it('rejects invalid email format', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'not-an-email' } });
    submitForm();

    expect(getFieldError(/email/i)?.textContent).toMatch(/valid email/i);
    expect(createActor).not.toHaveBeenCalled();
  });

  it('rejects GPS latitude outside [-90, 90]', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);
    fireEvent.change(screen.getByLabelText(/gps latitude/i), { target: { value: '95' } });
    submitForm();

    expect(getFieldError(/gps latitude/i)?.textContent).toMatch(/-90 and 90/i);
    expect(createActor).not.toHaveBeenCalled();
  });

  it('rejects GPS longitude outside [-180, 180]', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);
    fireEvent.change(screen.getByLabelText(/gps longitude/i), { target: { value: '-200' } });
    submitForm();

    expect(getFieldError(/gps longitude/i)?.textContent).toMatch(/-180 and 180/i);
    expect(createActor).not.toHaveBeenCalled();
  });

  it('rejects negative capacity', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);
    fireEvent.change(screen.getByLabelText(/capacity/i), { target: { value: '-10' } });
    submitForm();

    expect(getFieldError(/capacity/i)?.textContent).toMatch(/0 or greater/i);
    expect(createActor).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Required intake set (T-6, FR-1, NFR-1 frontend half)
//
// `FRONTEND_INTAKE_REQUIRED_FIELDS` is a DELIBERATE fourth copy of the
// backend's `intake-contract.ts` `INTAKE_REQUIRED_FIELDS` (DD-1) — the
// frontend cannot import the backend module. `validate()` drives its
// required-presence checks from this constant (one entry = one loop
// iteration), so the two things below are what actually discriminate
// falsifier 5: this test pins the constant's contents against the backend's
// literal list, and the per-field "left blank" tests below pin what
// `validate()` does with it. Removing `'phone'` from the constant reddens
// BOTH: this test (the literal no longer matches) and "rejects a create
// with Phone left blank" (the loop no longer checks it). A required check
// that bypasses the constant would need a new branch — validate() currently
// has no other required-presence branch for these five fields.
// ---------------------------------------------------------------------------

describe('ActorForm — required intake set (T-6, FR-1, NFR-1 frontend half)', () => {
  it('declares exactly the same required set as the backend intake contract', () => {
    // Transcribed from backend/src/common/intake-contract.ts's
    // INTAKE_REQUIRED_FIELDS — NOT imported (the frontend cannot import
    // backend code), so this literal is one half of the pin and
    // FRONTEND_INTAKE_REQUIRED_FIELDS (lib/content/intake-required-fields.ts)
    // is the other: both halves must be edited together, or this test
    // reddens.
    expect(FRONTEND_INTAKE_REQUIRED_FIELDS).toEqual([
      'contactPerson',
      'crops',
      'capacityTons',
      'phone',
      'email',
    ]);
  });

  it('rejects a create with every OTHER required field filled but Contact person blank', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);
    fireEvent.change(screen.getByLabelText(/contact person/i), { target: { value: '' } });
    submitForm();

    expect(getFieldError(/contact person/i)?.textContent).toMatch(/required/i);
    expect(createActor).not.toHaveBeenCalled();
  });

  it('rejects a create with no crop selected, even when Other crop(s) is filled (FR-1 "otherCrops alone")', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);
    // Undo the one crop fillRequiredFields ticked, then fill otherCrops only.
    fireEvent.click(screen.getByLabelText('Sorghum'));
    fireEvent.change(screen.getByLabelText(/other crop/i), { target: { value: 'Sesame' } });
    submitForm();

    expect(screen.getByText('Select at least one crop.')).toBeInTheDocument();
    expect(createActor).not.toHaveBeenCalled();
  });

  it('rejects a create with Capacity left blank', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);
    fireEvent.change(screen.getByLabelText(/capacity/i), { target: { value: '' } });
    submitForm();

    expect(getFieldError(/capacity/i)?.textContent).toMatch(/required/i);
    expect(createActor).not.toHaveBeenCalled();
  });

  it('rejects a create with Phone left blank', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '' } });
    submitForm();

    expect(getFieldError(/phone/i)?.textContent).toMatch(/required/i);
    expect(createActor).not.toHaveBeenCalled();
  });

  it('rejects a create with Email left blank', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: '' } });
    submitForm();

    expect(getFieldError(/email/i)?.textContent).toMatch(/required/i);
    expect(createActor).not.toHaveBeenCalled();
  });

  it('accepts a capacity of exactly 0 (FR-1 "capacity of zero")', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockResolvedValue(CREATE_RESULT);
    renderForm();
    await fillRequiredFields(user);
    fireEvent.change(screen.getByLabelText(/capacity/i), { target: { value: '0' } });
    submitForm();

    await waitFor(() => expect(createActor).toHaveBeenCalledTimes(1));
    expect(getFieldError(/capacity/i)).toBeNull();
  });

  it('enforces the same bounds as self-registration (Trader name > 200, Contact person > 120, Phone > 40, Email > 191)', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);
    fireEvent.change(screen.getByLabelText(/trader name/i), { target: { value: 'A'.repeat(201) } });
    fireEvent.change(screen.getByLabelText(/contact person/i), { target: { value: 'B'.repeat(121) } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '1'.repeat(41) } });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: `${'a'.repeat(187)}@b.co` }, // 192 chars, over the 191 bound
    });
    submitForm();

    expect(getFieldError(/trader name/i)?.textContent).toMatch(/200 characters or fewer/i);
    expect(getFieldError(/contact person/i)?.textContent).toMatch(/120 characters or fewer/i);
    expect(getFieldError(/phone/i)?.textContent).toMatch(/40 characters or fewer/i);
    expect(getFieldError(/email/i)?.textContent).toMatch(/191 characters or fewer/i);
    expect(createActor).not.toHaveBeenCalled();
  });

  // W-1 — the required-set loop in `validate()` runs identically in edit
  // mode (FR-1's edit scenario): it is not gated on `mode === 'create'`.
  it('rejects an edit with Email cleared, same as a create', () => {
    renderForm({ mode: 'edit', initialValues: ADMIN_ACTOR });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: '' } });
    submitForm();

    expect(getFieldError(/email/i)?.textContent).toMatch(/required/i);
    expect(updateActor).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Trader ID (T-6, FR-2) — system-generated: no input on create, read-only on
// edit. Falsifier 3: rendering the input in create mode reddens the first
// test below.
// ---------------------------------------------------------------------------

describe('ActorForm — Trader ID (T-6, FR-2)', () => {
  it('renders no Trader ID input in create mode', () => {
    renderForm();
    expect(screen.queryByLabelText(/trader id/i)).not.toBeInTheDocument();
  });

  it('shows the Trader ID read-only (disabled) in edit mode, prefilled from the actor', () => {
    renderForm({ mode: 'edit', initialValues: ADMIN_ACTOR });

    const traderIdInput = screen.getByLabelText(/trader id/i);
    expect(traderIdInput).toHaveValue(ADMIN_ACTOR.traderId);
    expect(traderIdInput).toBeDisabled();
    expect(traderIdInput).toHaveAttribute('readonly');
  });

  it('never sends traderId in the create or update payload', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockResolvedValue(CREATE_RESULT);
    renderForm();
    await fillRequiredFields(user);
    submitForm();

    await waitFor(() => expect(createActor).toHaveBeenCalledTimes(1));
    expect(jest.mocked(createActor).mock.calls[0][0]).not.toHaveProperty('traderId');
  });
});

// ---------------------------------------------------------------------------
// CoordinatePicker adoption (T-5, FR-1 sc. 3, FR-2 sc. 1, FR-5)
// ---------------------------------------------------------------------------

describe('ActorForm — CoordinatePicker adoption (T-5)', () => {
  it('FR-2 sc.1: opening an actor with coordinates passes them to the picker', () => {
    renderForm({ mode: 'edit', initialValues: ADMIN_ACTOR });

    expect(receivedCoordinatePickerProps).not.toBeNull();
    expect(receivedCoordinatePickerProps!.latitude).toBe(String(ADMIN_ACTOR.gpsLatitude));
    expect(receivedCoordinatePickerProps!.longitude).toBe(String(ADMIN_ACTOR.gpsLongitude));
    expect(receivedCoordinatePickerProps!.initiallyOpen).toBe(true);
  });

  it('FR-1 sc.3: placing the pin resolves a half-filled pair (latitude set, longitude blank) by writing both fields', async () => {
    const HALF_FILLED_ACTOR: AdminActor = {
      ...ADMIN_ACTOR,
      gpsLatitude: -8.9,
      gpsLongitude: null,
    };
    renderForm({ mode: 'edit', initialValues: HALF_FILLED_ACTOR });

    // A latitude-only pair is a legal ActorForm state (C-2) — confirm it
    // renders that way before the picker resolves it.
    expect(screen.getByLabelText(/gps latitude/i)).toHaveValue(-8.9);
    expect(screen.getByLabelText(/gps longitude/i)).toHaveValue(null);

    fireEvent.click(screen.getByRole('button', { name: /mock place pin/i }));

    expect(screen.getByLabelText(/gps latitude/i)).toHaveValue(-6.5);
    expect(screen.getByLabelText(/gps longitude/i)).toHaveValue(39.0);
  });

  it('FR-5: the latitude/longitude GPS inputs are still present, labelled, and independently validated', async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.getByLabelText(/gps latitude/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/gps longitude/i)).toBeInTheDocument();

    // Existing range validation (FR-5 sc. 2) still fires unchanged — a
    // latitude-only submission is valid here (C-2), so only the
    // out-of-range case is exercised (the in-range cases are covered above).
    await fillRequiredFields(user);
    fireEvent.change(screen.getByLabelText(/gps latitude/i), { target: { value: '95' } });
    submitForm();

    expect(getFieldError(/gps latitude/i)?.textContent).toMatch(/-90 and 90/i);
    expect(createActor).not.toHaveBeenCalled();
  });

  // D-19 (2026-10-05) — GPS altitude/accuracy removed from the admin form on
  // both create and edit. Falsifier: re-add either input and this redlines.
  it('D-19: GPS altitude/accuracy inputs are not rendered on create', () => {
    renderForm({ mode: 'create' });

    expect(screen.queryByLabelText(/gps altitude/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/gps accuracy/i)).not.toBeInTheDocument();
  });

  it('D-19: GPS altitude/accuracy inputs are not rendered on edit', () => {
    renderForm({ mode: 'edit', initialValues: ADMIN_ACTOR });

    expect(screen.queryByLabelText(/gps altitude/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/gps accuracy/i)).not.toBeInTheDocument();
  });

  it('D-19: editing an actor with stored GPS altitude/accuracy sends a PATCH payload with neither key (an omitted key preserves the stored value; null would wipe it)', async () => {
    const actorWithGpsExtras: AdminActor = {
      ...ADMIN_ACTOR,
      gpsAltitude: 1400,
      gpsAccuracy: 5,
    };
    jest.mocked(updateActor).mockResolvedValue(actorWithGpsExtras);
    renderForm({ mode: 'edit', initialValues: actorWithGpsExtras });

    submitForm();

    await waitFor(() => expect(updateActor).toHaveBeenCalledTimes(1));
    const [, dto] = jest.mocked(updateActor).mock.calls[0];
    expect(dto).not.toHaveProperty('gpsAltitude');
    expect(dto).not.toHaveProperty('gpsAccuracy');
  });
});

// ---------------------------------------------------------------------------
// Acknowledgement gating
// ---------------------------------------------------------------------------

describe('ActorForm — consent acknowledgement gating', () => {
  it('opens AcknowledgeDialog and sends acknowledged: true when creating with GRANTED', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockResolvedValue(CREATE_RESULT);
    renderForm();

    await fillRequiredFields(user);
    grantConsentWithProvenance();
    submitForm();

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/publish this actor/i)).toBeInTheDocument();

    const input = within(dialog).getByLabelText(/type .* to confirm/i);
    fireEvent.change(input, { target: { value: ACKNOWLEDGEMENT_TEXT } });
    fireEvent.click(within(dialog).getByRole('button', { name: /grant consent/i }));

    await waitFor(() => expect(createActor).toHaveBeenCalledTimes(1));

    const dto = jest.mocked(createActor).mock.calls[0][0];
    expect(dto.consentStatus).toBe('GRANTED');
    expect(dto.acknowledged).toBe(true);
  });

  it('does not submit when GRANTED acknowledgement is cancelled', async () => {
    const user = userEvent.setup();
    renderForm();

    await fillRequiredFields(user);
    grantConsentWithProvenance();
    submitForm();

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createActor).not.toHaveBeenCalled();
  });

  it('gates GRANTED transitions in edit mode when initial status is not GRANTED', async () => {
    jest.mocked(updateActor).mockResolvedValue({ ...ADMIN_ACTOR, consentStatus: 'GRANTED' });
    renderForm({ mode: 'edit', initialValues: ADMIN_ACTOR });

    grantConsentWithProvenance();
    submitForm();

    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText(/type .* to confirm/i);
    fireEvent.change(input, { target: { value: ACKNOWLEDGEMENT_TEXT } });
    fireEvent.click(within(dialog).getByRole('button', { name: /grant consent/i }));

    await waitFor(() => expect(updateActor).toHaveBeenCalledTimes(1));

    const [, dto] = jest.mocked(updateActor).mock.calls[0];
    expect(dto.consentStatus).toBe('GRANTED');
    expect(dto.acknowledged).toBe(true);
  });

  it('does not gate edit submits that leave consent as GRANTED', async () => {
    const grantedActor = { ...ADMIN_ACTOR, consentStatus: 'GRANTED' as const };
    jest.mocked(updateActor).mockResolvedValue(grantedActor);
    renderForm({ mode: 'edit', initialValues: grantedActor });

    fireEvent.change(screen.getByLabelText(/trader name/i), { target: { value: 'New Name' } });
    submitForm();

    await waitFor(() => expect(updateActor).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(jest.mocked(updateActor).mock.calls[0][1].acknowledged).toBeUndefined();
  });

  // T-10 (registration-source-and-consent, design.md §5) — the single-actor
  // call site already collects method/date via the form's own "Consent &
  // provenance" fieldset (T-9), so it omits AcknowledgeDialog's opt-in
  // `provenance` prop and must render no duplicate method/date inputs.
  it('T-10: renders no consent-method or consent-date inputs on the acknowledge dialog', async () => {
    const user = userEvent.setup();
    renderForm();

    await fillRequiredFields(user);
    grantConsentWithProvenance();
    submitForm();

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText(/consent method/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/consent obtained on/i)).not.toBeInTheDocument();
  });

  it('does not gate submits with consent DENIED or UNKNOWN', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockResolvedValue(CREATE_RESULT);
    renderForm();

    await fillRequiredFields(user);
    fireEvent.change(screen.getByLabelText(/consent status/i), { target: { value: 'DENIED' } });
    submitForm();

    await waitFor(() => expect(createActor).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(jest.mocked(createActor).mock.calls[0][0].acknowledged).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Consent & provenance fieldset (T-9, FR-2/FR-3) — client guard is UX only;
// the server's independent rejection (T-3) is not re-tested here.
// ---------------------------------------------------------------------------

describe('ActorForm — consent & provenance fieldset', () => {
  it('prefills consent method, date, and reference from an existing actor, converting the stored instant back to a Tanzania calendar date', () => {
    // Stored as Tanzania midnight (2026-01-01T00:00+03:00), which is UTC
    // 2025-12-31T21:00:00.000Z. A naive slice of the UTC string would read
    // back "2025-12-31" — one day off. This is the exact round-trip the
    // date-only<->instant conversion exists to get right.
    const actorWithProvenance: AdminActor = {
      ...ADMIN_ACTOR,
      consentMethod: 'SIGNED_FORM',
      consentObtainedAt: '2025-12-31T21:00:00.000Z',
      consentReference: 'doc-123',
    };
    renderForm({ mode: 'edit', initialValues: actorWithProvenance });

    expect(screen.getByLabelText(/consent method/i)).toHaveValue('SIGNED_FORM');
    expect(screen.getByLabelText(/consent obtained/i)).toHaveValue('2026-01-01');
    expect(screen.getByLabelText(/consent reference/i)).toHaveValue('doc-123');
  });

  it('blocks submit and surfaces field-level, aria-described, live-region errors when GRANTED is selected with no method or date', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);
    fireEvent.change(screen.getByLabelText(/consent status/i), { target: { value: 'GRANTED' } });
    submitForm();

    const methodInput = screen.getByLabelText(/consent method/i);
    const dateInput = screen.getByLabelText(/consent obtained/i);
    const methodError = getFieldError(/consent method/i);
    const dateError = getFieldError(/consent obtained/i);

    expect(methodError?.textContent).toMatch(/select how consent was obtained/i);
    expect(dateError?.textContent).toMatch(/enter the date/i);
    // aria-describedby binding, both directions.
    expect(methodInput.getAttribute('aria-describedby')).toBe(methodError?.id);
    expect(dateInput.getAttribute('aria-describedby')).toBe(dateError?.id);
    // Live-region announcement — same mechanism as every other field error in this form.
    expect(methodError).toHaveAttribute('role', 'alert');
    expect(dateError).toHaveAttribute('role', 'alert');

    expect(createActor).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('requires only the missing field when just one of method/date is absent', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);
    fireEvent.change(screen.getByLabelText(/consent status/i), { target: { value: 'GRANTED' } });
    fireEvent.change(screen.getByLabelText(/consent method/i), { target: { value: 'EMAIL' } });
    submitForm();

    expect(getFieldError(/consent method/i)).toBeNull();
    expect(getFieldError(/consent obtained/i)?.textContent).toMatch(/enter the date/i);
    expect(createActor).not.toHaveBeenCalled();
  });

  it('allows a GRANTED submission once method and date are supplied, sending a full RFC-3339 instant anchored at Tanzania midnight', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockResolvedValue(CREATE_RESULT);
    renderForm();

    await fillRequiredFields(user);
    fireEvent.change(screen.getByLabelText(/consent status/i), { target: { value: 'GRANTED' } });
    fireEvent.change(screen.getByLabelText(/consent method/i), { target: { value: 'SIGNED_FORM' } });
    fireEvent.change(screen.getByLabelText(/consent obtained/i), { target: { value: '2026-01-15' } });
    submitForm();

    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText(/type .* to confirm/i);
    fireEvent.change(input, { target: { value: ACKNOWLEDGEMENT_TEXT } });
    fireEvent.click(within(dialog).getByRole('button', { name: /grant consent/i }));

    await waitFor(() => expect(createActor).toHaveBeenCalledTimes(1));
    const dto = jest.mocked(createActor).mock.calls[0][0];
    expect(dto.consentMethod).toBe('SIGNED_FORM');
    expect(dto.consentObtainedAt).toBe('2026-01-15T00:00:00+03:00');
  });

  it('saves a legacy GRANTED + NOT_RECORDED actor after editing an unrelated field — the guard must not fire merely because the actor is already GRANTED', async () => {
    const legacyActor: AdminActor = {
      ...ADMIN_ACTOR,
      consentStatus: 'GRANTED',
      consentMethod: 'NOT_RECORDED',
      consentObtainedAt: null,
      consentReference: null,
    };
    jest.mocked(updateActor).mockResolvedValue(legacyActor);
    renderForm({ mode: 'edit', initialValues: legacyActor });

    fireEvent.change(screen.getByLabelText(/district/i), { target: { value: 'Mbeya Rural' } });
    submitForm();

    await waitFor(() => expect(updateActor).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getFieldError(/consent method/i)).toBeNull();
    expect(getFieldError(/consent obtained/i)).toBeNull();

    // C-3/E-1 idiom: the untouched null provenance round-trips as null, never ''.
    const [, dto] = jest.mocked(updateActor).mock.calls[0];
    expect(dto.consentMethod).toBe('NOT_RECORDED');
    expect(dto.consentObtainedAt).toBeNull();
    expect(dto.consentReference).toBeNull();
  });

  it('resends an untouched consentObtainedAt verbatim, byte-identical, preserving a stored time-of-day', async () => {
    // T-9 rework (conformance Issue 1): `isSameValue`
    // (consent-provenance.policy.ts) compares Date.toISOString() strings, so
    // rebuilding this date through dateOnlyToInstant would rewrite a stored
    // time-of-day to Tanzania midnight and register as a phantom change on
    // an edit that never touched consent. The actor here is stored with a
    // real time-of-day, not the Tanzania-midnight anchor a form save would
    // produce — the fix must resend the stored instant untouched.
    const actorWithTimeOfDay: AdminActor = {
      ...ADMIN_ACTOR,
      consentStatus: 'GRANTED',
      consentMethod: 'SIGNED_FORM',
      consentObtainedAt: '2026-01-15T10:30:00.000Z',
      consentReference: 'doc-999',
    };
    jest.mocked(updateActor).mockResolvedValue(actorWithTimeOfDay);
    renderForm({ mode: 'edit', initialValues: actorWithTimeOfDay });

    // Edit an unrelated field only — consent method/date/reference are left alone.
    fireEvent.change(screen.getByLabelText(/district/i), { target: { value: 'Mbeya Rural' } });
    submitForm();

    await waitFor(() => expect(updateActor).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const [, dto] = jest.mocked(updateActor).mock.calls[0];
    expect(dto.consentObtainedAt).toBe('2026-01-15T10:30:00.000Z');
  });

  it('builds a fresh Tanzania-midnight instant when the admin actually changes an untouched date', async () => {
    // Contrast case for the test above: once the date field itself changes,
    // the verbatim-resend path must NOT apply — a genuinely new date still
    // goes through dateOnlyToInstant.
    const actorWithTimeOfDay: AdminActor = {
      ...ADMIN_ACTOR,
      consentStatus: 'GRANTED',
      consentMethod: 'SIGNED_FORM',
      consentObtainedAt: '2026-01-15T10:30:00.000Z',
      consentReference: 'doc-999',
    };
    jest.mocked(updateActor).mockResolvedValue(actorWithTimeOfDay);
    renderForm({ mode: 'edit', initialValues: actorWithTimeOfDay });

    fireEvent.change(screen.getByLabelText(/consent obtained/i), { target: { value: '2026-02-01' } });
    submitForm();

    await waitFor(() => expect(updateActor).toHaveBeenCalledTimes(1));

    const [, dto] = jest.mocked(updateActor).mock.calls[0];
    expect(dto.consentObtainedAt).toBe('2026-02-01T00:00:00+03:00');
  });
});

// ---------------------------------------------------------------------------
// Registration source (T-9, FR-6 closure) — the admin create/edit form must
// capture registrationSource in the Consent & provenance fieldset. Unlike the
// three consent fields, this enum is non-nullable with a schema default
// (TEAM_MANAGED) and is NOT a provenance field for the FR-3 guard.
// ---------------------------------------------------------------------------

describe('ActorForm — registration source (FR-6)', () => {
  it('renders the Registration source select inside the Consent & provenance fieldset with an associated label', () => {
    renderForm();

    const select = screen.getByLabelText(/registration source/i);
    expect(select).toBeInTheDocument();
    expect(select.tagName).toBe('SELECT');

    const fieldset = select.closest('fieldset');
    expect(fieldset).not.toBeNull();
    expect(within(fieldset as HTMLElement).getByText('Consent & provenance')).toBeInTheDocument();
  });

  it('prefills Registration source from the actor\'s stored value in edit mode', () => {
    const selfRegisteredActor: AdminActor = {
      ...ADMIN_ACTOR,
      registrationSource: 'SELF_REGISTERED',
    };
    renderForm({ mode: 'edit', initialValues: selfRegisteredActor });

    expect(screen.getByLabelText(/registration source/i)).toHaveValue('SELF_REGISTERED');
  });

  it('round-trips a changed Registration source into the submitted DTO', async () => {
    jest.mocked(updateActor).mockResolvedValue(ADMIN_ACTOR);
    renderForm({ mode: 'edit', initialValues: ADMIN_ACTOR });

    fireEvent.change(screen.getByLabelText(/registration source/i), {
      target: { value: 'SELF_REGISTERED' },
    });
    submitForm();

    await waitFor(() => expect(updateActor).toHaveBeenCalledTimes(1));
    const [, dto] = jest.mocked(updateActor).mock.calls[0];
    expect(dto.registrationSource).toBe('SELF_REGISTERED');
  });

  it('sends registrationSource explicitly as TEAM_MANAGED when a new actor is created without changing the default', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockResolvedValue(CREATE_RESULT);
    renderForm();

    await fillRequiredFields(user);
    submitForm();

    await waitFor(() => expect(createActor).toHaveBeenCalledTimes(1));
    const dto = jest.mocked(createActor).mock.calls[0][0];
    expect(dto.registrationSource).toBe('TEAM_MANAGED');
  });

  it('does not affect the FR-3 provenance guard — changing Registration source alone on a legacy GRANTED actor does not require a consent method/date', async () => {
    const legacyActor: AdminActor = {
      ...ADMIN_ACTOR,
      consentStatus: 'GRANTED',
      consentMethod: 'NOT_RECORDED',
      consentObtainedAt: null,
      consentReference: null,
    };
    jest.mocked(updateActor).mockResolvedValue(legacyActor);
    renderForm({ mode: 'edit', initialValues: legacyActor });

    fireEvent.change(screen.getByLabelText(/registration source/i), {
      target: { value: 'SELF_REGISTERED' },
    });
    submitForm();

    await waitFor(() => expect(updateActor).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getFieldError(/consent method/i)).toBeNull();
    expect(getFieldError(/consent obtained/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Contact person & other crops (`actors/public-profile-disclosure` T-2, FR-4)
//
// Populated round-trips only — a `null` default proves nothing (T-2's
// Disqualifier): each test sets a NON-EMPTY value and reads it back, either
// from the prefilled edit-mode input or from the submitted DTO.
// ---------------------------------------------------------------------------

describe('ActorForm — contact person and other crops (FR-4)', () => {
  it('prefills Contact person and Other crop(s) from an existing actor in edit mode', () => {
    renderForm({ mode: 'edit', initialValues: ADMIN_ACTOR });

    expect(screen.getByLabelText(/contact person/i)).toHaveValue(ADMIN_ACTOR.contactPerson);
    expect(screen.getByLabelText(/other crop/i)).toHaveValue(ADMIN_ACTOR.otherCrops);
  });

  it('round-trips a non-empty Contact person and Other crop(s) into the create payload', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockResolvedValue(CREATE_RESULT);
    renderForm();

    await fillRequiredFields(user);
    fireEvent.change(screen.getByLabelText(/contact person/i), {
      target: { value: 'Neema Shirima' },
    });
    fireEvent.change(screen.getByLabelText(/other crop/i), {
      target: { value: 'Sesame' },
    });
    submitForm();

    await waitFor(() => expect(createActor).toHaveBeenCalledTimes(1));
    const dto = jest.mocked(createActor).mock.calls[0][0];
    expect(dto.contactPerson).toBe('Neema Shirima');
    expect(dto.otherCrops).toBe('Sesame');
  });

  it('round-trips an edited Contact person and Other crop(s) into the update payload', async () => {
    jest.mocked(updateActor).mockResolvedValue(ADMIN_ACTOR);
    renderForm({ mode: 'edit', initialValues: ADMIN_ACTOR });

    fireEvent.change(screen.getByLabelText(/contact person/i), {
      target: { value: 'Amina Hassan' },
    });
    fireEvent.change(screen.getByLabelText(/other crop/i), {
      target: { value: 'Cassava' },
    });
    submitForm();

    await waitFor(() => expect(updateActor).toHaveBeenCalledTimes(1));
    const [, dto] = jest.mocked(updateActor).mock.calls[0];
    expect(dto.contactPerson).toBe('Amina Hassan');
    expect(dto.otherCrops).toBe('Cassava');
  });

  it('sends null, not empty string, when Other crop(s) is left blank (T-6: Contact person is now required, so it can no longer be blank — see the required-set block)', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockResolvedValue(CREATE_RESULT);
    renderForm();

    await fillRequiredFields(user);
    submitForm();

    await waitFor(() => expect(createActor).toHaveBeenCalledTimes(1));
    const dto = jest.mocked(createActor).mock.calls[0][0];
    expect(dto.otherCrops).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Region field — SearchableSelect adoption (T-7, design.md §5.6)
//
// Every clause `tasks.md` T-7 owns for this one field, named individually so
// none can be discharged by an adjacent green check (KZ-001): aria-invalid
// present/absent, aria-describedby, the required asterisk, disabled while
// loading, "Region is required." inline from the one errors record, and
// payload fidelity (committed value and only the committed value reaches
// the DTO). Mirrors RegistrationForm.test.tsx's T-4 Region field block.
// ---------------------------------------------------------------------------

describe('ActorForm — Region field (T-7, SearchableSelect adoption)', () => {
  it('aria-invalid is present ("true") on the region combobox once errored, and absent on a clean render', () => {
    renderForm();
    expect(screen.getByLabelText(/^region/i)).not.toHaveAttribute('aria-invalid');

    submitForm();
    expect(screen.getByLabelText(/^region/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('aria-describedby on the region combobox points at #<id>-error once errored, resolving to the inline message', () => {
    renderForm();
    submitForm();

    const region = screen.getByLabelText(/^region/i);
    const describedBy = region.getAttribute('aria-describedby');
    expect(describedBy).toBe(`${region.id}-error`);
    expect(document.getElementById(describedBy!)).toHaveTextContent('Region is required.');
  });

  it('the Region label carries the required asterisk', () => {
    renderForm();
    const region = screen.getByLabelText(/^region/i);
    const label = document.querySelector(`label[for="${region.id}"]`);
    expect(label).not.toBeNull();
    // Field renders `{label}{required && <span aria-hidden>*</span>}` with no
    // separating whitespace — the exact text every other required field's
    // label carries.
    expect(label).toHaveTextContent('Region*');
  });

  it('the region combobox is disabled while loading (mid-submit)', async () => {
    const user = userEvent.setup();
    // Never resolves — keeps `loading` true for the duration of this assertion.
    jest.mocked(createActor).mockReturnValue(new Promise(() => {}));
    renderForm();
    await fillRequiredFields(user);
    submitForm();

    await waitFor(() => expect(screen.getByLabelText(/^region/i)).toBeDisabled());
  });

  it('"Region is required." appears inline from the one errors record', () => {
    renderForm();
    submitForm();

    expect(getFieldError(/^region/i)?.textContent).toBe('Region is required.');
  });

  it('a region committed via the combobox flows unchanged into the create payload', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockResolvedValue(CREATE_RESULT);
    renderForm();

    await fillRequiredFields(user);
    submitForm();

    await waitFor(() => expect(createActor).toHaveBeenCalledTimes(1));
    const dto = jest.mocked(createActor).mock.calls[0][0];
    expect(dto.region).toBe('Iringa');
  });

  it('typed, uncommitted region text is never emitted to the payload — FR-3 preserved through the adoption', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockResolvedValue(CREATE_RESULT);
    renderForm();
    await fillRequiredFields(user);

    // Reopen the already-committed control, type a fragment that matches no
    // region, then abandon it without committing (FR-2's "abandoning a
    // partial search" — blur reverts, never emits).
    const region = screen.getByLabelText(/^region/i);
    await user.click(region);
    await user.keyboard('Zzz');
    await user.tab();

    submitForm();

    await waitFor(() => expect(createActor).toHaveBeenCalledTimes(1));
    const dto = jest.mocked(createActor).mock.calls[0][0];
    expect(dto.region).toBe('Iringa');
  });
});

// ---------------------------------------------------------------------------
// Accessibility (jest-axe, NFR-5)
// ---------------------------------------------------------------------------

describe('ActorForm — accessibility', () => {
  it('has no axe violations freshly rendered in create mode', async () => {
    const { container } = renderForm();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe violations once the FR-3 guard has produced inline errors', async () => {
    const user = userEvent.setup();
    const { container } = renderForm();
    await fillRequiredFields(user);
    fireEvent.change(screen.getByLabelText(/consent status/i), { target: { value: 'GRANTED' } });
    submitForm();

    // Confirm the guard actually fired before asserting a11y on that state.
    expect(getFieldError(/consent method/i)?.textContent).toMatch(/select how consent was obtained/i);
    expect(getFieldError(/consent obtained/i)?.textContent).toMatch(/enter the date/i);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------
// Server error mapping
// ---------------------------------------------------------------------------

describe('ActorForm — server error mapping', () => {
  it('a generic 409 (no duplicateCandidates) renders a top-level form error, not a traderId field error (P-13: mapApiError no longer assumes every 409 is a Trader ID collision)', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockRejectedValue(
      new ApiError(409, 'A conflicting record already exists'),
    );
    renderForm();

    await fillRequiredFields(user);
    submitForm();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('A conflicting record already exists'),
    );
    // There is no Trader ID field in create mode at all (FR-2) — this would
    // throw if the old 409→traderId mapping still existed.
    expect(screen.queryByLabelText(/trader id/i)).not.toBeInTheDocument();
  });

  it('maps 400 field errors inline via aria-describedby', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockRejectedValue(
      new ApiError(400, 'Validation failed', [
        { field: 'email', message: 'Email must be a valid email address' },
      ]),
    );
    renderForm();

    await fillRequiredFields(user);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'valid@example.com' } });
    submitForm();

    await waitFor(() =>
      expect(getFieldError(/email/i)?.textContent).toMatch(/valid email address/i),
    );
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('renders a top-level form error for non-field server errors', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockRejectedValue(new ApiError(500, 'Server error'));
    renderForm();

    await fillRequiredFields(user);
    submitForm();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Server error'));
  });

  it('calls onAuthFailure when the API returns 401', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockRejectedValue(new AuthFailureError());
    const { onAuthFailure } = renderForm();

    await fillRequiredFields(user);
    submitForm();

    await waitFor(() => expect(onAuthFailure).toHaveBeenCalledTimes(1));
  });
});

// ---------------------------------------------------------------------------
// Duplicate detection on admin create (T-6, FR-3)
//
// A 409 carrying `duplicateCandidates` opens DuplicateConfirmDialog instead
// of a field error. Confirming resubmits with `confirmedNotDuplicateOf`,
// accumulating the UNION of every candidate id confirmed across however many
// 409 rounds occur in this session (forward pointer, T-3 execution.md:
// confirm A, 409 names B, confirm B must resubmit {A, B} — never just the
// latest round, falsifier 2's mutation).
// ---------------------------------------------------------------------------

describe('ActorForm — duplicate detection (T-6, FR-3)', () => {
  it('opens DuplicateConfirmDialog on a 409 carrying duplicateCandidates (falsifier 1)', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockRejectedValue(
      new ApiError(409, 'Possible duplicate', undefined, {
        statusCode: 409,
        message: 'Possible duplicate',
        duplicateCandidates: [STRONG_CANDIDATE],
      }),
    );
    renderForm();

    await fillRequiredFields(user);
    submitForm();

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /possible duplicate/i })).toBeInTheDocument();
    expect(within(dialog).getByText(STRONG_CANDIDATE.traderName)).toBeInTheDocument();
    expect(within(dialog).getByText(STRONG_CANDIDATE.traderId)).toBeInTheDocument();
    // `getByText`'s default matcher only considers a node's OWN direct text
    // nodes, not descendant elements' text — the Trader ID and the matched
    // attribute each live in their own nested <span>, so each is asserted as
    // its own exact leaf match rather than one compound string.
    expect(within(dialog).getByText('email address')).toBeInTheDocument();
  });

  // W-8 (NFR-4) — the candidate count is announced to assistive tech, not
  // only shown visually.
  it('announces the candidate count via a polite live region (W-8)', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockRejectedValue(
      new ApiError(409, 'Possible duplicate', undefined, {
        statusCode: 409,
        message: 'Possible duplicate',
        duplicateCandidates: [STRONG_CANDIDATE],
      }),
    );
    renderForm();
    await fillRequiredFields(user);
    submitForm();

    const dialog = await screen.findByRole('dialog');
    const liveRegion = within(dialog).getByText(/1 possible duplicate found/i);
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
  });

  it('resubmits with confirmedNotDuplicateOf carrying the shown candidate\'s id when confirmed (falsifier 2)', async () => {
    const user = userEvent.setup();
    jest
      .mocked(createActor)
      .mockRejectedValueOnce(
        new ApiError(409, 'Possible duplicate', undefined, {
          statusCode: 409,
          message: 'Possible duplicate',
          duplicateCandidates: [STRONG_CANDIDATE],
        }),
      )
      .mockResolvedValueOnce(CREATE_RESULT);
    renderForm();

    await fillRequiredFields(user);
    submitForm();

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /not a duplicate/i }));

    await waitFor(() => expect(createActor).toHaveBeenCalledTimes(2));
    const secondDto = jest.mocked(createActor).mock.calls[1][0];
    expect(secondDto.confirmedNotDuplicateOf).toEqual([STRONG_CANDIDATE.actorId]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('accumulates the UNION across two 409 rounds: confirm A, 409 names B, confirm B resubmits {A, B} (falsifier 2 mutation — sending only the latest round must fail this)', async () => {
    const user = userEvent.setup();
    jest
      .mocked(createActor)
      .mockRejectedValueOnce(
        new ApiError(409, 'Possible duplicate', undefined, {
          statusCode: 409,
          message: 'Possible duplicate',
          duplicateCandidates: [STRONG_CANDIDATE],
        }),
      )
      .mockRejectedValueOnce(
        new ApiError(409, 'Possible duplicate', undefined, {
          statusCode: 409,
          message: 'Possible duplicate',
          duplicateCandidates: [OTHER_STRONG_CANDIDATE],
        }),
      )
      .mockResolvedValueOnce(CREATE_RESULT);
    renderForm();

    await fillRequiredFields(user);
    submitForm();

    // Round 1: confirm A (STRONG_CANDIDATE).
    const dialog1 = await screen.findByRole('dialog');
    expect(within(dialog1).getByText(STRONG_CANDIDATE.traderName)).toBeInTheDocument();
    fireEvent.click(within(dialog1).getByRole('button', { name: /not a duplicate/i }));

    // Round 2: the server now names B (OTHER_STRONG_CANDIDATE) — A is NOT
    // relisted (design.md DD-4: a 409 lists only the unconfirmed candidates).
    const dialog2 = await screen.findByRole('dialog');
    expect(within(dialog2).getByText(OTHER_STRONG_CANDIDATE.traderName)).toBeInTheDocument();
    expect(within(dialog2).queryByText(STRONG_CANDIDATE.traderName)).not.toBeInTheDocument();
    fireEvent.click(within(dialog2).getByRole('button', { name: /not a duplicate/i }));

    await waitFor(() => expect(createActor).toHaveBeenCalledTimes(3));
    const thirdDto = jest.mocked(createActor).mock.calls[2][0];
    expect(new Set(thirdDto.confirmedNotDuplicateOf)).toEqual(
      new Set([STRONG_CANDIDATE.actorId, OTHER_STRONG_CANDIDATE.actorId]),
    );
  });

  it('cancelling the dialog does not resubmit', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockRejectedValue(
      new ApiError(409, 'Possible duplicate', undefined, {
        statusCode: 409,
        message: 'Possible duplicate',
        duplicateCandidates: [STRONG_CANDIDATE],
      }),
    );
    renderForm();

    await fillRequiredFields(user);
    submitForm();

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createActor).toHaveBeenCalledTimes(1);
  });

  it('moves focus to a real button inside the dialog on open, not the panel (focus trap, falsifier 6)', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockRejectedValue(
      new ApiError(409, 'Possible duplicate', undefined, {
        statusCode: 409,
        message: 'Possible duplicate',
        duplicateCandidates: [STRONG_CANDIDATE],
      }),
    );
    renderForm();

    await fillRequiredFields(user);
    submitForm();

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
      expect(document.activeElement?.tagName).toBe('BUTTON');
    });
  });

  it('Shift+Tab from the first focusable button wraps to the last button inside the dialog (focus trap)', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockRejectedValue(
      new ApiError(409, 'Possible duplicate', undefined, {
        statusCode: 409,
        message: 'Possible duplicate',
        duplicateCandidates: [STRONG_CANDIDATE],
      }),
    );
    renderForm();

    await fillRequiredFields(user);
    submitForm();

    const dialog = await screen.findByRole('dialog');
    const buttons = within(dialog).getAllByRole('button');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];

    await waitFor(() => expect(document.activeElement).toBe(first));

    // Drive it through the hook's own handler, not native tab order (jsdom
    // doesn't implement tab navigation) — this is what actually wraps focus.
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });

    expect(document.activeElement).toBe(last);
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('Escape cancels the dialog without resubmitting (focus trap, falsifier 6)', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockRejectedValue(
      new ApiError(409, 'Possible duplicate', undefined, {
        statusCode: 409,
        message: 'Possible duplicate',
        duplicateCandidates: [STRONG_CANDIDATE],
      }),
    );
    renderForm();

    await fillRequiredFields(user);
    submitForm();

    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createActor).toHaveBeenCalledTimes(1);
  });

  it('a weak-only match (duplicateWarnings, no 409) creates normally and passes the full result, including duplicateWarnings, to onSuccess', async () => {
    const user = userEvent.setup();
    const weakResult: AdminActorCreateResult = {
      ...ADMIN_ACTOR,
      duplicateWarnings: [{ ...STRONG_CANDIDATE, matchedOn: ['traderName'] }],
    };
    jest.mocked(createActor).mockResolvedValue(weakResult);
    const { onSuccess } = renderForm();

    await fillRequiredFields(user);
    submitForm();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(weakResult, { documentFile: null }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Success flow
// ---------------------------------------------------------------------------

describe('ActorForm — success flow', () => {
  it('calls onSuccess after a successful create', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockResolvedValue(CREATE_RESULT);
    const { onSuccess } = renderForm();

    await fillRequiredFields(user);
    submitForm();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it('calls onSuccess when Cancel is clicked', () => {
    const { onSuccess } = renderForm();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});


// ---------------------------------------------------------------------------
// T-11 — EMAIL_LINK evidence, the select swap, and D-26 (design §5.7, §5.7a)
// ---------------------------------------------------------------------------

/** GRANTED through the emailed link: the actor's own act, evidence frozen (rule 3). */
const LINK_GRANTED_ACTOR: AdminActor = {
  ...ADMIN_ACTOR,
  consentStatus: 'GRANTED',
  consentMethod: 'EMAIL_LINK',
  consentObtainedAt: '2026-10-01T09:30:00.000Z',
  consentReference: 'req-123',
};

/** The link-era record after an admin set it to DENIED: method still EMAIL_LINK, evidence not frozen. */
const LINK_DENIED_ACTOR: AdminActor = { ...LINK_GRANTED_ACTOR, consentStatus: 'DENIED' };

describe('ActorForm — an EMAIL_LINK actor (FR-10, design §5.7)', () => {
  it('shows the method read-only as "Email link (actor)", with no select, and re-sends the stored value', async () => {
    jest.mocked(updateActor).mockResolvedValue(LINK_GRANTED_ACTOR);
    renderForm({ mode: 'edit', initialValues: LINK_GRANTED_ACTOR });

    const method = screen.getByLabelText('Consent method');
    expect(method).toHaveValue('Email link (actor)');
    expect(method).toHaveAttribute('readonly');
    expect(method.tagName).toBe('INPUT');

    submitForm();
    await waitFor(() => expect(updateActor).toHaveBeenCalledTimes(1));
    const [, dto] = jest.mocked(updateActor).mock.calls[0];
    expect(dto).toMatchObject({
      consentStatus: 'GRANTED',
      consentMethod: 'EMAIL_LINK',
      // Verbatim stored instant — never rebuilt through the Tanzania-midnight helper.
      consentObtainedAt: '2026-10-01T09:30:00.000Z',
      consentReference: 'req-123',
    });
  });

  it('renders the consent date and reference read-only while GRANTED by link (frozen evidence, rule 3)', () => {
    renderForm({ mode: 'edit', initialValues: LINK_GRANTED_ACTOR });

    expect(screen.getByLabelText('Consent obtained on')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Consent obtained on')).toHaveValue('2026-10-01');
    expect(screen.getByLabelText('Consent reference')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Consent reference')).toHaveValue('req-123');
  });

  it('swaps back to an EMPTY assertable select, without EMAIL_LINK, when the status changes', () => {
    renderForm({ mode: 'edit', initialValues: LINK_GRANTED_ACTOR });

    fireEvent.change(screen.getByLabelText(/consent status/i), { target: { value: 'DENIED' } });

    const select = screen.getByLabelText('Consent method') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(select.value).toBe('');
    const options = within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(options).not.toContain('EMAIL_LINK');
    expect(options).toEqual(['', 'NOT_RECORDED', 'PORTAL_CHECKBOX', 'SIGNED_FORM', 'EMAIL', 'VERBAL_FIELD']);
    // Date and reference are editable again.
    expect(screen.getByLabelText('Consent obtained on')).not.toHaveAttribute('readonly');
    expect(screen.getByLabelText('Consent reference')).not.toHaveAttribute('readonly');
  });

  it('clears the link-era date and reference on a re-grant so they cannot ride under an admin method (D-24)', () => {
    renderForm({ mode: 'edit', initialValues: LINK_DENIED_ACTOR });

    fireEvent.change(screen.getByLabelText(/consent status/i), { target: { value: 'GRANTED' } });

    expect(screen.getByLabelText('Consent method')).toHaveValue('');
    expect(screen.getByLabelText('Consent obtained on')).toHaveValue('');
    expect(screen.getByLabelText('Consent reference')).toHaveValue('');
  });

  it('refuses a re-grant that picks no method, naming the field', async () => {
    renderForm({ mode: 'edit', initialValues: LINK_DENIED_ACTOR });

    fireEvent.change(screen.getByLabelText(/consent status/i), { target: { value: 'GRANTED' } });
    submitForm();

    expect(await screen.findByText('Select how consent was obtained before granting consent.')).toBeInTheDocument();
    expect(updateActor).not.toHaveBeenCalled();
  });

  it('restores the stored link evidence when the status is put back', () => {
    renderForm({ mode: 'edit', initialValues: LINK_GRANTED_ACTOR });

    fireEvent.change(screen.getByLabelText(/consent status/i), { target: { value: 'DENIED' } });
    fireEvent.change(screen.getByLabelText(/consent status/i), { target: { value: 'GRANTED' } });

    expect(screen.getByLabelText('Consent method')).toHaveValue('Email link (actor)');
    expect(screen.getByLabelText('Consent obtained on')).toHaveValue('2026-10-01');
  });

  it('re-sends the stored EMAIL_LINK when the status changes to a non-GRANTED value with no method chosen', async () => {
    jest.mocked(updateActor).mockResolvedValue(LINK_DENIED_ACTOR);
    renderForm({ mode: 'edit', initialValues: LINK_GRANTED_ACTOR });

    fireEvent.change(screen.getByLabelText(/consent status/i), { target: { value: 'DENIED' } });
    submitForm();

    await waitFor(() => expect(updateActor).toHaveBeenCalledTimes(1));
    expect(jest.mocked(updateActor).mock.calls[0][1]).toMatchObject({
      consentStatus: 'DENIED',
      consentMethod: 'EMAIL_LINK',
    });
  });

  it('has no axe violations for an EMAIL_LINK actor (NFR-10)', async () => {
    const { container } = renderForm({ mode: 'edit', initialValues: LINK_GRANTED_ACTOR });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('ActorForm — stale-form protection (D-26, design §5.7a)', () => {
  it('always sends expectedUpdatedAt — the loaded record\'s updatedAt — on an edit save', async () => {
    jest.mocked(updateActor).mockResolvedValue(ADMIN_ACTOR);
    renderForm({ mode: 'edit', initialValues: ADMIN_ACTOR });

    submitForm();

    await waitFor(() => expect(updateActor).toHaveBeenCalledTimes(1));
    expect(jest.mocked(updateActor).mock.calls[0][1]).toHaveProperty('expectedUpdatedAt', ADMIN_ACTOR.updatedAt);
  });

  it('never sends expectedUpdatedAt on a create', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockResolvedValue(CREATE_RESULT);
    renderForm();
    await fillRequiredFields(user);
    submitForm();

    await waitFor(() => expect(createActor).toHaveBeenCalledTimes(1));
    expect(jest.mocked(createActor).mock.calls[0][0]).not.toHaveProperty('expectedUpdatedAt');
  });

  it('shows an accessible notice with a Reload action on a 409 naming expectedUpdatedAt, keeping the typed values', async () => {
    jest.mocked(updateActor).mockRejectedValue(
      new ApiError(409, 'The actor changed since the form was loaded', [
        { field: 'expectedUpdatedAt', message: 'The actor changed since the form was loaded' },
      ]),
    );
    const onReload = jest.fn();
    renderForm({ mode: 'edit', initialValues: ADMIN_ACTOR, onReload });

    fireEvent.change(screen.getByLabelText(/trader name/i), { target: { value: 'Typed By The Admin' } });
    submitForm();

    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent('This actor changed since you opened it — reload to see the latest');
    // Nothing the admin typed is lost silently.
    expect(screen.getByLabelText(/trader name/i)).toHaveValue('Typed By The Admin');

    fireEvent.click(within(notice).getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('does not treat an unrelated 409 as a stale form', async () => {
    jest.mocked(updateActor).mockRejectedValue(new ApiError(409, 'Some other conflict'));
    renderForm({ mode: 'edit', initialValues: ADMIN_ACTOR });

    submitForm();

    expect(await screen.findByText('Some other conflict')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument();
  });
});

describe('ActorForm — the optional consent document on create (FR-15)', () => {
  const pdf = () => new File(['%PDF-1.4'], 'consent.pdf', { type: 'application/pdf' });

  it('offers the document field on create, and not on edit (the evidence panel owns it there)', async () => {
    const { unmount } = renderForm();
    await waitFor(() => expect(screen.getByLabelText(/consent document/i)).toBeEnabled());
    unmount();

    renderForm({ mode: 'edit', initialValues: ADMIN_ACTOR });
    expect(screen.queryByLabelText(/consent document/i)).not.toBeInTheDocument();
  });

  it('hands the held file to onSuccess ONLY after the create resolves, and never uploads itself', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockResolvedValue(CREATE_RESULT);
    const { onSuccess } = renderForm();
    const file = pdf();

    fireEvent.change(await screen.findByLabelText(/consent document/i), { target: { files: [file] } });
    await fillRequiredFields(user);
    submitForm();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(CREATE_RESULT, { documentFile: file }));
    expect(uploadConsentDocument).not.toHaveBeenCalled();
  });

  it('a rejected create leaves no upload attempt and reports no file upward; the file survives for the resubmit', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockRejectedValueOnce(new ApiError(500, 'Server error'));
    const { onSuccess } = renderForm();
    const file = pdf();

    fireEvent.change(await screen.findByLabelText(/consent document/i), { target: { files: [file] } });
    await fillRequiredFields(user);
    submitForm();

    expect(await screen.findByText('Server error')).toBeInTheDocument();
    expect(uploadConsentDocument).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    // Still held: fixing and resubmitting yields at most ONE document.
    expect(screen.getByText('Selected: consent.pdf')).toBeInTheDocument();

    jest.mocked(createActor).mockResolvedValueOnce(CREATE_RESULT);
    submitForm();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onSuccess).toHaveBeenCalledWith(CREATE_RESULT, { documentFile: file });
  });
});
