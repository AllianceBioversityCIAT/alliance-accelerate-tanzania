// @sdd-spec actors/consent-intake/consent-request-email (T-11)
/**
 * ConsentDocumentField (FR-15): client-side type/size refusal with NO network
 * call, the unconfigured state, the deferred and immediate modes, and the
 * real presigned-POST sequence of `uploadConsentDocument`.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import { ConsentDocumentField } from './ConsentDocumentField';

expect.extend(toHaveNoViolations);

// Real client functions, a routed `fetch`: `uploadConsentDocument` calls its
// siblings inside the module, so mocking them by export would not intercept
// anything — and asserting the wire (URL, body, order) is the point.
const TOKEN = 'tok';
const BASE = 'https://api.example.com';
const BUCKET = 'https://bucket.s3.example/upload';
const mockFetch = jest.fn();

function json(body: unknown, status = 200) {
  return { ok: status < 400, status, statusText: '', json: async () => body };
}

let statusBody: unknown = { enabled: true };
let bucketResponse: { ok: boolean; status: number } = { ok: true, status: 204 };

const pdf = (bytes = 2048, name = 'consent.pdf') =>
  new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });

const STORED = {
  id: 'doc-1',
  actorId: 'actor-1',
  fileName: 'consent.pdf',
  contentType: 'application/pdf',
  sizeBytes: 2048,
  uploadedBySub: 'sub-1',
  uploadedByEmail: 'admin@example.org',
  createdAt: '2026-10-01T10:00:00.000Z',
  storedAt: '2026-10-01T10:00:02.000Z',
};

beforeEach(() => {
  jest.resetAllMocks();
  process.env.NEXT_PUBLIC_API_BASE_URL = BASE;
  statusBody = { enabled: true };
  bucketResponse = { ok: true, status: 204 };
  mockFetch.mockImplementation(async (url: string) => {
    if (url === `${BASE}/api/v1/admin/consent-documents/status`) {
      if (statusBody instanceof Error) throw statusBody;
      return json(statusBody);
    }
    if (url === `${BASE}/api/v1/admin/actors/actor-1/consent-documents/upload-url`) {
      return json(
        {
          documentId: 'doc-1',
          url: BUCKET,
          fields: { key: 'incoming/doc-1', 'Content-Type': 'application/pdf', Policy: 'p' },
        },
        201,
      );
    }
    if (url === BUCKET) return bucketResponse;
    if (url === `${BASE}/api/v1/admin/consent-documents/doc-1/confirm`) return json(STORED, 201);
    throw new Error(`unrouted fetch ${url}`);
  });
  global.fetch = mockFetch as unknown as typeof fetch;
});

/** Every fetch that is NOT the status probe — i.e. any upload traffic. */
const uploadTraffic = () =>
  mockFetch.mock.calls.filter(([url]) => url !== `${BASE}/api/v1/admin/consent-documents/status`);

async function enabledInput() {
  const input = (await screen.findByLabelText(/consent document/i)) as HTMLInputElement;
  await waitFor(() => expect(input).toBeEnabled());
  return input;
}

