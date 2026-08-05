/**
 * Unit tests for ConsentPolicyDisclosure (T-18, FR-3 scenarios 1-2, DC-17).
 *
 * What IS proven here:
 *   - unticked and disabled at every initial render, before the policy has
 *     even loaded (controlled `checked` prop + `disabled={!reachedEnd}`)
 *   - progress text derives its section count from the FETCHED payload
 *     (four sections in the fixture below, never a hardcoded "of 6")
 *   - the scroll region is keyboard-focusable (`tabIndex=0`, `role="region"`,
 *     labelled) and the checkbox carries `aria-describedby`
 *   - a load failure renders a message and leaves the gate disabled (the
 *     gate must not silently pass when the policy itself never rendered)
 *   - the WIRING between a `scroll` DOM event, the pure `hasReachedScrollEnd`
 *     predicate, and the component's `reachedEnd` state: this file overrides
 *     `HTMLElement.prototype.scrollTop/clientHeight/scrollHeight` with
 *     `Object.defineProperty` to inject deliberate, non-degenerate geometry
 *     (e.g. `scrollHeight: 1200, clientHeight: 300`) — NOT jsdom's default
 *     zeroes. This proves the component correctly reads DOM metrics and
 *     calls the predicate; it does not and cannot prove that a real
 *     browser's layout of the real policy text produces these numbers at
 *     the moment an applicant has actually finished reading.
 *
 * What is explicitly NOT proven here (DC-17 — routed to a human check,
 * documented in ConsentPolicyDisclosure.tsx's file header):
 *   - that scrolling the REAL rendered text in a REAL browser enables the
 *     checkbox at the REAL end and not before
 *   - that a short real policy is scrollable-free in a real browser the way
 *     the injected "content shorter than container" case simulates
 *   - contrast, focus order, focus visibility (KZ-002/DC-16, same as every
 *     other component in this module)
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import ConsentPolicyDisclosure from './ConsentPolicyDisclosure';
import { getConsentPolicy, type ConsentPolicy } from '@/lib/api/registrations';

expect.extend(toHaveNoViolations);

jest.mock('@/lib/api/registrations', () => ({
  getConsentPolicy: jest.fn(),
}));

const mockGetConsentPolicy = getConsentPolicy as jest.MockedFunction<typeof getConsentPolicy>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FOUR_SECTION_POLICY: ConsentPolicy = {
  version: 'v1.0-placeholder',
  sections: [
    { heading: 'What we collect', body: 'Body one.' },
    { heading: 'Why we collect it', body: 'Body two.' },
    { heading: 'How it is published', body: 'Body three.' },
    { heading: 'Your rights', body: 'Body four.' },
  ],
};

// ---------------------------------------------------------------------------
// Scroll-geometry override helpers
// ---------------------------------------------------------------------------
//
// jsdom's HTMLElement always reports scrollTop/clientHeight/scrollHeight as
// 0 — there is no layout engine. Object.defineProperty on the prototype is
// the standard technique to inject deliberate, non-zero geometry so a test
// can distinguish "not yet at the end" from "at the end" rather than only
// ever observing jsdom's degenerate 0/0/0 (which the predicate itself
// already treats as "content fits" — see consent-scroll-gate.test.ts).

let mockScrollTop = 0;
let mockClientHeight = 300;
let mockScrollHeight = 1200;

function setScrollGeometry(next: { scrollTop?: number; clientHeight?: number; scrollHeight?: number }) {
  if (next.scrollTop !== undefined) mockScrollTop = next.scrollTop;
  if (next.clientHeight !== undefined) mockClientHeight = next.clientHeight;
  if (next.scrollHeight !== undefined) mockScrollHeight = next.scrollHeight;
}

let originalScrollTop: PropertyDescriptor | undefined;
let originalClientHeight: PropertyDescriptor | undefined;
let originalScrollHeight: PropertyDescriptor | undefined;

beforeAll(() => {
  originalScrollTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
  originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');

  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get() {
      return mockScrollTop;
    },
    set(v) {
      mockScrollTop = v;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return mockClientHeight;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      return mockScrollHeight;
    },
  });
});

afterAll(() => {
  if (originalScrollTop) Object.defineProperty(HTMLElement.prototype, 'scrollTop', originalScrollTop);
  if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
  if (originalScrollHeight) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight);
});

beforeEach(() => {
  jest.resetAllMocks();
  // Default: a genuinely scrollable region, not yet at the end — the
  // "normal" case for the structure/error/progress-text tests below.
  setScrollGeometry({ scrollTop: 0, clientHeight: 300, scrollHeight: 1200 });
});

// ---------------------------------------------------------------------------
// Initial render — unticked and disabled (FR-3 scenario 1)
// ---------------------------------------------------------------------------

describe('ConsentPolicyDisclosure — initial render', () => {
  it('is unticked and disabled before the policy has loaded', () => {
    mockGetConsentPolicy.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ConsentPolicyDisclosure checked={false} onChange={jest.fn()} />);

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox).toBeDisabled();
  });

  it('stays disabled immediately after the policy loads, with scrollable content not yet at the end', async () => {
    mockGetConsentPolicy.mockResolvedValue(FOUR_SECTION_POLICY);
    render(<ConsentPolicyDisclosure checked={false} onChange={jest.fn()} />);

    await screen.findByText('What we collect');

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox).toBeDisabled();
  });

  it('renders a labelled, keyboard-focusable scroll region', async () => {
    mockGetConsentPolicy.mockResolvedValue(FOUR_SECTION_POLICY);
    render(<ConsentPolicyDisclosure checked={false} onChange={jest.fn()} />);

    const region = await screen.findByRole('region', {
      name: /data protection & participant consent policy/i,
    });
    expect(region).toHaveAttribute('tabIndex', '0');
  });
});

// ---------------------------------------------------------------------------
// Progress text derives its count from the fetched payload (obligation 2)
// ---------------------------------------------------------------------------

describe('ConsentPolicyDisclosure — progress text', () => {
  it('states the section count from the FETCHED payload (4), not a hardcoded literal', async () => {
    mockGetConsentPolicy.mockResolvedValue(FOUR_SECTION_POLICY);
    render(<ConsentPolicyDisclosure checked={false} onChange={jest.fn()} />);

    await screen.findByText('What we collect');
    expect(screen.getByText(/4 sections to review/i)).toBeInTheDocument();
    expect(screen.queryByText(/of 6/i)).not.toBeInTheDocument();
  });

  it('reflects a different fetched section count (2) instead of assuming any fixed number', async () => {
    mockGetConsentPolicy.mockResolvedValue({
      version: 'v2.0',
      sections: [
        { heading: 'One', body: 'Body one.' },
        { heading: 'Two', body: 'Body two.' },
      ],
    });
    render(<ConsentPolicyDisclosure checked={false} onChange={jest.fn()} />);

    await screen.findByText('One');
    expect(screen.getByText(/2 sections to review/i)).toBeInTheDocument();
  });

  it('updates the progress text once the end is reached', async () => {
    mockGetConsentPolicy.mockResolvedValue(FOUR_SECTION_POLICY);
    render(<ConsentPolicyDisclosure checked={false} onChange={jest.fn()} />);
    await screen.findByText('What we collect');

    const region = screen.getByRole('region');
    setScrollGeometry({ scrollTop: 900 }); // scrollTop + clientHeight(300) >= scrollHeight(1200)
    fireEvent.scroll(region);

    expect(await screen.findByText(/reached the end of the policy \(4 sections\)/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Load failure — the gate must not silently pass
// ---------------------------------------------------------------------------

describe('ConsentPolicyDisclosure — load failure', () => {
  it('renders a failure message and keeps the checkbox disabled when the policy fails to load', async () => {
    mockGetConsentPolicy.mockResolvedValue(null);
    render(<ConsentPolicyDisclosure checked={false} onChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load the consent policy/i);
    });
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Scroll-gate wiring (deliberately injected, non-degenerate geometry)
// ---------------------------------------------------------------------------

describe('ConsentPolicyDisclosure — scroll-gate wiring', () => {
  it('does NOT enable the checkbox on a scroll event that is not yet at the end', async () => {
    mockGetConsentPolicy.mockResolvedValue(FOUR_SECTION_POLICY);
    render(<ConsentPolicyDisclosure checked={false} onChange={jest.fn()} />);
    await screen.findByText('What we collect');

    const region = screen.getByRole('region');
    setScrollGeometry({ scrollTop: 200 }); // 200 + 300 = 500, far short of 1200
    fireEvent.scroll(region);

    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('enables the checkbox once a scroll event reports the end has been reached', async () => {
    mockGetConsentPolicy.mockResolvedValue(FOUR_SECTION_POLICY);
    render(<ConsentPolicyDisclosure checked={false} onChange={jest.fn()} />);
    await screen.findByText('What we collect');

    const region = screen.getByRole('region');
    expect(screen.getByRole('checkbox')).toBeDisabled();

    setScrollGeometry({ scrollTop: 900 }); // 900 + 300 = 1200 === scrollHeight
    fireEvent.scroll(region);

    await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeDisabled());
  });

  it('stays enabled after reaching the end even if the applicant scrolls back up (one-way gate)', async () => {
    mockGetConsentPolicy.mockResolvedValue(FOUR_SECTION_POLICY);
    render(<ConsentPolicyDisclosure checked={false} onChange={jest.fn()} />);
    await screen.findByText('What we collect');

    const region = screen.getByRole('region');
    setScrollGeometry({ scrollTop: 900 });
    fireEvent.scroll(region);
    await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeDisabled());

    setScrollGeometry({ scrollTop: 0 }); // scrolled back to the top
    fireEvent.scroll(region);

    expect(screen.getByRole('checkbox')).not.toBeDisabled();
  });

  it('content shorter than its container enables the checkbox with no scroll event at all (DD-8)', async () => {
    setScrollGeometry({ scrollTop: 0, clientHeight: 300, scrollHeight: 150 });
    mockGetConsentPolicy.mockResolvedValue(FOUR_SECTION_POLICY);
    render(<ConsentPolicyDisclosure checked={false} onChange={jest.fn()} />);

    await screen.findByText('What we collect');
    await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeDisabled());
  });

  it('calls onChange with the new value when the (enabled) checkbox is toggled', async () => {
    mockGetConsentPolicy.mockResolvedValue(FOUR_SECTION_POLICY);
    const onChange = jest.fn();
    render(<ConsentPolicyDisclosure checked={false} onChange={onChange} />);
    await screen.findByText('What we collect');

    const region = screen.getByRole('region');
    setScrollGeometry({ scrollTop: 900 });
    fireEvent.scroll(region);
    await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeDisabled());

    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

// ---------------------------------------------------------------------------
// One-error-source contract — controlled props, no internal state (T-17 obligation 1)
// ---------------------------------------------------------------------------

describe('ConsentPolicyDisclosure — controlled prop surface', () => {
  it('reflects the checked prop rather than owning its own state', async () => {
    mockGetConsentPolicy.mockResolvedValue(FOUR_SECTION_POLICY);
    const { rerender } = render(<ConsentPolicyDisclosure checked={false} onChange={jest.fn()} />);
    await screen.findByText('What we collect');

    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);

    rerender(<ConsentPolicyDisclosure checked={true} onChange={jest.fn()} />);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  });

  it('renders the error prop as an alert-role message associated with the checkbox', async () => {
    mockGetConsentPolicy.mockResolvedValue(FOUR_SECTION_POLICY);
    render(
      <ConsentPolicyDisclosure
        checked={false}
        onChange={jest.fn()}
        error="You must accept the policy before continuing."
      />,
    );
    await screen.findByText('What we collect');

    const checkbox = screen.getByRole('checkbox');
    const describedBy = checkbox.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    const errorMessage = screen.getByText('You must accept the policy before continuing.');
    expect(errorMessage).toHaveAttribute('role', 'alert');
    // The checkbox's aria-describedby must include the error message's own id.
    expect(describedBy!.split(' ')).toContain(errorMessage.id);
  });

  it('renders no error message when the error prop is absent', async () => {
    mockGetConsentPolicy.mockResolvedValue(FOUR_SECTION_POLICY);
    render(<ConsentPolicyDisclosure checked={false} onChange={jest.fn()} />);
    await screen.findByText('What we collect');

    expect(
      screen.queryByText('You must accept the policy before continuing.'),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Accessibility — jsdom-provable subset only (KZ-002 / DC-16)
// ---------------------------------------------------------------------------

describe('ConsentPolicyDisclosure — accessibility (jsdom-provable subset)', () => {
  it('has no jest-axe violations once the policy has loaded', async () => {
    mockGetConsentPolicy.mockResolvedValue(FOUR_SECTION_POLICY);
    const { container } = render(<ConsentPolicyDisclosure checked={false} onChange={jest.fn()} />);
    await screen.findByText('What we collect');

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  // NOT covered here (DC-16, same caveat as RegistrationForm.test.tsx):
  // color contrast, focus order, and focus visibility — jsdom's
  // `color-contrast` rule returns `incomplete`, which `toHaveNoViolations`
  // does not fail on. Those, plus the real-browser scroll-gate behaviour
  // above, route to the human check recorded in ConsentPolicyDisclosure.tsx.
});
