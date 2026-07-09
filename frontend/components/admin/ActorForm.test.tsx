// @sdd-spec admin/actor-crud-audit (T-8)
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

import ActorForm from './ActorForm';
import { createActor, updateActor } from '@/lib/api/actors-admin';
import { ApiError, AuthFailureError } from '@/lib/api/client';
import type { AdminActor } from '@/lib/api/actors-admin';

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

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/trader id/i), { target: { value: 'T-002' } });
  fireEvent.change(screen.getByLabelText(/trader name/i), { target: { value: 'Iringa Cooperative' } });
  fireEvent.change(screen.getByLabelText(/region/i), { target: { value: 'Iringa' } });
  fireEvent.change(screen.getByLabelText(/trader type/i), { target: { value: 'cooperative' } });
  fireEvent.change(screen.getByLabelText(/consent status/i), { target: { value: 'UNKNOWN' } });
}

function submitForm() {
  fireEvent.click(screen.getByRole('button', { name: /create actor|save changes/i }));
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
    expect(screen.getByText('Consent')).toBeInTheDocument();

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

  it('rejects invalid email format', () => {
    renderForm();
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'not-an-email' } });
    submitForm();

    expect(getFieldError(/email/i)?.textContent).toMatch(/valid email/i);
    expect(createActor).not.toHaveBeenCalled();
  });

  it('rejects GPS latitude outside [-90, 90]', () => {
    renderForm();
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/gps latitude/i), { target: { value: '95' } });
    submitForm();

    expect(getFieldError(/gps latitude/i)?.textContent).toMatch(/-90 and 90/i);
    expect(createActor).not.toHaveBeenCalled();
  });

  it('rejects GPS longitude outside [-180, 180]', () => {
    renderForm();
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/gps longitude/i), { target: { value: '-200' } });
    submitForm();

    expect(getFieldError(/gps longitude/i)?.textContent).toMatch(/-180 and 180/i);
    expect(createActor).not.toHaveBeenCalled();
  });

  it('rejects negative capacity', () => {
    renderForm();
    fillRequiredFields();
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
    jest.mocked(createActor).mockResolvedValue(ADMIN_ACTOR);
    renderForm();

    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/consent status/i), { target: { value: 'GRANTED' } });
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
    renderForm();

    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/consent status/i), { target: { value: 'GRANTED' } });
    submitForm();

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createActor).not.toHaveBeenCalled();
  });

  it('gates GRANTED transitions in edit mode when initial status is not GRANTED', async () => {
    jest.mocked(updateActor).mockResolvedValue({ ...ADMIN_ACTOR, consentStatus: 'GRANTED' });
    renderForm({ mode: 'edit', initialValues: ADMIN_ACTOR });

    fireEvent.change(screen.getByLabelText(/consent status/i), { target: { value: 'GRANTED' } });
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

  it('does not gate submits with consent DENIED or UNKNOWN', async () => {
    jest.mocked(createActor).mockResolvedValue(ADMIN_ACTOR);
    renderForm();

    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/consent status/i), { target: { value: 'DENIED' } });
    submitForm();

    await waitFor(() => expect(createActor).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(jest.mocked(createActor).mock.calls[0][0].acknowledged).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Server error mapping
// ---------------------------------------------------------------------------

describe('ActorForm — server error mapping', () => {
  it('maps 409 duplicate traderId inline to the traderId field', async () => {
    jest.mocked(createActor).mockRejectedValue(
      new ApiError(409, 'An actor with this traderId already exists'),
    );
    renderForm();

    fillRequiredFields();
    submitForm();

    await waitFor(() => expect(getFieldError(/trader id/i)?.textContent).toMatch(/already exists/i));
    expect(screen.getByLabelText(/trader id/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('maps 400 field errors inline via aria-describedby', async () => {
    jest.mocked(createActor).mockRejectedValue(
      new ApiError(400, 'Validation failed', [
        { field: 'email', message: 'Email must be a valid email address' },
      ]),
    );
    renderForm();

    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'valid@example.com' } });
    submitForm();

    await waitFor(() =>
      expect(getFieldError(/email/i)?.textContent).toMatch(/valid email address/i),
    );
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('renders a top-level form error for non-field server errors', async () => {
    jest.mocked(createActor).mockRejectedValue(new ApiError(500, 'Server error'));
    renderForm();

    fillRequiredFields();
    submitForm();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Server error'));
  });

  it('calls onAuthFailure when the API returns 401', async () => {
    jest.mocked(createActor).mockRejectedValue(new AuthFailureError());
    const { onAuthFailure } = renderForm();

    fillRequiredFields();
    submitForm();

    await waitFor(() => expect(onAuthFailure).toHaveBeenCalledTimes(1));
  });
});

// ---------------------------------------------------------------------------
// Success flow
// ---------------------------------------------------------------------------

describe('ActorForm — success flow', () => {
  it('calls onSuccess after a successful create', async () => {
    jest.mocked(createActor).mockResolvedValue(ADMIN_ACTOR);
    const { onSuccess } = renderForm();

    fillRequiredFields();
    submitForm();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it('calls onSuccess when Cancel is clicked', () => {
    const { onSuccess } = renderForm();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
