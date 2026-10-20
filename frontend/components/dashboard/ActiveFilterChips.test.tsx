import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ActiveFilterChips from './ActiveFilterChips';

describe('ActiveFilterChips — country', () => {
  it('shows the country by name, not by code', () => {
    render(<ActiveFilterChips filters={{ country: 'KE' }} onChange={jest.fn()} />);
    expect(screen.getByText('Country: Kenya')).toBeInTheDocument();
  });

  it('removing the country chip also clears the region that depended on it', () => {
    const onChange = jest.fn();
    render(
      <ActiveFilterChips filters={{ country: 'KE', region: 'Nakuru' }} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter Country: Kenya' }));
    expect(onChange).toHaveBeenCalledWith({ country: undefined, region: undefined, page: 1 });
  });

  it('"Clear all" clears the country too', () => {
    const onChange = jest.fn();
    render(<ActiveFilterChips filters={{ country: 'KE' }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onChange.mock.calls[0][0]).toMatchObject({ country: undefined, region: undefined });
  });
});
