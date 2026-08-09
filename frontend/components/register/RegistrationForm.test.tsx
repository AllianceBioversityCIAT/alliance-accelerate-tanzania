// @sdd-spec enhancement/searchable-region-select (T-4)
/**
 * Unit tests for RegistrationForm (T-17, FR-2 scenarios 2-4).
 *
 * Covers:
 *   - all five fieldsets render (Identity, Location, Crops & capacity,
 *     Contact, Data protection & consent)
 *   - all ten canonical trader types are offered with labels
 *   - GPS-optional copy is present (A25)
 *   - the literal FR-2 scenario 2 trio: negative capacity, malformed email,
 *     no crop selected — count + one inline message each
 *   - summary and inline messages provably derive from the SAME `errors`
 *     object — fixing one field clears it from both simultaneously
 *   - aria-describedby links each inline error to its input (including the
 *     crops checkbox group); the summary is a live region whose every link
 *     resolves to a live element
 *   - the both-GPS-blank path is ACCEPTED and emits no '' (or key at all)
 *     for gpsLatitude/gpsLongitude
 *   - a legitimate 0 latitude/longitude is preserved, not dropped as falsy
 *   - a lone (one-of-two) coordinate is rejected
 *   - `email` joins the single `errors` record, format-validated client-side,
 *     and is handed up as a THIRD, top-level argument to `onValidated` — a
 *     sibling of `payload`/`consent`, never a property of `payload` (S-6)
 *   - jest-axe clean for the rules jsdom can evaluate — contrast, focus
 *     order and focus visibility are explicitly NOT asserted here (DC-16)
 *   - (T-18 wiring) the real `consent.policyVersion` `ConsentPolicyDisclosure`
 *     fetches flows through to `onValidated`, never a hardcoded placeholder
 *   - (T-4, FR-4) the Region field is the `SearchableSelect` primitive:
 *     `aria-invalid` present-when-errored/absent-when-clean, `aria-describedby`
 *     → `#<id>-error`, the required asterisk, `disabled` while `submitting`,
 *     the error-summary anchor resolving to a focusable element, and
 *     `Select a region.` inline + in the summary from the one `errors`
 *     record — every clause FR-4 owns for this field, named individually
 *
 * `@/lib/api/registrations` is mocked (per `frontend/CLAUDE.md`: "Page tests
 * mock the `lib/api/*` module") because `RegistrationForm` now embeds
 * `ConsentPolicyDisclosure`, which fetches `GET /registrations/consent-policy`
 * on mount. The default mock never resolves — this file's concern is FR-2's
 * validation/error contract, not consent-policy content or the scroll gate
 * (both covered in `ConsentPolicyDisclosure.test.tsx`), and a
 * never-resolving fetch means no state update ever fires after mount, so
 * none of the tests below need to await one to avoid an act() warning. The
 * one test that DOES care about the fetched version overrides this default
 * and awaits the load explicitly (see "flows the real policyVersion...").
 *
 * Region selection (T-4): `SearchableSelect` never commits from typing
 * (FR-3) — `fireEvent.change` on its input only edits the in-progress
 * search text, never `values.region`. Every place this file used to select
 * a region via `fireEvent.change(..., { target: { value: 'Arusha' } })` (the
 * native-`<select>` shape) now drives the real commit path with
 * `@testing-library/user-event`: open the control, then click the option —
 * the same pattern `SearchableSelect.test.tsx`'s own pointer-commit tests
 * use. `selectRegion` centralizes it so this rewrite does not silently drop
 * assertion count against the suite it replaces (`tasks.md` T-4's
 * disqualification clause).
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import RegistrationForm, {
  type RegistrationConsentInput,
  type RegistrationPayloadInput,
} from './RegistrationForm';
import { getConsentPolicy } from '@/lib/api/registrations';

expect.extend(toHaveNoViolations);

jest.mock('@/lib/api/registrations', () => ({
  getConsentPolicy: jest.fn(),
}));

const mockGetConsentPolicy = getConsentPolicy as jest.MockedFunction<typeof getConsentPolicy>;

beforeEach(() => {
  // Default: never resolves — see file header. Individual tests that care
  // about the fetched policy override this with mockResolvedValueOnce.
  mockGetConsentPolicy.mockReturnValue(new Promise(() => {}));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Commits a region on the `SearchableSelect` combobox (T-4) via the real
 * pointer-commit path — open, then click the option — never
 * `fireEvent.change`, which only edits the in-progress search text and
 * never reaches `onChange` (FR-3). Mirrors `SearchableSelect.test.tsx`'s own
 * JD-8 pointer-commit tests.
 */
