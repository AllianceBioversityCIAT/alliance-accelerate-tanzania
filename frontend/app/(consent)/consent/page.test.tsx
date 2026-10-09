/**
 * /consent/ page tests — actors/consent-intake/consent-request-email T-8
 * (FR-9, FR-10 UI, FR-11, NFR-10, NFR-11).
 *
 * Proven here (jsdom): fragment stripping and its ORDER relative to the
 * first request, the refresh/no-token state, the dead-end page showing no
 * record, the scroll gate wiring (with injected geometry), Accept validation
 * (no call on a missing field), Decline's confirm step and identity-free
 * call, API `details` mapping, and axe on the ready / dead-end / done states.
 *
 * NOT proven here (jsdom has no layout engine): real scroll behaviour,
 * overflow at 375/768/1440, focus visibility and colour contrast (axe reports
 * `color-contrast` as `incomplete`, which does not fail). Those are covered by
 * `lib/contrast.test.ts` (tokens) and the rendered HITL capture.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import ConsentPage from './page';
import { ApiError } from '@/lib/api/client';
import {
  viewConsentRequest,
  respondToConsentRequest,
  type ConsentViewResponse,
} from '@/lib/api/consent-public';

expect.extend(toHaveNoViolations);

jest.mock('@/lib/api/consent-public', () => ({
  viewConsentRequest: jest.fn(),
  respondToConsentRequest: jest.fn(),
}));

const mockView = viewConsentRequest as jest.MockedFunction<typeof viewConsentRequest>;
const mockRespond = respondToConsentRequest as jest.MockedFunction<typeof respondToConsentRequest>;

const VIEW: ConsentViewResponse = {
  organization: 'Kilimo Seeds Ltd',
  expiresAt: '2026-11-01T00:00:00.000Z',
  record: {
    id: 'actor-42',
    traderName: 'Kilimo Seeds Ltd',
    region: 'Arusha',
    district: null,
    traderType: 'seed_company',
    additionalTraderTypes: [],
    capacityTons: 120,
    crops: ['sorghum', 'groundnut'],
    gps: { lat: -3.3869, long: 36.683 },
    sex: null,
    otherCrops: null,
    contactPerson: 'Amina Juma',
    position: 'Manager',
    phone: '+255700000000',
    email: 'amina@kilimo.example',
    marketLocation: null,
  },
  edition: {
    version: 'v1.0',
    acceptanceStatement: 'I confirm that I have read and understood this consent.',
    sections: [
      { heading: 'Purpose', body: 'Intro paragraph.\n- First bullet;\n- Second bullet.' },
      { heading: 'Consent', body: 'By selecting **I accept** below, I consent.' },
    ],
  },
};

// jsdom has no layout: inject deliberate scroll geometry (see
// ConsentPolicyDisclosure.test.tsx for the same technique and its limits).
let mockScrollTop = 0;
const mockClientHeight = 300;
const mockScrollHeight = 1200;
let saved: Record<string, PropertyDescriptor | undefined> = {};

beforeAll(() => {
  saved = {
    scrollTop: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop'),
    clientHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
    scrollHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight'),
  };
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get: () => mockScrollTop,
    set: (v) => {
      mockScrollTop = v;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => mockClientHeight,
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => mockScrollHeight,
  });
});

afterAll(() => {
  for (const [key, desc] of Object.entries(saved)) {
    if (desc) Object.defineProperty(HTMLElement.prototype, key, desc);
  }
});

function openLink(hash = '#t=tok_secret') {
  window.history.replaceState(null, '', `/consent/${hash}`);
}

beforeEach(() => {
  jest.resetAllMocks();
  mockScrollTop = 0;
  openLink();
});

async function renderReady() {
  mockView.mockResolvedValue(VIEW);
  const utils = render(<ConsentPage />);
  await screen.findByRole('heading', { name: 'Information that will be published' });
  return utils;
}

function scrollToEnd() {
  mockScrollTop = mockScrollHeight - mockClientHeight;
  fireEvent.scroll(screen.getByRole('region', { name: /Consent for Publication/ }));
}

function fillRespondent(overrides: Partial<Record<string, string>> = {}) {
  const v = {
    'Name of authorized representative': 'Amina Juma',
    'Position / Title': 'Director',
    Email: 'amina@kilimo.example',
    Telephone: '+255700111222',
    ...overrides,
  };
  for (const [label, value] of Object.entries(v)) {
    fireEvent.change(screen.getByLabelText(new RegExp(label.replace('/', '\\/'))), {
      target: { value },
    });
  }
}

describe('fragment handling (FR-9, NFR-11)', () => {
  it('strips the fragment BEFORE the view request is sent, and before it resolves', () => {
    const replace = jest.spyOn(window.history, 'replaceState');
    mockView.mockReturnValue(new Promise(() => {})); // never resolves

    render(<ConsentPage />);

    expect(replace).toHaveBeenCalledWith(null, '', '/consent/');
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/consent/');
    expect(mockView).toHaveBeenCalledWith('tok_secret');
    // Ordering, not just presence: replaceState ran first.
    const replaceOrder = replace.mock.invocationCallOrder[0];
    const viewOrder = mockView.mock.invocationCallOrder[0];
    expect(replaceOrder).toBeLessThan(viewOrder);
    replace.mockRestore();
  });

  it('a refresh without a fragment shows the open-the-link-again copy, not the dead-end', async () => {
    openLink('');
    render(<ConsentPage />);

    expect(
      await screen.findByRole('heading', { name: 'Open the link from your email again' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('This link is no longer valid')).not.toBeInTheDocument();
    expect(screen.queryByText(/Sylvia Kalemera/)).not.toBeInTheDocument();
    expect(mockView).not.toHaveBeenCalled();
  });
});

describe('dead-end (FR-11)', () => {
  it('404 shows fixed copy and the data-protection contact, and no organization or field', async () => {
    mockView.mockRejectedValue(new ApiError(404, 'This consent link is no longer valid.'));
    const { container } = render(<ConsentPage />);

    expect(
      await screen.findByRole('heading', { name: 'This link is no longer valid' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Sylvia Kalemera')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'S.Kalemera@cgiar.org' })).toHaveAttribute(
      'href',
      'mailto:S.Kalemera@cgiar.org',
    );
    expect(container.textContent).not.toMatch(/Kilimo|Arusha|Amina/);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('429 shows the throttled state and Retry calls view again', async () => {
    mockView.mockRejectedValueOnce(new ApiError(429, 'Too many'));
    render(<ConsentPage />);
    await screen.findByRole('heading', { name: 'Please try again in a moment' });

    mockView.mockResolvedValueOnce(VIEW);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('heading', { name: 'Information that will be published' });
    expect(mockView).toHaveBeenCalledTimes(2);
    expect(mockView).toHaveBeenLastCalledWith('tok_secret');
  });

  it('a network failure shows the error state with Retry', async () => {
    mockView.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<ConsentPage />);
    expect(
      await screen.findByRole('heading', { name: 'We could not reach the server' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('ready state (FR-9)', () => {
  it('shows the public record with em-dash for empty values and GPS, and offers no edit', async () => {
    await renderReady();

    const preview = screen.getByRole('heading', { name: 'Information that will be published' })
      .closest('section') as HTMLElement;
    const dl = preview.querySelector('dl') as HTMLElement;
    expect(within(dl).getByText('Amina Juma')).toBeInTheDocument();
    expect(within(dl).getByText('+255700000000')).toBeInTheDocument();
    expect(within(dl).getByText('amina@kilimo.example')).toBeInTheDocument();
    expect(within(dl).getByText('3.3869° S, 36.6830° E')).toBeInTheDocument();
    expect(within(dl).getByText('Sorghum, Groundnut')).toBeInTheDocument();
    expect(within(dl).getAllByText('—').length).toBeGreaterThanOrEqual(3);
    // No input lives in the preview.
    expect(preview.querySelector('input, textarea, select')).toBeNull();
  });

  it('lists the additional actor types the accept would publish', async () => {
    mockView.mockResolvedValue({
      ...VIEW,
      record: { ...VIEW.record, additionalTraderTypes: ['ngo', 'offtaker'] },
    });
    render(<ConsentPage />);
    const heading = await screen.findByRole('heading', { name: 'Information that will be published' });
    const dl = (heading.closest('section') as HTMLElement).querySelector('dl') as HTMLElement;

    expect(within(dl).getByText('Other types')).toBeInTheDocument();
    expect(within(dl).getByText('NGO, Offtaker')).toBeInTheDocument();
  });

  it('shows the organization read-only and four EMPTY required inputs', async () => {
    await renderReady();
    expect(screen.getAllByText('Kilimo Seeds Ltd').length).toBeGreaterThan(0);
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    // name, position, email -> textbox; telephone -> textbox as well (type=tel)
    expect(inputs).toHaveLength(4);
    inputs.forEach((i) => expect(i.value).toBe(''));
  });

  it('renders edition bullets as a list and **bold** as <strong>, with no raw markers', async () => {
    const { container } = await renderReady();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'First bullet;',
      'Second bullet.',
    ]);
    const strong = container.querySelector('strong');
    expect(strong?.textContent).toBe('I accept');
    expect(container.textContent).not.toContain('**');
  });

  it('keeps the checkbox disabled until the text has been read to its end', async () => {
    await renderReady();
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeDisabled();

    mockScrollTop = 200; // 200 + 300 < 1200
    fireEvent.scroll(screen.getByRole('region', { name: /Consent for Publication/ }));
    expect(checkbox).toBeDisabled();

    scrollToEnd();
    expect(checkbox).toBeEnabled();
  });
});

describe('Accept (FR-9, FR-10)', () => {
  it('with an empty Position shows a field error naming Position and makes no call', async () => {
    await renderReady();
    scrollToEnd();
    fireEvent.click(screen.getByRole('checkbox'));
    fillRespondent({ 'Position / Title': '' });

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    const position = screen.getByLabelText(/Position \/ Title/);
    expect(position).toHaveAttribute('aria-invalid', 'true');
    const describedBy = position.getAttribute('aria-describedby') as string;
    expect(document.getElementById(describedBy)).toHaveTextContent('Enter your position or title.');
    expect(mockRespond).not.toHaveBeenCalled();
  });

  it('without the checkbox ticked shows the checkbox error and makes no call', async () => {
    await renderReady();
    fillRespondent();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(
      screen.getByText('Read the consent text to the end and tick the box to accept.'),
    ).toBeInTheDocument();
    expect(mockRespond).not.toHaveBeenCalled();
  });

  it('with everything complete sends the trimmed identity and shows the published-profile link', async () => {
    await renderReady();
    scrollToEnd();
    fireEvent.click(screen.getByRole('checkbox'));
    fillRespondent({ Email: '  amina@kilimo.example ' });
    mockRespond.mockResolvedValue({ decision: 'ACCEPT' });

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await screen.findByRole('heading', { name: 'Thank you, your consent is recorded' });
    expect(mockRespond).toHaveBeenCalledWith('tok_secret', {
      decision: 'ACCEPT',
      accepted: true,
      respondent: {
        name: 'Amina Juma',
        position: 'Director',
        email: 'amina@kilimo.example',
        phone: '+255700111222',
      },
    });
    expect(screen.getByRole('link', { name: 'View your public profile' })).toHaveAttribute(
      'href',
      '/profile?id=actor-42',
    );
  });

  it('maps API details to the named field and stays on the form', async () => {
    await renderReady();
    scrollToEnd();
    fireEvent.click(screen.getByRole('checkbox'));
    fillRespondent();
    mockRespond.mockRejectedValue(
      new ApiError(400, 'Validation failed', [{ field: 'respondent.phone', message: 'x' }]),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() =>
      expect(screen.getByLabelText(/Telephone/)).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(screen.getByText('Enter your telephone number.')).toBeInTheDocument();
  });

  it('a 404 on respond (link used elsewhere) goes to the dead-end', async () => {
    await renderReady();
    scrollToEnd();
    fireEvent.click(screen.getByRole('checkbox'));
    fillRespondent();
    mockRespond.mockRejectedValue(new ApiError(404, 'gone'));

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(
      await screen.findByRole('heading', { name: 'This link is no longer valid' }),
    ).toBeInTheDocument();
  });

  it('a network failure keeps the entered values and shows a retryable alert', async () => {
    await renderReady();
    scrollToEnd();
    fireEvent.click(screen.getByRole('checkbox'));
    fillRespondent();
    mockRespond.mockRejectedValue(new TypeError('Failed to fetch'));

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not record your response');
    expect((screen.getByLabelText(/Name of authorized/) as HTMLInputElement).value).toBe('Amina Juma');
    expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled();
  });
});

describe('Decline (FR-9, FR-10)', () => {
  it('needs nothing: a confirm step first, then respond with no identity', async () => {
    await renderReady();

    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(mockRespond).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Decline publication?' })).toBeInTheDocument();

    mockRespond.mockResolvedValue({ decision: 'DECLINE' });
    fireEvent.click(screen.getByRole('button', { name: 'Yes, decline' }));

    await screen.findByRole('heading', { name: 'Your decision is recorded' });
    expect(mockRespond).toHaveBeenCalledTimes(1);
    expect(mockRespond).toHaveBeenCalledWith('tok_secret', { decision: 'DECLINE' });
  });

  it('Go back returns to the actions without calling the API', async () => {
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(mockRespond).not.toHaveBeenCalled();
  });
});

describe('accessibility (jsdom-provable subset; contrast is `incomplete` here)', () => {
  it('ready state has no axe violations', async () => {
    const { container } = await renderReady();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('decline-confirm step has no axe violations', async () => {
    const { container } = await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ready state with field errors has no axe violations', async () => {
    const { container } = await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(await axe(container)).toHaveNoViolations();
  });

  it('dead-end has no axe violations', async () => {
    mockView.mockRejectedValue(new ApiError(404, 'gone'));
    const { container } = render(<ConsentPage />);
    await screen.findByRole('heading', { name: 'This link is no longer valid' });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('done (accepted and declined) have no axe violations', async () => {
    const accepted = await renderReady();
    scrollToEnd();
    fireEvent.click(screen.getByRole('checkbox'));
    fillRespondent();
    mockRespond.mockResolvedValue({ decision: 'ACCEPT' });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await screen.findByRole('heading', { name: 'Thank you, your consent is recorded' });
    expect(await axe(accepted.container)).toHaveNoViolations();
    accepted.unmount();

    openLink();
    const declined = await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    mockRespond.mockResolvedValue({ decision: 'DECLINE' });
    fireEvent.click(screen.getByRole('button', { name: 'Yes, decline' }));
    await screen.findByRole('heading', { name: 'Your decision is recorded' });
    expect(await axe(declined.container)).toHaveNoViolations();
  });
});
