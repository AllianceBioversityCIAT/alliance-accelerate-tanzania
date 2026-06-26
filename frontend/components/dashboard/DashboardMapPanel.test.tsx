/**
 * Unit tests for DashboardMapPanel — T-13, FR-7, NFR-2, design.md §5.6.
 *
 * Filter: `DashboardMapPanel` (matched via filename).
 *
 * Strategy: mock @/components/map/ActorMap so Leaflet never loads in jsdom.
 * The stub records the props it received, allowing us to assert prop
 * forwarding without any Leaflet/DOM environment concerns.
 *
 * Covers:
 *   (a) The panel renders the ActorMap stub (composition check).
 *   (b) The `data` prop is forwarded to ActorMap unchanged.
 *   (c) The panel heading "Actor Locations" renders.
 *   (d) The `loading` prop is forwarded to ActorMap.
 *   (e) The `error` prop is forwarded to ActorMap.
 *   (f) The `selectedActorId` prop is forwarded to ActorMap.
 *   (g) The `onSelectActor` callback is forwarded to ActorMap.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import DashboardMapPanel from './DashboardMapPanel';
import type { PublicActorList } from '@/lib/api/actors';

// ── Mock ActorMap ─────────────────────────────────────────────────────────────
//
// jest.mock replaces the module before any import resolution, so Leaflet and
// window-dependent code inside LeafletMap never executes in jsdom.
//
// The stub renders a single <div data-testid="actor-map-stub"> so tests can
// assert it was mounted. It also stores its received props on a module-scoped
// variable so prop-forwarding assertions remain straightforward.

// Mutable container for props captured by the stub.
let capturedProps: Record<string, unknown> = {};

jest.mock('@/components/map/ActorMap', () => {
  const Stub = (props: Record<string, unknown>) => {
    // Capture every render's props (last-render wins for assertions after render).
    capturedProps = { ...props };
    return <div data-testid="actor-map-stub" />;
  };
  Stub.displayName = 'ActorMapStub';
  return Stub;
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_ACTOR_LIST: PublicActorList = {
  data: [
    {
      id: 'actor-1',
      traderName: 'Dar es Salaam Seed Co.',
      traderType: 'seed_company',
      crops: ['sorghum'],
      region: 'Dar es Salaam',
      district: 'Kinondoni',
      capacityTons: 500,
      gps: { lat: -6.7924, long: 39.2083 },
    },
  ],
  total: 1,
  page: 1,
  pageSize: 25,
};

const noop = () => {};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DashboardMapPanel', () => {
  beforeEach(() => {
    capturedProps = {};
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // ── (a) ActorMap stub renders ────────────────────────────────────────────

  it('renders the ActorMap stub inside the panel', () => {
    render(
      <DashboardMapPanel
        data={MOCK_ACTOR_LIST}
        loading={false}
        error={false}
        selectedActorId={null}
        onSelectActor={noop}
      />,
    );

    expect(screen.getByTestId('actor-map-stub')).toBeInTheDocument();
  });

  // ── (b) data prop forwarded ──────────────────────────────────────────────

  it('forwards the data prop to ActorMap', () => {
    render(
      <DashboardMapPanel
        data={MOCK_ACTOR_LIST}
        loading={false}
        error={false}
        selectedActorId={null}
        onSelectActor={noop}
      />,
    );

    expect(capturedProps.data).toBe(MOCK_ACTOR_LIST);
  });

  it('forwards data=null to ActorMap when API is unavailable', () => {
    render(
      <DashboardMapPanel
        data={null}
        loading={false}
        error={true}
        selectedActorId={null}
        onSelectActor={noop}
      />,
    );

    expect(capturedProps.data).toBeNull();
  });

  // ── (c) Panel heading renders ────────────────────────────────────────────

  it('renders the "Actor Locations" panel heading', () => {
    render(
      <DashboardMapPanel
        data={null}
        loading={true}
        error={false}
        selectedActorId={null}
        onSelectActor={noop}
      />,
    );

    expect(screen.getByText('Actor Locations')).toBeInTheDocument();
  });

  // ── (d) loading prop forwarded ───────────────────────────────────────────

  it('forwards loading=true to ActorMap', () => {
    render(
      <DashboardMapPanel
        data={null}
        loading={true}
        error={false}
        selectedActorId={null}
        onSelectActor={noop}
      />,
    );

    expect(capturedProps.loading).toBe(true);
  });

  it('forwards loading=false to ActorMap', () => {
    render(
      <DashboardMapPanel
        data={MOCK_ACTOR_LIST}
        loading={false}
        error={false}
        selectedActorId={null}
        onSelectActor={noop}
      />,
    );

    expect(capturedProps.loading).toBe(false);
  });

  // ── (e) error prop forwarded ─────────────────────────────────────────────

  it('forwards error=true to ActorMap', () => {
    render(
      <DashboardMapPanel
        data={null}
        loading={false}
        error={true}
        selectedActorId={null}
        onSelectActor={noop}
      />,
    );

    expect(capturedProps.error).toBe(true);
  });

  // ── (f) selectedActorId forwarded ───────────────────────────────────────

  it('forwards selectedActorId to ActorMap', () => {
    render(
      <DashboardMapPanel
        data={MOCK_ACTOR_LIST}
        loading={false}
        error={false}
        selectedActorId="actor-1"
        onSelectActor={noop}
      />,
    );

    expect(capturedProps.selectedActorId).toBe('actor-1');
  });

  it('forwards selectedActorId=null to ActorMap', () => {
    render(
      <DashboardMapPanel
        data={MOCK_ACTOR_LIST}
        loading={false}
        error={false}
        selectedActorId={null}
        onSelectActor={noop}
      />,
    );

    expect(capturedProps.selectedActorId).toBeNull();
  });

  // ── (g) onSelectActor callback forwarded ────────────────────────────────

  it('forwards the onSelectActor callback to ActorMap', () => {
    const onSelectActor = jest.fn();

    render(
      <DashboardMapPanel
        data={MOCK_ACTOR_LIST}
        loading={false}
        error={false}
        selectedActorId={null}
        onSelectActor={onSelectActor}
      />,
    );

    expect(capturedProps.onSelectActor).toBe(onSelectActor);
  });

  // ── Panel accessibility landmark ─────────────────────────────────────────

  it('renders a <section> with aria-label "Actor locations map"', () => {
    render(
      <DashboardMapPanel
        data={null}
        loading={false}
        error={false}
        selectedActorId={null}
        onSelectActor={noop}
      />,
    );

    const region = screen.getByRole('region', { name: /actor locations map/i });
    expect(region).toBeInTheDocument();
  });
});
