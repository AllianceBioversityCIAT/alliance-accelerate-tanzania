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
 *   - server 409 duplicate traderId maps inline to the traderId field
 *   - successful submit calls onSuccess
 *   - AuthFailureError triggers onAuthFailure
 *   - jest-axe clean in create mode and with the FR-3 inline errors shown (NFR-5)
 *   - (T-7) the Region field is the `SearchableSelect` primitive: `aria-invalid`
 *     present-when-errored/absent-when-clean, `aria-describedby` → `#<id>-error`,
 *     the required asterisk, `disabled` while `loading`, "Region is required."
 *     inline, and payload fidelity — every clause `tasks.md` T-7 owns for this
 *     field, named individually
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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import ActorForm from './ActorForm';
import { createActor, updateActor } from '@/lib/api/actors-admin';
import { ApiError, AuthFailureError } from '@/lib/api/client';
import type { AdminActor } from '@/lib/api/actors-admin';

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

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.change(screen.getByLabelText(/trader id/i), { target: { value: 'T-002' } });
  fireEvent.change(screen.getByLabelText(/trader name/i), { target: { value: 'Iringa Cooperative' } });
  await selectRegion(user, 'Iringa');
  fireEvent.change(screen.getByLabelText(/trader type/i), { target: { value: 'cooperative' } });
  fireEvent.change(screen.getByLabelText(/consent status/i), { target: { value: 'UNKNOWN' } });
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

    expect(getFieldError(/trader id/i)?.textContent).toMatch(/required/i);
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
// Acknowledgement gating
// ---------------------------------------------------------------------------

describe('ActorForm — consent acknowledgement gating', () => {
  it('opens AcknowledgeDialog and sends acknowledged: true when creating with GRANTED', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockResolvedValue(ADMIN_ACTOR);
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
    jest.mocked(createActor).mockResolvedValue(ADMIN_ACTOR);
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
    jest.mocked(createActor).mockResolvedValue(ADMIN_ACTOR);
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
    jest.mocked(createActor).mockResolvedValue(ADMIN_ACTOR);
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
    jest.mocked(createActor).mockResolvedValue(ADMIN_ACTOR);
    renderForm();

    await fillRequiredFields(user);
    submitForm();

    await waitFor(() => expect(createActor).toHaveBeenCalledTimes(1));
    const dto = jest.mocked(createActor).mock.calls[0][0];
    expect(dto.region).toBe('Iringa');
  });

  it('typed, uncommitted region text is never emitted to the payload — FR-3 preserved through the adoption', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockResolvedValue(ADMIN_ACTOR);
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
  it('maps 409 duplicate traderId inline to the traderId field', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockRejectedValue(
      new ApiError(409, 'An actor with this traderId already exists'),
    );
    renderForm();

    await fillRequiredFields(user);
    submitForm();

    await waitFor(() => expect(getFieldError(/trader id/i)?.textContent).toMatch(/already exists/i));
    expect(screen.getByLabelText(/trader id/i)).toHaveAttribute('aria-invalid', 'true');
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
// Success flow
// ---------------------------------------------------------------------------

describe('ActorForm — success flow', () => {
  it('calls onSuccess after a successful create', async () => {
    const user = userEvent.setup();
    jest.mocked(createActor).mockResolvedValue(ADMIN_ACTOR);
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
