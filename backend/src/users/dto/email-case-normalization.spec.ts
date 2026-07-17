// @sdd-spec bugfix/email-case-normalization
/**
 * The Cognito pool is case-SENSITIVE, so admin-entered emails must be normalized
 * to lowercase before they become the sign-in identity. These tests lock the
 * `@Transform` on the write DTOs (applied by the global ValidationPipe's
 * `transform: true`) so a mixed-case / padded email is stored lowercase.
 */
import { plainToInstance } from 'class-transformer';

import { CreateUserDto } from './create-user.dto';
import { UpdateUserDto } from './update-user.dto';

describe('email case normalization (write DTOs)', () => {
  it('lowercases + trims the email on CreateUserDto', () => {
    const dto = plainToInstance(CreateUserDto, {
      email: '  Daniela.Gomez@CGIAR.org ',
      role: 'admin',
    });
    expect(dto.email).toBe('daniela.gomez@cgiar.org');
    expect(dto.role).toBe('admin');
  });

  it('lowercases + trims the email on UpdateUserDto', () => {
    const dto = plainToInstance(UpdateUserDto, { email: 'J.Cadavid@Cgiar.Org' });
    expect(dto.email).toBe('j.cadavid@cgiar.org');
  });

  it('leaves a non-string email untouched so the validator can reject it', () => {
    const dto = plainToInstance(CreateUserDto, { email: 123 as unknown as string });
    expect(dto.email).toBe(123);
  });
});