describe('ConsentDocumentField — client-side checks (FR-15)', () => {
  it.each([
    ['a 12 MB PDF', pdf(12 * 1024 * 1024), 'The file is larger than 10 MB. Choose a smaller file.'],
    [
      'a .docx file',
      new File(['x'], 'consent.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
      'Choose a PDF, JPG or PNG file.',
    ],
  ])('rejects %s with a field error and makes NO network call', async (_label, file, message) => {
    const onUploaded = jest.fn();
    render(<ConsentDocumentField mode="immediate" actorId="actor-1" token={TOKEN} onAuthFailure={jest.fn()} onUploaded={onUploaded} />);

    fireEvent.change(await enabledInput(), { target: { files: [file] } });

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    const input = screen.getByLabelText(/consent document/i);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    // Every visible field error must be in the input's accessible description.
    expect(input).toHaveAccessibleDescription(new RegExp(message.replace(/[.]/g, '\\.')));
    expect(uploadTraffic()).toHaveLength(0);
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('accepts exactly 10 MB', async () => {
    const onFileChange = jest.fn();
    render(<ConsentDocumentField mode="deferred" file={null} onFileChange={onFileChange} token={TOKEN} onAuthFailure={jest.fn()} />);
    const file = pdf(10_485_760);

    fireEvent.change(await enabledInput(), { target: { files: [file] } });

    expect(onFileChange).toHaveBeenCalledWith(file);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ConsentDocumentField — unconfigured storage (FR-15)', () => {
  it('is disabled and says uploads are unavailable', async () => {
    statusBody = { enabled: false };
    render(<ConsentDocumentField mode="immediate" actorId="actor-1" token={TOKEN} onAuthFailure={jest.fn()} onUploaded={jest.fn()} />);

    expect(await screen.findByText(/uploads are unavailable here/i)).toBeInTheDocument();
    const input = screen.getByLabelText(/consent document/i);
    expect(input).toBeDisabled();
    expect(input).toHaveAccessibleDescription(/uploads are unavailable here/i);
  });

  it('is disabled with an explanation when the status check itself fails', async () => {
    statusBody = new Error('boom');
    render(<ConsentDocumentField mode="immediate" actorId="actor-1" token={TOKEN} onAuthFailure={jest.fn()} onUploaded={jest.fn()} />);

    expect(await screen.findByText(/could not check whether uploads are available/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/consent document/i)).toBeDisabled();
  });
});

describe('ConsentDocumentField — deferred mode (create form)', () => {
  it('only holds the file: no network call beyond the status check', async () => {
    const onFileChange = jest.fn();
    render(<ConsentDocumentField mode="deferred" file={null} onFileChange={onFileChange} token={TOKEN} onAuthFailure={jest.fn()} />);
    const file = pdf();

    fireEvent.change(await enabledInput(), { target: { files: [file] } });

    expect(onFileChange).toHaveBeenCalledWith(file);
    expect(uploadTraffic()).toHaveLength(0);
  });

  it('shows the held file with a Remove action', async () => {
    const onFileChange = jest.fn();
    render(<ConsentDocumentField mode="deferred" file={pdf()} onFileChange={onFileChange} token={TOKEN} onAuthFailure={jest.fn()} />);

    expect(await screen.findByText('Selected: consent.pdf')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onFileChange).toHaveBeenCalledWith(null);
  });

  it('has no axe violations (enabled and unavailable)', async () => {
    const { container, unmount } = render(
      <ConsentDocumentField mode="deferred" file={null} onFileChange={jest.fn()} token={TOKEN} onAuthFailure={jest.fn()} />,
    );
    await enabledInput();
    expect(await axe(container)).toHaveNoViolations();
    unmount();

    statusBody = { enabled: false };
    const second = render(
      <ConsentDocumentField mode="deferred" file={null} onFileChange={jest.fn()} token={TOKEN} onAuthFailure={jest.fn()} />,
    );
    await screen.findByText(/uploads are unavailable here/i);
    expect(await axe(second.container)).toHaveNoViolations();
  });
});

describe('ConsentDocumentField — immediate mode (evidence panel)', () => {
  it('runs upload-url → presigned POST (fields first, file last) → confirm, then reports the stored document', async () => {
    const onUploaded = jest.fn();
    render(<ConsentDocumentField mode="immediate" actorId="actor-1" token={TOKEN} onAuthFailure={jest.fn()} onUploaded={onUploaded} />);
    const file = pdf();

    fireEvent.change(await enabledInput(), { target: { files: [file] } });

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(STORED));

    const calls = uploadTraffic();
    expect(calls.map(([url]) => url)).toEqual([
      `${BASE}/api/v1/admin/actors/actor-1/consent-documents/upload-url`,
      BUCKET,
      `${BASE}/api/v1/admin/consent-documents/doc-1/confirm`, // confirm only AFTER the object is stored
    ]);
    expect(JSON.parse(calls[0][1].body)).toEqual({
      fileName: 'consent.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
    });
    expect(calls[0][1].headers.Authorization).toBe(`Bearer ${TOKEN}`);

    const bucketInit = calls[1][1];
    expect(bucketInit.method).toBe('POST');
    expect(bucketInit.headers).toBeUndefined(); // no Authorization to the bucket; the policy is the credential
    expect(Array.from((bucketInit.body as FormData).keys())).toEqual(['key', 'Content-Type', 'Policy', 'file']); // `file` LAST
    expect((bucketInit.body as FormData).get('file')).toBe(file);
    expect(await screen.findByText('consent.pdf attached.')).toBeInTheDocument();
  });

  it('does not confirm, and says so, when storage refuses the object', async () => {
    bucketResponse = { ok: false, status: 403 };
    const onUploaded = jest.fn();
    render(<ConsentDocumentField mode="immediate" actorId="actor-1" token={TOKEN} onAuthFailure={jest.fn()} onUploaded={onUploaded} />);

    fireEvent.change(await enabledInput(), { target: { files: [pdf()] } });

    expect(await screen.findByRole('alert')).toHaveTextContent('The document could not be uploaded. Try again.');
    expect(screen.getByLabelText(/consent document/i)).toHaveAccessibleDescription(
      /The document could not be uploaded\. Try again\./,
    );
    expect(uploadTraffic().map(([url]) => url)).not.toContain(`${BASE}/api/v1/admin/consent-documents/doc-1/confirm`);
    expect(onUploaded).not.toHaveBeenCalled();
  });
});
