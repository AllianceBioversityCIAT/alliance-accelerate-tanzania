/**
 * Unit tests for DownloadViewButton — T-12, FR-9, NFR-1, design.md §5.7/§6.
 * Spec: dashboard/discovery-dashboard.
 *
 * Covers:
 *   (a) Clicking the button triggers a Blob + object URL download cycle.
 *   (b) The button carries an accessible label ("Download this view").
 *   (c) URL.createObjectURL is called with a Blob (type: text/csv).
 *   (d) URL.revokeObjectURL is called after the click (no memory leak).
 *   (e) The generated filename includes the filenameBase and a date suffix.
 *   (f) A custom filenameBase prop is reflected in the download attribute.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DownloadViewButton from './DownloadViewButton';
import type { PublicActor } from '@/lib/api/actors';
import type { DashboardKpis } from '@/lib/dashboard/aggregate';

// ── Mock URL API ──────────────────────────────────────────────────────────────
// jsdom does not implement URL.createObjectURL / revokeObjectURL.

const MOCK_OBJECT_URL = 'blob:http://localhost/mock-object-url';

const createObjectURLMock = jest.fn(() => MOCK_OBJECT_URL);
const revokeObjectURLMock = jest.fn();

// Store originals to restore after each test (defensive, in case jsdom adds them).
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

beforeAll(() => {
  URL.createObjectURL = createObjectURLMock;
  URL.revokeObjectURL = revokeObjectURLMock;
});

afterAll(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

afterEach(() => {
  createObjectURLMock.mockClear();
  revokeObjectURLMock.mockClear();
});

// ── Mock anchor click ─────────────────────────────────────────────────────────
// jsdom's anchor.click() triggers navigation events; we intercept it to avoid
// side-effects and to assert that click was invoked on the anchor.

let anchorClickMock: jest.Mock;
const originalCreateElement = document.createElement.bind(document);

beforeEach(() => {
  anchorClickMock = jest.fn();

  // Intercept createElement('a') calls only — all other tags pass through.
  jest
    .spyOn(document, 'createElement')
    .mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        // Replace click on the anchor instance so the file download doesn't
        // trigger real navigation in jsdom.
        el.click = anchorClickMock;
      }
      return el;
    });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeActor(overrides: Partial<PublicActor> = {}): PublicActor {
  return {
    id: 'actor-1',
    traderName: 'Kilimo Seeds Ltd',
    region: 'Dodoma',
    district: 'Kondoa',
    traderType: 'seed_company',
    capacityTons: 200,
    crops: ['sorghum', 'common_bean'],
    gps: null,
    ...overrides,
  };
}

const ACTORS: PublicActor[] = [makeActor()];

const KPIS: DashboardKpis = {
  matchingCount: 1,
  totalCapacityTons: 200,
  medianCapacityTons: 200,
  capacityReportingCount: 1,
  regionsCovered: 1,
  actorTypes: 1,
};

// ── (a) Blob creation on click ────────────────────────────────────────────────

describe('DownloadViewButton — Blob + object URL download cycle', () => {
  it('calls URL.createObjectURL with a Blob when the button is clicked', () => {
    render(<DownloadViewButton actors={ACTORS} kpis={KPIS} />);

    const button = screen.getByRole('button', { name: /download this view/i });
    fireEvent.click(button);

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    // The argument must be a Blob — cast calls to unknown[][] to escape tuple inference.
    const calls = createObjectURLMock.mock.calls as unknown[][];
    const arg = calls[0]?.[0];
    expect(arg).toBeInstanceOf(Blob);
  });

  it('creates a Blob with type text/csv', () => {
    render(<DownloadViewButton actors={ACTORS} kpis={KPIS} />);
    fireEvent.click(screen.getByRole('button', { name: /download this view/i }));

    const calls = createObjectURLMock.mock.calls as unknown[][];
    const blob = calls[0]?.[0] as Blob;
    expect(blob).toBeDefined();
    expect(blob.type).toBe('text/csv;charset=utf-8');
  });

  it('triggers anchor.click() to initiate the download', () => {
    render(<DownloadViewButton actors={ACTORS} kpis={KPIS} />);
    fireEvent.click(screen.getByRole('button', { name: /download this view/i }));

    expect(anchorClickMock).toHaveBeenCalledTimes(1);
  });
});

// ── (b) Accessible label ──────────────────────────────────────────────────────

describe('DownloadViewButton — accessibility', () => {
  it('renders a button element (not a link)', () => {
    render(<DownloadViewButton actors={ACTORS} kpis={KPIS} />);
    expect(screen.getByRole('button', { name: /download this view/i })).toBeInTheDocument();
  });

  it('has an accessible name of "Download this view"', () => {
    render(<DownloadViewButton actors={ACTORS} kpis={KPIS} />);
    // getByRole throws if not found — this assertion is implicit.
    const button = screen.getByRole('button', { name: 'Download this view' });
    expect(button).toBeInTheDocument();
  });

  it('has type="button" so it cannot accidentally submit a form', () => {
    render(<DownloadViewButton actors={ACTORS} kpis={KPIS} />);
    const button = screen.getByRole('button', { name: /download this view/i });
    expect(button).toHaveAttribute('type', 'button');
  });

  it('does not render a link (<a>) for the button itself', () => {
    render(<DownloadViewButton actors={ACTORS} kpis={KPIS} />);
    // There should be NO link role element for the main interactive control.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

// ── (c) URL.revokeObjectURL called after click (no memory leak) ───────────────

describe('DownloadViewButton — object URL cleanup', () => {
  it('calls URL.revokeObjectURL after triggering the download', () => {
    render(<DownloadViewButton actors={ACTORS} kpis={KPIS} />);
    fireEvent.click(screen.getByRole('button', { name: /download this view/i }));

    expect(revokeObjectURLMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith(MOCK_OBJECT_URL);
  });

  it('sets href on the anchor to the object URL before clicking', () => {
    // We need to inspect the anchor element that was created.
    // Capture the anchor via a more targeted spy.
    let capturedAnchor: HTMLAnchorElement | null = null;
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        capturedAnchor = el as HTMLAnchorElement;
        el.click = anchorClickMock;
      }
      return el;
    });

    render(<DownloadViewButton actors={ACTORS} kpis={KPIS} />);
    fireEvent.click(screen.getByRole('button', { name: /download this view/i }));

    expect(capturedAnchor).not.toBeNull();
    // href in jsdom will be fully resolved, so we check it contains the mock blob URL.
    expect((capturedAnchor as unknown as HTMLAnchorElement).href).toContain('mock-object-url');
  });
});

// ── (d) Filename generation ───────────────────────────────────────────────────

describe('DownloadViewButton — filename', () => {
  it('sets the download attribute to a string ending with .csv', () => {
    let capturedAnchor: HTMLAnchorElement | null = null;
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        capturedAnchor = el as HTMLAnchorElement;
        el.click = anchorClickMock;
      }
      return el;
    });

    render(<DownloadViewButton actors={ACTORS} kpis={KPIS} />);
    fireEvent.click(screen.getByRole('button', { name: /download this view/i }));

    const download = (capturedAnchor as HTMLAnchorElement | null)?.getAttribute('download') ?? '';
    expect(download).toMatch(/\.csv$/);
  });

  it('uses the default filenameBase "accelerate-tz-actors" when not provided', () => {
    let capturedAnchor: HTMLAnchorElement | null = null;
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        capturedAnchor = el as HTMLAnchorElement;
        el.click = anchorClickMock;
      }
      return el;
    });

    render(<DownloadViewButton actors={ACTORS} kpis={KPIS} />);
    fireEvent.click(screen.getByRole('button', { name: /download this view/i }));

    const download = (capturedAnchor as HTMLAnchorElement | null)?.getAttribute('download') ?? '';
    expect(download).toMatch(/^accelerate-tz-actors-/);
  });

  it('uses the provided filenameBase in the download attribute', () => {
    let capturedAnchor: HTMLAnchorElement | null = null;
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        capturedAnchor = el as HTMLAnchorElement;
        el.click = anchorClickMock;
      }
      return el;
    });

    render(<DownloadViewButton actors={ACTORS} kpis={KPIS} filenameBase="my-export" />);
    fireEvent.click(screen.getByRole('button', { name: /download this view/i }));

    const download = (capturedAnchor as HTMLAnchorElement | null)?.getAttribute('download') ?? '';
    expect(download).toMatch(/^my-export-/);
    expect(download).toMatch(/\.csv$/);
  });

  it('includes an ISO date suffix (YYYY-MM-DD) in the filename', () => {
    let capturedAnchor: HTMLAnchorElement | null = null;
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        capturedAnchor = el as HTMLAnchorElement;
        el.click = anchorClickMock;
      }
      return el;
    });

    render(<DownloadViewButton actors={ACTORS} kpis={KPIS} />);
    fireEvent.click(screen.getByRole('button', { name: /download this view/i }));

    const download = (capturedAnchor as HTMLAnchorElement | null)?.getAttribute('download') ?? '';
    // Must contain a date segment in YYYY-MM-DD format.
    expect(download).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

// ── (e) Does not crash with empty actors ──────────────────────────────────────

describe('DownloadViewButton — edge cases', () => {
  it('does not throw when actors is empty', () => {
    const emptyKpis: DashboardKpis = {
      matchingCount: 0,
      totalCapacityTons: 0,
      medianCapacityTons: 0,
      capacityReportingCount: 0,
      regionsCovered: 0,
      actorTypes: 0,
    };

    expect(() => {
      render(<DownloadViewButton actors={[]} kpis={emptyKpis} />);
      fireEvent.click(screen.getByRole('button', { name: /download this view/i }));
    }).not.toThrow();
  });

  it('still calls createObjectURL with an empty-actor Blob', () => {
    const emptyKpis: DashboardKpis = {
      matchingCount: 0,
      totalCapacityTons: 0,
      medianCapacityTons: 0,
      capacityReportingCount: 0,
      regionsCovered: 0,
      actorTypes: 0,
    };

    render(<DownloadViewButton actors={[]} kpis={emptyKpis} />);
    fireEvent.click(screen.getByRole('button', { name: /download this view/i }));

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    const calls = createObjectURLMock.mock.calls as unknown[][];
    expect(calls[0]?.[0]).toBeInstanceOf(Blob);
  });
});
