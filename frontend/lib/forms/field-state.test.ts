import { toggleListValue, withoutFieldError } from './field-state';

describe('toggleListValue', () => {
  it('adds a missing value and removes a present one', () => {
    expect(toggleListValue(['ngo'], 'offtaker')).toEqual(['ngo', 'offtaker']);
    expect(toggleListValue(['ngo', 'offtaker'], 'ngo')).toEqual(['offtaker']);
  });
});

describe('withoutFieldError', () => {
  it('drops the field and keeps the others', () => {
    expect(withoutFieldError({ a: 'x', b: 'y' }, 'a')).toEqual({ b: 'y' });
  });

  it('returns the same object when the field has no error', () => {
    const errors = { b: 'y' };
    expect(withoutFieldError(errors, 'a')).toBe(errors);
  });
});
