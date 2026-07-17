// @sdd-spec admin/user-management (T-2)
/**
 * T-2 — Cognito SDK exception → Nest `HttpException` mapper (design §3, NFR-4).
 *
 * The `UsersService` is the only Cognito caller; every admin call funnels its
 * failures through {@link mapCognitoError} so SDK exceptions become stable HTTP
 * status codes. Unknown errors collapse to a generic 500 with a SAFE message —
 * raw Cognito internals / messages are never propagated to the client, so no
 * secret or implementation detail leaks in an error body.
 *
 * Design refs: design.md §3 (error mapping table), §6 (no secret leakage).
 * Requirement: requirements.md NFR-4.
 */

import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

/** The generic 500 message — deliberately free of any Cognito internals. */
const GENERIC_INTERNAL_MESSAGE = 'An unexpected error occurred.';

/**
 * Map a thrown Cognito SDK error to the corresponding `HttpException` and throw
 * it. Always throws (return type `never`), so callers can `catch (err) { ... }`
 * and delegate without a fallthrough path.
 *
 * - `UsernameExistsException` → 409 Conflict
 * - `UserNotFoundException` → 404 Not Found
 * - `InvalidParameterException` / `InvalidPasswordException` → 400 Bad Request
 * - `TooManyRequestsException` → 429 Too Many Requests
 * - `UnsupportedUserStateException` → 409 Conflict (user-state)
 * - `NotAuthorizedException` → 409 Conflict ONLY when the message signals a
 *   user-state cause; credential/permission (IAM) causes fall through to 500 so
 *   a real server misconfiguration is never masked as a client conflict.
 * - anything else → 500 Internal Server Error (generic, no leak)
 */
export function mapCognitoError(err: unknown): never {
  const name = errorName(err);

  switch (name) {
    case 'UsernameExistsException':
      throw new ConflictException('A user with this email already exists.');
    case 'UserNotFoundException':
      throw new NotFoundException('User not found.');
    case 'InvalidParameterException':
    case 'InvalidPasswordException':
      throw new BadRequestException('Invalid request parameters.');
    case 'TooManyRequestsException':
      throw new HttpException(
        'Too many requests. Please retry later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    case 'UnsupportedUserStateException':
      throw new ConflictException(
        'This user is not in a state where that action is allowed. Please refresh and try again.',
      );
    case 'NotAuthorizedException':
      // `NotAuthorizedException` is ambiguous: it covers both benign user-state
      // conflicts AND server-side IAM/credential failures. Only treat the
      // user-state signature as a 409; anything else falls through to the
      // generic 500 so a real credential/permission problem isn't masked.
      if (isUserStateNotAuthorized(err)) {
        throw new ConflictException(
          'This user is not in a state where that action is allowed. Please refresh and try again.',
        );
      }
      break;
    default:
      break;
  }

  // Do NOT surface the raw Cognito error — generic message only (§6).
  throw new InternalServerErrorException(GENERIC_INTERNAL_MESSAGE);
}

/**
 * True only for the user-STATE flavor of `NotAuthorizedException` (e.g. "User
 * password cannot be reset in the current state"). Conservative by design:
 * credential/permission phrasing ("User is not authorized to perform: ...") and
 * any unknown message return false, so those collapse to a generic 500 instead
 * of being mis-reported as a client-side conflict.
 */
function isUserStateNotAuthorized(err: unknown): boolean {
  const message = errorMessage(err);
  return message !== undefined && /state/i.test(message);
}

/** Extract the SDK exception `name` discriminator, if present. */
function errorName(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'name' in err) {
    const { name } = err as { name?: unknown };
    return typeof name === 'string' ? name : undefined;
  }
  return undefined;
}

/** Safely read the SDK error `message` field, if present. */
function errorMessage(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const { message } = err as { message?: unknown };
    return typeof message === 'string' ? message : undefined;
  }
  return undefined;
}
