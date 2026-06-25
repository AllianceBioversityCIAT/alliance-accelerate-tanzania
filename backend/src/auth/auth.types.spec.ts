import { roleFromGroups } from './auth.types';

/**
 * roleFromGroups — role is derived only from the verified `cognito:groups`
 * (NFR-1): `admin` wins over `staff`, anything else (or none) is `Public`.
 */
describe('roleFromGroups', () => {
  it('maps a group containing admin → Admin (even alongside staff)', () => {
    expect(roleFromGroups(['admin'])).toBe('Admin');
    expect(roleFromGroups(['staff', 'admin'])).toBe('Admin');
  });

  it('maps staff (no admin) → Staff', () => {
    expect(roleFromGroups(['staff'])).toBe('Staff');
  });

  it('maps no/empty/unknown groups → Public', () => {
    expect(roleFromGroups([])).toBe('Public');
    expect(roleFromGroups(undefined)).toBe('Public');
    expect(roleFromGroups(['other'])).toBe('Public');
  });
});
