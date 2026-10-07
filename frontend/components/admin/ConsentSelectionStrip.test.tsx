// @sdd-spec actors/consent-intake/consent-request-email (T-9)
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { ConsentSelectionStrip } from './ConsentSelectionStrip';

const handlers = { onTogglePage: jest.fn(), onSelectAllMatching: jest.fn(), onClear: jest.fn() };
const base = { pageCount: 25, total: 140, pageSelected: false, allMatching: false, ...handlers };

beforeEach(() => jest.clearAllMocks());

describe('ConsentSelectionStrip', () => {
  it('always renders the Select page control (the card-view route to select-all)', () => {
    render(<ConsentSelectionStrip {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select page' }));
    expect(handlers.onTogglePage).toHaveBeenCalledTimes(1);
  });

  it('reads Deselect page once the page is selected', () => {
    render(<ConsentSelectionStrip {...base} pageSelected />);
    expect(screen.getByRole('button', { name: 'Deselect page' })).toBeInTheDocument();
  });

  it('offers "Select all N matching" when the page is selected and more actors match', () => {
    render(<ConsentSelectionStrip {...base} pageSelected />);
    fireEvent.click(screen.getByRole('button', { name: 'Select all 140 matching' }));
    expect(handlers.onSelectAllMatching).toHaveBeenCalledTimes(1);
  });

  it('does not offer it when the page is not fully selected or everything is on the page', () => {
    const { rerender } = render(<ConsentSelectionStrip {...base} />);
    expect(screen.queryByRole('button', { name: /select all/i })).not.toBeInTheDocument();
    rerender(<ConsentSelectionStrip {...base} pageSelected total={25} />);
    expect(screen.queryByRole('button', { name: /select all/i })).not.toBeInTheDocument();
  });

  it('in all-matching mode states the count and offers Clear selection', () => {
    render(<ConsentSelectionStrip {...base} pageSelected allMatching />);
    expect(screen.getByText('All 140 matching actors are selected.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(handlers.onClear).toHaveBeenCalledTimes(1);
  });
});
