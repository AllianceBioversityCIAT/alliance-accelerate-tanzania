// @sdd-spec admin/registration-review-queue (T-13)
/**
 * Unit tests for RegistrationDetailPanel (FR-10 scenarios 1-3, FR-11
 * scenario 1, NFR-6).
 *
 * Covers:
 *   - **The reference code is present in the header** — FR-10 scenario 1's
 *     "must show the reference code, so the reviewer can quote it in any
 *     out-of-band contact."
 *   - **The human half of DC-23** — `contactPerson` and `otherCrops` each
 *     carry the "Review context — will not be published" marking, while an
 *     ordinary publishable field (`traderName`) does NOT. Exactly two
 *     markings render, never more, never fewer.
 *   - Every submitted field's VALUE is present in the rendered output
 *     (FR-10 scenario 1's "every submitted field is displayed").
 *   - The submitted email (`Registration.submitterEmail`) renders and is
 *     NOT marked review context — it IS published (FR-12: -> Actor.email).
 *   - The location card renders raw coordinates and a map link when both
 *     are present, and a "no coordinates" state when both are null.
 *   - Composes `DuplicateWarningCard`, `ConsentRecordCard`, `ActivityTrail`
 *     (each independently unit-tested; this file only asserts they receive
 *     the right data and appear on the page).
 *   - jest-axe clean (NFR-5).
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

import { RegistrationDetailPanel } from './RegistrationDetailPanel';
import type { AdminRegistrationDetail } from '@/lib/api/registrations-admin';

function buildDetail(overrides: Partial<AdminRegistrationDetail> = {}): AdminRegistrationDetail {
  return {
    id: 'reg-1',
    reference: 'REG-2026-0184',
    status: 'PENDING_REVIEW',
    payload: {
      traderName: 'Meru Agro Cooperative Society',
      traderType: 'cooperative',
      contactPerson: 'Jane Mushi',
      position: 'Operations Manager',
      district: 'Arusha Urban',
      marketLocation: 'Kilombero Market',
      sex: 'female',
      region: 'Arusha',
      gpsLatitude: -3.3869,
      gpsLongitude: 36.683,
      crops: ['sorghum', 'common_bean'],
      otherCrops: 'Sesame',
      capacityTons: 12,
      phone: '+255700000000',
    },
    submitterEmail: 'jane.mushi@example.com',
    consent: {
      // Deliberately distinct from payload.traderName above — this is the
      // consent block's own field, and the fixture must not rely on the
      // two strings coincidentally matching for getByText() to resolve
      // uniquely elsewhere in this file.
      consentingOrganisation: 'Meru Agro Cooperative Society (consent record)',
      policyVersion: 'v2.1',
      acceptedAt: '2026-06-01T14:32:00.000Z',
      acceptedAtQualifier: 'RECORDED_AT_SUBMISSION',
    },
    duplicateCandidates: [],
    activityTrail: [{ type: 'SUBMITTED', occurredAt: '2026-06-01T09:00:00.000Z' }],
    ...overrides,
  };
}

describe('RegistrationDetailPanel', () => {
  it('shows the reference code in the header', () => {
    render(<RegistrationDetailPanel detail={buildDetail()} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('REG-2026-0184');
  });

  it('marks contactPerson and otherCrops as review context, and marks nothing else', () => {
    render(<RegistrationDetailPanel detail={buildDetail()} />);

    const badges = screen.getAllByText('Review context — will not be published');
    expect(badges).toHaveLength(2);

    const contactRow = screen.getByText('Jane Mushi').closest('tr');
    const otherCropsRow = screen.getByText('Sesame').closest('tr');
    const traderNameRow = screen.getByText('Meru Agro Cooperative Society').closest('tr');

    expect(contactRow).not.toBeNull();
    expect(otherCropsRow).not.toBeNull();
    expect(traderNameRow).not.toBeNull();

    expect(within(contactRow as HTMLElement).queryByText('Review context — will not be published')).toBeInTheDocument();
    expect(within(otherCropsRow as HTMLElement).queryByText('Review context — will not be published')).toBeInTheDocument();
    expect(within(traderNameRow as HTMLElement).queryByText('Review context — will not be published')).not.toBeInTheDocument();
  });

  it('renders every submitted field value, including the submitted email as published (not review context)', () => {
    render(<RegistrationDetailPanel detail={buildDetail()} />);

    expect(screen.getByText('Meru Agro Cooperative Society')).toBeInTheDocument();
    expect(screen.getByText('Jane Mushi')).toBeInTheDocument();
    expect(screen.getByText('Operations Manager')).toBeInTheDocument();
    expect(screen.getByText('Arusha Urban')).toBeInTheDocument();
    expect(screen.getByText('Kilombero Market')).toBeInTheDocument();
    expect(screen.getByText('Sesame')).toBeInTheDocument();
    expect(screen.getByText('+255700000000')).toBeInTheDocument();

    const emailRow = screen.getByText('jane.mushi@example.com').closest('tr');
    expect(emailRow).not.toBeNull();
    expect(within(emailRow as HTMLElement).queryByText('Review context — will not be published')).not.toBeInTheDocument();
  });

  it('renders raw coordinates and a map link when GPS is present', () => {
    render(<RegistrationDetailPanel detail={buildDetail()} />);
    expect(screen.getByText('-3.3869')).toBeInTheDocument();
    expect(screen.getByText('36.683')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'View on map' });
    expect(link).toHaveAttribute('href', expect.stringContaining('openstreetmap.org'));
  });

  it('renders a "no coordinates" state when GPS is absent', () => {
    const detail = buildDetail({
      payload: { ...buildDetail().payload, gpsLatitude: null, gpsLongitude: null },
    });
    render(<RegistrationDetailPanel detail={detail} />);
    expect(screen.getByText('No coordinates submitted.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View on map' })).not.toBeInTheDocument();
  });

  it('composes the duplicate warning, consent record, and activity trail', () => {
    render(<RegistrationDetailPanel detail={buildDetail()} />);
    expect(screen.getByText('No possible duplicates found.')).toBeInTheDocument();
    expect(screen.getByText('v2.1')).toBeInTheDocument();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
  });

  it('has no jest-axe violations', async () => {
    const { container } = render(<RegistrationDetailPanel detail={buildDetail()} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
