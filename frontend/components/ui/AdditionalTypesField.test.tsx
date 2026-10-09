import { render, screen, fireEvent } from '@testing-library/react';
import AdditionalTypesField from './AdditionalTypesField';
import { RoleBadges } from '@/components/map/RoleBadge';
import { roleSummary } from '@/lib/content/roles';

describe('AdditionalTypesField', () => {
  it('offers every type except the main one', () => {
    render(<AdditionalTypesField baseId="t" mainType="cooperative" selected={[]} onToggle={jest.fn()} />);
    expect(screen.queryByLabelText('Cooperative')).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(9);
    expect(screen.getByRole('group', { name: 'Other actor types' })).toBeInTheDocument();
  });

  it('reflects selection and reports toggles', () => {
    const onToggle = jest.fn();
    render(<AdditionalTypesField baseId="t" mainType="" selected={['ngo']} onToggle={onToggle} />);
    expect(screen.getByLabelText('NGO')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Offtaker'));
    expect(onToggle).toHaveBeenCalledWith('offtaker');
  });

  it('associates a server error with the group', () => {
    render(
      <AdditionalTypesField baseId="t" mainType="ngo" selected={[]} onToggle={jest.fn()} error="Bad set" />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Bad set');
    expect(screen.getByRole('group').getAttribute('aria-describedby')).toContain('t-additional-types-error');
  });
});

describe('RoleBadges', () => {
  it('compact: main chip first, other types as quieter chips, announced as main/other', () => {
    const { container } = render(
      <RoleBadges traderType="cooperative" additionalTraderTypes={['seed_company', 'offtaker']} />,
    );
    const text = container.textContent ?? '';
    expect(text.indexOf('Main type:')).toBeLessThan(text.indexOf('Cooperative'));
    expect(text.indexOf('Cooperative')).toBeLessThan(text.indexOf('Other types:'));
    expect(text.indexOf('Other types:')).toBeLessThan(text.indexOf('Seed Company'));
    expect(screen.getByText('Main type:')).toHaveClass('sr-only');
    expect(screen.getByText('Cooperative')).toHaveClass('border-border');
    expect(screen.getByText('Seed Company')).toHaveClass('text-muted');
    expect(screen.getByText('Offtaker')).not.toHaveClass('border-border');
  });

  it('compact: no "Other types" when there are none', () => {
    render(<RoleBadges traderType="cooperative" additionalTraderTypes={[]} />);
    expect(screen.queryByText('Other types:')).not.toBeInTheDocument();
  });

  it('labelled: visible "Main type" and "Other types" rows with full chips', () => {
    render(
      <RoleBadges traderType="cooperative" additionalTraderTypes={['ngo']} layout="labelled" />,
    );
    expect(screen.getByText('Main type').tagName).toBe('DT');
    expect(screen.getByText('Other types').tagName).toBe('DT');
    expect(screen.getByText('NGO')).toHaveClass('border-border');
  });

  it('labelled: omits the "Other types" row when there are none', () => {
    render(<RoleBadges traderType="cooperative" layout="labelled" />);
    expect(screen.getByText('Main type')).toBeInTheDocument();
    expect(screen.queryByText('Other types')).not.toBeInTheDocument();
  });
});

describe('roleSummary', () => {
  it('is the main label alone when there are no additional types', () => {
    expect(roleSummary('ngo', [])).toEqual({ text: 'NGO', title: 'NGO' });
  });

  it('appends +N and lists all labels in the title, main first', () => {
    expect(roleSummary('ngo', ['seed_company', 'offtaker'])).toEqual({
      text: 'NGO +2',
      title: 'NGO, Seed Company, Offtaker',
    });
  });
});
