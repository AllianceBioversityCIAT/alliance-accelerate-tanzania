// @sdd-spec admin/user-management (T-2)
/**
 * T-2 — unit tests for {@link mapCognitoError} (design §4.2, FR-5, NFR-4).
 *
 * The mapper turns Cognito SDK exceptions into stable HTTP status codes. The
 * focus here is the newly-added user-STATE mapping and the narrow scoping of the
 * ambiguous `NotAuthorizedException`: a user-state cause is a 409, but a
 * credential/permission (IAM) cause must fall through to a generic 500 so a real
 * server misconfiguration is never masked as a client conflict — and the raw
 * Cognito message must never leak (NFR-4).
 */

import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { mapCognitoError } from './cognito-error.mapper';

/** A Cognito error mirrors the SDK shape — `name` discriminates, `message` carries detail. */
function cognitoError(name: string, message?: string): Error {
  const err = new Error(message ?? name);
  err.name = name;
  return err;
}

describe('mapCognitoError', () => {
  it('maps UnsupportedUserStateException → ConflictException (409)', () => {
    expect(() =>
      mapCognitoError(cognitoError('UnsupportedUserStateException')),
    ).toThrow(ConflictException);
  });

  it('maps NotAuthorizedException with a user-state message → ConflictException (409)', () => {
    const err = cognitoError(
      'NotAuthorizedException',
      'User password cannot be reset in the current state.',
    );

    expect(() => mapCognitoError(err)).toThrow(ConflictException);
  });

  it('maps NotAuthorizedException with a credential/permission message → generic 500 (no leak)', () => {
    const rawMessage =
      'User is not authorized to perform: cognito-idp:AdminResetUserPassword';
    const err = cognitoError('NotAuthorizedException', rawMessage);

    try {
      mapCognitoError(err);
      fail('expected mapCognitoError to throw');
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(InternalServerErrorException);
      // NFR-4: the raw Cognito message must NOT leak in the response body.
      const response = (thrown as InternalServerErrorException).getResponse();
      const body = typeof response === 'string' ? response : JSON.stringify(response);
      expect(body).not.toContain(rawMessage);
      expect(body).not.toContain('AdminResetUserPassword');
    }
  });

  // ── Spot-check that existing cases are unchanged ────────────────────────
  it('still maps UsernameExistsException → ConflictException (409)', () => {
    expect(() =>
      mapCognitoError(cognitoError('UsernameExistsException')),
    ).toThrow(ConflictException);
  });

  it('still maps UserNotFoundException → NotFoundException (404)', () => {
    expect(() =>
      mapCognitoError(cognitoError('UserNotFoundException')),
    ).toThrow(NotFoundException);
  });

  it('maps an unknown error → generic 500', () => {
    expect(() => mapCognitoError(cognitoError('SomethingElseException'))).toThrow(
      InternalServerErrorException,
    );
  });
});
