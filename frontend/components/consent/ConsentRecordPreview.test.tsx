import React from 'react';
import { render, screen } from '@testing-library/react';
import ConsentRecordPreview from './ConsentRecordPreview';
import { ACTOR_FULL } from '@/components/profile/__fixtures__/actor';

describe('ConsentRecordPreview', () => {
  it('shows the country by name next to the region', () => {
    render(<ConsentRecordPreview record={{ ...ACTOR_FULL, country: 'KE', region: 'Nakuru' }} />);
    expect(screen.getByText('Country').nextElementSibling).toHaveTextContent('Kenya');
    expect(screen.getByText('Region').nextElementSibling).toHaveTextContent('Nakuru');
  });
});
