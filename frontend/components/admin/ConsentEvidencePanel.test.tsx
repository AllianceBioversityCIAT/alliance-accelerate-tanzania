// @sdd-spec actors/consent-intake/consent-request-email (T-11)
/**
 * ConsentEvidencePanel (FR-14, FR-16): the auditor walk-through, the empty
 * state, the derived EXPIRED badge, "Read exact text", Download, and the
 * immediate attach. The expected values come from the requirements
 * scenarios, not from the component's own constants.
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import { ConsentEvidencePanel } from './ConsentEvidencePanel';
import type { ConsentEvidence } from '@/lib/api/consent-requests-admin';

expect.extend(toHaveNoViolations);

const mockEvidence = jest.fn();
const mockEdition = jest.fn();
const mockDownload = jest.fn();
const mockDocumentStatus = jest.fn();
const mockUpload = jest.fn();

jest.mock('@/lib/api/consent-requests-admin', () => ({
  ...jest.requireActual('@/lib/api/consent-requests-admin'),
  getActorConsentEvidence: (...a: unknown[]) => mockEvidence(...a),
  getConsentEdition: (...a: unknown[]) => mockEdition(...a),
  getConsentDocumentDownloadUrl: (...a: unknown[]) => mockDownload(...a),
  getConsentDocumentStatus: (...a: unknown[]) => mockDocumentStatus(...a),
  uploadConsentDocument: (...a: unknown[]) => mockUpload(...a),
}));

const TOKEN = 'tok';

const REQUEST_BASE = {
  actorId: 'actor-1',
  recipientEmail: 'asha@example.com',
  editionVersion: 'v1.0',
  editionHash: 'abc123',
  requestedBySub: 'sub-admin',
  requestedByEmail: 'daniela.admin@example.org',
  createdAt: '2026-09-30T08:00:00.000Z',
  expiresAt: '2026-10-30T08:00:00.000Z',
  failureReason: null,
  respondedAt: null,
  respondentName: null,
  respondentPosition: null,
  respondentEmail: null,
  respondentPhone: null,
  respondentIp: null,
  respondentUserAgent: null,
  supersededAt: null,
};

const ANSWERED = {
  ...REQUEST_BASE,
  id: 'req-answered',
  status: 'ACCEPTED' as const,
  sentAt: '2026-10-01T09:15:00.000Z',
  respondedAt: '2026-10-02T14:05:00.000Z',
  respondentName: 'Asha Mwinyi',
  respondentPosition: 'Managing Director',
  respondentEmail: 'asha.personal@example.com',
  respondentPhone: '+255700111222',
  respondentIp: '203.0.113.7',
  respondentUserAgent: 'Mozilla/5.0 (Test)',
};

const EXPIRED = {
  ...REQUEST_BASE,
  id: 'req-expired',
  status: 'EXPIRED' as const,
  sentAt: '2026-08-01T09:15:00.000Z',
  recipientEmail: 'old@example.com',
};

const DOCUMENT = {
  id: 'doc-1',
  actorId: 'actor-1',
  fileName: 'signed-form.pdf',
  contentType: 'application/pdf',
  sizeBytes: 2_097_152,
  uploadedBySub: 'sub-admin',
  uploadedByEmail: 'daniela.admin@example.org',
  createdAt: '2026-09-29T10:00:00.000Z',
  storedAt: '2026-09-29T10:00:03.000Z',
};

const FULL: ConsentEvidence = { requests: [ANSWERED, EXPIRED], documents: [DOCUMENT] };

function renderPanel(onAuthFailure = jest.fn()) {
  return render(<ConsentEvidencePanel actorId="actor-1" token={TOKEN} onAuthFailure={onAuthFailure} />);
}

beforeEach(() => {
  jest.resetAllMocks();
  mockEvidence.mockResolvedValue(FULL);
  mockDocumentStatus.mockResolvedValue({ enabled: true });
});

describe('ConsentEvidencePanel — the auditor walk-through (FR-14)', () => {
  it('states who sent the request, when, to which address, under which edition, and who answered, when, with what identity', async () => {
    renderPanel();
    const card = (await screen.findByText('Accepted')).closest('li') as HTMLElement;

    const text = within(card);
    expect(text.getByText('daniela.admin@example.org')).toBeInTheDocument(); // sent by
    expect(text.getByText('01 Oct 2026, 09:15 UTC')).toBeInTheDocument(); // sent at, explicit timezone
    expect(text.getByText('asha@example.com')).toBeInTheDocument(); // address used
    expect(text.getAllByText('v1.0').length).toBeGreaterThan(0); // edition
    expect(text.getByRole('button', { name: 'Read exact text' })).toBeInTheDocument();
    expect(text.getByText('Asha Mwinyi')).toBeInTheDocument(); // respondent
    expect(text.getByText('Managing Director')).toBeInTheDocument();
    expect(text.getByText('asha.personal@example.com')).toBeInTheDocument();
    expect(text.getByText('+255700111222')).toBeInTheDocument();
    expect(text.getByText('02 Oct 2026, 14:05 UTC')).toBeInTheDocument(); // response time + zone
    expect(text.getByText('Server time when the response was received.')).toBeInTheDocument(); // qualifier
    expect(text.getByText('203.0.113.7')).toBeInTheDocument(); // IP
    expect(text.getByText('Mozilla/5.0 (Test)')).toBeInTheDocument(); // UA
  });

  it.each([
    ['transport_rejected', /could not be delivered/i],
    ['stale_claim', /may already have arrived/i],
    ['timeout', /did not answer in time/i],
  ])('shows a human label, not the raw code, for failureReason %s', async (code, label) => {
    mockEvidence.mockResolvedValue({
      requests: [{ ...EXPIRED, status: 'FAILED' as const, failureReason: code }],
      documents: [],
    });
    renderPanel();
    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.queryByText(code)).not.toBeInTheDocument();
  });

  it('lists requests in the order the API returns them (newest first) and then the documents', async () => {
    renderPanel();
    await screen.findByText('Accepted');
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Accepted');
    expect(items[1]).toHaveTextContent('Expired');
    expect(items[2]).toHaveTextContent('signed-form.pdf');
  });

  it('shows the derived EXPIRED badge with the warning pairing and no /NN modifier', async () => {
    renderPanel();
    const badge = await screen.findByText('Expired');
    expect(badge).toHaveClass('bg-surface-alt', 'text-warning');
    expect(badge.className).not.toMatch(/\/\d/);
  });

  it('shows the empty state when there is no evidence yet', async () => {
    mockEvidence.mockResolvedValue({ requests: [], documents: [] });
    renderPanel();
    expect(await screen.findByText('No consent evidence yet.')).toBeInTheDocument();
  });

  it('offers a retry when the evidence cannot be loaded', async () => {
    mockEvidence.mockRejectedValueOnce(new Error('boom'));
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load the consent evidence.');
    mockEvidence.mockResolvedValueOnce(FULL);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Accepted')).toBeInTheDocument();
  });

  it('has no axe violations (full and empty)', async () => {
    const { container, unmount } = renderPanel();
    await screen.findByText('Accepted');
    expect(await axe(container)).toHaveNoViolations();
    unmount();

    mockEvidence.mockResolvedValue({ requests: [], documents: [] });
    const empty = renderPanel();
    await screen.findByText('No consent evidence yet.');
    expect(await axe(empty.container)).toHaveNoViolations();
  });
});

describe('ConsentEvidencePanel — Read exact text', () => {
  it('opens the edition through admin/consent-editions/:version and shows its sections', async () => {
    mockEdition.mockResolvedValue({
      version: 'v1.0',
      issuedAt: '2026-01-01',
      sections: [{ heading: 'Purpose', body: 'We publish your profile.' }],
      acceptanceStatement: 'I accept.',
    });
    renderPanel();
    const card = (await screen.findByText('Accepted')).closest('li') as HTMLElement;

    const button = within(card).getByRole('button', { name: 'Read exact text' });
    fireEvent.click(button);

    expect(await within(card).findByText('We publish your profile.')).toBeInTheDocument();
    expect(within(card).getByText('I accept.')).toBeInTheDocument();
    expect(mockEdition).toHaveBeenCalledWith('v1.0', TOKEN);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(within(card).getByRole('region', { name: /edition v1\.0/i })).toHaveAttribute('tabindex', '0');

    fireEvent.click(within(card).getByRole('button', { name: 'Hide text' }));
    expect(within(card).queryByText('We publish your profile.')).not.toBeInTheDocument();
  });

  it('says so when the edition text cannot be loaded', async () => {
    mockEdition.mockRejectedValue(new Error('404'));
    renderPanel();
    const card = (await screen.findByText('Accepted')).closest('li') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'Read exact text' }));
    expect(await within(card).findByRole('alert')).toHaveTextContent('We could not load the edition text.');
  });
});

describe('ConsentEvidencePanel — documents (FR-14, FR-16)', () => {
  it('lists file name, size, uploader and upload time', async () => {
    renderPanel();
    const row = (await screen.findByText('signed-form.pdf')).closest('li') as HTMLElement;
    expect(within(row).getByText('2.0 MB')).toBeInTheDocument();
    expect(within(row).getByText('daniela.admin@example.org')).toBeInTheDocument();
    expect(within(row).getByText(/^29 Sept? 2026, 10:00 UTC$/)).toBeInTheDocument();
  });

  it('Download asks for a presigned URL and navigates to it without leaving the page', async () => {
    mockDownload.mockResolvedValue({ url: 'https://bucket.s3.example/stored/doc-1?sig=1', expiresAt: '2026-10-06T10:05:00.000Z' });
    const clicks: string[] = [];
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.href);
    });
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Download signed-form.pdf' }));

    await waitFor(() => expect(clicks).toEqual(['https://bucket.s3.example/stored/doc-1?sig=1']));
    expect(mockDownload).toHaveBeenCalledWith('doc-1', TOKEN);
    clickSpy.mockRestore();
  });

  it('reports a failed download', async () => {
    mockDownload.mockRejectedValue(new Error('503'));
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Download signed-form.pdf' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not prepare the download.');
  });

  it('routes an expired session to onAuthFailure', async () => {
    const { AuthFailureError } = jest.requireActual('@/lib/api/client');
    mockEvidence.mockRejectedValue(new AuthFailureError());
    const onAuthFailure = jest.fn();
    renderPanel(onAuthFailure);
    await waitFor(() => expect(onAuthFailure).toHaveBeenCalled());
  });
});

describe('ConsentEvidencePanel — attaching a document (FR-15, immediate mode)', () => {
  it('uploads on choose and lists the stored document at the top, without a reload', async () => {
    const attached = { ...DOCUMENT, id: 'doc-2', fileName: 'second.pdf' };
    mockUpload.mockResolvedValue(attached);
    renderPanel();
    await screen.findByText('signed-form.pdf');
    const input = screen.getByLabelText(/consent document/i);
    await waitFor(() => expect(input).toBeEnabled());
    const file = new File(['%PDF'], 'second.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(mockUpload).toHaveBeenCalledWith('actor-1', file, TOKEN));
    await screen.findByText('second.pdf', { selector: 'dd' });
    const docs = screen.getAllByRole('listitem').filter((li) => /\.pdf/.test(li.textContent ?? ''));
    expect(docs[0]).toHaveTextContent('second.pdf');
  });

  it('keeps the field disabled with the reason when storage is unconfigured', async () => {
    mockDocumentStatus.mockResolvedValue({ enabled: false });
    renderPanel();
    expect(await screen.findByText(/uploads are unavailable here/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/consent document/i)).toBeDisabled();
  });
});