async function selectRegion(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByLabelText(/^region/i));
  await user.click(screen.getByRole('option', { name: label }));
}

/** Fills every REQUIRED field with a valid value, leaving optionals blank. */
async function fillMinimalValidForm(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.change(screen.getByLabelText(/organisation name/i), {
    target: { value: 'Kilimanjaro Seed Co-op' },
  });
  fireEvent.change(screen.getByLabelText(/^trader type/i), {
    target: { value: 'seed_company' },
  });
  await selectRegion(user, 'Arusha');
  fireEvent.click(screen.getByLabelText(/^sorghum/i));
  fireEvent.change(screen.getByLabelText(/capacity \(tons\)/i), {
    target: { value: '10' },
  });
  fireEvent.change(screen.getByLabelText(/contact person/i), {
    target: { value: 'Jane Doe' },
  });
  fireEvent.change(screen.getByLabelText(/^phone/i), {
    target: { value: '+255700000000' },
  });
  fireEvent.change(screen.getByLabelText(/^email/i), {
    target: { value: 'jane@kilimanjaroseed.co.tz' },
  });
  fireEvent.click(
    screen.getByLabelText('I have read and accept the Data Protection & Participant Consent Policy.'),
  );
}

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

describe('RegistrationForm — structure', () => {
  it('renders the five fieldsets named in design.md §5.1', () => {
    render(<RegistrationForm onValidated={jest.fn()} />);
    expect(screen.getByRole('group', { name: 'Identity' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Location' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Crops & capacity' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Contact' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Data protection & consent' })).toBeInTheDocument();
  });

  it('offers all ten canonical trader types with human-readable labels (FR-2 scenario 4)', () => {
    render(<RegistrationForm onValidated={jest.fn()} />);
    const select = screen.getByLabelText(/^trader type/i) as HTMLSelectElement;
    // 10 real options + 1 "Select…" placeholder.
    expect(select.options.length).toBe(11);
    const labels = Array.from(select.options).map((o) => o.textContent);
    // Sample the four types chunk 1 added — these are the ones a stale
    // six-type source would silently omit (C-6).
    expect(labels).toContain('Humanitarian / INGO');
    expect(labels).toContain('Digital Service Provider');
    expect(labels).toContain('QDS Producer');
    expect(labels).toContain('Bulk Buyer');
    expect(labels.filter((l) => l !== 'Select…')).toHaveLength(10);
  });

  it('states GPS is optional, not just via a field hint (A25)', () => {
    render(<RegistrationForm onValidated={jest.fn()} />);
    expect(
      screen.getByText(/GPS coordinates are optional/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/leave both fields blank/i),
    ).toBeInTheDocument();
  });

  /**
   * FR-5: the GPS-optional copy must be programmatically associated with
   * BOTH GPS inputs, ALONGSIDE each field's own per-field hint — not by
   * merely asserting the attribute is non-empty (a presence assertion,
   * KZ-002), but by resolving the accessible description text itself.
   */
  it('associates the GPS-optional copy with both GPS inputs, alongside each field\'s own hint (FR-5)', () => {
    render(<RegistrationForm onValidated={jest.fn()} />);
    const gpsCopy = /GPS coordinates are optional\. You may leave both fields blank/;

    const latitude = screen.getByLabelText(/gps latitude/i);
    const longitude = screen.getByLabelText(/gps longitude/i);

    // `toHaveAccessibleDescription` resolves aria-describedby to its
    // referenced elements' text, not the raw attribute — a RegExp is a
    // substring test against that RESOLVED description, so both assertions
    // per input prove the copy AND the field's own hint are both present,
    // regardless of concatenation order.
    expect(latitude).toHaveAccessibleDescription(gpsCopy);
    expect(latitude).toHaveAccessibleDescription(/Decimal between -90 and 90/);
    expect(longitude).toHaveAccessibleDescription(gpsCopy);
    expect(longitude).toHaveAccessibleDescription(/Decimal between -180 and 180/);
  });

  it('the consent checkbox is unticked at every initial render (T-18 seam)', () => {
    render(<RegistrationForm onValidated={jest.fn()} />);
    const checkbox = screen.getByLabelText(
      'I have read and accept the Data Protection & Participant Consent Policy.',
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Error contract — the disqualifying clause
// ---------------------------------------------------------------------------

describe('RegistrationForm — error contract (one source, not two)', () => {
  /**
   * The literal trio from requirements.md FR-2 scenario 2 (line 154): "an
   * applicant whose capacity is negative, whose email is malformed, and who
   * has selected no main crop." Attempt 1 substituted phone-blank for the
   * malformed-email case, which proved the error-summary MACHINE but never
   * exercised the scenario the requirement actually names (Reviewer FAIL,
   * attempt 2) — email format validation did not exist yet for it to fail.
   */
  it('the FR-2 scenario 2 trio (negative capacity, malformed email, no crop) shows a count plus one inline message each, in agreement', async () => {
    const user = userEvent.setup();
    render(<RegistrationForm onValidated={jest.fn()} />);

    // Everything valid EXCEPT: capacity negative, malformed email, no crop selected.
    fireEvent.change(screen.getByLabelText(/organisation name/i), {
      target: { value: 'Kilimanjaro Seed Co-op' },
    });
    fireEvent.change(screen.getByLabelText(/^trader type/i), { target: { value: 'seed_company' } });
    await selectRegion(user, 'Arusha');
    fireEvent.change(screen.getByLabelText(/capacity \(tons\)/i), { target: { value: '-5' } });
    fireEvent.change(screen.getByLabelText(/contact person/i), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText(/^phone/i), { target: { value: '+255700000000' } });
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'not-an-email' } });
    fireEvent.click(
      screen.getByLabelText('I have read and accept the Data Protection & Participant Consent Policy.'),
    );
    // No crop checked.

    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));

    const summary = screen.getByTestId('error-summary');
    expect(summary).toHaveTextContent('3 fields need attention:');

    // One inline message each — queried by the field, not the summary.
    expect(screen.getByText('Capacity must be 0 or greater.')).toBeInTheDocument();
    expect(screen.getByText('Select at least one crop.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();

    // Summary lists the exact same three fields.
    expect(summary).toHaveTextContent('Capacity (tons)');
    expect(summary).toHaveTextContent('Crops');
    expect(summary).toHaveTextContent('Email');
  });

  it('fixing one field clears it from the summary AND the inline message simultaneously — proof of one shared object', async () => {
    const user = userEvent.setup();
    render(<RegistrationForm onValidated={jest.fn()} />);
    fireEvent.change(screen.getByLabelText(/organisation name/i), {
      target: { value: 'Kilimanjaro Seed Co-op' },
    });
    fireEvent.change(screen.getByLabelText(/^trader type/i), { target: { value: 'seed_company' } });
    await selectRegion(user, 'Arusha');
    fireEvent.change(screen.getByLabelText(/capacity \(tons\)/i), { target: { value: '-5' } });
    fireEvent.change(screen.getByLabelText(/contact person/i), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText(/^phone/i), { target: { value: '+255700000000' } });
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'not-an-email' } });
    fireEvent.click(
      screen.getByLabelText('I have read and accept the Data Protection & Participant Consent Policy.'),
    );
    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));

    expect(screen.getByTestId('error-summary')).toHaveTextContent('3 fields need attention:');
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();

    // Fix ONLY the email field — both the inline message and the summary's
    // count/entry must disappear in the SAME re-render, because both read
    // the one `errors` object `setField` just updated. If they were two
    // independently-maintained copies, one could lag and this would fail.
    fireEvent.change(screen.getByLabelText(/^email/i), {
      target: { value: 'jane@kilimanjaroseed.co.tz' },
    });

    expect(screen.queryByText('Enter a valid email address.')).not.toBeInTheDocument();
    expect(screen.getByTestId('error-summary')).toHaveTextContent('2 fields need attention:');
    expect(screen.getByTestId('error-summary')).not.toHaveTextContent('Email');
  });

  it('associates each inline error with its input via aria-describedby (including the crops group), and the summary is a live region', () => {
    render(<RegistrationForm onValidated={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));

    const summary = screen.getByTestId('error-summary');
    expect(summary).toHaveAttribute('aria-live', 'assertive');
    expect(summary).toHaveAttribute('role', 'alert');

    const phoneInput = screen.getByLabelText(/^phone/i);
    const describedBy = phoneInput.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const errorEl = document.getElementById(describedBy!.split(' ')[0]);
    expect(errorEl).toHaveTextContent('Phone is required.');

    // The crops checkbox GROUP (not a checkbox) carries the association —
    // Reviewer FAIL, attempt 2: no control pointed at the crops error at all.
    const cropsGroup = screen.getByRole('group', { name: 'Crops' });
    const cropsDescribedBy = cropsGroup.getAttribute('aria-describedby');
    expect(cropsDescribedBy).toBeTruthy();
    const cropsErrorEl = document.getElementById(cropsDescribedBy!);
    expect(cropsErrorEl).toHaveTextContent('Select at least one crop.');
  });

  /**
   * Generic assertion (Reviewer's remediation, attempt 2): the summary's
   * Crops entry linked to `#${baseId}-crops`, an id nothing rendered — a
   * dead anchor `jest-axe` cannot catch. This checks EVERY summary link
   * against the live document rather than one field by name, so it also
   * catches the next field that grows the same gap.
   */
  it('every error-summary link resolves to a live element in the document', () => {
    render(<RegistrationForm onValidated={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));

    const summary = screen.getByTestId('error-summary');
    const links = within(summary).getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);

    links.forEach((link) => {
      const href = link.getAttribute('href');
      expect(href).toMatch(/^#/);
      const target = document.getElementById(href!.slice(1));
      expect(target).not.toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// GPS pairing and the T-9-review trap (never emit '')
// ---------------------------------------------------------------------------

describe('RegistrationForm — GPS pairing and payload construction', () => {
  it('rejects exactly one of two coordinates', async () => {
    const user = userEvent.setup();
    render(<RegistrationForm onValidated={jest.fn()} />);
    await fillMinimalValidForm(user);
    fireEvent.change(screen.getByLabelText(/gps latitude/i), { target: { value: '-3.5' } });
    // Longitude left blank.
    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));

    expect(screen.getByText('Enter both coordinates, or leave both blank.')).toBeInTheDocument();
  });

  it('accepts both GPS fields blank and emits NO gpsLatitude/gpsLongitude — never as \'\'', async () => {
    const user = userEvent.setup();
    const onValidated = jest.fn();
    render(<RegistrationForm onValidated={onValidated} />);
    await fillMinimalValidForm(user);
    // GPS left blank on both.
    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));

    expect(onValidated).toHaveBeenCalledTimes(1);
    const payload = onValidated.mock.calls[0][0] as RegistrationPayloadInput;

    // Never '' — either omitted (undefined) or absent after a JSON round trip.
    expect(payload.gpsLatitude).not.toBe('');
    expect(payload.gpsLongitude).not.toBe('');
    expect(payload.gpsLatitude).toBeUndefined();
    expect(payload.gpsLongitude).toBeUndefined();

    // The wire-shape proof: JSON.stringify (what apiFetch will do) drops
    // undefined-valued keys entirely — the actual "never send ''" guarantee.
    const wireShape = JSON.parse(JSON.stringify(payload));
    expect('gpsLatitude' in wireShape).toBe(false);
    expect('gpsLongitude' in wireShape).toBe(false);
  });

  it('preserves a legitimate 0 latitude/longitude — 0 is not falsy-dropped (Tanzania is near the equator)', async () => {
    const user = userEvent.setup();
    const onValidated = jest.fn();
    render(<RegistrationForm onValidated={onValidated} />);
    await fillMinimalValidForm(user);
    fireEvent.change(screen.getByLabelText(/gps latitude/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/gps longitude/i), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));

    expect(onValidated).toHaveBeenCalledTimes(1);
    const payload = onValidated.mock.calls[0][0] as RegistrationPayloadInput;
    expect(payload.gpsLatitude).toBe(0);
    expect(payload.gpsLongitude).toBe(0);

    const wireShape = JSON.parse(JSON.stringify(payload));
    expect(wireShape.gpsLatitude).toBe(0);
    expect(wireShape.gpsLongitude).toBe(0);
  });

  it('rejects out-of-range coordinates', async () => {
    const user = userEvent.setup();
    render(<RegistrationForm onValidated={jest.fn()} />);
    await fillMinimalValidForm(user);
    fireEvent.change(screen.getByLabelText(/gps latitude/i), { target: { value: '95' } });
    fireEvent.change(screen.getByLabelText(/gps longitude/i), { target: { value: '-200' } });
    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));

    expect(screen.getByText('Latitude must be between -90 and 90.')).toBeInTheDocument();
    expect(screen.getByText('Longitude must be between -180 and 180.')).toBeInTheDocument();
  });

  it('does not call onValidated when the consent checkbox is unticked', async () => {
    const user = userEvent.setup();
    const onValidated = jest.fn();
    render(<RegistrationForm onValidated={onValidated} />);
    // Fill every field EXCEPT consent.
    fireEvent.change(screen.getByLabelText(/organisation name/i), {
      target: { value: 'Kilimanjaro Seed Co-op' },
    });
    fireEvent.change(screen.getByLabelText(/^trader type/i), { target: { value: 'seed_company' } });
    await selectRegion(user, 'Arusha');
    fireEvent.click(screen.getByLabelText(/^sorghum/i));
    fireEvent.change(screen.getByLabelText(/capacity \(tons\)/i), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/contact person/i), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText(/^phone/i), { target: { value: '+255700000000' } });
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'jane@kilimanjaroseed.co.tz' } });

    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));

    expect(onValidated).not.toHaveBeenCalled();
    expect(screen.getByText('You must accept the policy before continuing.')).toBeInTheDocument();
  });

  it('a fully valid submission calls onValidated with the built payload, consent, and email — no network call', async () => {
    const user = userEvent.setup();
    const onValidated = jest.fn();
    render(<RegistrationForm onValidated={onValidated} />);
    await fillMinimalValidForm(user);
    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));

    expect(onValidated).toHaveBeenCalledTimes(1);
    const [payload, consent, email] = onValidated.mock.calls[0] as [
      RegistrationPayloadInput,
      RegistrationConsentInput,
      string,
    ];
    expect(payload).toMatchObject({
      traderName: 'Kilimanjaro Seed Co-op',
      traderType: 'seed_company',
      region: 'Arusha',
      contactPerson: 'Jane Doe',
      phone: '+255700000000',
      capacityTons: 10,
      crops: ['sorghum'],
    });
    // `email` travels as a THIRD, top-level argument — never a property of
    // `payload` (S-6, design.md §4.1: "No email in the payload").
    expect('email' in payload).toBe(false);
    // The default mock never resolves (see file header), so the version the
    // disclosure would have reported never arrives — this is the "consent
    // policy never loaded" path, distinct from the happy path below.
    expect(consent).toEqual({ accepted: true, policyVersion: '' });
    expect(email).toBe('jane@kilimanjaroseed.co.tz');
  });

  it('flows the real policyVersion ConsentPolicyDisclosure fetched through to onValidated, never a placeholder', async () => {
    const user = userEvent.setup();
    mockGetConsentPolicy.mockResolvedValueOnce({
      version: 'v9.9-test-fixture',
      sections: [{ heading: 'A section', body: 'Body text.' }],
    });
    const onValidated = jest.fn();
    render(<RegistrationForm onValidated={onValidated} />);

    // Wait for ConsentPolicyDisclosure's fetch to resolve and its version
    // heading to render, before submitting — proves the version RegistrationForm
    // hands upward is the one the disclosure actually fetched.
    await screen.findByText('v9.9-test-fixture', { exact: false });

    await fillMinimalValidForm(user);
    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));

    expect(onValidated).toHaveBeenCalledTimes(1);
    const [, consent] = onValidated.mock.calls[0] as [
      RegistrationPayloadInput,
      RegistrationConsentInput,
      string,
    ];
    expect(consent.policyVersion).not.toBe('');
    expect(consent.policyVersion).toBe('v9.9-test-fixture');
  });

  it('rejects a malformed email and requires one before calling onValidated', async () => {
    const user = userEvent.setup();
    const onValidated = jest.fn();
    render(<RegistrationForm onValidated={onValidated} />);
    await fillMinimalValidForm(user);
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'not-an-email' } });

    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));

    expect(onValidated).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Region field — SearchableSelect adoption (T-4, FR-4, design.md §5.6, JD-2)
