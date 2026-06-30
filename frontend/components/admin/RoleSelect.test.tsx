// @sdd-spec admin/user-management (T-10)
/**
 * Unit tests for RoleSelect component.
 *
 * Verifies:
 *   - Only admin / staff / none options are offered (constraint check).
 *   - No options beyond these three exist.
 *   - Renders a labeled <select> with correct accessible structure.
 *   - onChange fires with the correct RoleValue when user selects each option.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { RoleSelect, type RoleValue } from './RoleSelect';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSelect(
  value: RoleValue = 'none',
  onChange: (v: RoleValue) => void = jest.fn(),
) {
  return render(
    <RoleSelect id="test-role-select" value={value} onChange={onChange} />,
  );
}

// ---------------------------------------------------------------------------
// Tests — Option constraint
// ---------------------------------------------------------------------------

describe('RoleSelect — option constraint', () => {
  it('renders exactly 3 options (admin, staff, none)', () => {
    renderSelect();

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
  });

  it('includes an "admin" option', () => {
    renderSelect();

    const adminOption = screen.getByRole('option', { name: /admin/i });
    expect(adminOption).toBeInTheDocument();
    expect((adminOption as HTMLOptionElement).value).toBe('admin');
  });

  it('includes a "staff" option', () => {
    renderSelect();

    const staffOption = screen.getByRole('option', { name: /staff/i });
    expect(staffOption).toBeInTheDocument();
    expect((staffOption as HTMLOptionElement).value).toBe('staff');
  });

  it('includes a "none" / no-role option', () => {
    renderSelect();

    const noneOption = screen.getByRole('option', { name: /no role/i });
    expect(noneOption).toBeInTheDocument();
    expect((noneOption as HTMLOptionElement).value).toBe('none');
  });

  it('does NOT offer any option beyond admin, staff, and none', () => {
    renderSelect();

    const options = screen.getAllByRole('option');
    const values  = options.map((o) => (o as HTMLOptionElement).value);

    expect(values).toEqual(expect.arrayContaining(['admin', 'staff', 'none']));
    // No extra values
    expect(values.filter((v) => !['admin', 'staff', 'none'].includes(v))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests — Accessible structure
// ---------------------------------------------------------------------------

describe('RoleSelect — accessible structure', () => {
  it('renders a visible "Role" label', () => {
    renderSelect();

    expect(screen.getByText('Role')).toBeInTheDocument();
  });

  it('renders a <select> element', () => {
    renderSelect();

    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('reflects the current value as the selected option', () => {
    renderSelect('staff');

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('staff');
  });
});

// ---------------------------------------------------------------------------
// Tests — onChange callback
// ---------------------------------------------------------------------------

describe('RoleSelect — onChange', () => {
  it('calls onChange with "admin" when the admin option is selected', () => {
    const onChange = jest.fn();
    renderSelect('none', onChange);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'admin' } });

    expect(onChange).toHaveBeenCalledWith('admin');
  });

  it('calls onChange with "staff" when the staff option is selected', () => {
    const onChange = jest.fn();
    renderSelect('admin', onChange);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'staff' } });

    expect(onChange).toHaveBeenCalledWith('staff');
  });

  it('calls onChange with "none" when the no-role option is selected', () => {
    const onChange = jest.fn();
    renderSelect('admin', onChange);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'none' } });

    expect(onChange).toHaveBeenCalledWith('none');
  });
});

// ---------------------------------------------------------------------------
// Tests — disabled state
// ---------------------------------------------------------------------------

describe('RoleSelect — disabled', () => {
  it('disables the select when disabled prop is true', () => {
    render(
      <RoleSelect id="test" value="none" onChange={jest.fn()} disabled />,
    );

    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
