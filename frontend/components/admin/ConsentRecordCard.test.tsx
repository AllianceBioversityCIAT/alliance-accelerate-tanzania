// @sdd-spec admin/registration-review-queue (T-13)
/**
 * Unit tests for ConsentRecordCard (FR-10 scenario 2).
 *
 * Covers:
 *   - Consenting organisation and policy version render.
 *   - The rendered acceptance timestamp string contains a timezone
 *     designator ("UTC") — FR-10 scenario 2's "must render the timestamp
 *     in a form that names its timezone."
 *   - The "recorded at submission" qualifier text renders, sourced from
 *     `AdminConsentRecord.acceptedAtQualifier` via the total `Record` map
 *     (not hardcoded prose only) — FR-10 scenario 2's "must label that
 *     timestamp as recorded at submission."
 *   - jest-axe clean (NFR-5 — for what jsdom can evaluate; see DC-16).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

import { ConsentRecordCard } from './ConsentRecordCard';
import type { AdminConsentRecord } from '@/lib/api/registrations-admin';

const CONSENT: AdminConsentRecord = {
  consentingOrganisation: 'Meru Agro Cooperative Society',
  policyVersion: 'v2.1',
  acceptedAt: '2026-06-01T14:32:00.000Z',
  acceptedAtQualifier: 'RECORDED_AT_SUBMISSION',
};

describe('ConsentRecordCard', () => {
  it('renders the consenting organisation and policy version', () => {
    render(<ConsentRecordCard consent={CONSENT} />);
    expect(screen.getByText('Meru Agro Cooperative Society')).toBeInTheDocument();
    expect(screen.getByText('v2.1')).toBeInTheDocument();
  });

  it('renders the acceptance timestamp with an explicit timezone designator', () => {
    render(<ConsentRecordCard consent={CONSENT} />);
    const time = screen.getByText((_, el) => el?.tagName.toLowerCase() === 'time');
    expect(time.textContent).toMatch(/UTC/);
  });

  it('labels the timestamp as recorded at submission, not an attested moment', () => {
    render(<ConsentRecordCard consent={CONSENT} />);
    expect(screen.getByText(/recorded at submission/i)).toBeInTheDocument();
    expect(screen.getByText(/not an independently attested/i)).toBeInTheDocument();
  });

  it('has no jest-axe violations', async () => {
    const { container } = render(<ConsentRecordCard consent={CONSENT} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
