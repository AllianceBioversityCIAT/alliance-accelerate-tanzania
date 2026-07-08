// @sdd-spec admin/bulk-actor-operations (T-8)
/**
 * Unit tests for BulkActionBar.
 *
 * Covers:
 *   - renders nothing when no actors are selected
 *   - renders count and Unlock/Lock/Delete buttons when actors are selected
 *   - invokes the correct handler for each action button
 *   - disables all action buttons while loading
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { BulkActionBar } from './BulkActionBar';

const onUnlock = jest.fn();
const onLock = jest.fn();
const onDelete = jest.fn();

function renderBar(props: Partial<React.ComponentProps<typeof BulkActionBar>> = {}) {
  return render(
    <BulkActionBar
      selectedCount={0}
      onUnlock={onUnlock}
      onLock={onLock}
      onDelete={onDelete}
      {...props}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('BulkActionBar — visibility', () => {
  it('renders null when selectedCount is 0', () => {
    const { container } = renderBar();
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('toolbar', { name: /bulk actor actions/i })).not.toBeInTheDocument();
  });

  it('renders the selected count and action buttons when selectedCount is greater than 0', () => {
    renderBar({ selectedCount: 3 });

    expect(screen.getByRole('toolbar', { name: /bulk actor actions/i })).toBeInTheDocument();
    expect(screen.getByText(/3 actors selected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lock' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('uses singular wording when exactly one actor is selected', () => {
    renderBar({ selectedCount: 1 });
    expect(screen.getByText(/1 actor selected/i)).toBeInTheDocument();
  });
});

describe('BulkActionBar — interactions', () => {
  it('calls the correct handler for each action button', () => {
    renderBar({ selectedCount: 2 });

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(onUnlock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
    expect(onLock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('disables all action buttons while loading', () => {
    renderBar({ selectedCount: 2, loading: true });

    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lock' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});