//
// Every clause `tasks.md` T-4 owns for this one field, named individually so
// none can be discharged by an adjacent green check (KZ-001): aria-invalid
// present/absent, aria-describedby, the required asterisk, disabled while
// submitting, the summary anchor resolving to a FOCUSABLE element (not just
// a live one — see the dedicated test below), and "Select a region." in
// both the inline message and the summary from the one `errors` record.
// ---------------------------------------------------------------------------

describe('RegistrationForm — Region field (T-4, SearchableSelect adoption)', () => {
  it('aria-invalid is present ("true") on the region combobox once errored, and absent on a clean render', () => {
    render(<RegistrationForm onValidated={jest.fn()} />);
    expect(screen.getByLabelText(/^region/i)).not.toHaveAttribute('aria-invalid');

    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));
    expect(screen.getByLabelText(/^region/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('aria-describedby on the region combobox points at #<id>-error once errored, resolving to the inline message', () => {
    render(<RegistrationForm onValidated={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));

    const region = screen.getByLabelText(/^region/i);
    const describedBy = region.getAttribute('aria-describedby');
    expect(describedBy).toBe(`${region.id}-error`);
    expect(document.getElementById(describedBy!)).toHaveTextContent('Select a region.');
  });

  it('the Region label carries the required asterisk', () => {
    render(<RegistrationForm onValidated={jest.fn()} />);
    const region = screen.getByLabelText(/^region/i);
    const label = document.querySelector(`label[for="${region.id}"]`);
    expect(label).not.toBeNull();
    // Field renders `{label}{required && <span aria-hidden>*</span>}` with no
    // separating whitespace — the exact text every other required field's
    // label carries.
    expect(label).toHaveTextContent('Region*');
  });

  it('the region combobox is disabled while submitting', () => {
    render(<RegistrationForm onValidated={jest.fn()} submitting />);
    expect(screen.getByLabelText(/^region/i)).toBeDisabled();
  });

  it('"Select a region." appears both inline and in the error summary, from the one errors record', () => {
    render(<RegistrationForm onValidated={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));

    expect(screen.getByText('Select a region.')).toBeInTheDocument();
    const summary = screen.getByTestId('error-summary');
    expect(summary).toHaveTextContent('Region');
    expect(summary).toHaveTextContent('Select a region.');
  });

  it('the error-summary anchor #<baseId>-region resolves to a genuinely FOCUSABLE element, not merely a live one', () => {
    render(<RegistrationForm onValidated={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));

    const summary = screen.getByTestId('error-summary');
    const regionLink = within(summary)
      .getAllByRole('link')
      .find((link) => link.getAttribute('href')?.endsWith('-region'));
    expect(regionLink).toBeDefined();

    const region = screen.getByLabelText(/^region/i);
    const targetId = regionLink!.getAttribute('href')!.slice(1);
    expect(targetId).toBe(region.id);
    const target = document.getElementById(targetId);
    expect(target).not.toBeNull();
    // The dead-anchor defect class T-4's brief names (already fixed for the
    // crops group and consent block) is a target that RESOLVES but cannot
    // take focus. Unlike the crops group's tabIndex={-1} wrapper div, this
    // target is `SearchableSelect`'s own native <input>, so no extra
    // plumbing was required — but that must be demonstrated, not assumed.
    target!.focus();
    expect(target).toHaveFocus();
    expect(target).toBe(region);
  });

  it('typed, uncommitted region text is never emitted to onValidated — FR-3 preserved through the adoption', async () => {
    const user = userEvent.setup();
    const onValidated = jest.fn();
    render(<RegistrationForm onValidated={onValidated} />);
    await fillMinimalValidForm(user);

    // Reopen the already-committed control, type a fragment that matches no
    // region, then abandon it without committing (FR-2's "abandoning a
    // partial search" — blur reverts, never emits).
    const region = screen.getByLabelText(/^region/i);
    await user.click(region);
    await user.keyboard('Zzz');
    await user.tab();

    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));

    expect(onValidated).toHaveBeenCalledTimes(1);
    const payload = onValidated.mock.calls[0][0] as RegistrationPayloadInput;
    expect(payload.region).toBe('Arusha');
  });
});

// ---------------------------------------------------------------------------
// Accessibility — PROVEN vs DEFERRED (KZ-002 / DC-16)
// ---------------------------------------------------------------------------

describe('RegistrationForm — accessibility (jsdom-provable subset)', () => {
  it('has no jest-axe violations on initial render', async () => {
    const { container } = render(<RegistrationForm onValidated={jest.fn()} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no jest-axe violations with the three-field error case shown', async () => {
    const { container } = render(<RegistrationForm onValidated={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /continue to verification/i }));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  // NOT covered here, and not claimed to be (DC-16): color contrast, focus
  // order, and focus visibility. jsdom performs no layout — `jest-axe`'s
  // `color-contrast` rule returns `incomplete` under jsdom, and
  // `toHaveNoViolations` does not fail on `incomplete` results, so a green
  // run above is not evidence for any of the three. Those route to the
  // human check at the Phase-3 HITL pause (T-22), against
  // docs/ux-ui/design.md §7's contrast guidance — per KZ-003 this component
  // takes plain props, so that check must not be deferred on auth/stack
  // grounds.
});
